/* Tests HolafInfoPane — vitest + jsdom
 * ─────────────────────────────────────────────────────────────────────────────
 * Couverture : CSS injectant / nonce / getCss, labels (défauts + injection +
 * setLabels), états vide / chargement / erreur / prêt, champs (formatage,
 * empilé, valeurs absentes, échappement par défaut, raw en html:true), titres,
 * blocs (label/source, textarea auto-redimensionnée bornée, message vide /
 * personnalisé / erreur), copie (execCommand, repli Clipboard API, échec,
 * libellé de confirmation puis retour, placement avant/après), actions de bloc
 * (disabled, confirm injecté → on('action') + onClick), actions globales du
 * panneau (run/isEnabled/évènement), abort quand l'item change / à clear /
 * à refresh / à destroy, preview synchrone puis remplacement / erreur, instances
 * multiples et cycle de vie du <style> partagé.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HolafInfoPane } from "../js/holaf-infopane.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeContainer() {
    const el = document.createElement("div");
    el.id = "ip-" + Math.random().toString(36).slice(2);
    document.body.appendChild(el);
    return el;
}

function makePane(options, container) {
    const el = container || makeContainer();
    const opts = Object.assign({ css: { injectStyles: false } }, options || {});
    return HolafInfoPane.create(el, opts);
}

function stubExecCommand(value) {
    document.execCommand = vi.fn(() => value);
}

function stubClipboard(writeText) {
    Object.defineProperty(navigator, "clipboard", {
        value: writeText ? { writeText } : undefined,
        configurable: true,
    });
}

function stubRafSync() {
    Object.defineProperty(window, "requestAnimationFrame", {
        value: (cb) => { cb(0); return 1; },
        configurable: true,
        writable: true,
    });
}

function messageOf(container) {
    return container.querySelector(".holaf-infopane-message");
}

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    try { delete document.execCommand; } catch (e) { /* ignore */ }
    try { delete navigator.clipboard; } catch (e) { /* ignore */ }
});

// ── CSS / options / labels ───────────────────────────────────────────────────
describe("CSS, options et labels", () => {
    it("expose une version et un getCss() scopé non vide", () => {
        expect(HolafInfoPane.version).toBe("0.1.0");
        expect(typeof HolafInfoPane.getCss()).toBe("string");
        expect(HolafInfoPane.getCss().length).toBeGreaterThan(50);
        expect(HolafInfoPane.getCss()).toContain(".holaf-infopane");
        expect(HolafInfoPane.getCss()).toContain("--hl-infopane-text");
        expect(HolafInfoPane.getCss()).not.toContain(":root");
    });

    it("injecte le CSS par défaut et le retire à destroy", () => {
        const pane = HolafInfoPane.create(makeContainer(), {});
        expect(document.getElementById("holaf-infopane-style")).toBeTruthy();
        pane.destroy();
        expect(document.getElementById("holaf-infopane-style")).toBeFalsy();
    });

    it("n'injecte rien avec css.injectStyles:false", () => {
        const pane = makePane({});
        expect(document.getElementById("holaf-infopane-style")).toBeFalsy();
        pane.destroy();
    });

    it("applique le nonce au <style>", () => {
        const pane = HolafInfoPane.create(makeContainer(), { css: { nonce: "abc123" } });
        expect(document.getElementById("holaf-infopane-style").getAttribute("nonce")).toBe("abc123");
        pane.destroy();
    });

    it("configure()/setStyleNonce() pilotent l'injection globale", () => {
        HolafInfoPane.configure({ nonce: "n-1" });
        const pane = HolafInfoPane.create(makeContainer(), {});
        expect(document.getElementById("holaf-infopane-style").getAttribute("nonce")).toBe("n-1");
        pane.destroy();
        HolafInfoPane.configure({ nonce: null });
    });

    it("le <style> partagé n'est retiré qu'à la dernière instance", () => {
        const a = HolafInfoPane.create(makeContainer(), {});
        const b = HolafInfoPane.create(makeContainer(), {});
        a.destroy();
        expect(document.getElementById("holaf-infopane-style")).toBeTruthy();
        b.destroy();
        expect(document.getElementById("holaf-infopane-style")).toBeFalsy();
    });

    it("exige un conteneur DOM", () => {
        expect(() => HolafInfoPane.create(null, {})).toThrow(/conteneur/i);
    });

    it("fusionne les libellés personnalisés et setLabels() les met à jour", () => {
        const pane = makePane({ labels: { copy: "Copier !" } });
        expect(pane._labels.copy).toBe("Copier !");
        expect(pane._labels.copied).toBe("Copied!");
        pane.setLabels({ copied: "Copié !", copyFailed: "Raté" });
        expect(pane._labels.copied).toBe("Copié !");
        expect(pane._labels.copyFailed).toBe("Raté");
        pane.destroy();
    });
});

