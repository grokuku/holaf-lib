# holaf-lib — briques maison (JS & Python), versionnées par brique

## C'est quoi, ce kit ?

**holaf-lib** (anciennement *holaf-ui*) est une petite boîte à outils de
briques écrites à la maison (JavaScript et, depuis la brique `notify`,
Python). Chaque **brique** = **un seul fichier** (`.js` ou `.py`), autonome,
sans dépendance à installer : on le copie dans un projet, et ça marche.

L'idée : quand on retrouve les mêmes besoins dans plusieurs projets (afficher
une modale, une fenêtre déplaçable, un toast…), au lieu de copier-coller du
code au cas par cas, chaque besoin devient une brique propre, **versionnée
par brique**, documentée ici, puis **copiée (pinnée)** dans les projets qui en
ont besoin.

Chaque brique est accompagnée de sa propre documentation détaillée dans le
dossier de son rayon (ex. `js/README-holaf-modal.md`,
`python/README-holaf-notify.md`).

## Versionnement PAR BRIQUE (copie pinnée + manifest)

On ne « synchronise » pas en bloc avec un symlink. Chaque brique a **sa propre
version** (ex. `modal 0.2.1`). Quand un projet prend une brique, il en reçoit
une **copie pinnée** (figée) dans `vendor/holaf/`, et sa version est notée dans
le **manifest local** du projet : `vendor/holaf/holaf-manifest.json`.

Le dépôt central a son **manifest central** `manifest.json` qui liste chaque
brique avec sa version et son fichier :

```json
{
  "name": "holaf-lib",
  "bricks": {
    "modal":   { "version": "0.5.0", "file": "js/holaf-modal.js",   "category": "component",  "description": "…" },
    "toast":   { "version": "0.6.0", "file": "js/holaf-toast.js",  "category": "component",  "description": "…" },
    "fetch":   { "version": "0.2.0", "file": "js/holaf-fetch.js",  "category": "component",  "description": "…" },
    "viewport": { "version": "0.1.3", "file": "js/holaf-viewport.js", "category": "component", "description": "…" },
    "tokens":  { "version": "0.2.0", "file": "js/holaf-tokens.js", "category": "foundation", "description": "…" }
  }
}
```

Le champ `category` documente le **rôle** d'une brique : `component` (comportement/UI,
la majorité) ou `foundation` (pose des variables globales — seul `tokens`, voir
« Brique fondation : tokens »).

Grâce à ça, le script `holaf` sait :
- quelle version une brique **devrait** avoir (manifest central),
- quelle version un projet **a réellement** (manifest local du projet),
- si un projet est à jour (`check`) ou en retard, et permet de **mettre à jour**
  (`upgrade`) ou de **remonter une amélioration** (`adopt`).

## Les briques

