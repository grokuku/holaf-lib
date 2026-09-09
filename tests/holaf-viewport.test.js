/* Tests HolafViewport — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : fit/letterbox (content & headless), roundtrip coords, zoom-to-
 * cursor (identité du point sous curseur), clamps min/max/pan, double-clic,
 * events wheel/drag (synthétiques, listeners retirés via destroy), onChange,
 * headless vs content mode, refit sur resize (simulé).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HolafViewport } from "../js/holaf-viewport.js";

// ── Helpers de test ──────────────────────────────────────────────────────────
// Crée un conteneur 400x300 et (optionnellement) un contenu qui le remplit.
// Stub getBoundingClientRect (le harnais jsdom renvoie des zéros par défaut).
function makeContainer(width = 400, height = 300, withContent = true) {
    const container = document.createElement("div");
    container.style.width = width + "px";
    container.style.height = height + "px";
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({
        left: 0, top: 0, right: width, bottom: height,
        width, height, x: 0, y: 0, toJSON() {},
    });

    let content = null;
    if (withContent) {
        content = document.createElement("img");
        content.style.width = width + "px";
        content.style.height = height + "px";
        // offsetLeft/offsetTop sont des getters seuls en jsdom → on les stub.
        Object.defineProperty(content, "offsetLeft", { configurable: true, value: 0 });
        Object.defineProperty(content, "offsetTop", { configurable: true, value: 0 });
        // offsetWidth/offsetHeight (taille de layout) : la brique les lit en mode
        // content (pas getBoundingClientRect, transform-aware).
        Object.defineProperty(content, "offsetWidth", { configurable: true, value: width });
        Object.defineProperty(content, "offsetHeight", { configurable: true, value: height });
        content.getBoundingClientRect = () => ({
            left: 0, top: 0, right: width, bottom: height,
            width, height, x: 0, y: 0, toJSON() {},
        });
        container.appendChild(content);
    }
    return { container, content };
}

function wheel(container, deltaY, clientX, clientY) {
    const ev = new Event("wheel", { bubbles: true, cancelable: true });
    ev.deltaY = deltaY;
    ev.clientX = clientX;
    ev.clientY = clientY;
    container.dispatchEvent(ev);
}

function dblclick(container, clientX, clientY) {
    container.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true, cancelable: true, clientX, clientY,
    }));
}

function drag(target, fromX, fromY, toX, toY, button = 0) {
    target.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, clientX: fromX, clientY: fromY, button,
    }));
    window.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true, clientX: toX, clientY: toY,
    }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

// ── fit / letterbox ──────────────────────────────────────────────────────────
describe("fit / letterbox", () => {
    it("mode content : fit = scale 1, letterbox calculé à containScale", () => {
        // conteneur 400x300, image 800x400 → containScale = min(0.5, 0.75) = 0.5
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });

        expect(vp.getScale()).toBe(1);
        expect(vp.getFitScale()).toBe(1);
        // dispW = 800*0.5 = 400, dispH = 400*0.5 = 200, dy = (300-200)/2 = 50
        const rect = vp.getImageRect();
        expect(rect.x).toBe(0);
        expect(rect.y).toBe(50);
        expect(rect.width).toBe(400);
        expect(rect.height).toBe(200);
        // transform appliqué à l'img
        expect(content.style.transform).toBe("translate(0px, 0px) scale(1)");
        expect(content.style.transformOrigin).toBe("0 0");
    });

    it("mode headless : fit = containScale, image centrée dans le conteneur", () => {
        const { container } = makeContainer(400, 300, false);
        const vp = HolafViewport.create(container, {
            imageWidth: 800,
            imageHeight: 400,
        });

        expect(vp.getFitScale()).toBe(0.5);
        expect(vp.getScale()).toBe(0.5);
        const rect = vp.getImageRect();
        expect(rect.x).toBe(0); // (400 - 800*0.5)/2 = 0
        expect(rect.y).toBe(50); // (300 - 400*0.5)/2 = 50
        expect(rect.width).toBe(400);
        expect(rect.height).toBe(200);
    });
});

// ── roundtrip coords ─────────────────────────────────────────────────────────
describe("roundtrip coords", () => {
    it("screenToImage(imageToScreen(p)) === p (rect.left = 0)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.setScale(2.5, 120, 90);

        const pts = [
            [0, 0], [100, 50], [399, 299], [200, 150], [37, 211],
        ];
        for (const [ix, iy] of pts) {
            const s = vp.imageToScreen(ix, iy);
            const back = vp.screenToImage(s.x, s.y);
            expect(back.x).toBeCloseTo(ix, 6);
            expect(back.y).toBeCloseTo(iy, 6);
        }
    });
});

// ── zoom-to-cursor ───────────────────────────────────────────────────────────
describe("zoom-to-cursor", () => {
    it("le point image sous le curseur reste fixe après setScale", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            panClamp: false, // isole la géométrie zoom-to-cursor (le clamp est testé à part)
        });

        const cx = 100, cy = 80;
        const before = vp.screenToImage(cx, cy);
        vp.setScale(2, cx, cy);
        const after = vp.screenToImage(cx, cy);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
        expect(vp.getScale()).toBe(2);
    });

    it("zoomBy multiplie l'échelle par le facteur", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.zoomBy(1.1, 200, 150);
        expect(vp.getScale()).toBeCloseTo(1.1, 6);
    });
});

// ── clamps min / max / pan ───────────────────────────────────────────────────
describe("clamps", () => {
    it("minZoom='fit' interdit de dézoomer sous le fit", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.setScale(0.1);
        expect(vp.getScale()).toBe(1); // fit = 1 en mode content
    });

    it("minZoom numérique est respecté", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            minZoom: 2,
        });
        vp.setScale(0.5);
        expect(vp.getScale()).toBe(2);
    });

    it("maxZoom est respecté", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            maxZoom: 5,
        });
        vp.setScale(100);
        expect(vp.getScale()).toBe(5);
    });

    it("pan clampé : au fit le pan ne bouge pas, zoomé il reste dans la vue", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        // au fit (image ≤ vue) → centré, panBy ne fait rien
        vp.panBy(50, 50);
        expect(vp.getTransform().tx).toBe(0);
        expect(vp.getTransform().ty).toBe(0);

        // zoomé : image 800x400*2 = 1600x800 > vue → pan borné
        vp.setScale(2, 200, 150);
        vp.panBy(-500, -500);
        const t = vp.getTransform();
        // tx ∈ [cw - w, 0] = [400-1600, 0] = [-1200, 0]
        expect(t.tx).toBeGreaterThanOrEqual(-1200);
        expect(t.tx).toBeLessThanOrEqual(0);
        expect(t.ty).toBeGreaterThanOrEqual(-900);
        expect(t.ty).toBeLessThanOrEqual(0);
    });
});

// ── double-clic ─────────────────────────────────────────────────────────────
describe("double-clic", () => {
    it("dblclick zoome de zoomFactor² autour du curseur", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            panClamp: false, // isole la géométrie zoom-to-cursor
        });
        const before = vp.screenToImage(150, 120);
        dblclick(container, 150, 120);
        expect(vp.getScale()).toBeCloseTo(1.1 * 1.1, 6);
        const after = vp.screenToImage(150, 120);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.y).toBeCloseTo(before.y, 6);
    });

    it("doubleClickZoom:false désactive le dblclick", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            doubleClickZoom: false,
        });
        dblclick(container, 150, 120);
        expect(vp.getScale()).toBe(1);
    });
});

// ── events wheel / drag ─────────────────────────────────────────────────────
describe("events wheel / drag", () => {
    it("wheel zoome (deltaY<0 → zoom avant)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        wheel(container, -100, 200, 150);
        expect(vp.getScale()).toBeCloseTo(1.1, 6);
        wheel(container, 100, 200, 150);
        expect(vp.getScale()).toBeCloseTo(1, 6);
    });

    it("wheel:false désactive le zoom molette", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            wheel: false,
        });
        wheel(container, -100, 200, 150);
        expect(vp.getScale()).toBe(1);
    });

    it("drag panne (bouton gauche) et transition none pendant le drag", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.setScale(2, 200, 150); // zoomé pour pouvoir paner
        const before = vp.getTransform();
        drag(content, 200, 150, 260, 190);
        const t = vp.getTransform();
        expect(t.tx).toBeCloseTo(before.tx + 60, 6);
        expect(t.ty).toBeCloseTo(before.ty + 40, 6);
        // transition restituée après relâchement
        expect(content.style.transition).toBe("transform .2s ease-out");
    });

    it("dragButton différent de 0 ne déclenche pas le pan", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            dragButton: 2,
        });
        vp.setScale(2, 200, 150);
        const before = vp.getTransform();
        drag(content, 200, 150, 260, 190, 0); // bouton 0 ≠ 2
        expect(vp.getTransform().tx).toBe(before.tx);
    });

    it("destroy retire les listeners (wheel ne fait plus rien)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.destroy();
        wheel(container, -100, 200, 150);
        expect(vp.getScale()).toBe(1);
    });
});

// ── onChange ────────────────────────────────────────────────────────────────
describe("onChange", () => {
    it("est appelé après zoom, pan, fit et setImageSize", () => {
        const { container, content } = makeContainer(400, 300, true);
        const onChange = vi.fn();
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            onChange,
        });
        onChange.mockClear();

        vp.setScale(2, 200, 150);
        expect(onChange).toHaveBeenCalledTimes(1);
        vp.panBy(10, 10);
        expect(onChange).toHaveBeenCalledTimes(2);
        vp.fit();
        expect(onChange).toHaveBeenCalledTimes(3);
        vp.setImageSize(400, 200);
        expect(onChange).toHaveBeenCalledTimes(4);
        expect(onChange).toHaveBeenLastCalledWith(vp);
    });

    it("un onChange qui jette ne casse pas la brique (le reste fonctionne)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const onChange = vi.fn(() => { throw new Error("boom"); });
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            onChange,
        });
        // create() appelle fit() → notify() → onChange jette → ne doit pas remonter.
        expect(() => vp.setScale(2, 200, 150)).not.toThrow();
        expect(vp.getScale()).toBe(2);
        expect(() => vp.panBy(10, 10)).not.toThrow();
        expect(() => vp.fit()).not.toThrow();
        expect(vp.getScale()).toBe(1);
    });
});

// ── multi-subscription on/off ───────────────────────────────────────────────
describe("on/off (multi-subscription)", () => {
    it("on(cb) est appelé après chaque changement, en plus de onChange", () => {
        const { container, content } = makeContainer(400, 300, true);
        const onChange = vi.fn();
        const cb = vi.fn();
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
            onChange,
        });
        vp.on(cb);
        onChange.mockClear();
        cb.mockClear();

        vp.setScale(2, 200, 150);
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenLastCalledWith(vp);
        expect(onChange).toHaveBeenCalledTimes(1);

        vp.panBy(10, 10);
        expect(cb).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("off(cb) retire l'abonné (plus d'appels)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const cb = vi.fn();
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.on(cb);
        vp.setScale(2, 200, 150);
        expect(cb).toHaveBeenCalledTimes(1);

        vp.off(cb);
        vp.setScale(3, 200, 150);
        expect(cb).toHaveBeenCalledTimes(1); // pas d'appel supplémentaire
    });

    it("plusieurs abonnés indépendants (on/off ne se marchent pas dessus)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const a = vi.fn();
        const b = vi.fn();
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.on(a);
        vp.on(b);
        vp.setScale(2, 200, 150);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);

        vp.off(a);
        vp.setScale(3, 200, 150);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(2);
    });

    it("on() ignore les non-fonctions sans erreur", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        expect(() => vp.on(null)).not.toThrow();
        expect(() => vp.on(42)).not.toThrow();
        vp.setScale(2, 200, 150);
        expect(vp.getScale()).toBe(2);
    });
});

// ── followers ────────────────────────────────────────────────────────────────
// Les followers reçoivent EXACTEMENT le même transform inline que le content
// (même string, même moment, même transition) — utilisés pour des overlays
// (canvas) qui doivent suivre l'image au pixel près.
describe("followers", () => {
    it("addFollower : le follower reçoit le même transform que le content après zoom/pan/drag", () => {
        const { container, content } = makeContainer(400, 300, true);
        const follower = document.createElement("canvas");
        container.appendChild(follower);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.addFollower(follower);

        // au fit (create) : même transform
        expect(follower.style.transform).toBe(content.style.transform);
        expect(follower.style.transform).toBe("translate(0px, 0px) scale(1)");

        // zoom
        vp.setScale(2, 200, 150);
        expect(follower.style.transform).toBe(content.style.transform);
        expect(follower.style.transform).toContain("scale(2)");

        // pan
        vp.panBy(10, 20);
        expect(follower.style.transform).toBe(content.style.transform);

        // drag (transition none pendant, .2s après)
        vp.setScale(2, 200, 150);
        drag(content, 200, 150, 260, 190);
        expect(follower.style.transform).toBe(content.style.transform);
        expect(follower.style.transition).toBe("transform .2s ease-out");
    });

    it("transition synchronisée : none pendant le drag, .2s après — identique au content", () => {
        const { container, content } = makeContainer(400, 300, true);
        const follower = document.createElement("canvas");
        container.appendChild(follower);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.addFollower(follower);
        vp.setScale(2, 200, 150);

        // pendant le drag : transition none sur les deux
        content.dispatchEvent(new MouseEvent("mousedown", {
            bubbles: true, cancelable: true, clientX: 200, clientY: 150, button: 0,
        }));
        expect(content.style.transition).toBe("none");
        expect(follower.style.transition).toBe("none");
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        expect(content.style.transition).toBe("transform .2s ease-out");
        expect(follower.style.transition).toBe("transform .2s ease-out");
    });

    it("removeFollower stoppe la synchro (le follower ne bouge plus)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const follower = document.createElement("canvas");
        container.appendChild(follower);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.addFollower(follower);
        vp.setScale(2, 200, 150);
        const frozen = follower.style.transform;

        vp.removeFollower(follower);
        vp.setScale(3, 200, 150);
        expect(follower.style.transform).toBe(frozen); // inchangé
        expect(content.style.transform).toContain("scale(3)");
    });

    it("addFollower ignore les non-éléments et les doublons", () => {
        const { container, content } = makeContainer(400, 300, true);
        const follower = document.createElement("canvas");
        container.appendChild(follower);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        expect(() => vp.addFollower(null)).not.toThrow();
        expect(() => vp.addFollower(42)).not.toThrow();
        expect(() => vp.addFollower("x")).not.toThrow();
        // doublon : ajouté deux fois → un seul follower (Set), pas d'erreur
        vp.addFollower(follower);
        vp.addFollower(follower);
        vp.setScale(2, 200, 150);
        expect(follower.style.transform).toBe(content.style.transform);
    });

    it("destroy retire les refs followers (l'élément reste dans son état)", () => {
        const { container, content } = makeContainer(400, 300, true);
        const follower = document.createElement("canvas");
        container.appendChild(follower);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.addFollower(follower);
        vp.setScale(2, 200, 150);
        const frozen = follower.style.transform;
        vp.destroy();
        // destroy ne touche pas au follower (laisse son état), retire juste la ref
        expect(follower.style.transform).toBe(frozen);
    });
});

// ── headless vs content ─────────────────────────────────────────────────────
describe("headless vs content", () => {
    it("headless ne touche à aucun élément et expose la géométrie", () => {
        const { container } = makeContainer(400, 300, false);
        const vp = HolafViewport.create(container, {
            imageWidth: 800,
            imageHeight: 400,
        });
        expect(vp.getFitScale()).toBe(0.5);
        expect(vp.getScale()).toBe(0.5);
        // pas de content → pas de transform
        expect(container.style.transform).toBe("");
    });

    it("setImageSize recalcule le fit", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, { content });
        vp.setImageSize(800, 400);
        expect(vp.getScale()).toBe(1);
        const rect = vp.getImageRect();
        expect(rect.width).toBe(400);
        expect(rect.height).toBe(200);
    });
});

// ── refit sur resize ────────────────────────────────────────────────────────
describe("refit sur resize", () => {
    it("au fit → refit() recadre sur la nouvelle taille", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        // on simule un resize : le conteneur devient 800x300
        container.getBoundingClientRect = () => ({
            left: 0, top: 0, right: 800, bottom: 300,
            width: 800, height: 300, x: 0, y: 0, toJSON() {},
        });
        content.getBoundingClientRect = () => ({
            left: 0, top: 0, right: 800, bottom: 300,
            width: 800, height: 300, x: 0, y: 0, toJSON() {},
        });
        // la taille de layout suit aussi le resize (offsetWidth/Height)
        Object.defineProperty(content, "offsetWidth", { configurable: true, value: 800 });
        Object.defineProperty(content, "offsetHeight", { configurable: true, value: 300 });
        vp.refit();
        // containScale = min(800/800, 300/400) = 0.75 ; fit = 1 (content)
        expect(vp.getScale()).toBe(1);
        const rect = vp.getImageRect();
        expect(rect.width).toBe(800 * 0.75); // 600
        expect(rect.height).toBe(400 * 0.75); // 300
    });

    it("zoomé → refit() re-clampe le pan sans changer le zoom", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        vp.setScale(2, 200, 150);
        const scaleBefore = vp.getScale();
        vp.panBy(1000, 1000); // pousse le pan hors bornes
        vp.refit();
        expect(vp.getScale()).toBe(scaleBefore);
        const t = vp.getTransform();
        expect(t.tx).toBeLessThanOrEqual(0);
        expect(t.ty).toBeLessThanOrEqual(0);
    });

    it("refit après zoom : géométrie correcte malgré un getBoundingClientRect transformé", () => {
        const { container, content } = makeContainer(400, 300, true);
        const vp = HolafViewport.create(container, {
            content,
            imageWidth: 800,
            imageHeight: 400,
        });
        // Simule l'état zoomé : getBoundingClientRect renvoie la taille transformée
        // (scale 2 → 800x600), alors que la taille de layout (offsetWidth/Height)
        // reste 400x300. Le bug lisait getBoundingClientRect → containScale corrompu.
        content.getBoundingClientRect = () => ({
            left: 0, top: 0, right: 800, bottom: 600,
            width: 800, height: 600, x: 0, y: 0, toJSON() {},
        });
        vp.setScale(2, 200, 150);
        vp.refit();
        // containScale doit rester 0.5 (taille de layout), pas 1 (taille transformée).
        expect(vp.getScale()).toBe(2);
        const rect = vp.getImageRect();
        expect(rect.width).toBe(800 * 0.5 * 2); // 800
        expect(rect.height).toBe(400 * 0.5 * 2); // 400
    });
});