// ── États ────────────────────────────────────────────────────────────────────
describe("états vide / chargement / erreur / prêt", () => {
    it("affiche l'état vide à la création puis à clear()", () => {
        const container = makeContainer();
        const pane = makePane({ labels: { selectItem: "Choisissez." } }, container);
        expect(container.querySelector(".holaf-infopane").getAttribute("data-state")).toBe("empty");
        expect(messageOf(container).textContent).toBe("Choisissez.");
        pane.destroy();

        const pane2 = makePane({}, makeContainer());
        pane2.show({ id: 1 });
        pane2.clear();
        expect(messageOf(pane2.element()).textContent).toBe("Select an item to see details.");
        expect(pane2.current()).toBe(null);
        pane2.destroy();
    });

    it("show(null) équivaut à clear()", async () => {
        const pane = makePane({});
        await pane.show(null);
        expect(pane.element().getAttribute("data-state")).toBe("empty");
        pane.destroy();
    });

    it("affiche l'état de chargement tant que resolve() n'a pas répondu", async () => {
        let resolveFn;
        const pane = makePane({
            labels: { loading: "Chargement…" },
            resolve: () => new Promise((r) => { resolveFn = r; }),
        });
        pane.show({ id: 1 });
        expect(pane.element().getAttribute("data-state")).toBe("loading");
        expect(messageOf(pane.element()).textContent).toBe("Chargement…");
        resolveFn({ fields: [{ label: "N", value: "v" }] });
        await flush();
        expect(pane.element().getAttribute("data-state")).toBe("ready");
        pane.destroy();
    });

    it("affiche l'état d'erreur quand resolve() rejette", async () => {
        const pane = makePane({
            labels: { error: "Erreur :" },
            resolve: () => Promise.reject(new Error("boom")),
        });
        await pane.show({ id: 1 });
        expect(pane.element().getAttribute("data-state")).toBe("error");
        expect(messageOf(pane.element()).textContent).toBe("Erreur : boom");
        pane.destroy();
    });

    it("garde les champs et affiche data.error (échec métier partiel)", async () => {
        const pane = makePane({
            labels: { error: "Erreur :" },
            resolve: () => Promise.resolve({
                fields: [{ label: "Nom", value: "a.png" }],
                blocks: [],
                error: "métadonnées indisponibles",
            }),
        });
        await pane.show({ id: 1 });
        const root = pane.element();
        expect(root.getAttribute("data-state")).toBe("error");
        expect(root.textContent).toContain("a.png");
        expect(root.textContent).toContain("Erreur : métadonnées indisponibles");
        expect(root.querySelector(".holaf-infopane-divider")).toBeTruthy();
        pane.destroy();
    });

    it("resolve() synchrone (objet) est accepté", async () => {
        const pane = makePane({ resolve: () => ({ fields: [{ label: "L", value: "V" }] }) });
        await pane.show({ id: 1 });
        expect(pane.element().textContent).toContain("V");
        pane.destroy();
    });
});

