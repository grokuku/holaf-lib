# HolafToast — notifications flottantes (toasts)

Brique autonome, **zéro dépendance runtime** : un seul fichier
`holaf-toast.js` à copier dans un projet. Notifications en coin d'écran,
empilées, avec auto-dismiss, pause au survol, actions cliquables, **fonds
teintés par type** (avec fallback), **thèmes** (registre + presets) et
**6 positions**.

**Version : 0.4.0**

---

## Inclusion

```html
<!-- Chargement global : window.HolafToast devient disponible partout -->
<script type="module" src="vendor/holaf/holaf-toast.js"></script>

<script>
    HolafToast.success("Enregistré !");
</script>
```

Ou en import ES Module :

```html
<script type="module">
    import { HolafToast } from "./vendor/holaf/holaf-toast.js";
    HolafToast.info("Bonjour");
</script>
```

Le CSS est **auto-injecté une seule fois** (`<style id="holaf-toast-style">`).
Classes scoppées `.holaf-toast-*`, variables `--ht-*` déclarées sur la racine
du conteneur (`.holaf-toast-container`), jamais sur `:root` — surchargez-les
par sélecteur CSS dans votre projet si besoin.

## Usage

### `HolafToast.show(options)` → `{ close, update }`

```js
const t = HolafToast.show({
    message: "Traitement terminé",        // texte (obligatoire en pratique)
    title: "Export",                       // titre optionnel
    type: "success",                       // info | success | warning | error (info)
    duration: 4000,                        // ms avant fermeture auto (4000 ; 0 = persistant)
    position: "top-right",                 // voir § Positions (top-right)
    theme: "light",                        // voir § Thèmes (aucun par défaut)
    closeOnClick: true,                    // fermer en cliquant le toast (false)
    onShow: (ctrl) => {},
    onClose: (reason) => {},               // 'timeout' | 'click' | 'manual' | 'replaced'
});

t.update({ message: "Fini à 100 %", type: "success" }); // modifie à chaud
t.close();                                                // ferme ('manual')
```

### Helpers raccourcis

```js
HolafToast.success("Opération réussie");
HolafToast.error("Échec de la connexion", { duration: 0 }); // reste affiché
HolafToast.warning("Espace disque faible", { position: "bottom-right" });
HolafToast.info("Nouvelle version disponible");
```

Équivalents à `show({ message, type, ...opts })`.

### id métier : `show({ id })`, `update(idOrCtrl, opts)`, `hide(idOrCtrl)` (v0.3.0)

Vous pouvez donner un **id métier** (string) à un toast. Si un toast **vivant**
porte déjà cet id, `show({ id })` **met à jour son contenu** au lieu d'en créer
un nouveau (pratique pour une progression, un état unique…) :

```js
HolafToast.show({ id: "upload", message: "Démarrage…", duration: 0 });
HolafToast.show({ id: "upload", message: "50 %", title: "Upload", type: "warning", duration: 0 });
// → un SEUL toast, mis à jour (même contrôleur retourné)
```

Deux fonctions module acceptent un **id string** OU la **référence ctrl** :

```js
HolafToast.update("upload", { message: "100 %", type: "success" }); // par id
HolafToast.update(ctrl, { message: "100 %" });                        // par référence
HolafToast.hide("upload");                                            // ferme par id
HolafToast.hide(ctrl);                                                 // ferme par référence
```

- `update(idOrCtrl, opts)` retourne le contrôleur mis à jour (ou `null` si
  introuvable) ; `hide(idOrCtrl)` retourne `true` si un toast a été fermé.
- L'id est **libéré à la fermeture** : un `show({ id })` ultérieur crée un
  nouveau toast.

### Progression manuelle : `progress: 'manual'` (v0.3.0)

Par défaut, la barre de progression est **temporelle** (animée sur `duration`,
avec timer d'auto-dismiss). En mode **manuel**, la barre est **visible**
(largeur 0) même avec `duration: 0`, et **aucun timer** de fermeture auto
n'est armé — vous pilotez la largeur à la main :

```js
const t = HolafToast.show({ message: "Téléchargement…", progress: "manual", duration: 0 });
HolafToast.update(t, { progress: 30 }); // largeur = 30 %
HolafToast.update(t, { progress: 100 }); // largeur = 100 %
HolafToast.hide(t);
```

- `update({ progress: 0-100 })` règle la largeur de la barre (clampée 0-100).
- Le mode temporel reste le **défaut** : sans `progress`, timer + barre animée
  inchangés.

### `html: true` (v0.3.0)

Par défaut, le message est posé en `textContent` (aucune injection). Avec
`html: true`, il passe par `innerHTML` (contenu de confiance) :

```js
HolafToast.show({ message: "<b>Important</b>", html: true });
```

### `newestFirst` (v0.3.0)

`configure({ newestFirst: true })` fait s'insérer les nouveaux toasts **en
premier** dans le conteneur (`prepend`) au lieu d'ajouter à la fin (`append`,
défaut historique) :

