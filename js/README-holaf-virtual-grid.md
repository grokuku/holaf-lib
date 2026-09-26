# HolafGrid — doc d'usage (brique holaf-lib v0.1.0)

Grille **virtualisée** en DOM, **générique** et **instanciable** : un seul
fichier (`holaf-virtual-grid.js`), zéro dépendance runtime, aucun import croisé.
Elle ne connaît que **la source de données** (collection injectée ou tableau),
**le renderer de cellule** injecté et une **clé métier** `getId(item)` — tout le
métier (endpoints, cache réseau, `path_canon`, ComfyUI…) reste chez l'hôte, via
les adaptateurs/slots.

Elle absorbe : layout (sizer + surface absolus, colonnes/gap/aspect/buffer),
rendu virtualisé (fenêtre visible + pool de cellules recyclées + squelettes),
resize (ancrage de rangée), sélection mono/multi (shift/ctrl), navigation
clavier de grille, scroll/alignement et refresh/pending.

---

## 1. Inclure la brique

**Option A — chargement global (scripts classiques) :**

```html
<script type="module" src="vendor/holaf/holaf-virtual-grid.js"></script>
<script>
    const grid = HolafGrid.create(document.getElementById("gallery"), { ... });
</script>
```

**Option B — import ES Module :**

```js
import { HolafGrid } from "./vendor/holaf/holaf-virtual-grid.js";
```

---

## 2. Utilisation minimale

```js
const grid = HolafGrid.create(containerEl, {
    itemSize: 150,                          // ou ['--hl-thumb-size', 150] ou () => state.thumbSize
    gap: "auto",                            // 'auto' = getComputedStyle(surface).gap, sinon nombre
    bufferFactor: 1.5,                      // buffer = viewport × facteur (au-dessus ET en dessous)
    aspect: 1,                              // itemHeight = itemWidth / aspect
    getId: (item) => item.path_canon,       // clé métier
    cell: {
        create(ctx) { /* … */ return el; }, // construit une cellule neuve (pool vide)
        update(el, item, ctx) { /* … */ },  // (re)lie une cellule à un item
        release(el) { /* … */ },            // nettoie avant mise au pool
    },
});

grid.setItems(items);          // tableau simple
// ou : grid.setSource(collection);   // { at/getAt(i), total, forEachLoaded(cb) }
```

`render()`, `relayout()`, le `ResizeObserver` et les listeners scroll/click
sont posés à la création : le scroll et le redimensionnement se re-rendent seuls.

---

## 3. Renderer de cellule (`cell`) + slots

Trois hooks, tous optionnels :

| Hook | Appelé | Rôle |
|------|--------|------|
| `create(ctx)` | quand le pool est vide | **Retourne** l'élément cellule (la brique ajoute `.holaf-grid-cell`, position/transform/taille). Sans `create`, la brique crée un `<div>` nu. |
| `update(el, item, ctx)` | quand l'élément est (re)lié à un item | Remplit le contenu, (re)câble les listeners spécifiques. Appelé aussi par `refresh(id)` avec `ctx.refresh = true`. |
| `release(el)` | avant retour au pool | Retire les enfants dynamiques, écouteurs, etc. |

`ctx` = `{ grid, item, index, id, refresh, columns, itemWidth, itemHeight, gap,
selected, active, pending, labels }`.

- **Checkbox de sélection** : si `selectable`, la brique synchronise
  automatiquement le **premier** `input[type="checkbox"]` de la cellule
  (`checked`) — pas de slot dédié requis.
- **Actions** (icône ✎/🎥/🎵, plein écran…) : posez `data-holaf-action="zoom"`
  sur l'élément ; un clic dessus appelle `onAction(actionId, item, index, e)`
  **sans** modifier la sélection.
- **Slots additionnels** (`slots: { checkbox, badge, overlay }`) : hooks
  optionnels reçoivent le même `ctx` si vous préférez déléguer la construction.

