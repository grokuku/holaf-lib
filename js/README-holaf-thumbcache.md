# HolafThumbCache — doc d'usage (brique holaf-lib v0.1.0)

Cache + ordonnanceur de vignettes, **PUR** (sans DOM, sans CSS, sans rendu) :
un seul fichier (`holaf-thumbcache.js`), zéro dépendance, **zéro style injecté**.

La brique modélise « quelles vignettes sont déjà chargées », « lesquelles sont
en cours », « dans quel ordre les charger », et « quoi faire quand le serveur
répond 202 (génération en cours) ou ne répond pas (timeout) ». Elle ne rend
RIEN : l'hôte fournit `load(item)` et dessine lui-même à partir du handle
renvoyé par `request()` / `prefetch()`, ou lit le cache via `peek(id)`.

Principe : **cœur générique + adaptateurs**. Le même cœur sert la galerie du
node (pack ComfyUI-AI-Helper : `strategy:'blob'`, POST + Bearer) et la galerie
web (backend AI-Helper : `strategy:'url'`, GET + cookie, cacheable navigateur).

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-thumbcache.js"></script>
<script>
    const cache = HolafThumbCache.create({ load: (item) => fetch(item.url).then(r => r.blob()) });
</script>
```

**Option B — import ES Module :**

```js
import { HolafThumbCache } from "./vendor/holaf/holaf-thumbcache.js";
```

---

## 2. Options

| Option | Défaut | Rôle |
|--------|--------|------|
| `capacity` | `2000` | Entrées max ; au-delà, éviction LRU (le plus ancien). |
| `concurrency` | `6` | Chargements simultanés max (le reste est mis en file). |
| `strategy` | `'blob'` | `'blob'` \| `'url'` \| `{ get(id)?, put(id,value), release(handle) }` (voir §3). |
| `getId(item)` | `item.id` | Clé métier (dédup, cache, invalidation). |
| `load(item, { signal, priority })` | — | Chargeur, **requis**. Peut renvoyer une `Response`/`Blob`/string, ou une `Promise` de l'un des trois. |
| `release(handle)` | — | Surcharge la libération de la stratégie (prioritaire). |
| `retry` | `{ max:4, delayMs:3000 }` | Retries d'un **timeout** (transient). |
| `timeoutMs` | `30000` | Timeout par tentative (`0` = aucun). |
| `pendingMax` | `Infinity` | Borne les retries « pending » (202). |
| `onPending(item, retryAfterMs)` | — | Réponse 202 : génération serveur en cours. |
| `onError(item, error)` | — | Échec terminal (hors abort). |
| `onPrioritize(ids)` | — | Reçoit le lot d'ids visibles (cf. `onVisible`). |
| `visibleDebounceMs` | `300` | Débounce de `onVisible()`. |
| `visibleFlushThreshold` | `1000` | Flush anticipé du lot visible au-delà. |

### Contrat `load`

```js
load(item, { signal, priority }) -> Response | Blob | string | Promise<…>
```

- `signal` : `AbortSignal` **interne à la tentative** — annulé par la brique au
  timeout. À forwarder au `fetch` sous-jacent.
- `priority` : priorité numérique passée à `request()` (`PRIORITY_HIGH` pour le
  visible, `PRIORITY_LOW` pour le prefetch). L'adaptateur la traduit si son
  client HTTP attend autre chose (ex. `'high'`/`'low'`).
- Résoudre une `Response` de statut **202** déclenche le protocole « pending »
  (voir §5). Une `Response` ≥ 400 (ou 0) devient une erreur.

---

## 3. Stratégies

| Stratégie | Valeur chargée | Handle | Libération |
|-----------|----------------|--------|------------|
| `'blob'` | Blob | `URL.createObjectURL(blob)` | `URL.revokeObjectURL(handle)` à l'éviction / `clear()` / `destroy()` |
| `'url'` | string | la string **telle quelle** | **aucune** (le navigateur cache l'URL) — zéro requête faite par la brique |
| objet | quelconque | `put(id,value)` | `release(handle)` |

- En `'blob'` la brique **révoque toujours** : à l'éviction LRU, au remplacement
  d'une clé, à `clear()`/`destroy()`.
- En `'url'` la brique **ne révoque jamais rien** et n'appelle pas `fetch` : le
  `load` renvoie directement l'URL (cache HTTP du navigateur).
- Une stratégie objet `{ get, put, release }` permet un store externe : `get(id)`
  (optionnel) est consulté comme source de hit **avant** tout chargement.

---

## 4. Méthodes de l'instance

| Méthode | Rôle |
|---------|------|
| `request(item, priority?)` | Renvoie une `Promise<handle>`. Hit cache → résout au microtask suivant ; en vol → **même promesse** (dédup) ; sinon mis en file par priorité (défaut `PRIORITY_HIGH`). |
| `prefetch(items)` | Précharge une liste en **priorité basse** (dans le cache, sans hôte). Ignore les hits/en-vol. Ne rejette jamais (`allSettled`). |
| `has(id)` | Vraie si en cache (sans toucher la récence). |
| `peek(id)` | Handle caché ou `null` (sans toucher la récence). |
| `touch(id)` | Réinsère `id` en tête de récence (sans charger) ; renvoie le handle ou `null`. |
| `isLoading(id)` | Vraie si une requête suit cet id (file, vol ou attente de retry). |
| `isPending(id)` | Vraie si l'id attend un retry « pending » (202). |
| `onVisible(ids)` | Déclare des vignettes visibles → `onPrioritize(lot)` débouncé (flush immédiat au-delà du seuil). |
| `invalidate(id)` | Annule le chargement en cours et retire la valeur du cache ; le prochain `request()` recharge. |
| `cancel(id)` | Stoppe un retry « pending » SANS interrompre un chargement en vol (placeholder sorti de vue). |
| `abort(ids?)` | Annule les chargements en vol / en file / retries planifiés (tous, ou ceux listés). Le **cache n'est pas vidé**. |
| `clear()` | Annule tout + libère tous les handles + vide la file et les visibles. L'instance reste utilisable. |
| `destroy()` | `clear()` + retire les listeners + rend l'instance inutilisable. |
| `setConcurrency(n)` | Change la borne de concurrence (ex. outil de benchmark) et relance la file. |
| `stats()` | `{ size, capacity, active, queued, pending, hits, misses, errors, pendingCount, hitsRatio, strategy, concurrency }`. |
| `on(evt, cb)` → `unsubscribe` · `off(evt, cb)` | Événements. |
| `capacity` · `size` · `concurrency` · `strategyName` · `version` | Accesseurs. |
| `PRIORITY_LOW` · `PRIORITY_HIGH` | Constantes statiques (0 / 1). |

---

## 5. Protocole 202 + Retry-After (« pending »)

Quand `load` résout une `Response` de statut **202** (le serveur génère la
vignette inline), la brique :

1. émet `'pending'` et appelle `onPending(item, retryAfterMs)` ;
2. **re-planifie** un chargement après `Retry-After` (défaut 2 s) ;
3. laisse la `Promise` de `request()` **en attente** jusque-là → l'hôte garde
   un placeholder (au lieu d'une image cassée) puis reçoit le handle au premier
   essai réussi.

Les retries « pending » sont sans limite par défaut (la génération serveur est
bornée et finit toujours par produire, ou tombe en timeout) ; `pendingMax` les
borne si besoin.

## 6. Timeout + retries bornés

Chaque tentative est bornée par `timeoutMs`. Un **timeout** est réputé
transient : la brique retente jusqu'à `retry.max` fois espacées de `retry.delayMs`,
puis rejette une erreur `{ name:'TimeoutError', timedOut:true }` (et émet
`'error'`). Un **abort** (`abort()`/`invalidate()`/`destroy()`) rejette
immédiatement une `AbortError`, **sans retry**.

---

## 7. Événements

| Événement | Charge utile |
|-----------|--------------|
| `'ready'` | `{ id, item, handle }` — chargée + cachée. |
| `'pending'` | `{ id, item, retryAfterMs }` — réponse 202, retry planifié. |
| `'error'` | `{ id, item, error }` — échec terminal (hors abort). |

```js
const off = cache.on("pending", ({ id }) => markPending(id));
cache.on("error", ({ error }) => console.warn(error));
// ... off();
```

---

## 8. Recettes

### 8.1 Pack (galerie du node) — `strategy:'blob'`, POST + Bearer, 202

```js
const cache = HolafThumbCache.create({
    capacity: 2000,
    concurrency: 6,
    strategy: "blob",
    getId: (img) => img.path_canon,
    load: (img, { signal, priority }) => HolafFetch.get(buildThumbUrl(img), {
        raw: true, signal, timeout: 0,
        priority: priority >= 1 ? "high" : "low",
    }),
    retry: { max: 4, delayMs: 3000 },
    timeoutMs: 30000,
    onPending: (img) => setPlaceholderPending(img.path_canon),
    onPrioritize: (paths) =>
        HolafFetch.post("/holaf/images/prioritize-thumbnails", { body: { paths_canon: paths } }).catch(() => {}),
});

