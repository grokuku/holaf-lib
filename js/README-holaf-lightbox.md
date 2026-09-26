# HolafLightbox — doc d'usage (brique holaf-lib v0.1.0)

Visionneuse plein écran / inline **générique** et **instanciable** : un seul
fichier (`holaf-lightbox.js`), zéro dépendance runtime, **zéro import croisé**.
Elle gère la **machine à états de vue** (idle ⇄ zoom ⇄ fullscreen), la
**navigation** item→item et « grille », le **préchargement**, le **clavier** et
la **délégation zoom/pan** à HolafViewport. Le **média** (img/vidéo/audio,
éditeur…) est produit par un `renderMedia` **injecté** : la brique ne connaît
aucun balisage métier.

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-lightbox.js"></script>
<script>
    const lb = HolafLightbox.create({ host: document.body, viewport: HolafViewport, ... });
</script>
```

**Option B — import ES Module :**

```js
import { HolafLightbox } from "./vendor/holaf/holaf-lightbox.js";
```

CSS : la brique **auto-injecte** son `<style id="holaf-lightbox-style">` (CSS
scopé `.holaf-lightbox-*`, variables `--hl-*` posées sur la racine de chaque
overlay, jamais sur `:root`). Pour un hôte à CSP strict (ou un fichier CSS
statique) : `HolafLightbox.getCss()` + `{ css: { injectStyles: false } }` (ou
`HolafLightbox.configure({ injectStyles: false })`), et un nonce via
`{ css: { nonce } }` / `HolafLightbox.setStyleNonce(nonce)`.

---

## 2. Le contrat d'injection (le cœur du design)

### 2.1 `renderMedia` — L'HÔTE FABRIQUE LE MÉDIA

```js
renderMedia({ container, item, mode, onReady, signal, viewport, lightbox,
              immediate, index }) -> { el, destroy? } | Promise<…>
