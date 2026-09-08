# HolafFetch — wrapper HTTP maison

Brique **purement logique** : aucun DOM, aucun CSS. Un seul fichier
`holaf-fetch.js` à copier dans un projet. Il remplace les `apiFetch` maison
(AiKore, CaddyPanel, airunner, Kinoscribe, PEH, ComfyUI-AI-Helper…) avec un
comportement **blindé** et homogène : JSON vérifié avant parsing, erreurs
typées, timeout, retry, et une **authentification enfichable** configurée par
l'hôte.

**Version : 0.1.1**

---

## Inclusion

```html
<!-- Chargement global : window.HolafFetch devient disponible partout -->
<script type="module" src="vendor/holaf/holaf-fetch.js"></script>

<script>
    HolafFetch.get("/api/me").then((me) => console.log(me));
</script>
```

Ou en import ES Module :

```html
<script type="module">
    import { HolafFetch } from "./vendor/holaf/holaf-fetch.js";
    const data = await HolafFetch.get("/api/me");
</script>
```

Aucun CSS injecté, aucun élément créé : la brique ne touche pas au DOM
(seule exception : lecture de `document.cookie` pour l'auth `csrf`).

---

## Usage

### `HolafFetch.request(url, options)` → `Promise<data>`

```js
const data = await HolafFetch.request("/api/items", {
    method: "POST",
    body: { name: "Holaf" },        // objet → JSON.stringify + Content-Type auto
    headers: { "X-Host": "1" },      // en-têtes de l'hôte (fusionnés avec l'auth)
    auth: { type: "bearer", token: () => localStorage.getItem("jwt") },
    timeout: 30000,                  // ms ; 0 = aucun (défaut 30 s)
    retry: { attempts: 2, backoffMs: 300 },
    on: { status: (code) => console.log("statut", code) },
    raw: false,                      // true → renvoie la Response brute
    signal: abortController.signal,  // annulation externe
});
```

### Méthodes raccourcies

```js
HolafFetch.get(url, opts)     // GET — passe les opts SANS body
HolafFetch.post(url, opts)    // POST — sérialise { body } en JSON + Content-Type
HolafFetch.put(url, opts)
HolafFetch.patch(url, opts)
HolafFetch.delete(url, opts)
```

---

## Authentification ENFICHABLE (`opts.auth`)

Les auth divergent par projet (bearer, CSRF cookie, JWT, rien). La brique ne
se couple à **aucun serveur** : vous choisissez la stratégie, elle l'applique.
La fonction `token()` est rappelée à **chaque requête** (token frais).

### 1. Bearer (JWT / token)

```js
HolafFetch.get("/api/me", {
    auth: { type: "bearer", token: () => localStorage.getItem("jwt") },
});
// → en-tête : Authorization: Bearer <token>
```

### 2. CSRF cookie

```js
HolafFetch.post("/api/items", {
    body: { name: "x" },
    auth: { type: "csrf" },                    // lit le cookie "csrftoken"
    // auth: { type: "csrf", cookieName: "mycsrf" }  // cookie personnalisé
});
// → en-tête : X-CSRF-Token: <valeur du cookie>
```

### 3. Custom (en-têtes libres)

```js
HolafFetch.get("/api/x", {
    auth: { type: "custom", headers: () => ({ "X-API-Key": "secret" }) },
});
```

### Aucune auth

Ne passez simplement pas `opts.auth` (ou `auth: undefined`).

---

## Timeout & retry

- **Timeout** : `timeout` en ms (défaut 30 000, `0` = aucun). En cas de
  dépassement, la requête est abortée via `AbortController` et l'erreur a pour
  message `"timeout"`.
  Le timer couvre la **réponse initiale** — les en-têtes, plus la lecture du
  corps en mode JSON — et est **nettoyé au succès** (et non pas seulement en
  cas d'erreur). Conséquence : en `raw: true`, un flux long n'est **pas**
  aborté après réception des en-têtes ; le timeout ne couvre pas la durée de
  vie du stream (l'annulation explicite reste possible via `opts.signal`).
- **Retry** : `retry: { attempts, backoffMs }` — backoff **exponentiel** avec
  un petit jitter. Le retry ne se déclenche **que** sur erreur réseau, timeout
  ou statut **5xx** — jamais sur **4xx**.

```js
HolafFetch.get("/api/x", { retry: { attempts: 3, backoffMs: 300 } });
```

---

## `on: { status }`

Hook appelé avec le statut HTTP de chaque réponse (utile pour logger ou
déclencher un comportement à un code précis).

```js
HolafFetch.get("/api/x", {
    on: { status: (code) => { if (code === 401) redirectToLogin(); } },
});
```

---

## `raw: true`

Renvoie la **Response brute** au lieu de la parser (pour `blob()`, `stream()`,
téléchargement de fichiers…). Le JSON blindé et les erreurs typées sont alors
désactivés — c'est à vous de gérer la réponse.

Le **timeout** ne s'applique qu'à la réponse initiale (les en-têtes) : une
fois la Response rendue, le timer est désarmé et le flux peut vivre aussi
longtemps que nécessaire sans être aborté. Pour couper un flux en cours,
annulez via `opts.signal` (la combinaison signal + timeout est conservée) :

```js
const controller = new AbortController();
const res = await HolafFetch.get("/api/export", { raw: true, signal: controller.signal });
// … plus tard : controller.abort() coupe le téléchargement, même longtemps
// après les 30 s de timeout par défaut.
const blob = await res.blob();
```

---

## Gestion d'erreur

Toutes les erreurs HTTP/JSON sont des **`HolafFetchError`** (extends `Error`)
avec `{ status, data, body }` :

- `err.status` — statut HTTP (`0` = réseau/timeout) ;
- `err.data` — corps JSON parsé (si la réponse était du JSON) ;
- `err.body` — corps brut (texte) si la réponse n'était pas du JSON.

```js
try {
    const data = await HolafFetch.get("/api/repo");
} catch (err) {
    if (err.data && err.data.code === "GIT_AUTH_REQUIRED") {
        // réagir au code structuré
    } else if (err.message === "session expirée") {
        // page de login SSO détectée (authentik/outpost/sign-in)
    } else if (err.status >= 500) {
        // erreur serveur
    }
}
```

Cas particuliers :
- **Page HTML de login** (authentik / outpost / sign-in dans le corps) →
  message `"session expirée"` ;
- **Réponse non-JSON** (502 proxy…) → message `"réponse non-JSON (statut N)"` ;
- **`!res.ok` avec `body.error`** → `err.message` = `body.error` ;
- **`!res.ok` avec `body.detail`** (convention **FastAPI**) → `err.message` =
  `body.detail` ;
- **`error` ET `detail` présents** → `error` gagne (champ rempli
  intentionnellement par les projets Holaf) ; `detail` reste accessible via
  `err.data.detail` ;
- **`detail` non-string** (ex. tableau de validation FastAPI) → message par
  défaut (`"erreur serveur (statut N)"`), le corps complet restant dans
  `err.data` ;
- **Timeout** → message `"timeout"` ;
- **Erreur réseau** → message `"erreur réseau"`.

Dans tous les cas JSON, **`err.data` contient le corps complet** : le message
automatique n'est qu'un confort, rien n'est perdu.

---

## Procédure de sync

1. **Installer** dans un projet :
   ```bash
   ./scripts/holaf install fetch /chemin/vers/mon-projet
   ```
   → copie pinnée dans `mon-projet/vendor/holaf/holaf-fetch.js` + version notée
   dans `vendor/holaf/holaf-manifest.json`.
2. **Vérifier** : `./scripts/holaf check /chemin/vers/mon-projet`.
3. **Mettre à jour** : `./scripts/holaf upgrade fetch /chemin/vers/mon-projet`.
4. **Remonter une amélioration** : `./scripts/holaf adopt fetch /chemin/vers/mon-projet`
   (incrémente la version PATCH dans le manifest central **et** l'en-tête du
   fichier).
