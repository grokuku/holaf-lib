/* Tests HolafQrcode — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture :
 *   - surface d'API et métadonnées (version, global, exports) ;
 *   - capacités normatives (ISO/IEC 18004) et sélection automatique de version ;
 *   - encode() : modèle, UTF-8, ECC, version/masque forcés, erreurs (négatifs) ;
 *   - CSS scopé : getCss/configure/setStyleNonce/injectStyles/per-call nonce ;
 *   - render() SVG : structure, viewBox/marge, couleurs, classes, alt/title,
 *     attributs data-*, chemin des modules ;
 *   - renderCanvas()/toDataURL() : rastérisation (canvas factice), erreurs ;
 *   - VALIDATION PAR DÉCODAGE ALLER-RETOUR (jsQR, devDependency de test) :
 *     URLs courtes/longues, UTF-8 (accents, emoji, CJK), caractères spéciaux,
 *     balayage version × niveau, et CONTRÔLE NÉGATIF (matrice corrompue) ;
 *   - ORACLE MATRICIEL : comparaison cellule par cellule avec l'implémentation
 *     MIT `qrcode-generator` sur les 40 versions × 4 niveaux (masque de la
 *     référence forcé chez nous).
 *
 * Note v23 : jsQR ne décode AUCUNE matrice de version 23, y compris celles des
 * encodeurs de référence (qrcode-generator, node-qrcode) — limitation connue du
 * décodeur, contrôlée explicitement plus bas ; la v23 reste couverte par
 * l'oracle matriciel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import jsQR from "jsqr";
import qrcodeGenerator from "qrcode-generator";
import { HolafQrcode, VERSION } from "../js/holaf-qrcode.js";

// Interop ESM de qrcode-generator : les utilitaires UTF-8 ne sont exposés que
// sur l'export CJS (utilisé par le seul test oracle UTF-8).
const requireCjs = createRequire(import.meta.url);
const qrcodeGeneratorCjs = requireCjs("qrcode-generator");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Rendu matriciel → pixels RGBA (sans canvas), prêt pour un décodeur. */
function rasterize(model, opts) {
    const o = opts || {};
    const scale = o.scale || 3;
    const margin = o.margin === undefined ? 4 : o.margin;
    const total = model.size + margin * 2;
    const px = total * scale;
    const data = new Uint8ClampedArray(px * px * 4);
    for (let y = 0; y < px; y++) {
        const mrow = Math.floor(y / scale) - margin;
        for (let x = 0; x < px; x++) {
            const mcol = Math.floor(x / scale) - margin;
            const dark = mrow >= 0 && mcol >= 0 && mrow < model.size && mcol < model.size &&
                model.modules[mrow * model.size + mcol] === 1;
            const idx = (y * px + x) * 4;
            const v = dark ? 0 : 255;
            data[idx] = v;
            data[idx + 1] = v;
            data[idx + 2] = v;
            data[idx + 3] = 255;
        }
    }
    return { data: data, width: px, height: px };
}

/** Décode une matrice avec jsQR ; null si le décodeur échoue. */
function decode(model, opts) {
    const img = rasterize(model, opts);
    const res = jsQR(img.data, img.width, img.height);
    return res ? res.data : null;
}

/** Matrice de référence de qrcode-generator (même texte/version/niveau). */
function referenceMatrix(text, version, ecc) {
    const qr = qrcodeGenerator(version, ecc);
    qr.addData(text, "Byte");
    qr.make();
    return qr;
}

/** Modèle { size, modules } équivalent à une matrice qrcode-generator. */
function matrixFromReference(qr) {
    const size = qr.getModuleCount();
    const modules = new Uint8Array(size * size);
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            modules[row * size + col] = qr.isDark(row, col) ? 1 : 0;
        }
    }
    return { size: size, modules: modules };
}

/** Masque choisi par la référence, lu dans ses bits de format (colonne 8). */
function referenceFormat(qr) {
    const size = qr.getModuleCount();
    let bits = 0;
    for (let i = 0; i < 15; i++) {
        let row;
        if (i < 6) row = i;
        else if (i < 8) row = i + 1;
        else row = size - 15 + i;
        bits |= (qr.isDark(row, 8) ? 1 : 0) << i;
    }
    bits ^= 0x5412; // dé-masquage ISO
    return { mask: (bits >> 10) & 0x7, eccBits: (bits >> 13) & 0x3 };
}

