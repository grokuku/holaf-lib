# HolafInfoPane — doc d'usage (brique holaf-lib v0.1.0)

Panneau d'informations média **générique** et **instanciable** : un seul
fichier (`holaf-infopane.js`), zéro dépendance runtime, **zéro import croisé**.
Il gère les **états** (vide / chargement / erreur / prêt), les **champs**
label/valeur, les **blocs de texte copiables** (textarea auto-redimensionnée,
confirmation « Copié ! » puis retour) et les **actions** (par bloc avec
confirmation injectable, ou globales au panneau). La **source de données** est
**injectée** : la brique ne connaît ni endpoint, ni format métier, ni ComfyUI.

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-infopane.js"></script>
<script>
    const pane = HolafInfoPane.create(document.getElementById("info"), {
        resolve: (item, { signal }) => fetchInfo(item, signal),
    });
    pane.show(item);
</script>
```

**Option B — import ES Module :**

```js
import { HolafInfoPane } from "./vendor/holaf/holaf-infopane.js";
```

CSS : la brique **auto-injecte** son `<style id="holaf-infopane-style">` (CSS
scopé `.holaf-infopane-*`, variables `--hl-*` posées sur la racine du panneau,
jamais sur `:root`). Pour un hôte à CSP strict (ou un fichier CSS statique) :
`HolafInfoPane.getCss()` + `{ css: { injectStyles: false } }` (ou
`HolafInfoPane.configure({ injectStyles: false })`), et un nonce via
`{ css: { nonce } }` / `HolafInfoPane.setStyleNonce(nonce)`. Le `<style>`
partagé n'est retiré qu'à la destruction de la **dernière** instance qui l'a
demandé.

---

## 2. Le contrat d'injection (le cœur du design)

### 2.1 `resolve(item, { signal, pane })` — L'HÔTE FOURNIT LES DONNÉES

```js
resolve: async (item, { signal }) => ({
    title: "…",                     // optionnel
    fields: [
        { label: "Nom :", value: item.filename, stacked: true },
        { label: "Taille :", value: "1.25 MB" },
    ],
    blocks: [
        { id: "prompt", label: "Prompt :", source: "(depuis .txt)",
          text: item.prompt || "", copyable: true, copyLabel: "Copier le prompt",
          copyPlacement: "before" },
        { id: "workflow", label: "Workflow :", source: "(depuis .json)",
          text: JSON.stringify(item.workflow, null, 2), copyable: true,
          actions: [{ id: "load", label: "Charger", disabled: false,
                      confirm: { title: "Charger", message: "Écraser l'espace ?" },
                      onClick: () => load(item.workflow) }] },
    ],
    error: undefined,               // message d'erreur partiel (champs conservés)
})
```

- Peut être **synchrone** (objet) ou asynchrone (`Promise`).
- `signal` est un `AbortSignal` **avorté** dès que l'item change, à
  `clear()` / `refresh()` / `destroy()` : l'hôte DOIT le passer à ses fetch
  (`fetch(url, { signal })`) et ignorer une résolution avortée. Une résolution
  périmée (navigation rapide) est ignorée par la brique (garde de séquence).
- Si `resolve` rejette → **état d'erreur** (préfixe `labels.error` + message).
  Pour un échec **partiel** (garder les champs déjà connus), renvoyer
  `error: "message"` dans le résultat : les champs restent affichés et l'erreur
  apparaît dessous (séparateur conservé).

### 2.2 `preview(item)` — affichage SYNCHRONE optionnel

```js
preview: (item) => ({ fields: [{ label: "Nom :", value: item.filename }] }),
```

Affiché **immédiatement** au `show()`, suivi d'un « chargement… » en bas, puis
**remplacé** par le résultat de `resolve()`. En cas d'échec de `resolve()`, la
preview **reste** et l'erreur est ajoutée dessous. C'est ce qui permet à une
galerie de montrer les infos déjà connues de l'item (nom, taille, date) sans
attendre le réseau.

### 2.3 Champs

| Champ     | Rôle |
|-----------|------|
| `label`   | Libellé (texte échappé). |
| `value`   | Valeur (**texte échappé par défaut**). |
| `stacked` | `true` → `<br>` entre label et valeur (chemins longs). Défaut : même ligne. |
| `raw`     | HTML déjà sûr, utilisé **uniquement** avec `html: true` (sinon `value`). |

Un champ dont `value` est `null`, `undefined` ou `""` (sans `raw`) est **omis**.

### 2.4 Blocs

| Champ           | Rôle |
|-----------------|------|
| `id`            | Identifiant (posé en `data-block-id`). |
| `label`         | Libellé du bloc. |
| `source`        | Badge discret (ex. « (depuis .png) »). |
| `text`          | Texte copiable (textarea readOnly auto-redimensionnée, bornée par `max-height`, défaut 140px). |
| `copyable`      | `true` → bouton copier (libellé `copyLabel` sinon `labels.copy`). |
| `copyDisabled`  | `true` → bouton copier **désactivé** (ex. prompt vide). |
| `copyPlacement` | `"before"` → bouton **avant** la textarea ; défaut `"after"`. |
| `copyLabel`     | Libellé initial du bouton copier. |
| `actions`       | Boutons propres au bloc (rendus avant le texte) : `{ id, label, disabled?, isEnabled?(item), confirm?, onClick(ctx) }`. |
| `error`         | Message d'erreur **qui remplace** le texte (non copiable). |
| `empty`         | Message si `text` est vide (défaut `labels.notAvailable`). |

`onClick(ctx)` reçoit `{ item, block, action, pane }`. `confirm` accepte `true`,
une chaîne (message) ou `{ title, message }` ; la confirmation passe par
l'option `confirm(req)` de l'hôte (défaut `window.confirm`), `req` =
`{ title, message, action, block, item, pane }`.

### 2.5 `actions` globaux du panneau

```js
actions: [
    { id: "delete", label: "Supprimer",
      isEnabled: (item) => !!item,
      run: (item, { pane, emit }) => deleteItem(item) },
]
```

Rendus en pied de panneau, sous les blocs. `isEnabled(item)` désactive le
bouton ; `run(item, { pane, emit })` est appelé au clic (même confirmation
injectable possible). Chaque exécution émet `on('action')`.

---

## 3. Méthodes & évènements

| Membre | Rôle |
|--------|------|
| `show(item)` | Préview/chargement puis rendu ; `show(null)` = `clear()`. Retourne une Promise résolue quand l'affichage est à jour. |
| `clear()` | Annule la requête et revient à l'état vide (`labels.selectItem`). |
| `refresh()` | Relance `resolve()` sur l'item courant (contenu conservé pendant la requête). |
| `setLabels(labels)` | Fusionne des libellés (à rappeler avant `show()` pour suivre un changement de langue). |
| `on(evt, cb)` / `off(evt, cb)` | Abonnement ; `on` retourne la fonction de retrait. |
| `current()` / `element()` | Item courant / racine DOM du panneau. |
| `destroy()` | Abort + retrait DOM/listeners/timers + `<style>` partagé si dernière. |

**Évènement `action`** — `{ kind: "block" | "pane" | "copy", id, action?, block?,
item, pane, ok? }` (`ok` pour les copies). Émis après confirmation (les clics
refusés ou sur bouton désactivé n'émettent rien).

**Labels par défaut** (surchargeables) : `copy`, `copied`, `copyFailed`,
`loading`, `selectItem`, `notAvailable`, `error`.

**Options** : `resolve`, `preview`, `confirm`, `actions`, `labels`, `html`,
`copyRevertDelay` (1500ms), `copyFailRevertDelay` (2000ms),
`css: { injectStyles, nonce }`.

---

## 4. Thémer la brique

La brique est neutre ; l'hôte surcharge les variables CSS **sur son conteneur** :

```css
#mon-panneau .holaf-infopane {
    --hl-infopane-text: var(--holaf-text-secondary);
    --hl-infopane-strong: var(--holaf-text-primary);
    --hl-infopane-border: var(--holaf-border-color);
    --hl-infopane-input-bg: var(--holaf-input-background);
    --hl-infopane-accent: var(--holaf-accent-color);
    --hl-infopane-button-text: var(--holaf-button-text);
    --hl-infopane-danger: var(--holaf-error-color);
}
```

Le panneau expose `data-state="empty|loading|ready|error"` sur `.holaf-infopane`
pour les surcharges conditionnelles.

---

## 5. Recettes

### 5.1 Galerie du node (ComfyUI) — endpoint + bouton métier

```js
const pane = HolafInfoPane.create(document.getElementById("holaf-viewer-info-content"), {
    labels: { error: t("iv.errorLabel"), loading: t("iv.loadingMetadata"), /* … */ },
    preview: (img) => ({ fields: fieldsFromItem(img) }),        // nom/taille/date
    resolve: async (img, { signal }) => {
        const url = "/holaf/images/metadata?filename=" + encodeURIComponent(img.filename);
        const data = await HolafFetch.get(url, { signal, cache: "no-store" });
        return { fields: fieldsFromItem(img), blocks: blocksFrom(data) };
    },
    confirm: async (req) => AIH.ask({                 // confirmation injectée
        title: req.title, message: req.message,
        buttons: [{ text: t("iv.cancel"), value: false }, { text: t("iv.load"), value: true }],
    }),
});
pane.show(activeImage);
```

Le bouton « Charger le workflow » est un `actions[].onClick` du bloc workflow
(disabled si workflow absent/en erreur) : il appelle `comfyApp.loadGraphData`
ou `holafBridge.send("LOAD_WORKFLOW", workflow)` — ce métier reste à l'hôte.

### 5.2 Galerie web (backend AI-Helper) — prompt + workflow + métadonnées

Même brique, `resolve()` branché sur `GET /api/media/<id>` (ou l'endpoint
metadata à créer) : champs `nom, résolution, type, codec, durée, taille, date`,
blocs `prompt`/`workflow` **copiables**, et **aucune action** « Load workflow »
(spécifique ComfyUI). Les libellés viennent de l'i18n de l'hôte.

---

## 6. Notes

- **Zéro métier** : aucun endpoint, aucun format, aucun bridge dans la brique.
- **Aucun import croisé**, zéro dépendance runtime ; un `<style>` partagé par
  module (compté par instance) est le seul état hors instance.
- **Abort complet** : item suivant, `clear()`, `refresh()`, `destroy()`
  avortent la requête en cours ; les résolutions périmées sont ignorées.
- **Copie** : `execCommand('copy')` puis repli `navigator.clipboard.writeText` ;
  libellé temporaire `labels.copied`/`labels.copyFailed` puis retour au libellé
  initial.
- **Sécurité** : tout passe par `textContent` par défaut ; `html: true` est le
  seul opt-in (champs `raw` fournis par l'hôte, sous sa responsabilité).
- **Ctrl+A global de la page** (scripts hôtes type ComfyUI) : à la charge de
  l'hôte (la brique n'ajoute aucun listener `document`).