| Brique     | Fichier             | Version | Statut     | Rôle                                                              |
|------------|---------------------|---------|------------|-------------------------------------------------------------------|
| modal      | `js/holaf-modal.js` | 0.5.0   | ✅ prête   | Modales, alertes, confirmations, saisies, écrans d'attente (busy), **10 thèmes `<famille>-<mode>`** (miroirs de `HolafTokens`) + 4 alias historiques, fenêtre (drag/resize/persistance/zoom), **modale à contenu libre** (`open` + `actions`, bouton submit hors-form via `form=`), **mode CSS externe** (`getCss()` + `injectStyles`) |
| toast      | `js/holaf-toast.js` | 0.6.0   | ✅ prête   | Notifications flottantes empilées (4 types à fond teinté avec fallback, position configurable, 6 positions animées, empilement adapté, **10 thèmes `<famille>-<mode>`** cohérents avec `HolafTokens`, pause au survol, actions, aria-live, id métier, progression manuelle), **mode CSS externe** (`getCss()` + `injectStyles`) |
| fetch      | `js/holaf-fetch.js` | 0.2.0   | ✅ prête   | Wrapper HTTP maison (JSON blindé, erreurs typées, timeout, retry, auth enfichable bearer/CSRF/custom, options natives, configure) |
| viewport   | `js/holaf-viewport.js` | 0.1.3 | ✅ prête | Géométrie + interactions de viewport image (zoom/pan/fit, zoom-to-cursor, clamps, mode content & headless, SANS rendu ni CSS) |
| notify     | `python/holaf-notify.py` | 0.1.0 | ✅ prête | 1ʳᵉ brique **Python** (rayon `python/`, stdlib pur) : notifie OpenClaw via `POST /hooks/wake` (Bearer `hooks.token`), payload `{text, mode}`, résumé clé=valeur, retry léger (3×, 1s/2s/4s, réseau/5xx) |
| color      | `js/holaf-color.js`  | 0.1.1 | ✅ prête | Utilitaires couleur en PUR JS, SANS DOM ni CSS (hex↔rgb↔hsl, mix, lighten/darken, contraste WCAG, `generateTheme`, `generateFamily`) |
| tokens     | `js/holaf-tokens.js` | 0.2.0 | ✅ prête | **Brique FONDATION** : la SEULE à poser les vars `--holaf-*` sur `:root` (thème global, opt-in explicite). **Catalogue à 2 axes** : 5 familles × clair/sombre (10 presets `<famille>-<mode>`) + 4 alias historiques — voir section dédiée |
| ambient    | `js/holaf-ambient.js` | 0.3.0 | ✅ prête | Fonds animés canvas (waves/particles/aurora) : rubans liquides, halos en profondeur, nappes transparentes ; `density` = curseur d'intensité, `blur` global, `elementCount` exposé, animation dt (indépendante du framerate), options perf **`scale`** (résolution du buffer interne + upscale compositeur) et **`fps`** (plafond de framerate), brique sans style (l'hôte fournit le canvas) |
| icons      | `js/holaf-icons.js` | 0.1.0 | ✅ prête | 36 icônes SVG en trait (style Feather, MIT), zéro CSS, `stroke=currentColor` |

> 9 briques au total : modal · toast · fetch · viewport · notify · color · tokens · ambient · icons

## CSP strict (nonce) — briques à injection de style

Certains hôtes servent leurs pages avec une CSP stricte (`style-src 'self'`,
**sans** `'unsafe-inline'`, comme `Yuki`). Dans ce cas, un `<style>` injecté
par JavaScript est bloqué s'il ne porte pas le **nonce** de la page. Les deux
briques qui injectent réellement du CSS — **modal** et **toast** — acceptent
donc un nonce **optionnel** :

```js
// 1) Réglage GLOBAL (une fois à l'init) — une brique à la fois :
HolafModal.setStyleNonce(monNonce);
HolafToast.setStyleNonce(monNonce);
HolafModal.setStyleNonce(null); // réinitialiser → comportement par défaut

// 2) Surcharge PAR APPEL (prime sur le global) :
HolafModal.open({ title: "…" }, { nonce: monNonce });
HolafToast.show({ message: "…" }, { nonce: monNonce });
// …ou via le champ `nonce` des options (helpers inclus) :
HolafModal.alert("…", "…", { nonce: monNonce });
HolafToast.success("…", { nonce: monNonce });
```

- **Optionnel et rétrocompatible** : sans nonce configuré, le `<style>` est
  inséré exactement comme avant — même `id`, même CSS, même point d'insertion,
  **aucun attribut ajouté**. L'API est purement additive.
- Le nonce est appliqué à l'élément **avant** son insertion dans le `<head>`.
- Le nonce par appel prime sur le réglage global ; `null`/`""` = « aucun
  nonce » explicite.
- Seules **modal** et **toast** injectent des règles CSS via un `<style>`.
  `fetch`, `viewport`, `color`, `icons` et `ambient` n'injectent aucun style
  (viewport ne fait que poser un `transform` sur l'élément de l'hôte).
  `tokens` insère un `<style>` **ne contenant qu'un commentaire** (aucune
  règle) et pose ses variables via CSSOM (`setProperty`), non régi par
  `style-src` — donc non concerné par le nonce.

