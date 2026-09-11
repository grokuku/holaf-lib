/* Tests HolafModal — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : open/close basique, aria, setters, pile d'overlays (Échap ne
 * ferme que le sommet), scroll-lock avec compteur, helpers Promise (alert /
 * confirm / prompt / busy), anti-doublon par id, focus trap, closeOnOverlay,
 * CSS auto-injecté (une seule fois, sans :root), thèmes (presets, registre
 * protégé, opt-out theme:"" silencieux, warning unique par nom inconnu,
 * fusion des clés --hm-* racines d'un { preset, … }).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolafModal } from "../js/holaf-modal.js";

// ── Helpers de test ──────────────────────────────────────────────────────────
function pressKey(key, init = {}) {
    document.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
    );
}

function roots() {
    return document.querySelectorAll(".holaf-modal-root");
}

function footerButtons(ctrl) {
    return ctrl.el.querySelectorAll(".holaf-modal-footer .holaf-modal-btn");
}

// Referme toute modale restée ouverte entre deux tests (remet la pile à zéro).
function closeAll() {
    document.querySelectorAll(".holaf-modal-root").forEach((root) => {
        if (root._holafModalCtrl) root._holafModalCtrl.close();
    });
}

function flush(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
    closeAll();
    // Le thème global est volatil : on le nettoie pour ne pas fuiter entre tests.
    if (typeof HolafModal.clearTheme === "function") HolafModal.clearTheme();
    vi.restoreAllMocks();
});

beforeEach(() => {
    // Sortie propre : les erreurs volontaires des tests de guard sont silencieuses.
    vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── open / close basique ─────────────────────────────────────────────────────
describe("open / close", () => {
    it("ouvre une modale avec rôle dialog, contenu, et la ferme avec onClose(value)", () => {
        let closedWith = "non appelé";
        const ctrl = HolafModal.open({
            title: "Test",
            content: "<p id='hm-test-content'>Salut</p>",
            onClose: (v) => { closedWith = v; },
        });

        expect(roots()).toHaveLength(1);
        expect(document.body.contains(ctrl.el)).toBe(true);
        expect(ctrl.el.getAttribute("role")).toBe("dialog");
        expect(ctrl.el.querySelector(".holaf-modal-title").textContent).toBe("Test");
        expect(ctrl.body.querySelector("#hm-test-content")).not.toBeNull();

        ctrl.close(42);
        expect(roots()).toHaveLength(0);
        expect(closedWith).toBe(42);
    });

    it("close() est idempotent et onClose ne part qu'une fois", () => {
        let calls = 0;
        const ctrl = HolafModal.open({ title: "T", onClose: () => { calls += 1; } });
        ctrl.close();
        ctrl.close();
        ctrl.close();
        expect(calls).toBe(1);
    });

    it("appelle onOpen avec le contrôleur", () => {
        let opened = null;
        const ctrl = HolafModal.open({ title: "T", onOpen: (c) => { opened = c; } });
        expect(opened).toBe(ctrl);
        expect(opened.body).toBe(ctrl.body);
    });

    it("aria-modal=true + aria-labelledby pointant vers le titre", () => {
        const ctrl = HolafModal.open({ title: "A11y" });
        expect(ctrl.el.getAttribute("aria-modal")).toBe("true");
        const labelId = ctrl.el.getAttribute("aria-labelledby");
        expect(labelId).toBeTruthy();
        expect(document.getElementById(labelId).textContent).toBe("A11y");
    });

    it("modal:false → aria-modal=false et overlay transparent", () => {
        const ctrl = HolafModal.open({ title: "M2", modal: false });
        expect(ctrl.el.getAttribute("aria-modal")).toBe("false");
        expect(ctrl.overlay.classList.contains("holaf-modal-overlay--modeless")).toBe(true);
    });

    it("le titre est en textContent (jamais innerHTML) → pas d'injection", () => {
        const ctrl = HolafModal.open({ title: "<img src=x onerror=window.__pwned=1>" });
        const title = ctrl.el.querySelector(".holaf-modal-title");
        expect(title.querySelector("img")).toBeNull();
        expect(title.textContent).toBe("<img src=x onerror=window.__pwned=1>");
    });

    it("setTitle / setContent (string et Node)", () => {
        const ctrl = HolafModal.open({ title: "Avant" });
        ctrl.setTitle("Après");
        expect(ctrl.el.querySelector(".holaf-modal-title").textContent).toBe("Après");

        const node = document.createElement("div");
        node.textContent = "contenu-node";
        ctrl.setContent(node);
        expect(ctrl.body.textContent).toBe("contenu-node");

        ctrl.setContent("<span id='hm-str'>string</span>");
        expect(ctrl.body.querySelector("#hm-str")).not.toBeNull();
    });

    it("setBusy affiche/masque le voile interne avec spinner", () => {
        const ctrl = HolafModal.open({ title: "T" });
        expect(ctrl.el.querySelector(".holaf-modal-busy")).toBeNull();
        ctrl.setBusy(true, "Un instant…");
        const busyEl = ctrl.el.querySelector(".holaf-modal-busy");
        expect(busyEl).not.toBeNull();
        expect(busyEl.querySelector(".holaf-modal-spinner")).not.toBeNull();
        expect(busyEl.textContent).toContain("Un instant…");
        ctrl.setBusy(false);
        expect(busyEl.style.display).toBe("none");
    });

    it("classe de taille et largeur custom via --hm-width", () => {
        const a = HolafModal.open({ size: "lg" });
        expect(a.el.classList.contains("holaf-modal-lg")).toBe(true);
        const b = HolafModal.open({ width: 555 });
        expect(b.el.style.getPropertyValue("--hm-width")).toBe("555px");
    });

    it("z-index global ≥ 100000, croissant à chaque ouverture", () => {
        const a = HolafModal.open({ title: "1" });
        const b = HolafModal.open({ title: "2" });
        const za = parseInt(a.overlay.style.zIndex, 10);
        const zb = parseInt(b.overlay.style.zIndex, 10);
        expect(za).toBeGreaterThanOrEqual(100000);
        expect(zb).toBeGreaterThan(za);
    });
});

// ── Pile d'overlays & Échap ──────────────────────────────────────────────────
describe("pile d'overlays & Échap", () => {
    it("Échap ferme UNIQUEMENT la modale au sommet, puis la suivante", () => {
        const a = HolafModal.open({ title: "A" });
        const b = HolafModal.open({ title: "B" });

        pressKey("Escape");
        expect(document.body.contains(b.el)).toBe(false); // le sommet ferme
        expect(document.body.contains(a.el)).toBe(true);  // en dessous reste ouverte

        pressKey("Escape");
        expect(document.body.contains(a.el)).toBe(false);
    });

    it("closeOnEscape:false au sommet bloque Échap (pas de fermeture en cascade)", () => {
        const a = HolafModal.open({ title: "A" });
        const b = HolafModal.open({ title: "B", closeOnEscape: false });

        pressKey("Escape");
        expect(document.body.contains(b.el)).toBe(true);  // sommet refuse Échap
        expect(document.body.contains(a.el)).toBe(true);  // et ne cascade pas

        b.close();
        pressKey("Escape");
        expect(document.body.contains(a.el)).toBe(false); // redevenu sommet → ferme
    });

    it("bringToFront remonte la modale au sommet de la pile (Échap la vise)", () => {
        const a = HolafModal.open({ title: "A" });
        const b = HolafModal.open({ title: "B" });

        a.bringToFront(); // A repasse au-dessus
        pressKey("Escape");
        expect(document.body.contains(a.el)).toBe(false);
        expect(document.body.contains(b.el)).toBe(true);
    });
});

// ── Scroll-lock avec compteur ────────────────────────────────────────────────
describe("scroll-lock", () => {
    it("body.holaf-modal-open tant qu'au moins une modale est ouverte (compteur)", () => {
        const a = HolafModal.open({ title: "1" });
        expect(document.body.classList.contains("holaf-modal-open")).toBe(true);

        const b = HolafModal.open({ title: "2" });
        expect(document.body.classList.contains("holaf-modal-open")).toBe(true);

        a.close(); // une modale sur deux → toujours verrouillé
        expect(document.body.classList.contains("holaf-modal-open")).toBe(true);

        b.close(); // compteur à 0 → déverrouillé
        expect(document.body.classList.contains("holaf-modal-open")).toBe(false);
    });

    it("scrollLock:false ne pose pas la classe", () => {
        const c = HolafModal.open({ title: "3", scrollLock: false });
        expect(document.body.classList.contains("holaf-modal-open")).toBe(false);
        c.close();
        expect(document.body.classList.contains("holaf-modal-open")).toBe(false);
    });
});

// ── Helpers Promise ──────────────────────────────────────────────────────────
describe("helpers Promise", () => {
    it("alert résout à la fermeture via le bouton OK", async () => {
        const p = HolafModal.alert("Info", "Bienvenue !");
        const ok = document.querySelector(".holaf-modal-btn-primary");
        expect(ok.textContent).toBe("OK");
        ok.click();
        await expect(p).resolves.toBeUndefined();
        expect(roots()).toHaveLength(0);
    });

    it("confirm résout true sur OK (bouton danger si danger:true)", async () => {
        const p = HolafModal.confirm("Supprimer ?", "Sûr ?", { danger: true });
        const ok = document.querySelector(".holaf-modal-btn-danger");
        expect(ok).not.toBeNull();
        ok.click();
        await expect(p).resolves.toBe(true);
    });

    it("confirm résout false sur Annuler", async () => {
        const p = HolafModal.confirm("Titre", "Message");
        document.querySelector(".holaf-modal-btn-cancel").click();
        await expect(p).resolves.toBe(false);
    });

    it("confirm résout false sur Échap", async () => {
        const p = HolafModal.confirm("Titre", "Message");
        pressKey("Escape");
        await expect(p).resolves.toBe(false);
    });

    it("confirm : guard false → reste ouverte ; guard ok → ferme", async () => {
        const p = HolafModal.confirm("Titre", "Message", { guard: async () => false });
        document.querySelector(".holaf-modal-btn-primary").click();
        await flush();
        expect(roots()).toHaveLength(1); // le guard refuse → toujours ouverte
        document.querySelector(".holaf-modal-btn-cancel").click();
        await expect(p).resolves.toBe(false);

        const p2 = HolafModal.confirm("Titre", "Message", { guard: () => Promise.resolve(true) });
        document.querySelector(".holaf-modal-btn-primary").click();
        await expect(p2).resolves.toBe(true);
    });

    it("prompt : valeur initiale, validation par OK", async () => {
        const p = HolafModal.prompt("Nom", "Ton nom ?", { placeholder: "ex: Holaf", initial: "Holaf" });
        const input = document.querySelector(".holaf-modal-input");
        expect(input.value).toBe("Holaf");
        expect(input.placeholder).toBe("ex: Holaf");
        input.value = "Nouveau nom";
        document.querySelector(".holaf-modal-btn-primary").click();
        await expect(p).resolves.toBe("Nouveau nom");
    });

    it("prompt : Entrée dans le champ valide", async () => {
        const p = HolafModal.prompt("Titre", "Message");
        const input = document.querySelector(".holaf-modal-input");
        input.value = "via-enter";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await expect(p).resolves.toBe("via-enter");
    });

    it("prompt : Annuler et Échap résolvent null", async () => {
        const p = HolafModal.prompt("Titre", "Message");
        document.querySelector(".holaf-modal-btn-cancel").click();
        await expect(p).resolves.toBeNull();

        const p2 = HolafModal.prompt("Titre", "Message");
        pressKey("Escape");
        await expect(p2).resolves.toBeNull();
    });

    it("busy : spinner + set(), Échap ne ferme pas, close() par code", () => {
        const b = HolafModal.busy("Chargement…");
        expect(document.querySelector(".holaf-modal-spinner")).not.toBeNull();
        expect(document.body.textContent).toContain("Chargement…");

        b.set("Presque fini…");
        expect(document.body.textContent).toContain("Presque fini…");

        pressKey("Escape");
        expect(roots()).toHaveLength(1); // non fermable par Échap

        b.close();
        expect(roots()).toHaveLength(0);
    });
});

// ── Anti-doublon par id ──────────────────────────────────────────────────────
describe("anti-doublon", () => {
    it("un 2e open() avec le même id retourne le contrôleur existant (bringToFront)", () => {
        const a = HolafModal.open({ id: "hm-unique", title: "Première" });
        const zBefore = parseInt(a.overlay.style.zIndex, 10);

        const b = HolafModal.open({ id: "hm-unique", title: "Deuxième" });
        expect(b).toBe(a);
        expect(document.querySelectorAll("#hm-unique")).toHaveLength(1);
        expect(parseInt(a.overlay.style.zIndex, 10)).toBeGreaterThan(zBefore);
    });

    it("des id différents créent bien des modales distinctes", () => {
        const a = HolafModal.open({ id: "hm-a", title: "A" });
        const b = HolafModal.open({ id: "hm-b", title: "B" });
        expect(b).not.toBe(a);
        expect(roots()).toHaveLength(2);
    });
});

// ── Focus trap ───────────────────────────────────────────────────────────────
describe("focus trap", () => {
    it("Tab boucle : du dernier élément vers le premier", () => {
        const ctrl = HolafModal.open({
            title: "Trap",
            hideClose: true,
            buttons: [{ text: "A", value: "a" }, { text: "B", value: "b" }],
        });
        const btns = ctrl.el.querySelectorAll("button");
        expect(btns).toHaveLength(2);

        btns[1].focus(); // dernier élément focusable
        pressKey("Tab");
        expect(document.activeElement).toBe(btns[0]); // retour au premier
    });

    it("Shift+Tab boucle du premier vers le dernier", () => {
        const ctrl = HolafModal.open({
            title: "Trap",
            hideClose: true,
            buttons: [{ text: "A", value: "a" }, { text: "B", value: "b" }],
        });
        const btns = ctrl.el.querySelectorAll("button");
        btns[0].focus(); // premier élément focusable
        pressKey("Tab", { shiftKey: true });
        expect(document.activeElement).toBe(btns[1]); // retour au dernier
    });

    it("le focus perdu à l'extérieur est ramené dans la modale", () => {
        const ctrl = HolafModal.open({
            title: "Trap",
            hideClose: true,
            buttons: [{ text: "A", value: 1 }],
        });
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        outside.focus();
        expect(document.activeElement).toBe(outside);

        pressKey("Tab");
        expect(ctrl.el.contains(document.activeElement)).toBe(true);
        outside.remove();
    });
});

// ── Overlay, boutons, CSS ────────────────────────────────────────────────────
describe("overlay, boutons & CSS", () => {
    it("clic sur le fond ferme (closeOnOverlay), sauf si désactivé", () => {
        const a = HolafModal.open({ title: "X" });
        a.overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(roots()).toHaveLength(0);

        const b = HolafModal.open({ title: "Y", closeOnOverlay: false });
        b.overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(roots()).toHaveLength(1);
    });

    it("boutons : onClick qui retourne false refuse la fermeture ; sinon close(value)", () => {
        const ctrl = HolafModal.open({
            title: "T",
            buttons: [
                { text: "Refuse", value: "r", onClick: () => false },
                { text: "Valide", value: "ok-value" },
            ],
        });
        const [refuse, valide] = footerButtons(ctrl);

        refuse.click();
        expect(document.body.contains(ctrl.el)).toBe(true); // reste ouverte

        valide.click();
        expect(document.body.contains(ctrl.el)).toBe(false);
    });

    it("CSS auto-injecté une seule fois, variables --hm-*, jamais de :root", () => {
        HolafModal.open({ title: "1" });
        HolafModal.open({ title: "2" });

        const styles = document.querySelectorAll("style#holaf-modal-style");
        expect(styles).toHaveLength(1);
        const css = styles[0].textContent;
        expect(css).toContain("--hm-accent");
        expect(css).toContain("body.holaf-modal-open");
        expect(css).not.toContain(":root");
    });

    it("version exposée + global window.HolafModal", () => {
        expect(HolafModal.version).toBe("0.4.0");
        expect(window.HolafModal).toBe(HolafModal);
    });
});

// ── Thèmes ─────────────────────────────────────────────────────────────────────
describe("thèmes", () => {
    // Valeurs exactes du CSS injecté (défauts historiques de la brique).
    const DARK_DEFAULTS = {
        "--hm-bg": "#1e1e1e",
        "--hm-bg-secondary": "#27272a",
        "--hm-bg-input": "#1a1a1a",
        "--hm-text": "#e4e4e7",
        "--hm-text-secondary": "#a1a1aa",
        "--hm-border": "#3f3f46",
        "--hm-accent": "#6366f1",
        "--hm-accent-hover": "#818cf8",
        "--hm-accent-text": "#ffffff",
        "--hm-danger": "#ef4444",
        "--hm-danger-hover": "#dc2626",
        "--hm-danger-text": "#ffffff",
        "--hm-radius": "12px",
        "--hm-overlay-bg": "rgba(0, 0, 0, 0.55)",
        "--hm-font-size": "14px",
        "--hm-shadow": "0 18px 50px rgba(0, 0, 0, 0.55)",
        "--hm-busy-bg": "rgba(30, 30, 30, 0.82)",
    };

    it("enregistre les 4 presets génériques au chargement", () => {
        const names = HolafModal.themes.list();
        for (const n of ["dark", "light", "midnight", "slate"]) {
            expect(names).toContain(n);
            expect(HolafModal.themes.get(n)).not.toBeNull();
        }
    });

    it("preset dark reproduit strictement les défauts du CSS injecté", () => {
        expect(HolafModal.themes.get("dark")).toEqual(DARK_DEFAULTS);
        // Le CSS injecté (source de vérité du rendu SANS theme) déclare
        // exactement les mêmes valeurs — whitespace normalisé pour comparer.
        HolafModal.open({ title: "css" });
        const css = document.querySelector("style#holaf-modal-style").textContent.replace(/\s+/g, " ");
        for (const [k, v] of Object.entries(DARK_DEFAULTS)) {
            expect(css).toContain(k + ": " + v + ";");
        }
    });

    it("theme:'dark' applique ses variables en inline sur la racine ET l'overlay", () => {
        const plain = HolafModal.open({ title: "P" });
        const dark = HolafModal.open({ title: "D", theme: "dark" });
        for (const [k, v] of Object.entries(DARK_DEFAULTS)) {
            expect(dark.el.style.getPropertyValue(k)).toBe(v);
            expect(dark.overlay.style.getPropertyValue(k)).toBe(v);
            // La modale SANS theme ne pose RIEN en inline : le rendu vient du
            // CSS injecté (mêmes valeurs, voir test précédent).
            expect(plain.el.style.getPropertyValue(k)).toBe("");
        }
        // Les presets ne figent pas la largeur (compatibilité sm/md/lg/xl).
        expect(dark.el.style.getPropertyValue("--hm-width")).toBe("");
        const lg = HolafModal.open({ title: "L", size: "lg", theme: "dark" });
        expect(lg.el.classList.contains("holaf-modal-lg")).toBe(true);
    });

    it("l'objet theme historique reste inchangé (compat)", () => {
        const ctrl = HolafModal.open({
            title: "H",
            theme: { "--hm-accent": "#e91e63", "pas-une-var": "x" },
        });
        expect(ctrl.el.style.getPropertyValue("--hm-accent")).toBe("#e91e63");
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe(""); // rien d'autre n'est posé
    });

    it("theme:'light' applique ses variables", () => {
        const ctrl = HolafModal.open({ title: "L", theme: "light" });
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe("#ffffff");
        expect(ctrl.el.style.getPropertyValue("--hm-text")).toBe("#18181b");
        expect(ctrl.overlay.style.getPropertyValue("--hm-overlay-bg")).toBe("rgba(24, 24, 27, 0.35)");
    });

    it("preset + vars : les surcharges gagnent sur le preset, qui gagne sur les défauts", () => {
        const ctrl = HolafModal.open({
            title: "O",
            theme: { preset: "light", vars: { "--hm-accent": "#123456", "non-css": 42 } },
        });
        expect(ctrl.el.style.getPropertyValue("--hm-accent")).toBe("#123456"); // override
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe("#ffffff");      // reste du preset
        expect(ctrl.overlay.style.getPropertyValue("--hm-overlay-bg")).toBe("rgba(24, 24, 27, 0.35)");
    });

    it("nom de thème inconnu → avertissement + repli sur les défauts (pas de plantage)", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ctrl = HolafModal.open({ title: "?", theme: "inexistant" });
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe("");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("inexistant");
    });

    it("preset inconnu + vars → warn puis application des seules surcharges", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ctrl = HolafModal.open({
            title: "?",
            theme: { preset: "inexistant", vars: { "--hm-accent": "#abcdef" } },
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(ctrl.el.style.getPropertyValue("--hm-accent")).toBe("#abcdef");
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe(""); // pas de base : défauts CSS
    });

    it("register / get / list : ajout, remplacement, filtrage --, copie protégée", () => {
        expect(HolafModal.themes.get("foret")).toBeNull();
        expect(HolafModal.themes.list()).not.toContain("foret");

        HolafModal.themes.register("foret", { "--hm-bg": "#12211a", ignorez: "x" });
        expect(HolafModal.themes.list()).toContain("foret");
        expect(HolafModal.themes.get("foret")).toEqual({ "--hm-bg": "#12211a" }); // clés non -- filtrées

        const copy = HolafModal.themes.get("foret"); // get → copie : le registre est protégé
        copy["--hm-bg"] = "#hack";
        expect(HolafModal.themes.get("foret")["--hm-bg"]).toBe("#12211a");

        HolafModal.themes.register("foret", { "--hm-bg": "#000000" }); // remplace
        expect(HolafModal.themes.get("foret")["--hm-bg"]).toBe("#000000");

        HolafModal.open({ title: "F", theme: "foret" }); // utilisable comme preset
        const el = document.querySelector(".holaf-modal-root");
        expect(el.style.getPropertyValue("--hm-bg")).toBe("#000000");
    });

    it("nom de thème invalide → refusé sans casser le registre", () => {
        const before = HolafModal.themes.list();
        HolafModal.themes.register("", { "--hm-bg": "#000" });
        HolafModal.themes.register(null, { "--hm-bg": "#000" });
        expect(HolafModal.themes.list()).toEqual(before);
    });

    it("setTheme (string) : s'applique aux modales sans theme ; open.theme gagne ; clearTheme revient aux défauts", () => {
        HolafModal.setTheme("light");
        const a = HolafModal.open({ title: "A" });
        expect(a.el.style.getPropertyValue("--hm-bg")).toBe("#ffffff"); // global

        const b = HolafModal.open({ title: "B", theme: "dark" }); // open.theme gagne
        expect(b.el.style.getPropertyValue("--hm-bg")).toBe("#1e1e1e");

        const c = HolafModal.open({ title: "C", theme: null }); // null = opt-out explicite
        expect(c.el.style.getPropertyValue("--hm-bg")).toBe("");

        HolafModal.clearTheme();
        const d = HolafModal.open({ title: "D" });
        expect(d.el.style.getPropertyValue("--hm-bg")).toBe(""); // défauts CSS
    });

    it("setTheme accepte un objet brut et { preset, vars } ; setTheme(null) efface", () => {
        HolafModal.setTheme({ preset: "slate", vars: { "--hm-radius": "4px" } });
        const a = HolafModal.open({ title: "A" });
        expect(a.el.style.getPropertyValue("--hm-bg")).toBe("#1f232b"); // preset slate
        expect(a.el.style.getPropertyValue("--hm-radius")).toBe("4px"); // override

        const spec = { "--hm-accent": "#0ea5e9" };
        HolafModal.setTheme(spec);
        spec["--hm-accent"] = "#muté-après-coup"; // mutation externe sans effet
        const b = HolafModal.open({ title: "B" });
        expect(b.el.style.getPropertyValue("--hm-accent")).toBe("#0ea5e9");

        HolafModal.setTheme(null);
        const c = HolafModal.open({ title: "C" });
        expect(c.el.style.getPropertyValue("--hm-accent")).toBe("");
    });

    it("setTheme avec un nom inconnu prévient (mais l'ouverture reste fonctionnelle)", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        HolafModal.setTheme("inexistant");
        expect(warn).toHaveBeenCalledTimes(1);
        const ctrl = HolafModal.open({ title: "T" }); // résolution à l'open → repli défauts
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe("");
    });

    it("les helpers transmettent theme à open()", async () => {
        const p = HolafModal.alert("T", "M", { theme: "light" });
        const root = document.querySelector(".holaf-modal-root");
        expect(root.style.getPropertyValue("--hm-bg")).toBe("#ffffff");
        document.querySelector(".holaf-modal-btn-primary").click();
        await expect(p).resolves.toBeUndefined();
    });

    // ── Finitions v0.2.1 (un test par fix) ──────────────────────────────────

    it('fix opt-out : theme:"" = aucun thème, SANS warning, même avec un thème global actif', () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        HolafModal.setTheme("light"); // thème global actif
        const a = HolafModal.open({ title: "A", theme: "" });
        expect(a.el.style.getPropertyValue("--hm-bg")).toBe(""); // ni global ni preset
        expect(a.overlay.style.getPropertyValue("--hm-overlay-bg")).toBe("");
        const b = HolafModal.open({ title: "B" }); // sans theme → le global s'applique bien
        expect(b.el.style.getPropertyValue("--hm-bg")).toBe("#ffffff");
        expect(warn).not.toHaveBeenCalled(); // "" est un opt-out explicite, pas un nom inconnu
    });

    it("fix warning unique : setTheme + open() avec un nom inconnu n'avertissent qu'UNE fois ; reset par clearTheme", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        HolafModal.setTheme("theme-fantome"); // 1er (et unique) warning
        expect(warn).toHaveBeenCalledTimes(1);

        HolafModal.open({ title: "A" }); // le thème global est ré-évalué à chaque open…
        HolafModal.open({ title: "B" }); // …sans jamais re-warning
        expect(warn).toHaveBeenCalledTimes(1);

        HolafModal.clearTheme(); // reset : le même nom peut re-avertir
        HolafModal.setTheme("theme-fantome");
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it("fix register : retourne une copie protégée — muter le retour ne corrompt pas le registre", () => {
        const vars = { "--hm-accent": "#112233", "ignore": "x" };
        const ret = HolafModal.themes.register("copie-register", vars);
        expect(ret).toEqual({ "--hm-accent": "#112233" }); // filtrage -- inchangé

        ret["--hm-accent"] = "#hack"; // mutation du retour…
        ret["--hm-extra"] = "intrus"; // …et ajout d'une clé
        expect(HolafModal.themes.get("copie-register")).toEqual({ "--hm-accent": "#112233" });

        vars["--hm-accent"] = "#muté-après-coup"; // l'objet source n'est pas retenu par référence
        expect(HolafModal.themes.get("copie-register")["--hm-accent"]).toBe("#112233");
    });

    it("fix edge case { preset + clés --hm-* racine } : fusionnées dans les surcharges (après le preset) ; vars gagne", () => {
        const a = HolafModal.open({
            title: "Racine",
            theme: { preset: "dark", "--hm-accent": "#123456" },
        });
        expect(a.el.style.getPropertyValue("--hm-accent")).toBe("#123456"); // clé racine appliquée
        expect(a.el.style.getPropertyValue("--hm-bg")).toBe("#1e1e1e");     // reste du preset

        // En cas de doublon entre clé racine et vars, vars (champ officiel) gagne.
        const b = HolafModal.open({
            title: "Doublon",
            theme: { preset: "light", "--hm-accent": "#racine", vars: { "--hm-accent": "#123abc" } },
        });
        expect(b.el.style.getPropertyValue("--hm-accent")).toBe("#123abc"); // vars > racine
        expect(b.el.style.getPropertyValue("--hm-bg")).toBe("#ffffff");     // preset intact
    });
});

// ── Modale à contenu libre (v0.4.0) : `actions` + formulaire hôte ───────────
// Couvre l'API additive : contenu custom injecté (Node), focus trap sur les
// champs, bouton de soumission rendu type="submit" + form="…" (soumission
// NATIVE), Échap/overlay, fermeture via ctrl.close, thèmes appliqués au
// contenu, compat totale avec les API existantes.
describe("modale à contenu libre (v0.4.0 actions)", () => {
    // Construit un formulaire hôte (comme la modale de config de Homy) :
    // un <form id> + quelques champs, puis un bouton action submit associé.
    function buildForm(container) {
        const form = document.createElement("form");
        form.id = "settings-form-test";
        form.setAttribute("novalidate", "");
        form.innerHTML =
            '<label>Nom<input type="text" name="name" value="Alice"></label>' +
            '<label>Couleur<input type="text" name="color" value="#ff8800"></label>' +
            '<select name="niv"><option>1</option><option>2</option></select>';
        container.appendChild(form);
        return form;
    }

    it("actions : bouton submit rendu type=submit avec attribut form + contenu injecté", () => {
        const content = document.createElement("div");
        const form = buildForm(content);
        const ctrl = HolafModal.open({
            title: "Config",
            content,
            actions: [{ label: "Enregistrer", type: "primary", form: "settings-form-test" }],
        });
        // Contenu custom injecté dans le body
        expect(ctrl.body.contains(form)).toBe(true);
        expect(ctrl.body.contains(content)).toBe(true);
        // Bouton action dans le footer, type=submit, associé au formulaire
        const btns = footerButtons(ctrl);
        expect(btns).toHaveLength(1);
        expect(btns[0].type).toBe("submit");
        expect(btns[0].getAttribute("form")).toBe("settings-form-test");
        expect(btns[0].textContent).toBe("Enregistrer");
    });

    it("soumission native : clic sur l'action soumet le formulaire (événement submit réel)", () => {
        const content = document.createElement("div");
        buildForm(content);
        let submitted = false;
        // Le hôte écoute le submit du form (comme le collect() de Homy)
        content.querySelector("form").addEventListener("submit", (e) => {
            e.preventDefault(); // le hôte gère son propre cycle (PATCH…)
            submitted = true;
        });
        HolafModal.open({
            title: "Config",
            content,
            actions: [{ label: "Enregistrer", form: "settings-form-test", type: "primary" }],
        });
        footerButtons(document.querySelector(".holaf-modal-root")._holafModalCtrl)[0].click();
        expect(submitted).toBe(true); // vrai événement submit déclenché par le clic
    });

    it("action SANS form : onClick + close(value) → onClose, comme les buttons", () => {
        let closedWith = null;
        const content = document.createElement("div");
        content.appendChild(document.createElement("input"));
        const ctrl = HolafModal.open({
            title: "T",
            content,
            actions: [{ label: "OK", value: "done", onClick: () => "valeur-override" }],
            onClose: (v) => { closedWith = v; },
        });
        footerButtons(ctrl)[0].click();
        expect(document.body.contains(ctrl.el)).toBe(false);
        expect(closedWith).toBe("valeur-override");
    });

    it("action onClick qui retourne false refuse la fermeture", () => {
        const ctrl = HolafModal.open({
            title: "T",
            actions: [{ label: "Refuse", value: "x", onClick: () => false }],
        });
        footerButtons(ctrl)[0].click();
        expect(document.body.contains(ctrl.el)).toBe(true);
    });

    it("focus trap couvre les champs du contenu : Tab boucle dans la modale (champs + actions)", () => {
        const content = document.createElement("div");
        buildForm(content); // input, input, select
        content.appendChild(document.createElement("input")); // 4e champ
        const ctrl = HolafModal.open({
            title: "T",
            content,
            actions: [{ label: "Enregistrer", form: "settings-form-test" }],
        });
        const focusables = ctrl.el.querySelectorAll(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])"
        );
        // focus initial : 1er focusable (un champ du formulaire)
        expect(document.activeElement).toBe(focusables[0]);
        // Tab depuis le dernier → retour au premier (champ de formulaire)
        focusables[focusables.length - 1].focus();
        pressKey("Tab");
        expect(document.activeElement).toBe(focusables[0]);
        // Shift+Tab depuis le premier → dernier (boucle)
        focusables[0].focus();
        pressKey("Tab", { shiftKey: true });
        expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    });

    it("Échap ferme le sommet même avec un contenu libre", () => {
        const content = document.createElement("div");
        buildForm(content);
        const ctrl = HolafModal.open({ title: "T", content });
        pressKey("Escape");
        expect(document.body.contains(ctrl.el)).toBe(false);
    });

    it("clic overlay ferme (comportement existant) pour une modale à contenu libre", () => {
        const content = document.createElement("div");
        buildForm(content);
        const ctrl = HolafModal.open({ title: "T", content });
        ctrl.overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(document.body.contains(ctrl.el)).toBe(false);
    });

    it("ctrl.close() depuis le onClose/hôte referme la modale (cycle save de Homy)", () => {
        const content = document.createElement("div");
        buildForm(content);
        const ctrl = HolafModal.open({ title: "T", content });
        ctrl.close();
        expect(document.body.contains(ctrl.el)).toBe(false);
        expect(roots()).toHaveLength(0);
    });

    it("thèmes appliqués au contenu : les --hm-* sont visibles dans le contenu injecté", () => {
        const content = document.createElement("div");
        buildForm(content);
        const ctrl = HolafModal.open({ title: "T", content, theme: "dark" });
        // Le thème est posé sur la racine de la modale ; le contenu en hérite
        // (variables CSS héritées dans l'arbre de la modale).
        expect(ctrl.el.style.getPropertyValue("--hm-bg")).toBe("#1e1e1e");
        expect(ctrl.body.style.getPropertyValue("--hm-accent")).toBe(""); // porté par la racine
        expect(getComputedStyle(ctrl.el).getPropertyValue("--hm-bg")).toBe("#1e1e1e");
    });

    it("actions n'interfère pas avec buttons (deux footer possibles) — compat additive", () => {
        const ctrl = HolafModal.open({
            title: "T",
            buttons: [{ text: "Annuler", value: false, type: "cancel" }],
            actions: [{ label: "OK", value: true }],
        });
        const btns = footerButtons(ctrl);
        expect(btns.length).toBe(2);
        expect(btns[0].textContent).toBe("Annuler");
        expect(btns[1].textContent).toBe("OK");
    });
});

// ── Fenêtre (v0.3.0) : drag / resize / persistance / zoom ───────────────────
describe("fenêtre (v0.3.0)", () => {
    it("sans option fenêtre, le comportement historique est inchangé (pas de position absolue)", () => {
        const ctrl = HolafModal.open({ title: "T" });
        expect(ctrl.el.style.position).toBe("");
        expect(ctrl.el.querySelector(".holaf-modal-resize")).toBeNull();
        expect(ctrl.el.querySelector(".holaf-modal-zoom")).toBeNull();
    });

    it("draggable : mousedown sur le header + mousemove → left/top changent", () => {
        const ctrl = HolafModal.open({ title: "D", draggable: true });
        const header = ctrl.el.querySelector(".holaf-modal-header");
        header.dispatchEvent(new MouseEvent("mousedown", { clientX: 10, clientY: 10, bubbles: true }));
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 80 }));
        document.dispatchEvent(new MouseEvent("mouseup"));
        // startLeft/startTop = 0 (jsdom) → left = 0 + (100-10) = 90, top = 0 + (80-10) = 70
        expect(ctrl.el.style.left).toBe("90px");
        expect(ctrl.el.style.top).toBe("70px");
    });

    it("draggable : un mousedown sur un bouton du header ne déclenche pas le drag", () => {
        const ctrl = HolafModal.open({ title: "D", draggable: true });
        const closeBtn = ctrl.el.querySelector(".holaf-modal-close");
        closeBtn.dispatchEvent(new MouseEvent("mousedown", { clientX: 10, clientY: 10, bubbles: true }));
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 200 }));
        document.dispatchEvent(new MouseEvent("mouseup"));
        expect(ctrl.el.style.left).not.toBe("190px"); // pas déplacé
    });

    it("resizable : poignée se → width/height changent (minWidth/minHeight respectés)", () => {
        const ctrl = HolafModal.open({ title: "R", resizable: true, minWidth: 100, minHeight: 50 });
        const se = ctrl.el.querySelector(".holaf-modal-resize--se");
        expect(se).not.toBeNull();
        se.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 250, clientY: 150 }));
        document.dispatchEvent(new MouseEvent("mouseup"));
        expect(ctrl.el.style.width).toBe("250px");
        expect(ctrl.el.style.height).toBe("150px");
    });

    it("resizable : 8 poignées créées", () => {
        const ctrl = HolafModal.open({ title: "R", resizable: true });
        const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
        dirs.forEach((d) => {
            expect(ctrl.el.querySelector(".holaf-modal-resize--" + d)).not.toBeNull();
        });
    });

    it("persistance : storageKey → localStorage peuplé après fermeture, restauré à la réouverture", () => {
        const ctrl = HolafModal.open({ title: "P", storageKey: "win", draggable: true });
        const header = ctrl.el.querySelector(".holaf-modal-header");
        header.dispatchEvent(new MouseEvent("mousedown", { clientX: 10, clientY: 10, bubbles: true }));
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 80 }));
        document.dispatchEvent(new MouseEvent("mouseup"));
        ctrl.close();

        const stored = JSON.parse(localStorage.getItem("holaf-modal-rect:win"));
        expect(stored).toBeTruthy();
        expect(stored.left).toBe(90);
        expect(stored.top).toBe(70);

        // réouverture → restauré
        const ctrl2 = HolafModal.open({ title: "P2", storageKey: "win", draggable: true });
        expect(ctrl2.el.style.left).toBe("90px");
        expect(ctrl2.el.style.top).toBe("70px");
        ctrl2.close();
        localStorage.removeItem("holaf-modal-rect:win");
    });

    it("persistance : callbacks storageGet/storageSet personnalisés", () => {
        const store = {};
        const storageGet = vi.fn((k) => store[k] || null);
        const storageSet = vi.fn((k, rect) => { store[k] = rect; });
        const ctrl = HolafModal.open({ title: "P", storageKey: "custom", draggable: true, storageGet, storageSet });
        const header = ctrl.el.querySelector(".holaf-modal-header");
        header.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 40 }));
        document.dispatchEvent(new MouseEvent("mouseup"));
        ctrl.close();
        expect(storageSet).toHaveBeenCalled();
        expect(store["custom"].left).toBe(50);
        expect(store["custom"].top).toBe(40);
    });

    it("content fonction : opts.content(body) est appelé avec le body", () => {
        const fn = vi.fn((body) => {
            const p = document.createElement("p");
            p.textContent = "via-fonction";
            body.appendChild(p);
        });
        const ctrl = HolafModal.open({ title: "F", content: fn });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn.mock.calls[0][0]).toBe(ctrl.body);
        expect(ctrl.body.textContent).toContain("via-fonction");
    });

    it("headerRight : Node inséré dans le header avant le bouton fermer", () => {
        const badge = document.createElement("span");
        badge.textContent = "BETA";
        const ctrl = HolafModal.open({ title: "H", headerRight: badge });
        const header = ctrl.el.querySelector(".holaf-modal-header");
        expect(header.contains(badge)).toBe(true);
        const closeBtn = header.querySelector(".holaf-modal-close");
        // le badge est avant le bouton fermer (ordre des enfants du header)
        const children = Array.from(header.children);
        expect(children.indexOf(badge)).toBeLessThan(children.indexOf(closeBtn));
    });

    it("labels : ok/cancel/close/loading appliqués dans les helpers", async () => {
        const labels = { ok: "Oui", cancel: "Non", close: "Fermer X", loading: "Patientez…" };
        const p = HolafModal.confirm("T", "M", { labels });
        const btns = document.querySelectorAll(".holaf-modal-footer .holaf-modal-btn");
        expect(btns[0].textContent).toBe("Non");
        expect(btns[1].textContent).toBe("Oui");
        document.querySelector(".holaf-modal-btn-cancel").click();
        await expect(p).resolves.toBe(false);

        const b = HolafModal.busy(undefined, { labels });
        expect(document.body.textContent).toContain("Patientez…");
        b.close();
    });

    it("alert icon : opts.icon affiche un div icône au-dessus du message", async () => {
        const p = HolafModal.alert("T", "M", { icon: "⚠️" });
        const icon = document.querySelector(".holaf-modal-alert-icon");
        expect(icon).not.toBeNull();
        expect(icon.textContent).toBe("⚠️");
        document.querySelector(".holaf-modal-btn-primary").click();
        await expect(p).resolves.toBeUndefined();
    });

    it("alert sans icon : aucun div icône (défaut inchangé)", async () => {
        const p = HolafModal.alert("T", "M");
        expect(document.querySelector(".holaf-modal-alert-icon")).toBeNull();
        document.querySelector(".holaf-modal-btn-primary").click();
        await expect(p).resolves.toBeUndefined();
    });

    it("zoom : boutons −/+ appliquent un zoom sur le body et le persistent", () => {
        const ctrl = HolafModal.open({ title: "Z", zoom: { key: "ztest", step: 0.1 } });
        const zoomIn = ctrl.el.querySelector(".holaf-modal-zoom--in");
        const zoomOut = ctrl.el.querySelector(".holaf-modal-zoom--out");
        expect(zoomIn).not.toBeNull();
        expect(zoomOut).not.toBeNull();
        expect(ctrl.body.style.zoom).toBe("1");
        zoomIn.click();
        expect(ctrl.body.style.zoom).toBe("1.1");
        zoomIn.click();
        expect(ctrl.body.style.zoom).toBe("1.2");
        zoomOut.click();
        expect(ctrl.body.style.zoom).toBe("1.1");
        expect(localStorage.getItem("holaf-modal-zoom:ztest")).toBe("1.1");
        localStorage.removeItem("holaf-modal-zoom:ztest");
    });

    it("themes.update : fusionne les vars d'un thème enregistré", () => {
        HolafModal.themes.register("dyn", { "--hm-bg": "#111", "--hm-text": "#eee" });
        const ret = HolafModal.themes.update("dyn", { "--hm-bg": "#222" });
        expect(ret).toEqual({ "--hm-bg": "#222", "--hm-text": "#eee" });
        expect(HolafModal.themes.get("dyn")["--hm-bg"]).toBe("#222");
        expect(HolafModal.themes.get("dyn")["--hm-text"]).toBe("#eee");
        ret["--hm-bg"] = "#hack";
        expect(HolafModal.themes.get("dyn")["--hm-bg"]).toBe("#222");
    });

    it("themes.update : thème inconnu → enregistré à la place (avec warning)", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ret = HolafModal.themes.update("nouveau", { "--hm-bg": "#333" });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(HolafModal.themes.get("nouveau")["--hm-bg"]).toBe("#333");
        expect(ret).toEqual({ "--hm-bg": "#333" });
    });
});