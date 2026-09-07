/* Tests HolafModal — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : open/close basique, aria, setters, pile d'overlays (Échap ne
 * ferme que le sommet), scroll-lock avec compteur, helpers Promise (alert /
 * confirm / prompt / busy), anti-doublon par id, focus trap, closeOnOverlay,
 * CSS auto-injecté (une seule fois, sans :root).
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
        expect(HolafModal.version).toBe("0.1.0");
        expect(window.HolafModal).toBe(HolafModal);
    });
});