// ── Champs ───────────────────────────────────────────────────────────────────
describe("champs", () => {
    it("rend chaque champ label + valeur et le titre", async () => {
        const pane = makePane({
            resolve: () => ({
                title: "Titre du panneau",
                fields: [
                    { label: "Nom :", value: "image.png" },
                    { label: "Dossier :", value: "/" },
                ],
            }),
        });
        await pane.show({ id: 1 });
        const root = pane.element();
        expect(root.querySelector(".holaf-infopane-title").textContent).toBe("Titre du panneau");
        const fields = root.querySelectorAll(".holaf-infopane-field");
        expect(fields.length).toBe(2);
        expect(fields[0].textContent).toBe("Nom : image.png");
        expect(fields[0].querySelector("br")).toBe(null);
        pane.destroy();
    });

    it("mode empilé : <br> entre le label et la valeur", async () => {
        const pane = makePane({
            resolve: () => ({ fields: [{ label: "Chemin :", value: "/a/b", stacked: true }] }),
        });
        await pane.show({ id: 1 });
        const field = pane.element().querySelector(".holaf-infopane-field");
        expect(field.querySelector("br")).toBeTruthy();
        expect(field.textContent).toBe("Chemin :/a/b");
        pane.destroy();
    });

    it("omet les champs sans valeur (null/undefined/vide)", async () => {
        const pane = makePane({
            resolve: () => ({
                fields: [
                    { label: "A", value: "a" },
                    { label: "B", value: null },
                    { label: "C", value: "" },
                    { label: "D" },
                ],
            }),
        });
        await pane.show({ id: 1 });
        expect(pane.element().querySelectorAll(".holaf-infopane-field").length).toBe(1);
        pane.destroy();
    });

    it("échappe le texte par défaut (jamais de HTML brut)", async () => {
        const pane = makePane({
            resolve: () => ({ fields: [{ label: "X", value: "<img src=x onerror=alert(1)>" }] }),
        });
        await pane.show({ id: 1 });
        const root = pane.element();
        expect(root.querySelector("img")).toBe(null);
        expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
        pane.destroy();
    });

    it("html:true utilise field.raw (déjà fiable) et ignore raw sinon", async () => {
        const htmlPane = makePane({
            html: true,
            resolve: () => ({ fields: [{ label: "X", value: "texte", raw: "<b>gras</b>" }] }),
        });
        await htmlPane.show({ id: 1 });
        expect(htmlPane.element().querySelector("b").textContent).toBe("gras");
        htmlPane.destroy();

        const textPane = makePane({
            resolve: () => ({ fields: [{ label: "X", value: "texte", raw: "<b>gras</b>" }] }),
        });
        await textPane.show({ id: 1 });
        expect(textPane.element().querySelector("b")).toBe(null);
        expect(textPane.element().textContent).toBe("X texte");
        textPane.destroy();
    });
});

