/* Tests HolafAmbient — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : validation du target (requis / sélecteur / type canvas), modes
 * inconnus (create & setConfig), boucle rAF (création → dessin → pause/resume →
 * destroy sans fuite), visibilitychange (pause auto), prefers-reduced-motion
 * (rendu statique, une frame), ResizeObserver (observe + disconnect à destroy).
 *
 * v0.2.0 : densité (elementCount), option `blur` (tampon hors-écran + ctx.filter),
 * fond transparent (aucune plaque opaque plein écran), horloge dt (framerate et
 * `speed` appliqué une seule fois), redraw immédiat au resize (même en pause).
 *
 * jsdom n'implémente PAS le canvas 2D ni rAF : on installe de faux contextes
 * 2D (mock) et de faux rAF/cancelAnimationFrame, comme le font les tests
 * existants pour le DOM (stubs via vi.fn()).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolafAmbient } from "../js/holaf-ambient.js";

// ── Harnais : canvas + contexte 2D mockés (jsdom n'a pas de canvas 2D) ──────
// Le contexte mocké expose TOUTE l'API utilisée par la brique (dégradés,
// motifs, sprites hors-écran) et enregistre les affectations de style pour
// pouvoir les inspecter dans les assertions (ctx.rec).
function makeCtx() {
    const rec = { fillStyle: [], strokeStyle: [], filter: [] };
    const ctx = {
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        lineWidth: 1,
        fillStyle: "",
        strokeStyle: "",
        // `filter` présent = navigateur moderne (cf. supportsFilter dans la brique).
        filter: "none",
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        ellipse: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        createPattern: vi.fn(() => ({ pattern: true })),
        createImageData: vi.fn((w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
        putImageData: vi.fn(),
        getImageData: vi.fn(),
    };
    for (const prop of ["fillStyle", "strokeStyle", "filter"]) {
        let v = ctx[prop];
        Object.defineProperty(ctx, prop, {
            configurable: true,
            get: () => v,
            set: (next) => {
                v = next;
                rec[prop].push(next);
            },
        });
    }
    ctx.rec = rec;
    return ctx;
}

function makeCanvas(width = 400, height = 300) {
    const ctx = makeCtx();
    const canvas = document.createElement("canvas");
    // jsdom renvoie clientWidth/Height = 0 → on les stub pour simuler un canvas posé.
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: width });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: height });
    canvas.id = "ambient-canvas-" + Math.random().toString(36).slice(2);
    canvas.getContext = vi.fn(() => ctx);
    document.body.appendChild(canvas);
    return { canvas, ctx };
}

// Positions X des particules dessinées pendant une frame (via drawImage).
// Les sprites sont passés à drawImage(sprite, x - R, y - R, 2R, 2R).
function particleXs(ctx) {
    return ctx.drawImage.mock.calls.map((c) => c[1]);
}

// ── Harness rAF / ResizeObserver / matchMedia ────────────────────────────────
let rafCb = null;
let rafCalls = 0;
let observers = [];

beforeEach(() => {
    rafCb = null;
    rafCalls = 0;
    observers = [];

    // rAF : on capture le callback (ne l'appelle pas automatiquement).
    globalThis.requestAnimationFrame = (cb) => {
        rafCalls++;
        rafCb = cb;
        return rafCalls;
    };
    globalThis.cancelAnimationFrame = () => { rafCb = null; };

    // Tout <canvas> créé par la brique (sprites, grain, tampon de flou) reçoit
    // un contexte mocké : sinon jsdom renvoie null et les garde-fous de la
    // brique prennent le relais (ce qui est testé séparément plus bas).
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag, ...rest) => {
        const el = realCreateElement(tag, ...rest);
        if (String(tag).toLowerCase() === "canvas") {
            const offCtx = makeCtx();
            el.getContext = vi.fn(() => offCtx);
            el.__offCtx = offCtx;
        }
        return el;
    });

    delete globalThis.matchMedia;
    delete globalThis.ResizeObserver;
});

afterEach(() => {
    globalThis.requestAnimationFrame = undefined;
    globalThis.cancelAnimationFrame = undefined;
    delete globalThis.matchMedia;
    delete globalThis.ResizeObserver;
    rafCb = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

// Lance une frame si le callback rAF a été capturé (retourne le nombre de frames jouées).
function tick(ts = 1000) {
    if (!rafCb) return 0;
    const cb = rafCb;
    rafCb = null;
    cb(ts);
    return 1;
}

// Installe un ResizeObserver factice (comptabilise observe/disconnect).
function installFakeResizeObserver() {
    const targets = new Set();
    const record = { targets, observer: null, disconnects: 0 };
    class FakeRO {
        constructor(cb) { this.cb = cb; record.observer = this; }
        observe(t) { targets.add(t); }
        disconnect() { record.disconnects++; targets.clear(); }
    }
    globalThis.ResizeObserver = FakeRO;
    return record;
}

describe("cible (target)", () => {
    it("target manquant → erreur claire", () => {
        expect(() => HolafAmbient.create()).toThrow(/target/);
        expect(() => HolafAmbient.create({})).toThrow(/target/);
    });

    it("target élément non-canvas → erreur", () => {
        const div = document.createElement("div");
        document.body.appendChild(div);
        expect(() => HolafAmbient.create({ target: div })).toThrow(/canvas/i);
    });

    it("target sélecteur introuvable → erreur", () => {
        expect(() => HolafAmbient.create({ target: "#nope" })).toThrow(/sélecteur|selector/i);
    });

    it("target sélecteur trouvé → instance créée (window.HolafAmbient exposé)", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: "#" + canvas.id });
        expect(inst).toBeTruthy();
        expect(typeof inst.destroy).toBe("function");
        expect(window.HolafAmbient).toBe(HolafAmbient);
        expect(HolafAmbient.version).toBe("0.2.0");
        expect(inst.VERSION).toBe("0.2.0");
        inst.destroy();
    });

    it("target canvas existant direct → instance créée", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(inst).toBeTruthy();
        inst.destroy();
    });
});

describe("modes", () => {
    it("mode inconnu au create → erreur listant les modes", () => {
        const { canvas } = makeCanvas();
        expect(() => HolafAmbient.create({ target: canvas, mode: "plasma" }))
            .toThrow(/waves.*particles.*aurora/);
    });

    it("mode inconnu au setConfig → erreur", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(() => inst.setConfig({ mode: "laser" })).toThrow(/waves.*particles.*aurora/);
        inst.destroy();
    });

    it("les 3 modes se créent sans erreur, tournent et dessinent une frame", () => {
        for (const mode of ["waves", "particles", "aurora"]) {
            const { canvas, ctx } = makeCanvas(300, 200);
            const inst = HolafAmbient.create({ target: canvas, mode });
            expect(() => { if (tick(1000)) ctx; }).not.toThrow();
            // En mode normal la 1ʳᵉ frame est jouée par la boucle rAF, pas à create().
            expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(0);
            inst.destroy();
        }
    });
});

describe("densité (curseur d'intensité 1..100)", () => {
    it("elementCount est exposé et donne un nombre d'éléments sensé par mode", () => {
        expect(typeof HolafAmbient.elementCount).toBe("function");
        // densité par défaut de Homy : 10
        expect(HolafAmbient.elementCount("waves", 10)).toBe(5);
        expect(HolafAmbient.elementCount("particles", 10)).toBe(60);
        expect(HolafAmbient.elementCount("aurora", 10)).toBe(6);
    });

    it("elementCount borne les extrêmes (jamais 0 élément, jamais l'infini)", () => {
        expect(HolafAmbient.elementCount("waves", 1)).toBeGreaterThanOrEqual(2);
        expect(HolafAmbient.elementCount("particles", 1)).toBeGreaterThanOrEqual(20);
        expect(HolafAmbient.elementCount("aurora", 1)).toBeGreaterThanOrEqual(3);
        expect(HolafAmbient.elementCount("waves", 10000)).toBeLessThanOrEqual(10);
        expect(HolafAmbient.elementCount("particles", 10000)).toBeLessThanOrEqual(220);
        expect(HolafAmbient.elementCount("aurora", 10000)).toBeLessThanOrEqual(10);
    });

    it("getConfig() renvoie la densité bornée 1..100", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas, density: 0 });
        expect(inst.getConfig().density).toBe(1);
        inst.setConfig({ density: 500 });
        expect(inst.getConfig().density).toBe(100);
        inst.destroy();
    });

    it("changer la densité en mode particles régénère les particules", () => {
        const { canvas, ctx } = makeCanvas(600, 400);
        const inst = HolafAmbient.create({ target: canvas, mode: "particles", density: 1 });
        tick(1000);
        const few = particleXs(ctx).length;
        ctx.drawImage.mockClear();
        inst.setConfig({ density: 60 });
        tick(1016);
        expect(particleXs(ctx).length).toBeGreaterThan(few);
        inst.destroy();
    });
});

describe("fond transparent (brique sans style)", () => {
    const opaqueDark = (style) => {
        const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(String(style));
        if (!m) return false;
        const [, r, g, b, a] = m;
        const alpha = a === undefined ? 1 : Number(a);
        return alpha >= 0.5 && Number(r) + Number(g) + Number(b) < 120;
    };

    it("aucun mode ne peint de plaque opaque plein écran (régression aurora 0.1.0)", () => {
        for (const mode of ["waves", "particles", "aurora"]) {
            const { canvas, ctx } = makeCanvas(600, 400);
            const inst = HolafAmbient.create({ target: canvas, mode, density: 30 });
            tick(1000);
            tick(1016);
            const painted = ctx.rec.fillStyle.filter((s) => typeof s === "string");
            expect(painted.filter(opaqueDark)).toEqual([]);
            inst.destroy();
        }
    });
});

describe("option blur (flou global)", () => {
    it("blur vaut 0 par défaut et est borné 0..40", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(inst.getConfig().blur).toBe(0);
        inst.setConfig({ blur: 999 });
        expect(inst.getConfig().blur).toBe(40);
        inst.setConfig({ blur: -5 });
        expect(inst.getConfig().blur).toBe(0);
        inst.setConfig({ blur: "abc" });
        expect(inst.getConfig().blur).toBe(0);
        inst.destroy();
    });

    it("blur = 0 → dessin direct (aucun tampon, aucun ctx.filter)", () => {
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas, blur: 0 });
        tick(1000);
        expect(ctx.rec.filter.filter((f) => typeof f === "string" && f !== "none")).toEqual([]);
        expect(ctx.drawImage).not.toHaveBeenCalled();
        inst.destroy();
    });

    it("blur > 0 → tampon hors-écran recomposé avec ctx.filter = blur(px × dpr)", () => {
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas, blur: 8 });
        tick(1000);
        const applied = ctx.rec.filter.filter((f) => typeof f === "string" && f.startsWith("blur("));
        expect(applied.length).toBeGreaterThan(0);
        expect(applied[0]).toMatch(/^blur\(\d+(\.\d+)?px\)$/);
        expect(ctx.drawImage).toHaveBeenCalled(); // recomposition du tampon
        inst.destroy();
    });

    it("passer de blur 0 à blur 8 puis revenir à 0 ne casse pas la boucle", () => {
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        inst.setConfig({ blur: 8 });
        expect(() => tick(1000)).not.toThrow();
        inst.setConfig({ blur: 0 });
        expect(() => tick(1016)).not.toThrow();
        expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(0);
        inst.destroy();
    });
});

describe("horloge dt (framerate et vitesse)", () => {
    beforeEach(() => {
        // Vitesses déterministes : rand(min,max) = milieu de l'intervalle.
        vi.spyOn(Math, "random").mockReturnValue(0.75);
    });

    function runParticles(speed, stepMs, frames) {
        const { canvas, ctx } = makeCanvas(600, 400);
        const inst = HolafAmbient.create({
            target: canvas, mode: "particles", speed, density: 10, links: false,
        });
        let t = 1000;
        tick(t); // 1ʳᵉ frame : référence (dt = 0)
        const start = particleXs(ctx)[0];
        for (let i = 0; i < frames; i++) {
            t += stepMs;
            ctx.drawImage.mockClear();
            tick(t);
        }
        const end = particleXs(ctx)[0];
        inst.destroy();
        return end - start;
    }

    it("speed = 0 → aucune dérive", () => {
        expect(runParticles(0, 16, 10)).toBeCloseTo(0, 6);
    });

    it("framerate indépendant : 16 ms × 20 = 32 ms × 10 (même durée réelle)", () => {
        const a = runParticles(1, 16, 20);
        const b = runParticles(1, 32, 10);
        expect(a).toBeGreaterThan(0);
        expect(Math.abs(a - b) / a).toBeLessThan(0.1);
    });

    it("speed est appliqué UNE fois : speed 2 ≈ 2× speed 1 (et non 4×)", () => {
        const v1 = runParticles(1, 16, 20);
        const v2 = runParticles(2, 16, 20);
        const ratio = v2 / v1;
        expect(ratio).toBeGreaterThan(1.8);
        expect(ratio).toBeLessThan(2.2);
    });
});

describe("boucle d'animation rAF", () => {
    it("create lance la boucle rAF", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(rafCalls).toBeGreaterThan(0);
        inst.destroy();
    });

    it("une frame jouée dessine (clearRect appelé) sans erreur", () => {
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        const before = ctx.clearRect.mock.calls.length;
        expect(tick(1000)).toBe(1);
        expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(before);
        inst.destroy();
    });

    it("pause() coupe la boucle (cancel + pas de relance), resume() relance", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        const seen = rafCalls;

        inst.pause();
        const afterPause = rafCalls;
        // Pas de relance tant qu'on est en pause.
        expect(tick()).toBe(0);
        expect(rafCalls).toBe(afterPause);

        inst.resume();
        expect(rafCalls).toBeGreaterThan(afterPause);
        expect(seen).toBeGreaterThan(0);
        inst.destroy();
    });

    it("destroy() cancel la boucle et ne relance plus aucune frame", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        inst.destroy();
        const after = rafCalls;
        expect(tick()).toBe(0);
        expect(rafCalls).toBe(after); // plus aucun rAF
    });

    it("destroy() est idempotent (double appel sans fuite ni erreur)", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        inst.destroy();
        const afterFirst = rafCalls;
        inst.destroy();
        expect(rafCalls).toBe(afterFirst);
    });

    it("setConfig() met à jour la config lue via getConfig()", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas, colors: ["#111111"], speed: 2 });
        inst.setConfig({ speed: 3, opacity: 0.5 });
        const cfg = inst.getConfig();
        expect(cfg.speed).toBe(3);
        expect(cfg.opacity).toBe(0.5);
        expect(cfg.colors).toEqual(["#111111"]);
        inst.destroy();
    });

    it("setConfig() vers 'particles' régénère les particules (sans fuite)", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas, mode: "waves" });
        inst.setConfig({ mode: "particles", density: 40 });
        expect(inst.getConfig().mode).toBe("particles");
        expect(tick(1000)).toBe(1); // dessine en mode particles sans erreur
        inst.destroy();
    });

    it("setConfig() avec de nouvelles couleurs repart proprement (sprites invalidés)", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas, mode: "particles" });
        inst.setConfig({ colors: ["#ff0000", "#00ff00"] });
        expect(inst.getConfig().colors).toEqual(["#ff0000", "#00ff00"]);
        expect(tick(1000)).toBe(1);
        inst.destroy();
    });
});

describe("pause automatique (document.visibilitychange)", () => {
    it("hidden → boucle coupée ; visible → relance", () => {
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(rafCalls).toBeGreaterThan(0);

        // Simule un onglet qui passe en arrière-plan.
        Object.defineProperty(document, "visibilityState", {
            configurable: true, value: "hidden",
        });
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        const afterHidden = rafCalls;
        expect(tick()).toBe(0); // pas de frame en hidden

        // Retour visible → relance.
        Object.defineProperty(document, "visibilityState", {
            configurable: true, value: "visible",
        });
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
        expect(rafCalls).toBeGreaterThan(afterHidden);

        inst.destroy();
        delete document.visibilityState;
        delete document.hidden;
    });
});

describe("prefers-reduced-motion", () => {
    it("rendu statique : une frame, PAS de boucle rAF", () => {
        globalThis.matchMedia = () => ({ matches: true });
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(rafCalls).toBe(0); // aucune boucle
        expect(ctx.clearRect).toHaveBeenCalledTimes(1); // une seule frame statique
        // Aucun nouveau rAF même après un tick.
        expect(tick()).toBe(0);
        inst.destroy();
    });

    it("resume() en reduced-motion redessine une frame sans lancer de boucle", () => {
        globalThis.matchMedia = () => ({ matches: true });
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        const before = ctx.clearRect.mock.calls.length;
        inst.resume();
        expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(before);
        expect(rafCalls).toBe(0);
        inst.destroy();
    });
});

describe("ResizeObserver", () => {
    it("observe le canvas et est déconnecté à destroy()", () => {
        const record = installFakeResizeObserver();
        const { canvas } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        expect(record.targets.has(canvas)).toBe(true);
        expect(record.disconnects).toBe(0);

        inst.destroy();
        expect(record.disconnects).toBe(1);
        expect(record.targets.size).toBe(0);
        expect(rafCalls).toBeGreaterThan(0); // destroy a bien coupé la boucle initiale
    });

    it("un resize pendant une pause redessine le fond (régression 0.1.0 : fond vide)", () => {
        const record = installFakeResizeObserver();
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        inst.pause();
        const before = ctx.clearRect.mock.calls.length;

        record.observer.cb([]); // le RO signale un changement de taille/layout

        expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(before);
        expect(tick(2000)).toBe(0); // toujours en pause : pas de boucle relancée
        inst.destroy();
    });

    it("un resize en reduced-motion redessine la frame statique", () => {
        globalThis.matchMedia = () => ({ matches: true });
        const record = installFakeResizeObserver();
        const { canvas, ctx } = makeCanvas();
        const inst = HolafAmbient.create({ target: canvas });
        const before = ctx.clearRect.mock.calls.length;

        record.observer.cb([]);

        expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(before);
        expect(rafCalls).toBe(0);
        inst.destroy();
    });
});

describe("dégradation (canvas hors-écran indisponible)", () => {
    beforeEach(() => {
        // jsdom « nu » : les <canvas> créés en interne par la brique n'ont PAS
        // de contexte 2D (getContext → null) → pas de sprite, pas de grain, pas
        // de tampon de flou. La brique doit continuer à tourner (replis).
        vi.restoreAllMocks();
    });

    it("les 3 modes tournent quand même (repli sur disques/aucun grain)", () => {
        for (const mode of ["waves", "particles", "aurora"]) {
            const { canvas, ctx } = makeCanvas();
            const inst = HolafAmbient.create({ target: canvas, mode, blur: 10 });
            expect(() => tick(1000)).not.toThrow();
            expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(0);
            inst.destroy();
        }
    });
});