/** Canvas factice : jsdom n'implémente pas getContext('2d'). */
function installFakeCanvas() {
    const calls = { put: [], dataURL: [] };
    const canvas = {
        width: 0,
        height: 0,
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = v; },
        getAttribute(k) { return this._attrs[k]; },
        getContext(type) {
            if (type !== "2d") return null;
            const self = this;
            return {
                createImageData(w, h) {
                    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
                },
                putImageData(image, x, y) {
                    self._image = image;
                    calls.put.push({ image: image, x: x, y: y });
                },
            };
        },
        toDataURL(type, quality) {
            calls.dataURL.push([type, quality]);
            return "data:image/png;base64,FACTICE";
        },
    };
    const original = document.createElement.bind(document);
    document.createElement = function (tag, options) {
        if (String(tag).toLowerCase() === "canvas") return canvas;
        return original(tag, options);
    };
    return {
        canvas: canvas,
        calls: calls,
        restore: function () { document.createElement = original; },
    };
}

/** Pixel RGBA d'une image factice. */
function pixelAt(image, x, y) {
    const idx = (y * image.width + x) * 4;
    return [image.data[idx], image.data[idx + 1], image.data[idx + 2], image.data[idx + 3]];
}

const STYLE_ID = "holaf-qrcode-style";

beforeEach(() => {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
});

