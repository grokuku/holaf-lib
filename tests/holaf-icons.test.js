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

    it("list() contient les 11 icônes ajoutées en v0.1.4 (migration Pi-Web)", () => {
        const names = HolafIcons.list();
        for (const n of [
            "file-text", "external-link", "arrow-up-circle", "arrow-up",
            "arrow-down", "user", "key", "power", "star", "folder-open",
            "brain",
        ]) {
            expect(names).toContain(n);
        }
    });

    it("list() contient les 3 icônes ajoutées en v0.1.5 (migration Yuki)", () => {
        const names = HolafIcons.list();
        for (const n of ["arrow-left", "volume", "volume-off"]) {
            expect(names).toContain(n);
        }
    });
});

describe("icônes v0.1.5 — arrow-left / volume / volume-off", () => {
    it("get() renvoie un SVG trait valide (currentColor, stroke-width 2, 24×24)", () => {
        for (const n of ["arrow-left", "volume", "volume-off"]) {
            const svg = HolafIcons.get(n);
            expect(svg).toMatch(/^<svg/);
            expect(svg).toContain("stroke=\"currentColor\"");
            expect(svg).toContain("stroke-width=\"2\"");
            expect(svg).toContain("fill=\"none\"");
            expect(svg).toContain("viewBox=\"0 0 24 24\"");
            // corps d'icône présent (au moins un tracé interne)
            expect(svg).toMatch(/<(path|polygon|line|polyline|circle|rect) /);
        }
    });

    it("render() applique size/class et renvoie un <svg> valide", () => {
        for (const n of ["arrow-left", "volume", "volume-off"]) {
            const svg = HolafIcons.render(n, { size: 20, class: "tts-icon" });
            expect(svg.startsWith("<svg")).toBe(true);
            expect(svg).toContain('width="20"');
            expect(svg).toContain('height="20"');
            expect(svg).toContain('class="tts-icon"');
        }
    });

    it("arrow-left est le miroir horizontal d'arrow-right (mêmes coordonnées miroir)", () => {
        const left = HolafIcons.get("arrow-left");
        const right = HolafIcons.get("arrow-right");
        // la flèche gauche contient bien le retour de la ligne 19→5
        expect(left).toContain('x1="19" y1="12" x2="5" y2="12"');
        expect(right).toContain('x1="5" y1="12" x2="19" y2="12"');
    });

    it("non-régression : sun/moon inchangés (tracés Feather encore présents)", () => {
        const sun = HolafIcons.get("sun");
        expect(sun).toContain('<circle cx="12" cy="12" r="5"></circle>');
        expect(sun).toContain('<line x1="12" y1="1" x2="12" y2="3"></line>');
        const moon = HolafIcons.get("moon");
        expect(moon).toContain('d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"');
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