```js
HolafToast.configure({ newestFirst: true });
```

Sans configuration, le comportement historique (append) est strictement
conservé.

### Actions cliquables

```js
HolafToast.show({
    message: "Fichier supprimé.",
    type: "warning",
    duration: 6000,
    actions: [
        { label: "Annuler", onClick: () => restaurer() },        // ferme après clic
        { label: "Détails", onClick: () => ouvrirLog(), close: false }, // ne ferme PAS
    ],
});
```

### Pause au survol

Quand la souris survole un toast, **le timer d'auto-dismiss ET la barre de
progression se mettent en pause** (l'animation CSS est gelée à sa position
courante via `animation-play-state: paused`) ; au départ de la souris, le
compte à rebours (et la barre) reprend là où ils en étaient. Pratique pour
laisser le temps de lire ou de cliquer une action.

La barre de progression est **animée en temps réel** : sa durée est calée sur
le `duration` du toast et elle se vide linéairement de `scaleX(1)` à
`scaleX(0)`. En `prefers-reduced-motion`, la barre reste **visible mais
statique** (pleine, sans animation) ; le timer JS ferme toujours le toast.
Pour un toast persistant (`duration: 0`), aucune barre n'est affichée.

### Comportement de pile

- Chaque **position** a son propre conteneur fixe (créé à la demande,
  supprimé quand vide).
- **Maximum 5 toasts visibles** par position : au-delà, le plus ancien est
  fermé automatiquement (`onClose` reçoit la raison `"replaced"`).
- Les toasts entrent avec un slide-in, sortent en fondu. Les animations sont
  désactivées si l'utilisateur préfère `prefers-reduced-motion`.
- Sur mobile (< 600 px), les toasts passent en **pleine largeur en bas**
  d'écran, quelle que soit la position demandée.

### Accessibilité

- `aria-live="polite"` + `role="status"` pour info/success/warning ;
- `aria-live="assertive"` + `role="alert"` pour error (annonce immédiate) ;
- bouton ✕ étiqueté `aria-label="Fermer la notification"`.

---

## Positions

Six positions disponibles, chacune avec son propre conteneur fixe (créé à la
demande, empilement propre) :

| Position         | Description            |
|------------------|------------------------|
| `top-right`      | coin haut droit (**défaut**) |
| `top-left`       | coin haut gauche       |
| `bottom-right`   | coin bas droit         |
| `bottom-left`    | coin bas gauche        |
| `top-center`     | centré en haut         |
| `bottom-center`  | centré en bas          |

```js
HolafToast.show({ message: "En haut au centre", position: "top-center" });
HolafToast.show({ message: "En bas au centre", position: "bottom-center" });
```

Sans configuration, la position par défaut reste **`top-right`** (comportement
historique inchangé).

---

## Thèmes

La brique embarque une **bibliothèque de thèmes** : des palettes prédéfinies
génériques (aucune couleur propre à un projet) et la possibilité de déclarer
vos propres thèmes. Miroir de la philosophie de `HolafModal`.

### Priorité de résolution (à chaque `show()`)

    show({ theme })   >   HolafToast.setTheme()   >   défauts de la brique

- un toast **sans** option `theme` reçoit le thème global s'il existe, sinon
  les défauts sombres historiques ;
- `theme: null` (ou `""`) : **aucun** thème pour ce toast, y compris le thème
  global (opt-out explicite) ;
- l'option `theme` reste acceptée sous sa forme historique (objet de
  variables) — comportement strictement inchangé.

### Quatre presets génériques

Enregistrés au chargement de la brique. Palettes neutres, contraste des
textes ≥ 4.5:1, radius 10px partout :

| Preset     | Esprit                       | Fond / texte        | Bordure | Accents (info / success / warning / error) |
|------------|------------------------------|---------------------|---------|---------------------------------------------|
| `dark`     | sombre neutre — **défaut exact** | #2b2b2b / #f0f0f0 | #4a4a4a | #4aa3ff / #4caf6d / #e0a030 / #e05555 |
| `light`    | clair zinc                   | #ffffff / #18181b    | #d4d4d8 | #2563eb / #15803d / #b45309 / #dc2626 |
| `midnight` | bleu nuit « layered »        | #10111d / #e2e4f0    | #272a44 | #60a5fa / #34d399 / #fbbf24 / #f87171 |
| `slate`    | gris ardoise neutre          | #1f232b / #e6e9ee    | #3a4150 | #93c5fd / #6ee7b7 / #fcd34d / #fca5a5 |