// vignettes visibles :
cache.request(img, HolafThumbCache.PRIORITY_HIGH).then(renderThumb).catch(onFail);
// préchargement hors viewport :
cache.prefetch(imagesAhead);
// priorités backend (débouncé) :
cache.onVisible(visiblePathCanons);
```

### 8.2 Web (galerie AI-Helper) — `strategy:'url'`, GET + cookie

```js
const cache = HolafThumbCache.create({
    capacity: 2000,
    concurrency: 6,
    strategy: "url",
    getId: (m) => m.id,
    load: (m) => `/api/media/${m.id}/thumb`,   // URL directe, cacheable navigateur
    onPrioritize: (ids) =>
        fetch("/api/media/prioritize", { method: "POST", body: JSON.stringify({ ids }) }),
});
cache.request(item).then((url) => { img.src = url; });   // aucun revoke
```

---

## 9. Notes

- **Zéro DOM, zéro CSS, zéro dépendance** : testable en Node pur (stubber
  `URL.createObjectURL`/`revokeObjectURL`).
- **Pas d'état visuel injecté** : l'état « pending »/« loading »/« error » est
  exposé via `isPending(id)`/`isPending` + les événements/`onPending`, à charge
  de l'hôte de le refléter dans son DOM.
- **Concurrence et dédup sont globales** à l'instance : un seul chargement par
  id, quel que soit le nombre d'appelants.
- **Ordre de service** : priorité décroissante, puis FIFO.
- `PRIORITY_LOW` = 0, `PRIORITY_HIGH` = 1.