afterEach(() => {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    HolafQrcode.configure({ injectStyles: true, nonce: null });
    vi.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
describe("1. Métadonnées et surface d'API", () => {
    it("expose la version 0.1.0 (constante + objet)", () => {
        expect(VERSION).toBe("0.1.0");
        expect(HolafQrcode.version).toBe("0.1.0");
    });

    it("s'expose en global window.HolafQrcode (fichier DUAL)", () => {
        expect(window.HolafQrcode).toBe(HolafQrcode);
    });

    it("expose les fonctions publiques attendues", () => {
        for (const name of ["encode", "getMatrix", "capacity", "minimalVersion", "render",
            "renderCanvas", "toDataURL", "getCss", "configure", "setStyleNonce"]) {
            expect(typeof HolafQrcode[name], name).toBe("function");
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2. Capacités normatives (ISO 18004)", () => {
    it("v1 : 17/14/11/7 octets pour L/M/Q/H", () => {
        expect(HolafQrcode.capacity({ version: 1, ecc: "L" })).toBe(17);
        expect(HolafQrcode.capacity({ version: 1, ecc: "M" })).toBe(14);
        expect(HolafQrcode.capacity({ version: 1, ecc: "Q" })).toBe(11);
        expect(HolafQrcode.capacity({ version: 1, ecc: "H" })).toBe(7);
    });

    it("v10 : 271/213/151/119 octets pour L/M/Q/H", () => {
        expect(HolafQrcode.capacity({ version: 10, ecc: "L" })).toBe(271);
        expect(HolafQrcode.capacity({ version: 10, ecc: "M" })).toBe(213);
        expect(HolafQrcode.capacity({ version: 10, ecc: "Q" })).toBe(151);
        expect(HolafQrcode.capacity({ version: 10, ecc: "H" })).toBe(119);
    });

    it("v40 : 2953/2331/1663/1273 octets pour L/M/Q/H", () => {
        expect(HolafQrcode.capacity({ version: 40, ecc: "L" })).toBe(2953);
        expect(HolafQrcode.capacity({ version: 40, ecc: "M" })).toBe(2331);
        expect(HolafQrcode.capacity({ version: 40, ecc: "Q" })).toBe(1663);
        expect(HolafQrcode.capacity({ version: 40, ecc: "H" })).toBe(1273);
    });

    it("capacity sans version renvoie la capacité maximale (v40)", () => {
        expect(HolafQrcode.capacity({ ecc: "L" })).toBe(2953);
    });

    it("minimalVersion choisit la première version qui tient", () => {
        expect(HolafQrcode.minimalVersion(14, "M")).toBe(1);
        expect(HolafQrcode.minimalVersion(15, "M")).toBe(2);
        expect(HolafQrcode.minimalVersion(26, "M")).toBe(2);
        expect(HolafQrcode.minimalVersion(27, "M")).toBe(3);
        expect(HolafQrcode.minimalVersion(9999, "L")).toBe(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3. encode() — modèle et options", () => {
    it("renvoie le modèle matriciel complet", () => {
        const model = HolafQrcode.encode("https://albums.test/a/KEY1", { ecc: "M" });
        expect(model.text).toBe("https://albums.test/a/KEY1");
        expect(model.version).toBe(2);
        expect(model.ecc).toBe("M");
        expect(model.size).toBe(4 * model.version + 17);
        expect(model.modules.length).toBe(model.size * model.size);
        expect(model.mask).toBeGreaterThanOrEqual(0);
        expect(model.mask).toBeLessThanOrEqual(7);
        expect(model.bytes.length).toBe(26);
        expect(model.darkAt(0, 0)).toBe(true); // coin d'un finder
        expect(model.darkAt(0, 6)).toBe(true); // bord d'un finder
        expect(model.darkAt(-1, 0)).toBe(false); // hors bornes → false
        expect(model.darkAt(0, 999)).toBe(false);
    });

    it("niveau par défaut = M, insensible à la casse", () => {
        expect(HolafQrcode.encode("x").ecc).toBe("M");
        expect(HolafQrcode.encode("x", { ecc: "q" }).ecc).toBe("Q");
        expect(HolafQrcode.encode("x", { ecc: "h" }).ecc).toBe("H");
    });

    it("l'UTF-8 est compté en OCTETS (accents, euro, emoji)", () => {
        expect(HolafQrcode.encode("é").bytes.length).toBe(2);
        expect(HolafQrcode.encode("€").bytes.length).toBe(3);
        expect(HolafQrcode.encode("😀").bytes.length).toBe(4);
        expect(HolafQrcode.encode("a😀b").bytes.length).toBe(6);
    });

    it("version forcée : respectée, même plus grande que nécessaire", () => {
        expect(HolafQrcode.encode("court", { version: 5 }).version).toBe(5);
        expect(HolafQrcode.encode("court", { version: 5 }).size).toBe(37);
        expect(HolafQrcode.encode("court", { version: 40 }).size).toBe(177);
    });

    it("masque forcé : respecté de 0 à 7 ; auto sinon", () => {
        for (let m = 0; m <= 7; m++) {
            expect(HolafQrcode.encode("masque", { mask: m }).mask).toBe(m);
        }
        const auto = HolafQrcode.encode("masque");
        expect(auto.mask).toBeGreaterThanOrEqual(0);
        expect(auto.mask).toBeLessThanOrEqual(7);
    });

    it("version 10+ : indicateur de comptage sur 16 bits (contenu long)", () => {
        const model = HolafQrcode.encode("A".repeat(300), { ecc: "L" });
        expect(model.version).toBeGreaterThanOrEqual(10);
        expect(model.bytes.length).toBe(300);
    });

    it("encode() est déterministe et getMatrix est son alias", () => {
        const a = HolafQrcode.encode("déterminisme ✅");
        const b = HolafQrcode.encode("déterminisme ✅");
        expect(Array.from(a.modules)).toEqual(Array.from(b.modules));
        const viaAlias = HolafQrcode.getMatrix({ text: "déterminisme ✅" });
        expect(Array.from(viaAlias.modules)).toEqual(Array.from(a.modules));
    });

    it("deux textes différents → matrices différentes", () => {
        const a = HolafQrcode.encode("https://albums.test/a/AAA");
        const b = HolafQrcode.encode("https://albums.test/a/BBB");
        expect(Array.from(a.modules)).not.toEqual(Array.from(b.modules));
    });

    it("[négatif] texte non-chaîne → TypeError", () => {
        expect(() => HolafQrcode.encode(null)).toThrow(TypeError);
        expect(() => HolafQrcode.encode(42)).toThrow(TypeError);
        expect(() => HolafQrcode.encode(undefined)).toThrow(TypeError);
    });

    it("[négatif] texte vide → TypeError", () => {
        expect(() => HolafQrcode.encode("")).toThrow(/vide/);
    });

    it("[négatif] niveau de correction inconnu → TypeError", () => {
        expect(() => HolafQrcode.encode("x", { ecc: "Z" })).toThrow(/correction/);
    });

    it("[négatif] version hors bornes → TypeError", () => {
        expect(() => HolafQrcode.encode("x", { version: 41 })).toThrow(TypeError);
        expect(() => HolafQrcode.encode("x", { version: -1 })).toThrow(TypeError);
        expect(() => HolafQrcode.encode("x", { version: 1.5 })).toThrow(TypeError);
    });

    it("[négatif] masque hors bornes → TypeError", () => {
        expect(() => HolafQrcode.encode("x", { mask: 8 })).toThrow(TypeError);
        expect(() => HolafQrcode.encode("x", { mask: -1 })).toThrow(TypeError);
        expect(() => HolafQrcode.encode("x", { mask: 2.5 })).toThrow(TypeError);
    });

    it("[négatif] mode non supporté → TypeError explicite", () => {
        expect(() => HolafQrcode.encode("x", { mode: "numeric" })).toThrow(/mode/);
        expect(() => HolafQrcode.encode("x", { mode: "byte" })).not.toThrow();
    });

    it("[négatif] texte trop long pour une version forcée → RangeError", () => {
        expect(() => HolafQrcode.encode("A".repeat(30), { version: 1, ecc: "M" })).toThrow(RangeError);
    });

    it("[négatif] texte trop long pour la v40 → RangeError", () => {
        expect(() => HolafQrcode.encode("A".repeat(2954), { ecc: "L" })).toThrow(RangeError);
        expect(() => HolafQrcode.encode("A".repeat(2953), { ecc: "L" })).not.toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4. CSS scopé (getCss / configure / nonce)", () => {
    it("getCss expose un CSS scopé .holaf-qrcode (jamais :root)", () => {
        const css = HolafQrcode.getCss();
        expect(css).toContain(".holaf-qrcode");
        expect(css).not.toContain(":root");
    });

    it("render() injecte le <style> une seule fois (id stable)", () => {
        HolafQrcode.render({ text: "style" });
        HolafQrcode.render({ text: "style" });
        expect(document.querySelectorAll("#" + STYLE_ID).length).toBe(1);
    });

    it("configure({ injectStyles:false }) désactive l'injection", () => {
        HolafQrcode.configure({ injectStyles: false });
        HolafQrcode.render({ text: "sans style" });
        expect(document.getElementById(STYLE_ID)).toBe(null);
    });

    it("l'option d'appel injectStyles:false prime sur le réglage global", () => {
        HolafQrcode.render({ text: "sans style", injectStyles: false });
        expect(document.getElementById(STYLE_ID)).toBe(null);
    });

    it("setStyleNonce / configure({nonce}) posent le nonce du <style>", () => {
        HolafQrcode.setStyleNonce("abc123");
        HolafQrcode.render({ text: "nonce" });
        const style = document.getElementById(STYLE_ID);
        expect(style.getAttribute("nonce")).toBe("abc123");
    });

    it("un nonce d'appel remplace le nonce global (style recréé)", () => {
        HolafQrcode.render({ text: "a", nonce: "un" });
        HolafQrcode.render({ text: "b", nonce: "deux" });
        const style = document.getElementById(STYLE_ID);
        expect(style.getAttribute("nonce")).toBe("deux");
        expect(document.querySelectorAll("#" + STYLE_ID).length).toBe(1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5. render() — SVG", () => {
    const NS = "http://www.w3.org/2000/svg";

    it("renvoie un <svg> avec viewBox, role et data-* de version", () => {
        const svg = HolafQrcode.render({ text: "https://albums.test/a/KEY1", ecc: "M" });
        expect(svg.namespaceURI).toBe(NS);
        expect(svg.tagName.toLowerCase()).toBe("svg");
        expect(svg.getAttribute("viewBox")).toBe("0 0 33 33"); // v2 (25) + marge 4
        expect(svg.getAttribute("width")).toBe("200");
        expect(svg.getAttribute("height")).toBe("200");
        expect(svg.getAttribute("role")).toBe("img");
        expect(svg.getAttribute("data-holaf-qr-version")).toBe("2");
        expect(svg.getAttribute("data-holaf-qr-ecc")).toBe("M");
        expect(svg.getAttribute("data-holaf-qr-modules")).toBe("25");
        expect(svg.getAttribute("data-holaf-qr-mask")).toMatch(/^[0-7]$/);
    });

    it("viewBox suit la marge (0, 4 par défaut, taille libre)", () => {
        expect(HolafQrcode.render({ text: "m", version: 1, margin: 0 }).getAttribute("viewBox"))
            .toBe("0 0 21 21");
        expect(HolafQrcode.render({ text: "m", version: 1, margin: 2 }).getAttribute("viewBox"))
            .toBe("0 0 25 25");
        expect(HolafQrcode.render({ text: "m", version: 1, margin: -3 }).getAttribute("viewBox"))
            .toBe("0 0 21 21"); // marge négative → 0
        expect(HolafQrcode.render({ text: "m", version: 1, size: 320, margin: 1 })
            .getAttribute("viewBox")).toBe("0 0 23 23");
        expect(HolafQrcode.render({ text: "m", version: 1 }).getAttribute("width")).toBe("200");
        expect(HolafQrcode.render({ text: "m", version: 1, size: 320 }).getAttribute("width")).toBe("320");
        expect(HolafQrcode.render({ text: "m", version: 1, size: "oops" }).getAttribute("width")).toBe("200");
    });

    it("fond clair par défaut, retiré avec background:false", () => {
        const withBg = HolafQrcode.render({ text: "bg" });
        expect(withBg.querySelectorAll("rect").length).toBe(1);
        const withoutBg = HolafQrcode.render({ text: "bg", background: false });
        expect(withoutBg.querySelectorAll("rect").length).toBe(0);
    });

    it("couleurs dark/light appliquées (fond + chemin)", () => {
        const svg = HolafQrcode.render({ text: "couleurs", dark: "#0b0b0b", light: "#f5f5f5" });
        expect(svg.querySelector("rect").getAttribute("fill")).toBe("#f5f5f5");
        expect(svg.querySelector("path").getAttribute("fill")).toBe("#0b0b0b");
    });

    it("classe holaf-qrcode + className + variante inline", () => {
        const base = HolafQrcode.render({ text: "classe" });
        expect(base.getAttribute("class")).toBe("holaf-qrcode");
        const custom = HolafQrcode.render({ text: "classe", className: "mon-qr", inline: true });
        expect(custom.getAttribute("class")).toContain("holaf-qrcode");
        expect(custom.getAttribute("class")).toContain("mon-qr");
        expect(custom.getAttribute("class")).toContain("holaf-qrcode--inline");
    });

    it("le chemin contient EXACTEMENT autant de modules que de cases sombres", () => {
        const model = HolafQrcode.encode("modules", { ecc: "H" });
        let dark = 0;
        for (let i = 0; i < model.modules.length; i++) dark += model.modules[i];
        const svg = HolafQrcode.render({ text: "modules", ecc: "H" });
        const d = svg.querySelector("path").getAttribute("d");
        expect((d.match(/M/g) || []).length).toBe(dark);
    });

    it("alt/title sont accessibles (aria-label + <title>)", () => {
        const svg = HolafQrcode.render({ text: "alt", alt: "QR de l'album" });
        expect(svg.getAttribute("aria-label")).toBe("QR de l'album");
        const withTitle = HolafQrcode.render({ text: "alt", title: "Album public" });
        expect(withTitle.getAttribute("aria-label")).toBe("Album public");
        expect(withTitle.querySelector("title").textContent).toBe("Album public");
    });

    it("[négatif] render() avec entrée invalide → erreur, aucun SVG partiel", () => {
        expect(() => HolafQrcode.render({ text: "" })).toThrow(TypeError);
        expect(() => HolafQrcode.render({})).toThrow(TypeError);
        expect(() => HolafQrcode.render({ text: "x", ecc: "?" })).toThrow(TypeError);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6. renderCanvas() / toDataURL()", () => {
    it("rastérise : taille, marges, couleurs, attributs", () => {
        const fake = installFakeCanvas();
        try {
            const canvas = HolafQrcode.renderCanvas({
                text: "canvas", version: 1, margin: 1, scale: 4,
                dark: "#000000", light: "#ffffff",
            });
            expect(canvas).toBe(fake.canvas);
            expect(canvas.width).toBe((21 + 2) * 4);
            expect(canvas.height).toBe((21 + 2) * 4);
            expect(canvas.getAttribute("data-holaf-qr-version")).toBe("1");
            expect(canvas.getAttribute("class")).toContain("holaf-qrcode");
            expect(fake.calls.put.length).toBe(1);
            const image = fake.calls.put[0].image;
            expect(image.width).toBe(92);
            expect(pixelAt(image, 0, 0)).toEqual([255, 255, 255, 255]); // marge claire
            const firstDark = HolafQrcode.encode("canvas", { version: 1 }).darkAt(0, 0);
            expect(firstDark).toBe(true);
            expect(pixelAt(image, 4, 4)).toEqual([0, 0, 0, 255]); // module (0,0) sombre
        } finally {
            fake.restore();
        }
    });

    it("scale par défaut = 8 et couleurs personnalisées prises en compte", () => {
        const fake = installFakeCanvas();
        try {
            HolafQrcode.renderCanvas({ text: "canvas", version: 1, margin: 0, dark: "#102030", light: "#e0e0e0" });
            const image = fake.calls.put[0].image;
            expect(fake.canvas.width).toBe(21 * 8);
            expect(pixelAt(image, 7, 7)).toEqual([0x10, 0x20, 0x30, 255]);
        } finally {
            fake.restore();
        }
    });

    it("toDataURL renvoie la dataURL et propage type/quality", () => {
        const fake = installFakeCanvas();
        try {
            expect(HolafQrcode.toDataURL({ text: "data" })).toBe("data:image/png;base64,FACTICE");
            expect(fake.calls.dataURL[fake.calls.dataURL.length - 1][0]).toBe("image/png");
            HolafQrcode.toDataURL({ text: "data", type: "image/webp", quality: 0.5 });
            expect(fake.calls.dataURL[fake.calls.dataURL.length - 1]).toEqual(["image/webp", 0.5]);
        } finally {
            fake.restore();
        }
    });

    it("[négatif] canvas sans contexte 2D → erreur claire", () => {
        const original = document.createElement.bind(document);
        document.createElement = function (tag, options) {
            if (String(tag).toLowerCase() === "canvas") {
                return { width: 0, height: 0, getContext: function () { return null; }, toDataURL: function () { return ""; } };
            }
            return original(tag, options);
        };
        try {
            expect(() => HolafQrcode.renderCanvas({ text: "x" })).toThrow(/canvas 2D/);
            expect(() => HolafQrcode.toDataURL({ text: "x" })).toThrow(/canvas 2D/);
        } finally {
            document.createElement = original;
        }
    });

    it("[négatif] couleur non-hex pour le canvas → TypeError explicite", () => {
        const fake = installFakeCanvas();
        try {
            expect(() => HolafQrcode.renderCanvas({ text: "x", dark: "rebeccapurple" })).toThrow(/couleur canvas/);
        } finally {
            fake.restore();
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7. VALIDATION — décodage aller-retour (jsQR)", () => {
    it("URL courte : les 4 niveaux L/M/Q/H reviennent à l'identique", () => {
        const url = "https://albums.test/a/KEY1";
        for (const ecc of ["L", "M", "Q", "H"]) {
            const model = HolafQrcode.encode(url, { ecc: ecc });
            expect(model.version).toBeLessThanOrEqual(4); // v4 requis en niveau H
            expect(decode(model)).toBe(url);
        }
    });

    it("URL longue (~140 caractères) avec paramètres", () => {
        const url = "https://albums.holaf.fr/a/k3y-2025?utm_source=qr&ref=caf%C3%A9&page=2#top";
        const model = HolafQrcode.encode(url, { ecc: "M" });
        expect(model.version).toBeGreaterThan(2);
        expect(decode(model)).toBe(url);
    });

    it("UTF-8 : accents, emoji, CJK, tirets", () => {
        const text = "café ☕ 日本語 — clé secrète !";
        for (const ecc of ["L", "M", "Q", "H"]) {
            const model = HolafQrcode.encode(text, { ecc: ecc });
            expect(decode(model)).toBe(text);
        }
    });

    it("caractères spéciaux d'URL et d'échappement", () => {
        const text = "a&b=c?d/e#f%20g+h~_-.!*'();:@$,[]{}|\\^\"<> ";
        expect(decode(HolafQrcode.encode(text, { ecc: "Q" }))).toBe(text);
    });

    it("version forcée : le décodeur retrouve la version imposée", () => {
        const text = "https://albums.test/a/FORCE";
        for (const version of [5, 7, 10]) {
            const model = HolafQrcode.encode(text, { version: version, ecc: "M" });
            const img = rasterize(model);
            const res = jsQR(img.data, img.width, img.height);
            expect(res, "décodage v" + version).toBeTruthy();
            expect(res.data).toBe(text);
            expect(res.version).toBe(version);
        }
    });

    it("chaîne longue (500 octets) décodée à l'identique", () => {
        const text = "https://exemple.fr/a/" + "x".repeat(480);
        const model = HolafQrcode.encode(text, { ecc: "L" });
        expect(model.version).toBeGreaterThanOrEqual(10);
        expect(decode(model)).toBe(text);
    });

    it("balayage v1..v40 × L/M/Q/H : décodage exact (v23-L = limite décodeur)", () => {
        // 159/160 combinaisons se décodent à l'identique. La v23 niveau L
        // s'avère indécodable par jsQR (détecteur trompé par les motifs du
        // contenu : TOUS les masques échouent) — vérifié juste après comme une
        // limite du DÉCODEUR : les matrices de qrcode-generator échouent pareil,
        // et la nôtre est cellule-pour-cellule identique (test oracle du §8).
        const failures = [];
        let decoded = 0;
        for (let version = 1; version <= 40; version++) {
            for (const ecc of ["L", "M", "Q", "H"]) {
                const bytes = HolafQrcode.capacity({ version: version, ecc: ecc });
                const text = ("V" + version + ecc + ":" + "x".repeat(bytes)).slice(0, bytes);
                const model = HolafQrcode.encode(text, { version: version, ecc: ecc });
                const back = decode(model, { scale: 2 });
                if (back === text) {
                    decoded++;
                    continue;
                }
                const ref = referenceMatrix(text, version, ecc);
                const refMatrix = matrixFromReference(ref);
                const refBack = decode(refMatrix, { scale: 2 });
                expect(refBack, "la référence doit échouer aussi (v" + version + ecc + ")").not.toBe(text);
                failures.push(version + ecc);
            }
        }
        expect(failures).toEqual(["23L"]);
        expect(decoded).toBe(159);
    }, 120000);

    it("v23-L : jsQR refuse nos matrices ET celles de la référence (limitation décodeur)", () => {
        // La v23 niveau L maximale est le seul cas non décodé par jsQR. On
        // vérifie que ce n'est PAS un défaut d'encodage : pour le masque de la
        // référence, notre matrice lui est identique cellule pour cellule, et
        // le décodeur refuse EXACTEMENT la même matrice. Aucun des 8 masques
        // ne sauve ce contenu : c'est le détecteur de jsQR qui est trompé.
        const bytes = HolafQrcode.capacity({ version: 23, ecc: "L" });
        const text = ("V23L:" + "x".repeat(bytes)).slice(0, bytes);
        const ref = referenceMatrix(text, 23, "L");
        const refInfo = referenceFormat(ref);
        const oursForced = HolafQrcode.encode(text, { version: 23, ecc: "L", mask: refInfo.mask });
        let diff = 0;
        for (let row = 0; row < oursForced.size; row++) {
            for (let col = 0; col < oursForced.size; col++) {
                if (ref.isDark(row, col) !== (oursForced.modules[row * oursForced.size + col] === 1)) diff++;
            }
        }
        expect(diff).toBe(0); // nos v23-L sont conformes à la référence
        expect(decode(oursForced)).toBe(null);
        expect(decode(matrixFromReference(ref))).toBe(null);
        for (let mask = 0; mask < 8; mask++) {
            expect(decode(HolafQrcode.encode(text, { version: 23, ecc: "L", mask: mask }))).toBe(null);
        }
        // À l'inverse, la v23 des autres niveaux se décode normalement :
        for (const ecc of ["M", "Q", "H"]) {
            const n = HolafQrcode.capacity({ version: 23, ecc: ecc });
            const other = ("V23" + ecc + ":" + "x".repeat(n)).slice(0, n);
            expect(decode(HolafQrcode.encode(other, { version: 23, ecc: ecc }))).toBe(other);
        }
    }, 60000);

    it("[contrôle négatif] matrice corrompue → le décodeur ne retrouve PAS le texte", () => {
        const text = "https://albums.test/a/KEY1";
        const model = HolafQrcode.encode(text, { ecc: "L" });
        const broken = Uint8Array.from(model.modules);
        let flipped = 0;
        for (let row = 12; row < model.size && flipped < 60; row++) {
            for (let col = 12; col < model.size && flipped < 60; col++) {
                broken[row * model.size + col] = broken[row * model.size + col] ? 0 : 1;
                flipped++;
            }
        }
        const result = decode({ size: model.size, modules: broken });
        expect(result === null || result !== text).toBe(true);
    });

    it("[contrôle négatif] mauvais texte attendu → l'assertion aurait échoué", () => {
        const model = HolafQrcode.encode("https://albums.test/a/REEL");
        expect(decode(model)).not.toBe("https://albums.test/a/AUTRE");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("8. ORACLE matriciel — comparaison qrcode-generator (MIT)", () => {
    it("40 versions × 4 niveaux : matrices identiques à la référence", () => {
        // Le masque de la référence est lu dans ses bits de format et forcé
        // chez nous : tout écart restant est une erreur d'encodage (RS, blocs,
        // placement, format/version), pas un choix de masque différent.
        const expectedEccBits = { L: 0x1, M: 0x0, Q: 0x3, H: 0x2 };
        const mismatches = [];
        for (let version = 1; version <= 40; version++) {
            for (const ecc of ["L", "M", "Q", "H"]) {
                const bytes = HolafQrcode.capacity({ version: version, ecc: ecc });
                const text = ("V" + version + ecc + ":" + "A".repeat(bytes)).slice(0, bytes);
                const ref = referenceMatrix(text, version, ecc);
                const info = referenceFormat(ref);
                expect(info.eccBits, "bits de format de la référence").toBe(expectedEccBits[ecc]);
                const ours = HolafQrcode.encode(text, { version: version, ecc: ecc, mask: info.mask });
                const size = ours.size;
                let diff = 0;
                for (let row = 0; row < size && diff === 0; row++) {
                    for (let col = 0; col < size; col++) {
                        if (ref.isDark(row, col) !== (ours.modules[row * size + col] === 1)) {
                            diff++;
                            break;
                        }
                    }
                }
                if (diff) mismatches.push(version + ecc);
            }
        }
        expect(mismatches).toEqual([]);
    }, 120000);

    it("oracle UTF-8 (stringToBytes UTF-8 de la référence) sur une URL accentuée", () => {
        const text = "https://albums.test/a/clé-secrète?titre=Café%20☕";
        const previous = qrcodeGeneratorCjs.stringToBytes;
        qrcodeGeneratorCjs.stringToBytes = qrcodeGeneratorCjs.stringToBytesFuncs["UTF-8"];
        try {
            for (const [version, ecc] of [[5, "M"], [10, "Q"]]) {
                const qr = qrcodeGeneratorCjs(version, ecc);
                qr.addData(text, "Byte");
                qr.make();
                const info = referenceFormat(qr);
                const ours = HolafQrcode.encode(text, { version: version, ecc: ecc, mask: info.mask });
                const size = ours.size;
                let diff = 0;
                for (let row = 0; row < size; row++) {
                    for (let col = 0; col < size; col++) {
                        if (qr.isDark(row, col) !== (ours.modules[row * size + col] === 1)) diff++;
                    }
                }
                expect(diff, "v" + version + ecc).toBe(0);
            }
        } finally {
            qrcodeGeneratorCjs.stringToBytes = previous;
        }
    });
});
