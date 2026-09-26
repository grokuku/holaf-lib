# HolafCollection — doc d'usage (brique holaf-lib v0.1.0)

Cœur de **données pur** (sans DOM, sans CSS) pour une liste paginée
virtualisée : un seul fichier (`holaf-collection.js`), zéro dépendance.

La brique modélise **quels items sont chargés**, **quelles pages restent à
demander**, et **comment appliquer un delta (ajout en tête / suppression) sans
invalider les fenêtres déjà chargées**. Elle ne fait aucun rendu : l'hôte
fournit `fetchPage` et lit le modèle (`at`, `has`, `ids`, `forEachLoaded`).

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-collection.js"></script>
<script>
    const col = HolafCollection.create({ pageSize: 60, getId: (m) => m.id, ... });
</script>
```

**Option B — import ES Module :**

```js
import { HolafCollection } from "./vendor/holaf/holaf-collection.js";
```

---

## 2. Principe : cœur générique + adaptateur

La brique ne connaît **rien** de votre backend. Vous lui donnez :

- `getId(item)` — la clé métier (ex. `path_canon` côté pack, `id` côté web) ;
- `sortKey(item)` — la clé de tri DESC pour `insertTop` (ex. `mtime`, `created_at`) ;
- `fetchPage({ offset, limit, page, filters, signal })` — le chargeur de page.

Le modèle maintient un **tableau creux** : `length` = nombre de cases allouées,
`total` = nombre d'items côté source. Une case `undefined` est un trou à
demander à la volée.

```js
const col = HolafCollection.create({
    pageSize: 60,                        // taille de fenêtre
    mode: "window",                      // 'window' (offset/pages) | 'append' (scroll infini)
    getId: (m) => m.id,
    sortKey: (m) => m.created_at,
    fetchPage: async ({ offset, limit, page, filters, signal }) => {
        const res = await fetch(`/api/media?page=${page + 1}&limit=${limit}`, { signal });
        const data = await res.json();   // { items, total, page, limit }
        return { items: data.items, total: data.total };
    },
});
```

---

## 3. Modes

| Mode       | Usage | Comportement |
|------------|-------|--------------|
| `window` (défaut) | offsets/pages, accès aléatoire (pack) | `missingStarts` peut combler un trou en arrière (n'importe quelle fenêtre alignée). |
| `append`   | scroll infini séquentiel (web) | On n'ajoute que **vers l'avant** : `missingStarts` ne remonte jamais sous la frontière déjà chargée. |

Dans les deux modes une « fenêtre » commence à un offset aligné sur `pageSize`
(0, pageSize, 2·pageSize, …).

---

## 4. Options

| Option        | Défaut          | Rôle |
|---------------|-----------------|------|
| `pageSize`    | `200`           | Taille de fenêtre (le pack utilise 500, le web 60). |
| `mode`        | `'window'`      | `'window'` ou `'append'`. |
| `getId(item)` | `item.id`       | Clé métier (dédup, remove). |
| `sortKey(item)` | `item.sortKey` | Clé de tri DESC pour `insertTop` (plus récent = plus grand). |
| `fetchPage`   | `null`          | Chargeur de page (voir contrat). Absent → l'hôte charge manuellement. |
| `fetchDelta`  | `null`          | Chargeur optionnel de delta `({ since }) -> { items, removedIds, total }` pour `refresh()`. |
| `filters`     | `null`          | Transmis tel quel à `fetchPage`. |
| `since`       | `null`          | Curseur initial pour `refresh()`. |
| `total`       | `0`             | Total initial connu (sinon renseigné par `fetchPage`). |

### Contrat `fetchPage`

```js
fetchPage({ offset, limit, page, filters, signal }) -> Promise<{ items, total }>
```

- `offset` : offset de la fenêtre ; `limit` : `pageSize` ;
- `page` : `Math.floor(offset / pageSize)` (0-indexé) — l'adaptateur peut faire `page + 1` s'il attend du 1-indexé ;
- `signal` : `AbortSignal`, annulé à `reset()` / ré-ancrage (`reconfigure` les fetch en vol).

---

## 5. Méthodes de l'instance

| Méthode | Rôle |
|---------|------|
| `at(i)` / `has(i)` | item à l'index / case résolue ? |
| `ids(start?, end?)` | ids résolus dans `[start, end[`. |
| `forEachLoaded(cb)` | parcourt les items résolus (fb(window) ordre croissant), `cb(item, index)`. |
| `windowStart(i)` | offset aligné de la fenêtre contenant `i`. |
| `isWindowLoaded(s)` / `isWindowLoading(s)` / `getLoadingPromise(s)` | état du cache de fenêtres. |
| `registerLoading(s, controller, promise)` / `unregisterLoading(s)` | cache de fenêtres manuel (hôte qui fetch lui-même). |
| `setWindow(s, items)` | écrit `items` à partir de `s` et marque la fenêtre chargée. |
| `missingStarts(start, end)` | offsets de fenêtres à demander (ni chargées ni en vol). |
| `ensureRange(start, end)` | garantit que les fenêtres couvrant la plage sont chargées. |
| `ensureIndex(i)` | garantit la fenêtre contenant `i` (résout l'item). |
| `insertTop(items)` | préfixe N items + ré-ancrage des fenêtres ; renvoie le nombre inséré (doublons ignorés). |
| `removeByIds(ids)` | retire + ré-ancre ; renvoie le nombre retiré ou `false` si irréconciliable. |
| `applyDelta(delta)` | `{items, removedIds}` → `{mode:'patched'}` ou `{mode:'full-reload', reason}`. |
| `refresh()` | appelle `fetchDelta` puis `applyDelta` (sans `fetchDelta` → `{mode:'skipped'}`). |
| `resetWindowCache()` | vide le cache de fenêtres **sans toucher aux données**. |
| `reset()` | réinitialise données + caches + fetch en vol. |
| `setFilters(f)` | change `filters` et `reset()`. |
| `bindState({images, totalCount})` | adopte un store externe (tableau utilisé **par référence**). |
| `on(evt, cb)` → `unsubscribe` | abonnement aux événements. |
| `pageSize` · `mode` · `total` · `length` · `version` | accesseurs. |

---

## 6. Événements

| Événement | Charge utile |
|-----------|--------------|
| `'load'`  | `{ start, count }` — fenêtre résolue. |
| `'patch'` | `{ mode, inserted, removed }` — delta appliqué en place. |
| `'error'` | `{ start, error }` — `fetchPage` a échoué (hors annulation). |
| `'total'` | `number` — le total a changé. |

```js
const off = col.on("load", ({ start, count }) => render(start, count));
col.on("error", ({ error }) => console.warn(error));
// ... off(); // se désabonner
```

---

## 7. Recettes

### 7.1 Pack — mode `window`, PAGE_SIZE 500, réconciliation en place

```js
const col = HolafCollection.create({
    pageSize: 500,
    mode: "window",
    getId: (img) => img.path_canon,
    sortKey: (img) => img.mtime,
    // pas de fetchPage ici : l'hôte charge lui-même et appelle setWindow().
});

// fenêtre visible chargée par l'hôte :
col.setWindow(0, imagesFromBackend);
col.forEachLoaded((img, i) => renderThumb(img, i));

// delta incrémental (poll) : ajout en tête / suppression, SANS tout recharger.
const res = col.applyDelta({ items: newImages, removedIds: removedPaths });
if (res.mode === "full-reload") await loadFilteredImages();
```

### 7.2 Web — mode `append`, scroll infini

```js
const col = HolafCollection.create({
    pageSize: 60,
    mode: "append",
    getId: (m) => m.id,
    sortKey: (m) => m.created_at,
    fetchPage: ({ page, limit, signal }) =>
        fetch(`/api/media?page=${page + 1}&limit=${limit}`, { signal }).then((r) => r.json()),
});

col.on("load", () => render());
col.on("error", (e) => console.warn(e));

await col.ensureRange(0, 59);          // première page
// au scroll :
await col.ensureRange(col.length, col.length + 59);  // page suivante (avant seulement)
```

### 7.3 Seuil de suppression de masse

`applyDelta` renvoie `{ mode: "full-reload", reason: "mass-removal" }` dès que
le delta contient **≥ `MASS_REMOVAL_THRESHOLD`** (100) suppressions — signature
d'un « vider la corbeille ». Un retrait d'id **hors mémoire** renvoie
`{ mode: "full-reload", reason: "unreconcilable-removal" }` : l'index ne peut
pas être recalculé, l'hôte doit recharger.

---

## 8. Notes

- **Zéro DOM, zéro CSS, zéro dépendance** : testable en Node pur.
- **Mutations en place** : `insertTop` / `removeByIds` modifient le tableau
  `images` **par référence** (les consommateurs gardent leur référence).
- **`length` ≠ `total`** : `length` est la taille du tableau creux (cases
  allouées), `total` le nombre d'items côté source.
- **Annulation** : `reset()` et le ré-ancrage annulent les `fetchPage` en vol
  via leur `AbortSignal` ; une page annulée n'émet pas `'error'`.
- **`MASS_REMOVAL_THRESHOLD`** est exposé statiquement
  (`HolafCollection.MASS_REMOVAL_THRESHOLD`).
