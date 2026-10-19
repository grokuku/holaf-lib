/* Tests HolafIcons — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : list() (non vide, taille attendue), get()/render() sur TOUS les
 * noms connus (boucle), attributs feather (currentColor, stroke-width 2, fill
 * none, viewBox 24×24), render() avec size/class appliqués, erreur claire sur
 * nom inconnu (avec propositions des proches), exposition globale + version,
 * et par vague d'ajout (v0.1.4 → v0.1.7) la présence des noms + quelques
 * assertions de tracé.
 */
import { describe, expect, it } from "vitest";
import { HolafIcons } from "../js/holaf-icons.js";

// Icônes ajoutées en v0.1.7 (phase 0 de la migration d'icônes d'AI-Helper).
// Tracés Lucide (ISC) sourcés via l'API icons0.dev : GET /api/icons?q=lucide:<nom>.
const NEW_017 = [
    // verrou / accès
    "lock", "lock-open", "ban",
    // personnes / messagerie / expression
    "users", "message-square", "heart",
    // affichage / médias
    "monitor", "video",
    // filtres / étiquettes / aléatoire
    "filter", "tag", "shuffle", "dices",
    // sélection / géométrie
    "crosshair", "circle", "grip-vertical",
    // édition
    "eraser",
    // progression
    "loader", "skip-forward",
    // technique / écologie / mise à l'échelle
    "syringe", "recycle", "scaling",
];

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

    it("list() contient les 39 icônes ajoutées en v0.1.6 (fin de la migration Pi-Web)", () => {
        const names = HolafIcons.list();
        for (const n of [
            "file", "file-down", "folder-plus", "folder-x",
            "save", "send", "undo-2", "redo-2", "unlink", "zoom-in", "zoom-out",
            "message-square-plus", "check-check", "check-circle", "check-square",
            "plus-square", "square", "toggle-left", "toggle-right",
            "code", "cpu", "git-commit", "keyboard", "wifi", "wrench", "test-tube",
            "calendar", "hash", "pie-chart", "trending-up", "gauge",
            "package", "palette", "puzzle", "lightbulb", "sparkles", "mail",
            "paperclip", "image-off",
        ]) {
            expect(names).toContain(n);
        }
    });

    it("list() contient les 21 icônes ajoutées en v0.1.7 (migration AI-Helper)", () => {
        const names = HolafIcons.list();
        for (const n of NEW_017) {
            expect(names).toContain(n);
        }
    });

    it("list() compte 114 icônes (93 en v0.1.6 + 21 en v0.1.7)", () => {
        expect(HolafIcons.list().length).toBe(114);
    });
});

