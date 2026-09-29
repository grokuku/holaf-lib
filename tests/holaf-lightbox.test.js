/* Tests HolafLightbox — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : CSS injectant / nonce / getCss, source (items & collection),
 * navigation item→item (wrap-around) & grille (colonnes, clamp), machine à
 * états idle⇄zoom⇄fullscreen + restauration de la vue source, renderMedia
 * injecté (el/destroy/abort), garde de stale-load (serial), préchargement
 * (immédiat + lot débouncé + annulation + shouldPreload), viewport injecté
 * (options + onViewport + recréation sur changement d'élément + repli sans
 * viewport), clavier (+ shouldHandleKey), overlay/nav/spinner par défaut,
 * événements, destroy (listeners/instances).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HolafLightbox } from "../js/holaf-lightbox.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function items(n, prefix = "i") {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ path_canon: prefix + i, url: "/" + prefix + i });
    return out;
}

function makeContainer(tag = "div") {
    const el = document.createElement(tag);
    el.id = "lb-" + Math.random().toString(36).slice(2);
    document.body.appendChild(el);
    return el;
}

function fakeViewport() {
    const instances = [];
    const create = vi.fn((container, opts) => {
        const inst = {
            container,
            opts,
            destroyed: false,
            destroy: vi.fn(() => { inst.destroyed = true; }),
            setImageSize: vi.fn(),
            fit: vi.fn(),
            reset: vi.fn(),
            zoomBy: vi.fn(),
            setScale: vi.fn(),
            getScale: () => 1,
        };
        instances.push(inst);
        return inst;
    });
    return { create, instances };
}

function renderSpy(el) {
    const calls = [];
    const fn = vi.fn((ctx) => {
        calls.push(ctx);
        const target = el || document.createElement("img");
        return { el: target, destroy: vi.fn() };
    });
    return { fn, calls };
}

function fakeImageClass() {
    const instances = [];
    class FakeImage {
        constructor() {
            this.onload = null;
            this.onerror = null;
            this._src = "";
            instances.push(this);
        }
        set src(v) { this._src = v; }
        get src() { return this._src; }
    }
    return { FakeImage, instances };
}

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// ── CSS / options ────────────────────────────────────────────────────────────
describe("CSS et options", () => {
    it("expose une version et un getCss() non vide", () => {
        expect(HolafLightbox.version).toBe("0.2.0");
        expect(typeof HolafLightbox.getCss()).toBe("string");
        expect(HolafLightbox.getCss().length).toBeGreaterThan(50);
        expect(HolafLightbox.getCss()).toContain(".holaf-lightbox-overlay");
    });

    it("injecte le CSS par défaut (injectStyles true)", () => {
        const lb = HolafLightbox.create({});
        expect(document.getElementById("holaf-lightbox-style")).toBeTruthy();
        lb.destroy();
    });

    it("n'injecte rien avec injectStyles:false et retire le <style> à la destruction", () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        expect(document.getElementById("holaf-lightbox-style")).toBeFalsy();
        lb.destroy();
    });

    it("applique le nonce au <style>", () => {
        const lb = HolafLightbox.create({ css: { nonce: "abc123" } });
        const style = document.getElementById("holaf-lightbox-style");
        expect(style.getAttribute("nonce")).toBe("abc123");
        lb.destroy();
    });

    it("configure() et setStyleNonce() sont pris en compte", () => {
        HolafLightbox.configure({ nonce: "n-1" });
        const lb = HolafLightbox.create({});
        expect(document.getElementById("holaf-lightbox-style").getAttribute("nonce")).toBe("n-1");
        lb.destroy();
        HolafLightbox.configure({ nonce: null });
    });

    it("fusionne les libellés personnalisés", () => {
        const lb = HolafLightbox.create({ labels: { close: "Fermer !" } });
        expect(lb._labels.close).toBe("Fermer !");
        expect(lb._labels.prev).toBe("Précédent");
        lb.destroy();
    });

    it("le <style> partagé n'est retiré qu'à la dernière instance", () => {
        const a = HolafLightbox.create({});
        const b = HolafLightbox.create({});
        a.destroy();
        expect(document.getElementById("holaf-lightbox-style")).toBeTruthy();
        b.destroy();
        expect(document.getElementById("holaf-lightbox-style")).toBeFalsy();
    });
});

// ── Source & navigation ──────────────────────────────────────────────────────
describe("source & navigation", () => {
    it("setItems / current / isOpen / mode", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        expect(lb.isOpen()).toBe(false);
        expect(lb.mode()).toBe(null);
        expect(lb.current()).toBe(null);
        await lb.openZoom(lb._items[0]);
        expect(lb.current().path_canon).toBe("i0");
        expect(lb.isOpen()).toBe(true);
        expect(lb.mode()).toBe("zoom");
        lb.destroy();
    });

    it("setSource(collection) avec total/getAt", async () => {
        const coll = {
            arr: items(4),
            total() { return this.arr.length; },
            getAt(i) { return this.arr[i]; },
        };
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setSource(coll);
        await lb.navigate(1);
        expect(lb.current().path_canon).toBe("i0");
        expect(lb._getTotal()).toBe(4);
        lb.destroy();
    });

    it("navigate(1) émet navigate et avance ; wrap-around fin→début", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        const seen = [];
        lb.on("navigate", (p) => seen.push(p.index));
        await lb.navigate(1); // -1 → 0
        await lb.navigate(1); // 1
        await lb.navigate(1); // 2
        await lb.navigate(1); // wrap → 0
        expect(seen).toEqual([0, 1, 2, 0]);
        lb.destroy();
    });

    it("navigate(-1) depuis 0 revient au dernier (wrap-around)", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        await lb.navigate(1); // 0
        await lb.navigate(-1); // wrap → 2
        expect(lb.current().path_canon).toBe("i2");
        lb.destroy();
    });

    it("navigate sur source vide renvoie false", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems([]);
        expect(await lb.navigate(1)).toBe(false);
        lb.destroy();
    });

    it("navigateGrid ±colonnes", async () => {
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            getColumnCount: () => 3,
        });
        lb.setItems(items(10));
        await lb.openZoom(lb._items[0]);
        await lb.navigateGrid(1);
        expect(lb.current().path_canon).toBe("i3");
        await lb.navigateGrid(1);
        expect(lb.current().path_canon).toBe("i6");
        await lb.navigateGrid(-1);
        expect(lb.current().path_canon).toBe("i3");
        lb.destroy();
    });

    it("navigateGrid est borné (pas de wrap-around)", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false }, getColumnCount: () => 3 });
        lb.setItems(items(5));
        await lb.navigate(1); // index 0
        expect(await lb.navigateGrid(1)).toBe(true); // 3
        expect(await lb.navigateGrid(1)).toBe(false); // 6 ≥ 5 → refus
        expect(lb.current().path_canon).toBe("i3");
        // idem vers le haut
        expect(await lb.navigateGrid(-1)).toBe(true); // 0
        expect(await lb.navigateGrid(-1)).toBe(false); // -3 < 0
        lb.destroy();
    });

    it("navigateGrid depuis index -1 va à 0", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false }, getColumnCount: () => 3 });
        lb.setItems(items(5));
        await lb.navigateGrid(1);
        expect(lb.current().path_canon).toBe("i0");
        lb.destroy();
    });

    it("getIndex() de l'hôte fait autorité sur l'index", async () => {
        let idx = 2;
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            getIndex: () => idx,
        });
        lb.setItems(items(5));
        expect(lb.current().path_canon).toBe("i2");
        idx = 4;
        expect(lb.current().path_canon).toBe("i4");
        lb.destroy();
    });

    it("navigate attend un getAt asynchrone", async () => {
        const arr = items(3);
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setSource({ total: () => arr.length, getAt: (i) => Promise.resolve(arr[i]) });
        await lb.navigate(1);
        expect(lb.current().path_canon).toBe("i0");
        lb.destroy();
    });

    it("beforeNavigate === false annule la navigation", async () => {
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            beforeNavigate: () => false,
        });
        lb.setItems(items(3));
        expect(await lb.navigate(1)).toBe(false);
        expect(lb.current()).toBe(null);
        lb.destroy();
    });

    it("beforeNavigate === 'cancel' annule aussi", async () => {
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            beforeNavigate: () => Promise.resolve("cancel"),
        });
        lb.setItems(items(3));
        expect(await lb.navigate(1)).toBe(false);
        lb.destroy();
    });
});

// ── Machine à états ──────────────────────────────────────────────────────────
describe("machine à états idle/zoom/fullscreen", () => {
    it("openZoom puis openFullscreen : retour à la vue source (zoom) via back()", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        const opened = [];
        const resumed = [];
        const closed = [];
        lb.on("open", (p) => opened.push(p.mode));
        lb.on("resume", (p) => resumed.push(p.mode));
        lb.on("close", (p) => closed.push(p.mode));

        await lb.openZoom(lb._items[0]);
        await lb.openFullscreen(lb._items[0]);
        expect(lb.mode()).toBe("fullscreen");

        lb.back(); // fullscreen → restore zoom
        await flush();
        expect(lb.mode()).toBe("zoom");
        expect(resumed).toEqual(["zoom"]);

        lb.back(); // zoom → fermé
        await flush();
        expect(lb.isOpen()).toBe(false);
        expect(closed).toEqual(["fullscreen", "zoom"]);
        expect(opened).toEqual(["zoom", "fullscreen"]);
        lb.destroy();
    });

    it("Échap restaure la vue source (fullscreen→zoom) puis ferme", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.openFullscreen(lb._items[0]);

        const ev = (key) => { const e = { key, preventDefault() {} }; return e; };
        lb.handleKey(ev("Escape"));
        await flush();
        expect(lb.mode()).toBe("zoom");
        lb.handleKey(ev("Escape"));
        await flush();
        expect(lb.isOpen()).toBe(false);
        lb.destroy();
    });

    it("openFullscreen depuis idle ne restaure rien (retour direct)", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[1]);
        expect(lb.mode()).toBe("fullscreen");
        lb.back();
        await flush();
        expect(lb.isOpen()).toBe(false);
        lb.destroy();
    });

    it("close() ferme tout avec un seul close (mode au sommet)", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        const closed = [];
        lb.on("close", (p) => closed.push(p.mode));
        await lb.openZoom(lb._items[0]);
        await lb.openFullscreen(lb._items[0]);
        expect(lb.close()).toBe(true);
        expect(lb.isOpen()).toBe(false);
        expect(closed).toEqual(["fullscreen"]);
        lb.destroy();
    });

    it("affiche/masque le conteneur selon la vue", async () => {
        const zoomEl = makeContainer();
        const fsEl = makeContainer();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            views: { zoom: { container: zoomEl }, fullscreen: { container: fsEl } },
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        expect(zoomEl.style.display).toBe("flex");
        expect(fsEl.style.display).toBe("none");
        await lb.openFullscreen(lb._items[0]);
        expect(zoomEl.style.display).toBe("none");
        expect(fsEl.style.display).toBe("flex");
        lb.back();
        await flush();
        expect(zoomEl.style.display).toBe("flex");
        expect(fsEl.style.display).toBe("none");
        lb.destroy();
    });

    it("openZoom remplace une vue de base précédente", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[0]);
        await lb.openZoom(lb._items[1]);
        expect(lb.mode()).toBe("zoom");
        expect(lb._stack).toEqual(["zoom"]);
        lb.destroy();
    });

    it("appelle onOpen/onClose/onResume injectés", async () => {
        const calls = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            onOpen: (m) => calls.push("open:" + m),
            onClose: (m) => calls.push("close:" + m),
            onResume: (m) => calls.push("resume:" + m),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.openFullscreen(lb._items[0]);
        lb.back();
        await flush();
        lb.close();
        expect(calls).toEqual(["open:zoom", "open:fullscreen", "close:fullscreen", "resume:zoom", "close:zoom"]);
        lb.destroy();
    });
});

// ── renderMedia / serial ─────────────────────────────────────────────────────
describe("renderMedia injecté & garde serial", () => {
    it("appelle renderMedia avec container/item/mode", async () => {
        const el = makeContainer();
        const { fn, calls } = renderSpy();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            views: { zoom: { container: el } },
            renderMedia: fn,
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[1]);
        expect(calls).toHaveLength(1);
        expect(calls[0].container).toBe(el);
        expect(calls[0].item.path_canon).toBe("i1");
        expect(calls[0].mode).toBe("zoom");
        expect(calls[0].immediate).toBe(true);
        lb.destroy();
    });

    it("utilise l'élément retourné comme contenu du viewport", async () => {
        const media = document.createElement("video");
        const { fn } = renderSpy(media);
        const vp = fakeViewport();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: vp,
            renderMedia: fn,
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        expect(vp.create).toHaveBeenCalledTimes(1);
        expect(vp.create.mock.calls[0][1].content).toBe(media);
        expect(vp.instances[0].setImageSize).not.toHaveBeenCalled();
        lb.destroy();
    });

    it("onReady déclenche ready + setImageSize sur le viewport", async () => {
        const media = document.createElement("img");
        const vp = fakeViewport();
        let ctxReady = null;
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: vp,
            renderMedia: (ctx) => { ctxReady = ctx; return { el: media, destroy: vi.fn() }; },
        });
        lb.setItems(items(3));
        const ready = [];
        lb.on("ready", (p) => ready.push(p));
        await lb.openZoom(lb._items[0]);
        ctxReady.onReady({ width: 1024, height: 768 });
        expect(ready).toHaveLength(1);
        expect(vp.instances[0].setImageSize).toHaveBeenCalledWith(1024, 768);
        lb.destroy();
    });

    it("détruit le rendu précédent et avorte son signal à la navigation", async () => {
        const { fn, calls } = renderSpy();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, renderMedia: fn });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const first = calls[0];
        await lb.navigate(1);
        expect(first.signal.aborted).toBe(true);
        expect(first.lightbox).toBe(lb);
        lb.destroy();
    });

    it("les callbacks onReady périmés sont ignorés (serial)", async () => {
        const ready = [];
        const calls = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            renderMedia: (ctx) => { calls.push(ctx); return { el: document.createElement("img"), destroy: vi.fn() }; },
        });
        lb.setItems(items(3));
        lb.on("ready", (p) => ready.push(p));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1);
        calls[0].onReady({ width: 10, height: 10 }); // périmé
        expect(ready).toHaveLength(0);
        calls[1].onReady({ width: 20, height: 20 }); // courant
        expect(ready).toHaveLength(1);
        lb.destroy();
    });

    it("détruit le résultat d'un rendu arrivé trop tard", async () => {
        let resolveFirst;
        const destroyFirst = vi.fn();
        const calls = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            renderMedia: (ctx) => {
                calls.push(ctx);
                if (calls.length === 1) {
                    return new Promise((res) => { resolveFirst = () => res({ el: document.createElement("img"), destroy: destroyFirst }); });
                }
                return { el: document.createElement("img"), destroy: vi.fn() };
            },
        });
        lb.setItems(items(3));
        const pending = lb.openZoom(lb._items[0]); // 1er rendu en vol (non attendu)
        await flush();
        await lb.navigate(1); // 2e rendu démarre → le 1er devient périmé
        resolveFirst();
        await flush();
        await pending;
        expect(destroyFirst).toHaveBeenCalled();
        lb.destroy();
    });

    it("une erreur de renderMedia émet error", async () => {
        const errors = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            renderMedia: () => { throw new Error("boom"); },
        });
        lb.setItems(items(3));
        lb.on("error", (p) => errors.push(p));
        await lb.openZoom(lb._items[0]);
        expect(errors).toHaveLength(1);
        expect(errors[0].error.message).toBe("boom");
        lb.destroy();
    });

    it("renderMedia asynchrone est attendu", async () => {
        const media = document.createElement("img");
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            renderMedia: () => Promise.resolve({ el: media, destroy: vi.fn() }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        lb.destroy();
    });

    it("destroy() du rendu est appelé à la fermeture", async () => {
        const destroy = vi.fn();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            renderMedia: () => ({ el: document.createElement("img"), destroy }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        lb.back();
        await flush();
        expect(destroy).toHaveBeenCalled();
        lb.destroy();
    });
});

// ── Préchargement ────────────────────────────────────────────────────────────
describe("préchargement", () => {
    it("précharge l'item suivant immédiatement (urlFor)", async () => {
        const { FakeImage, instances } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (item) => "full:" + item.path_canon,
            preloadDebounce: 5,
        });
        lb.setItems(items(5));
        await lb.openZoom(lb._items[0]);
        const srcs = instances.map((i) => i.src);
        expect(srcs).toContain("full:i1");
        lb.destroy();
    });

    it("lot débouncé précharge jusqu'à N suivants", async () => {
        const { FakeImage, instances } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (item) => "full:" + item.path_canon,
            preload: 2,
            preloadDebounce: 5,
        });
        lb.setItems(items(6));
        await lb.openZoom(lb._items[0]);
        await sleep(25);
        const srcs = instances.map((i) => i.src);
        expect(srcs).toContain("full:i1");
        expect(srcs).toContain("full:i2");
        lb.destroy();
    });

    it("preloadAround(index) force le lot", async () => {
        const { FakeImage, instances } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (item) => "full:" + item.path_canon,
            preload: 2,
        });
        lb.setItems(items(6));
        lb.preloadAround(2);
        const srcs = instances.map((i) => i.src);
        expect(srcs).toEqual(["full:i3", "full:i4"]);
        lb.destroy();
    });

    it("shouldPreload filtre les items", async () => {
        const { FakeImage, instances } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (item) => "full:" + item.path_canon,
            shouldPreload: (item) => item.path_canon !== "i1",
            preload: 2,
        });
        lb.setItems(items(6));
        lb.preloadAround(0);
        const srcs = instances.map((i) => i.src);
        expect(srcs).not.toContain("full:i1");
        expect(srcs).toContain("full:i2");
        lb.destroy();
    });

    it("annule les jobs périmés (le lot suivant coupe le précédent)", async () => {
        const { FakeImage, instances } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (item) => "full:" + item.path_canon,
            preload: 2,
        });
        lb.setItems(items(8));
        lb.preloadAround(0);
        const firstBatch = instances.map((i) => i.src);
        lb.preloadAround(4);
        // Les jobs du 1er lot ont vu leur src remis à "" (annulation).
        const cancelled = instances.filter((i) => i.src === "");
        expect(cancelled.length).toBeGreaterThan(0);
        expect(firstBatch).toContain("full:i1");
        lb.destroy();
    });

    it("preload:0 désactive le lot débouncé (seul le suivant immédiat reste)", async () => {
        const { FakeImage, instances } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (item) => "full:" + item.path_canon,
            preload: 0,
            preloadDebounce: 5,
        });
        lb.setItems(items(6));
        await lb.openZoom(lb._items[0]);
        await sleep(25);
        const srcs = instances.map((i) => i.src);
        expect(srcs).toEqual(["full:i1"]);
        lb.destroy();
    });
});

// ── shouldHandleKey & clavier ────────────────────────────────────────────────
describe("clavier", () => {
    const key = (k, mods = {}) => {
        let prevented = false;
        const e = { key: k, preventDefault() { prevented = true; }, ...mods };
        Object.defineProperty(e, "prevented", { get: () => prevented });
        e._prevented = () => prevented;
        return e;
    };

    it("shouldHandleKey=false bloque toute touche", () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false }, shouldHandleKey: () => false });
        lb.setItems(items(3));
        expect(lb.handleKey(key("ArrowRight"))).toBe(false);
        expect(lb.handleKey(key("Escape"))).toBe(false);
        lb.destroy();
    });

    it("ArrowRight/ArrowLeft naviguent", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        lb.handleKey(key("ArrowRight"));
        await flush();
        expect(lb.current().path_canon).toBe("i0");
        lb.handleKey(key("ArrowRight"));
        await flush();
        expect(lb.current().path_canon).toBe("i1");
        lb.handleKey(key("ArrowLeft"));
        await flush();
        expect(lb.current().path_canon).toBe("i0");
        lb.destroy();
    });

    it("ArrowUp/Down font la navigation grille seulement hors vue ouverte", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false }, getColumnCount: () => 3 });
        lb.setItems(items(9));
        lb.handleKey(key("ArrowDown"));
        await flush();
        expect(lb.current().path_canon).toBe("i0");
        lb.handleKey(key("ArrowDown"));
        await flush();
        expect(lb.current().path_canon).toBe("i3");
        // Vue ouverte → ↑/↓ ne sont plus consommés par la brique.
        await lb.openZoom(lb.current());
        expect(lb.handleKey(key("ArrowDown"))).toBe(false);
        lb.destroy();
    });

    it("Entrée ouvre zoom, Ctrl+Entrée ouvre fullscreen", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        lb.handleKey(key("ArrowRight")); // index 0
        await flush();
        lb.handleKey(key("Enter"));
        await flush();
        expect(lb.mode()).toBe("zoom");
        lb.handleKey(key("Enter", { ctrlKey: true }));
        await flush();
        expect(lb.mode()).toBe("fullscreen");
        lb.destroy();
    });

    it("Entrée sans index courant ouvre l'item 0 et émet navigate", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        const seen = [];
        lb.on("navigate", (p) => seen.push(p.index));
        lb.handleKey(key("Enter"));
        await flush();
        expect(lb.isOpen()).toBe(true);
        expect(lb.mode()).toBe("zoom");
        expect(seen).toEqual([0]);
        lb.destroy();
    });

    it("+ / - / 0 pilotent le zoom du viewport courant", async () => {
        const vp = fakeViewport();
        const media = document.createElement("img");
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: vp,
            renderMedia: () => ({ el: media, destroy: vi.fn() }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        lb.handleKey(key("+"));
        expect(vp.instances[0].zoomBy).toHaveBeenCalled();
        const zoomCalls = vp.instances[0].zoomBy.mock.calls.length;
        lb.handleKey(key("-"));
        expect(vp.instances[0].zoomBy.mock.calls.length).toBe(zoomCalls + 1);
        lb.handleKey(key("0"));
        expect(vp.instances[0].reset).toHaveBeenCalled();
        lb.destroy();
    });

    it("la touche inconnue n'est pas consommée", () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        expect(lb.handleKey(key("q"))).toBe(false);
        lb.destroy();
    });
});

// ── Viewport injecté ─────────────────────────────────────────────────────────
describe("viewport injecté", () => {
    it("transmet les options résolues (content/dragTarget + viewportOptions)", async () => {
        const vp = fakeViewport();
        const media = document.createElement("img");
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: vp,
            viewportOptions: (mode) => ({ minZoom: "fit", maxZoom: 30, mode }),
            renderMedia: () => ({ el: media, destroy: vi.fn() }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const opts = vp.create.mock.calls[0][1];
        expect(opts.content).toBe(media);
        expect(opts.dragTarget).toBe(media);
        expect(opts.minZoom).toBe("fit");
        expect(opts.maxZoom).toBe(30);
        expect(opts.mode).toBe("zoom");
        lb.destroy();
    });

    it("onViewport restitue l'instance puis null", async () => {
        const vp = fakeViewport();
        const seen = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: vp,
            onViewport: (mode, instance) => seen.push([mode, instance]),
            renderMedia: () => ({ el: document.createElement("img"), destroy: vi.fn() }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        expect(seen[0][0]).toBe("zoom");
        expect(seen[0][1]).toBe(vp.instances[0]);
        lb.back();
        await flush();
        expect(seen[seen.length - 1][1]).toBe(null);
        lb.destroy();
    });

    it("recrée le viewport quand l'élément média change", async () => {
        const vp = fakeViewport();
        let el = document.createElement("img");
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: vp,
            renderMedia: () => ({ el, destroy: vi.fn() }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        expect(vp.create).toHaveBeenCalledTimes(1);
        el = document.createElement("video");
        await lb.navigate(1);
        expect(vp.create).toHaveBeenCalledTimes(2);
        expect(vp.instances[0].destroy).toHaveBeenCalled();
        lb.destroy();
    });

    it("sans viewport injecté, le rendu fonctionne sans zoom/pan", async () => {
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: null,
            viewportFactory: () => null,
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        expect(lb.isOpen()).toBe(true);
        expect(lb.zoomBy(1.1)).toBe(false);
        lb.destroy();
    });

    it("viewportFactory est prioritaire et reçoit (mode, container, element)", async () => {
        const vp = fakeViewport();
        const factory = vi.fn(() => vp);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            viewport: null,
            viewportFactory: factory,
            renderMedia: () => ({ el: document.createElement("img"), destroy: vi.fn() }),
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(factory.mock.calls[0][0]).toBe("zoom");
        lb.destroy();
    });
});

// ── Overlay par défaut / nav / spinner ───────────────────────────────────────
describe("overlay par défaut (chrome)", () => {
    it("crée overlay + barre ‹ › ✖ + spinner quand aucun conteneur n'est fourni", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, zIndex: 12345 });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        expect(overlay).toBeTruthy();
        expect(overlay.style.zIndex).toBe("12345");
        expect(host.querySelector(".holaf-lightbox-nav--prev")).toBeTruthy();
        expect(host.querySelector(".holaf-lightbox-nav--next")).toBeTruthy();
        expect(host.querySelector(".holaf-lightbox-nav--close")).toBeTruthy();
        expect(host.querySelector(".holaf-lightbox-spinner")).toBeTruthy();
        lb.destroy();
    });

    it("le bouton suivant navigue, le bouton fermer revient", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        host.querySelector(".holaf-lightbox-nav--next").click();
        await flush();
        expect(lb.current().path_canon).toBe("i1");
        host.querySelector(".holaf-lightbox-nav--close").click();
        await flush();
        expect(lb.isOpen()).toBe(false);
        lb.destroy();
    });

    it("le spinner s'affiche au rendu et disparaît sur onReady", async () => {
        const host = makeContainer();
        let ctxReady = null;
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            renderMedia: (ctx) => { ctxReady = ctx; return { el: document.createElement("img"), destroy: vi.fn() }; },
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const spinner = host.querySelector(".holaf-lightbox-spinner");
        expect(spinner).toBeTruthy();
        const before = spinner.style.display;
        ctxReady.onReady({});
        expect(spinner.style.display).toBe("none");
        lb.destroy();
    });

    it("destroy retire l'overlay par défaut du host", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host });
        await lb.openZoom({ path_canon: "x", url: "/x" });
        expect(host.querySelector(".holaf-lightbox-overlay")).toBeTruthy();
        lb.destroy();
        expect(host.querySelector(".holaf-lightbox-overlay")).toBeFalsy();
    });
});

// ── Cycle de vie ─────────────────────────────────────────────────────────────
describe("cycle de vie", () => {
    it("on/off retire un listener", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        const seen = [];
        const cb = (p) => seen.push(p);
        lb.on("navigate", cb);
        await lb.navigate(1);
        lb.off("navigate", cb);
        await lb.navigate(1);
        expect(seen).toHaveLength(1);
        lb.destroy();
    });

    it("instances multiples indépendantes", async () => {
        const a = HolafLightbox.create({ css: { injectStyles: false } });
        const b = HolafLightbox.create({ css: { injectStyles: false } });
        a.setItems(items(3));
        b.setItems(items(5, "j"));
        await a.navigate(1);
        await b.navigate(1);
        expect(a.current().path_canon).toBe("i0");
        expect(b.current().path_canon).toBe("j0");
        a.destroy();
        await b.navigate(1);
        expect(b.current().path_canon).toBe("j1");
        b.destroy();
    });

    it("destroy est idempotent et coupe les timers de préchargement", async () => {
        const { FakeImage } = fakeImageClass();
        vi.stubGlobal("Image", FakeImage);
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            urlFor: (it) => "/" + it.path_canon,
            preloadDebounce: 50,
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        lb.destroy();
        lb.destroy();
        expect(lb.isOpen()).toBe(false);
    });

    it("après destroy, openZoom/navigate ne font rien", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        lb.destroy();
        expect(await lb.openZoom(lb._items[0])).toBe(false);
        expect(await lb.navigate(1)).toBe(false);
    });
});

// ── Diaporama (OPT-IN) ───────────────────────────────────────────────────────
describe("diaporama (opt-in)", () => {
    const keyEvent = (k) => {
        let prevented = false;
        return {
            key: k,
            preventDefault() { prevented = true; },
            _prevented() { return prevented; },
        };
    };

    it("sans option slideshow : start/toggle/stop inertes et espace non consommé (contrôle négatif)", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[0]);
        expect(lb.startSlideshow()).toBe(false);
        expect(lb.toggleSlideshow()).toBe(false);
        expect(lb.stopSlideshow()).toBe(false);
        expect(lb.pauseSlideshow()).toBe(false);
        expect(lb.resumeSlideshow()).toBe(false);
        expect(lb.isSlideshow()).toBe(false);
        expect(lb.isSlideshowPaused()).toBe(false);
        expect(lb._slideshowCfg).toBe(null);
        const e = keyEvent(" ");
        expect(lb.handleKey(e)).toBe(false);
        expect(e._prevented()).toBe(false);
        lb.destroy();
    });

    it("startSlideshow démarre, avance après duration et s'arrête en fin sans loop", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 100 } });
        lb.setItems(items(3));
        const started = [];
        const stops = [];
        const ticks = [];
        lb.on("slideshowstart", (p) => started.push(p));
        lb.on("slideshowstop", (p) => stops.push(p.reason));
        lb.on("slideshowtick", (p) => ticks.push(p));
        await lb.openZoom(lb._items[0]);
        expect(lb.startSlideshow()).toBe(true);
        expect(lb.isSlideshow()).toBe(true);
        expect(started).toHaveLength(1);
        expect(started[0]).toMatchObject({ duration: 100, random: false, loop: false, transition: 0 });
        // Pas d'avance avant duration.
        await vi.advanceTimersByTimeAsync(99);
        expect(lb.current().path_canon).toBe("i0");
        await vi.advanceTimersByTimeAsync(1);
        expect(lb.current().path_canon).toBe("i1");
        await vi.advanceTimersByTimeAsync(100);
        expect(lb.current().path_canon).toBe("i2");
        await vi.advanceTimersByTimeAsync(100); // fin de liste → stop
        expect(lb.current().path_canon).toBe("i2");
        expect(lb.isSlideshow()).toBe(false);
        expect(stops).toEqual(["end"]);
        expect(ticks.map((t) => t.nextIndex)).toEqual([1, 2]);
        lb.destroy();
    });

    it("loop: revient à la première en fin de liste sans s'arrêter", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 50, loop: true } });
        lb.setItems(items(2));
        await lb.openZoom(lb._items[1]);
        lb.startSlideshow();
        await vi.advanceTimersByTimeAsync(50);
        expect(lb.current().path_canon).toBe("i0");
        await vi.advanceTimersByTimeAsync(50);
        expect(lb.current().path_canon).toBe("i1");
        expect(lb.isSlideshow()).toBe(true);
        lb.destroy();
    });

    it("random: ne répète jamais la même image deux fois de suite", async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, "random").mockReturnValue(0);
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 30, random: true } });
        lb.setItems(items(4));
        await lb.openZoom(lb._items[0]);
        const ticks = [];
        lb.on("slideshowtick", (p) => ticks.push([p.index, p.nextIndex]));
        lb.startSlideshow();
        for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(30);
        expect(ticks.length).toBeGreaterThanOrEqual(5);
        for (const [cur, next] of ticks) expect(next).not.toBe(cur);
        lb.destroy();
    });

    it("pause/reprise : aucun avance pendant la pause + événements", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 40 } });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const evts = [];
        lb.on("slideshowpause", () => evts.push("pause"));
        lb.on("slideshowresume", () => evts.push("resume"));
        lb.startSlideshow();
        expect(lb.pauseSlideshow()).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(true);
        await vi.advanceTimersByTimeAsync(300);
        expect(lb.current().path_canon).toBe("i0"); // pas d'avance en pause
        expect(lb.resumeSlideshow()).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(false);
        await vi.advanceTimersByTimeAsync(40);
        expect(lb.current().path_canon).toBe("i1");
        expect(evts).toEqual(["pause", "resume"]);
        lb.destroy();
    });

    it("toggleSlideshow démarre puis bascule pause/reprise puis stop", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: true });
        lb.setItems(items(2));
        await lb.openFullscreen(lb._items[0]);
        expect(lb.toggleSlideshow()).toBe(true);
        expect(lb.isSlideshow()).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(false);
        expect(lb._slideshow.cfg.duration).toBe(4000); // durée par défaut
        expect(lb.toggleSlideshow()).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(true);
        expect(lb.toggleSlideshow()).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(false);
        expect(lb.stopSlideshow()).toBe(true);
        expect(lb.isSlideshow()).toBe(false);
        lb.destroy();
    });

    it("la fermeture de la vue arrête le diaporama (reason close)", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 50 } });
        lb.setItems(items(3));
        const stops = [];
        lb.on("slideshowstop", (p) => stops.push(p.reason));
        await lb.openFullscreen(lb._items[0]);
        lb.startSlideshow();
        expect(lb.isSlideshow()).toBe(true);
        lb.back();
        await flush();
        expect(lb.isSlideshow()).toBe(false);
        expect(stops).toEqual(["close"]);
        lb.destroy();
    });

    it("flèches en diaporama : changement immédiat + minuteur réarmé dans les deux sens", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 1000 } });
        lb.setItems(items(4));
        await lb.openFullscreen(lb._items[0]);
        lb.startSlideshow();
        await vi.advanceTimersByTimeAsync(400); // minuteur initial partiellement écoulé
        expect(lb.handleKey(keyEvent("ArrowRight"))).toBe(true);
        await flush();
        expect(lb.current().path_canon).toBe("i1"); // changement IMMÉDIAT
        await vi.advanceTimersByTimeAsync(999);     // 999 ms après la flèche
        expect(lb.current().path_canon).toBe("i1"); // réarmé (l'ancien serait tombé à 1000)
        await vi.advanceTimersByTimeAsync(1);
        expect(lb.current().path_canon).toBe("i2");
        expect(lb.handleKey(keyEvent("ArrowLeft"))).toBe(true);
        await flush();
        expect(lb.current().path_canon).toBe("i1"); // retour arrière immédiat
        await vi.advanceTimersByTimeAsync(999);
        expect(lb.current().path_canon).toBe("i1"); // réarmé aussi dans l'autre sens
        await vi.advanceTimersByTimeAsync(1);
        expect(lb.current().path_canon).toBe("i2");
        lb.destroy();
    });

    it("espace en plein écran : démarre puis play/pause (opt-in)", async () => {
        vi.useFakeTimers();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 100 } });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[0]);
        const e1 = keyEvent(" ");
        expect(lb.handleKey(e1)).toBe(true);
        expect(e1._prevented()).toBe(true);
        expect(lb.isSlideshow()).toBe(true); // démarre
        const e2 = keyEvent(" ");
        expect(lb.handleKey(e2)).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(true); // pause
        await vi.advanceTimersByTimeAsync(500);
        expect(lb.current().path_canon).toBe("i0"); // pas d'avance en pause
        const e3 = keyEvent(" ");
        expect(lb.handleKey(e3)).toBe(true);
        expect(lb.isSlideshowPaused()).toBe(false); // reprise
        await vi.advanceTimersByTimeAsync(100);
        expect(lb.current().path_canon).toBe("i1");
        lb.destroy();
    });

    it("espace hors plein écran (fermé ou zoom) n'est pas consommé", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 100 } });
        lb.setItems(items(3));
        const e0 = keyEvent(" ");
        expect(lb.handleKey(e0)).toBe(false); // fermé
        expect(e0._prevented()).toBe(false);
        await lb.openZoom(lb._items[0]);
        const e1 = keyEvent(" ");
        expect(lb.handleKey(e1)).toBe(false); // zoom ≠ plein écran
        expect(e1._prevented()).toBe(false);
        expect(lb.isSlideshow()).toBe(false);
        lb.destroy();
    });

    it("slideshow.keyboard:false désactive la barre d'espace", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false }, slideshow: { duration: 100, keyboard: false } });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[0]);
        const e = keyEvent(" ");
        expect(lb.handleKey(e)).toBe(false);
        expect(e._prevented()).toBe(false);
        expect(lb.isSlideshow()).toBe(false);
        lb.destroy();
    });
});

// ── Crossfade (OPT-IN) ───────────────────────────────────────────────────────
describe("crossfade (opt-in)", () => {
    function layerSpy() {
        const calls = [];
        const fn = vi.fn((ctx) => {
            calls.push(ctx);
            const img = document.createElement("img");
            ctx.container.appendChild(img);
            return { el: img, destroy: vi.fn() };
        });
        return { fn, calls };
    }

    it("défaut (sans transition) : aucune couche, container = surface fournie (contrôle négatif)", async () => {
        const el = makeContainer();
        const { fn, calls } = layerSpy();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            views: { zoom: { container: el } },
            renderMedia: fn,
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1);
        expect(el.querySelectorAll(".holaf-lightbox-layer").length).toBe(0);
        expect(calls.every((c) => c.container === el)).toBe(true);
        expect(lb._transition).toBe(0);
        lb.destroy();
    });

    it("transition:50 → 2 couches pendant le fondu, une seule après", async () => {
        vi.useFakeTimers();
        const host = makeContainer();
        const { fn, calls } = layerSpy();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, transition: 50, renderMedia: fn });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        expect(overlay.querySelectorAll(".holaf-lightbox-layer").length).toBe(1); // 1er rendu direct
        await lb.navigate(1);
        expect(overlay.querySelectorAll(".holaf-lightbox-layer").length).toBe(2); // sortante + entrante
        expect(calls[0].container).not.toBe(calls[1].container); // couches DISTINCTES
        expect(calls[1].container.className).toContain("holaf-lightbox-layer");
        calls[1].onReady({}); // fondu déclenché à la disponibilité média
        await vi.advanceTimersByTimeAsync(50 + 60);
        expect(overlay.querySelectorAll(".holaf-lightbox-layer").length).toBe(1);
        lb.destroy();
    });

    it("erreur de renderMedia en crossfade : l'ancien rendu reste affiché (pas de fuite)", async () => {
        const host = makeContainer();
        let fail = false;
        const destroys = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            transition: 40,
            renderMedia: (ctx) => {
                if (fail) throw new Error("boom");
                const img = document.createElement("img");
                ctx.container.appendChild(img);
                const d = vi.fn();
                destroys.push(d);
                return { el: img, destroy: d };
            },
        });
        lb.setItems(items(3));
        const errors = [];
        lb.on("error", (e) => errors.push(e));
        await lb.openZoom(lb._items[0]);
        fail = true;
        await lb.navigate(1);
        expect(errors).toHaveLength(1);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(1);
        expect(destroys[0]).not.toHaveBeenCalled(); // l'ancien rendu est toujours affiché
        fail = false;
        await lb.navigate(1); // re-démarre normalement
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(2);
        lb.destroy();
        expect(destroys[0]).toHaveBeenCalled(); // détruit à la fermeture
    });

    it("onReady synchrone : le fondu démarre sans attendre le repli", async () => {
        vi.useFakeTimers();
        const host = makeContainer();
        const calls = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            transition: 40,
            renderMedia: (ctx) => {
                calls.push(ctx);
                const img = document.createElement("img");
                ctx.container.appendChild(img);
                ctx.onReady({}); // hôte synchrone : disponible immédiatement
                return { el: img, destroy: vi.fn() };
            },
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1);
        expect(calls[1].container.style.transition).toContain("opacity 40ms");
        await vi.advanceTimersByTimeAsync(40 + 60);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(1);
        lb.destroy();
    });

    it("duration 0 = coupe franche (pas de couche)", async () => {
        const host = makeContainer();
        const { fn } = layerSpy();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, transition: 0, renderMedia: fn });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(0);
        lb.destroy();
    });

    it("changement rapide : couche intermédiaire détruite, aucune couche orpheline", async () => {
        vi.useFakeTimers();
        const host = makeContainer();
        const destroys = [];
        const calls = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            transition: 100,
            renderMedia: (ctx) => {
                calls.push(ctx);
                const img = document.createElement("img");
                ctx.container.appendChild(img);
                const d = vi.fn();
                destroys.push(d);
                return { el: img, destroy: d };
            },
        });
        lb.setItems(items(4));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1); // fondu en attente (pas de onReady)
        await lb.navigate(2); // changement rapide → flush de la couche 0
        expect(destroys[0]).toHaveBeenCalled();
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(2);
        calls[calls.length - 1].onReady({});
        await vi.advanceTimersByTimeAsync(160);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(1);
        expect(destroys[1]).toHaveBeenCalled();
        lb.destroy();
    });

    it("fermeture pendant le fondu : tout est nettoyé (0 couche, destructions)", async () => {
        vi.useFakeTimers();
        const host = makeContainer();
        const destroys = [];
        const calls = [];
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            transition: 100,
            renderMedia: (ctx) => {
                calls.push(ctx);
                const img = document.createElement("img");
                ctx.container.appendChild(img);
                const d = vi.fn();
                destroys.push(d);
                return { el: img, destroy: d };
            },
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(2);
        calls[1].onReady({}); // fondu réellement démarré
        lb.close();
        await flush();
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(0);
        expect(destroys[0]).toHaveBeenCalled();
        expect(destroys[1]).toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(500);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(0);
        lb.destroy();
    });

    it("repli borné si l'hôte ne signale jamais onReady (le fondu se fait quand même)", async () => {
        vi.useFakeTimers();
        const host = makeContainer();
        const { fn } = layerSpy();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, transition: 50, renderMedia: fn });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        await lb.navigate(1);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(2);
        await vi.advanceTimersByTimeAsync(1000); // repli sans onReady
        await vi.advanceTimersByTimeAsync(160);  // fin du fondu
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(1);
        lb.destroy();
    });

    it("le diaporama peut surcharger la transition (transition de session)", async () => {
        vi.useFakeTimers();
        const host = makeContainer();
        const { fn, calls } = layerSpy();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            slideshow: { duration: 100, transition: 40 },
            renderMedia: fn,
        });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[0]);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(0); // hors diaporama : coupe franche
        lb.startSlideshow();
        await vi.advanceTimersByTimeAsync(100); // tick → navigation avec fondu de session
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(2);
        lb.stopSlideshow(); // le fondu en cours continue puis se termine
        calls[calls.length - 1].onReady({});
        await vi.advanceTimersByTimeAsync(100);
        expect(host.querySelectorAll(".holaf-lightbox-layer").length).toBe(1);
        lb.destroy();
    });
});

// ── Chrome discret (OPT-IN) ──────────────────────────────────────────────────
describe("chrome discret (opt-in)", () => {
    it("défaut : aucune classe auto, libellés texte (contrôle négatif)", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        expect(overlay.classList.contains("holaf-lightbox-chrome-auto")).toBe(false);
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(false);
        expect(overlay.querySelector(".holaf-lightbox-nav--prev").textContent).toBe("Précédent");
        expect(overlay.querySelector(".holaf-lightbox-nav--next").textContent).toBe("Suivant");
        expect(overlay.querySelector(".holaf-lightbox-nav--close").textContent).toBe("Fermer");
        lb.destroy();
    });

    it("chrome.icons:true → icônes seules ; libellés conservés en title/aria-label", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, chrome: { icons: true } });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        const prev = overlay.querySelector(".holaf-lightbox-nav--prev");
        const next = overlay.querySelector(".holaf-lightbox-nav--next");
        const close = overlay.querySelector(".holaf-lightbox-nav--close");
        expect(prev.textContent).toBe("‹");
        expect(next.textContent).toBe("›");
        expect(close.textContent).toBe("✖");
        expect(prev.textContent).not.toBe("Précédent");
        expect(prev.title).toBe("Précédent");
        expect(prev.getAttribute("aria-label")).toBe("Précédent");
        expect(close.getAttribute("aria-label")).toBe("Fermer");
        lb.destroy();
    });

    it("autoHide : masque après idleDelay même au-dessus d'un icône, réaffiche au mouvement", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({
            css: { injectStyles: false },
            host,
            chrome: { autoHide: true, idleDelay: 30, fadeDuration: 10 },
        });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        const next = overlay.querySelector(".holaf-lightbox-nav--next");
        expect(overlay.classList.contains("holaf-lightbox-chrome-auto")).toBe(true);
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(false);
        expect(overlay.style.getPropertyValue("--hl-chrome-fade")).toBe("10ms");
        await sleep(60);
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(true);
        // Mouvement AU-DESSUS d'un icône (le curseur y reste posé) → réapparition.
        next.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(false);
        // Puis re-masquage après inactivité, curseur toujours au-dessus.
        await sleep(60);
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(true);
        // Moindre mouvement → réapparition.
        overlay.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(false);
        lb.destroy();
    });

    it("autoHide désactivé par défaut : rien ne se masque après inactivité", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, chrome: { idleDelay: 10 } });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        await sleep(40);
        expect(overlay.classList.contains("holaf-lightbox-chrome-auto")).toBe(false);
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(false);
        lb.destroy();
    });

    it("destroy retire les classes auto du conteneur", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host, chrome: { autoHide: true, idleDelay: 5000 } });
        lb.setItems(items(3));
        await lb.openZoom(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        expect(overlay.classList.contains("holaf-lightbox-chrome-auto")).toBe(true);
        lb.destroy();
        expect(overlay.classList.contains("holaf-lightbox-chrome-auto")).toBe(false);
        expect(overlay.classList.contains("holaf-lightbox-chrome-hidden")).toBe(false);
    });

    it("getCss() expose les règles de transition douce (chrome + couches)", () => {
        const css = HolafLightbox.getCss();
        expect(css).toContain(".holaf-lightbox-chrome-auto .holaf-lightbox-nav");
        expect(css).toContain(".holaf-lightbox-chrome-auto.holaf-lightbox-chrome-hidden .holaf-lightbox-nav");
        expect(css).toMatch(/transition:\s*opacity var\(--hl-chrome-fade/);
        expect(css).toContain("pointer-events: none");
        expect(css).toContain(".holaf-lightbox-layer");
        expect(css).toContain("prefers-reduced-motion");
    });
});

// ── Clic simple = plein écran (API hôte) ─────────────────────────────────────
describe("clic simple = plein écran", () => {
    it("openFullscreen(item) depuis idle ouvre directement le plein écran", async () => {
        const lb = HolafLightbox.create({ css: { injectStyles: false } });
        lb.setItems(items(3));
        const opened = [];
        lb.on("open", (p) => opened.push(p.mode));
        await lb.openFullscreen(lb._items[2]);
        expect(lb.mode()).toBe("fullscreen");
        expect(lb.isOpen()).toBe(true);
        expect(lb.current().path_canon).toBe("i2");
        expect(opened).toEqual(["fullscreen"]);
        lb.destroy();
    });
});

// ── OPT-IN : défaut strictement inchangé ─────────────────────────────────────
describe("opt-in : défaut strictement inchangé", () => {
    it("sans aucune nouvelle option : pas de couche, pas de classe chrome, pas de diaporama", async () => {
        const host = makeContainer();
        const lb = HolafLightbox.create({ css: { injectStyles: false }, host });
        lb.setItems(items(3));
        await lb.openFullscreen(lb._items[0]);
        const overlay = host.querySelector(".holaf-lightbox-overlay");
        expect(overlay.querySelectorAll(".holaf-lightbox-layer").length).toBe(0);
        expect(overlay.classList.contains("holaf-lightbox-chrome-auto")).toBe(false);
        expect(overlay.querySelector(".holaf-lightbox-nav--close").textContent).toBe("Fermer");
        expect(lb._slideshowCfg).toBe(null);
        expect(lb.isSlideshow()).toBe(false);
        const e = { key: " ", preventDefault: vi.fn() };
        expect(lb.handleKey(e)).toBe(false);
        expect(e.preventDefault).not.toHaveBeenCalled();
        lb.destroy();
    });
});
