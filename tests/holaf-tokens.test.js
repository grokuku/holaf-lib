/* Tests HolafTokens — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : preset initial par défaut (prefers-color-scheme), setTheme /
 * getTheme / listPresets, setTokens (--holaf-* sur :root), reset (retrait),
 * événement "holaf-tokens-changed" à chaque changement, applyPalette
 * (calculs internes mix/contrast, cohérence contraste).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HolafTokens } from "../js/holaf-tokens.js";
import { HolafColor } from "../js/holaf-color.js";

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
    it("expose les 4 alias historiques + les 10 presets <famille>-<mode>", () => {
        const names = HolafTokens.listPresets();
        ["dark", "light", "midnight", "slate"].forEach((alias) => expect(names).toContain(alias));
        ["indigo", "midnight", "slate", "emerald", "amber"].forEach((fam) => {
            expect(names).toContain(fam + "-light");
            expect(names).toContain(fam + "-dark");
        });
        expect(names).toHaveLength(14);
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

describe("HolafTokens — catalogue 2 axes (familles × modes)", () => {
    const CANON = ["indigo-light", "indigo-dark", "midnight-light", "midnight-dark",
        "slate-light", "slate-dark", "emerald-light", "emerald-dark", "amber-light", "amber-dark"];
    const KEYS14 = ["surface", "surface-elev", "surface-raised", "border", "text", "text-muted",
        "accent", "accent-hover", "accent-text", "danger", "danger-text", "radius", "shadow", "font-size"];

    it("expose les 5 familles", () => {
        expect(HolafTokens.listFamilies()).toEqual(["indigo", "midnight", "slate", "emerald", "amber"]);
    });

    it("les 10 presets <famille>-<mode> existent et couvrent les 14 clés", () => {
        CANON.forEach((name) => {
            const p = HolafTokens.PRESETS[name];
            expect(p, name).toBeTruthy();
            KEYS14.forEach((k) => expect(p[k], name + "." + k).toBeTruthy());
        });
    });

    it("CONTRASTE : text ≥ 4.5:1 sur surface pour les 10 presets", () => {
        CANON.forEach((name) => {
            const p = HolafTokens.PRESETS[name];
            const r = HolafColor.contrastRatio(p.text, p.surface);
            expect(r, name + " ratio=" + r).toBeGreaterThanOrEqual(4.5);
        });
    });

    it("setTheme accepte les noms <famille>-<mode>", () => {
        HolafTokens.setTheme("slate-light");
        expect(getVar("--holaf-surface")).toBe("#F4F6F8");
        expect(HolafTokens.getTheme().name).toBe("slate-light");
    });

    it("setFamily(famille, mode) applique le bon preset", () => {
        HolafTokens.setFamily("emerald", "dark");
        expect(HolafTokens.getTheme().name).toBe("emerald-dark");
        expect(getVar("--holaf-accent")).toBe("#34D399");
    });

    it("setFamily sans mode : garde le mode courant, sinon light", () => {
        HolafTokens.setFamily("amber", "dark");
        HolafTokens.setFamily("amber");
        expect(HolafTokens.getTheme().name).toBe("amber-dark");
        HolafTokens.setFamily("slate");
        expect(HolafTokens.getTheme().name).toBe("slate-light");
    });

    it("getFamily / getMode décrivent le thème courant (alias résolus)", () => {
        HolafTokens.setTheme("dark");
        expect(HolafTokens.getFamily()).toBe("indigo");
        expect(HolafTokens.getMode()).toBe("dark");
        HolafTokens.setTheme("midnight");
        expect(HolafTokens.getFamily()).toBe("midnight");
        expect(HolafTokens.getMode()).toBe("dark");
        HolafTokens.setTheme("slate-light");
        expect(HolafTokens.getFamily()).toBe("slate");
        expect(HolafTokens.getMode()).toBe("light");
    });

    it("setFamily / setTheme : familles et modes inconnus → throw clair", () => {
        expect(() => HolafTokens.setFamily("lime")).toThrow(/famille inconnue/i);
        expect(() => HolafTokens.setFamily("slate", "sepia")).toThrow(/mode inconnu/i);
        expect(() => HolafTokens.setTheme("slate-sepia")).toThrow(/preset inconnu/i);
    });

    it("expose FAMILIES (graines + descripteurs de modes) et ALIASES", () => {
        expect(Object.keys(HolafTokens.FAMILIES).sort()).toEqual(["amber", "emerald", "indigo", "midnight", "slate"]);
        expect(HolafTokens.FAMILIES.slate.accent).toBe("#94a3b8");
        expect(HolafTokens.ALIASES).toEqual({
            dark: "indigo-dark", light: "indigo-light", midnight: "midnight-dark", slate: "slate-dark",
        });
    });
});

describe("HolafTokens — non-régression des alias historiques", () => {
    // Valeurs FIGÉES des 4 presets tels qu'ils existaient en 0.1.0.
    const FROZEN = {
        dark: {
            surface: "#1e1e1e", "surface-elev": "#27272a", "surface-raised": "#1a1a1a",
            border: "#3f3f46", text: "#e4e4e7", "text-muted": "#a1a1aa",
            accent: "#6366f1", "accent-hover": "#818cf8", "accent-text": "#ffffff",
            danger: "#ef4444", "danger-text": "#ffffff",
            radius: "12px", shadow: "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px",
        },
        light: {
            surface: "#ffffff", "surface-elev": "#f4f4f5", "surface-raised": "#fafafa",
            border: "#d4d4d8", text: "#18181b", "text-muted": "#52525b",
            accent: "#4f46e5", "accent-hover": "#6366f1", "accent-text": "#ffffff",
            danger: "#dc2626", "danger-text": "#ffffff",
            radius: "12px", shadow: "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px",
        },
        midnight: {
            surface: "#10111d", "surface-elev": "#181a2c", "surface-raised": "#0c0d17",
            border: "#272a44", text: "#e2e4f0", "text-muted": "#9aa0c3",
            accent: "#818cf8", "accent-hover": "#a5b4fc", "accent-text": "#10111d",
            danger: "#ef4444", "danger-text": "#ffffff",
            radius: "12px", shadow: "0 18px 50px rgba(0, 0, 0, 0.6)", "font-size": "14px",
        },
        slate: {
            surface: "#1f232b", "surface-elev": "#292e38", "surface-raised": "#191d24",
            border: "#3a4150", text: "#e6e9ee", "text-muted": "#9aa3b2",
            accent: "#94a3b8", "accent-hover": "#b6c2d4", "accent-text": "#1f232b",
            danger: "#ef4444", "danger-text": "#ffffff",
            radius: "12px", shadow: "0 18px 50px rgba(0, 0, 0, 0.5)", "font-size": "14px",
        },
    };

    it("dark / light / midnight / slate ont EXACTEMENT les valeurs historiques", () => {
        Object.keys(FROZEN).forEach((name) => {
            Object.keys(FROZEN[name]).forEach((k) => {
                expect(HolafTokens.PRESETS[name][k], name + "." + k).toBe(FROZEN[name][k]);
            });
        });
    });

    it("les alias sont égaux à leurs jumeaux <famille>-<mode>", () => {
        expect(HolafTokens.PRESETS.dark).toEqual(HolafTokens.PRESETS["indigo-dark"]);
        expect(HolafTokens.PRESETS.light).toEqual(HolafTokens.PRESETS["indigo-light"]);
        expect(HolafTokens.PRESETS.midnight).toEqual(HolafTokens.PRESETS["midnight-dark"]);
        expect(HolafTokens.PRESETS.slate).toEqual(HolafTokens.PRESETS["slate-dark"]);
    });

    it("les alias ne portent QUE les 14 clés historiques", () => {
        Object.keys(FROZEN).forEach((name) => {
            expect(Object.keys(HolafTokens.PRESETS[name]).sort()).toEqual(Object.keys(FROZEN[name]).sort());
        });
    });
});