```

- `container` : surface de la vue (fournie par l'hôte ou créée par la brique).
- `item` : l'item courant ; `mode` : `'zoom'` | `'fullscreen'`.
- `onReady(payload?)` : **à appeler quand le média est prêt** — la brique cache
  son spinner, émet `ready`, et, si `payload = { width, height }`, appelle
  `viewport.setImageSize(width, height)`. `payload = { fit: true }` force un
  `viewport.fit()`.
- `signal` : un `AbortSignal` **avorté** dès qu'un nouveau rendu démarre ou que
  la vue se ferme. L'hôte DOIT le respecter (annuler les fetch/`img.onload`
  périmés).
- `viewport` : l'instance HolafViewport courante de la vue (peut être `null`).
- `immediate` : `true` à l'ouverture (rendu immédiat), `false` en navigation
  (l'hôte peut différer le chargement pleine résolution comme le faisait
  `_updateMediaSource(..., immediate)`).
- **Retour** : `{ el }` = l'élément média à transformer (img **ou** vidéo) →
  la brique s'en sert comme `content` du viewport. `destroy()` est appelé par
  la brique avant le rendu suivant et à la fermeture (pause vidéo, cleanup).

La brique garantit un **garde de stale-load (serial)** : un `onReady`/résultat
d'un rendu périmé (navigation rapide) est ignoré, et le `destroy`/signal du
rendu précédent est déclenché avant tout nouveau rendu.

Défaut (si `renderMedia` absent) : un `<img src=urlFor(item,'full')>` simple.

### 2.2 `viewport` — ZÉRO IMPORT CROISÉ

La brique **n'importe jamais** HolafViewport. Elle le reçoit :

```js
HolafLightbox.create({
    viewport: window.HolafViewport,          // implémentation { create }
    // ou : viewportFactory: (mode, container, element) => HolafViewport | null,
    viewportOptions: (mode, container, element) => ({
        content: element,            // ← défaut si absent
        dragTarget: element,         // ← défaut si absent
        minZoom: "fit", maxZoom: 30, zoomFactor: 1.1,
        panClamp: true, drag: true, dragButton: 0,
        doubleClickZoom: container.id !== "holaf-viewer-zoom-view",
        canDrag: (e) => !(e.target && e.target.closest && e.target.closest("#holaf-crop-overlay-wrap, #holaf-mask-overlay-wrap")),
        onChange: (vp) => { /* ex. synchroniser un overlay d'éditeur */ },
    }),
    onViewport: (mode, instance, element) => { /* instance ou null */ },
});
```

La brique crée **une instance de viewport par vue**, la recrée quand l'élément
média change (`img` ↔ `vidéo`), la détruit à la fermeture, et la restitue via
`onViewport` (l'hôte y conserve typiquement `state.viewport` pour son éditeur).
**Repli documenté** : sans `viewport`/`viewportFactory`, la brique fonctionne
sans zoom/pan (`zoomBy`/`resetZoom` renvoient `false`) — le média s'affiche,
la navigation/le clavier/le préchargement restent opérationnels.

---

## 3. Créer une instance

```js
const lb = HolafLightbox.create({
    host: document.body,          // où la brique pose son overlay par défaut
    zIndex: 10999,                // overlay par défaut (bandes z de l'hôte)
    getId: (item) => item.path_canon,
    urlFor: (item, size) => size === "thumb" ? item.thumb : item.fullUrl,
    renderMedia: myRenderMedia,   // cf. §2.1
    viewport: window.HolafViewport,
    viewportOptions: myVpOptions, // cf. §2.2
    preload: 10,                  // N suivants préchargés
    preloadDebounce: 400,         // ms — lot débouncé
    shouldPreload: (item) => !isVideo(item),
    modes: ["zoom", "fullscreen"],
    getColumnCount: () => myGrid.getColumnCount(),   // ↑/↓ = ±colonnes
    getIndex: () => myState.currentNavIndex,          // index de l'hôte (autorité)
    shouldHandleKey: (e) => !dialogState.isOpen && !isInputFocused(e),
    beforeNavigate: async (dir, item, nextIndex) => "proceed", // 'cancel' annule
    labels: { prev: "‹", next: "›", close: "✖", region: "Visionneuse" },
    css: { injectStyles: true, nonce: null },
    onOpen: (mode, item) => {},
    onClose: (mode) => {},
    onNavigate: (dir, item, index, grid) => {},
    onResume: (mode, item) => {},               // retour à une vue sous-jacente
    onReady: (mode, item, payload) => {},
    onError: (mode, item, error) => {},
    onViewport: (mode, instance, element) => {},
});
```

### Conteneurs (vues)

Deux usages possibles :

- **Conteneurs fournis par l'hôte** — `views: { zoom: { container }, fullscreen: { container, display: 'flex' } }` :
  la brique pilote l'état/visibilité/navigation/spinner et délègue le rendu.
  Indispensable quand l'hôte a un éditeur lié à ses sélecteurs/CSS (galerie du
  node). Un `chrome: true` optionnel injecte la barre ‹ › ✖ + spinner dans le
  conteneur fourni.
- **Conteneurs créés par la brique** (défaut) : la brique fabrique un overlay
  plein écran `.holaf-lightbox-overlay` (barre ‹ › ✖ + spinner, z-index
  `zIndex`) dans `host`.

`addView(mode, config)` permet d'enregistrer une vue a posteriori (utile quand
le conteneur plein écran est créé après le conteneur zoom).

### Source des items

```js
lb.setItems([...]);                       // tableau simple
lb.setSource({                            // collection (getAt peut être async)
    total: () => n,
    getAt: (i) => itemOrPromise,
    getAtSync: (i) => itemOrNull,         // optionnel (préchargement synchrone)
});
```

`getIndex()` (option) fait **autorité** sur l'index : l'hôte peut garder son
`currentNavIndex` comme source de vérité et la brique le lit. Sinon la brique
maintient son propre index, mis à jour par `navigate`/`navigateGrid`.

---

## 4. API de l'instance

`openZoom(item?)` / `openFullscreen(item?)` (async) · `close()` (ferme tout) ·
`back()` (dépile la vue du sommet → restaure la vue source) ·
`navigate(dir)` (‹/› + wrap-around) · `navigateGrid(dir)` (↑/↓ ±colonnes, borné) ·
`current()` · `isOpen()` · `mode()` · `setItems(items)` / `setSource(coll)` ·
`preloadAround(index?)` · `preload()` · `handleKey(e)` → bool (consommé) ·
`zoomBy(factor)` / `setZoom(s,x,y)` / `resetZoom()` · `addView(mode, cfg)` ·
`on(evt, cb)` / `off(evt, cb)` · `destroy()`.

Événements : `open` `close` `navigate` `ready` `error` `resume` `viewport`.

Clavier géré (si `shouldHandleKey` l'autorise) : `‹`/`›` et `←`/`→` = ±1,
`↑`/`↓` = ±colonnes (hors vue ouverte), `Entrée` = zoom, `Ctrl/⌘+Entrée` =
fullscreen, `Échap` = `back()`, `+`/`-` = zoom, `0` = reset (le
`preventDefault()` n'est posé que sur les touches consommées).

---

## 5. Recettes

### 5.1 Pack ComfyUI-AI-Helper (éditeur, garde dialogState)

```js
const lb = HolafLightbox.create({
    viewport: HolafViewport,
    renderMedia: ({ container, item, mode, onReady, signal, immediate }) =>
        _updateMediaSource(viewer, item, container, imgEl(mode), videoEl(mode),
                           stateOf(mode), immediate, signal, onReady), // + spinner host
    shouldPreload: (item) => !isVideo(item),
    shouldHandleKey: (e) => !dialogState.isOpen && !isInputFocused(e),
    getColumnCount: () => viewer.gallery.getColumnCount(),
    getIndex: () => imageViewerState.getState().currentNavIndex,
    views: {
        zoom: { container: document.getElementById('holaf-viewer-zoom-view'), display: 'flex' },
        fullscreen: { container: document.getElementById('holaf-viewer-fullscreen-overlay'), display: 'flex' },
    },
    viewportOptions: (mode, container, element) => ({ /* cf. §2.2 */ }),
    onViewport: (mode, vp) => {
        const st = mode === 'zoom' ? viewer.zoomViewState : viewer.fullscreenViewState;
        st.viewport = vp || undefined;   // l'éditeur lit state.viewport
    },
});
```

### 5.2 Galerie web (sans édition)

```js
renderMedia: ({ container, item, onReady }) => {
    const img = document.createElement('img');
    img.src = item.thumbUrl;                 // affichage immédiat
    const full = new Image();
    full.onload = () => { img.src = full.src; onReady({ width: full.naturalWidth, height: full.naturalHeight }); };
    full.src = item.url;
    container.appendChild(img);
    return { el: img, destroy() { img.remove(); } };
},
// pas d'éditeur ⇒ pas d'onViewport : la brique crée l'overlay/nav/spinner.
```

---

## 6. Notes

- **Instanciable plusieurs fois** : aucun état de module hors le `<style>`
  partagé (retiré à la destruction de la dernière instance).
- **Restauration de la vue source** : ouvrir fullscreen depuis zoom empile la
  vue ; Échap/`back()` dépile et émet `resume` (la vue zoom, restée vivante,
  est simplement ré-affichée).
- **Zéro import croisé** : la source, le média et le viewport sont injectés.
- **Non couvert par les tests unitaires** (jsdom) : rendu réel, pinch/touch
  (absent de HolafViewport 0.1.x), perf du préchargement réseau.
