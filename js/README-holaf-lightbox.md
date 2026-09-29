# HolafLightbox — doc d'usage (brique holaf-lib v0.2.0)

Visionneuse plein écran / inline **générique** et **instanciable** : un seul
fichier (`holaf-lightbox.js`), zéro dépendance runtime, **zéro import croisé**.
Elle gère la **machine à états de vue** (idle ⇄ zoom ⇄ fullscreen), la
**navigation** item→item et « grille », le **préchargement**, le **clavier** et
la **délégation zoom/pan** à HolafViewport. Le **média** (img/vidéo/audio,
éditeur…) est produit par un `renderMedia` **injecté** : la brique ne connaît
aucun balisage métier.

**0.2.0 — capacités OPT-IN** (sans les options, le comportement 0.1.0 est
strictement inchangé) : **diaporama** (§5), **crossfade** (§6), **chrome
discret** (§7).

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
    // ── Capacités OPT-IN (absentes = comportement 0.1.0) ──
    slideshow: true,                    // ou { duration, transition, random, loop, keyboard }
    transition: 400,                    // crossfade (ms) — 0 (défaut) = coupe franche
    chrome: { icons: false, autoHide: false, idleDelay: 3000, fadeDuration: 300 },
    onOpen: (mode, item) => {},
    onClose: (mode) => {},
    onNavigate: (dir, item, index, grid) => {},
    onResume: (mode, item) => {},               // retour à une vue sous-jacente
    onReady: (mode, item, payload) => {},
    onError: (mode, item, error) => {},
    onViewport: (mode, instance, element) => {},
    onSlideshowStart: (cfg) => {},              // { duration, transition, random, loop, index, item }
    onSlideshowStop: (info) => {},              // { reason, index, item }
    onSlideshowTick: (info) => {},              // { index, item, nextIndex, direction }
    onSlideshowPause: (info) => {},
    onSlideshowResume: (info) => {},
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

Diaporama (opt-in, §5) : `startSlideshow({duration, transition, random, loop})` ·
`stopSlideshow(reason?)` · `toggleSlideshow()` · `pauseSlideshow()` ·
`resumeSlideshow()` · `isSlideshow()` · `isSlideshowPaused()`.

Événements : `open` `close` `navigate` `ready` `error` `resume` `viewport`
(0.2.0) `slideshowstart` `slideshowstop` `slideshowtick` `slideshowpause`
`slideshowresume`.

Clavier géré (si `shouldHandleKey` l'autorise) : `‹`/`›` et `←`/`→` = ±1,
`↑`/`↓` = ±colonnes (hors vue ouverte), `Entrée` = zoom, `Ctrl/⌘+Entrée` =
fullscreen, `Échap` = `back()`, `+`/`-` = zoom, `0` = reset. **0.2.0, opt-in
`slideshow` seulement** : `Espace` **en plein écran** démarre le diaporama puis
fait play/pause (non consommé sans l'option ; `slideshow.keyboard:false`
désactive). Le `preventDefault()` n'est posé que sur les touches consommées.

---

## 5. Diaporama (OPT-IN) — `slideshow`

```js
const lb = HolafLightbox.create({
    slideshow: { duration: 4000, transition: 400, random: false, loop: false },
    // ou slideshow: true → durée 4000 ms, pas de transition, séquentiel.
});
lb.startSlideshow();
lb.stopSlideshow();               // reason 'manual'
lb.toggleSlideshow();             // 1er appel = démarre, ensuite play/pause
lb.pauseSlideshow(); lb.resumeSlideshow();
lb.isSlideshow();                 // true si démarré (en cours OU en pause)
lb.isSlideshowPaused();
```

### Réglages

| Option | Défaut | Rôle |
| --- | --- | --- |
| `duration` | `4000` | ms entre deux images |
| `transition` | `null` | ms de fondu de la session (null = hérite de `transition` d'instance, sinon 0) |
| `random` | `false` | ordre aléatoire **sans répéter la même image deux fois de suite** |
| `loop` | `false` | boucle en fin de liste ; sinon **arrêt en fin** (`slideshowstop` reason `'end'`) |
| `keyboard` | `true` | barre d'espace en plein écran = démarrer/play-pause |

`startSlideshow(opts)` écrase ces valeurs pour la session courante.

### Comportement

- avance automatique après `duration` ms (la 1re image reste affichée pendant
  `duration`) ; sans `loop`, la fin de liste arrête le diaporama ;
- **flèches en diaporama** : une flèche change l'image IMMÉDIATEMENT (dans les
  deux sens) et **réarme** le minuteur — donc accélérer vers l'avant ou revenir
  en arrière ralentit l'avance suivante ;
- **espace en plein écran** : démarre si arrêté, sinon pause/reprise ;
- fermer la vue (Échap, `back()`, `close()`) arrête le diaporama
  (`reason: 'close'`) ; `destroy()` → `reason: 'destroy'` ;
- le diaporama n'est actif que dans une vue ouverte (`startSlideshow()` renvoie
  `false` sinon) ; il peut démarrer en `zoom` comme en `fullscreen`.

