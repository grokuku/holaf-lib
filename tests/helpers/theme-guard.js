/* Garde V2 des thèmes — MODULE DE TEST de la brique (aucun coût runtime).
 * ─────────────────────────────────────────────────────────────────────────────
 * Rejoue la « garde des accents » de la maquette V2 validée
 * (`Yuki and Libs/_tools/theme-accents.mjs` : `auditWith` / `checkAudit` /
 * `selftestBadAudit`) SANS dépendre d'un fichier hors dépôt.
 *
 * Les primitives OKLab (srgbToLinear, hexToRgb, rgbToOklab, deltaEok) sont
 * RAPATRIÉES ici, dupliquées à l'identique depuis `_tools/theme-lib.mjs` :
 * mêmes formules, mêmes constantes OKLab. Aucun import hors projet.
 *
 * Seuils = ceux de la maquette V2 :
 *   texte (principal ET atténué)/fond ≥ 4,5:1 (WCAG 1.4.3)
 *   texte/accent ≥ 4,5:1 (WCAG 1.4.3) · non-textuel ≥ 3:1 (WCAG 1.4.11)
 *   écart d'ACCENT ≥ 0,040 · écart de FOND ≥ 0,040 · profondeur ≥ 0,020 (ΔEok).
 *
 * PATCH 0.4.1 : la garde contrôle désormais AUSSI `text-muted` (le texte
 * atténué) ≥ 4,5:1 sur LES QUATRE paliers de profondeur. C'était la lacune :
 * elle ne vérifiait que `text` et l'accent, laissant passer un `text-muted` à
 * 4,42:1 sur `surface` (`ambre-light`) et jusqu'à 2,97:1 sur `surface-hover`
 * (`neutre-dark`).
 */

export const AA_TEXT = 4.5;
export const AA_NONTEXT = 3.0;
export const ACCENT_SEP = 0.040;
export const SURFACE_SEP = 0.040;
export const DEPTH_SEP = 0.020;

/* ─── Primitives OKLab (dupliquées depuis _tools/theme-lib.mjs) ───────────── */

export function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function rgbToOklab([r, g, b]) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
    const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
    const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return [
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ];
}

/** Distance perceptuelle OKLab (ΔEok : 0,020 ≈ « juste perceptible »). */
export function deltaEok(a, b) {
    const A = rgbToOklab(hexToRgb(a));
    const B = rgbToOklab(hexToRgb(b));
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** Contraste WCAG 2.1 (luminance relative). */
export function contrast(a, b) {
    const lum = (hex) => {
        const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ─── Garde ───────────────────────────────────────────────────────────────── */

export const DEPTH_STEPS = [
    ["surface→elev", "surface", "surfaceElev"],
    ["elev→raised", "surfaceElev", "surfaceRaised"],
    ["raised→hover", "surfaceRaised", "surfaceHover"],
];

/** Les 4 paliers de profondeur (clé de ligne, libellé de violation). */
export const SURFACE_KEYS = [
    ["surface", "surface"],
    ["surfaceElev", "surface-elev"],
    ["surfaceRaised", "surface-raised"],
    ["surfaceHover", "surface-hover"],
];

/**
 * Vérifie un catalogue de presets.
 * `rows` = [{ family, mode, accent, onAccent, surface, surfaceElev, surfaceRaised, surfaceHover, textMuted }].
 * `textMuted` (optionnel) : si présent, contrôle le contraste du texte
 * atténué sur les 4 paliers de profondeur (PATCH 0.4.1).
 * Renvoie la liste des violations (vide = conforme).
 */
export function checkCatalogGuard(rows) {
    const violations = [];
    for (const mode of ["dark", "light"]) {
        const set = rows.filter((r) => r.mode === mode);
        if (!set.length) continue;
        let minAccent = Infinity, minAccentPair = "";
        let minBg = Infinity, minBgPair = "";
        for (let i = 0; i < set.length; i++) {
            for (let j = i + 1; j < set.length; j++) {
                const da = deltaEok(set[i].accent, set[j].accent);
                const db = deltaEok(set[i].surface, set[j].surface);
                const pair = `${set[i].family}↔${set[j].family}`;
                if (da < minAccent) { minAccent = da; minAccentPair = pair; }
                if (db < minBg) { minBg = db; minBgPair = pair; }
            }
        }
        const minOn = Math.min(...set.map((r) => contrast(r.onAccent, r.accent)));
        const minLink = Math.min(...set.map((r) => contrast(r.accent, r.surface)));
        const minDepth = Math.min(...set.flatMap((r) => DEPTH_STEPS.map(([, a, b]) => deltaEok(r[a], r[b]))));
        // Texte ATTÉNUÉ (`text-muted`) ≥ 4,5:1 sur les 4 paliers (PATCH 0.4.1).
        // `who` porte mode + famille + palier fautif ; `value` = mesure, `min` = seuil.
        let minMuted = Infinity, mutedWho = "";
        for (const r of set) {
            if (typeof r.textMuted !== "string") continue;
            for (const [key, label] of SURFACE_KEYS) {
                const c = contrast(r.textMuted, r[key]);
                if (c < minMuted) { minMuted = c; mutedWho = `${r.family} sur ${label}`; }
            }
        }
        if (minMuted < AA_TEXT) violations.push({ kind: "texte-attenue", who: `${mode} ${mutedWho}`, value: minMuted, min: AA_TEXT });
        if (minAccent < ACCENT_SEP) violations.push({ kind: "accent-proches", who: `${mode} ${minAccentPair}`, value: minAccent, min: ACCENT_SEP });
        if (minBg < SURFACE_SEP) violations.push({ kind: "fonds-proches", who: `${mode} ${minBgPair}`, value: minBg, min: SURFACE_SEP });
        if (minOn < AA_TEXT) violations.push({ kind: "texte-sur-accent", who: mode, value: minOn, min: AA_TEXT });
        if (minLink < AA_TEXT) violations.push({ kind: "accent-sur-fond", who: mode, value: minLink, min: AA_TEXT });
        if (minLink < AA_NONTEXT) violations.push({ kind: "non-textuel", who: mode, value: minLink, min: AA_NONTEXT });
        if (minDepth < DEPTH_SEP) violations.push({ kind: "profondeur", who: mode, value: minDepth, min: DEPTH_SEP });
    }
    return violations;
}

/**
 * ⚠️ SELFTEST — catalogue VOLONTAIREMENT MAUVAIS (tous les accents SOMBRES
 * reçoivent le même gris #787878 ET le texte atténué est posé À LA COULEUR DE
 * LA SURFACE, donc à 1:1) : prouve que la garde N'EST PAS VACUE, sur l'ACCENT
 * comme sur le TEXTE ATTÉNUÉ. Le mode clair reste conforme côté accent : les
 * violations d'accent doivent venir du seul mode sombre.
 */
export function selftestBadCatalog(rows) {
    return rows.map((r) => Object.assign(
        {},
        r,
        { textMuted: r.surface },
        r.mode === "dark" ? { accent: "#787878" } : {},
    ));
}