// ── Blocs / textarea ─────────────────────────────────────────────────────────
describe("blocs de texte", () => {
    it("rend une textarea readOnly avec le texte, le label et la source", async () => {
        const pane = makePane({
            resolve: () => ({
                blocks: [{
                    id: "prompt",
                    label: "Prompt :",
                    source: "(depuis .txt)",
                    text: "un prompt",
                    copyable: true,
                    copyLabel: "Copier",
                }],
            }),
        });
        await pane.show({ id: 1 });
        const block = pane.element().querySelector(".holaf-infopane-block");
        expect(block.getAttribute("data-block-id")).toBe("prompt");
        expect(block.querySelector(".holaf-infopane-block-label").textContent).toBe("Prompt :");
        expect(block.querySelector(".holaf-infopane-block-source").textContent).toBe("(depuis .txt)");
        const ta = block.querySelector("textarea.holaf-infopane-text");
        expect(ta.readOnly).toBe(true);
        expect(ta.value).toBe("un prompt");
        pane.destroy();
    });

    it("bloc sans texte : message notAvailable ou empty personnalisé", async () => {
        const pane = makePane({
            labels: { notAvailable: "Indisponible." },
            resolve: () => ({
                blocks: [
                    { id: "a", label: "A", text: "" },
                    { id: "b", label: "B", text: "", empty: "Aucun workflow trouvé." },
                ],
            }),
        });
        await pane.show({ id: 1 });
        const msgs = pane.element().querySelectorAll(".holaf-infopane-message");
        expect(msgs.length).toBe(2);
        expect(msgs[0].textContent).toBe("Indisponible.");
        expect(msgs[1].textContent).toBe("Aucun workflow trouvé.");
        expect(pane.element().querySelector("textarea")).toBe(null);
        pane.destroy();
    });

    it("block.error remplace le texte et n'est pas copiable par défaut", async () => {
        const pane = makePane({
            resolve: () => ({
                blocks: [{ id: "w", label: "Workflow :", text: "ignoré", error: "Erreur : cassé" }],
            }),
        });
        await pane.show({ id: 1 });
        const block = pane.element().querySelector(".holaf-infopane-block");
        expect(block.querySelector("textarea")).toBe(null);
        const msg = block.querySelector(".holaf-infopane-message--error");
        expect(msg.textContent).toBe("Erreur : cassé");
        pane.destroy();
    });

    it("auto-redimensionne la textarea (bornée par max-height)", async () => {
        stubRafSync();
        const pane = makePane({
            resolve: () => ({ blocks: [{ id: "p", label: "P", text: "x", copyable: true }] }),
        });
        // scrollHeight est nul en jsdom : on le stubbe sur le prototype AVANT
        // le rendu (la textarea est créée pendant le rendu).
        let scrollH = 50;
        Object.defineProperty(window.HTMLTextAreaElement.prototype, "scrollHeight", {
            get: () => scrollH,
            configurable: true,
        });
        await pane.show({ id: 1 });
        let ta = pane.element().querySelector("textarea.holaf-infopane-text");
        expect(ta.style.height).toBe("50px");

        scrollH = 999;
        pane.refresh();
        await pane.show({ id: 1 });
        ta = pane.element().querySelector("textarea.holaf-infopane-text");
        expect(ta.style.height).toBe("140px");

        // max-height personnalisé (surcharge l'hôte) : le resize le respecte.
        scrollH = 999;
        ta.style.maxHeight = "80px";
        pane._scheduleAutoResize(ta);
        expect(ta.style.height).toBe("80px");
        pane.destroy();
    });
});

