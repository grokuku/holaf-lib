/* Tests HolafFetch — vitest, environnement NODE (pas de DOM requis).
 * ─────────────────────────────────────────────────────────────────────────────
 * fetch est STUBBÉ via vi.stubGlobal — jamais d'appel réseau réel.
 * Couverture : sérialisation get/post, auth enfichable (bearer / csrf /
 * custom), JSON blindé (HTML login → « session expirée »), !res.ok avec
 * body.error, body.detail (FastAPI) et priorité error > detail, err.data.code
 * préservé, timeout (fake timers + AbortController), retry backoff (2
 * tentatives sur 500, PAS de retry sur 404), raw mode (dont timer nettoyé
 * au succès : un flux long n'est pas aborté après les headers), get sans
 * body, body objet → JSON.stringify.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolafFetch, HolafFetchError } from "../js/holaf-fetch.js";

// Fabrique une fausse Response JSON (ou texte) avec le statut voulu.
function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
    });
}
function textResponse(text, status = 200, headers = {}) {
    return new Response(text, { status, headers });
}

let fetchMock;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("HolafFetch — sérialisation", () => {
    it("get : méthode GET, sans body, opts passés", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        const data = await HolafFetch.get("/api/x", { headers: { "X-Test": "1" } });
        expect(data).toEqual({ ok: true });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/x");
        expect(init.method).toBe("GET");
        expect(init.body).toBeUndefined();
        expect(init.headers["X-Test"]).toBe("1");
    });

    it("post : body objet → JSON.stringify + Content-Type application/json", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
        await HolafFetch.post("/api/x", { body: { name: "Holaf" } });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/x");
        expect(init.method).toBe("POST");
        expect(init.body).toBe(JSON.stringify({ name: "Holaf" }));
        expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("get sans body : un body passé est ignoré", async () => {
        fetchMock.mockResolvedValue(jsonResponse({}));
        await HolafFetch.get("/api/x", { body: { should: "not" } });
        expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });
});

describe("HolafFetch — auth enfichable", () => {
    it("bearer : token() appelé à chaque requête, en-tête Authorization", async () => {
        const token = vi.fn().mockReturnValue("tok-123");
        fetchMock.mockResolvedValue(jsonResponse({}));
        await HolafFetch.get("/api/x", { auth: { type: "bearer", token } });
        expect(token).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-123");
    });

    it("csrf : lit le cookie et pose X-CSRF-Token", async () => {
        vi.stubGlobal("document", { cookie: "csrftoken=abc123" });
        fetchMock.mockResolvedValue(jsonResponse({}));
        await HolafFetch.get("/api/x", { auth: { type: "csrf" } });
        expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("abc123");
    });

    it("csrf : cookieName personnalisé", async () => {
        vi.stubGlobal("document", { cookie: "mycsrf=xyz" });
        fetchMock.mockResolvedValue(jsonResponse({}));
        await HolafFetch.get("/api/x", { auth: { type: "csrf", cookieName: "mycsrf" } });
        expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("xyz");
    });

    it("custom : headers() fusionnés avec ceux de l'hôte", async () => {
        fetchMock.mockResolvedValue(jsonResponse({}));
        await HolafFetch.get("/api/x", {
            headers: { "X-Host": "1" },
            auth: { type: "custom", headers: () => ({ "X-Custom": "2" }) },
        });
        const h = fetchMock.mock.calls[0][1].headers;
        expect(h["X-Host"]).toBe("1");
        expect(h["X-Custom"]).toBe("2");
    });
});

describe("HolafFetch — JSON blindé", () => {
    it("page HTML de login → erreur « session expirée »", async () => {
        fetchMock.mockResolvedValue(
            textResponse("<html><body>authentik sign-in outpost</body></html>", 200, { "Content-Type": "text/html" })
        );
        await expect(HolafFetch.get("/api/x")).rejects.toThrow("session expirée");
    });

    it("réponse non-JSON non-login → erreur avec statut", async () => {
        fetchMock.mockResolvedValue(textResponse("502 Bad Gateway", 502, { "Content-Type": "text/html" }));
        await expect(HolafFetch.get("/api/x")).rejects.toMatchObject({ status: 502 });
    });

    it("!res.ok avec body.error → err.message = body.error ({error} inchangé)", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: "Accès refusé" }, 403));
        await expect(HolafFetch.get("/api/x")).rejects.toThrow("Accès refusé");
    });

    it("!res.ok avec body.detail (FastAPI) → err.message = body.detail, corps complet dans err.data", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ detail: "Non authentifié" }, 401));
        try {
            await HolafFetch.get("/api/x");
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(HolafFetchError);
            expect(err.message).toBe("Non authentifié");
            expect(err.status).toBe(401);
            expect(err.data).toEqual({ detail: "Non authentifié" });
        }
    });

    it("priorité : error ET detail présents → error gagne, detail reste dans err.data", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ error: "erreur maison", detail: "erreur FastAPI" }, 400)
        );
        try {
            await HolafFetch.get("/api/x");
            expect.unreachable();
        } catch (err) {
            expect(err.message).toBe("erreur maison");
            expect(err.data.detail).toBe("erreur FastAPI");
        }
    });

    it("detail non-string (tableau de validation FastAPI) → message par défaut, corps dans err.data", async () => {
        const validation = { detail: [{ loc: ["body", "name"], msg: "field required" }] };
        fetchMock.mockResolvedValue(jsonResponse(validation, 422));
        try {
            await HolafFetch.get("/api/x");
            expect.unreachable();
        } catch (err) {
            expect(err.message).toBe("erreur serveur (statut 422)");
            expect(err.data).toEqual(validation);
        }
    });

    it("err.data.code préservé (ex. GIT_AUTH_REQUIRED)", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: "auth", code: "GIT_AUTH_REQUIRED" }, 401));
        try {
            await HolafFetch.get("/api/x");
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(HolafFetchError);
            expect(err.status).toBe(401);
            expect(err.data.code).toBe("GIT_AUTH_REQUIRED");
        }
    });
});

describe("HolafFetch — timeout & retry", () => {
    it("timeout : AbortController aborté → erreur « timeout »", async () => {
        // fetch rejette quand le signal est aborté (simule le comportement natif).
        fetchMock.mockImplementation((_url, init) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => reject(new Error("Aborted")));
            })
        );
        const p = HolafFetch.get("/api/x", { timeout: 1000 });
        const assertion = expect(p).rejects.toThrow("timeout");
        vi.advanceTimersByTime(1000);
        await assertion;
    });

    it("raw : timer nettoyé au succès — un flux long n'est pas aborté après les headers", async () => {
        // Simule un VRAI fetch : le corps de la réponse est lié au signal —
        // un abort après réception des headers erreur le flux (stream).
        fetchMock.mockImplementation((_url, init) => {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("chunk-1"));
                    init.signal.addEventListener("abort", () =>
                        controller.error(new Error("SignalAbort"))
                    );
                },
            });
            return Promise.resolve(
                new Response(stream, { status: 200, headers: { "Content-Type": "application/octet-stream" } })
            );
        });

        const out = await HolafFetch.get("/api/stream", { raw: true, timeout: 1000 });
        expect(out.status).toBe(200);

        // Bien APRÈS le timeout (1 s) : si le timer n'était pas nettoyé au
        // succès, le controller aurait aborté → le flux ci-dessous serait
        // erreur au lieu de livrer ses données.
        vi.advanceTimersByTime(60_000);

        const reader = out.body.getReader();
        const { value } = await reader.read();
        expect(new TextDecoder().decode(value)).toBe("chunk-1");
        // Le signal combiné (timeout + signal externe) n'a pas été aborté.
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    });

    it("raw : le timeout couvre toujours la réponse initiale (headers lents)", async () => {
        // La combinaison signal+timeout doit rester opérante en raw.
        fetchMock.mockImplementation((_url, init) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => reject(new Error("Aborted")));
            })
        );
        const p = HolafFetch.get("/api/x", { raw: true, timeout: 1000 });
        const assertion = expect(p).rejects.toThrow("timeout");
        vi.advanceTimersByTime(1000);
        await assertion;
    });

    it("retry : 2 tentatives sur 500 (backoff), puis succès", async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));
        const p = HolafFetch.get("/api/x", { retry: { attempts: 2, backoffMs: 300 } });
        // 1re tentative → 500 → backoff (300 + jitter ≤ 360 ms) → 2e tentative
        await vi.advanceTimersByTimeAsync(2000);
        const data = await p;
        expect(data).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("PAS de retry sur 404 (4xx)", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: "introuvable" }, 404));
        await expect(HolafFetch.get("/api/x", { retry: { attempts: 3, backoffMs: 100 } }))
            .rejects.toMatchObject({ status: 404 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retry sur erreur réseau", async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockResolvedValueOnce(jsonResponse({ ok: true }));
        const p = HolafFetch.get("/api/x", { retry: { attempts: 2, backoffMs: 100 } });
        await vi.advanceTimersByTimeAsync(2000);
        await expect(p).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("HolafFetch — divers", () => {
    it("raw: true → renvoie la Response brute", async () => {
        const res = jsonResponse({ ok: true });
        fetchMock.mockResolvedValue(res);
        const out = await HolafFetch.get("/api/x", { raw: true });
        expect(out).toBe(res);
    });

    it("on.status : handler appelé avec le statut", async () => {
        const onStatus = vi.fn();
        fetchMock.mockResolvedValue(jsonResponse({}, 201));
        await HolafFetch.post("/api/x", { on: { status: onStatus } });
        expect(onStatus).toHaveBeenCalledWith(201);
    });

    it("version 0.1.1 exposée", () => {
        expect(HolafFetch.version).toBe("0.1.1");
    });

    it("HolafFetchError est une instance de Error avec name", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: "x" }, 500));
        try {
            await HolafFetch.get("/api/x");
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe("HolafFetchError");
        }
    });
});