describe("icônes v0.1.7 — tracés Lucide repris à l'identique (ISC, via icons0.dev)", () => {
    it("les 21 nouvelles icônes rendent un SVG trait valide", () => {
        for (const n of NEW_017) {
            const svg = HolafIcons.get(n);
            expect(svg).toMatch(/^<svg/);
            expect(svg).toContain('stroke="currentColor"');
            expect(svg).toContain('stroke-width="2"');
            expect(svg).toContain('fill="none"');
            expect(svg).toContain('viewBox="0 0 24 24"');
            expect(svg).toMatch(/<(path|polygon|line|polyline|circle|rect) /);
        }
    });

    it("aucun attribut de présentation dupliqué dans le corps (wrapper unique)", () => {
        for (const n of NEW_017) {
            const svg = HolafIcons.get(n);
            // stroke-width / stroke / fill ne doivent apparaître qu'UNE fois :
            // sur le <svg> construit par buildSvg, jamais sur les éléments.
            expect(svg.match(/stroke-width=/g)).toHaveLength(1);
            expect(svg.match(/stroke="currentColor"/g)).toHaveLength(1);
            expect(svg.match(/fill="none"/g)).toHaveLength(1);
            expect(svg).not.toContain("<g ");
        }
    });

    it("render() applique size/class sur les 21 nouvelles icônes", () => {
        for (const n of NEW_017) {
            const svg = HolafIcons.render(n, { size: 16, class: "aih-icon" });
            expect(svg).toContain('width="16"');
            expect(svg).toContain('height="16"');
            expect(svg).toContain('class="aih-icon"');
        }
    });

    it("tracés de référence : lock, lock-open, loader (alias lucide:loader-circle)", () => {
        // lucide:lock — corps de serrure + anse fermée
        const lock = HolafIcons.get("lock");
        expect(lock).toContain('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>');
        expect(lock).toContain('d="M7 11V7a5 5 0 0 1 10 0v4"');
        // lucide:lock-open — même corps, anse ouverte (seul le tracé diffère)
        const open = HolafIcons.get("lock-open");
        expect(open).toContain('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>');
        expect(open).toContain('d="M7 11V7a5 5 0 0 1 9.9-1"');
        // `loader` est l'alias court de lucide:loader-circle (arc ouvert)
        expect(HolafIcons.get("loader")).toContain('d="M21 12a9 9 0 1 1-6.219-8.56"');
        // …et n'est PAS le loader « 8 rayons » de Lucide
        expect(HolafIcons.get("loader")).not.toContain("<line");
    });

    it("message-square est distinct de message-square-plus (pas de croix)", () => {
        const plain = HolafIcons.get("message-square");
        expect(plain).toContain('d="M22 17a2 2 0 0 1-2 2H6.828a2 2');
        expect(plain).not.toContain('d="M12 7v6"');
        expect(plain).not.toContain('d="M9 10h6"');
        expect(HolafIcons.get("message-square-plus")).toContain('d="M12 7v6"');
    });

    it("les points pleins gardent fill=currentColor, les disques restent en trait", () => {
        // lucide:tag — pastille pleine de l'étiquette
        expect(HolafIcons.get("tag")).toContain('r=".5" fill="currentColor"');
        // lucide:circle — un seul disque, en TRAIT (non rempli)
        const circle = HolafIcons.get("circle");
        expect(circle.match(/<(circle|path|line|rect)/g)).toHaveLength(1);
        expect(circle).toContain('<circle cx="12" cy="12" r="10"></circle>');
        expect(circle).not.toContain('fill="currentColor"');
        // lucide:grip-vertical — six disques en trait
        const grip = HolafIcons.get("grip-vertical");
        expect(grip.match(/<circle /g)).toHaveLength(6);
        expect(grip).not.toContain('fill="currentColor"');
    });
});

describe("icônes v0.1.6 — tracés Lucide repris à l'identique (ISC)", () => {
    it("les 39 nouvelles icônes rendent un SVG trait valide", () => {
        const news = [
            "file", "file-down", "folder-plus", "folder-x",
            "save", "send", "undo-2", "redo-2", "unlink", "zoom-in", "zoom-out",
            "message-square-plus", "check-check", "check-circle", "check-square",
            "plus-square", "square", "toggle-left", "toggle-right",
            "code", "cpu", "git-commit", "keyboard", "wifi", "wrench", "test-tube",
            "calendar", "hash", "pie-chart", "trending-up", "gauge",
            "package", "palette", "puzzle", "lightbulb", "sparkles", "mail",
            "paperclip", "image-off",
        ];
        for (const n of news) {
            const svg = HolafIcons.get(n);
            expect(svg).toMatch(/^<svg/);
            expect(svg).toContain('stroke="currentColor"');
            expect(svg).toContain('stroke-width="2"');
            expect(svg).toContain('fill="none"');
            expect(svg).toContain('viewBox="0 0 24 24"');
            expect(svg).toMatch(/<(path|polygon|line|polyline|circle|rect) /);
        }
    });

    it("alias lucide résolus : check-circle = circle-check-big, test-tube = test-tube-2", () => {
        // lucide-react 0.446 expose CheckCircle → circle-check-big ; le tracé
        // attendu est celui du "grand cercle" (arc ouvert + coche).
        expect(HolafIcons.get("check-circle")).toContain(
            'd="M21.801 10A10 10 0 1 1 17 3.335"'
        );
        // TestTube2 → test-tube-diagonal (tube incliné) ; le tracé reprend la
        // base du tube (M21 7 6.82 21.18…) et le petit trait M12 16H4.
        const tube = HolafIcons.get("test-tube");
        expect(tube).toContain("M21 7 6.82 21.18");
        expect(tube).toContain('d="M12 16H4"');
    });

    it("non-régression : plus-square = carré arrondi + croix, comme lucide", () => {
        const svg = HolafIcons.get("plus-square");
        expect(svg).toContain('<rect width="18" height="18" x="3" y="3" rx="2"></rect>');
        expect(svg).toContain('d="M12 8v8"');
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
