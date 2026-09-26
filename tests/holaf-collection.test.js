// Tests — brique HolafCollection (cœur de données pur, sans DOM).
// Runner vitest/jsdom. La brique ne touche pas au DOM : ces tests sont purs.
import { describe, it, expect, vi } from "vitest";
import { HolafCollection, MASS_REMOVAL_THRESHOLD, VERSION } from "../js/holaf-collection.js";

/** Fabrique d'items : id `${prefix}${i}`, tri DESC via `sort`. */
function makeItems(prefix, count, baseSort = 1000) {
    const arr = [];
    for (let i = 0; i < count; i++) arr.push({ id: `${prefix}${i}`, sort: baseSort - i });
    return arr;
}

/**
 * fetchPage factice qui renvoie `count` items par fenêtre et déduplique par
 * offset. `spy()` expose les appels.
 */
function pagedFetch(total = 1000, perPage = null) {
    const calls = [];
    const fn = vi.fn(async ({ offset, limit, page }) => {
        calls.push({ offset, limit, page });
        return { items: makeItems(`p${offset}_`, perPage == null ? limit : perPage), total };
    });
    fn.calls = calls;
    return fn;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("create / valeurs par défaut", () => {
    it("expose la version et le seuil statique", () => {
        expect(VERSION).toBe("0.1.0");
        expect(HolafCollection.VERSION).toBe("0.1.0");
        expect(HolafCollection.MASS_REMOVAL_THRESHOLD).toBe(100);
        expect(MASS_REMOVAL_THRESHOLD).toBe(100);
    });

    it("pageSize par défaut = 200, mode par défaut = window", () => {
        const c = HolafCollection.create();
        expect(c.pageSize).toBe(200);
        expect(c.mode).toBe("window");
        expect(c.total).toBe(0);
        expect(c.length).toBe(0);
    });

    it("pageSize custom et mode append", () => {
        const c = HolafCollection.create({ pageSize: 60, mode: "append" });
        expect(c.pageSize).toBe(60);
        expect(c.mode).toBe("append");
    });

    it("pageSize invalide retombe sur 200", () => {
        expect(HolafCollection.create({ pageSize: 0 }).pageSize).toBe(200);
        expect(HolafCollection.create({ pageSize: -5 }).pageSize).toBe(200);
        expect(HolafCollection.create({ pageSize: NaN }).pageSize).toBe(200);
    });

    it("getId par défaut = item.id", () => {
        const c = HolafCollection.create({ pageSize: 4 });
        c.setWindow(0, [{ id: 7 }, { id: 8 }]);
        expect(c.ids(0, 2)).toEqual([7, 8]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("windowStart", () => {
    it("aligne sur la taille de page", () => {
        const c = HolafCollection.create({ pageSize: 500 });
        expect(c.windowStart(0)).toBe(0);
        expect(c.windowStart(1)).toBe(0);
        expect(c.windowStart(499)).toBe(0);
        expect(c.windowStart(500)).toBe(500);
        expect(c.windowStart(1001)).toBe(1000);
    });

    it("robuste aux entrées négatives/invalides", () => {
        const c = HolafCollection.create({ pageSize: 10 });
        expect(c.windowStart(-3)).toBe(0);
        expect(c.windowStart("nope")).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("at / has / length / setWindow", () => {
    it("setWindow écrit, allonge et marque chargée", () => {
        const c = HolafCollection.create({ pageSize: 4 });
        c.setWindow(0, makeItems("a", 4));
        expect(c.length).toBe(4);
        expect(c.at(0).id).toBe("a0");
        expect(c.at(3).id).toBe("a3");
        expect(c.has(0)).toBe(true);
        expect(c.has(4)).toBe(false);
        expect(c.isWindowLoaded(0)).toBe(true);
    });

    it("setWindow à un offset aligné étend le tableau creux", () => {
        const c = HolafCollection.create({ pageSize: 4 });
        c.setWindow(4, makeItems("b", 4));
        expect(c.length).toBe(8);
        expect(c.at(0)).toBeUndefined(); // trou
        expect(c.has(0)).toBe(false);
        expect(c.at(4).id).toBe("b0");
    });

    it("at hors bornes = undefined", () => {
        const c = HolafCollection.create({ pageSize: 4 });
        expect(c.at(99)).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("forEachLoaded", () => {
    it("parcourt les fenêtres par ordre croissant en passant l'index", () => {
        const c = HolafCollection.create({ pageSize: 2 });
        c.setWindow(2, makeItems("x", 2));
        c.setWindow(0, makeItems("y", 2));
        const seen = [];
        c.forEachLoaded((item, i) => seen.push([i, item.id]));
        expect(seen).toEqual([[0, "y0"], [1, "y1"], [2, "x0"], [3, "x1"]]);
    });

    it("ignore les cases vides (trous) d'une fenêtre", () => {
        const c = HolafCollection.create({ pageSize: 4 });
        c.setWindow(0, [{ id: "a" }, undefined, { id: "c" }, { id: "d" }]);
        const ids = [];
        c.forEachLoaded((it) => ids.push(it.id));
        expect(ids).toEqual(["a", "c", "d"]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("missingStarts", () => {
    it("liste les fenêtres d'une plage", () => {
        const c = HolafCollection.create({ pageSize: 10 });
        expect(c.missingStarts(0, 25)).toEqual([0, 10, 20]);
    });

    it("exclut les fenêtres déjà chargées", () => {
        const c = HolafCollection.create({ pageSize: 10 });
        c.setWindow(10, makeItems("a", 10));
        expect(c.missingStarts(0, 25)).toEqual([0, 20]);
    });

    it("exclut les fenêtres en vol", () => {
        const c = HolafCollection.create({ pageSize: 10 });
        c.registerLoading(10, null, Promise.resolve());
        expect(c.missingStarts(0, 25)).toEqual([0, 20]);
    });

    it("s'arrête au total connu", () => {
        const c = HolafCollection.create({ pageSize: 10, total: 15 });
        expect(c.missingStarts(0, 45)).toEqual([0, 10]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ensureRange / ensureIndex (fetchPage)", () => {
    it("appelle fetchPage avec offset/limit/page corrects", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        await c.ensureRange(0, 9);
        expect(fetchPage).toHaveBeenCalledTimes(1);
        expect(fetchPage.calls[0]).toEqual({ offset: 0, limit: 10, page: 0 });
        expect(c.isWindowLoaded(0)).toBe(true);
        expect(c.at(0).id).toBe("p0_0");
    });

    it("charge plusieurs fenêtres d'une plage", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        await c.ensureRange(0, 25);
        expect(fetchPage.calls.map((k) => k.offset)).toEqual([0, 10, 20]);
        expect(fetchPage.calls.map((k) => k.page)).toEqual([0, 1, 2]);
    });

    it("déduplique deux ensureRange concurrents (une seule requête/fenêtre)", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const p1 = c.ensureRange(0, 9);
        const p2 = c.ensureRange(0, 9);
        expect(c.isWindowLoading(0)).toBe(true);
        await Promise.all([p1, p2]);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it("émet 'total' quand fetchPage annonce le total", async () => {
        const fetchPage = pagedFetch(1234);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const totals = [];
        c.on("total", (t) => totals.push(t));
        await c.ensureRange(0, 9);
        expect(totals).toEqual([1234]);
        expect(c.total).toBe(1234);
    });

    it("ensureIndex charge la fenêtre contenant l'index et résout l'item", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const item = await c.ensureIndex(15);
        expect(item.id).toBe("p10_5");
        expect(fetchPage.calls.map((k) => k.offset)).toEqual([10]);
    });

    it("ensureIndex déjà chargé ne refait aucun fetch", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        c.setWindow(0, makeItems("z", 10));
        const item = await c.ensureIndex(2);
        expect(item.id).toBe("z2");
        expect(fetchPage).not.toHaveBeenCalled();
    });

    it("ne fetch jamais au-delà du total connu", async () => {
        const fetchPage = pagedFetch(5);
        const c = HolafCollection.create({ pageSize: 10, total: 5, getId: (i) => i.id, fetchPage });
        await c.ensureRange(0, 30);
        expect(fetchPage.mock.calls.length).toBe(1);
    });

    it("sans fetchPage, ensureRange ne charge rien", async () => {
        const c = HolafCollection.create({ pageSize: 10 });
        await expect(c.ensureRange(0, 9)).resolves.toBeDefined();
        expect(c.isWindowLoaded(0)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("mode append (scroll infini)", () => {
    it("charge les pages vers l'avant puis n'exige rien en arrière", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 2, mode: "append", getId: (i) => i.id, fetchPage });
        await c.ensureRange(0, 1);
        expect(c.length).toBe(2);
        await c.ensureRange(c.length, c.length + 1);
        expect(fetchPage.calls.map((k) => k.offset)).toEqual([0, 2]);
        expect(c.at(2).id).toBe("p2_0");
    });

    it("ne remonte jamais sous la frontière déjà chargée", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 2, mode: "append", getId: (i) => i.id, fetchPage });
        c.setWindow(6, makeItems("q", 2));
        expect(c.missingStarts(0, 1)).toEqual([]); // pas de backfill
    });

    it("en mode window, la même situation comble le trou", () => {
        const c = HolafCollection.create({ pageSize: 2, mode: "window" });
        c.setWindow(6, makeItems("q", 2));
        expect(c.missingStarts(0, 1)).toEqual([0]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("insertTop", () => {
    it("préfixe, trie DESC et décale l'existant de +N (aucune perte)", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 1000, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("old", 4, 100));
        const oldFirst = c.at(0);

        const inserted = c.insertTop([
            { id: "NEW_b", sort: 9998 },
            { id: "NEW_a", sort: 9999 },
        ]);

        expect(inserted).toBe(2);
        expect(c.at(0).id).toBe("NEW_a");
        expect(c.at(1).id).toBe("NEW_b");
        expect(c.at(2)).toBe(oldFirst);
        expect(c.length).toBe(1002);
        expect(c.total).toBe(1002);
    });

    it("conserve la fenêtre 0 chargée et abandonne la fenêtre à cheval sur un trou", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 1000, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("old", 4, 100));
        c.insertTop([{ id: "n0", sort: 1 }]);
        expect(c.isWindowLoaded(0)).toBe(true);
        expect(c.isWindowLoaded(4)).toBe(false); // fenêtre 4 = 1 item + trou → oubliée
    });

    it("ignore les doublons déjà chargés", () => {
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("k", 10, 100));
        expect(c.insertTop([{ id: "k3", sort: 9999 }])).toBe(0);
        expect(c.length).toBe(10);
    });

    it("renvoie 0 pour une entrée vide, undefined ou invalide", () => {
        const c = HolafCollection.create({ pageSize: 4, getId: (i) => i.id });
        expect(c.insertTop([])).toBe(0);
        expect(c.insertTop(null)).toBe(0);
        expect(c.insertTop([null, { id: null }])).toBe(0);
    });

    it("les données chargées restent accessibles (dans le tableau et via forEachLoaded)", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 100, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("old", 4, 100));
        c.insertTop([{ id: "NEW", sort: 9999 }]);
        // La donnée n'est jamais perdue : old3 a juste glissé hors des fenêtres pleines.
        expect(c.at(4).id).toBe("old3");
        const seen = new Set();
        c.forEachLoaded((it) => seen.add(it.id));
        expect(seen.has("NEW")).toBe(true);
        expect(seen.has("old1")).toBe(true);
    });

    it("annule les fetch en vol (offsets décalés)", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 100, getId: (i) => i.id, sortKey: (i) => i.sort });
        const controller = { aborted: false, abort() { this.aborted = true; } };
        c.registerLoading(8, controller, Promise.resolve());
        c.insertTop([{ id: "NEW", sort: 1 }]);
        expect(controller.aborted).toBe(true);
        expect(c.isWindowLoading(8)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("removeByIds", () => {
    it("retire et ré-ancre, fenêtres restent couvertes", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 8, getId: (i) => i.id });
        c.setWindow(0, makeItems("x", 4));
        c.setWindow(4, makeItems("y", 4));

        expect(c.removeByIds(["x1"])).toBe(1);
        expect(c.at(1).id).toBe("x2");
        expect(c.length).toBe(7);
        expect(c.total).toBe(7);
        expect(c.isWindowLoaded(0)).toBe(true);
        expect(c.isWindowLoaded(4)).toBe(true);
    });

    it("renvoie false quand un id n'est pas en mémoire", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 8, getId: (i) => i.id });
        c.setWindow(0, makeItems("x", 4));
        expect(c.removeByIds(["jamais_chargé"])).toBe(false);
    });

    it("renvoie 0 pour une liste vide", () => {
        const c = HolafCollection.create({ pageSize: 4, getId: (i) => i.id });
        c.setWindow(0, makeItems("x", 4));
        expect(c.removeByIds([])).toBe(0);
        expect(c.removeByIds(null)).toBe(0);
    });

    it("retire plusieurs items d'un coup", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 8, getId: (i) => i.id });
        c.setWindow(0, makeItems("x", 4));
        c.setWindow(4, makeItems("y", 4));
        expect(c.removeByIds(["x0", "y3"])).toBe(2);
        expect(c.length).toBe(6);
        expect(c.at(0).id).toBe("x1");
    });

    it("annule les fetch en vol", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 8, getId: (i) => i.id });
        c.setWindow(0, makeItems("x", 4));
        const controller = { aborted: false, abort() { this.aborted = true; } };
        c.registerLoading(4, controller, Promise.resolve());
        c.removeByIds(["x0"]);
        expect(controller.aborted).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("applyDelta", () => {
    it("delta avec ajouts → patch (insertTop) et événement 'patch'", () => {
        const c = HolafCollection.create({ pageSize: 10, total: 100, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("old", 10, 100));
        const patches = [];
        c.on("patch", (p) => patches.push(p));
        const r = c.applyDelta({ items: [{ id: "NEW", sort: 999 }] });
        expect(r).toEqual({ mode: "patched", inserted: 1, removed: 0 });
        expect(patches).toHaveLength(1);
        expect(c.at(0).id).toBe("NEW");
    });

    it("delta avec suppressions réconciliables → patch", () => {
        const c = HolafCollection.create({ pageSize: 10, total: 100, getId: (i) => i.id });
        c.setWindow(0, makeItems("old", 10, 100));
        const r = c.applyDelta({ removedIds: ["old2"] });
        expect(r).toEqual({ mode: "patched", inserted: 0, removed: 1 });
    });

    it("suppression de masse → full-reload (mass-removal)", () => {
        const c = HolafCollection.create({ pageSize: 10, total: 100, getId: (i) => i.id });
        c.setWindow(0, makeItems("old", 10, 100));
        const many = Array.from({ length: MASS_REMOVAL_THRESHOLD }, (_, i) => "p" + i);
        const r = c.applyDelta({ items: [{ id: "NEW" }], removedIds: many });
        expect(r).toEqual({ mode: "full-reload", reason: "mass-removal" });
        // cas de masse : AUCUNE insertion tentée
        expect(c.at(0).id).toBe("old0");
    });

    it("suppression irréconciliable → full-reload (unreconcilable-removal)", () => {
        const c = HolafCollection.create({ pageSize: 10, total: 100, getId: (i) => i.id });
        c.setWindow(0, makeItems("old", 10, 100));
        const r = c.applyDelta({ removedIds: ["absent"] });
        expect(r).toEqual({ mode: "full-reload", reason: "unreconcilable-removal" });
    });

    it("delta vide → patch 0/0", () => {
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id });
        expect(c.applyDelta({})).toEqual({ mode: "patched", inserted: 0, removed: 0 });
    });

    it("static applyDelta avec injecteurs (contrat du pack)", () => {
        const calls = { insert: 0, remove: 0 };
        const deps = {
            insertTop: (items) => { calls.insert++; return items.length; },
            removeByIds: (ids) => { calls.remove++; return ids.length; },
        };
        expect(HolafCollection.applyDelta({ items: [{ id: 1 }] }, deps))
            .toEqual({ mode: "patched", inserted: 1, removed: 0 });
        expect(calls.insert).toBe(1);
        expect(HolafCollection.applyDelta({ removedIds: ["a"] }, deps).removed).toBe(1);
        expect(calls.remove).toBe(1);

        // irréconciliable
        const bad = { insertTop: () => 0, removeByIds: () => false };
        expect(HolafCollection.applyDelta({ removedIds: ["a"] }, bad))
            .toEqual({ mode: "full-reload", reason: "unreconcilable-removal" });
    });

    it("les ajouts et suppressions se cumulent en un patch", () => {
        const c = HolafCollection.create({ pageSize: 10, total: 100, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("old", 10, 100));
        const r = c.applyDelta({ items: [{ id: "NEW", sort: 999 }], removedIds: ["old5"] });
        expect(r).toEqual({ mode: "patched", inserted: 1, removed: 1 });
        expect(c.at(0).id).toBe("NEW");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("événements", () => {
    it("'load' est émis avec { start, count }", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const loads = [];
        c.on("load", (p) => loads.push(p));
        await c.ensureRange(0, 9);
        expect(loads).toEqual([{ start: 0, count: 10 }]);
    });

    it("'error' est émis quand fetchPage échoue (et ne rejette pas)", async () => {
        const fetchPage = vi.fn(async () => { throw new Error("boom"); });
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const errors = [];
        c.on("error", (p) => errors.push(p));
        await expect(c.ensureRange(0, 9)).resolves.toBeDefined();
        expect(errors).toHaveLength(1);
        expect(errors[0].error.message).toBe("boom");
        expect(c.isWindowLoaded(0)).toBe(false);
    });

    it("'total' est émis aussi via insertTop / removeByIds", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 4, getId: (i) => i.id, sortKey: (i) => i.sort });
        c.setWindow(0, makeItems("a", 4));
        const totals = [];
        c.on("total", (t) => totals.push(t));
        c.insertTop([{ id: "n", sort: 9 }]);   // 4 -> 5
        c.removeByIds(["n"]);                  // 5 -> 4
        expect(totals).toEqual([5, 4]);
    });

    it("on() renvoie une fonction de désabonnement", async () => {
        const fetchPage = pagedFetch(1000);
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const loads = [];
        const off = c.on("load", (p) => loads.push(p));
        await c.ensureRange(0, 9);
        off();
        await c.ensureRange(10, 19);
        expect(loads).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("reset / resetWindowCache / setFilters", () => {
    it("reset vide données + fenêtres + total", () => {
        const c = HolafCollection.create({ pageSize: 4, total: 10, getId: (i) => i.id });
        c.setWindow(0, makeItems("a", 4));
        c.reset();
        expect(c.length).toBe(0);
        expect(c.total).toBe(0);
        expect(c.isWindowLoaded(0)).toBe(false);
    });

    it("resetWindowCache garde les données", () => {
        const c = HolafCollection.create({ pageSize: 4, getId: (i) => i.id });
        c.setWindow(0, makeItems("a", 4));
        c.resetWindowCache();
        expect(c.length).toBe(4);
        expect(c.at(0).id).toBe("a0");
        expect(c.isWindowLoaded(0)).toBe(false);
    });

    it("reset annule les fetch en vol sans émettre 'error'", async () => {
        let captured = null;
        const fetchPage = vi.fn(({ signal }) => new Promise((_resolve, reject) => {
            captured = { signal };
            signal.addEventListener("abort", () => {
                const e = new Error("aborted");
                e.name = "AbortError";
                reject(e);
            });
        }));
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id, fetchPage });
        const errors = [];
        c.on("error", (p) => errors.push(p));
        const p = c.ensureIndex(0);
        expect(c.isWindowLoading(0)).toBe(true);
        c.reset();
        await p;
        expect(captured.signal.aborted).toBe(true);
        expect(errors).toHaveLength(0);
        expect(c.isWindowLoading(0)).toBe(false);
    });

    it("setFilters change les filtres et réinitialise", async () => {
        const fetchPage = vi.fn(async ({ filters }) => ({ items: [{ id: "a", f: filters }], total: 1 }));
        const c = HolafCollection.create({ pageSize: 10, filters: { x: 1 }, getId: (i) => i.id, fetchPage });
        c.setWindow(0, [{ id: "old" }]);
        c.setFilters({ x: 2 });
        expect(c.length).toBe(0);
        await c.ensureRange(0, 9);
        expect(c.at(0).f).toEqual({ x: 2 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("bindState (store externe) + ids numériques", () => {
    it("adopte le tableau images par référence et le totalCount", () => {
        const state = { images: [], totalCount: 42 };
        const c = HolafCollection.create({ pageSize: 4, getId: (i) => i.path_canon });
        c.bindState(state);
        c.setWindow(0, [{ path_canon: "a" }, { path_canon: "b" }]);
        expect(state.images[0].path_canon).toBe("a");
        expect(c.total).toBe(42);
        expect(c.at(0).path_canon).toBe("a");
    });

    it("bindState crée le tableau si absent", () => {
        const state = { totalCount: 3 };
        const c = HolafCollection.create({ pageSize: 4, getId: (i) => i.id });
        c.bindState(state);
        c.setWindow(0, [{ id: 1 }]);
        expect(Array.isArray(state.images)).toBe(true);
        expect(state.images[0].id).toBe(1);
    });

    it("dédup correcte avec des ids numériques (vs chaînes)", () => {
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id });
        c.setWindow(0, [{ id: 1 }, { id: 2 }, { id: 3 }]);
        expect(c.insertTop([{ id: 2 }])).toBe(0);
        expect(c.removeByIds([2])).toBe(1);
        expect(c.at(1).id).toBe(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("refresh (fetchDelta)", () => {
    it("sans fetchDelta → { mode:'skipped' }", async () => {
        const c = HolafCollection.create({ pageSize: 10, getId: (i) => i.id });
        await expect(c.refresh()).resolves.toEqual({ mode: "skipped" });
    });

    it("appelle fetchDelta puis applique le delta", async () => {
        const fetchDelta = vi.fn(async () => ({ items: [{ id: "NEW", sort: 9 }], total: 5, since: 42 }));
        const c = HolafCollection.create({ pageSize: 10, total: 4, getId: (i) => i.id, sortKey: (i) => i.sort, fetchDelta });
        c.setWindow(0, makeItems("old", 4, 100));
        const r = await c.refresh();
        expect(r).toEqual({ mode: "patched", inserted: 1, removed: 0 });
        expect(c.at(0).id).toBe("NEW");
        expect(c.total).toBe(5);
    });
});
