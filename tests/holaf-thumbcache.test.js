// Tests — brique HolafThumbCache (cache + ordonnanceur de vignettes, pur).
// Runner vitest/jsdom. La brique ne touche pas au DOM : on stubbe juste
// URL.createObjectURL / revokeObjectURL et on utilise les fake timers.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    HolafThumbCache,
    VERSION,
    PRIORITY_LOW,
    PRIORITY_HIGH,
} from "../js/holaf-thumbcache.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

/** Fausse Response (duck-typing : le brick ne fait pas `instanceof`). */
function fakeResponse({ status = 200, retryAfter = null, blobValue = { blob: true } } = {}) {
    const headers = new Map();
    if (retryAfter !== null && retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (k) => (headers.has(k) ? headers.get(k) : null) },
        blob: () => Promise.resolve(blobValue),
    };
}

/**
 * Chargeur contrôlé : chaque appel crée une entrée `{ item, signal, resolve,
 * reject, aborted }` exposée dans `load.calls`. Rejette en AbortError dès que
 * le signal est annulé (comme un vrai fetch).
 */
function controlledLoad() {
    const calls = [];
    const load = vi.fn((item, { signal } = {}) => {
        return new Promise((resolve, reject) => {
            const entry = { item, signal, resolve, reject, aborted: false };
            calls.push(entry);
            if (signal) {
                signal.addEventListener("abort", () => {
                    entry.aborted = true;
                    const e = new Error("aborted");
                    e.name = "AbortError";
                    reject(e);
                });
            }
        });
    });
    load.calls = calls;
    return load;
}

/** Laisse filer les microtasks (chaînes await internes à la brique). */
async function flush(n = 10) {
    for (let i = 0; i < n; i++) await Promise.resolve();
}

let urlCounter = 0;

