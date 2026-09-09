/* Tests HolafToast — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : show + auto-dismiss au timeout (fake timers), types → classe /
 * icône, stack max 5 (le plus ancien saute avec reason 'replaced'), pause au
 * survol (dismiss retardé + barre gelée), bouton ✕, close() manuel, actions
 * cliquables, conteneur par position (créé une fois), aria-live polite /
 * assertive, helpers, update(), CSS injecté une seule fois, classes scoppées
 * .holaf-toast-* sans :root, fonds teintés par type (v0.4.0 : règles CSS +
 * fallback --ht-bg + vars inline + teintes des presets).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolafToast } from "../js/holaf-toast.js";

function containers(sel = ".holaf-toast-container") {
    return document.querySelectorAll(sel);
}
function toasts() {
    return document.querySelectorAll(".holaf-toast");
}

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
});

describe("HolafToast.show — affichage", () => {
    it("affiche un toast avec message et titre", () => {
        HolafToast.show({ message: "Salut", title: "Info" });
        const t = document.querySelector(".holaf-toast");
        expect(t).toBeTruthy();
        expect(t.querySelector(".holaf-toast__message").textContent).toBe("Salut");
        expect(t.querySelector(".holaf-toast__title").textContent).toBe("Info");
        expect(t.querySelector(".holaf-toast__close").textContent).toBe("✕");
    });

    it("auto-dismiss au timeout (reason 'timeout')", () => {
        const onClose = vi.fn();
        HolafToast.show({ message: "x", duration: 1000, onClose });
        expect(toasts().length).toBe(1);
        vi.advanceTimersByTime(1000);
        expect(onClose).toHaveBeenCalledWith("timeout");
        // suppression du DOM à la fin de l'animation (filet de sécurité 250 ms)
        vi.advanceTimersByTime(300);
        expect(toasts().length).toBe(0);
    });

    it("duration: 0 = persistant (pas d'auto-dismiss)", () => {
        HolafToast.show({ message: "x", duration: 0 });
        vi.advanceTimersByTime(60000);
        expect(toasts().length).toBe(1);
    });

    it("applique la classe et l'icône du type demandé", () => {
        for (const [type, icon] of [["info", "ℹ"], ["success", "✓"], ["warning", "⚠"], ["error", "✕"]]) {
            document.body.innerHTML = "";
            HolafToast.show({ message: "x", type, duration: 0 });
            const t = document.querySelector(".holaf-toast");
            expect(t.classList.contains("holaf-toast--" + type)).toBe(true);
            expect(t.querySelector(".holaf-toast__icon").textContent).toBe(icon);
        }
    });
});

describe("HolafToast — stack et positions", () => {
    it("empile dans un conteneur unique par position", () => {
        HolafToast.show({ message: "a", duration: 0 });
        HolafToast.show({ message: "b", duration: 0 });
        expect(containers(".holaf-toast-container--top-right").length).toBe(1);
        expect(toasts().length).toBe(2);
    });

    it("respecte la limite de 5 visibles, le plus ancien saute (reason 'replaced')", () => {
        const onClose = vi.fn();
        for (let i = 0; i < 6; i++) {
            HolafToast.show({ message: "t" + i, duration: 0, onClose: i === 0 ? onClose : undefined });
        }
        // 5 visibles (le 6ᵉ a la classe de sortie puis disparaît du DOM)
        expect(document.querySelectorAll(".holaf-toast:not(.holaf-toast--closing)").length).toBe(5);
        vi.advanceTimersByTime(300);
        expect(toasts().length).toBe(5);
        expect(onClose).toHaveBeenCalledWith("replaced");
        expect(document.querySelector(".holaf-toast__message").textContent).toBe("t1");
    });

    it("crée un conteneur distinct par position", () => {
        HolafToast.show({ message: "a", position: "bottom-left", duration: 0 });
        expect(containers(".holaf-toast-container--bottom-left").length).toBe(1);
        expect(containers(".holaf-toast-container--top-right").length).toBe(0);
    });
});

describe("HolafToast — fermeture et pause", () => {
    it("bouton ✕ ferme (reason 'click')", () => {
        const onClose = vi.fn();
        HolafToast.show({ message: "x", duration: 0, onClose });
        document.querySelector(".holaf-toast__close").click();
        expect(onClose).toHaveBeenCalledWith("click");
        vi.advanceTimersByTime(300);
        expect(toasts().length).toBe(0);
    });

    it("close() manuel ferme (reason 'manual')", () => {
        const onClose = vi.fn();
        const ctrl = HolafToast.show({ message: "x", duration: 0, onClose });
        ctrl.close();
        expect(onClose).toHaveBeenCalledWith("manual");
        vi.advanceTimersByTime(300);
        expect(toasts().length).toBe(0);
    });

    it("closeOnClick ferme au clic sur le toast (reason 'click')", () => {
        const onClose = vi.fn();
        HolafToast.show({ message: "x", duration: 0, closeOnClick: true, onClose });
        document.querySelector(".holaf-toast").click();
        expect(onClose).toHaveBeenCalledWith("click");
    });

    it("met en pause le dismiss au survol", () => {
        const t = HolafToast.show({ message: "x", duration: 1000 });
        vi.advanceTimersByTime(400); // 400 ms écoulées
        t.el.dispatchEvent(new MouseEvent("mouseenter"));
        vi.advanceTimersByTime(5000); // survol : le timer est gelé
        expect(t.el.classList.contains("holaf-toast--closing")).toBe(false);
        t.el.dispatchEvent(new MouseEvent("mouseleave"));
        vi.advanceTimersByTime(500); // reste 600 ms
        expect(t.el.classList.contains("holaf-toast--closing")).toBe(false);
        vi.advanceTimersByTime(200); // 700 > 600 restants → timeout
        expect(t.el.classList.contains("holaf-toast--closing")).toBe(true);
    });

    it("gèle la barre de progression au survol", () => {
        const t = HolafToast.show({ message: "x", duration: 1000 });
        const bar = t.el.querySelector(".holaf-toast__progress");
        // La durée est calée inline sur la barre (animation CSS pilotée par le temps).
        expect(bar.style.animationDuration).toBe("1000ms");
        vi.advanceTimersByTime(500);
        t.el.dispatchEvent(new MouseEvent("mouseenter"));
        // Au survol on gèle la barre via animation-play-state:paused (classe).
        expect(bar.classList.contains("holaf-toast__progress--paused")).toBe(true);
        // Au départ de la souris, la barre reprend (classe retirée).
        t.el.dispatchEvent(new MouseEvent("mouseleave"));
        expect(bar.classList.contains("holaf-toast__progress--paused")).toBe(false);
    });
});

describe("HolafToast — actions, helpers, update", () => {
    it("les actions sont cliquables et ferment par défaut", () => {
        const onClick = vi.fn();
        const onClose = vi.fn();
        HolafToast.show({ message: "x", duration: 0, onClose, actions: [{ label: "OK", onClick }] });
        const btn = document.querySelector(".holaf-toast__action");
        expect(btn.textContent).toBe("OK");
        btn.click();
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledWith("click");
    });

    it("une action avec close: false ne ferme pas", () => {
        HolafToast.show({ message: "x", duration: 0, actions: [{ label: "Rest", onClick: () => {}, close: false }] });
        document.querySelector(".holaf-toast__action").click();
        expect(toasts().length).toBe(1);
    });

    it("les helpers type et opts passent correctement", () => {
        const c = HolafToast.success("Bravo", { position: "bottom-right", duration: 0 });
        expect(c.el.classList.contains("holaf-toast--success")).toBe(true);
        expect(containers(".holaf-toast-container--bottom-right").length).toBe(1);
        HolafToast.error("Oups", { duration: 0 });
        expect(document.querySelector(".holaf-toast--error")).toBeTruthy();
    });

    it("update() change le message et le type", () => {
        const c = HolafToast.info("Chargement…", { duration: 0 });
        c.update({ message: "Fini !", type: "success" });
        expect(c.el.querySelector(".holaf-toast__message").textContent).toBe("Fini !");
        expect(c.el.classList.contains("holaf-toast--success")).toBe(true);
        expect(c.el.classList.contains("holaf-toast--info")).toBe(false);
        expect(c.el.getAttribute("role")).toBe("status");
    });
});

describe("HolafToast — accessibilité et CSS", () => {
    it("aria-live='polite' + role='status' par défaut, 'assertive' + 'alert' pour error", () => {
        HolafToast.info("a", { duration: 0 });
        const info = document.querySelector(".holaf-toast--info");
        expect(info.getAttribute("aria-live")).toBe("polite");
        expect(info.getAttribute("role")).toBe("status");
        HolafToast.error("b", { duration: 0 });
        const err = document.querySelector(".holaf-toast--error");
        expect(err.getAttribute("aria-live")).toBe("assertive");
        expect(err.getAttribute("role")).toBe("alert");
    });

    it("injecte le CSS une seule fois, scoppé sans :root", () => {
        HolafToast.show({ message: "a", duration: 0 });
        HolafToast.show({ message: "b", duration: 0 });
        const styles = document.querySelectorAll("style#holaf-toast-style");
        expect(styles.length).toBe(1);
        const css = styles[0].textContent;
        expect(css).not.toContain(":root");
        expect(css).toContain(".holaf-toast-container");
        expect(css).toContain("--ht-");
        expect(css).toContain("prefers-reduced-motion");
    });

    it("expose la version et window.HolafToast", () => {
        expect(HolafToast.version).toBe("0.4.0");
        expect(window.HolafToast).toBe(HolafToast);
    });
});

describe("HolafToast — positions alternatives", () => {
    it("supporte les 6 positions, conteneur créé à la demande", () => {
        const positions = ["top-right", "top-left", "bottom-right", "bottom-left", "top-center", "bottom-center"];
        positions.forEach((p) => {
            document.body.innerHTML = "";
            HolafToast.show({ message: "x", position: p, duration: 0 });
            expect(containers(".holaf-toast-container--" + p).length).toBe(1);
        });
    });

    it("top-center et bottom-center centrent le conteneur", () => {
        HolafToast.show({ message: "x", position: "top-center", duration: 0 });
        const c = document.querySelector(".holaf-toast-container--top-center");
        expect(c.style.transform).toBe(""); // centrage via CSS (classe), pas inline
        expect(c.className).toContain("holaf-toast-container--top-center");
    });

    it("chaque position a son propre conteneur (empilement propre)", () => {
        HolafToast.show({ message: "a", position: "top-center", duration: 0 });
        HolafToast.show({ message: "b", position: "bottom-center", duration: 0 });
        expect(containers(".holaf-toast-container--top-center").length).toBe(1);
        expect(containers(".holaf-toast-container--bottom-center").length).toBe(1);
        expect(containers().length).toBe(2);
    });
});

describe("HolafToast — thèmes", () => {
    it("enregistre les 4 presets au chargement", () => {
        expect(HolafToast.themes.list().sort()).toEqual(["dark", "light", "midnight", "slate"]);
    });

    it("themes.get renvoie une copie protégée, null si inconnu", () => {
        const t = HolafToast.themes.get("dark");
        expect(t["--ht-bg"]).toBe("#2b2b2b");
        t["--ht-bg"] = "#000";
        expect(HolafToast.themes.get("dark")["--ht-bg"]).toBe("#2b2b2b");
        expect(HolafToast.themes.get("nul")).toBeNull();
    });

    it("themes.register enregistre/remplace et filtre les clés non --", () => {
        const ret = HolafToast.themes.register("foret", { "--ht-bg": "#12211a", foo: "bar" });
        expect(ret).toEqual({ "--ht-bg": "#12211a" });
        expect(HolafToast.themes.list()).toContain("foret");
        // mutation du retour ne corrompt pas le registre
        ret["--ht-bg"] = "#fff";
        expect(HolafToast.themes.get("foret")["--ht-bg"]).toBe("#12211a");
    });

    it("applique un thème par instance via l'option theme", () => {
        HolafToast.show({ message: "x", theme: "light", duration: 0 });
        const t = document.querySelector(".holaf-toast");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("#ffffff");
        expect(t.style.getPropertyValue("--ht-fg")).toBe("#18181b");
    });

    it("applique un preset + surcharges (vars gagnent)", () => {
        HolafToast.show({ message: "x", theme: { preset: "light", vars: { "--ht-radius": "16px" } }, duration: 0 });
        const t = document.querySelector(".holaf-toast");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("#ffffff");
        expect(t.style.getPropertyValue("--ht-radius")).toBe("16px");
    });

    it("setTheme s'applique aux toasts sans option theme", () => {
        HolafToast.setTheme("midnight");
        HolafToast.show({ message: "x", duration: 0 });
        const t = document.querySelector(".holaf-toast");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("#10111d");
        HolafToast.clearTheme();
    });

    it("theme: null opte-out du thème global", () => {
        HolafToast.setTheme("midnight");
        HolafToast.show({ message: "x", theme: null, duration: 0 });
        const t = document.querySelector(".holaf-toast");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("");
        HolafToast.clearTheme();
    });

    it("dark ≡ aucun thème (défauts CSS inchangés)", () => {
        HolafToast.show({ message: "x", theme: "dark", duration: 0 });
        const t = document.querySelector(".holaf-toast");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("#2b2b2b");
    });

    it("warning unique : un thème inconnu ne warn qu'UNE fois, reset par clearTheme", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        HolafToast.show({ message: "a", theme: "theme-fantome" }); // 1er (et unique) warning
        expect(warn).toHaveBeenCalledTimes(1);
        // Le nom inconnu est ré-évalué à chaque show… sans jamais re-warning.
        HolafToast.show({ message: "b", theme: "theme-fantome" });
        HolafToast.show({ message: "c", theme: "theme-fantome" });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("theme-fantome");
        // clearTheme remet à zéro : le même nom peut re-avertir ensuite.
        HolafToast.clearTheme();
        HolafToast.show({ message: "d", theme: "theme-fantome" });
        expect(warn).toHaveBeenCalledTimes(2);
        // register d'un nom le rend valide → on oublie l'avertissement déjà émis.
        HolafToast.themes.register("theme-fantome", { "--ht-accent": "#123" });
        HolafToast.clearTheme();
        HolafToast.show({ message: "e", theme: "theme-fantome" });
        // re-registré → plus aucun warning pour ce nom désormais valide.
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it("fusion des clés --ht-* racines d'un { preset, … } dans les surcharges (après le preset), vars gagne", () => {
        const a = HolafToast.show({ message: "Racine", theme: { preset: "dark", "--ht-accent": "#123456" }, duration: 0 });
        expect(a.el.style.getPropertyValue("--ht-accent")).toBe("#123456"); // clé racine appliquée
        expect(a.el.style.getPropertyValue("--ht-bg")).toBe("#2b2b2b");     // reste du preset
        // En cas de doublon entre clé racine et vars, vars (champ officiel) gagne.
        const b = HolafToast.show({ message: "Doublon", theme: { preset: "light", "--ht-accent": "#racine", vars: { "--ht-accent": "#123abc" } }, duration: 0 });
        expect(b.el.style.getPropertyValue("--ht-accent")).toBe("#123abc"); // vars > racine
        expect(b.el.style.getPropertyValue("--ht-bg")).toBe("#ffffff");     // preset intact
    });
});

describe("HolafToast — configure()", () => {
    it("change la position et la durée par défaut", () => {
        HolafToast.configure({ position: "bottom-center", duration: 5000 });
        const onClose = vi.fn();
        HolafToast.show({ message: "x", onClose });
        expect(containers(".holaf-toast-container--bottom-center").length).toBe(1);
        vi.advanceTimersByTime(5000);
        expect(onClose).toHaveBeenCalledWith("timeout");
        HolafToast.configure({ position: "top-right", duration: 4000 });
    });

    it("configure.theme pose le thème global par défaut", () => {
        HolafToast.configure({ theme: "slate" });
        HolafToast.show({ message: "x", duration: 0 });
        const t = document.querySelector(".holaf-toast");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("#1f232b");
        HolafToast.clearTheme();
    });

    it("une option explicite prime sur configure()", () => {
        HolafToast.configure({ position: "bottom-left", duration: 1000 });
        HolafToast.show({ message: "x", position: "top-left", duration: 0 });
        expect(containers(".holaf-toast-container--top-left").length).toBe(1);
        expect(containers(".holaf-toast-container--bottom-left").length).toBe(0);
        HolafToast.configure({ position: "top-right", duration: 4000 });
    });
});

describe("HolafToast — id métier (v0.3.0)", () => {
    it("show({id}) : un toast vivant portant déjà l'id est mis à jour au lieu d'en créer un nouveau", () => {
        const a = HolafToast.show({ id: "upload", message: "Démarrage…", duration: 0 });
        const b = HolafToast.show({ id: "upload", message: "50 %", title: "Upload", type: "warning", duration: 0 });
        expect(b).toBe(a); // même contrôleur
        expect(toasts().length).toBe(1); // pas de doublon
        expect(document.querySelector(".holaf-toast__message").textContent).toBe("50 %");
        expect(document.querySelector(".holaf-toast__title").textContent).toBe("Upload");
        expect(document.querySelector(".holaf-toast").classList.contains("holaf-toast--warning")).toBe(true);
    });

    it("update(id, opts) met à jour par id métier", () => {
        HolafToast.show({ id: "job", message: "a", duration: 0 });
        const ctrl = HolafToast.update("job", { message: "b", type: "success" });
        expect(ctrl).toBeTruthy();
        expect(document.querySelector(".holaf-toast__message").textContent).toBe("b");
        expect(document.querySelector(".holaf-toast").classList.contains("holaf-toast--success")).toBe(true);
    });

    it("update(ctrl, opts) fonctionne aussi par référence ctrl (comportement préservé)", () => {
        const c = HolafToast.show({ message: "x", duration: 0 });
        HolafToast.update(c, { message: "y" });
        expect(document.querySelector(".holaf-toast__message").textContent).toBe("y");
    });

    it("hide(id) ferme par id métier", () => {
        const onClose = vi.fn();
        HolafToast.show({ id: "tmp", message: "x", duration: 0, onClose });
        const ok = HolafToast.hide("tmp");
        expect(ok).toBe(true);
        expect(onClose).toHaveBeenCalledWith("manual");
        vi.advanceTimersByTime(300);
        expect(toasts().length).toBe(0);
        // après fermeture, l'id est libéré : un nouveau show crée un nouveau toast
        HolafToast.show({ id: "tmp", message: "neuf", duration: 0 });
        expect(toasts().length).toBe(1);
        expect(document.querySelector(".holaf-toast__message").textContent).toBe("neuf");
    });

    it("update/hide sur un id inconnu ne plante pas", () => {
        expect(HolafToast.update("inconnu", { message: "x" })).toBeNull();
        expect(HolafToast.hide("inconnu")).toBe(false);
    });
});

describe("HolafToast — progression manuelle (v0.3.0)", () => {
    it("show({progress:'manual'}) : barre visible (largeur 0) même avec duration:0, pas de timer", () => {
        const onClose = vi.fn();
        const c = HolafToast.show({ message: "x", progress: "manual", duration: 0, onClose });
        const bar = c.el.querySelector(".holaf-toast__progress");
        expect(bar).not.toBeNull();
        expect(bar.classList.contains("holaf-toast__progress--manual")).toBe(true);
        expect(bar.style.width).toBe("0%");
        // pas de timer de fermeture auto
        vi.advanceTimersByTime(60000);
        expect(onClose).not.toHaveBeenCalled();
        expect(toasts().length).toBe(1);
    });

    it("update({progress: N}) pilote la largeur de la barre (0-100)", () => {
        const c = HolafToast.show({ message: "x", progress: "manual", duration: 0 });
        const bar = c.el.querySelector(".holaf-toast__progress");
        HolafToast.update(c, { progress: 50 });
        expect(bar.style.width).toBe("50%");
        HolafToast.update(c, { progress: 100 });
        expect(bar.style.width).toBe("100%");
        // clampé 0-100
        HolafToast.update(c, { progress: 150 });
        expect(bar.style.width).toBe("100%");
        HolafToast.update(c, { progress: -5 });
        expect(bar.style.width).toBe("0%");
    });

    it("le mode temporel reste le défaut (progress absent → timer + barre animée)", () => {
        const c = HolafToast.show({ message: "x", duration: 1000 });
        const bar = c.el.querySelector(".holaf-toast__progress");
        expect(bar).not.toBeNull();
        expect(bar.classList.contains("holaf-toast__progress--manual")).toBe(false);
        expect(bar.style.animationDuration).toBe("1000ms");
        // update({progress}) sans mode manuel n'a aucun effet sur la largeur
        HolafToast.update(c, { progress: 50 });
        expect(bar.style.width).toBe("");
    });
});

describe("HolafToast — html:true (v0.3.0)", () => {
    it("html:true → innerHTML ; défaut → textContent", () => {
        HolafToast.show({ message: "<b>gras</b>", html: true, duration: 0 });
        const msg = document.querySelector(".holaf-toast__message");
        expect(msg.querySelector("b")).not.toBeNull();
        expect(msg.innerHTML).toBe("<b>gras</b>");

        document.body.innerHTML = "";
        HolafToast.show({ message: "<b>pas gras</b>", duration: 0 });
        const msg2 = document.querySelector(".holaf-toast__message");
        expect(msg2.querySelector("b")).toBeNull();
        expect(msg2.textContent).toBe("<b>pas gras</b>");
    });
});

describe("HolafToast — newestFirst (v0.3.0)", () => {
    it("configure({newestFirst:true}) → les nouveaux toasts s'insèrent en premier", () => {
        HolafToast.configure({ newestFirst: true });
        HolafToast.show({ message: "premier", duration: 0 });
        HolafToast.show({ message: "second", duration: 0 });
        const msgs = document.querySelectorAll(".holaf-toast__message");
        expect(msgs[0].textContent).toBe("second"); // prepend
        expect(msgs[1].textContent).toBe("premier");
        HolafToast.configure({ newestFirst: false }); // reset
    });

    it("défaut (false) : append, comportement historique préservé", () => {
        HolafToast.show({ message: "premier", duration: 0 });
        HolafToast.show({ message: "second", duration: 0 });
        const msgs = document.querySelectorAll(".holaf-toast__message");
        expect(msgs[0].textContent).toBe("premier");
        expect(msgs[1].textContent).toBe("second");
    });
});

describe("HolafToast — themes.update (v0.3.0)", () => {
    it("fusionne les vars d'un thème enregistré", () => {
        HolafToast.themes.register("dyn", { "--ht-bg": "#111", "--ht-fg": "#eee" });
        const ret = HolafToast.themes.update("dyn", { "--ht-bg": "#222" });
        expect(ret).toEqual({ "--ht-bg": "#222", "--ht-fg": "#eee" }); // fusion
        expect(HolafToast.themes.get("dyn")["--ht-bg"]).toBe("#222");
        expect(HolafToast.themes.get("dyn")["--ht-fg"]).toBe("#eee");
        // le retour est une copie protégée
        ret["--ht-bg"] = "#hack";
        expect(HolafToast.themes.get("dyn")["--ht-bg"]).toBe("#222");
    });

    it("thème inconnu → enregistré à la place (avec warning)", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ret = HolafToast.themes.update("nouveau", { "--ht-bg": "#333" });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(HolafToast.themes.get("nouveau")["--ht-bg"]).toBe("#333");
        expect(ret).toEqual({ "--ht-bg": "#333" });
    });

    it("nom invalide → refusé sans casser le registre", () => {
        const before = HolafToast.themes.list();
        HolafToast.themes.update("", { "--ht-bg": "#000" });
        HolafToast.themes.update(null, { "--ht-bg": "#000" });
        expect(HolafToast.themes.list()).toEqual(before);
    });
});

describe("HolafToast — fonds teintés par type (v0.4.0)", () => {
    it("le CSS injecté contient les 4 règles de fond par type, APRÈS la règle de base, avec fallback var(--ht-bg)", () => {
        HolafToast.show({ message: "a", duration: 0 });
        const css = document.querySelector("style#holaf-toast-style").textContent;
        for (const type of ["info", "success", "warning", "error"]) {
            const re = new RegExp(
                "\\.holaf-toast--" + type + "\\s*\\{[^}]*background:\\s*var\\(--ht-bg-" + type + ",\\s*var\\(--ht-bg\\)\\)"
            );
            expect(re.test(css)).toBe(true);
        }
        // Ordre de la cascade : la règle de base .holaf-toast { … background:
        // var(--ht-bg) … } doit PRÉCÉDER les règles de type (même spécificité,
        // la dernière gagne).
        expect(css.indexOf(".holaf-toast {")).toBeGreaterThanOrEqual(0);
        for (const type of ["info", "success", "warning", "error"]) {
            expect(css.indexOf(".holaf-toast--" + type)).toBeGreaterThan(css.indexOf(".holaf-toast {"));
        }
    });

    it("fallback : sans les vars de type, aucune var --ht-bg-* n'est posée en inline (le CSS retombe sur --ht-bg)", () => {
        HolafToast.show({ message: "x", type: "success", duration: 0 });
        const t = document.querySelector(".holaf-toast--success");
        expect(t.style.getPropertyValue("--ht-bg-success")).toBe("");
        expect(t.style.getPropertyValue("--ht-bg")).toBe("");
        // idem info (neutre par défaut, même avec un preset)
        HolafToast.show({ message: "y", type: "info", theme: "midnight", duration: 0 });
        const info = document.querySelector(".holaf-toast--info");
        expect(info.style.getPropertyValue("--ht-bg-info")).toBe(""); // pas de var info dans les presets
        expect(info.style.getPropertyValue("--ht-bg")).toBe("#10111d"); // fond global du preset
    });

    it("theme: { \"--ht-bg-success\" } est appliqué en inline sur l'élément (gagne sur le fallback)", () => {
        HolafToast.show({ message: "x", type: "success", duration: 0, theme: { "--ht-bg-success": "#20301a" } });
        const t = document.querySelector(".holaf-toast--success");
        expect(t.style.getPropertyValue("--ht-bg-success")).toBe("#20301a");
    });

    it("preset + vars : la surcharge --ht-bg-success inline gagne, le fond global du preset reste intact", () => {
        HolafToast.show({
            message: "x", type: "success", duration: 0,
            theme: { preset: "light", vars: { "--ht-bg-success": "#eaf6ee" } },
        });
        const t = document.querySelector(".holaf-toast--success");
        expect(t.style.getPropertyValue("--ht-bg-success")).toBe("#eaf6ee"); // vars > preset
        expect(t.style.getPropertyValue("--ht-bg")).toBe("#ffffff");         // fond global du preset intact
    });

    it("les presets définissent les teintes success/warning/error mais PAS --ht-bg-info", () => {
        const expected = {
            dark: "#303f35", light: "#dcece2", midnight: "#152e30", slate: "#2b4040",
        };
        for (const name of Object.keys(expected)) {
            const t = HolafToast.themes.get(name);
            expect(t["--ht-bg-success"]).toBe(expected[name]);
            expect(t["--ht-bg-warning"]).toMatch(/^#[0-9a-f]{6}$/i);
            expect(t["--ht-bg-error"]).toMatch(/^#[0-9a-f]{6}$/i);
            expect(t["--ht-bg-info"]).toBeUndefined(); // info reste neutre (fallback --ht-bg)
        }
    });
});