// ── Copie ────────────────────────────────────────────────────────────────────
describe("copie", () => {
    function copyPane(options) {
        return makePane(Object.assign({
            labels: { copy: "Copier", copied: "Copié !", copyFailed: "Échec !" },
            copyRevertDelay: 5,
            copyFailRevertDelay: 5,
            resolve: () => ({
                blocks: [{
                    id: "p",
                    label: "Prompt :",
                    text: "texte à copier",
                    copyable: true,
                }],
            }),
        }, options || {}));
    }

    it("copie via execCommand et confirme puis revient au libellé initial", async () => {
        stubExecCommand(true);
        const pane = copyPane();
        await pane.show({ id: 1 });
        const btn = pane.element().querySelector(".holaf-infopane-copy-button");
        const before = document.querySelectorAll("textarea").length;
        btn.click();
        await flush();
        expect(document.execCommand).toHaveBeenCalledWith("copy");
        expect(btn.textContent).toBe("Copié !");
        expect(document.querySelectorAll("textarea").length).toBe(before);
        await sleep(20);
        expect(btn.textContent).toBe("Copier");
        pane.destroy();
    });

    it("repli Clipboard API quand execCommand retourne false", async () => {
        stubExecCommand(false);
        const writeText = vi.fn().mockResolvedValue();
        stubClipboard(writeText);
        const pane = copyPane();
        await pane.show({ id: 1 });
        const btn = pane.element().querySelector(".holaf-infopane-copy-button");
        btn.click();
        await flush();
        expect(writeText).toHaveBeenCalledWith("texte à copier");
        expect(btn.textContent).toBe("Copié !");
        pane.destroy();
    });

    it("repli Clipboard API quand execCommand est absent", async () => {
        const writeText = vi.fn().mockResolvedValue();
        stubClipboard(writeText);
        const pane = copyPane();
        await pane.show({ id: 1 });
        pane.element().querySelector(".holaf-infopane-copy-button").click();
        await flush();
        expect(writeText).toHaveBeenCalledTimes(1);
        pane.destroy();
    });

    it("affiche l'échec de copie puis revient au libellé initial", async () => {
        stubExecCommand(false);
        stubClipboard(null);
        const onAction = vi.fn();
        const pane = copyPane();
        pane.on("action", onAction);
        await pane.show({ id: 1 });
        const btn = pane.element().querySelector(".holaf-infopane-copy-button");
        btn.click();
        await flush();
        await sleep(20);
        expect(btn.textContent).toBe("Copier");
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "copy", ok: false }));
        pane.destroy();
    });

    it("émet action kind:copy ok:true et honore copyPlacement:before", async () => {
        stubExecCommand(true);
        const onAction = vi.fn();
        const pane = copyPane({
            resolve: () => ({
                blocks: [{
                    id: "p",
                    label: "Prompt :",
                    text: "abc",
                    copyable: true,
                    copyPlacement: "before",
                }],
            }),
        });
        pane.on("action", onAction);
        await pane.show({ id: 1 });
        const children = Array.from(pane.element().querySelector(".holaf-infopane-block").children);
        const actionsIdx = children.findIndex((el) => el.classList.contains("holaf-infopane-actions"));
        const textIdx = children.findIndex((el) => el.tagName === "TEXTAREA");
        expect(actionsIdx).toBeGreaterThan(-1);
        expect(actionsIdx).toBeLessThan(textIdx);
        children[actionsIdx].querySelector("button").click();
        await flush();
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "copy", ok: true, id: "p" }));
        pane.destroy();
    });

    it("copyDisabled : bouton copier présent mais inerte", async () => {
        stubExecCommand(true);
        const pane = copyPane({
            resolve: () => ({ blocks: [{ id: "p", label: "P", text: "", copyable: true, copyDisabled: true }] }),
        });
        await pane.show({ id: 1 });
        const btn = pane.element().querySelector(".holaf-infopane-copy-button");
        expect(btn.disabled).toBe(true);
        btn.click();
        await flush();
        expect(document.execCommand).not.toHaveBeenCalled();
        pane.destroy();
    });

    it("copyPlacement par défaut : bouton après la textarea", async () => {
        const pane = copyPane();
        await pane.show({ id: 1 });
        const children = Array.from(pane.element().querySelector(".holaf-infopane-block").children);
        const actionsIdx = children.findIndex((el) => el.classList.contains("holaf-infopane-actions"));
        const textIdx = children.findIndex((el) => el.tagName === "TEXTAREA");
        expect(textIdx).toBeGreaterThan(-1);
        expect(actionsIdx).toBeGreaterThan(textIdx);
        pane.destroy();
    });
});