beforeEach(() => {
    urlCounter = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${++urlCounter}`);
    URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("create / valeurs par défaut", () => {
    it("expose la version statique et d'instance", () => {
        expect(VERSION).toBe("0.1.0");
        expect(HolafThumbCache.VERSION).toBe("0.1.0");
        expect(HolafThumbCache.create().version).toBe("0.1.0");
    });

    it("expose les constantes de priorité", () => {
        expect(HolafThumbCache.PRIORITY_LOW).toBe(0);
        expect(HolafThumbCache.PRIORITY_HIGH).toBe(1);
        expect(PRIORITY_LOW).toBe(0);
        expect(PRIORITY_HIGH).toBe(1);
    });

    it("capacité 2000, concurrence 6, stratégie 'blob' par défaut", () => {
        const c = HolafThumbCache.create({ load: controlledLoad() });
        expect(c.capacity).toBe(2000);
        expect(c.concurrency).toBe(6);
        expect(c.strategyName).toBe("blob");
        expect(c.size).toBe(0);
    });

    it("capacité / concurrence invalides retombent sur les défauts", () => {
        const c = HolafThumbCache.create({ capacity: -1, concurrency: 0, load: controlledLoad() });
        expect(c.capacity).toBe(2000);
        expect(c.concurrency).toBe(6);
    });

    it("getId par défaut = item.id et retombe sur item.id si getId lève", () => {
        const c = HolafThumbCache.create({
            load: controlledLoad(),
            strategy: "url",
        });
        c._storeHandle(7, "u7");
        expect(c.has(7)).toBe(true);

        const c2 = HolafThumbCache.create({
            load: controlledLoad(),
            strategy: "url",
            getId: () => { throw new Error("boom"); },
        });
        c2._storeHandle("x", "ux");
        expect(c2.has("x")).toBe(true);
    });

    it("setConcurrency change la borne et clampe les entrées invalides", () => {
        const c = HolafThumbCache.create({ load: controlledLoad() });
        c.setConcurrency(2);
        expect(c.concurrency).toBe(2);
        c.setConcurrency(-4);
        expect(c.concurrency).toBe(6);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("request / cache hit / yield", () => {
    it("un chargement réussi remplit le cache et résout le handle", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, strategy: "blob" });
        const p = c.request({ id: "a" });
        load.calls[0].resolve(fakeResponse());
        const handle = await p;
        expect(handle).toBe("blob:mock-1");
        expect(c.has("a")).toBe(true);
        expect(c.peek("a")).toBe("blob:mock-1");
    });

    it("un hit cache NE relance PAS de requête", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p = c.request({ id: "a" });
        load.calls[0].resolve(fakeResponse());
        await p;
        const h2 = await c.request({ id: "a" });
        expect(h2).toBe("blob:mock-1");
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("un hit cache résout de façon ASYNCHRONE (yield microtask)", async () => {
        const c = HolafThumbCache.create({ load: controlledLoad(), strategy: "url" });
        c._storeHandle("a", "url-a");
        let resolved = false;
        const p = c.request({ id: "a" }).then((h) => { resolved = true; return h; });
        expect(resolved).toBe(false); // pas synchrone
        await p;
        expect(resolved).toBe(true);
    });

    it("peek renvoie null si absent et n'affecte pas la récence", () => {
        const c = HolafThumbCache.create({ load: controlledLoad(), strategy: "url" });
        expect(c.peek("nope")).toBe(null);
        c._storeHandle("a", "ua");
        c._storeHandle("b", "ub");
        c.peek("a"); // ne devrait pas déplacer 'a'
        c._storeHandle("c", "uc"); // capacity par défaut : rien évincé
        expect(c.has("a")).toBe(true);
    });

    it("request rejette si l'item n'a pas d'id", async () => {
        const c = HolafThumbCache.create({ load: controlledLoad(), getId: () => null });
        await expect(c.request({})).rejects.toThrow(/getId/);
    });

    it("request rejette si load() est absent", async () => {
        const c = HolafThumbCache.create({});
        await expect(c.request({ id: "a" })).rejects.toThrow(/load/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("concurrence", () => {
    it("ne dépasse jamais `concurrency` chargements simultanés", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 3 });
        for (let i = 0; i < 10; i++) c.request({ id: "i" + i });
        expect(load).toHaveBeenCalledTimes(3);
        expect(c.stats().active).toBe(3);
        expect(c.stats().queued).toBe(7);
    });

    it("pompe la file au fur et à mesure des résolutions", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 2 });
        for (let i = 0; i < 4; i++) c.request({ id: "i" + i });
        expect(load).toHaveBeenCalledTimes(2);
        load.calls[0].resolve(fakeResponse());
        await flush();
        expect(load).toHaveBeenCalledTimes(3);
        load.calls[1].resolve(fakeResponse());
        await flush();
        expect(load).toHaveBeenCalledTimes(4);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("dédup in-flight", () => {
    it("deux request() du même id partagent une seule promesse", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p1 = c.request({ id: "a" });
        const p2 = c.request({ id: "a" });
        expect(load).toHaveBeenCalledTimes(1);
        expect(p1).toBe(p2);
        load.calls[0].resolve(fakeResponse());
        expect(await p1).toBe(await p2);
    });

    it("prefetch ignore un item déjà en vol", () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        c.request({ id: "a" });
        c.prefetch([{ id: "a" }]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("isLoading reflète l'état en vol puis retombe", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p = c.request({ id: "a" });
        expect(c.isLoading("a")).toBe(true);
        load.calls[0].resolve(fakeResponse());
        await p;
        expect(c.isLoading("a")).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("éviction LRU + release", () => {
    it("évince le plus ancien et appelle revokeObjectURL (blob)", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, capacity: 3 });
        for (let i = 0; i < 4; i++) {
            const p = c.request({ id: "i" + i });
            load.calls[i].resolve(fakeResponse());
            await p;
        }
        expect(c.size).toBe(3);
        expect(c.has("i0")).toBe(false);
        expect(c.has("i3")).toBe(true);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    });

    it("un accès rafraîchit la récence et protège de l'éviction", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, capacity: 2 });
        // charge a, b, c => a doit être évincé, sauf si on le touche.
        for (const id of ["a", "b"]) {
            const p = c.request({ id });
            load.calls.pop().resolve(fakeResponse());
            await p;
        }
        await c.request({ id: "a" }); // touch 'a'
        const pc = c.request({ id: "c" });
        load.calls.pop().resolve(fakeResponse());
        await pc;
        expect(c.has("a")).toBe(true); // protégé
        expect(c.has("b")).toBe(false); // évincé
    });

    it("touch rafraîchit la récence (protège de l'éviction), peek non", () => {
        const c = HolafThumbCache.create({ load: controlledLoad(), strategy: "url", capacity: 2 });
        c._storeHandle("a", "ua");
        c._storeHandle("b", "ub");
        expect(c.touch("a")).toBe("ua"); // 'a' repasse plus récent que 'b'
        c._storeHandle("c", "uc");        // évince le plus ancien ('b')
        expect(c.has("a")).toBe(true);
        expect(c.has("b")).toBe(false);
        expect(c.touch("absent")).toBe(null);
    });

    it("réécrire un id libère l'ancien handle", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p1 = c.request({ id: "a" });
        load.calls[0].resolve(fakeResponse());
        await p1;
        c.invalidate("a");
        const p2 = c.request({ id: "a" });
        load.calls[1].resolve(fakeResponse());
        await p2;
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
        expect(c.peek("a")).toBe("blob:mock-2");
    });

    it("clear libère tous les handles (revoke de chacun)", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        for (let i = 0; i < 3; i++) {
            const p = c.request({ id: "i" + i });
            load.calls[i].resolve(fakeResponse());
            await p;
        }
        c.clear();
        expect(c.size).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("priorités de la file", () => {
    it("sert les priorités hautes avant les basses", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 1 });
        // occupe le slot
        c.request({ id: "busy" });
        // file : low d'abord, puis high
        c.request({ id: "low1", }, PRIORITY_LOW);
        c.request({ id: "high1" }, PRIORITY_HIGH);
        c.request({ id: "low2" }, PRIORITY_LOW);
        load.calls[0].resolve(fakeResponse());
        await flush();
        expect(load.calls[1].item.id).toBe("high1");
        load.calls[1].resolve(fakeResponse());
        await flush();
        expect(load.calls[2].item.id).toBe("low1"); // FIFO parmi les low
        load.calls[2].resolve(fakeResponse());
        await flush();
        expect(load.calls[3].item.id).toBe("low2");
    });

    it("FIFO à priorité égale", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 1 });
        c.request({ id: "busy" });
        c.request({ id: "a" });
        c.request({ id: "b" });
        load.calls[0].resolve(fakeResponse());
        await flush();
        expect(load.calls[1].item.id).toBe("a");
    });

    it("prefetch enqueue en priorité basse (après le visible)", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 1 });
        c.request({ id: "busy" });
        c.prefetch([{ id: "pre" }]);
        c.request({ id: "vis" });
        load.calls[0].resolve(fakeResponse());
        await flush();
        expect(load.calls[1].item.id).toBe("vis");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("timeout + retries bornés", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retente un timeout jusqu'à `retry.max` puis échoue", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, timeoutMs: 100, retry: { max: 2, delayMs: 1000 } });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        const onErr = vi.fn();
        c.on("error", onErr);

        await vi.advanceTimersByTimeAsync(20000);
        await expect(p).rejects.toMatchObject({ timedOut: true });
        // 1 tentative initiale + 2 retries = 3
        expect(load).toHaveBeenCalledTimes(3);
        expect(onErr).toHaveBeenCalledTimes(1);
        expect(c.stats().errors).toBe(1);
    });

    it("le délai de retry est respecté (pas d'essai avant delayMs)", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, timeoutMs: 100, retry: { max: 3, delayMs: 5000 } });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        await vi.advanceTimersByTimeAsync(150); // timeout de la 1re tentative
        expect(load).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(4000); // < delayMs
        expect(load).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000); // >= delayMs → retry
        expect(load).toHaveBeenCalledTimes(2);
        await vi.runAllTimersAsync();
    });

    it("un succès après un timeout remet le compteur à zéro", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, timeoutMs: 100, retry: { max: 2, delayMs: 500 } });
        const p = c.request({ id: "a" });
        await vi.advanceTimersByTimeAsync(150); // 1er timeout → retry planifié
        await vi.advanceTimersByTimeAsync(500); // retry → tentative 2
        load.calls[1].resolve(fakeResponse());
        const handle = await p;
        expect(handle).toBe("blob:mock-1");
        expect(c.has("a")).toBe(true);
    });

    it("un timeout n'appelle PAS onPending (c'est un retry de timeout)", async () => {
        const load = controlledLoad();
        const onPending = vi.fn();
        const c = HolafThumbCache.create({ load, timeoutMs: 100, retry: { max: 1, delayMs: 200 }, onPending });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        await vi.advanceTimersByTimeAsync(150);
        expect(onPending).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("protocole 202 + Retry-After (pending)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("émet 'pending' + onPending(item, retryAfterMs) sur 202", async () => {
        const load = controlledLoad();
        const onPending = vi.fn();
        const c = HolafThumbCache.create({ load, onPending });
        const events = [];
        c.on("pending", (e) => events.push(e));

        const p = c.request({ id: "a" });
        load.calls[0].resolve(fakeResponse({ status: 202, retryAfter: 3 }));
        await flush();

        expect(onPending).toHaveBeenCalledTimes(1);
        expect(onPending.mock.calls[0][1]).toBe(3000);
        expect(events).toHaveLength(1);
        expect(events[0].retryAfterMs).toBe(3000);
        expect(c.isPending("a")).toBe(true);
        p.catch(() => {});
    });

    it("la promesse reste en attente puis résout au 1er essai réussi", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        let settled = false;
        const p = c.request({ id: "a" }).then((h) => { settled = true; return h; });

        load.calls[0].resolve(fakeResponse({ status: 202, retryAfter: 2 }));
        await flush();
        expect(settled).toBe(false); // toujours pending

        await vi.advanceTimersByTimeAsync(1999);
        expect(load).toHaveBeenCalledTimes(1); // pas encore retenté
        await vi.advanceTimersByTimeAsync(2);
        expect(load).toHaveBeenCalledTimes(2); // retry déclenché
        load.calls[1].resolve(fakeResponse({ blobValue: { blob: 2 } }));
        const handle = await p;
        expect(settled).toBe(true);
        expect(handle).toBe("blob:mock-1");
        expect(c.has("a")).toBe(true);
    });

    it("sans en-tête Retry-After, défaut 2 s", async () => {
        const load = controlledLoad();
        const onPending = vi.fn();
        const c = HolafThumbCache.create({ load, onPending });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        load.calls[0].resolve(fakeResponse({ status: 202 }));
        await flush();
        expect(onPending.mock.calls[0][1]).toBe(2000);
    });

    it("pendingMax borne les retries 202", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, pendingMax: 2, onError: () => {} });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        const onErr = vi.fn();
        c.on("error", onErr);
        // 202 indéfiniment
        load.mockImplementation((item, { signal } = {}) => {
            const entry = { item, signal };
            load.calls.push(entry);
            return Promise.resolve(fakeResponse({ status: 202, retryAfter: 1 }));
        });
        await vi.runAllTimersAsync();
        await expect(p).rejects.toThrow(/pending/);
        expect(onErr).toHaveBeenCalledTimes(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("abort / invalidation", () => {
    it("un abort() rejette en AbortError SANS retry", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, timeoutMs: 30000, retry: { max: 4, delayMs: 100 } });
        const p = c.request({ id: "a" });
        expect(load).toHaveBeenCalledTimes(1);
        c.abort(["a"]);
        await expect(p).rejects.toMatchObject({ name: "AbortError" });
        await flush();
        expect(load).toHaveBeenCalledTimes(1); // aucun retry après abort
    });

    it("abort() global rejette les chargements en vol et vide la file", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 2 });
        const p0 = c.request({ id: "a" });
        const p1 = c.request({ id: "b" });
        const p2 = c.request({ id: "c" }); // en file
        p0.catch(() => {}); p1.catch(() => {}); p2.catch(() => {});
        c.abort();
        await expect(p0).rejects.toMatchObject({ name: "AbortError" });
        await expect(p1).rejects.toMatchObject({ name: "AbortError" });
        await expect(p2).rejects.toMatchObject({ name: "AbortError" });
        expect(c.stats().queued).toBe(0);
        expect(c.stats().pending).toBe(0);
    });

    it("abort(ids) ne cible que les ids demandés", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load, concurrency: 1 });
        const pa = c.request({ id: "a" });
        const pb = c.request({ id: "b" });
        pb.catch(() => {});
        c.abort(["b"]);
        await expect(pb).rejects.toMatchObject({ name: "AbortError" });
        load.calls[0].resolve(fakeResponse());
        await expect(pa).resolves.toBe("blob:mock-1");
    });

    it("invalidate force un rechargement", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p1 = c.request({ id: "a" });
        load.calls[0].resolve(fakeResponse());
        await p1;
        c.invalidate("a");
        expect(c.has("a")).toBe(false);
        c.request({ id: "a" });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("invalidate annule le chargement en vol", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        c.invalidate("a");
        await expect(p).rejects.toMatchObject({ name: "AbortError" });
    });

    it("cancel arrête un retry 'pending' mais pas un chargement en vol", async () => {
        vi.useFakeTimers();
        try {
            const load = controlledLoad();
            const c = HolafThumbCache.create({ load });
            const p = c.request({ id: "a" });
            p.catch(() => {});
            load.calls[0].resolve(fakeResponse({ status: 202, retryAfter: 1 }));
            await flush();
            expect(c.isPending("a")).toBe(true);
            c.cancel("a");
            await expect(p).rejects.toMatchObject({ name: "AbortError" });
            await vi.advanceTimersByTimeAsync(5000);
            expect(load).toHaveBeenCalledTimes(1); // pas de retry après cancel
        } finally {
            vi.useRealTimers();
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("stratégie 'url'", () => {
    it("renvoie la chaîne telle quelle et ne révoque JAMAIS rien", async () => {
        const load = vi.fn(() => Promise.resolve("https://cdn/thumb.jpg"));
        const c = HolafThumbCache.create({ load, strategy: "url" });
        const handle = await c.request({ id: "a" });
        expect(handle).toBe("https://cdn/thumb.jpg");
        expect(c.strategyName).toBe("url");
        c.clear();
        c.destroy();
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it("accepte un load synchrone renvoyant directement la string", async () => {
        const load = vi.fn(() => "https://cdn/direct.jpg");
        const c = HolafThumbCache.create({ load, strategy: "url" });
        expect(await c.request({ id: "a" })).toBe("https://cdn/direct.jpg");
    });

    it("évince sans revoke en 'url'", async () => {
        const load = vi.fn((item) => Promise.resolve("u" + item.id));
        const c = HolafThumbCache.create({ load, strategy: "url", capacity: 1 });
        await c.request({ id: "a" });
        await c.request({ id: "b" });
        expect(c.has("a")).toBe(false);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("stratégie custom", () => {
    it("appelle get (source de hit), put et release", async () => {
        const store = new Map();
        const get = vi.fn((id) => store.get(id));
        const put = vi.fn((id, value) => { const h = "custom:" + id + ":" + value; store.set(id, h); return h; });
        const release = vi.fn((h) => store.delete(h));
        const load = vi.fn(() => Promise.resolve({ bytes: 1 }));

        const c = HolafThumbCache.create({ load, strategy: { get, put, release }, capacity: 1 });
        const h1 = await c.request({ id: "a" });
        expect(put).toHaveBeenCalled();
        expect(h1).toMatch(/^custom:a:/);

        const h2 = await c.request({ id: "b" });
        expect(get).toHaveBeenCalledWith("b");
        // éviction de 'a' → release
        expect(release).toHaveBeenCalledWith(h1);
        expect(h2).toMatch(/^custom:b:/);
    });

    it("un handle custom présent dans get est un HIT (pas de load)", () => {
        const get = vi.fn(() => "external-handle");
        const load = vi.fn();
        const c = HolafThumbCache.create({ load, strategy: { get } });
        c.request({ id: "a" });
        expect(load).not.toHaveBeenCalled();
        expect(c.peek("a")).toBe("external-handle");
    });

    it("release custom est appelé au clear", async () => {
        const release = vi.fn();
        const c = HolafThumbCache.create({
            load: vi.fn(() => Promise.resolve("V")),
            strategy: { put: (id, v) => v, release },
        });
        await c.request({ id: "a" });
        c.clear();
        expect(release).toHaveBeenCalledWith("V");
    });

    it("l'option release() de premier niveau prime sur la stratégie", async () => {
        const release = vi.fn();
        const stratRelease = vi.fn();
        const c = HolafThumbCache.create({
            load: vi.fn(() => Promise.resolve("V")),
            strategy: { put: (id, v) => v, release: stratRelease },
            release,
        });
        await c.request({ id: "a" });
        c.clear();
        expect(release).toHaveBeenCalledWith("V");
        expect(stratRelease).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("onVisible (priorisation débouncée)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("débounce et flush le lot après visibleDebounceMs", () => {
        const onPrioritize = vi.fn();
        const c = HolafThumbCache.create({ load: controlledLoad(), onPrioritize, visibleDebounceMs: 300 });
        c.onVisible(["a", "b"]);
        c.onVisible(["c"]);
        expect(onPrioritize).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(onPrioritize).toHaveBeenCalledTimes(1);
        expect(onPrioritize.mock.calls[0][0].sort()).toEqual(["a", "b", "c"]);
    });

    it("flush immédiat au-delà de visibleFlushThreshold", () => {
        const onPrioritize = vi.fn();
        const c = HolafThumbCache.create({ load: controlledLoad(), onPrioritize, visibleFlushThreshold: 3 });
        c.onVisible(["a", "b", "c"]);
        expect(onPrioritize).toHaveBeenCalledTimes(1);
    });

    it("aucun onPrioritize → onVisible est un no-op silencieux", () => {
        const c = HolafThumbCache.create({ load: controlledLoad() });
        expect(() => c.onVisible(["a"])).not.toThrow();
        vi.advanceTimersByTime(1000);
    });

    it("un onPrioritize qui lève ne casse pas la brique", () => {
        const c = HolafThumbCache.create({
            load: controlledLoad(),
            onPrioritize: () => { throw new Error("boom"); },
            visibleFlushThreshold: 1,
        });
        expect(() => c.onVisible(["a"])).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("stats", () => {
    it("reflète hits / misses / errors et la taille", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p = c.request({ id: "a" }); // miss
        load.calls[0].resolve(fakeResponse());
        await p;
        await c.request({ id: "a" }); // hit

        const s = c.stats();
        expect(s.size).toBe(1);
        expect(s.misses).toBe(1);
        expect(s.hits).toBe(1);
        expect(s.hitsRatio).toBeCloseTo(0.5);
        expect(s.strategy).toBe("blob");
        expect(s.concurrency).toBe(6);
        expect(s.capacity).toBe(2000);
    });

    it("compte les erreurs terminales", async () => {
        const load = vi.fn(() => Promise.reject(new Error("HTTP 500")));
        const c = HolafThumbCache.create({ load });
        await expect(c.request({ id: "a" })).rejects.toThrow(/500/);
        expect(c.stats().errors).toBe(1);
    });

    it("après clear, size=0 et pending=0", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        c.request({ id: "a" }).catch(() => {});
        c.clear();
        const s = c.stats();
        expect(s.size).toBe(0);
        expect(s.pending).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("events ready / error + onError", () => {
    it("émet 'ready' avec { id, item, handle }", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const onReady = vi.fn();
        const off = c.on("ready", onReady);
        const p = c.request({ id: "a", });
        load.calls[0].resolve(fakeResponse());
        await p;
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onReady.mock.calls[0][0]).toMatchObject({ id: "a", handle: "blob:mock-1" });
        off();
        // se désabonne proprement
        const p2 = c.request({ id: "b" });
        load.calls[1].resolve(fakeResponse());
        await p2;
        expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("émet 'error' + appelle onError sur échec terminal", async () => {
        const load = vi.fn(() => Promise.reject(new Error("network")));
        const onError = vi.fn();
        const c = HolafThumbCache.create({ load, onError });
        const onErr = vi.fn();
        c.on("error", onErr);
        await expect(c.request({ id: "a" })).rejects.toThrow(/network/);
        expect(onErr).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][1]).toBeInstanceOf(Error);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("clear / destroy", () => {
    it("destroy rejette les requêtes suivantes", async () => {
        const c = HolafThumbCache.create({ load: controlledLoad() });
        c.destroy();
        await expect(c.request({ id: "a" })).rejects.toThrow(/détruit/);
    });

    it("destroy libère le cache et retire les listeners", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const onReady = vi.fn();
        c.on("ready", onReady);
        const p = c.request({ id: "a" });
        load.calls[0].resolve(fakeResponse());
        await p;
        c.destroy();
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(c.size).toBe(0);
    });

    it("destroy annule les chargements en vol", async () => {
        const load = controlledLoad();
        const c = HolafThumbCache.create({ load });
        const p = c.request({ id: "a" });
        p.catch(() => {});
        c.destroy();
        await expect(p).rejects.toMatchObject({ name: "AbortError" });
    });
});
