/* Tests HolafColor — vitest (PUR JS, sans DOM requis)
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : conversions aller-retour (rgb/hex/hsl), validation d'hex
 * (throw clair), mixes / lighten / darken (précision), contraste WCAG 2.1
 * (ratios connus), readableText, generateTheme (cohérence contraste).
 */
import { describe, expect, it } from "vitest";
import { HolafColor } from "../js/holaf-color.js";

const { hexToRgb, rgbToHex, hexToHsl, hslToHex, rgbToHsl, hslToRgb, mix, lighten, darken, contrastRatio, readableText, generateTheme, generateFamily } = HolafColor;

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe("HolafColor — conversions hex ↔ rgb", () => {
    it("hexToRgb : hex 6 chiffres", () => {
        expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
        expect(hexToRgb("#00FF80")).toEqual([0, 255, 128]);
    });

    it("hexToRgb : hex court 3 chiffres (déplié)", () => {
        expect(hexToRgb("#f00")).toEqual([255, 0, 0]);
        expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    });

    it("hexToRgb : sans # initial toléré", () => {
        expect(hexToRgb("102030")).toEqual([16, 32, 48]);
    });

    it("rgbToHex : (r,g,b) et formes tableau/objet", () => {
        expect(rgbToHex(255, 0, 0)).toBe("#FF0000");
        expect(rgbToHex([255, 0, 0])).toBe("#FF0000");
        expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe("#0000FF");
    });

    it("rgbToHex : borne les canaux hors 0-255 et arrondit", () => {
        expect(rgbToHex(-5, 260, 128.4)).toBe("#00FF80");
    });

    it("aller-retour hex → rgb → hex identique (normalisé)", () => {
        const input = "#1a2b3c";
        expect(rgbToHex(hexToRgb(input))).toBe(input.toUpperCase());
    });

    it("hex invalide : lève une Error claire", () => {
        expect(() => hexToRgb("nope")).toThrow(/hex invalide/i);
        expect(() => hexToRgb("12345")).toThrow(/hex invalide/i);
        expect(() => hexToRgb("#zzzzzz")).toThrow(/hex invalide/i);
        expect(() => hexToRgb(12345)).toThrow(/hex invalide/i);
    });
});

describe("HolafColor — conversions hsl", () => {
    it("hexToHsl : rouge pur → [0, 100, 50]", () => {
        expect(hexToHsl("#ff0000")).toEqual([0, 100, 50]);
    });

    it("hslToHex : [0, 100, 50] → #FF0000", () => {
        expect(hslToHex(0, 100, 50)).toBe("#FF0000");
    });

    it("rgbToHsl : gris → saturation 0", () => {
        const [h, s, l] = rgbToHsl(128, 128, 128);
        expect(h).toBe(0);
        expect(s).toBe(0);
        expect(l).toBe(50);
    });

    it("hslToRgb : [0, 100, 50] → [255, 0, 0]", () => {
        expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
    });

    it("aller-retour hsl → rgb → hsl stable", () => {
        const hsl = rgbToHsl(30, 144, 255);
        const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
        expect(rgbToHsl(rgb[0], rgb[1], rgb[2])).toEqual(hsl);
    });

    it("hslToHex : sort toujours un hex 6 normalisé", () => {
        expect(hslToHex(210, 80, 30)).toMatch(HEX);
    });
});

describe("HolafColor — mixes / lighten / darken", () => {
    it("mix : 50 % noir + blanc → gris moyen #808080", () => {
        expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    });

    it("mix : ratio 0 → a, ratio 1 → b", () => {
        expect(mix("#ff0000", "#00ff00", 0)).toBe("#FF0000");
        expect(mix("#ff0000", "#00ff00", 1)).toBe("#00FF00");
    });

    it("mix : précision (25 % noir sur blanc → #BFBFBF)", () => {
        expect(mix("#ffffff", "#000000", 0.25)).toBe("#BFBFBF");
    });

    it("mix : ratio hors bornes borné à [0, 1]", () => {
        expect(mix("#000000", "#ffffff", 9)).toBe("#ffffff".toUpperCase());
        expect(mix("#000000", "#ffffff", -3)).toBe("#000000".toUpperCase());
    });

    it("lighten : éclaircit vers le blanc", () => {
        expect(lighten("#000000", 0.5)).toBe("#808080");
        expect(lighten("#ff0000", 0)).toBe("#FF0000");
    });

    it("darken : fonce vers le noir", () => {
        expect(darken("#ffffff", 0.5)).toBe("#808080");
        expect(darken("#ff0000", 0)).toBe("#FF0000");
    });

    it("mix : accepte aussi des tableaux rgb", () => {
        expect(mix([255, 0, 0], [0, 0, 255], 0.5)).toBe("#800080");
    });
});

describe("HolafColor — contraste WCAG 2.1", () => {
    it("ratio connu : #000 / #fff = 21", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    });

    it("ratio même couleur = 1", () => {
        expect(contrastRatio("#000000", "#000000")).toBe(1);
    });

    it("symétrique : contrastRatio(a, b) === contrastRatio(b, a)", () => {
        expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(
            contrastRatio("#fedcba", "#123456"), 10
        );
    });

    it("bornes 1..21 pour couleurs quelconques", () => {
        const r = contrastRatio("#6366f1", "#ffffff");
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(21);
    });
});

