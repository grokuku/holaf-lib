# holaf-lib — briques JS maison, versionnées par brique

## C'est quoi, ce kit ?

**holaf-lib** (anciennement *holaf-ui*) est une petite boîte à outils de
briques JavaScript écrites à la maison. Chaque **brique** = **un seul fichier
`.js`**, autonome, sans dépendance à installer : on le copie dans un projet,
on l'inclut dans une page, et ça marche.

L'idée : quand on retrouve les mêmes besoins dans plusieurs projets (afficher
une modale, une fenêtre déplaçable, un toast…), au lieu de copier-coller du
code au cas par cas, chaque besoin devient une brique propre, **versionnée
par brique**, documentée ici, puis **copiée (pinnée)** dans les projets qui en
ont besoin.

Chaque brique est accompagnée de sa propre documentation détaillée dans le
dossier `js/` (ex. `js/README-holaf-modal.md`).

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
    "modal":   { "version": "0.3.0", "file": "js/holaf-modal.js" },
    "toast":   { "version": "0.4.0", "file": "js/holaf-toast.js" },
    "fetch":   { "version": "0.2.0", "file": "js/holaf-fetch.js" },
    "viewport": { "version": "0.1.3", "file": "js/holaf-viewport.js" }
  }
}
```

Grâce à ça, le script `holaf` sait :
- quelle version une brique **devrait** avoir (manifest central),
- quelle version un projet **a réellement** (manifest local du projet),
- si un projet est à jour (`check`) ou en retard, et permet de **mettre à jour**
  (`upgrade`) ou de **remonter une amélioration** (`adopt`).

## Les briques

| Brique     | Fichier             | Version | Statut     | Rôle                                                              |
|------------|---------------------|---------|------------|-------------------------------------------------------------------|
| modal      | `js/holaf-modal.js` | 0.3.0   | ✅ prête   | Modales, alertes, confirmations, saisies, écrans d'attente (busy), thèmes prédéfinis/customs, fenêtre (drag/resize/persistance/zoom) |
| toast      | `js/holaf-toast.js` | 0.4.0   | ✅ prête   | Notifications flottantes empilées (4 types à fond teinté avec fallback, 6 positions, thèmes/presets, pause au survol, actions, aria-live, id métier, progression manuelle) |
| fetch      | `js/holaf-fetch.js` | 0.2.0   | ✅ prête   | Wrapper HTTP maison (JSON blindé, erreurs typées, timeout, retry, auth enfichable bearer/CSRF/custom, options natives, configure) |
| viewport   | `js/holaf-viewport.js` | 0.1.3 | ✅ prête | Géométrie + interactions de viewport image (zoom/pan/fit, zoom-to-cursor, clamps, mode content & headless, SANS rendu ni CSS) |
| *(à venir)*| —                   | —       | 🔜 prévue  | Fenêtres « vraies », etc.                                 |

## Nouveautés v0.1

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
├── manifest.json               ← manifest central : briques + versions + fichiers
├── js/                         ← les briques (1 fichier = 1 brique, + sa doc)
│   ├── holaf-modal.js
│   ├── README-holaf-modal.md
│   ├── holaf-toast.js
│   └── README-holaf-toast.md
├── tests/                      ← tests automatisés (vitest + jsdom)
├── scripts/
│   └── holaf                   ← commande de gestion (install / check / upgrade / adopt)
└── README.md                   ← ce fichier
```

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