## Mode CSS Externe — alternative au nonce (CSP `style-src 'self'`)

Plutôt que de faire injecter le CSS par JavaScript (et devoir fournir un
nonce géré par le backend), on peut **servir le CSS comme fichier `.css`
statique** et demander à la brique de ne **pas** injecter son `<style>`. C'est
la solution la plus propre pour un hôte à CSP strict comme `Yuki`
(`style-src 'self'`).

Les deux briques CSS-injectantes — **modal** et **toast** — exposent :

1. **`getCss()`** : renvoie la chaîne CSS **complète** de la brique (identique
   au contenu du `<style>` qu'elle injecte). Écrivez-la dans un fichier `.css`
   servi par votre projet :

   ```js
   // (dev/build) publier le CSS de chaque brique comme fichier statique :
   HolafModal.getCss();   // → chaîne CSS complète → vendor/holaf/holaf-modal.css
   HolafToast.getCss();   // → chaîne CSS complète → vendor/holaf/holaf-toast.css
   ```

   ```html
   <link rel="stylesheet" href="/vendor/holaf/holaf-modal.css">
   <link rel="stylesheet" href="/vendor/holaf/holaf-toast.css">
   ```

2. **`injectStyles`** (boolean, défaut `true`) : à `false`, la brique ne crée
   ni n'insère la balise `<style>` — elle considère que le CSS est déjà chargé
   via le fichier externe.

   ```js
   // Global (une fois à l'init) — une brique à la fois :
   HolafModal.configure({ injectStyles: false });
   HolafToast.configure({ injectStyles: false });

   // …ou par appel (prime sur le réglage global) :
   HolafModal.open({ title: "…" }, { injectStyles: false });
   HolafModal.open({ title: "…", injectStyles: false }); // champ des options
   HolafToast.show({ message: "…", injectStyles: false });
   ```

- **Priorité** : `injectStyles` par appel (2ᵉ argument, puis champ `opts`) >
  `configure({ injectStyles })` global > défaut `true`. Seul `false` désactive
  l'injection.
- **Rétrocompatibilité totale** : sans rien configurer, le comportement
  historique est strictement inchangé (injection du `<style>` comme avant).
- **Avantage majeur** : compatibilité **totale** avec `style-src 'self'`
  **sans aucun nonce** — plus besoin de gérer/passer un nonce côté backend. Le
  mode nonce (section précédente) reste disponible si l'on préfère l'injection
  JS.

> Les helpers (`HolafModal.alert/confirm/prompt/busy`,
> `HolafToast.success/error/…`) acceptent aussi `injectStyles` dans leurs
> options et le transmettent à l'ouverture.

## Nouveautés v0.6

### HolafModal 0.4.2 → 0.5.0 & HolafToast 0.5.2 → 0.6.0 — catalogue de thèmes à 2 axes (famille × mode)

Les deux briques de **feedback** alignent leur registre de thèmes sur le
catalogue de `HolafTokens` : **10 combinaisons `<famille>-<mode>`** (5 familles
`indigo`, `midnight`, `slate`, `emerald`, `amber` × 2 modes `light`/`dark`) :
`indigo-light`, `indigo-dark`, `midnight-light`, `midnight-dark`,
`slate-light`, `slate-dark`, `emerald-light`, `emerald-dark`, `amber-light`,
`amber-dark`.

- **Cohérence inter-briques** : chaque preset est le **miroir** du preset
  homonyme de `HolafTokens` 0.2.0 — mêmes surfaces, même texte, même accent
  (`--hm-bg`/`--ht-bg` ← `surface`, `--hm-text`/`--ht-fg` ← `text`,
  `--hm-border`/`--ht-border` ← `border`, …). Un test importe directement
  `holaf-tokens.js` et compare valeur par valeur.
- **Données littérales**, aucune génération dupliquée : les hex sont calculés
  une fois puis embarqués — les briques restent **autonomes** (zéro dépendance
  runtime, aucun import croisé).
- **Alias historiques** : côté `HolafModal`, `dark` ≡ `indigo-dark`, `light` ≡
  `indigo-light`, `midnight` ≡ `midnight-dark`, `slate` ≡ `slate-dark`. Côté
  `HolafToast`, `light`/`midnight`/`slate` sont aussi des alias exacts, mais
  `dark` reste **gelé** (fond `#2b2b2b`, défaut CSS du toast) et diffère
  volontairement de `indigo-dark` (`#1e1e1e`) : écart documenté, **zéro
  rupture**. Aucune API existante ne change.

```js
HolafModal.setTheme("emerald-dark");   // ou "amber-light", "slate-light", …
HolafToast.setTheme("amber-light");
```

Voir [`js/README-holaf-modal.md`](js/README-holaf-modal.md) et
[`js/README-holaf-toast.md`](js/README-holaf-toast.md).

## Nouveautés v0.1

### HolafTokens 0.1.0 → 0.2.0 — catalogue de thèmes à 2 axes (famille × mode)

Le thème n'est plus une **liste plate** mais un **catalogue à deux axes** :
**5 familles** (`indigo`, `midnight`, `slate`, `emerald`, `amber`) × **2 modes**
(`light` / `dark`) = **10 presets `<famille>-<mode>`**, plus les **4 presets
historiques conservés comme alias** (`dark` ≡ `indigo-dark`, `light` ≡
`indigo-light`, `midnight` ≡ `midnight-dark`, `slate` ≡ `slate-dark`) aux
**valeurs rigoureusement identiques** — zéro rupture visuelle.

- `indigo` réutilise les deux palettes historiques ; `midnight` et `slate`
  gardent leur mode **sombre** historique et reçoivent un mode **clair généré** ;
  `emerald` et `amber` sont **générées** dans les deux modes.
- Les modes générés sont calculés par un **miroir interne** de
  `HolafColor.generateTheme` (brique autonome, zéro dépendance) ; le texte
  s'adapte au fond (**≥ 4.5:1**, vérifié par test sur les 10 presets).
- Nouvelle API : `setFamily(family, mode?)`, `getFamily()`, `getMode()`,
  `listFamilies()` ; `FAMILIES` et `ALIASES` exposés.

### HolafColor 0.1.0 → 0.1.1 — `generateFamily`

`HolafColor.generateFamily(accent, options?)` appelle `generateTheme` **deux
fois** (fonds clair/sombre opposés) et renvoie **`{ light, dark }`** — le texte
s'adapte par contraste (sombre sur fond clair, clair sur fond sombre). Exposée
en global **et** en ESM.

Voir [`js/README-holaf-tokens.md`](js/README-holaf-tokens.md) et
[`js/README-holaf-color.md`](js/README-holaf-color.md).

### HolafNotify 0.1.0 — brique émetteur Python (webhooks OpenClaw) — 1ʳᵉ brique du rayon `python/`

Nouvelle brique **Python**, stdlib pur (urllib, zéro install), qui notifie
OpenClaw (le « cerveau » de l'écosystème) via `POST /hooks/wake` (Bearer
`hooks.token`) quand un outil (PEH, AiKore, scripts Pi-Web…) a un fait à
annoncer : `notify(event, message, priority, data, project)` → payload
`{"text": "[event] message (projet=…, clé=valeur…)", "mode": "now"}`, retry
léger (3 tentatives, backoff 1s/2s/4s, réseau/5xx uniquement ; 4xx =
définitif), config par env (`HOLAF_WEBHOOK_URL`, `HOLAF_WEBHOOK_TOKEN`,
`HOLAF_WEBHOOK_TIMEOUT`), jamais de secret dans les erreurs.

Voir [`python/README-holaf-notify.md`](python/README-holaf-notify.md) et le
design [`docs/design-webhooks-mcp.md`](docs/design-webhooks-mcp.md) (§3 couche
evénements, §5 convention `<source>.<objet>.<verbe>`).

### HolafViewport 0.1.3 — viewport image (géométrie + interactions, SANS rendu)

Nouvelle brique : `HolafViewport.create(container, opts)` calcule le zoom / le
pan / le fit d'une image et, en mode **content**, applique le CSS transform à un
élément fourni (ex. une `<img>` object-fit:contain). En mode **headless**
(ex. canvas), elle ne fait que la géométrie : l'hôte dessine lui-même.

- `content` (optionnel) : si fourni, la brique applique `translate(tx,ty)
  scale(s)` (origin `0 0`) et gère la transition (none pendant le drag,
  `transform .2s ease-out` au relâchement). Absent → headless.
- `minZoom` (`'fit'` par défaut = ne pas dézoomer sous le fit) | nombre,
  `maxZoom` (30), `zoomFactor` (1.1), `panClamp` (true), `doubleClickZoom`
  (true), `wheel` (true), `drag` (true), `dragButton` (0), `dragTarget`.
- `canDrag(e)` : garde-fou par événement, consulté AVANT d'amorcer un drag.
  Défaut `() => true` (aucun filtre). Renvoyer `false` interdit le pan depuis
  la cible de l'événement (ex. un overlay de dessin crop/masque).
- `onChange(instance)` appelé après chaque changement de transform.
- Multi-subscription : `on(cb)` / `off(cb)` — cb appelé avec l'instance après
  chaque changement de transform, EN PLUS de `opts.onChange` (utile pour
  plusieurs consommateurs d'un même viewport, ex. overlays).
- API : `setImageSize`, `fit`, `getFitScale`, `getScale`, `getTransform`,
  `zoomBy`, `setScale`, `panBy`, `screenToImage`, `imageToScreen`,
  `getImageRect`, `reset`, `destroy`, `refit` (ResizeObserver si dispo).
- **Zéro CSS injecté** : brique sans style, l'hôte fournit conteneur/contenu.

Voir [`js/README-holaf-viewport.md`](js/README-holaf-viewport.md).

## Nouveautés v0.5

### HolafToast 0.4.0 → 0.5.0 — position configurable + empilement & animations par position

- `configure({ position })` accepte les **6 presets** : `top-right` (défaut),
  `top-center`, `top-left`, `bottom-right`, `bottom-center`, `bottom-left`.
  Une position inconnue retombe **sûrement sur `top-right`**.
- **Empilement adapté à la position** : pour les `bottom-*`, le toast le plus
  récent reste **collé au bord bas** (la pile monte vers le haut), même avec
  `newestFirst: true` (qui ne s'applique qu'aux positions `top-*`).
- **Animations par position** : slide d'entrée / fondu de sortie depuis le côté
  du bord auquel colle le conteneur (droite / gauche / haut / bas). Keyframes
  homonymes historiques conservés comme base.

100 % rétro-compatible : sans configuration, position `top-right` et
comportement historique inchangés.

## Nouveautés v0.5

Mise à jour **100 % additive** (rétro-compatible : les projets existants ne
changent pas de comportement — les deux nouvelles options sont neutres par
défaut). Une seule brique concernée.

### HolafAmbient 0.2.0 → 0.3.0 — options de performance `scale` / `fps`

- **`scale`** (0.25..1, défaut 1) : facteur de résolution du **buffer interne**.
  Backing store = `round(css × dpr × scale)` (min 1 px), le canvas garde ses
  dimensions CSS → l'agrandissement (bilinéaire) est fait par le compositeur,
  `image-rendering` auto. Coexiste avec le `ResizeObserver` (buffer recalculé au
  resize) et le dpr (un seul produit `css × dpr × scale`, jamais doublé). Le flou
  et le grain suivent le même ratio.
- **`fps`** (entier ≥ 10, défaut `0` = non plafonné) : plafond de framerate. La
  boucle rAF continue mais ne redessine qu'à échéance ; l'horloge d'effet avance
  à chaque tick et le dt est cumulé entre deux paints → la **vitesse horloge de
  l'animation est inchangée**, seul son taux de rafraîchissement baisse.
- Priorités préservées : `visibilitychange` (pause) et `prefers-reduced-motion`
  (frame unique) restent **au-dessus** du throttle `fps`.
- `setConfig({ scale })` redimensionne le buffer et redessine immédiatement ;
  `setConfig({ fps })` prend effet au tick suivant. **Zéro breaking**.

## Nouveautés v0.4

Mise à jour **100 % additive** (rétro-compatible : les projets existants ne
changent pas de comportement). Une seule brique concernée.

### HolafToast 0.3.0 → 0.4.0 — fonds teintés par type

- Nouvelles variables de thème **optionnelles** : `--ht-bg-info`,
  `--ht-bg-success`, `--ht-bg-warning`, `--ht-bg-error` — fond du toast par
  type, avec **fallback** sur le fond global `--ht-bg` : sans ces vars (thèmes
  existants, hôtes anciens), rien ne change visuellement.
- Un `--ht-bg` posé en inline (override par toast) reste gagnant dans la
  chaîne de fallback ; un `--ht-bg-<type>` inline (par toast ou via
  `theme.vars`) gagne sur tout.
- Les presets `dark` / `light` / `midnight` / `slate` définissent désormais
  des teintes harmonisées (~15 % de l'accent du type mélangé dans `--ht-bg`,
  hex calculés à la main) pour success / warning / error. Le type **info**
  reste neutre (aucune var `--ht-bg-info` dans les presets, fond `--ht-bg`).

## Nouveautés v0.3

Mise à jour **100 % additive** (rétro-compatible : les projets existants ne
changent pas de comportement). Toutes les nouvelles options sont **désactivées
par défaut**.

### HolafModal 0.2.1 → 0.3.0 — fenêtre (opt-in)

- `draggable: true` — déplacement par le header (clamp viewport).
- `resizable: true` — 8 poignées de redimensionnement (`minWidth`/`minHeight`).
- `storageKey` + `persistPos`/`persistSize` — persistance position/taille
  (localStorage par défaut, ou callbacks `storageGet`/`storageSet`).
- `zoom` — boutons −/+ sur le contenu (persisté sous `holaf-modal-zoom:<key|id>`).
- `headerRight` (Node) — inséré dans le header avant le bouton fermer.
- `content` fonction — `opts.content(body)`.
- `labels: { ok, cancel, close, loading }` — libellés des boutons/fermeture/chargement.
- `alert(title, msg, { icon })` — icône au-dessus du message.
- `themes.update(name, vars)` — fusionne les vars d'un thème enregistré.

### HolafModal 0.3.0 → 0.4.0 — modale à contenu libre

- Nouvelle option additive `actions` sur `open()` pour héberger un formulaire
  du projet hôte : une action avec `form` (id d'un `<form>` du contenu) est
  rendue en `type="submit"` + attribut HTML `form="…"` → la soumission NATIVE
  du formulaire est déclenchée au clic (validation/PATCH gérés par le hôte),
  le focus trap couvre les champs du contenu, Échap/overlay/thème inchangés.
- 100 % additive/rétro-compatible : `buttons`, helpers (alert/confirm/prompt/
  busy), fenêtre et registre de thèmes strictement inchangés.

### HolafToast 0.2.1 → 0.3.0

- `show({ id })` / `update(idOrCtrl, opts)` / `hide(idOrCtrl)` — id métier.
- `progress: 'manual'` — barre visible pilotée par `update({ progress: 0-100 })`,
  sans timer de fermeture auto.
- `html: true` — message en `innerHTML` (défaut `textContent`).
- `configure({ newestFirst: true })` — nouveaux toasts en premier (prepend).
- `themes.update(name, vars)` — fusionne les vars d'un thème enregistré.

### HolafFetch 0.1.1 → 0.2.0

- Forward des **options natives** du fetch (`cache`, `priority`, `mode`,
  `redirect`, `credentials`, `integrity`, `referrer`, `referrerPolicy`,
  `keepalive`, `duplex`).
- `configure({ timeout, retry })` — défauts globaux (résolution
  `opts ?? config ?? défaut`), retourne la config courante.

---

## Le script `holaf`

Toute la gestion passe par un seul script, écrit en français et pensé pour
quelqu'un qui n'est pas programmeur. Il suffit de se placer dans ce dépôt et de
lancer :

```bash
./scripts/holaf <commande> ...
```

Les commandes :

- **`list`** — liste les briques et versions disponibles dans la lib.
- **`install <brique> <DEST>`** — copie (pinne) une brique dans un projet
  `DEST`, sous `DEST/vendor/holaf/`, et note sa version dans
  `DEST/vendor/holaf/holaf-manifest.json`. Option `--version X` pour demander
  une version précise. Ne fait **jamais** d'écrasement silencieux.
- **`check <DEST>`** — compare les copies installées dans un projet à la lib :
  ✓ à jour / ⚠️ EN RETARD / ? inconnue.
- **`upgrade <brique> <DEST>`** — réinstalle la version actuelle de la lib dans
  un projet (avec avertissement + diff + confirmation).
- **`adopt <brique> <DEST>`** — remonte une copie **améliorée** d'un projet
  dans la lib, incrémente la version PATCH et met à jour l'en-tête du fichier.

Exemples :

```bash
DEST=/projects/mon-site          # n'importe quel projet
./scripts/holaf install modal "$DEST"
./scripts/holaf check    "$DEST"
./scripts/holaf upgrade  modal "$DEST"
./scripts/holaf adopt    modal "$DEST"
```

Tapez `./scripts/holaf help` pour l'aide complète et le détail du workflow.

## Workflow d'édition depuis un projet

1. **Éditer la copie dans le projet** : un projet possède sa propre copie de
   la brique (dans `vendor/holaf/`). Vous pouvez l'éditer librement — c'est
   justement permis (copie pinnée).
2. **Adopter l'amélioration** : quand votre amélioration est prête et testée,
   remontez-la dans la lib pour qu'elle profite à tous les autres projets :
   ```bash
   # depuis ce dépôt holaf-lib
   ./scripts/holaf adopt modal /projects/mon-site
   ```
   Le script affiche la différence, demande confirmation, copie votre fichier
   dans la lib, incrémente la version PATCH (ex. 0.1.0 → 0.1.1) dans le
   manifest central **et** dans l'en-tête du fichier brique. Pensez ensuite à
   committer/pusher.
3. **Mettre à jour les autres projets** : dès qu'une amélioration est adoptée,
   les autres projets qui utilisent la même brique verront `check` afficher
   **⚠️ EN RETARD**, et pourront récupérer la nouveauté avec :
   ```bash
   ./scripts/holaf upgrade modal /projects/autre-site
   ```

## Vérifier si un projet est à jour

```bash
./scripts/holaf check /projects/mon-site
```

Le manifest central porte la version *courante* ; le manifest local du projet
porte sa version *installée*. S'ils ne correspondent pas, la brique est en
retard et `upgrade` est indiqué.

## Intégrer une brique dans un projet (3 étapes)

### 1. Installer la brique avec le script

```bash
./scripts/holaf install modal /chemin/vers/mon-projet
```

Le script copie le fichier vers `mon-projet/vendor/holaf/` (dossier créé s'il
n'existe pas) et écrit `mon-projet/vendor/holaf/holaf-manifest.json`.

### 2. Inclure la brique dans la page

Les briques sont des modules ES : utilisez `type="module"`.

```html
<!-- Chargement global : HolafModal devient disponible partout (window.HolafModal) -->
<script type="module" src="vendor/holaf/holaf-modal.js"></script>

<!-- Ensuite, n'importe quel script classique de la page peut l'utiliser -->
<script>
    HolafModal.alert("Bonjour", "La brique est chargée !");
</script>
```

Ou en JavaScript moderne (import ES Module) :

```html
<script type="module">
    import { HolafModal } from "./vendor/holaf/holaf-modal.js";
    HolafModal.alert("Bonjour", "La brique est chargée !");
</script>
```

### 3. Utiliser

Chaque brique a sa doc détaillée avec tous les exemples :
voir [`js/README-holaf-modal.md`](js/README-holaf-modal.md) pour modal.

## Structure du dépôt

```
holaf-lib/
├── manifest.json               ← manifest central : briques + versions + fichiers + catégorie
├── js/                         ← les briques JS (1 fichier = 1 brique, + sa doc)
│   ├── holaf-modal.js
│   ├── README-holaf-modal.md
│   ├── holaf-toast.js
│   ├── README-holaf-toast.md
│   ├── holaf-fetch.js
│   ├── README-holaf-fetch.md
│   ├── holaf-viewport.js
│   ├── README-holaf-viewport.md
│   ├── holaf-color.js
│   ├── README-holaf-color.md
│   ├── holaf-tokens.js
│   ├── README-holaf-tokens.md
│   ├── holaf-ambient.js
│   ├── README-holaf-ambient.md
│   ├── holaf-icons.js
│   └── README-holaf-icons.md
├── python/                     ← les briques Python (stdlib pur, + leur doc)
│   ├── holaf-notify.py
│   └── README-holaf-notify.md
├── tests/                      ← tests automatisés (vitest + jsdom)
├── scripts/
│   └── holaf                   ← commande de gestion (install / check / upgrade / adopt / list)
└── README.md                   ← ce fichier
```

## Brique fondation : tokens

`tokens` (`js/holaf-tokens.js`) est la **brique fondation** du kit — celle qui pose
le **thème global de page**. Elle implique une doctrine particulière qu'il vaut
mieux comprendre avant de s'en servir.

### La doctrine

- **La SEULE brique autorisée à poser des variables sur `:root`.** Dans tout le kit,
  la règle reste stricte : *« chaque brique scope son CSS sous ses propres classes,
  jamais sur l'élément racine »*. `tokens` est **l'exception à cette règle**, par
  contrat **explicite et opt-in** : on ne la met pas par accident, on décide de
  l'installer parce qu'on veut un thème global.
- **Préfixe réservé `--holaf-*`.** Toutes les variables qu'elle pose vivent sous ce
  préfixe réservé (`--holaf-surface`, `--holaf-text`, `--holaf-accent`, `--holaf-danger`…).
  Aucune autre brique n'a le droit de poser de variable sur `:root`, et aucune ne
  s'appuie sur un `--holaf-*` que `tokens` n'aurait pas garanti.
- **Sans rendu.** `tokens` ne rend **aucun** élément : son CSS auto-injecté est
  minimal (un simple marqueur) ; elle ne fait que poser/retirer des variables
  sur `document.documentElement`.
- **Contrat de surface.** Les noms posés sont documentés (voir
  [`js/README-holaf-tokens.md`](js/README-holaf-tokens.md)) et la brique peut
  retirer ce qu'elle a posé. Installer `tokens`, c'est savoir (opt-in) qu'on
  installe un thème global : elle prend le contrôle de la palette de la page.

Voir le design dans [`js/README-holaf-tokens.md`](js/README-holaf-tokens.md).

## Notes techniques

- **Zéro dépendance runtime** : une brique n'exige rien d'autre que le navigateur.
- **Dual ESM + global** : chaque brique s'importe en module ES **et** expose un
  global `window.Holaf*` (pratique avec les pages/scripts classiques).
- **CSS auto-injecté** : chaque brique injecte son style une seule fois, scopé
  sous ses propres classes, avec des variables surchargeables par instance.
- **Version en deux endroits, gardés synchronisés** : la version d'une brique
  est dans le manifest central ET dans l'en-tête du fichier (et dans
  `HolafModal.version`). `adopt` met à jour les deux.
- **Pas de commit automatique** : ce dépôt est poussé à la main par son auteur.
