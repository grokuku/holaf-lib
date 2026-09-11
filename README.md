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
    "modal":   { "version": "0.4.0", "file": "js/holaf-modal.js",   "category": "component",  "description": "…" },
    "toast":   { "version": "0.5.0", "file": "js/holaf-toast.js",  "category": "component",  "description": "…" },
    "fetch":   { "version": "0.2.0", "file": "js/holaf-fetch.js",  "category": "component",  "description": "…" },
    "viewport": { "version": "0.1.3", "file": "js/holaf-viewport.js", "category": "component", "description": "…" },
    "tokens":  { "version": "0.1.0", "file": "js/holaf-tokens.js", "category": "foundation", "description": "…" }
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
| modal      | `js/holaf-modal.js` | 0.4.0   | ✅ prête   | Modales, alertes, confirmations, saisies, écrans d'attente (busy), thèmes prédéfinis/customs, fenêtre (drag/resize/persistance/zoom), **modale à contenu libre** (`open` + `actions`, bouton submit hors-form via `form=`) |
| toast      | `js/holaf-toast.js` | 0.5.0   | ✅ prête   | Notifications flottantes empilées (4 types à fond teinté avec fallback, position configurable, 6 positions animées, empilement adapté, thèmes/presets, pause au survol, actions, aria-live, id métier, progression manuelle) |
| fetch      | `js/holaf-fetch.js` | 0.2.0   | ✅ prête   | Wrapper HTTP maison (JSON blindé, erreurs typées, timeout, retry, auth enfichable bearer/CSRF/custom, options natives, configure) |
| viewport   | `js/holaf-viewport.js` | 0.1.3 | ✅ prête | Géométrie + interactions de viewport image (zoom/pan/fit, zoom-to-cursor, clamps, mode content & headless, SANS rendu ni CSS) |
| notify     | `python/holaf-notify.py` | 0.1.0 | ✅ prête | 1ʳᵉ brique **Python** (rayon `python/`, stdlib pur) : notifie OpenClaw via `POST /hooks/wake` (Bearer `hooks.token`), payload `{text, mode}`, résumé clé=valeur, retry léger (3×, 1s/2s/4s, réseau/5xx) |
| color      | `js/holaf-color.js`  | 0.1.0 | ✅ prête | Utilitaires couleur en PUR JS, SANS DOM ni CSS (hex↔rgb↔hsl, mix, lighten/darken, contraste WCAG) |
| tokens     | `js/holaf-tokens.js` | 0.1.0 | ✅ prête | **Brique FONDATION** : la SEULE à poser les vars `--holaf-*` sur `:root` (thème global, opt-in explicite) — voir section dédiée |
| ambient    | `js/holaf-ambient.js` | 0.2.0 | ✅ prête | Fonds animés canvas (waves/particles/aurora) **refondus** : rubans liquides, halos en profondeur, nappes transparentes ; `density` = curseur d'intensité, `blur` global, `elementCount` exposé, animation dt (indépendante du framerate), brique sans style (l'hôte fournit le canvas) |
| icons      | `js/holaf-icons.js` | 0.1.0 | ✅ prête | 36 icônes SVG en trait (style Feather, MIT), zéro CSS, `stroke=currentColor` |

> 9 briques au total : modal · toast · fetch · viewport · notify · color · tokens · ambient · icons

## Nouveautés v0.1

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