// ── Actions ──────────────────────────────────────────────────────────────────
describe("actions", () => {
    it("action de bloc : confirm injecté puis on('action') + onClick", async () => {
        const confirm = vi.fn(() => true);
        const onClick = vi.fn();
        const onAction = vi.fn();
        const pane = makePane({
            confirm,
            resolve: () => ({
                blocks: [{
                    id: "w",
                    label: "Workflow :",
                    text: "{}",
                    actions: [{
                        id: "load",
                        label: "Charger",
                        confirm: { title: "Titre", message: "Message" },
                        onClick,
                    }],
                }],
            }),
        });
        pane.on("action", onAction);
        await pane.show({ id: 42 });
        pane.element().querySelector(".holaf-infopane-button").click();
        await flush();
        expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
            title: "Titre",
            message: "Message",
            item: { id: 42 },
        }));
        expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ item: { id: 42 } }));
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "block", id: "load", block: expect.objectContaining({ id: "w" }) }));
        pane.destroy();
    });

    it("confirm refusé : ni événement ni onClick", async () => {
        const confirm = vi.fn(() => false);
        const onClick = vi.fn();
        const onAction = vi.fn();
        const pane = makePane({
            confirm,
            resolve: () => ({
                blocks: [{ id: "w", label: "W", text: "{}", actions: [{ id: "load", label: "L", confirm: true, onClick }] }],
            }),
        });
        pane.on("action", onAction);
        await pane.show({ id: 1 });
        pane.element().querySelector(".holaf-infopane-button").click();
        await flush();
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(onClick).not.toHaveBeenCalled();
        expect(onAction).not.toHaveBeenCalled();
        pane.destroy();
    });

    it("action disabled : bouton inerte", async () => {
        const onClick = vi.fn();
        const pane = makePane({
            resolve: () => ({
                blocks: [{ id: "w", label: "W", text: "{}", actions: [{ id: "load", label: "L", disabled: true, onClick }] }],
            }),
        });
        await pane.show({ id: 1 });
        const btn = pane.element().querySelector(".holaf-infopane-button");
        expect(btn.disabled).toBe(true);
        btn.click();
        await flush();
        expect(onClick).not.toHaveBeenCalled();
        pane.destroy();
    });

    it("action de bloc sans confirm : onClick direct", async () => {
        const onClick = vi.fn();
        const pane = makePane({
            resolve: () => ({
                blocks: [{ id: "w", label: "W", text: "{}", actions: [{ id: "x", label: "X", onClick }] }],
            }),
        });
        await pane.show({ id: 1 });
        pane.element().querySelector(".holaf-infopane-button").click();
        await flush();
        expect(onClick).toHaveBeenCalledTimes(1);
        pane.destroy();
    });

    it("action globale du panneau : rendue, isEnabled et run(item, ctx)", async () => {
        const run = vi.fn();
        const onAction = vi.fn();
        const pane = makePane({
            actions: [
                { id: "del", label: "Supprimer", run },
                { id: "no", label: "Indispo", isEnabled: () => false, run },
            ],
            resolve: () => ({ fields: [{ label: "N", value: "v" }] }),
        });
        pane.on("action", onAction);
        await pane.show({ id: 7 });
        const buttons = pane.element().querySelectorAll(".holaf-infopane-actions--footer button");
        expect(buttons.length).toBe(2);
        expect(buttons[1].disabled).toBe(true);
        buttons[0].click();
        await flush();
        expect(run).toHaveBeenCalledWith({ id: 7 }, expect.objectContaining({ pane }));
        expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "pane", id: "del", item: { id: 7 } }));
        pane.destroy();
    });
});

// ── Annulation / cycle de vie ────────────────────────────────────────────────
describe("annulation et cycle de vie", () => {
    it("abort la requête précédente quand l'item change et ignore la résolution périmée", async () => {
        const captured = [];
        const pane = makePane({
            resolve: (item, ctx) => new Promise((res) => { captured.push({ item, ctx, res }); }),
        });
        pane.show({ id: 1 });
        expect(captured[0].ctx.signal.aborted).toBe(false);
        pane.show({ id: 2 });
        expect(captured[0].ctx.signal.aborted).toBe(true);

        captured[1].res({ fields: [{ label: "I", value: "2" }] });
        await flush();
        captured[0].res({ fields: [{ label: "I", value: "1" }] });
        await flush();
        expect(pane.element().textContent).toContain("2");
        expect(pane.element().textContent).not.toContain("1");
        pane.destroy();
    });

    it("clear() annule la requête en cours", async () => {
        const captured = [];
        const pane = makePane({
            resolve: (item, ctx) => new Promise((res) => { captured.push({ ctx, res }); }),
        });
        pane.show({ id: 1 });
        pane.clear();
        expect(captured[0].ctx.signal.aborted).toBe(true);
        captured[0].res({ fields: [{ label: "I", value: "1" }] });
        await flush();
        expect(pane.element().getAttribute("data-state")).toBe("empty");
        pane.destroy();
    });

    it("refresh() relance resolve() sur l'item courant et annule l'ancien", async () => {
        const signals = [];
        let current = 1;
        const pane = makePane({
            resolve: (item, ctx) => { signals.push(ctx.signal); return Promise.resolve({ fields: [{ label: "V", value: String(current) }] }); },
        });
        await pane.show({ id: 9 });
        expect(pane.element().textContent).toContain("1");
        current = 2;
        await pane.refresh();
        expect(signals[0].aborted).toBe(true);
        expect(pane.element().textContent).toContain("2");
        expect(pane.current()).toEqual({ id: 9 });
        pane.destroy();
    });

    it("destroy() annule la requête, retire le DOM et les listeners", async () => {
        const captured = [];
        const onAction = vi.fn();
        const container = makeContainer();
        const pane = makePane({
            resolve: (item, ctx) => new Promise((res) => { captured.push({ ctx, res }); }),
        }, container);
        pane.on("action", onAction);
        pane.show({ id: 1 });
        const root = pane.element();
        pane.destroy();
        expect(captured[0].ctx.signal.aborted).toBe(true);
        expect(container.querySelector(".holaf-infopane")).toBe(null);
        captured[0].res({ fields: [{ label: "I", value: "1" }] });
        await flush();
        expect(root.textContent).not.toContain("1");
        pane.show({ id: 2 }); // no-op après destroy
        pane.clear();
        pane.destroy();
        expect(onAction).not.toHaveBeenCalled();
    });

    it("on() retourne une fonction de retrait", async () => {
        const onAction = vi.fn();
        const pane = makePane({
            resolve: () => ({
                blocks: [{ id: "w", label: "W", text: "{}", actions: [{ id: "x", label: "X" }] }],
            }),
        });
        const off = pane.on("action", onAction);
        await pane.show({ id: 1 });
        off();
        pane.element().querySelector(".holaf-infopane-button").click();
        await flush();
        expect(onAction).not.toHaveBeenCalled();
        pane.destroy();
    });

    it("instances multiples : DOM et cycle de vie indépendants", async () => {
        const c1 = makeContainer();
        const c2 = makeContainer();
        const paneA = makePane({ resolve: () => ({ fields: [{ label: "A", value: "a" }] }) }, c1);
        const paneB = makePane({ resolve: () => ({ fields: [{ label: "B", value: "b" }] }) }, c2);
        await paneA.show({ id: "a" });
        await paneB.show({ id: "b" });
        expect(c1.textContent).toContain("a");
        expect(c2.textContent).toContain("b");
        paneA.destroy();
        expect(c1.querySelector(".holaf-infopane")).toBe(null);
        expect(c2.textContent).toContain("b");
        paneB.destroy();
    });
});

