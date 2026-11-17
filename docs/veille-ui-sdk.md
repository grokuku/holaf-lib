# Veille — UI SDK (Vercel Labs) : bibliothèque de comportements, non adoptée

**Statut :** **veille technique, non adoptée** — aucun engagement, aucune décision d'intégration
**Dossier :** `holaf-lib/docs/`
**Public :** toute session agent future, sans contexte préalable (document autoportant)
**Date :** 2026-11-17
**Méthode :** évalué et **testé en sandbox, aucun dépôt modifié** (sandbox : `/tmp/ui-sdk-sandbox`)

---

## 0. En une phrase

**`@ui-sdk/core` (Vercel Labs) n'est pas un concurrent de holaf-lib** : c'est une
bibliothèque de **comportements** (popup, focus, sélection, drag, virtualisation…),
là où holaf-lib fournit des **composants** prêts à l'emploi (modal, toast, icons,
tokens). La cohabitation technique a été **mesurée et validée** ; l'usage visé
serait un **complément ciblé sur 2–3 cas**, jamais un remplacement.

**Ce document n'est pas une recommandation d'adoption.** C'est un relevé de faits
daté, à réévaluer si le besoin apparaît.

---

## 1. Nature — des behaviors, pas des composants

**117 exports** mesurés. Aucun composant rendu : uniquement des primitives de
comportement, à câbler sur son propre balisage.

| Famille | Exports représentatifs |
|---|---|
| Overlays / focus | `createPopup`, `popupState`, `position`, `createRovingFocus`, `createListbox`, `createGridFocus` |
| Sélection | `createSelection`, `createCellRange`, `createLasso` |
| Direct manipulation | `createReorder`, `createMove`, `createResize`, `createDrag`, `createSwipeActions` |
| Virtualisation / listes | `createVirtualizer`, `createTypeahead`, `createTree` |
| Édition | `createUndoStack`, `createSpans` |
| Persistance / préférences | `createLocalStorage`, `createSessionStorage`, `createCookieStorage`, `createPreference` |
| Animation / a11y / clavier | `animateIn`, `animateOut`, `announce`, `matchesShortcut` |

---

## 2. État du paquet (relevé 2026-11-17)

| Point | Valeur mesurée |
|---|---|
| Version | **`0.1.0-beta.7`** — **API non stable** |
| Licence | **Apache-2.0** |
| Dépendances transitives | **zéro** (`@ui-sdk/core`) |
| Adaptateurs | 6 paquets `0.1.0-beta.x` : `core`, `react`, `vue`, `svelte`, `solid`, `web` |

> ⚠️ **Piège de version** : `npm install @ui-sdk/core` installe **beta.6**
> (dist-tag `latest`), alors que le site `ui-sdk.dev` sert **beta.7** (dist-tag
> `beta`). Toute évaluation doit **épingler la version exacte**.

---

## 3. Cohabitation avec holaf-lib — validée par la mesure

- **Réellement headless** : la peau web est un **export séparé et optionnel**
  (`./web.css`) ; le cœur ne style rien.
- **Cascade layers** : le CSS par défaut est enfermé dans **`@layer ui-sdk`**.
  holaf-lib n'utilise **aucun `@layer`** → **le CSS holaf (non-layered) gagne
  toujours**. Aucune guerre de spécificité.
- **Aucun shadow DOM** (`grep -c attachShadow` = **0**) : styles globaux,
  cohabitation directe avec `holaf-tokens`.
- **Re-stylable** par 4 mécanismes : variables `--ui-*` ; cascade layer ;
  attributs `[data-slot]` (232 sélecteurs, **zéro classe de présentation**) ;
  attribut `as-child` + positionnement JS inline (`inset`, `--available-height`).

---

## 4. Utilisable sans React

Oui, via `@ui-sdk/web` en **custom elements** : `<ui-popover>`, `<ui-dialog>`,
`<ui-toast>`, pilotés par `el.api.{open,close,toggle,isOpen,setOpen,focus}`.
Démo fonctionnelle en **24 lignes**, sans bundler.

> ⚠️ **Piège d'intégration** : servir `node_modules/@ui-sdk/web/browser/`
> (prébundlé). Charger `dist/*.js` directement **échoue en navigateur** — ces
> fichiers importent les « package imports » Node `#dev` / `#name-check`, que le
> navigateur ne résout pas.

---

## 5. Poids mesuré (un seul popover)

| Solution | Poids gzip | Requêtes |
|---|---|---|
| `@ui-sdk/web` (popover) | **59,1 KiB** | **23** |
| `holaf-modal.js` + `holaf-modal.css` + `holaf-tokens.js` | **36,5 KiB** | **3** |

→ UI SDK est **~1,7× plus lourd** pour un résultat comparable. Son intérêt n'est
donc pas le poids, mais les comportements **qu'holaf n'a pas**.

---

## 6. Conclusion — complément ciblé, pas remplacement

**Ne pas refaire `modal` / `toast` avec UI SDK** : holaf-lib les a déjà, testés,
plus légers. Les seuls candidats réels, par ordre de valeur :

1. **`createVirtualizer`** sur le fil de chat de Pi-Web (`ChatView.tsx`, ~2 550
   lignes, rend **tout** le fil). ⚠️ **Mesurer avant d'implémenter** : virtualiser
   un fil de chat casse facilement le scroll et l'ancrage en bas — le gain doit
   être prouvé, pas supposé.
2. **Behaviors sans équivalent holaf** : `createTree`, `createUndoStack`,
   `createLasso` / `createCellRange`, `createSwipeActions`, `animateIn` / `animateOut`.

---

## 7. Prérequis si une adoption était décidée un jour

1. **Épingler une version exacte** (pré-release bêta — voir le piège §2).
2. **Vérifier React 19+** côté Pi-Web (si l'adaptateur `@ui-sdk/react` est utilisé).
3. **Écrire la règle de frontière** — « **holaf = la peau, ui-sdk = le
   comportement** » — pour éviter **deux sources de vérité** sur le même
   composant.
4. Réévaluer : l'API est en **0.1.0-beta**, elle peut changer sans préavis.

---

## 8. Références

- Site / doc : `https://ui-sdk.dev` (Vercel Labs).
- Sandbox de test conservée : `/tmp/ui-sdk-sandbox` (`demo-webjs.html`,
  `demo-nocss.html`, `demo-min.html`) — relancer avec
  `python3 -m http.server 8123`.
- holaf-lib : `README.md`, `manifest.json` (briques et versions).