### Événements

| Événement | Payload |
| --- | --- |
| `slideshowstart` | `{ duration, transition, random, loop, index, item }` |
| `slideshowstop` | `{ reason: 'manual'|'end'|'close'|'destroy', index, item }` |
| `slideshowtick` | `{ index, item, nextIndex, direction }` (avant le changement) |
| `slideshowpause` / `slideshowresume` | `{ index, item }` |

Mêmes noms de handlers d'options : `onSlideshowStart` `onSlideshowStop`
`onSlideshowTick` `onSlideshowPause` `onSlideshowResume`.

### Bouton diaporama de l'hôte

La brique n'ajoute AUCUN bouton : l'hôte crée son bouton (par exemple dans
l'overlay, classe `.holaf-lightbox-nav` pour participer au chrome discret, §7)
et branche `toggleSlideshow()` + `isSlideshow()`/`isSlideshowPaused()` (tenus à
jour par `slideshowstart`/`stop`/`pause`/`resume`) pour basculer ▶/❚❚.

---

## 6. Crossfade (OPT-IN) — `transition`

Vrai **fondu enchaîné** : la couche sortante et la couche entrante sont
superposées pendant toute la transition (ce n'est PAS un fade-out suivi d'un
fade-in). `transition: 0` (défaut) → coupe franche, aucune couche créée.

```js
HolafLightbox.create({
    transition: 400,                       // ms — toutes les navigations
    // views: { fullscreen: { transition: 0 } },  // override par vue
    // slideshow: { duration: 4000, transition: 400 },  // override par session de diaporama
});
```

Priorité : session de diaporama > config de vue > option d'instance.

### Contrat renderMedia en crossfade

Quand `transition > 0`, la brique passe à `renderMedia` une **couche fraîche**
(`<div class="holaf-lightbox-layer">`) comme `container` ; le média doit être
créé DANS cette couche (le `{ el }` retourné est le contenu du viewport).
Conséquence : ne PAS réutiliser un élément média déjà présent dans un autre
conteneur (`container.querySelector('img')` ne retrouvera pas l'image
précédente — c'est voulu : les deux images doivent coexister). Les hôtes qui
réutilisent leurs éléments dans le même conteneur ne doivent pas activer le
crossfade.

### Cycle de vie

- le fondu démarre à `onReady` (média entrant prêt) avec un repli borné
  (~1000 ms) si l'hôte ne signale jamais `onReady` ; le premier rendu d'une vue
  est direct (rien à croiser) ;
- l'abort/destroy du rendu SORTANT n'est déclenché qu'à la fin du fondu
  (ou immédiatement si un nouveau rendu arrive / à la fermeture) ;
- navigation rapide et fermeture coupent proprement timers + couches : aucune
  couche orpheline.

---

## 7. Chrome discret (OPT-IN) — `chrome`

| Option | Défaut | Rôle |
| --- | --- | --- |
| `icons` | `false` | `true` = ICÔNES SEULES (‹ › ✖) ; les libellés restent en `title`/`aria-label` |
| `autoHide` | `false` | masque le chrome après inactivité de la souris, le réaffiche au mouvement |
| `idleDelay` | `3000` | ms d'immobilité avant masquage (même curseur posé sur un icône) |
| `fadeDuration` | `300` | ms de la transition d'opacité (variable `--hl-chrome-fade`) |

```js
HolafLightbox.create({
    chrome: { icons: true, autoHide: true, idleDelay: 3000, fadeDuration: 300 },
    // par vue : views: { fullscreen: { chrome: { autoHide: true } } }
    // (chrome: false / true garde le sens 0.1.0 : construire ou non la barre)
});
```

- le conteneur reçoit `.holaf-lightbox-chrome-auto`, et
  `.holaf-lightbox-chrome-hidden` pendant le masquage : les transitions
  d'opacité sont en CSS (pas d'apparition brutale),
- **participation des contrôles hôtes** : tout bouton portant
  `.holaf-lightbox-nav` dans le conteneur est masqué/révélé avec le chrome
  (c'est le cas des boutons ⤓/★ du front et du futur bouton diaporama),
- réapparition au moindre `mousemove`/`mouseenter` (et `touchstart`) ;
  l'approche des bords est couverte par le simple mouvement de souris,
- `prefers-reduced-motion: reduce` → transitions désactivées (les masquages
  restent fonctionnels, sans animation).

---

## 8. Clic simple = plein écran

La brique ne gère pas le clic sur les vignettes : c'est l'hôte qui décide.
Pour « clic simple → plein écran » :

```js
// 1) Grille HolafGrid : activez activateOnClick et ouvrez en plein écran.
HolafGrid.create(gridEl, {
    activateOnClick: true,
    onActivate: (item, index, kind) => {
        if (kind === 'click') lightbox.openFullscreen(item);
    },
    // ...
});

// 2) Ou directement sur vos vignettes.
thumbEl.addEventListener('click', () => lightbox.openFullscreen(item));
```

`openFullscreen(item)` depuis idle ouvre DIRECTEMENT le plein écran (pas besoin
de passer par la vue zoom) ; depuis la vue zoom, il l'empile et `Échap`
restaure le zoom. Côté brique, aucune option supplémentaire n'est requise.

---

## 9. Recettes

### 9.1 Pack ComfyUI-AI-Helper (éditeur, garde dialogState)

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

### 9.2 Galerie web (sans édition)

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

## 10. Notes

- **Instanciable plusieurs fois** : aucun état de module hors le `<style>`
  partagé (retiré à la destruction de la dernière instance).
- **Restauration de la vue source** : ouvrir fullscreen depuis zoom empile la
  vue ; Échap/`back()` dépile et émet `resume` (la vue zoom, restée vivante,
  est simplement ré-affichée).
- **Zéro import croisé** : la source, le média et le viewport sont injectés.
- **0.2.0 — opt-in strict** : sans `slideshow`, sans `transition` et sans
  `chrome`, le DOM, le clavier et les événements sont ceux de la 0.1.0.
- **Limites connues** : pas de gestion tactile dédiée du diaporama/chrome
  (le tactile passe par les événements souris émulés ou `touchstart`) ; le
  crossfade suppose que le `container` reçu par `renderMedia` est bien la
  surface de la vue (ou une couche fournie par la brique) et que le média y est
  créé ; `prefers-reduced-motion` désactive les transitions CSS ;
  `duration: 0` sur un diaporama = pas d'avance automatique.
- **Non couvert par les tests unitaires** (jsdom) : rendu réel, rendu visuel du
  fondu (jsdom ne peint pas), pinch/touch (absent de HolafViewport 0.1.x), perf
  du préchargement réseau.
