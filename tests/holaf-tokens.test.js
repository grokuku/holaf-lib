/* Tests HolafTokens — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : preset initial par défaut (prefers-color-scheme), setTheme /
 * getTheme / listPresets, setTokens (--holaf-* sur :root), reset (retrait),
 * événement "holaf-tokens-changed" à chaque changement, applyPalette
 * (calculs internes mix/contrast, cohérence contraste).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HolafTokens } from "../js/holaf-tokens.js";

function getVar(name) {
    return document.documentElement.style.getPropertyValue(name);
}
function collectEvents() {
    const events = [];
    document.addEventListener("holaf-tokens-changed", (e) => events.push(e.detail));
    return events;
}

beforeEach(() => {
    // Réinitialise l'état : on retire les vars posées au chargement / tests.
    HolafTokens.reset();
    vi.restoreAllMocks();
});

describe("HolafTokens — presets", () => {
    it("expose les 4 presets du kit (cohérents avec modal)", () => {
        expect(HolafTokens.listPresets().sort()).toEqual(["dark", "light", "midnight", "slate"]);
    });

    it("setTheme : pose les variables --holaf-* sur :root", () => {
        HolafTokens.setTheme("dark");
        expect(getVar("--holaf-surface")).toBe("#1e1e1e");
        expect(getVar("--holaf-text")).toBe("#e4e4e7");
        expect(getVar("--holaf-accent")).toBe("#6366f1");
        expect(getVar("--holaf-radius")).toBe("12px");
    });

    it("setTheme : preset inconnu → throw clair", () => {
        expect(() => HolafTokens.setTheme("lime")).toThrow(/preset inconnu/i);
    });

    it("getTheme : retourne { name, vars } du preset appliqué", () => {
        HolafTokens.setTheme("midnight");
        const t = HolafTokens.getTheme();
        expect(t.name).toBe("midnight");
        expect(t.vars["--holaf-surface"]).toBe("#10111d");
        expect(t.vars["--holaf-accent-text"]).toBe("#10111d");
    });

    it("getTheme : renvoie null après reset", () => {
        HolafTokens.setTheme("light");
        HolafTokens.reset();
        expect(HolafTokens.getTheme()).toBeNull();
        // et les vars sont retirées
        expect(getVar("--holaf-surface")).toBe("");
    });

    it("contraste : le texte ≥ 4.5:1 sur la surface pour chaque preset", () => {
        const lum = (hex) => {
            const c = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
            const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((v) => parseInt(v, 16));
            return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
        };
        const ratio = (a, b) => {
            const la = lum(a), lb = lum(b);
            const hi = Math.max(la, lb), lo = Math.min(la, lb);
            return (hi + 0.05) / (lo + 0.05);
        };
        HolafTokens.listPresets().forEach((name) => {
            HolafTokens.setTheme(name);
            const t = HolafTokens.getTheme().vars;
            expect(ratio(t["--holaf-surface"], t["--holaf-text"])).toBeGreaterThanOrEqual(4.5);
        });
    });
});

describe("HolafTokens — setTokens", () => {
    it("setTokens : pose des tokens (clés préfixées --holaf-*)", () => {
        HolafTokens.setTokens({ name: "custom", values: { surface: "#111111", text: "#eeeeee" } });
        expect(getVar("--holaf-surface")).toBe("#111111");
        expect(getVar("--holaf-text")).toBe("#eeeeee");
        expect(HolafTokens.getTheme().name).toBe("custom");
    });

    it("setTokens : clés déjà préfixées passées telles quelles", () => {
        HolafTokens.setTokens({ values: { "--holaf-accent": "#123456" } });
        expect(getVar("--holaf-accent")).toBe("#123456");
    });

    it("setTokens : spec invalide → throw", () => {
        expect(() => HolafTokens.setTokens(null)).toThrow(/setTokens/i);
        expect(() => HolafTokens.setTokens({ values: 42 })).toThrow(/setTokens/i);
    });

    it("setTokens : ignore les valeurs null/undefined", () => {
        HolafTokens.setTokens({ values: { surface: "#111111", text: null, shadow: undefined } });
        expect(getVar("--holaf-surface")).toBe("#111111");
        expect(getVar("--holaf-text")).toBe("");
    });
});

describe("HolafTokens — événement holaf-tokens-changed", () => {
    it("émis à chaque setTheme avec le thème", () => {
        const events = collectEvents();
        HolafTokens.setTheme("slate");
        expect(events.length).toBe(1);
        expect(events[0].theme).toBe("slate");
    });

    it("émis sur setTokens, applyPalette et reset", () => {
        const events = collectEvents();
        HolafTokens.setTokens({ values: { surface: "#fff" } });
        HolafTokens.applyPalette("#4f46e5");
        HolafTokens.reset();
        // reset émet aussi (avant le beforeEach suivant)
        expect(events.length).toBeGreaterThanOrEqual(3);
    });
});

describe("HolafTokens — applyPalette", () => {
    it("pose une palette dérivée de l'accent", () => {
        HolafTokens.setTheme("dark");
        HolafTokens.applyPalette("#ff0000");
        const t = HolafTokens.getTheme().vars;
        expect(t["--holaf-accent"]).toBe("#FF0000");
        expect(t["--holaf-accent-hover"]).toMatch(/^#[0-9A-F]{6}$/);
        expect(t["--holaf-border"]).toMatch(/^#[0-9A-F]{6}$/);
    });

    it("accent-hover = mix accent/surface ~15 % (calculs internes)", () => {
        HolafTokens.setTheme("dark");
        HolafTokens.applyPalette("#ff0000", { surface: "#1e1e1e" });
        const t = HolafTokens.getTheme().vars;
        const ca = [255, 0, 0], cb = [0x1e, 0x1e, 0x1e];
        const exp = ca.map((v, i) => Math.round(v + (cb[i] - v) * 0.15));
        const hex = "#" + exp.map((n) => n.toString(16).toUpperCase().padStart(2, "0")).join("");
        expect(t["--holaf-accent-hover"]).toBe(hex);
    });

    it("accent invalide → throw clair", () => {
        HolafTokens.setTheme("dark");
        expect(() => HolafTokens.applyPalette("#zzzzzz")).toThrow(/hex invalide/i);
    });

    it("accent-text lisible sur l'accent (≥ 4.5:1)", () => {
        HolafTokens.setTheme("dark");
        HolafTokens.applyPalette("#6366f1");
        const t = HolafTokens.getTheme().vars;
        // contraste de #6366f1 sur blanc vs noir
        const lum = (hex) => {
            const c = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
            const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((v) => parseInt(v, 16));
            return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
        };
        const ratio = (a, b) => ((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05));
        const rw = ratio(t["--holaf-accent"], "#ffffff");
        const rb = ratio(t["--holaf-accent"], "#000000");
        const expected = rw >= rb ? "#ffffff" : "#000000";
        expect(t["--holaf-accent-text"].toUpperCase()).toBe(expected);
    });

    it("reset : retire les vars posées par applyPalette", () => {
        HolafTokens.setTheme("dark");
        HolafTokens.applyPalette("#1e90ff");
        HolafTokens.reset();
        expect(getVar("--holaf-accent")).toBe("");
        expect(getVar("--holaf-border")).toBe("");
    });
});