describe("HolafColor — readableText", () => {
    it("fond clair → texte sombre", () => {
        expect(readableText("#ffffff")).toBe("#000000");
    });

    it("fond sombre → texte clair", () => {
        expect(readableText("#000000")).toBe("#ffffff");
    });

    it("respecte les couleurs custom dark/light", () => {
        const t = readableText("#ffffff", "#18181b", "#f4f4f5");
        expect(t).toBe("#18181b");
    });

    it("le texte choisi atteint ≥ 4.5:1 quand c'est possible", () => {
        const t = readableText("#6366f1");
        expect(contrastRatio("#6366f1", t)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("HolafColor — generateTheme", () => {
    it("retourne une palette couvrant les tokens de base", () => {
        const t = generateTheme("#4f46e5");
        expect(t.accentHover).toMatch(HEX);
        expect(t.border).toMatch(HEX);
        expect(t.borderSubtle).toMatch(HEX);
        expect(t.surface).toMatch(HEX);
        expect(t.text).toMatch(HEX);
        expect(t.textMuted).toMatch(HEX);
        expect(t.danger).toMatch(HEX);
        expect(t.dangerHover).toMatch(HEX);
        expect(t.radius).toBeTruthy();
        expect(t.shadow).toBeTruthy();
    });

    it("accent-hover = mix accent/fond ~15 %", () => {
        const t = generateTheme("#ff0000");
        // mix(ff0000, surface, 0.15) ; surface = mix(white, accent, 0.04)
        const expected = mix("#ff0000", t.surface, 0.15);
        expect(t.accentHover.toUpperCase()).toBe(expected.toUpperCase());
    });

    it("texte lisibles (≥ 4.5:1) sur leurs fonds", () => {
        const t = generateTheme("#4f46e5");
        expect(contrastRatio(t.accent, t.accentText)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.surface, t.text)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.danger, t.dangerText)).toBeGreaterThanOrEqual(4.5);
    });

    it("respecte les options background/surface/danger", () => {
        const t = generateTheme("#4f46e5", { background: "#10111d", surface: "#181a2c", danger: "#ef4444" });
        expect(t.surface.toLowerCase()).toBe("#181a2c");
        expect(t.danger.toLowerCase()).toBe("#ef4444");
    });
});

describe("HolafColor — generateFamily (2 axes clair/sombre)", () => {
    it("retourne bien deux palettes { light, dark } complètes", () => {
        const fam = generateFamily("#6366f1");
        expect(fam.light).toBeTruthy();
        expect(fam.dark).toBeTruthy();
        ["accent", "accentHover", "accentText", "border", "borderSubtle",
            "surface", "surfaceHover", "background", "text", "textMuted",
            "danger", "dangerHover", "dangerText", "radius", "shadow"].forEach((k) => {
            expect(fam.light[k], "light." + k).toBeTruthy();
            expect(fam.dark[k], "dark." + k).toBeTruthy();
        });
    });

    it("texte ADAPTATIF : sombre sur fond clair, clair sur fond sombre", () => {
        const fam = generateFamily("#6366f1");
        // lisibles ≥ 4.5:1 sur leur propre fond
        expect(contrastRatio(fam.light.text, fam.light.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(fam.dark.text, fam.dark.background)).toBeGreaterThanOrEqual(4.5);
        // le texte clair est plus proche du blanc que du noir…
        expect(contrastRatio(fam.light.text, "#ffffff")).toBeGreaterThan(contrastRatio(fam.light.text, "#000000"));
        // …et inversement : le texte sombre est plus proche du noir.
        expect(contrastRatio(fam.dark.text, "#000000")).toBeGreaterThan(contrastRatio(fam.dark.text, "#ffffff"));
    });

    it("équivaut à DEUX appels generateTheme (fonds opposés)", () => {
        const fam = generateFamily("#818cf8", {
            light: { background: "#ffffff" },
            dark: { background: "#111111" },
        });
        expect(fam.light).toEqual(generateTheme("#818cf8", { background: "#ffffff" }));
        expect(fam.dark).toEqual(generateTheme("#818cf8", { background: "#111111" }));
    });

    it("permet de fixer les fonds clair/sombre et la surface", () => {
        const fam = generateFamily("#818cf8", {
            light: { background: "#f6f7fc", surface: "#ffffff" },
            dark: { background: "#10111d", surface: "#181a2c" },
        });
        expect(fam.light.background.toLowerCase()).toBe("#f6f7fc");
        expect(fam.light.surface.toLowerCase()).toBe("#ffffff");
        expect(fam.dark.background.toLowerCase()).toBe("#10111d");
        expect(fam.dark.surface.toLowerCase()).toBe("#181a2c");
    });

    it("transmet les options PARTAGÉES (radius, hoverRatio) aux deux modes", () => {
        const fam = generateFamily("#4f46e5", { radius: "8px", hoverRatio: 0.2 });
        expect(fam.light.radius).toBe("8px");
        expect(fam.dark.radius).toBe("8px");
        expect(fam.light.accentHover).toBe(mix(fam.light.accent, fam.light.surface, 0.2));
        expect(fam.dark.accentHover).toBe(mix(fam.dark.accent, fam.dark.surface, 0.2));
    });

    it("accent invalide → lève une Error claire", () => {
        expect(() => generateFamily("nope")).toThrow(/hex invalide/i);
    });
});

describe("HolafColor — exposition duale de generateFamily", () => {
    it("disponible en global (window.HolafColor) ET en export ESM", () => {
        expect(typeof generateFamily).toBe("function");
        expect(window.HolafColor).toBe(HolafColor);
        expect(typeof window.HolafColor.generateFamily).toBe("function");
        const fam = window.HolafColor.generateFamily("#4f46e5");
        expect(fam.light && fam.dark).toBeTruthy();
    });
});
