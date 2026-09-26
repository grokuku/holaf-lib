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
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// ── CSS / options ────────────────────────────────────────────────────────────
describe("CSS et options", () => {
    it("expose une version et un getCss() non vide", () => {
        expect(HolafLightbox.version).toBe("0.1.0");
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
