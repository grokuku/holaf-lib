/* Tests HolafTokens — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : preset initial par défaut (prefers-color-scheme), setTheme /
 * getTheme / listPresets, setTokens (--holaf-* sur :root), reset (retrait),
 * événement "holaf-tokens-changed" à chaque changement, applyPalette
 * (calculs internes mix/contrast, cohérence contraste).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import "../js/holaf-tokens.js";
import { HolafColor } from "../js/holaf-color.js";

// 0.3.0 : la brique n'expose plus d'export ESM nommé (correctif « fichier
// classic-compatible »). On l'importe par effet de bord, puis on lit la globale.
const { HolafTokens } = window;

// Garde-fou statique : source du fichier (test « pas d'export top-level »).
// Chemin relatif à la racine du projet (cwd du runner vitest).
const TOKENS_SRC = readFileSync("js/holaf-tokens.js", "utf8");

function hexToRgb(h) {
    const s = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function mix(a, b, r) {
    const ca = hexToRgb(a); const cb = hexToRgb(b);
    return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * r)
        .toString(16).toUpperCase().padStart(2, "0")).join("");
}
function rgba(h, a) {
    const c = hexToRgb(h);
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + a + ")";
}

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

afterEach(() => {
    // Le registre de packs est global au module (volatile) : on retire les
    // packs enregistrés par un test pour ne pas polluer les suivants.
    HolafTokens.listPresets().slice(14).forEach((n) => HolafTokens.unregisterPreset(n));
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

describe("HolafTokens 0.3.0 — non-régression (snapshot des 14 presets)", () => {
    // Snapshot FIGÉ des 14 presets tels que produits par la 0.2.0 d'origine
    // (généré puis collé — garde-fou contre toute retouche accidentelle).
    const FROZEN_14 = {
        "indigo-light": {
            "surface": "#ffffff", "surface-elev": "#f4f4f5", "surface-raised": "#fafafa",
            "border": "#d4d4d8", "text": "#18181b", "text-muted": "#52525b",
            "accent": "#4f46e5", "accent-hover": "#6366f1", "accent-text": "#ffffff",
            "danger": "#dc2626", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px",
        },
        "indigo-dark": {
            "surface": "#1e1e1e", "surface-elev": "#27272a", "surface-raised": "#1a1a1a",
            "border": "#3f3f46", "text": "#e4e4e7", "text-muted": "#a1a1aa",
            "accent": "#6366f1", "accent-hover": "#818cf8", "accent-text": "#ffffff",
            "danger": "#ef4444", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px",
        },
        "midnight-light": {
            "surface": "#F6F7FC", "surface-elev": "#FFFFFF", "surface-raised": "#E6E8F8",
            "border": "#D4D6F3", "text": "#18181B", "text-muted": "#75767A",
            "accent": "#5B63D3", "accent-hover": "#747ADA", "accent-text": "#ffffff",
            "danger": "#DC2626", "danger-hover": "#E14747", "danger-text": "#ffffff",
            "radius": "12px", "shadow": "0 4px 16px rgba(0, 0, 0, 0.12)", "font-size": "14px",
        },
        "midnight-dark": {
            "surface": "#10111d", "surface-elev": "#181a2c", "surface-raised": "#0c0d17",
            "border": "#272a44", "text": "#e2e4f0", "text-muted": "#9aa0c3",
            "accent": "#818cf8", "accent-hover": "#a5b4fc", "accent-text": "#10111d",
            "danger": "#ef4444", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(0, 0, 0, 0.6)", "font-size": "14px",
        },
        "slate-light": {
            "surface": "#F4F6F8", "surface-elev": "#FFFFFF", "surface-raised": "#E3E6E9",
            "border": "#CED3D9", "text": "#18181B", "text-muted": "#747578",
            "accent": "#475569", "accent-hover": "#636F80", "accent-text": "#ffffff",
            "danger": "#DC2626", "danger-hover": "#E14747", "danger-text": "#ffffff",
            "radius": "12px", "shadow": "0 4px 16px rgba(0, 0, 0, 0.12)", "font-size": "14px",
        },
        "slate-dark": {
            "surface": "#1f232b", "surface-elev": "#292e38", "surface-raised": "#191d24",
            "border": "#3a4150", "text": "#e6e9ee", "text-muted": "#9aa3b2",
            "accent": "#94a3b8", "accent-hover": "#b6c2d4", "accent-text": "#1f232b",
            "danger": "#ef4444", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(0, 0, 0, 0.5)", "font-size": "14px",
        },
        "emerald-light": {
            "surface": "#FFFFFF", "surface-elev": "#F0FDF4", "surface-raised": "#CDE9DC",
            "border": "#C8E1DA", "text": "#18181B", "text-muted": "#79797B",
            "accent": "#047857", "accent-hover": "#278C6F", "accent-text": "#ffffff",
            "danger": "#DC2626", "danger-hover": "#DF4645", "danger-text": "#ffffff",
            "radius": "12px", "shadow": "0 4px 16px rgba(0, 0, 0, 0.12)", "font-size": "14px",
        },
        "emerald-dark": {
            "surface": "#0B1512", "surface-elev": "#12201A", "surface-raised": "#173B2D",
            "border": "#143F30", "text": "#F4F4F5", "text-muted": "#929696",
            "accent": "#34D399", "accent-hover": "#2FB886", "accent-text": "#000000",
            "danger": "#EF4444", "danger-hover": "#CE3F3E", "danger-text": "#000000",
            "radius": "12px", "shadow": "0 4px 16px rgba(0, 0, 0, 0.12)", "font-size": "14px",
        },
        "amber-light": {
            "surface": "#FFFFFF", "surface-elev": "#FFFBEB", "surface-raised": "#F4E2C9",
            "border": "#EFD9C9", "text": "#18181B", "text-muted": "#79797B",
            "accent": "#B45309", "accent-hover": "#BF6C2B", "accent-text": "#ffffff",
            "danger": "#DC2626", "danger-hover": "#E14644", "danger-text": "#ffffff",
            "radius": "12px", "shadow": "0 4px 16px rgba(0, 0, 0, 0.12)", "font-size": "14px",
        },
        "amber-dark": {
            "surface": "#1A1408", "surface-elev": "#241C0D", "surface-raised": "#443410",
            "border": "#4C3A0E", "text": "#F4F4F5", "text-muted": "#989691",
            "accent": "#FBBF24", "accent-hover": "#DBA721", "accent-text": "#000000",
            "danger": "#EF4444", "danger-hover": "#D13E3C", "danger-text": "#000000",
            "radius": "12px", "shadow": "0 4px 16px rgba(0, 0, 0, 0.12)", "font-size": "14px",
        },
        "dark": {
            "surface": "#1e1e1e", "surface-elev": "#27272a", "surface-raised": "#1a1a1a",
            "border": "#3f3f46", "text": "#e4e4e7", "text-muted": "#a1a1aa",
            "accent": "#6366f1", "accent-hover": "#818cf8", "accent-text": "#ffffff",
            "danger": "#ef4444", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px",
        },
        "light": {
            "surface": "#ffffff", "surface-elev": "#f4f4f5", "surface-raised": "#fafafa",
            "border": "#d4d4d8", "text": "#18181b", "text-muted": "#52525b",
            "accent": "#4f46e5", "accent-hover": "#6366f1", "accent-text": "#ffffff",
            "danger": "#dc2626", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px",
        },
        "midnight": {
            "surface": "#10111d", "surface-elev": "#181a2c", "surface-raised": "#0c0d17",
            "border": "#272a44", "text": "#e2e4f0", "text-muted": "#9aa0c3",
            "accent": "#818cf8", "accent-hover": "#a5b4fc", "accent-text": "#10111d",
            "danger": "#ef4444", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(0, 0, 0, 0.6)", "font-size": "14px",
        },
        "slate": {
            "surface": "#1f232b", "surface-elev": "#292e38", "surface-raised": "#191d24",
            "border": "#3a4150", "text": "#e6e9ee", "text-muted": "#9aa3b2",
            "accent": "#94a3b8", "accent-hover": "#b6c2d4", "accent-text": "#1f232b",
            "danger": "#ef4444", "danger-text": "#ffffff", "radius": "12px",
            "shadow": "0 18px 50px rgba(0, 0, 0, 0.5)", "font-size": "14px",
        },
    };

    it("les 14 presets intégrés sont identiques au snapshot 0.2.0 (clé par clé)", () => {
        expect(Object.keys(HolafTokens.PRESETS).sort()).toEqual(Object.keys(FROZEN_14).sort());
        Object.keys(FROZEN_14).forEach((name) => {
            expect(HolafTokens.PRESETS[name], name).toEqual(FROZEN_14[name]);
        });
    });
});

describe("HolafTokens 0.3.0 — purge par possession d'ensemble", () => {
    it("emerald-dark → dark : danger-hover (clé générée) est retirée", () => {
        HolafTokens.setTheme("emerald-dark");
        expect(getVar("--holaf-danger-hover")).not.toBe("");
        HolafTokens.setTheme("dark");
        expect(getVar("--holaf-danger-hover")).toBe("");
        expect(getVar("--holaf-surface")).toBe("#1e1e1e");
    });

    it("reset() retire TOUT le set possédé (clés d'applications antérieures incluses)", () => {
        HolafTokens.setTheme("emerald-dark");
        expect(getVar("--holaf-danger-hover")).not.toBe("");
        HolafTokens.setTokens({ values: { ok: "#26e6a5", "accent-soft": "#123456" } });
        // la purge a déjà retiré danger-hover (posée puis absente du nouveau lot)
        expect(getVar("--holaf-danger-hover")).toBe("");
        expect(getVar("--holaf-ok")).toBe("#26e6a5");
        HolafTokens.reset();
        expect(getVar("--holaf-ok")).toBe("");
        expect(getVar("--holaf-accent-soft")).toBe("");
        expect(HolafTokens.getTheme()).toBeNull();
    });

    it("les variables posées HORS brique ne sont jamais touchées", () => {
        document.documentElement.style.setProperty("--ma-var", "#abcdef");
        HolafTokens.setTheme("slate-light");
        HolafTokens.reset();
        expect(getVar("--ma-var")).toBe("#abcdef");
        document.documentElement.style.removeProperty("--ma-var");
    });
});

describe("HolafTokens 0.3.0 — registre de packs", () => {
    it("registerPreset : retourne { name, vars } et n'émet PAS d'événement", () => {
        const events = collectEvents();
        const r = HolafTokens.registerPreset("test-a", { accent: "#e94560" });
        expect(r.name).toBe("test-a");
        // spec explicite conservée VERBATIM (seules les dérivées sont normalisées)
        expect(r.vars.accent).toBe("#e94560");
        expect(events.length).toBe(0);
    });

    it("copie protégée : muter l'entrée/sortie n'affecte pas le registre", () => {
        const tokens = { accent: "#123456" };
        const r = HolafTokens.registerPreset("test-copy", tokens);
        tokens.accent = "#ffffff";
        r.vars.accent = "#000000";
        expect(HolafTokens.getPreset("test-copy").accent).toBe("#123456");
    });

    it("noms réservés (preset / alias / famille) → throw", () => {
        expect(() => HolafTokens.registerPreset("dark", {})).toThrow(/réservé/i);
        expect(() => HolafTokens.registerPreset("emerald-dark", {})).toThrow(/réservé/i);
        expect(() => HolafTokens.registerPreset("emerald", {})).toThrow(/réservé/i);
    });

    it("nom vide → throw", () => {
        expect(() => HolafTokens.registerPreset("", {})).toThrow(/vide/i);
        expect(() => HolafTokens.registerPreset("   ", {})).toThrow(/vide/i);
    });

    it("extends inconnu → throw ; options.derive invalide → throw", () => {
        expect(() => HolafTokens.registerPreset("test-b", {}, { extends: "nope" })).toThrow(/extends/i);
        expect(() => HolafTokens.registerPreset("test-b", {}, { derive: "oui" })).toThrow(/derive/i);
    });

    it("extends intégré : hérite + dérive depuis la spec", () => {
        const r = HolafTokens.registerPreset("test-ext", { accent: "#e94560" }, { extends: "indigo-dark" });
        expect(r.vars.surface).toBe("#1e1e1e");
        expect(r.vars.accent).toBe("#e94560");
        expect(r.vars["accent-soft"]).toBe("rgba(233, 69, 96, 0.16)");
        expect(r.vars["accent-gradient"]).toBe("linear-gradient(135deg, #E94560, #818CF8)");
    });

    it("extends alias et extends pack (dérivées héritées telles quelles)", () => {
        HolafTokens.registerPreset("test-base", { accent: "#10b981" });
        const child = HolafTokens.registerPreset("test-child", {}, { extends: "test-base" });
        expect(child.vars.accent).toBe("#10b981");
        expect(child.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const grand = HolafTokens.registerPreset("test-grand", {}, { extends: "test-child" });
        expect(grand.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const alias = HolafTokens.registerPreset("test-alias", { accent: "#abcdef" }, { extends: "dark" });
        expect(alias.vars.surface).toBe("#1e1e1e");
    });

    it("spec explicite jamais écrasée par une dérivation", () => {
        const r = HolafTokens.registerPreset("test-spec", { accent: "#e94560", "accent-soft": "rebeccapurple" });
        expect(r.vars["accent-soft"]).toBe("rebeccapurple");
    });

    it("derive:false → aucune dérivation ; derive:[…] → ciblée, opt-ins hors défaut", () => {
        const off = HolafTokens.registerPreset("test-noderive", { accent: "#e94560" }, { derive: false });
        expect(off.vars["accent-soft"]).toBeUndefined();
        const optin = HolafTokens.registerPreset("test-optin", { accent: "#e94560" },
            { extends: "emerald-dark", derive: ["danger-gradient", "radius-sm"] });
        expect(optin.vars["danger-gradient"]).toMatch(/^linear-gradient\(135deg, #EF4444, #CE3F3E\)$/);
        expect(optin.vars["radius-sm"]).toBe("calc(12px - 2px)");
        expect(optin.vars["accent-soft"]).toBeUndefined(); // hors liste demandée
    });

    it("remplacement d'un enregistrement ; unregisterPreset", () => {
        HolafTokens.registerPreset("test-re", { accent: "#111111" });
        HolafTokens.registerPreset("test-re", { accent: "#222222" });
        expect(HolafTokens.getPreset("test-re").accent).toBe("#222222");
        expect(HolafTokens.unregisterPreset("test-re")).toBe(true);
        expect(HolafTokens.getPreset("test-re")).toBeNull();
        expect(HolafTokens.unregisterPreset("test-re")).toBe(false);
        expect(HolafTokens.unregisterPreset("dark")).toBe(false); // intégré jamais dans PACKS
    });

    it("listPresets = les 14 intégrés PUIS les packs dans l'ordre d'enregistrement", () => {
        expect(HolafTokens.listPresets()).toHaveLength(14);
        HolafTokens.registerPreset("test-p1", {});
        HolafTokens.registerPreset("test-p2", {});
        const list = HolafTokens.listPresets();
        expect(list[0]).toBe("indigo-light");
        expect(list[13]).toBe("slate");
        expect(list.slice(14)).toEqual(["test-p1", "test-p2"]);
        expect(list.slice(0, 14)).not.toContain("test-p1");
    });

    it("setTheme(pack) émet l'événement ; getFamily/getMode → null", () => {
        HolafTokens.registerPreset("test-theme", { accent: "#e94560", surface: "#05060b", text: "#ffffff" });
        const events = collectEvents();
        HolafTokens.setTheme("test-theme");
        expect(events.length).toBe(1);
        expect(events[0].theme).toBe("test-theme");
        expect(getVar("--holaf-accent")).toBe("#e94560");
        expect(HolafTokens.getFamily()).toBeNull();
        expect(HolafTokens.getMode()).toBeNull();
    });

    it("updatePreset : fusion + re-dérivation ; spec re-fournie respectée ; throws", () => {
        HolafTokens.registerPreset("test-up", { accent: "#e94560" }, { extends: "indigo-dark" });
        const r = HolafTokens.updatePreset("test-up", { accent: "#10b981" });
        expect(r.vars.accent).toBe("#10b981");
        expect(r.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const r2 = HolafTokens.updatePreset("test-up", { "accent-soft": "hotpink" });
        expect(r2.vars["accent-soft"]).toBe("hotpink");
        expect(() => HolafTokens.updatePreset("dark", {})).toThrow(/intégré/i);
        expect(() => HolafTokens.updatePreset("nope", {})).toThrow(/inconnu/i);
        expect(() => HolafTokens.updatePreset("test-up", 42)).toThrow(/tokens/i);
    });

    it("updatePreset n'émet PAS d'événement", () => {
        HolafTokens.registerPreset("test-ev", { accent: "#e94560" });
        const events = collectEvents();
        HolafTokens.updatePreset("test-ev", { accent: "#111111" });
        expect(events.length).toBe(0);
    });

    it("getPreset : copie d'un intégré/alias, null si inconnu, copie protégée", () => {
        const p = HolafTokens.getPreset("dark");
        expect(p.surface).toBe("#1e1e1e");
        p.surface = "#000000";
        expect(HolafTokens.getPreset("dark").surface).toBe("#1e1e1e");
        expect(HolafTokens.getPreset("slate-light").surface).toBe("#F4F6F8");
        expect(HolafTokens.getPreset("nope")).toBeNull();
    });
});

describe("HolafTokens 0.3.0 — dérivations", () => {
    it("formules exactes depuis indigo-dark (groupe A + skip des états absents)", () => {
        const v = HolafTokens.registerPreset("test-der", {}, { extends: "indigo-dark" }).vars;
        expect(v["accent-soft"]).toBe("rgba(99, 102, 241, 0.16)");
        expect(v["accent-glow"]).toBe("rgba(99, 102, 241, 0.5)");
        expect(v["accent-gradient"]).toBe("linear-gradient(135deg, #6366F1, #818CF8)");
        expect(v["accent-gradient-hover"]).toBe(
            "linear-gradient(135deg, " + mix("#6366f1", "#ffffff", 0.12) + ", " + mix("#818cf8", "#ffffff", 0.12) + ")"
        );
        expect(v["accent-shadow"]).toBe("0 0 18px var(--holaf-accent-soft)");
        expect(v["danger-soft"]).toBe("rgba(239, 68, 68, 0.12)");
        expect(v["danger-shadow"]).toBe("0 0 16px var(--holaf-danger-soft)");
        expect(v["border-muted"]).toBe("rgba(63, 63, 70, 0.45)");
        expect(v["text-faint"]).toBe(mix("#a1a1aa", "#1e1e1e", 0.42));
        expect(v["surface-hover"]).toBe("rgba(26, 26, 26, 0.7)");
        expect(v["chrome-header"]).toBe("linear-gradient(180deg, rgba(30, 30, 30, 0.92), rgba(30, 30, 30, 0.66))");
        expect(v["chrome-footer"]).toBe("linear-gradient(0deg, rgba(30, 30, 30, 0.95), rgba(30, 30, 30, 0.66))");
        // opt-ins HORS défaut
        expect(v["danger-gradient"]).toBeUndefined();
        expect(v["radius-sm"]).toBeUndefined();
        expect(v["txt-glow"]).toBeUndefined();
        // états non fournis → clé non posée
        expect(v["ok-text"]).toBeUndefined();
        expect(v["ok-soft"]).toBeUndefined();
        expect(v["warn-text"]).toBeUndefined();
    });

    it("source non-hex → dérivation sautée silencieusement (aucune erreur)", () => {
        const v = HolafTokens.registerPreset("test-nonhex", { accent: "var(--brand)", surface: "#05060b" }).vars;
        expect(v["accent-soft"]).toBeUndefined();
        expect(v["accent-glow"]).toBeUndefined();
        expect(v["accent-gradient"]).toBeUndefined();
        expect(v["accent-gradient-hover"]).toBeUndefined();
        expect(v["accent-shadow"]).toBeUndefined();
        // chrome reste dérivable depuis surface
        expect(v["chrome-header"]).toMatch(/^linear-gradient\(180deg, rgba\(5, 6, 11, 0\.92\)/);
    });

    it("ok-text / warn-text lisibles (≥ 4.5:1) quand possible", () => {
        const v = HolafTokens.registerPreset("test-ok", { ok: "#26e6a5", warn: "#f59e0b" }).vars;
        expect(v["ok-text"]).toBe("#000000");
        expect(v["ok-soft"]).toBe("rgba(38, 230, 165, 0.1)");
        expect(v["warn-text"]).toMatch(/^#[0-9A-F]{6}$/);
    });
});

describe("HolafTokens 0.3.0 — alpha()", () => {
    it("hex → rgba, alpha borné à [0, 1], défaut 1", () => {
        expect(HolafTokens.alpha("#6366f1", 0.16)).toBe("rgba(99, 102, 241, 0.16)");
        expect(HolafTokens.alpha("#fff", 1.5)).toBe("rgba(255, 255, 255, 1)");
        expect(HolafTokens.alpha("#000", -1)).toBe("rgba(0, 0, 0, 0)");
        expect(HolafTokens.alpha("#6366f1")).toBe("rgba(99, 102, 241, 1)");
    });

    it("non-hex / alpha non numérique → pass-through inchangé", () => {
        expect(HolafTokens.alpha("var(--x)", 0.5)).toBe("var(--x)");
        expect(HolafTokens.alpha("#6366f1", "x")).toBe("#6366f1");
    });
});

describe("HolafTokens 0.3.0 — chargement (sans export nommé)", () => {
    it("la globale est posée par effet de bord et VERSION = 0.3.0", () => {
        expect(window.HolafTokens).toBe(HolafTokens);
        expect(HolafTokens.VERSION).toBe("0.3.0");
    });

    it("garde-fou statique : AUCUN export top-level dans le fichier", () => {
        expect(TOKENS_SRC).not.toMatch(/^export\b/m);
        expect(TOKENS_SRC).toMatch(/window\.HolafTokens = HolafTokens/);
        expect(TOKENS_SRC).toMatch(/globalThis\.HolafTokens = HolafTokens/);
    });
});