`dark` reproduit **strictement** les défauts de la brique :
`theme: "dark"` ≡ aucune option `theme` (zéro surprise visuelle).

```js
HolafToast.show({ message: "Réglages", theme: "light" });   // un toast clair
HolafToast.show({ message: "Analyse", theme: "midnight" }); // un toast bleu nuit
```

> Les presets ne figent **pas** `--ht-width` : la largeur reste gouvernée par
> la brique (et le responsive mobile), même avec un thème actif.

### Fond teinté par type (v0.4.0)

Quatre variables de thème **optionnelles** colorent le fond du toast selon
son type :

| Variable          | Rôle                       | Définie dans les presets ?  |
|-------------------|----------------------------|-----------------------------|
| `--ht-bg-info`    | fond des toasts `info`     | non — info reste **neutre** |
| `--ht-bg-success` | fond des toasts `success`  | oui (teinte verdâtre)       |
| `--ht-bg-warning` | fond des toasts `warning`  | oui (teinte ambrée)         |
| `--ht-bg-error`   | fond des toasts `error`    | oui (teinte rougeâtre)      |

Le CSS de la brique applique, pour chaque type, une règle avec **fallback** :

```css
.holaf-toast--success { background: var(--ht-bg-success, var(--ht-bg)); }
```

- Si la var du type n'est **pas définie** (thèmes customs anciens, hôtes qui
  n'ont pas migré), le fond global `--ht-bg` s'applique :
  **rétrocompatibilité totale**, aucun changement visuel.
- Un `--ht-bg` posé **en inline** sur le toast (override par toast, ex. via
  `theme: { "--ht-bg": … }`) l'emporte dans la chaîne de fallback.
- Un `--ht-bg-<type>` posé **en inline** (par toast ou via `theme.vars`)
  gagne sur tout le reste.

Teintes embarquées dans les presets (≈ 15 % de l'accent du type mélangé dans
le `--ht-bg` du preset, hex calculés à la main — pas de `color-mix()`, pour
une compatibilité maximale) :

| Preset     | `--ht-bg-success` | `--ht-bg-warning` | `--ht-bg-error` |
|------------|-------------------|-------------------|-----------------|
| `dark`     | `#303f35`         | `#463d2c`         | `#463131`       |
| `light`    | `#dcece2`         | `#f4e5da`         | `#fadede`       |
| `midnight` | `#152e30`         | `#332b1e`         | `#331f2a`       |
| `slate`    | `#2b4040`         | `#403d30`         | `#40373d`       |

Le type **info** n'a pas de var dans les presets : il garde le fond neutre
`--ht-bg` du preset. Un thème custom qui veut un fond info dédié ajoute
simplement `--ht-bg-info` à ses variables.

```js
// Override par toast : fond success verdâtre spécifique
HolafToast.success("OK", {
    theme: { preset: "midnight", vars: { "--ht-bg-success": "#123528" } },
});
```

### Thème global par défaut : `setTheme` / `clearTheme`

Pour harmoniser TOUS les toasts d'un outil, réglez le thème une fois à
l'init du projet :

```js
HolafToast.setTheme("light");                                  // nom de thème enregistré
HolafToast.setTheme({ preset: "midnight", vars: { "--ht-radius": "16px" } }); // preset + surcharges
HolafToast.setTheme({ "--ht-accent-info": "#0ea5e9" });        // objet brut (comme show)
HolafToast.clearTheme();                                       // retour aux défauts sombres
```

- **Volatil, en mémoire uniquement** : rien n'est écrit en localStorage. La
  persistance du choix de l'utilisateur (s'il y en a une) est l'affaire du
  projet hôte, qui rejouera `setTheme` à l'init.
- La résolution se fait à chaque `show()` : re-enregistrer un thème prend
  effet sur les toasts affichés ensuite (les toasts déjà affichés ne sont pas
  retouchés).

### Thèmes customs : `register` / `get` / `list` / `update`

