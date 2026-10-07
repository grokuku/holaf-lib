/* Tests HolafTokens — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : preset initial par défaut (prefers-color-scheme), setTheme /
 * getTheme / listPresets, setTokens (--holaf-* sur :root), reset (retrait),
 * événement "holaf-tokens-changed" à chaque changement, applyPalette
 * (calculs internes mix/contrast, cohérence contraste), catalogue V2 (6 familles
 * × 2 modes + 4 alias remappés), GARDE V2 (fonds/accents distincts, profondeur),
 * table MIGRATIONS, registre de packs, dérivations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import "../js/holaf-tokens.js";
import { HolafColor } from "../js/holaf-color.js";
import {
    checkCatalogGuard, selftestBadCatalog, deltaEok,
    AA_TEXT, AA_NONTEXT, ACCENT_SEP, SURFACE_SEP, DEPTH_SEP,
} from "./helpers/theme-guard.js";

// 0.3.0 : la brique n'expose plus d'export ESM nommé (correctif « fichier
// classic-compatible »). On l'importe par effet de bord, puis on lit la globale.
const { HolafTokens } = window;

// Garde-fou statique : source du fichier (test « pas d'export top-level »).
// Chemin relatif à la racine du projet (cwd du runner vitest).
const TOKENS_SRC = readFileSync("js/holaf-tokens.js", "utf8");

// Liste canonique des 12 presets V2 (ordre des familles × modes).
const CANON = [
    "corail-light", "corail-dark",
    "ambre-light", "ambre-dark",
    "emeraude-light", "emeraude-dark",
    "turquoise-light", "turquoise-dark",
    "amethyste-light", "amethyste-dark",
    "neutre-light", "neutre-dark",
];
const ALIAS_NAMES = ["dark", "light", "midnight", "slate"];
// 15 clés standard + surface-hover (4ᵉ palier de profondeur).
const KEYS16 = [
    "surface", "surface-elev", "surface-raised", "surface-hover", "border", "text",
    "text-muted", "accent", "accent-hover", "accent-text", "danger", "danger-hover",
    "danger-text", "radius", "shadow", "font-size",
];

function hexToRgb(h) {
    const s = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function mix(a, b, r) {
    const ca = hexToRgb(a); const cb = hexToRgb(b);
    return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * r)
        .toString(16).toUpperCase().padStart(2, "0")).join("");
}

function getVar(name) {
    return document.documentElement.style.getPropertyValue(name);
}
function collectEvents() {
    const events = [];
    document.addEventListener("holaf-tokens-changed", (e) => events.push(e.detail));
    return events;
}
// Range les 12 presets intégrés en lignes pour la garde V2.
function guardRows() {
    const rows = [];
    for (const fam of HolafTokens.listFamilies()) {
        for (const mode of ["dark", "light"]) {
            const p = HolafTokens.PRESETS[fam + "-" + mode];
            rows.push({
                family: fam, mode,
                accent: p.accent, onAccent: p["accent-text"],
                surface: p.surface, surfaceElev: p["surface-elev"],
                surfaceRaised: p["surface-raised"], surfaceHover: p["surface-hover"],
                textMuted: p["text-muted"],
            });
        }
    }
    return rows;
}

beforeEach(() => {
    // Réinitialise l'état : on retire les vars posées au chargement / tests.
    HolafTokens.reset();
    vi.restoreAllMocks();
});

afterEach(() => {
    // Le registre de packs est global au module (volatile) : on retire les
    // packs enregistrés par un test pour ne pas polluer les suivants.
    HolafTokens.listPresets().slice(16).forEach((n) => HolafTokens.unregisterPreset(n));
});

describe("HolafTokens — presets", () => {
    it("expose les 4 alias historiques + les 12 presets <famille>-<mode>", () => {
        const names = HolafTokens.listPresets();
        ALIAS_NAMES.forEach((alias) => expect(names).toContain(alias));
        CANON.forEach((name) => expect(names).toContain(name));
        expect(names).toHaveLength(16);
    });

    it("setTheme : pose les variables --holaf-* sur :root", () => {
        HolafTokens.setTheme("dark"); // alias → amethyste-dark
        expect(getVar("--holaf-surface")).toBe("#1e1f2e");
        expect(getVar("--holaf-text")).toBe("#eff0f4");
        expect(getVar("--holaf-accent")).toBe("#a1a3ff");
        expect(getVar("--holaf-radius")).toBe("12px");
    });

    it("setTheme : preset inconnu → throw clair", () => {
        expect(() => HolafTokens.setTheme("lime")).toThrow(/preset inconnu/i);
    });

    it("getTheme : retourne { name, vars } du preset appliqué", () => {
        HolafTokens.setTheme("midnight"); // alias → amethyste-dark
        const t = HolafTokens.getTheme();
        expect(t.name).toBe("midnight");
        expect(t.vars["--holaf-surface"]).toBe("#1e1f2e");
        expect(t.vars["--holaf-accent-text"]).toBe("#0b0b12");
    });

    it("getTheme : renvoie null après reset", () => {
        HolafTokens.setTheme("light");
        HolafTokens.reset();
        expect(HolafTokens.getTheme()).toBeNull();
        // et les vars sont retirées
        expect(getVar("--holaf-surface")).toBe("");
    });

    it("contraste : le texte ≥ 4.5:1 sur la surface pour chaque preset", () => {
        HolafTokens.listPresets().forEach((name) => {
            const p = HolafTokens.PRESETS[name];
            const r = HolafColor.contrastRatio(p.text, p.surface);
            expect(r, name + " ratio=" + r).toBeGreaterThanOrEqual(4.5);
        });
    });
});

describe("HolafTokens — GARDE V2 (catalogue)", () => {
    it("fonds/accents distincts par mode, texte/accent, non-textuel, profondeur", () => {
        const violations = checkCatalogGuard(guardRows());
        expect(violations).toEqual([]);
    });

    it("profondeur : les 4 paliers sont distincts (ΔEok ≥ seuil) pour les 12 presets", () => {
        for (const fam of HolafTokens.listFamilies()) {
            for (const mode of ["dark", "light"]) {
                const p = HolafTokens.PRESETS[fam + "-" + mode];
                const steps = [
                    [p.surface, p["surface-elev"]],
                    [p["surface-elev"], p["surface-raised"]],
                    [p["surface-raised"], p["surface-hover"]],
                ];
                for (const [a, b] of steps) {
                    expect(deltaEok(a, b), fam + "-" + mode).toBeGreaterThanOrEqual(DEPTH_SEP);
                }
            }
        }
    });

    it("NON VACUE : la garde ÉCHOUE sur un catalogue volontairement redondant", () => {
        const bad = selftestBadCatalog(guardRows());
        const violations = checkCatalogGuard(bad);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.some((v) => v.kind === "accent-proches")).toBe(true);
        expect(violations.some((v) => v.kind === "texte-sur-accent")).toBe(true);
        // PATCH 0.4.1 : le contrôle du TEXTE ATTÉNUÉ n'est pas vacant non plus.
        expect(violations.some((v) => v.kind === "texte-attenue")).toBe(true);
    });

    it("seuils exposés conformes à la maquette V2", () => {
        expect([AA_TEXT, AA_NONTEXT, ACCENT_SEP, SURFACE_SEP, DEPTH_SEP]).toEqual([4.5, 3.0, 0.04, 0.04, 0.02]);
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
        // accent-hover = mix(accent, surface DU PRESET DE BASE, 15 %) ; la base
        // de setTheme("dark") est amethyste-dark (surface #1e1f2e).
        const ca = [255, 0, 0], cb = hexToRgb(HolafTokens.PRESETS.dark.surface);
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
    it("expose les 6 familles (ordre des teintes)", () => {
        expect(HolafTokens.listFamilies()).toEqual(["corail", "ambre", "emeraude", "turquoise", "amethyste", "neutre"]);
    });

    it("les 12 presets <famille>-<mode> existent et couvrent les 16 clés", () => {
        CANON.forEach((name) => {
            const p = HolafTokens.PRESETS[name];
            expect(p, name).toBeTruthy();
            KEYS16.forEach((k) => expect(p[k], name + "." + k).toBeTruthy());
            expect(Object.keys(p).sort()).toEqual(KEYS16.slice().sort());
        });
    });

    it("CONTRASTE : text ≥ 4.5:1 sur surface pour les 12 presets", () => {
        CANON.forEach((name) => {
            const p = HolafTokens.PRESETS[name];
            const r = HolafColor.contrastRatio(p.text, p.surface);
            expect(r, name + " ratio=" + r).toBeGreaterThanOrEqual(4.5);
        });
    });

    it("setTheme accepte les noms <famille>-<mode>", () => {
        HolafTokens.setTheme("turquoise-light");
        expect(getVar("--holaf-surface")).toBe("#c3e2e8");
        expect(HolafTokens.getTheme().name).toBe("turquoise-light");
    });

    it("setFamily(famille, mode) applique le bon preset", () => {
        HolafTokens.setFamily("emeraude", "dark");
        expect(HolafTokens.getTheme().name).toBe("emeraude-dark");
        expect(getVar("--holaf-accent")).toBe("#7fc765");
    });

    it("setFamily sans mode : garde le mode courant, sinon light", () => {
        HolafTokens.setFamily("ambre", "dark");
        HolafTokens.setFamily("ambre");
        expect(HolafTokens.getTheme().name).toBe("ambre-dark");
        HolafTokens.setFamily("neutre");
        expect(HolafTokens.getTheme().name).toBe("neutre-light");
    });

    it("getFamily / getMode décrivent le thème courant (alias résolus)", () => {
        HolafTokens.setTheme("dark");
        expect(HolafTokens.getFamily()).toBe("amethyste");
        expect(HolafTokens.getMode()).toBe("dark");
        HolafTokens.setTheme("midnight");
        expect(HolafTokens.getFamily()).toBe("amethyste");
        expect(HolafTokens.getMode()).toBe("dark");
        HolafTokens.setTheme("turquoise-light");
        expect(HolafTokens.getFamily()).toBe("turquoise");
        expect(HolafTokens.getMode()).toBe("light");
    });

    it("setFamily / setTheme : familles et modes inconnus → throw clair", () => {
        expect(() => HolafTokens.setFamily("lime")).toThrow(/famille inconnue/i);
        expect(() => HolafTokens.setFamily("neutre", "sepia")).toThrow(/mode inconnu/i);
        expect(() => HolafTokens.setTheme("neutre-sepia")).toThrow(/preset inconnu/i);
    });

    it("expose FAMILIES (libellé + teinte + descripteurs de modes) et ALIASES", () => {
        expect(Object.keys(HolafTokens.FAMILIES).sort()).toEqual(["ambre", "amethyste", "corail", "emeraude", "neutre", "turquoise"]);
        expect(HolafTokens.FAMILIES.neutre.hue).toBe(250);
        expect(HolafTokens.FAMILIES.neutre.light.accent).toBe("#515457");
        expect(HolafTokens.ALIASES).toEqual({
            dark: "amethyste-dark", light: "amethyste-light", midnight: "amethyste-dark", slate: "neutre-dark",
        });
    });
});

describe("HolafTokens 0.4.0 — alias remappés & table MIGRATIONS", () => {
    it("les alias sont égaux à leurs nouveaux jumeaux <famille>-<mode>", () => {
        expect(HolafTokens.PRESETS.dark).toEqual(HolafTokens.PRESETS["amethyste-dark"]);
        expect(HolafTokens.PRESETS.light).toEqual(HolafTokens.PRESETS["amethyste-light"]);
        expect(HolafTokens.PRESETS.midnight).toEqual(HolafTokens.PRESETS["amethyste-dark"]);
        expect(HolafTokens.PRESETS.slate).toEqual(HolafTokens.PRESETS["neutre-dark"]);
    });

    it("MIGRATIONS : les 10 anciennes familles + 4 alias pointent vers un preset VALIDE", () => {
        const M = HolafTokens.MIGRATIONS;
        const OLD = [
            "indigo-light", "indigo-dark", "midnight-light", "midnight-dark",
            "slate-light", "slate-dark", "emerald-light", "emerald-dark",
            "amber-light", "amber-dark", "dark", "light", "midnight", "slate",
        ];
        expect(Object.keys(M).sort()).toEqual(OLD.slice().sort());
        for (const [oldName, newName] of Object.entries(M)) {
            expect(HolafTokens.PRESETS[newName], oldName + " → " + newName).toBeTruthy();
        }
    });
});

describe("HolafTokens 0.4.0 — snapshot des 12 presets V2 + 4 alias", () => {
    // Snapshot FIGÉ des 16 presets (12 V2 + 4 alias) — garde-fou contre toute
    // retouche accidentelle des valeurs calculées depuis la maquette V2.
    const FROZEN_12 = {
        "corail-light": { "surface": "#ffe3ed", "surface-elev": "#fefefe", "surface-raised": "#f5d9e3", "surface-hover": "#ebcfd9", "border": "#d9b9c4", "text": "#2f2227", "text-muted": "#665159", "accent": "#9c045e", "accent-hover": "#ab2573", "accent-text": "#ffffff", "danger": "#c62222", "danger-hover": "#cf3f40", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "corail-dark": { "surface": "#36252c", "surface-elev": "#433037", "surface-raised": "#503b43", "surface-hover": "#5d464f", "border": "#735963", "text": "#f4eef0", "text-muted": "#ccb7bf", "accent": "#fa7fb5", "accent-hover": "#dd72a0", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#db6667", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "ambre-light": { "surface": "#dcc8b5", "surface-elev": "#fefefe", "surface-raised": "#d2bfac", "surface-hover": "#c9b5a3", "border": "#b6a08b", "text": "#2d251c", "text-muted": "#54473b", "accent": "#7a4800", "accent-hover": "#895b1b", "accent-text": "#ffffff", "danger": "#a51d1d", "danger-hover": "#ad3734", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "ambre-dark": { "surface": "#0c0400", "surface-elev": "#170b02", "surface-raised": "#221508", "surface-hover": "#2e1f10", "border": "#42301f", "text": "#f3efec", "text-muted": "#b9a593", "accent": "#f29a2d", "accent-hover": "#d08426", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d56160", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "emeraude-light": { "surface": "#c9dac4", "surface-elev": "#fdfffc", "surface-raised": "#c0d0bb", "surface-hover": "#b6c6b1", "border": "#a0b29a", "text": "#22291f", "text-muted": "#465143", "accent": "#276701", "accent-hover": "#3f781e", "accent-text": "#ffffff", "danger": "#b01e1e", "danger-hover": "#b43a37", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "emeraude-dark": { "surface": "#081005", "surface-elev": "#111b0d", "surface-raised": "#1a2617", "surface-hover": "#253120", "border": "#354430", "text": "#eef1ed", "text-muted": "#9faf9a", "accent": "#7fc765", "accent-hover": "#6dac57", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d46261", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "turquoise-light": { "surface": "#c3e2e8", "surface-elev": "#fdffff", "surface-raised": "#b9d9de", "surface-hover": "#b0cfd5", "border": "#97bbc2", "text": "#1b292c", "text-muted": "#42585c", "accent": "#07606c", "accent-hover": "#23747f", "accent-text": "#ffffff", "danger": "#bb2020", "danger-hover": "#bc3d3e", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "turquoise-dark": { "surface": "#051a1e", "surface-elev": "#0e2529", "surface-raised": "#183135", "surface-hover": "#223d41", "border": "#315056", "text": "#ecf1f2", "text-muted": "#91b0b5", "accent": "#0ec7de", "accent-hover": "#0dadc1", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d46465", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "amethyste-light": { "surface": "#dfe1fa", "surface-elev": "#fefefe", "surface-raised": "#d6d8f0", "surface-hover": "#cccee6", "border": "#b6b9d5", "text": "#252530", "text-muted": "#555669", "accent": "#4d41b0", "accent-hover": "#6359bb", "accent-text": "#ffffff", "danger": "#bb2020", "danger-hover": "#c03d41", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "amethyste-dark": { "surface": "#1e1f2e", "surface-elev": "#292a3a", "surface-raised": "#343547", "surface-hover": "#3f4155", "border": "#52536b", "text": "#eff0f4", "text-muted": "#abadc4", "accent": "#a1a3ff", "accent-hover": "#8d8fe0", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d76567", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "neutre-light": { "surface": "#f2f4f5", "surface-elev": "#fefeff", "surface-raised": "#e8eaeb", "surface-hover": "#dee0e1", "border": "#c6cbd0", "text": "#1f2730", "text-muted": "#4c5a69", "accent": "#515457", "accent-hover": "#696c6f", "accent-text": "#ffffff", "danger": "#d12424", "danger-hover": "#d64343", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "neutre-dark": { "surface": "#343537", "surface-elev": "#3f4144", "surface-raised": "#4a4d51", "surface-hover": "#565a5e", "border": "#686e75", "text": "#edf0f4", "text-muted": "#ced1d4", "accent": "#aeb1b5", "accent-hover": "#9c9ea2", "accent-text": "#0b0b12", "danger": "#f87878", "danger-hover": "#db6e6e", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "dark": { "surface": "#1e1f2e", "surface-elev": "#292a3a", "surface-raised": "#343547", "surface-hover": "#3f4155", "border": "#52536b", "text": "#eff0f4", "text-muted": "#abadc4", "accent": "#a1a3ff", "accent-hover": "#8d8fe0", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d76567", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "light": { "surface": "#dfe1fa", "surface-elev": "#fefefe", "surface-raised": "#d6d8f0", "surface-hover": "#cccee6", "border": "#b6b9d5", "text": "#252530", "text-muted": "#555669", "accent": "#4d41b0", "accent-hover": "#6359bb", "accent-text": "#ffffff", "danger": "#bb2020", "danger-hover": "#c03d41", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "midnight": { "surface": "#1e1f2e", "surface-elev": "#292a3a", "surface-raised": "#343547", "surface-hover": "#3f4155", "border": "#52536b", "text": "#eff0f4", "text-muted": "#abadc4", "accent": "#a1a3ff", "accent-hover": "#8d8fe0", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d76567", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "slate": { "surface": "#343537", "surface-elev": "#3f4144", "surface-raised": "#4a4d51", "surface-hover": "#565a5e", "border": "#686e75", "text": "#edf0f4", "text-muted": "#ced1d4", "accent": "#aeb1b5", "accent-hover": "#9c9ea2", "accent-text": "#0b0b12", "danger": "#f87878", "danger-hover": "#db6e6e", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
    };

    it("les 16 presets intégrés sont identiques au snapshot V2 (clé par clé)", () => {
        expect(Object.keys(HolafTokens.PRESETS).sort()).toEqual(Object.keys(FROZEN_12).sort());
        Object.keys(FROZEN_12).forEach((name) => {
            expect(HolafTokens.PRESETS[name], name).toEqual(FROZEN_12[name]);
        });
    });
});

describe("HolafTokens 0.4.0 — purge par possession d'ensemble", () => {
    it("un lot minimal purge les clés possédées absentes du nouveau lot", () => {
        HolafTokens.setTheme("corail-dark");
        expect(getVar("--holaf-danger-hover")).not.toBe("");
        expect(getVar("--holaf-surface-hover")).not.toBe("");
        HolafTokens.setTokens({ values: { surface: "#111111", text: "#eeeeee" } });
        expect(getVar("--holaf-danger-hover")).toBe("");
        expect(getVar("--holaf-surface-hover")).toBe("");
        expect(getVar("--holaf-surface")).toBe("#111111");
    });

    it("reset() retire TOUT le set possédé (clés d'applications antérieures incluses)", () => {
        HolafTokens.setTheme("corail-dark");
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
        HolafTokens.setTheme("neutre-light");
        HolafTokens.reset();
        expect(getVar("--ma-var")).toBe("#abcdef");
        document.documentElement.style.removeProperty("--ma-var");
    });
});

describe("HolafTokens 0.4.0 — registre de packs", () => {
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
        expect(() => HolafTokens.registerPreset("corail-dark", {})).toThrow(/réservé/i);
        expect(() => HolafTokens.registerPreset("corail", {})).toThrow(/réservé/i);
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
        const r = HolafTokens.registerPreset("test-ext", { accent: "#e94560" }, { extends: "corail-dark" });
        expect(r.vars.surface).toBe("#36252c");
        expect(r.vars.accent).toBe("#e94560");
        expect(r.vars["accent-soft"]).toBe("rgba(233, 69, 96, 0.16)");
        expect(r.vars["accent-gradient"]).toBe("linear-gradient(135deg, #E94560, #DD72A0)");
    });

    it("extends alias et extends pack (dérivées héritées telles quelles)", () => {
        HolafTokens.registerPreset("test-base", { accent: "#10b981" });
        const child = HolafTokens.registerPreset("test-child", {}, { extends: "test-base" });
        expect(child.vars.accent).toBe("#10b981");
        expect(child.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const grand = HolafTokens.registerPreset("test-grand", {}, { extends: "test-child" });
        expect(grand.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const alias = HolafTokens.registerPreset("test-alias", { accent: "#abcdef" }, { extends: "dark" });
        expect(alias.vars.surface).toBe("#1e1f2e");
    });

    it("spec explicite jamais écrasée par une dérivation", () => {
        const r = HolafTokens.registerPreset("test-spec", { accent: "#e94560", "accent-soft": "rebeccapurple" });
        expect(r.vars["accent-soft"]).toBe("rebeccapurple");
    });

    it("derive:false → aucune dérivation ; derive:[…] → ciblée, opt-ins hors défaut", () => {
        const off = HolafTokens.registerPreset("test-noderive", { accent: "#e94560" }, { derive: false });
        expect(off.vars["accent-soft"]).toBeUndefined();
        const optin = HolafTokens.registerPreset("test-optin", { accent: "#e94560" },
            { extends: "turquoise-dark", derive: ["danger-gradient", "radius-sm"] });
        expect(optin.vars["danger-gradient"]).toMatch(/^linear-gradient\(135deg, #F87171, #D46465\)$/);
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

    it("listPresets = les 16 intégrés PUIS les packs dans l'ordre d'enregistrement", () => {
        expect(HolafTokens.listPresets()).toHaveLength(16);
        HolafTokens.registerPreset("test-p1", {});
        HolafTokens.registerPreset("test-p2", {});
        const list = HolafTokens.listPresets();
        expect(list[0]).toBe("corail-light");
        expect(list[15]).toBe("slate");
        expect(list.slice(16)).toEqual(["test-p1", "test-p2"]);
        expect(list.slice(0, 16)).not.toContain("test-p1");
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
        HolafTokens.registerPreset("test-up", { accent: "#e94560" }, { extends: "corail-dark" });
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
        expect(p.surface).toBe("#1e1f2e");
        p.surface = "#000000";
        expect(HolafTokens.getPreset("dark").surface).toBe("#1e1f2e");
        expect(HolafTokens.getPreset("turquoise-light").surface).toBe("#c3e2e8");
        expect(HolafTokens.getPreset("nope")).toBeNull();
    });
});

describe("HolafTokens 0.4.0 — dérivations", () => {
    it("formules exactes depuis corail-dark (groupe A + skip des états absents)", () => {
        const v = HolafTokens.registerPreset("test-der", {}, { extends: "corail-dark" }).vars;
        expect(v["accent-soft"]).toBe("rgba(250, 127, 181, 0.16)");
        expect(v["accent-glow"]).toBe("rgba(250, 127, 181, 0.5)");
        expect(v["accent-gradient"]).toBe("linear-gradient(135deg, #FA7FB5, #DD72A0)");
        expect(v["accent-gradient-hover"]).toBe(
            "linear-gradient(135deg, " + mix("#fa7fb5", "#ffffff", 0.12) + ", " + mix("#dd72a0", "#ffffff", 0.12) + ")"
        );
        expect(v["accent-shadow"]).toBe("0 0 18px var(--holaf-accent-soft)");
        expect(v["danger-soft"]).toBe("rgba(248, 113, 113, 0.12)");
        expect(v["danger-shadow"]).toBe("0 0 16px var(--holaf-danger-soft)");
        expect(v["border-muted"]).toBe("rgba(115, 89, 99, 0.45)");
        expect(v["text-faint"]).toBe(mix("#ccb7bf", "#36252c", 0.42));
        // les intégrés V2 PORTENT surface-hover (4ᵉ palier) : hérité tel quel,
        // la règle de dérivation ne s'applique donc PAS ici.
        expect(v["surface-hover"]).toBe("#5d464f");
        expect(v["chrome-header"]).toBe("linear-gradient(180deg, rgba(54, 37, 44, 0.92), rgba(54, 37, 44, 0.66))");
        expect(v["chrome-footer"]).toBe("linear-gradient(0deg, rgba(54, 37, 44, 0.95), rgba(54, 37, 44, 0.66))");
        // opt-ins HORS défaut
        expect(v["danger-gradient"]).toBeUndefined();
        expect(v["radius-sm"]).toBeUndefined();
        expect(v["txt-glow"]).toBeUndefined();
        // états non fournis → clé non posée
        expect(v["ok-text"]).toBeUndefined();
        expect(v["ok-soft"]).toBeUndefined();
        expect(v["warn-text"]).toBeUndefined();
    });

    it("surface-hover : dérivation rgba(surface-raised, .70) quand la clé est absente", () => {
        const v = HolafTokens.registerPreset("test-sh", { surface: "#1e1e1e", "surface-raised": "#1a1a1a" }).vars;
        expect(v["surface-hover"]).toBe("rgba(26, 26, 26, 0.7)");
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

describe("HolafTokens 0.4.0 — alpha()", () => {
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

describe("HolafTokens 0.4.0 — chargement (sans export nommé)", () => {
    it("la globale est posée par effet de bord et VERSION = 0.4.1", () => {
        expect(window.HolafTokens).toBe(HolafTokens);
        expect(HolafTokens.VERSION).toBe("0.4.1");
    });

    it("garde-fou statique : AUCUN export top-level dans le fichier", () => {
        expect(TOKENS_SRC).not.toMatch(/^export\b/m);
        expect(TOKENS_SRC).toMatch(/window\.HolafTokens = HolafTokens/);
        expect(TOKENS_SRC).toMatch(/globalThis\.HolafTokens = HolafTokens/);
    });
});