// ── Preview ──────────────────────────────────────────────────────────────────
describe("preview synchrone", () => {
    it("affiche la preview immédiatement puis la remplace par resolve()", async () => {
        let resolveFn;
        const pane = makePane({
            preview: () => ({ fields: [{ label: "Nom", value: "rapide.png" }] }),
            resolve: () => new Promise((r) => { resolveFn = r; }),
        });
        pane.show({ id: 1 });
        expect(pane.element().textContent).toContain("rapide.png");
        expect(pane.element().textContent).toContain("Loading...");
        resolveFn({ fields: [{ label: "Nom", value: "final.png" }] });
        await flush();
        expect(pane.element().textContent).toContain("final.png");
        expect(pane.element().textContent).not.toContain("rapide.png");
        pane.destroy();
    });

    it("en cas d'échec de resolve(), la preview reste et l'erreur est ajoutée", async () => {
        const pane = makePane({
            labels: { error: "Erreur :" },
            preview: () => ({ fields: [{ label: "Nom", value: "rapide.png" }] }),
            resolve: () => Promise.reject(new Error("réseau")),
        });
        await pane.show({ id: 1 });
        expect(pane.element().textContent).toContain("rapide.png");
        expect(pane.element().textContent).toContain("Erreur : réseau");
        expect(pane.element().getAttribute("data-state")).toBe("error");
        pane.destroy();
    });

    it("rejet sans message : l'état d'erreur reste affiché (préfixe seul)", async () => {
        const pane = makePane({
            labels: { error: "Erreur :" },
            resolve: () => Promise.reject({}),
        });
        await pane.show({ id: 1 });
        expect(pane.element().getAttribute("data-state")).toBe("error");
        expect(messageOf(pane.element()).textContent).toBe("Erreur :");
        pane.destroy();
    });

    it("une preview qui lève est ignorée (repli chargement)", async () => {
        let resolveFn;
        const pane = makePane({
            preview: () => { throw new Error("preview cassée"); },
            resolve: () => new Promise((r) => { resolveFn = r; }),
        });
        pane.show({ id: 1 });
        expect(messageOf(pane.element()).textContent).toBe("Loading...");
        resolveFn({});
        await flush();
        pane.destroy();
    });
});
