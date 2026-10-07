/* Tests HolafTokens — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : preset initial par défaut (prefers-color-scheme), setTheme /
 * getTheme / listPresets, setTokens (--holaf-* sur :root), reset (retrait),
 * événement "holaf-tokens-changed" à chaque changement, applyPalette
 * (calculs internes mix/contrast, cohérence contraste), catalogue V2 (6 familles
 * × 2 modes + 4 alias remappés) + famille d'IDENTITÉ `matrix` (matrix-light /
 * matrix-dark, valeurs figées Pi-Web), GARDE V2 (fonds/accents distincts,
 * profondeur), table MIGRATIONS, registre de packs, dérivations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import "../js/holaf-tokens.js";
import { HolafColor } from "../js/holaf-color.js";
import {
    checkCatalogGuard, selftestBadCatalog, deltaEok,
    AA_TEXT, AA_NONTEXT, ACCENT_SEP, CHROMA_MAX, RAMP_SHARE_MAX, DEPTH_SEP,
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
// Famille d'IDENTITÉ (Pi-Web) : hors roue chromatique, presets figés.
const MATRIX_CANON = ["matrix-light", "matrix-dark"];
// Les 6 familles « couleur » de la roue chromatique V2 (garde de distinction).
const V2_FAMILIES = ["corail", "ambre", "emeraude", "turquoise", "amethyste", "neutre"];
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
// Range les presets en lignes pour la garde V2. La garde ne porte que sur la
// ROUe chromatique (les 6 familles couleur). La famille d'IDENTITÉ `matrix`
// (monochrome, valeurs Pi-Web figées : ses gris de texte atténué ne visent pas
// AA sur les 4 paliers) en est VOLONTAIREMENT exclue — elle est contrôlée par
// le describe « famille d'identité Matrix » plus bas.
function guardRows() {
    const rows = [];
    for (const fam of V2_FAMILIES) {
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
    HolafTokens.listPresets().slice(18).forEach((n) => HolafTokens.unregisterPreset(n));
});

describe("HolafTokens — presets", () => {
    it("expose les 4 alias historiques + les 14 presets <famille>-<mode>", () => {
        const names = HolafTokens.listPresets();
        ALIAS_NAMES.forEach((alias) => expect(names).toContain(alias));
        CANON.forEach((name) => expect(names).toContain(name));
        MATRIX_CANON.forEach((name) => expect(names).toContain(name));
        expect(names).toHaveLength(18);
    });

    it("setTheme : pose les variables --holaf-* sur :root", () => {
        HolafTokens.setTheme("dark"); // alias → amethyste-dark
        expect(getVar("--holaf-surface")).toBe("#171717");
        expect(getVar("--holaf-text")).toBe("#f1f1f6");
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
        expect(t.vars["--holaf-surface"]).toBe("#171717");
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
        // 0.6.0 : les DEUX invariants de la variante C sont eux aussi non vacants
        // (ils REMPLACENT l'ancien contrôle « fonds-proches »).
        expect(violations.some((v) => v.kind === "surfaces-non-neutres")).toBe(true);
        expect(violations.some((v) => v.kind === "rampe-non-partagee")).toBe(true);
    });

    it("seuils exposés conformes à la maquette V2", () => {
        expect([AA_TEXT, AA_NONTEXT, ACCENT_SEP, DEPTH_SEP, CHROMA_MAX, RAMP_SHARE_MAX]).toEqual([4.5, 3.0, 0.04, 0.02, 0.010, 0.015]);
    });

    it("la garde EXCLUT `matrix` : l'inclure déclenche une violation (preuve de l'exclusion)", () => {
        // `matrix` est HORS règle (identité Pi-Web figée) : son texte atténué
        // (matrix-light #777770 sur #eeece6 = 3,82:1) ne vise pas AA et ses
        // surfaces ne suivent pas la rampe partagée. On prouve que la garde la
        // rejetterait, ce qui justifie son exclusion de `guardRows()`.
        const rows = guardRows().concat(["matrix-light", "matrix-dark"].map((name) => {
            const p = HolafTokens.PRESETS[name];
            return {
                family: "matrix", mode: name.endsWith("dark") ? "dark" : "light",
                accent: p.accent, onAccent: p["accent-text"],
                surface: p.surface, surfaceElev: p["surface-elev"],
                surfaceRaised: p["surface-raised"], surfaceHover: p["surface-hover"],
                textMuted: p["text-muted"],
            };
        }));
        const violations = checkCatalogGuard(rows);
        expect(violations.some((v) => v.kind === "texte-attenue")).toBe(true);
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
        // de setTheme("dark") est amethyste-dark (surface #171717).
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
    it("expose les 7 familles (identité Matrix + roue chromatique V2)", () => {
        expect(HolafTokens.listFamilies()).toEqual(["matrix", "corail", "ambre", "emeraude", "turquoise", "amethyste", "neutre"]);
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
        expect(getVar("--holaf-surface")).toBe("#eeeeee");
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
        expect(Object.keys(HolafTokens.FAMILIES).sort()).toEqual(["ambre", "amethyste", "corail", "emeraude", "matrix", "neutre", "turquoise"]);
        expect(HolafTokens.FAMILIES.matrix.label).toBe("Matrix");
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

describe("HolafTokens 0.4.0 — snapshot des 12 presets V2 + 2 matrix + 4 alias", () => {
    // Snapshot FIGÉ des 16 presets (12 V2 + 4 alias) — garde-fou contre toute
    // retouche accidentelle des valeurs calculées depuis la maquette V2.
    const FROZEN_12 = {
        "corail-light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#e0dfdf", "surface-hover": "#d4d2d3", "border": "#c4c0c1", "text": "#2b2226", "text-muted": "#4b3f43", "accent": "#9c045e", "accent-hover": "#ac3b72", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "corail-dark": { "surface": "#171717", "surface-elev": "#262526", "surface-raised": "#323132", "surface-hover": "#3b3939", "border": "#4d494a", "text": "#f5f0f2", "text-muted": "#c3bbbe", "accent": "#fa7fb5", "accent-hover": "#d46e9b", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "ambre-light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#e0dfde", "surface-hover": "#d4d3d1", "border": "#c3c1be", "text": "#2a241e", "text-muted": "#494138", "accent": "#7a4800", "accent-hover": "#8c6031", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "ambre-dark": { "surface": "#171717", "surface-elev": "#262625", "surface-raised": "#323130", "surface-hover": "#3a3938", "border": "#4c4a48", "text": "#f5f1ee", "text-muted": "#c2bdb7", "accent": "#f29a2d", "accent-hover": "#cd852f", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "emeraude-light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#dfdfdf", "surface-hover": "#d2d3d2", "border": "#c0c2bf", "text": "#222720", "text-muted": "#3e453c", "accent": "#276701", "accent-hover": "#467b32", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "emeraude-dark": { "surface": "#171717", "surface-elev": "#252625", "surface-raised": "#313231", "surface-hover": "#383a38", "border": "#494b48", "text": "#f0f3ef", "text-muted": "#bbbfb9", "accent": "#7fc765", "accent-hover": "#6ea959", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "turquoise-light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#dedfdf", "surface-hover": "#d1d3d3", "border": "#bec2c3", "text": "#1d2729", "text-muted": "#384548", "accent": "#07606c", "accent-hover": "#38747f", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "turquoise-dark": { "surface": "#171717", "surface-elev": "#252626", "surface-raised": "#303232", "surface-hover": "#373a3a", "border": "#474b4c", "text": "#edf3f4", "text-muted": "#b7c0c1", "accent": "#0ec7de", "accent-hover": "#22aabc", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "amethyste-light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#dfdfe0", "surface-hover": "#d2d3d4", "border": "#c0c1c4", "text": "#24242c", "text-muted": "#41414c", "accent": "#4d41b0", "accent-hover": "#615dbb", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "amethyste-dark": { "surface": "#171717", "surface-elev": "#262626", "surface-raised": "#313133", "surface-hover": "#39393b", "border": "#4a4a4d", "text": "#f1f1f6", "text-muted": "#bcbdc4", "accent": "#a1a3ff", "accent-hover": "#8a8cd8", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "neutre-light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#dfdfe0", "surface-hover": "#d2d3d4", "border": "#bfc1c4", "text": "#20262c", "text-muted": "#3b434c", "accent": "#515457", "accent-hover": "#67696c", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "neutre-dark": { "surface": "#171717", "surface-elev": "#252626", "surface-raised": "#313233", "surface-hover": "#38393b", "border": "#494a4d", "text": "#eff2f6", "text-muted": "#babec4", "accent": "#aeb1b5", "accent-hover": "#95979a", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "dark": { "surface": "#171717", "surface-elev": "#262626", "surface-raised": "#313133", "surface-hover": "#39393b", "border": "#4a4a4d", "text": "#f1f1f6", "text-muted": "#bcbdc4", "accent": "#a1a3ff", "accent-hover": "#8a8cd8", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "light": { "surface": "#eeeeee", "surface-elev": "#ffffff", "surface-raised": "#dfdfe0", "surface-hover": "#d2d3d4", "border": "#c0c1c4", "text": "#24242c", "text-muted": "#41414c", "accent": "#4d41b0", "accent-hover": "#615dbb", "accent-text": "#ffffff", "danger": "#cd2323", "danger-hover": "#d74e45", "danger-text": "#ffffff", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "midnight": { "surface": "#171717", "surface-elev": "#262626", "surface-raised": "#313133", "surface-hover": "#39393b", "border": "#4a4a4d", "text": "#f1f1f6", "text-muted": "#bcbdc4", "accent": "#a1a3ff", "accent-hover": "#8a8cd8", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
        "slate": { "surface": "#171717", "surface-elev": "#252626", "surface-raised": "#313233", "surface-hover": "#38393b", "border": "#494a4d", "text": "#eff2f6", "text-muted": "#babec4", "accent": "#aeb1b5", "accent-hover": "#95979a", "accent-text": "#0b0b12", "danger": "#f87171", "danger-hover": "#d26362", "danger-text": "#000000", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
    };

    // Snapshot FIGÉ de la famille d'IDENTITÉ matrix (valeurs Pi-Web, 23 clés :
    // 16 standard + 7 clés hôte Pi-Web). Ajoutée en 0.5.0.
    const FROZEN_MATRIX = {
        "matrix-light": { "surface": "#eeece6", "surface-elev": "#f8f7f4", "surface-raised": "#ffffff", "surface-hover": "#f1f0ea", "border": "#d0d0c8", "border-bright": "#b8b8b0", "text": "#3d3d3a", "text-bright": "#1a1a18", "text-muted": "#777770", "info": "#0070cc", "warn": "#cc8800", "accent": "#166534", "accent-hover": "#15803d", "accent-text": "#ffffff", "danger": "#cc2222", "danger-hover": "#D1403F", "danger-text": "#ffffff", "code-inline-bg": "rgba(0, 0, 0, 0.06)", "code-block-bg": "rgba(0, 0, 0, 0.08)", "tool-output-bg": "rgba(0, 0, 0, 0.05)", "radius": "12px", "shadow": "0 18px 50px rgba(24, 24, 27, 0.18)", "font-size": "14px" },
        "matrix-dark": { "surface": "#0a0a0a", "surface-elev": "#161616", "surface-raised": "#1e1e1e", "surface-hover": "#262626", "border": "#2a2a2a", "border-bright": "#3a3a3a", "text": "#c0c0c0", "text-bright": "#e0e0e0", "text-muted": "#888888", "info": "#00aaff", "warn": "#ffaa00", "accent": "#00ff41", "accent-hover": "#00cc34", "accent-text": "#000000", "danger": "#ff4444", "danger-hover": "#DA3B3B", "danger-text": "#000000", "code-inline-bg": "rgba(0, 0, 0, 0.3)", "code-block-bg": "rgba(0, 0, 0, 0.4)", "tool-output-bg": "rgba(0, 0, 0, 0.3)", "radius": "12px", "shadow": "0 18px 50px rgba(0, 0, 0, 0.55)", "font-size": "14px" },
    };

    it("les 18 presets intégrés sont identiques au snapshot (clé par clé)", () => {
        const FROZEN_ALL = Object.assign({}, FROZEN_12, FROZEN_MATRIX);
        expect(Object.keys(HolafTokens.PRESETS).sort()).toEqual(Object.keys(FROZEN_ALL).sort());
        Object.keys(FROZEN_ALL).forEach((name) => {
            expect(HolafTokens.PRESETS[name], name).toEqual(FROZEN_ALL[name]);
        });
    });
});

describe("HolafTokens 0.5.0 — famille d'identité Matrix", () => {
    it("matrix-light / matrix-dark existent, nommés <famille>-<mode>", () => {
        MATRIX_CANON.forEach((name) => {
            expect(HolafTokens.PRESETS[name], name).toBeTruthy();
            expect(HolafTokens.getPreset(name), name).not.toBeNull();
        });
    });

    it("porte les 7 clés hôte Pi-Web non standard (info/warn/border-bright/…)", () => {
        for (const name of MATRIX_CANON) {
            const p = HolafTokens.PRESETS[name];
            for (const key of ["border-bright", "text-bright", "info", "warn", "code-inline-bg", "code-block-bg", "tool-output-bg"]) {
                expect(typeof p[key], name + "." + key).toBe("string");
                expect(p[key], name + "." + key).not.toBe("");
            }
        }
        expect(HolafTokens.PRESETS["matrix-dark"].info).toBe("#00aaff");
        expect(HolafTokens.PRESETS["matrix-dark"].warn).toBe("#ffaa00");
        expect(HolafTokens.PRESETS["matrix-light"].info).toBe("#0070cc");
    });

    it("setTheme('matrix-dark') pose l'accent néon vert et le fond noir Pi-Web", () => {
        HolafTokens.setTheme("matrix-dark");
        expect(getVar("--holaf-surface")).toBe("#0a0a0a");
        expect(getVar("--holaf-accent")).toBe("#00ff41");
        expect(getVar("--holaf-accent-hover")).toBe("#00cc34");
        expect(getVar("--holaf-info")).toBe("#00aaff");
        expect(getVar("--holaf-warn")).toBe("#ffaa00");
        expect(HolafTokens.getFamily()).toBe("matrix");
        expect(HolafTokens.getMode()).toBe("dark");
    });

    it("ses noms (famille + 2 presets) sont RÉSERVÉS aux packs", () => {
        expect(() => HolafTokens.registerPreset("matrix", {})).toThrow(/réservé/i);
        expect(() => HolafTokens.registerPreset("matrix-dark", {})).toThrow(/réservé/i);
        expect(() => HolafTokens.registerPreset("matrix-light", {})).toThrow(/réservé/i);
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
        expect(r.vars.surface).toBe("#171717");
        expect(r.vars.accent).toBe("#e94560");
        expect(r.vars["accent-soft"]).toBe("rgba(233, 69, 96, 0.16)");
        expect(r.vars["accent-gradient"]).toBe("linear-gradient(135deg, #E94560, #D46E9B)");
    });

    it("extends alias et extends pack (dérivées héritées telles quelles)", () => {
        HolafTokens.registerPreset("test-base", { accent: "#10b981" });
        const child = HolafTokens.registerPreset("test-child", {}, { extends: "test-base" });
        expect(child.vars.accent).toBe("#10b981");
        expect(child.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const grand = HolafTokens.registerPreset("test-grand", {}, { extends: "test-child" });
        expect(grand.vars["accent-soft"]).toBe("rgba(16, 185, 129, 0.16)");
        const alias = HolafTokens.registerPreset("test-alias", { accent: "#abcdef" }, { extends: "dark" });
        expect(alias.vars.surface).toBe("#171717");
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
        expect(optin.vars["danger-gradient"]).toMatch(/^linear-gradient\(135deg, #F87171, #D26362\)$/);
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

    it("listPresets = les 18 intégrés PUIS les packs dans l'ordre d'enregistrement", () => {
        expect(HolafTokens.listPresets()).toHaveLength(18);
        HolafTokens.registerPreset("test-p1", {});
        HolafTokens.registerPreset("test-p2", {});
        const list = HolafTokens.listPresets();
        expect(list[0]).toBe("matrix-light");
        expect(list[1]).toBe("matrix-dark");
        expect(list[17]).toBe("slate");
        expect(list.slice(18)).toEqual(["test-p1", "test-p2"]);
        expect(list.slice(0, 18)).not.toContain("test-p1");
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
        expect(p.surface).toBe("#171717");
        p.surface = "#000000";
        expect(HolafTokens.getPreset("dark").surface).toBe("#171717");
        expect(HolafTokens.getPreset("turquoise-light").surface).toBe("#eeeeee");
        expect(HolafTokens.getPreset("nope")).toBeNull();
    });
});

describe("HolafTokens 0.4.0 — dérivations", () => {
    it("formules exactes depuis corail-dark (groupe A + skip des états absents)", () => {
        const v = HolafTokens.registerPreset("test-der", {}, { extends: "corail-dark" }).vars;
        expect(v["accent-soft"]).toBe("rgba(250, 127, 181, 0.16)");
        expect(v["accent-glow"]).toBe("rgba(250, 127, 181, 0.5)");
        expect(v["accent-gradient"]).toBe("linear-gradient(135deg, #FA7FB5, #D46E9B)");
        expect(v["accent-gradient-hover"]).toBe(
            "linear-gradient(135deg, " + mix("#fa7fb5", "#ffffff", 0.12) + ", " + mix("#d46e9b", "#ffffff", 0.12) + ")"
        );
        expect(v["accent-shadow"]).toBe("0 0 18px var(--holaf-accent-soft)");
        expect(v["danger-soft"]).toBe("rgba(248, 113, 113, 0.12)");
        expect(v["danger-shadow"]).toBe("0 0 16px var(--holaf-danger-soft)");
        expect(v["border-muted"]).toBe("rgba(77, 73, 74, 0.45)");
        expect(v["text-faint"]).toBe(mix("#c3bbbe", "#171717", 0.42));
        // les intégrés V2 PORTENT surface-hover (4ᵉ palier) : hérité tel quel,
        // la règle de dérivation ne s'applique donc PAS ici.
        expect(v["surface-hover"]).toBe("#3b3939");
        expect(v["chrome-header"]).toBe("linear-gradient(180deg, rgba(23, 23, 23, 0.92), rgba(23, 23, 23, 0.66))");
        expect(v["chrome-footer"]).toBe("linear-gradient(0deg, rgba(23, 23, 23, 0.95), rgba(23, 23, 23, 0.66))");
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
    it("la globale est posée par effet de bord et VERSION = 0.5.0", () => {
        expect(window.HolafTokens).toBe(HolafTokens);
        expect(HolafTokens.VERSION).toBe("0.6.0");
    });

    it("garde-fou statique : AUCUN export top-level dans le fichier", () => {
        expect(TOKENS_SRC).not.toMatch(/^export\b/m);
        expect(TOKENS_SRC).toMatch(/window\.HolafTokens = HolafTokens/);
        expect(TOKENS_SRC).toMatch(/globalThis\.HolafTokens = HolafTokens/);
    });
});
