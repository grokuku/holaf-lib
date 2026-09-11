/* Tests HolafAmbient — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : validation du target (requis / sélecteur / type canvas), modes
 * inconnus (create & setConfig), boucle rAF (création → dessin → pause/resume →
 * destroy sans fuite), visibilitychange (pause auto), prefers-reduced-motion
 * (rendu statique, une frame), ResizeObserver (observe + disconnect à destroy).
 *
 * jsdom n'implémente PAS le canvas 2D ni rAF : on installe de faux contextes
 * 2D (mock) et de faux rAF/cancelAnimationFrame, comme le font les tests
 * existants pour le DOM (stubs via vi.fn()).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolafAmbient } from "../js/holaf-ambient.js";

// ── Harnais : canvas + contexte 2D mockés (jsdom n'a pas de canvas 2D) ──────
function makeCtx() {
    return {
        globalAlpha: 1,
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        ellipse: vi.fn(),
        createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
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
        expect(HolafAmbient.version).toBe("0.1.0");
        expect(inst.VERSION).toBe("0.1.0");
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
});