La brique pose aussi les classes **hooks** `.holaf-grid-cell--selected`,
`--active`, `--pending` (rendu visuel laissé à l'hôte) et `dataset.index`
(compat : sélecteurs `[data-index]`).

---

## 4. Options

| Option | Défaut | Rôle |
|--------|--------|------|
| `itemSize` | `150` | Nombre, `['--var', repli]` (lu via `getComputedStyle`), ou `() => taille` (dynamique). |
| `gap` | `'auto'` | `'auto'` = `getComputedStyle(surface).gap`, sinon nombre. |
| `bufferFactor` | `1.5` | Buffer de virtualisation (× hauteur de viewport). |
| `aspect` | `1` | `itemHeight = itemWidth / aspect` (1 = carré). |
| `getId(item)` | `item.id` puis `item.path_canon` | Clé métier. |
| `cell` | `{}` | `{ create, update, release }` (renderer injecté). |
| `slots` | `{}` | `{ checkbox, badge, overlay }` (hooks optionnels). |
| `selectable` | `true` | Active clic/dblclick de sélection. |
| `multi` | `true` | Autorise shift/ctrl. |
| `keyboard` | `true` | Installe un listener `keydown` sur le conteneur. |
| `activateOnClick` | `false` | Émet aussi `onActivate(..., 'click')`. |
| `poolSize` | `200` | Taille max du pool de cellules. |
| `onActivate(item, index, kind)` | — | `kind` = `'click'` \| `'dblclick'` \| `'activate'`. |
| `onSelectionChange(ids, items)` | — | Après chaque changement de sélection. |
| `onVisibleRange(start, end, ids)` | — | Fenêtre **strictement** visible (pour prioriser le chargement). |
| `onAction(actionId, item, index, event)` | — | Clic sur `[data-holaf-action]`. |
| `onNavigate(item, index)` | — | Déplacement clavier. |
| `canHandleKey(e)` | — | Garde-fou clavier (ex. `() => !dialogState.isOpen`). |
| `labels` | `{ grid, cell, selected }` | i18n (défauts neutres surchargés par l'hôte). |
| `css` | `{ injectStyles: true, nonce: null }` | Injection du `<style>` scopé + nonce CSP. |

---

## 5. API de l'instance

- `setSource(collection)` — adapte `{ at/getAt(i), total, forEachLoaded(cb) }`
  (compatible `holaf-collection`).
- `setItems(items)` / `setCount(n)` — source simple / creuse (trous → squelettes).
- `render(force?)` — re-rend la fenêtre ; `force:true` recalcule le layout et
  reconstruit toutes les cellules.
- `relayout(itemSize?)` — recalcule le layout (override de taille optionnel).
- `refresh(id)` — ré-applique `cell.update(el, item, ctx)` (avec `refresh:true`).
- `scrollToIndex(i, { align })` — `align` = `'start' | 'center' | 'end' | 'nearest'`.
- `ensureVisible(i)` — raccourci `align:'nearest'`.
- `getColumnCount()`.
- `selection` :
  - `ids()` · `items()` · `anchor()` · `setAnchor(index|id)`
  - `clear()` · `toggle(id)` · `set(ids, { silent })`
  - `handleKey(e)` → `true` si la touche a été consommée (←/→ ±1, ↑/↓
    ±colonnes, `Home`/`End`, `PageUp`/`PageDown` = une page, `Espace` = toggle,
    `Entrée` = activation). **Injectez-la dans VOTRE listener** pour garder vos
    garde-fous (`dialogState`…).
- `on(evt, cb)` / `off(evt, cb)` — événements `'selectionchange'`,
  `'visible'`, `'activate'`, `'action'`, `'navigate'`.
- `markPending(id, ms?)` — marque une cellule en attente (ex. 202), retiré
  après `ms`.
- `destroy()` — retire listeners + observer, vide les pools, retire la racine
  et (si injecté et dernière instance) le `<style>`.
- Propriétés DOM : `root`, `sizer`, `surface`. `VERSION` (statique).

---

## 6. CSS : injection / nonce / mode externe

La brique est **CSS-injectante** (patron modal/toast) :

```js
HolafGrid.getCss();                                  // chaîne CSS complète
HolafGrid.configure({ injectStyles: false });        // défaut global
HolafGrid.configure({ nonce: "abc" });               // nonce CSP global
HolafGrid.setStyleNonce("abc");                      // alias
// par instance :
HolafGrid.create(c, { css: { injectStyles: false, nonce: "abc" } });
```

Sans `injectStyles:false`, un unique `<style id="holaf-grid-style">` est
inséré dans `<head>` (partagé par toutes les instances ; retiré à la
destruction de la **dernière**). Le CSS est scopé sous `.holaf-grid-*` et pose
les variables `--hl-*` sur `.holaf-grid-root`, **jamais sur `:root`**.

---

## 7. Recette : galerie du pack (node ComfyUI) vs galerie web

**Galeries de vignettes, source creuse alignée sur des fenêtres :**

```js
const grid = HolafGrid.create(scrollEl, {
    itemSize: () => state.ui.thumbnail_size,
    gap: 'auto',
    getId: (img) => img.path_canon,
    onVisibleRange: (start, end, ids) => {
        thumbCache.onVisible(ids);          // priorisation backend
        collection.ensureRange(start, end); // comble les fenêtres manquantes
    },
    cell: {
        create(ctx) { /* placeholder + icône + checkbox */ return el; },
        update(el, item, ctx) { /* icône format, hover vidéo, vignette (cache/request) */ },
        release(el) { /* stop hover, cancel cache, retire img/error */ },
    },
    onSelectionChange(ids, items) { state.setSelection(ids, items); },
    onActivate(item, index, kind) { if (kind === 'dblclick') openZoom(item); },
    onAction(actionId, item, index) {
        if (actionId === 'fullscreen') openFullscreen(item);
        else openZoom(item);
    },
    canHandleKey: () => !dialogState.isOpen,
    labels: { t: (k) => i18n.t(k) },
});
```

**Galerie web (scroll infini, source `append`) :** identique, avec
`setSource(collectionInfini)`; l'hôte branche `selection.handleKey` sur le
listener clavier de la page (touches ←/→/↑/↓/Home/End/Page/Space/Entrée).

---

## 8. Notes

- **Instanciable plusieurs fois** : aucun état de module hors le `<style>`
  partagé ; chaque instance a son layout, son pool et sa sélection.
- **Source creuse** : `getAt(i)` peut renvoyer `null`/`undefined` (fenêtre non
  chargée) → la brique pose un **squelette** recyclé en attendant.
- **Clavier** : la brique n'installe un listener `keydown` sur le conteneur que
  si `keyboard` n'est pas `false` (le conteneur doit pouvoir recevoir le focus) ;
  pour un pilotage global (document), appelez `selection.handleKey(e)` depuis
  votre listener et conservez vos garde-fous.
- **Absent volontairement** : lightbox (`HolafLightbox`), volet d'informations
  (`HolafInfoPane`), chargement réseau des vignettes (`holaf-thumbcache`).
