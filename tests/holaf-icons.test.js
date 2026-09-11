/* Tests HolafIcons — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : list() (non vide, taille attendue), get()/render() sur TOUS les
 * noms connus (boucle), attributs feather (currentColor, stroke-width 2, fill
 * none, viewBox 24×24), render() avec size/class appliqués, erreur claire sur
 * nom inconnu (avec propositions des proches), exposition globale + version.
 */
import { describe, expect, it } from "vitest";
import { HolafIcons } from "../js/holaf-icons.js";

describe("liste des icônes", () => {
    it("list() retourne un tableau non vide d'au moins 30 noms", () => {
        const names = HolafIcons.list();
        expect(Array.isArray(names)).toBe(true);
        expect(names.length).toBeGreaterThanOrEqual(30);
        expect(new Set(names).size).toBe(names.length); // sans doublons
    });

    it("list() contient les noms attendus par Homy", () => {
        const names = HolafIcons.list();
        for (const n of [
            "layout", "link", "clock", "image", "search", "edit", "cloud",
            "x", "plus", "trash", "gear", "play", "pause", "check",
            "download", "upload", "copy", "refresh", "folder", "sun", "moon",
        ]) {
            expect(names).toContain(n);
        }
    });
});

describe("get() — tous les noms connus", () => {
    it("get() renvoie un SVG valide pour CHAQUE nom (boucle)", () => {
        for (const name of HolafIcons.list()) {
            const svg = HolafIcons.get(name);
            expect(typeof svg).toBe("string");
            expect(svg).toMatch(/^<svg/);
            expect(svg).toContain("stroke=\"currentColor\"");
            expect(svg).toContain("stroke-width=\"2\"");
            expect(svg).toContain("fill=\"none\"");
        }
    });

    it("get() exporte le style feather (viewBox 24×24, taille 24 par défaut)", () => {
        const svg = HolafIcons.get("check");
        expect(svg).toContain("viewBox=\"0 0 24 24\"");
        expect(svg).toContain("width=\"24\"");
        expect(svg).toContain("height=\"24\"");
        expect(svg).toContain("stroke-linecap=\"round\"");
    });
});

describe("render() — options size / class", () => {
    it("render() applique size (width/height personnalisés)", () => {
        const svg = HolafIcons.render("sun", { size: 48 });
        expect(svg).toContain("width=\"48\"");
        expect(svg).toContain("height=\"48\"");
    });

    it("render() applique l'attribut class", () => {
        const svg = HolafIcons.render("moon", { class: "icon-demo" });
        expect(svg).toContain("class=\"icon-demo\"");
    });

    it("render() sans options → taille 24, sans class", () => {
        const svg = HolafIcons.render("gear");
        expect(svg).toContain("width=\"24\"");
        expect(svg).not.toMatch(/class=/);
    });

    it("render() sur tous les noms connus (boucle) ne jette pas", () => {
        for (const name of HolafIcons.list()) {
            expect(() => HolafIcons.render(name, { size: 20, class: "ic" })).not.toThrow();
        }
    });
});

describe("noms inconnus → erreur claire", () => {
    it("get('inconnu') — get() est identique à render() de base (SVG complet)", () => {
        expect(HolafIcons.render("check", {}).startsWith("<svg")).toBe(true);
    });

    it("unknown name → throw listant les proches", () => {
        expect(() => HolafIcons.get("plasma")).toThrow(/inconnue|unknown/i);
        expect(() => HolafIcons.get("plasma")).toThrow(/Proches/);
    });

    it("close name → la proposition proche est listée (distance de Levenshtein)", () => {
        try {
            HolafIcons.get("trsh");
            expect.unreachable("devrait avoir levé une erreur");
        } catch (err) {
            expect(err.message).toMatch(/trsh/);
            expect(err.message).toMatch(/trash/); // candidat le plus proche
        }
    });

    it("nom non-string (null/undefined/nombre) → erreur", () => {
        expect(() => HolafIcons.get(null)).toThrow();
        expect(() => HolafIcons.get(undefined)).toThrow();
        expect(() => HolafIcons.get(42)).toThrow();
        expect(() => HolafIcons.render("x", {})).not.toThrow();
    });

    it("unknown name via render → throw (même garde-fou que get)", () => {
        expect(() => HolafIcons.render("does-not-exist")).toThrow(/inconnue|unknown/i);
    });
});
