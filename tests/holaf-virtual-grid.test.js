/* Tests HolafGrid — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : layout (colonnes/gap/aspect/itemSize number|var|fonction),
 * bornes de fenêtre + buffer, translate, pools (réutilisation, spy
 * createElement), squelettes de source creuse, resize avec ancrage de rangée,
 * sélection mono/shift/ctrl/checkbox, navigation clavier, onActivate
 * (dblclick/action/clavier), délégation d'événements, refresh/markPending,
 * destroy (listeners retirés, style injecté nettoyé), instances multiples,
 * getCss()/injectStyles.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HolafGrid } from "../js/holaf-virtual-grid.js";

// ── Harnais : jsdom renvoie 0 pour clientWidth/Height et scrollTop non borné —
// on stubbe la géométrie du conteneur (clientWidth/clientHeight/scrollTop +
// getBoundingClientRect) sinon aucun layout ne peut être calculé.
function makeContainer(width = 1000, height = 400) {
    const c = document.createElement("div");
    document.body.appendChild(c);
    let scrollTop = 0;
    Object.defineProperty(c, "clientWidth", { configurable: true, get: () => width });
    Object.defineProperty(c, "clientHeight", { configurable: true, get: () => height });
    Object.defineProperty(c, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set: (v) => { scrollTop = Math.max(0, v); },
    });
    c.getBoundingClientRect = () => ({
        left: 0, top: 0, right: width, bottom: height,
        width, height, x: 0, y: 0, toJSON() {},
    });
    c._setSize = (w, h) => {
        Object.defineProperty(c, "clientWidth", { configurable: true, get: () => w });
        Object.defineProperty(c, "clientHeight", { configurable: true, get: () => h });
    };
    return c;
}

// Renderer de cellule de test : compte les appels et affiche un libellé.
function makeCell() {
    const calls = { create: 0, update: 0, release: 0 };
    const cell = {
        create() {
            calls.create += 1;
            const el = document.createElement("div");
            el.className = "test-cell";
            return el;
        },
        update(el, item) {
            calls.update += 1;
            el.textContent = item ? String(item.label) : "";
        },
        release() {
            calls.release += 1;
        },
    };
    return { calls, cell };
}

function makeItems(n, prefix = "i") {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ id: prefix + i, label: prefix + i });
    return out;
}

function makeGrid(container, opts) {
    opts = opts || {};
    const renderer = opts.renderer || makeCell();
    const grid = HolafGrid.create(container, Object.assign({
        itemSize: 100,
        gap: 0,
        aspect: 1,
        getId: (it) => it.id,
        cell: renderer.cell,
        css: { injectStyles: false },
    }, opts.options || {}));
    if (opts.items) grid.setItems(opts.items);
    else grid.render(true);
    return { grid, renderer };
}

afterEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => s.remove());
    vi.restoreAllMocks();
});

// ── Création ────────────────────────────────────────────────────────────────
describe("création", () => {
    it("exige un conteneur DOM", () => {
        expect(() => HolafGrid.create(null, {})).toThrow();
    });

    it("expose version + getCss non vide", () => {
        expect(HolafGrid.version).toBe("0.1.0");
        expect(typeof HolafGrid.getCss()).toBe("string");
        expect(HolafGrid.getCss().length).toBeGreaterThan(0);
    });

    it("construit racine + sizer + surface dans le conteneur", () => {
        const c = makeContainer();
        const { grid } = makeGrid(c);
        expect(c.querySelector(".holaf-grid-root")).toBeTruthy();
        expect(grid.sizer.className).toContain("holaf-grid-sizer");
        expect(grid.surface.className).toContain("holaf-grid-surface");
    });
});

// ── Layout ──────────────────────────────────────────────────────────────────
describe("layout", () => {
    it("calcule les colonnes selon largeur/gap/itemSize", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { options: { itemSize: 100, gap: 0 } });
        // (1000+0)/(100+0) = 10
        expect(grid.getColumnCount()).toBe(10);
    });

    it("calcule itemWidth/itemHeight avec gap", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { options: { itemSize: 100, gap: 10 } });
        // colonnes = floor((1000+10)/110) = 9
        expect(grid.getColumnCount()).toBe(9);
        // itemWidth = (1000 - 8*10)/9 = 920/9
        expect(grid._itemWidth).toBeCloseTo(920 / 9, 5);
        expect(grid._itemHeight).toBeCloseTo(920 / 9, 5);
    });

    it("sizer.height = rangées × (h + gap)", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { items: makeItems(25), options: { itemSize: 100, gap: 0 } });
        // 25 items / 10 colonnes = 3 rangées ; h=100 ; 300px
        expect(grid.sizer.style.height).toBe("300px");
    });

    it("aspect 16/9 réduit la hauteur d'item", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { items: makeItems(5), options: { itemSize: 100, gap: 0, aspect: 16 / 9 } });
        expect(grid._itemWidth).toBe(100);
        expect(grid._itemHeight).toBeCloseTo(100 / (16 / 9), 5);
    });

    it("gap 'auto' absent du CSS → repli 8", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { items: makeItems(5), options: { itemSize: 100, gap: "auto" } });
        expect(grid._gap).toBe(8);
    });

    it("itemSize via variable CSS ['--hl-x', 150] lit la variable", () => {
        const c = makeContainer(1000, 400);
        c.style.setProperty("--hl-thumb-size", "250px");
        const { grid } = makeGrid(c, {
            items: makeItems(5),
            options: { itemSize: ["--hl-thumb-size", 150], gap: 0 },
        });
        // (1000+0)/(250+0) = 4
        expect(grid.getColumnCount()).toBe(4);
    });

    it("itemSize via fonction (taille dynamique)", () => {
        const c = makeContainer(1000, 400);
        let size = 100;
        const { grid } = makeGrid(c, {
            items: makeItems(5),
            options: { itemSize: () => size, gap: 0 },
        });
        expect(grid.getColumnCount()).toBe(10);
        size = 200;
        grid.render(true);
        expect(grid.getColumnCount()).toBe(5);
    });

    it("relayout(override) change la taille d'item", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { items: makeItems(5), options: { itemSize: 100, gap: 0 } });
        grid.relayout(200);
        expect(grid.getColumnCount()).toBe(5);
    });
});

// ── Rendu virtualisé ────────────────────────────────────────────────────────
describe("rendu virtualisé", () => {
    it("ne rend que la fenêtre visible + buffer", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10000), options: { itemSize: 100, gap: 0 } });
        expect(grid.getColumnCount()).toBe(4);
        // bien moins que 10000
        expect(grid.surface.children.length).toBeGreaterThan(0);
        expect(grid.surface.children.length).toBeLessThan(80);
    });

    it("rend vide quand la source est vide", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: [] });
        expect(grid.surface.children.length).toBe(0);
        expect(grid.sizer.style.height).toBe("0px");
    });

    it("translate correct pour une cellule", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10), options: { itemSize: 100, gap: 0 } });
        // index 1 → col 1 → translate(100px, 0px)
        const el = grid.surface.querySelector('[data-holaf-index="1"]');
        expect(el).toBeTruthy();
        expect(el.style.transform).toBe("translate(100px, 0px)");
        expect(el.style.width).toBe("100px");
        expect(el.style.height).toBe("100px");
    });

    it("pose dataset.index (compat sélecteurs hôtes)", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10) });
        const el = grid.surface.querySelector('[data-holaf-index="0"]');
        expect(el.dataset.index).toBe("0");
        expect(el.dataset.holafId).toBe("i0");
    });

    it("crée des squelettes pour les trous d'une source creuse (setCount)", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c);
        grid.setCount(6);
        const skels = grid.surface.querySelectorAll(".holaf-grid-skeleton");
        expect(skels.length).toBe(6);
    });

    it("setSource(collection-like) adapte at/total", () => {
        const c = makeContainer(400, 300);
        const items = makeItems(30);
        const { grid } = makeGrid(c, { options: { itemSize: 100, gap: 0 } });
        grid.setSource({ at: (i) => items[i], total: 30 });
        expect(grid.getColumnCount()).toBe(4);
        expect(grid.surface.children.length).toBeGreaterThan(0);
    });

    it("onVisibleRange reçoit start/end/ids de la fenêtre stricte", () => {
        const c = makeContainer(400, 300);
        const seen = vi.fn();
        const { grid } = makeGrid(c, {
            items: makeItems(100),
            options: { itemSize: 100, gap: 0, onVisibleRange: seen },
        });
        expect(seen).toHaveBeenCalled();
        const last = seen.mock.calls[seen.mock.calls.length - 1];
        expect(last[0]).toBe(0);
        expect(Array.isArray(last[2])).toBe(true);
        expect(last[2][0]).toBe("i0");
    });
});

// ── Pools ───────────────────────────────────────────────────────────────────
describe("pools", () => {
    it("réutilise les cellules (pas de create en plus au retour de scroll)", () => {
        const c = makeContainer(400, 300);
        const { grid, renderer } = makeGrid(c, { items: makeItems(500), options: { itemSize: 100, gap: 0 } });
        expect(renderer.calls.create).toBeGreaterThan(0);

        c.scrollTop = 10000; // saute très loin → éviction + pool
        grid.render();
        const afterFar = renderer.calls.create;

        c.scrollTop = 0;      // revient → réutilise le pool (aucun create en plus)
        grid.render();
        expect(renderer.calls.create).toBe(afterFar);
    });

    it("render(true) reconstruit et rappelle update", () => {
        const c = makeContainer(400, 300);
        const { grid, renderer } = makeGrid(c, { items: makeItems(50) });
        const before = renderer.calls.update;
        grid.render(true);
        expect(renderer.calls.update).toBeGreaterThan(before);
    });
});

// ── Resize ──────────────────────────────────────────────────────────────────
describe("resize", () => {
    it("recalcule les colonnes après changement de largeur", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { items: makeItems(50), options: { itemSize: 100, gap: 0 } });
        expect(grid.getColumnCount()).toBe(10);
        c._setSize(500, 400);
        grid._handleResize();
        expect(grid.getColumnCount()).toBe(5);
    });

    it("conserve la rangée du haut après resize", () => {
        const c = makeContainer(1000, 400);
        const { grid } = makeGrid(c, { items: makeItems(500), options: { itemSize: 100, gap: 0 } });
        c.scrollTop = 250; // rangée 2 → topIndex 20
        c._setSize(500, 400);
        grid._handleResize();
        // nouvelle rangée = floor(20/5)=4 → scrollTop = 400
        expect(c.scrollTop).toBe(400);
    });
});

// ── Sélection ───────────────────────────────────────────────────────────────
function clickCell(grid, index, mods = {}) {
    const el = grid.surface.querySelector(`[data-holaf-index="${index}"]`);
    el.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true,
        shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta,
    }));
    return el;
}

describe("sélection", () => {
    it("clic simple = mono-sélection", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(20) });
        clickCell(grid, 2);
        expect(grid.selection.ids()).toEqual(["i2"]);
        expect(grid.selection.anchor()).toBe(2);
    });

    it("ctrl+clic = toggle", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(20) });
        clickCell(grid, 2);
        clickCell(grid, 5, { ctrl: true });
        expect(grid.selection.ids().sort()).toEqual(["i2", "i5"]);
        clickCell(grid, 5, { ctrl: true });
        expect(grid.selection.ids()).toEqual(["i2"]);
    });

    it("shift+clic = plage depuis l'ancre", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(20) });
        clickCell(grid, 2);
        clickCell(grid, 5, { shift: true });
        expect(grid.selection.ids()).toEqual(["i2", "i3", "i4", "i5"]);
    });

    it("clic sur la checkbox = toggle", () => {
        const c = makeContainer(400, 300);
        const renderer = makeCell();
        const cell = renderer.cell;
        const originalUpdate = cell.update;
        cell.update = (el, item, ctx) => {
            originalUpdate(el, item, ctx);
            if (!el.querySelector("input")) {
                const cb = document.createElement("input");
                cb.type = "checkbox";
                el.appendChild(cb);
            }
        };
        const { grid } = makeGrid(c, { items: makeItems(20), renderer });
        const el = grid.surface.querySelector('[data-holaf-index="1"]');
        el.querySelector("input").dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(grid.selection.ids()).toEqual(["i1"]);
    });

    it("onSelectionChange reçoit ids + items", () => {
        const c = makeContainer(400, 300);
        const cb = vi.fn();
        const { grid } = makeGrid(c, { items: makeItems(10), options: { onSelectionChange: cb } });
        clickCell(grid, 3);
        expect(cb).toHaveBeenCalled();
        expect(cb.mock.calls[0][0]).toEqual(["i3"]);
        expect(cb.mock.calls[0][1][0].id).toBe("i3");
    });

    it("selection.toggle/resolve", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10) });
        grid.selection.toggle("i4");
        expect(grid.selection.ids()).toEqual(["i4"]);
        expect(grid.selection.items()[0].id).toBe("i4");
    });

    it("selection.set(ids, {silent}) n'appelle pas onSelectionChange", () => {
        const c = makeContainer(400, 300);
        const cb = vi.fn();
        const { grid } = makeGrid(c, { items: makeItems(10), options: { onSelectionChange: cb } });
        grid.selection.set(["i1", "i2"], { silent: true });
        expect(grid.selection.ids().sort()).toEqual(["i1", "i2"]);
        expect(cb).not.toHaveBeenCalled();
    });

    it("selection.clear vide la sélection", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10) });
        clickCell(grid, 1);
        grid.selection.clear();
        expect(grid.selection.ids()).toEqual([]);
    });

    it("selectable:false désactive la sélection au clic", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10), options: { selectable: false } });
        clickCell(grid, 1);
        expect(grid.selection.ids()).toEqual([]);
    });
});

// ── Clavier ─────────────────────────────────────────────────────────────────
describe("navigation clavier", () => {
    function key(grid, k) {
        const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
        return grid.selection.handleKey(e);
    }

    it("ArrowRight avance de +1", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(50) });
        grid.selection.setAnchor(0);
        key(grid, "ArrowRight");
        expect(grid.selection.anchor()).toBe(1);
    });

    it("ArrowDown avance de +colonnes", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(50), options: { itemSize: 100, gap: 0 } });
        grid.selection.setAnchor(0);
        key(grid, "ArrowDown");
        expect(grid.selection.anchor()).toBe(grid.getColumnCount());
    });

    it("Home/End", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(50) });
        grid.selection.setAnchor(10);
        key(grid, "Home");
        expect(grid.selection.anchor()).toBe(0);
        key(grid, "End");
        expect(grid.selection.anchor()).toBe(49);
    });

    it("Espace bascule la sélection de l'index actif", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(50) });
        clickCell(grid, 3); // sélectionne i3, actif = 3
        key(grid, "ArrowRight"); // actif = 4
        key(grid, " "); // toggle i4
        expect(grid.selection.ids()).toContain("i4");
    });

    it("Entrée → onActivate kind 'activate'", () => {
        const c = makeContainer(400, 300);
        const activate = vi.fn();
        const { grid } = makeGrid(c, { items: makeItems(50), options: { onActivate: activate } });
        grid.selection.setAnchor(0);
        key(grid, "ArrowRight");
        key(grid, "Enter");
        expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }), 1, "activate");
    });

    it("touche inconnue → false", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(5) });
        expect(key(grid, "F5")).toBe(false);
    });

    it("canHandleKey:false bloque la touche", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, {
            items: makeItems(50),
            options: { canHandleKey: () => false },
        });
        grid.selection.setAnchor(0);
        grid._handleKey(new KeyboardEvent("keydown", { key: "ArrowRight" }));
        expect(grid.selection.anchor()).toBe(0);
    });
});

// ── Activation / actions ────────────────────────────────────────────────────
describe("activation & actions", () => {
    it("dblclick → onActivate kind 'dblclick'", () => {
        const c = makeContainer(400, 300);
        const activate = vi.fn();
        const { grid } = makeGrid(c, { items: makeItems(10), options: { onActivate: activate } });
        const el = grid.surface.querySelector('[data-holaf-index="2"]');
        el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: "i2" }), 2, "dblclick");
    });

    it("data-holaf-action → onAction (et pas de sélection)", () => {
        const c = makeContainer(400, 300);
        const onAction = vi.fn();
        const renderer = makeCell();
        const baseUpdate = renderer.cell.update;
        renderer.cell.update = (el, item, ctx) => {
            baseUpdate(el, item, ctx);
            if (!el.querySelector(".act")) {
                const a = document.createElement("span");
                a.className = "act";
                a.setAttribute("data-holaf-action", "zoom");
                el.appendChild(a);
            }
        };
        const { grid } = makeGrid(c, { items: makeItems(10), renderer, options: { onAction } });
        const el = grid.surface.querySelector('[data-holaf-index="1"]');
        el.querySelector(".act").dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(onAction).toHaveBeenCalledWith("zoom", expect.objectContaining({ id: "i1" }), 1, expect.anything());
        expect(grid.selection.ids()).toEqual([]);
    });

    it("dblclick sur une action est ignoré", () => {
        const c = makeContainer(400, 300);
        const activate = vi.fn();
        const renderer = makeCell();
        const baseUpdate = renderer.cell.update;
        renderer.cell.update = (el, item, ctx) => {
            baseUpdate(el, item, ctx);
            if (!el.querySelector(".act")) {
                const a = document.createElement("span");
                a.className = "act";
                a.setAttribute("data-holaf-action", "zoom");
                el.appendChild(a);
            }
        };
        const { grid } = makeGrid(c, { items: makeItems(10), renderer, options: { onActivate: activate } });
        const el = grid.surface.querySelector('[data-holaf-index="1"]');
        el.querySelector(".act").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(activate).not.toHaveBeenCalled();
    });
});

// ── refresh / markPending ───────────────────────────────────────────────────
describe("refresh & pending", () => {
    it("refresh(id) rappelle update avec refresh:true", () => {
        const c = makeContainer(400, 300);
        let sawRefresh = false;
        const renderer = makeCell();
        const baseUpdate = renderer.cell.update;
        renderer.cell.update = (el, item, ctx) => { if (ctx.refresh) sawRefresh = true; baseUpdate(el, item, ctx); };
        const { grid } = makeGrid(c, { items: makeItems(10), renderer });
        grid.refresh("i2");
        expect(sawRefresh).toBe(true);
    });

    it("markPending pose la classe puis la retire après ms", () => {
        vi.useFakeTimers();
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10) });
        grid.markPending("i1", 500);
        const el = grid.surface.querySelector('[data-holaf-index="1"]');
        expect(el.classList.contains("holaf-grid-cell--pending")).toBe(true);
        vi.advanceTimersByTime(600);
        expect(el.classList.contains("holaf-grid-cell--pending")).toBe(false);
        vi.useRealTimers();
    });
});

// ── Scroll ──────────────────────────────────────────────────────────────────
describe("scroll / alignement", () => {
    it("scrollToIndex align start", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(100), options: { itemSize: 100, gap: 0 } });
        grid.scrollToIndex(40, { align: "start" }); // rangée 10 → 1000
        expect(c.scrollTop).toBe(1000);
    });

    it("scrollToIndex align nearest ne bouge pas si déjà visible", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(100), options: { itemSize: 100, gap: 0 } });
        c.scrollTop = 0;
        grid.scrollToIndex(0, { align: "nearest" });
        expect(c.scrollTop).toBe(0);
    });

    it("ensureVisible = nearest", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(100), options: { itemSize: 100, gap: 0 } });
        grid.ensureVisible(30); // rangée 7 → 700 - (300-100) = 500
        expect(c.scrollTop).toBe(500);
    });
});

// ── destroy / CSS / instances ───────────────────────────────────────────────
describe("destroy & instances", () => {
    it("destroy retire les listeners (clic inopérant après)", () => {
        const c = makeContainer(400, 300);
        const { grid } = makeGrid(c, { items: makeItems(10) });
        grid.destroy();
        expect(c.querySelector(".holaf-grid-root")).toBeFalsy();
        // recréer un clic ne doit pas jeter
        expect(() => c.dispatchEvent(new MouseEvent("click", { bubbles: true }))).not.toThrow();
    });

    it("injectStyles:false → aucun <style> injecté, getCss() non vide", () => {
        const c = makeContainer();
        makeGrid(c, { items: makeItems(3) });
        expect(document.getElementById("holaf-grid-style")).toBeFalsy();
        expect(HolafGrid.getCss().length).toBeGreaterThan(0);
    });

    it("injectStyles (défaut) → <style> injecté puis retiré au destroy", () => {
        const c = makeContainer();
        const { grid } = makeGrid(c, { items: makeItems(3), options: { css: { injectStyles: true } } });
        expect(document.getElementById("holaf-grid-style")).toBeTruthy();
        grid.destroy();
        expect(document.getElementById("holaf-grid-style")).toBeFalsy();
    });

    it("instances multiples indépendantes (états isolés)", () => {
        const c1 = makeContainer(400, 300);
        const c2 = makeContainer(400, 300);
        const { grid: g1 } = makeGrid(c1, { items: makeItems(10, "a") });
        const { grid: g2 } = makeGrid(c2, { items: makeItems(10, "b") });
        clickCell(g1, 0);
        expect(g1.selection.ids()).toEqual(["a0"]);
        expect(g2.selection.ids()).toEqual([]);
        g1.destroy();
        expect(c2.querySelector(".holaf-grid-root")).toBeTruthy();
    });
});
