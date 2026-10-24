/* Tests HolafIcons — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : list() (non vide, taille attendue), get()/render() sur TOUS les
 * noms connus (boucle), attributs feather (currentColor, stroke-width 2, fill
 * none, viewBox 24×24), render() avec size/class appliqués, erreur claire sur
 * nom inconnu (avec propositions des proches), exposition globale + version,
 * et par vague d'ajout (v0.1.4 → v0.1.8) la présence des noms + quelques
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

// Icônes ajoutées en v0.1.8 (migration d'icônes de Docky).
// Tracés Lucide (ISC) sourcés via l'API icons0.dev : GET /api/icons?q=lucide:<nom>.
// Noms CANONIQUES Lucide : chart-column ← bar-chart-3, rotate-ccw-clock ← history,
// square-pen ← pen-square. `loader` a vu son TRACÉ remplacé (même nom).
const NEW_018 = [
    // graphiques / historique
    "chart-column", "rotate-ccw-clock",
    // fichiers / presse-papiers
    "clipboard-list", "file-plus",
    // système / matériel / réseau
    "bot", "cable", "hard-drive", "plug", "rocket", "webhook",
    // interface / listes
    "layout-grid", "list", "message-circle", "panel-right", "square-pen",
    // actions / rafraîchissement
    "refresh-cw", "trash-2",
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

    it("list() contient les 17 icônes ajoutées en v0.1.8 (migration Docky)", () => {
        const names = HolafIcons.list();
        for (const n of NEW_018) {
            expect(names).toContain(n);
        }
    });

    it("list() compte 131 icônes (114 en v0.1.7 + 17 en v0.1.8)", () => {
        expect(HolafIcons.list().length).toBe(131);
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

    it("tracés de référence : lock, lock-open", () => {
        // lucide:lock — corps de serrure + anse fermée
        const lock = HolafIcons.get("lock");
        expect(lock).toContain('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>');
        expect(lock).toContain('d="M7 11V7a5 5 0 0 1 10 0v4"');
        // lucide:lock-open — même corps, anse ouverte (seul le tracé diffère)
        const open = HolafIcons.get("lock-open");
        expect(open).toContain('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>');
        expect(open).toContain('d="M7 11V7a5 5 0 0 1 9.9-1"');
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

describe("icônes v0.1.8 — tracés Lucide sous noms canoniques (ISC, via icons0.dev)", () => {
    it("les 17 nouvelles icônes rendent un SVG trait valide", () => {
        for (const n of NEW_018) {
            const svg = HolafIcons.get(n);
            expect(svg).toMatch(/^<svg/);
            expect(svg).toContain('stroke="currentColor"');
            expect(svg).toContain('stroke-width="2"');
            expect(svg).toContain('fill="none"');
            expect(svg).toContain('viewBox="0 0 24 24"');
            expect(svg).toMatch(/<(path|polygon|line|polyline|circle|rect) /);
        }
    });

    it("aucun attribut de présentation dupliqué et aucun <g> dans le corps", () => {
        for (const n of NEW_018) {
            const svg = HolafIcons.get(n);
            expect(svg.match(/stroke-width=/g)).toHaveLength(1);
            expect(svg.match(/stroke="currentColor"/g)).toHaveLength(1);
            expect(svg.match(/fill="none"/g)).toHaveLength(1);
            expect(svg).not.toContain("<g ");
        }
    });

    it("render() applique size/class sur les 17 nouvelles icônes", () => {
        for (const n of NEW_018) {
            const svg = HolafIcons.render(n, { size: 20, class: "docky-icon" });
            expect(svg).toContain('width="20"');
            expect(svg).toContain('height="20"');
            expect(svg).toContain('class="docky-icon"');
        }
    });

    it("les alias canoniques portent bien le tracé de leur icône Lucide d'origine", () => {
        // chart-column ← lucide:bar-chart-3 (bar-chart-3 est déprécié côté Lucide)
        expect(HolafIcons.get("chart-column")).toContain('d="M3 3v18h18m-3-4V9m-5 8V5M8 17v-3"');
        // rotate-ccw-clock ← lucide:history (arc + aiguille horaire)
        const hist = HolafIcons.get("rotate-ccw-clock");
        expect(hist).toContain('d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"');
        expect(hist).toContain('d="M3 3v5h5m4-1v5l4 2"');
        // square-pen ← lucide:pen-square (cadre ouvert + stylo)
        const sq = HolafIcons.get("square-pen");
        expect(sq).toContain('d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"');
        expect(sq).toContain("M18.375 2.625");
        // les anciens noms Docky ne sont PAS exposés (pas d'alias)
        for (const old of ["bar-chart-3", "history", "pen-square"]) {
            expect(HolafIcons.list()).not.toContain(old);
        }
    });

    it("loader : tracé lucide:loader canonique (même nom qu'en 0.1.7)", () => {
        const loader = HolafIcons.get("loader");
        expect(loader).toContain('d="M12 2v4m4.2 1.8l2.9-2.9M18 12h4m-5.8 4.2l2.9 2.9');
        // ce n'est plus l'arc loader-circle de la 0.1.7
        expect(loader).not.toContain('d="M21 12a9 9 0 1 1-6.219-8.56"');
        // un seul tracé (étoile 12 rayons) dans le corps
        expect(loader.match(/<path /g)).toHaveLength(1);
    });

    it("trash-2 est distinct de trash et trash reste le tracé Feather d'origine", () => {
        const trash = HolafIcons.get("trash");
        const trash2 = HolafIcons.get("trash-2");
        expect(trash).not.toBe(trash2);
        // trash : tracé Feather (polyline de couvercle + deux <line>)
        expect(trash).toContain('<polyline points="3 6 5 6 21 6"></polyline>');
        expect(trash.match(/<line /g)).toHaveLength(2);
        // trash-2 : tracé Lucide, UN SEUL path, couvercle intégré
        expect(trash2).toContain('d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"');
        expect(trash2.match(/<path /g)).toHaveLength(1);
    });

    it("refresh (Feather) reste inchangé et refresh-cw est ajouté à côté", () => {
        const refresh = HolafIcons.get("refresh");
        const refreshCw = HolafIcons.get("refresh-cw");
        expect(refresh).not.toBe(refreshCw);
        // refresh : tracé Feather (deux polyline + un path)
        expect(refresh).toContain('<polyline points="23 4 23 10 17 10"></polyline>');
        expect(refresh.match(/<polyline /g)).toHaveLength(2);
        // refresh-cw : nom canonique Lucide (trois path, aucune polyline)
        expect(refreshCw).toContain('d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"');
        expect(refreshCw.match(/<path /g)).toHaveLength(3);
        expect(refreshCw).not.toContain("<polyline");
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