```js
// Un thème = un objet de variables --ht-* (les mêmes clés que l'option theme).
HolafToast.themes.register("foret", {
    "--ht-bg": "#12211a",
    "--ht-fg": "#e6f0ea",
    "--ht-border": "#2c4a3a",
    "--ht-accent-info": "#38bdf8",
    "--ht-accent-success": "#34d399",
    "--ht-accent-warning": "#fbbf24",
    "--ht-accent-error": "#f87171",
});

HolafToast.show({ message: "Atelier", theme: "foret" }); // utilisable comme un preset

HolafToast.themes.list();        // → ["dark", "light", "midnight", "slate", "foret"]
HolafToast.themes.get("foret");  // → copie des variables (le registre est protégé)
HolafToast.themes.get("nul");    // → null
```

- `register(name, vars)` : enregistre ou **remplace** un thème. Seules les
  clés commençant par `--` sont conservées (valeurs stringifiées) — même
  règle que l'option `theme` de `show()`. Le retour est une **copie
  protégée** : muter ce que renvoie `register` ne corrompt pas le registre.
- `get(name)` retourne une **copie** : muter le résultat ne touche pas le
  registre.
- `update(name, vars)` (v0.3.0) : **fusionne** les variables d'un thème
  enregistré (les clés fournies écrasent, les autres restent) — utile pour un
  hôte qui recalcule ses vars. Si le thème n'existe pas, il est enregistré à
  la place (avec un avertissement). Retourne une copie protégée du thème
  résultant :

```js
HolafToast.themes.update("foret", { "--ht-accent-info": "#0ea5e9" });
```

### Preset + surcharge (override)

```js
HolafToast.show({
    message: "Suppression",
    theme: {
        preset: "midnight",                 // base = thème enregistré
        vars: {                             // surcharges : priorité maximale
            "--ht-accent-error": "#f43f5e",
        },
    },
});
```

Ordre de priorité des variables : surcharges `vars` > preset > défauts de la
brique. Si le `preset` cité n'existe pas, un avertissement est émis et les
surcharges seules s'appliquent (repli gracieux sur les défauts pour le reste).

Les clés `--ht-*` posées **à la racine** du spec, à côté de `preset`, sont
aussi acceptées : elles sont fusionnées dans les surcharges, après le preset.
L'écriture courte `theme: { preset: "dark", "--ht-accent-info": "#123" }` est
donc équivalente à `theme: { preset: "dark", vars: { "--ht-accent-info": "#123" } }`.
En cas de doublon entre une clé racine et `vars`, c'est `vars` (champ
officiel) qui garde la priorité.

> Note : un nom de thème inconnu ne déclenche l'avertissement qu'**une seule
> fois par nom** (au `show()` ou au `setTheme` selon le cas) — pas de spam
> console à chaque affichage. Le compteur est remis à zéro si le thème est
> enregistré ensuite ou après `clearTheme()`.

---

## Défauts globaux : `configure()`

Pour changer les **défauts** de la brique (position, durée, thème) pour tous
les toasts qui ne passent pas d'option explicite :

```js
HolafToast.configure({
    position: "bottom-center",   // position par défaut (top-right)
    duration: 3000,              // durée par défaut en ms (4000 ; 0 = persistant)
    theme: "light",              // thème global par défaut (aucun) — équivaut à setTheme
    newestFirst: true,           // v0.3.0 : nouveaux toasts en premier (false par défaut)
});
```

- **Volatil, en mémoire uniquement** : rien n'est écrit en localStorage.
- Une option explicite dans `show()` (ou un helper) **prime toujours** sur le
  défaut configuré.
- Sans appel à `configure()`, les défauts historiques sont strictement
  conservés : position `top-right`, durée `4000 ms`, aucun thème, `newestFirst`
  désactivé.

---

## Procédure de sync (copie pinnée)

HolafToast suit le même workflow que les autres briques via le script
`scripts/holaf` du dépôt holaf-lib :

```bash
# Installer / réinstaller la brique dans un projet
./scripts/holaf install toast /projects/mon-site
# (avec une version précise : --version 0.2.1)

# Vérifier si la copie d'un projet est à jour
./scripts/holaf check /projects/mon-site

# Mettre à jour la copie d'un projet vers la version courante de la lib
./scripts/holaf upgrade toast /projects/mon-site

# Remonter une amélioration faite dans un projet vers la lib
./scripts/holaf adopt toast /projects/mon-site
```

Le fichier copié atterrit dans `DEST/vendor/holaf/holaf-toast.js` et sa
version est notée dans `DEST/vendor/holaf/holaf-manifest.json`. La version
vit en 3 endroits synchronisés : le **manifest central** (`manifest.json`),
l'**en-tête** du fichier et la constante `HolafToast.version`.
Mettre à jour les 3 ensemble (le script `adopt` le fait automatiquement).
