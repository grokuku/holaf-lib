# HolafViewport — doc d'usage (brique holaf-lib v0.1.2)

Géométrie + interactions de viewport image, **sans rendu** : un seul fichier
(`holaf-viewport.js`), zéro dépendance, **zéro CSS injecté** (la brique ne
touche qu'au `transform` de l'élément content, jamais au style du conteneur).

Elle calcule le zoom / le pan / le fit d'une image et, en mode **content**,
applique le CSS transform à un élément fourni (ex. une `<img>`
object-fit:contain). En mode **headless** (ex. canvas), elle ne fait que la
géométrie : l'hôte dessine lui-même.

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-viewport.js"></script>
<script>
    const vp = HolafViewport.create(document.getElementById("viewer"), { ... });
</script>
```

**Option B — import ES Module :**

```js
import { HolafViewport } from "./vendor/holaf/holaf-viewport.js";
```

---

## 2. Mode content (la brique applique le transform)

Cas typique : une `<img>` avec `object-fit:contain` qui remplit son conteneur.
La brique applique `translate(tx,ty) scale(s)` (origin `0 0`) à l'img et gère
la transition (none pendant le drag, `transform .2s ease-out` au relâchement).

```js
const vp = HolafViewport.create(container, {
    content: img,            // l'élément à transformer
    imageWidth: 1024,
    imageHeight: 768,
    onChange: (vp) => { /* ex. mettre à jour un overlay */ },
});
```

Le « fit » correspond à `scale = 1` (object-fit:contain a déjà cadré l'image) :
`getFitScale()` renvoie `1`, `minZoom: 'fit'` interdit de dézoomer sous 1.

## 3. Mode headless (l'hôte dessine)

Pas de `content` : la brique ne fait que la géométrie. Le « fit » correspond à
`scale = containScale` (l'image tient dans le conteneur), centrée par tx/ty.

```js
const vp = HolafViewport.create(canvas, { imageWidth: 1024, imageHeight: 768 });
// à chaque frame / draw :
const { scale, tx, ty } = vp.getTransform();
ctx.setTransform(scale, 0, 0, scale, tx, ty); // dessin en espace image
```

`getFitScale()` renvoie `containScale` ; `minZoom: 'fit'` interdit de dézoomer
sous ce contain.

---

## 4. Recette : overlay aligné sur l'image

Pour positionner un overlay (cadre, points, annotations) exactement sur le
contenu image, utilisez `getImageRect()` (rect à l'écran, coords locales du
conteneur, transform-aware) et rafraîchissez à chaque changement de transform.
Plusieurs consommateurs peuvent s'abonner via `on(cb)` / `off(cb)` (en plus de
`opts.onChange`) :

```js
const vp = HolafViewport.create(container, {
    content: img,
    imageWidth: 1024,
    imageHeight: 768,
});
const reposition = () => {
    const r = vp.getImageRect();
    overlay.style.left = r.x + "px";
    overlay.style.top = r.y + "px";
    overlay.style.width = r.width + "px";
    overlay.style.height = r.height + "px";
};
vp.on(reposition); // multi-subscription
// ... vp.off(reposition) quand l'overlay est fermé (pas de fuite).
```

Pour convertir un point écran ↔ image : `screenToImage(clientX, clientY)` et
`imageToScreen(ix, iy)` (coords image naturelles ↔ px locaux au conteneur).

### 4bis. Followers : overlay qui suit l'image au pixel près (latence zéro)

Pour un overlay qui doit suivre l'image **exactement** (même transform, même
transition, même moment), positionnez-le UNE FOIS au rect de repos (échelle 1)
puis `addFollower(overlay)` : la brique lui applique le même transform inline
que le content à chaque changement (zoom/pan/drag), avec la même transition
(none pendant le drag, `.2s ease-out` après).

```js
const vp = HolafViewport.create(container, { content: img, imageWidth: 1024, imageHeight: 768 });
// Position fixe au rect de repos (échelle 1) — constant, ne dépend pas du zoom.
overlay.style.left = (img.offsetLeft || 0) + r.dx + "px";
overlay.style.top  = (img.offsetTop || 0) + r.dy + "px";
overlay.style.width  = r.width + "px";
overlay.style.height = r.height + "px";
overlay.style.transformOrigin = "0 0";
vp.addFollower(overlay); // suit l'img (même transform, même transition)
// ... vp.removeFollower(overlay) à la fermeture (l'élément reste en place).
```

`addFollower` protège contre les non-éléments et les doublons (Set) ; il
applique immédiatement le transform courant. `destroy()` retire les refs
followers sans toucher aux éléments (ils restent dans leur état).

---

## 5. Options

| Option           | Défaut   | Rôle |
|------------------|----------|------|
| `content`        | `null`   | Élément à transformer (mode content). Absent → headless. |
| `imageWidth`/`imageHeight` | — | Taille naturelle de l'image (ou `setImageSize()` ensuite). |
| `minZoom`        | `'fit'`  | `'fit'` = ne pas dézoomer sous le fit, ou nombre. |
| `maxZoom`        | `30`     | Zoom max. |
| `zoomFactor`     | `1.1`    | Facteur de zoom (molette / dblclick). |
| `panClamp`       | `true`   | Borde le pan (contenu centré si plus petit que la vue). |
| `doubleClickZoom`| `true`   | dblclick → zoom ×zoomFactor² autour du curseur. |
| `wheel`          | `true`   | Zoom molette sur le conteneur. |
| `drag`           | `true`   | Pan par glisser. |
| `dragButton`     | `0`      | Bouton souris du drag. |
| `dragTarget`     | content sinon container | Élément qui reçoit le mousedown. |
| `onChange`       | —        | `onChange(instance)` après chaque changement de transform. |
| `on(cb)`/`off(cb)` | —      | Multi-subscription : cb appelé avec l'instance après chaque changement de transform (en plus de `onChange`). |

## 6. API de l'instance

`setImageSize(w,h)` (+ refit) · `fit()` · `getFitScale()` · `getScale()` ·
`getTransform()` → `{scale, tx, ty}` · `zoomBy(factor, clientX?, clientY?)` ·
`setScale(s, clientX?, clientY?)` · `panBy(dx,dy)` (px locaux) ·
`screenToImage(clientX, clientY)` → `{x,y}` (px image naturels) ·
`imageToScreen(ix, iy)` → `{x,y}` (px locaux conteneur) ·
`getImageRect()` → `{x,y,width,height}` (rect à l'écran du contenu image) ·
`on(cb)`/`off(cb)` (multi-subscription) ·
`addFollower(el)`/`removeFollower(el)` (overlay qui reçoit le même transform
que le content) ·
`reset()` · `destroy()` · `refit()` (appelé sur resize via ResizeObserver si
dispo : refit si l'utilisateur était au fit, sinon re-clamp le pan) · `VERSION`.

## 7. Notes

- **Zéro CSS injecté** : la brique ne pose aucun style sur le conteneur ; elle
  ne modifie que `transform` / `transformOrigin` / `transition` de l'élément
  `content` (restaurés à `destroy()`).
- **Touch/pinch** : absent en v0.1 (lacune commune des 6 implémentations
  remplacées) — prévu pour une version ultérieure.
- **Modèle mathématique** : documenté dans l'en-tête de `holaf-viewport.js`
  (mapping image→écran, zoom-to-cursor, clamps, cohérence roundtrip).
