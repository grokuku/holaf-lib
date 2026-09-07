# HolafModal — doc d'usage (brique holaf-lib v0.2.0)

Modale autonome : **un seul fichier** (`holaf-modal.js`), zéro dépendance.
Elle gère pour vous : l'overlay sombre, le centrage, la pile de modales
(Échap ne ferme que la dernière ouverte), le blocage du scroll de fond, la
navigation clavier (focus piégé dans la modale), l'accessibilité (aria), le
mobile (92 % de largeur), une **bibliothèque de thèmes** (presets et thèmes
customs, §3), et quatre raccourcis tout prêts : `alert`, `confirm`,
`prompt`, `busy`.

---

## 1. Inclure la brique

Après sync (voir plus bas), le fichier se trouve dans `vendor/holaf/` de votre
projet.

**Option A — chargement global (le plus simple) :**

```html
<script type="module" src="vendor/holaf/holaf-modal.js"></script>

<!-- Ensuite, n'importe quel script de la page peut utiliser HolafModal -->
<script>
    HolafModal.alert("Bonjour", "Ça marche !");
</script>
```

> Note : `type="module"` est obligatoire (le fichier est un module ES). Le
> module s'expose aussi sur `window.HolafModal`, donc vos scripts classiques
> n'ont rien à importer.

**Option B — import ES Module (code moderne, bundler, etc.) :**

```html
<script type="module">
    import { HolafModal } from "./vendor/holaf/holaf-modal.js";
    HolafModal.alert("Bonjour", "Ça marche !");
</script>
```

Le CSS est injecté automatiquement au premier `open()` — rien à inclure.

---

## 2. Usage simple : `HolafModal.open(options)`

```js
const ctrl = HolafModal.open({
    title: "Préférences",
    content: "<p>Le HTML est accepté ici (contenu de confiance).</p>",
    size: "md", // sm | md | lg | xl  (ou width: 560)
    buttons: [
        { text: "Annuler", value: false, type: "cancel" },
        { text: "Enregistrer", value: true, type: "primary",
          onClick: (c) => console.log("enregistré") },
    ],
    onClose: (value) => console.log("fermée avec", value),
});

// Plus tard, fermeture par code :
ctrl.close();
```

### Contrôleur retourné

| Membre                | Rôle                                                        |
|-----------------------|-------------------------------------------------------------|
| `ctrl.el`             | Élément racine de la modale (`.holaf-modal-root`)           |
| `ctrl.body`           | Zone de contenu                                             |
| `ctrl.overlay`        | Le fond sombre (pour tests/positionnement)                  |
| `ctrl.close(value)`   | Ferme la modale (idempotent) ; `value` transmis à `onClose` |
| `ctrl.setTitle(str)`  | Change le titre (toujours en `textContent`, jamais innerHTML) |
| `ctrl.setContent(c)`  | Remplace le contenu (string ou Node DOM)                    |
| `ctrl.setBusy(true, "msg")` | Voile interne avec spinner (attente dans la modale)   |
| `ctrl.bringToFront()` | Passe la modale au premier plan (et au sommet de la pile)   |

### Options de `open()`

| Option           | Défaut | Rôle                                                                    |
|------------------|--------|-------------------------------------------------------------------------|
| `title`          | `""`   | Titre (texte brut, sécurisé)                                            |
| `content`        | —      | String HTML **de confiance** ou Node DOM (recommandé)                   |
| `size`           | `md`   | `sm` (340px), `md` (440px), `lg` (640px), `xl` (860px)                  |
| `width`          | —      | Largeur custom (nombre px ou string CSS) — surcharge `size`             |
| `buttons`        | `[]`   | Voir ci-dessous                                                         |
| `modal`          | `true` | `true` : fond sombre cliquable ; `false` : boîte centrée sans fond (la page reste cliquable) |
| `id`             | —      | Anti-doublon : si déjà ouverte, elle repasse au premier plan (pas de 2e copie) |
| `closeOnEscape`  | `true` | Échap ferme la modale — **seulement si elle est au sommet de la pile**  |
| `closeOnOverlay` | `true` | Clic sur le fond = fermer                                               |
| `scrollLock`     | `true` | Bloque le scroll de la page tant qu'une modale est ouverte              |
| `focusTrap`      | `true` | Tab circule uniquement dans la modale                                   |
| `theme`          | —      | Thème de CETTE instance : string (nom de thème enregistré), objet `--hm-*`, ou `{ preset, vars }` — voir §3 |
| `onOpen(ctrl)`   | —      | Appelé après l'ouverture                                                |
| `onClose(value)` | —      | Appelé à la fermeture avec la valeur passée à `close()`                 |

### Boutons

```js
buttons: [{
    text: "Supprimer",       // libellé (texte brut)
    value: "deleted",        // valeur passée à onClose
    type: "danger",          // primary (défaut) | danger | cancel
    onClick: (ctrl) => {…},  // callback au clic (retour false = ne pas fermer)
    close: false,            // true (défaut) : le clic ferme la modale
    guard: false,            // false : ce bouton ignore le guard global
}]
```

### Thème par instance

Les variables (`--hm-*`) vivent sur la racine de la modale — jamais sur
`:root` — donc chaque instance peut être re-colorée indépendamment. L'option
`theme` accepte un objet de variables, un nom de thème enregistré, ou un
`{ preset, vars }` : tout est détaillé dans la section suivante.

---

## 3. Thèmes

La brique embarque une **bibliothèque de thèmes** : des palettes prédéfinies
génériques (aucune couleur propre à un projet — elles servent à harmoniser
tous vos outils) et la possibilité de déclarer vos propres thèmes.

### Priorité de résolution (à chaque `open()`)

    open({ theme })   >   HolafModal.setTheme()   >   défauts de la brique

- une modale **sans** option `theme` reçoit le thème global s'il existe, sinon
  les défauts sombres historiques ;
- `theme: null` (ou `""`) : **aucun** thème pour cette modale, y compris le
  thème global (opt-out explicite) ;
- l'option `theme` reste acceptée sous sa forme historique (objet de
  variables) — comportement strictement inchangé.

### Quatre presets génériques

Enregistrés au chargement de la brique. Palettes neutres, contraste des
textes ≥ 4.5:1, radius 12px et font-size 14px partout :

| Preset     | Esprit                       | Fond / second        | Texte / secondaire | Accent (→ hover)                      | Overlay         |
|------------|------------------------------|----------------------|--------------------|----------------------------------------|-----------------|
| `dark`     | sombre neutre — **défaut exact** | #1e1e1e / #27272a | #e4e4e7 / #a1a1aa  | indigo #6366f1 → #818cf8               | noir 55 %       |
| `light`    | clair zinc                   | #ffffff / #f4f4f5    | #18181b / #52525b  | indigo #4f46e5 → #6366f1               | zinc 35 %       |
| `midnight` | bleu nuit « layered »        | #10111d / #181a2c    | #e2e4f0 / #9aa0c3  | indigo doux #818cf8 → #a5b4fc (texte sombre) | bleu nuit 65 % |
| `slate`    | gris ardoise neutre          | #1f232b / #292e38    | #e6e9ee / #9aa3b2  | gris #94a3b8 → #b6c2d4 (texte sombre)  | noir 55 %       |

Tous partagent le même rouge danger (#ef4444 → #dc2626, texte blanc) — `light`
utilise des rouges plus foncés (#dc2626 → #b91c1c) pour garder le contraste.

`dark` reproduit **strictement** les défauts de la brique :
`theme: "dark"` ≡ aucune option `theme` (zéro surprise visuelle).

```js
HolafModal.open({ title: "Réglages", content: "…", theme: "light" });   // une modale claire
HolafModal.open({ title: "Analyse", content: "…", theme: "midnight" }); // une modale bleu nuit
```

> Les presets ne figent **pas** `--hm-width` : la largeur reste gouvernée par
> `size` / `width`, même avec un thème actif.

### Thème global par défaut : `setTheme` / `clearTheme`

Pour harmoniser TOUTES les modales d'un outil, réglez le thème une fois à
l'init du projet :

```js
HolafModal.setTheme("light");                                  // nom de thème enregistré
HolafModal.setTheme({ preset: "midnight", vars: { "--hm-radius": "16px" } }); // preset + surcharges
HolafModal.setTheme({ "--hm-accent": "#0ea5e9" });             // objet brut (comme open)
HolafModal.clearTheme();                                       // retour aux défauts sombres
```

- **Volatil, en mémoire uniquement** : rien n'est écrit en localStorage. La
  persistance du choix de l'utilisateur (s'il y en a une) est l'affaire du
  projet hôte, qui rejouera `setTheme` à l'init.
- La résolution se fait à chaque `open()` : re-enregistrer un thème prend
  effet sur les modales ouvertes ensuite (les modales déjà affichées ne sont
  pas retouchées).
- Les helpers (`alert`, `confirm`, `prompt`, `busy`) héritent du thème global
  comme n'importe quelle modale ; `alert`/`confirm`/`prompt` acceptent aussi
  une option `theme` individuelle.

### Thèmes customs : `register` / `get` / `list`

```js
// Un thème = un objet de variables --hm-* (les mêmes clés que l'option theme).
HolafModal.themes.register("foret", {
    "--hm-bg": "#12211a",
    "--hm-bg-secondary": "#1a2f24",
    "--hm-bg-input": "#0d1812",
    "--hm-text": "#e6f0ea",
    "--hm-text-secondary": "#9db8aa",
    "--hm-border": "#2c4a3a",
    "--hm-accent": "#34d399",
    "--hm-accent-hover": "#6ee7b7",
    "--hm-accent-text": "#0c1f16",
});

HolafModal.open({ title: "Atelier", theme: "foret" }); // utilisable comme un preset

HolafModal.themes.list();        // → ["dark", "light", "midnight", "slate", "foret"]
HolafModal.themes.get("foret");  // → copie des variables (le registre est protégé)
HolafModal.themes.get("nul");    // → null
```

- `register(name, vars)` : enregistre ou **remplace** un thème. Seules les
  clés commençant par `--` sont conservées (valeurs stringifiées) — même
  règle que l'option `theme` de `open()`.
- `get(name)` retourne une **copie** : muter le résultat ne touche pas le
  registre.

### Preset + surcharge (override)

```js
HolafModal.open({
    title: "Suppression",
    theme: {
        preset: "midnight",                 // base = thème enregistré
        vars: {                             // surcharges : priorité maximale
            "--hm-danger": "#f43f5e",
            "--hm-danger-hover": "#e11d48",
        },
    },
    buttons: [{ text: "Supprimer", value: true, type: "danger" }],
});
```

Ordre de priorité des variables : surcharges `vars` > preset > défauts de la
brique. Si le `preset` cité n'existe pas, un avertissement est émis et les
surcharges seules s'appliquent (repli gracieux sur les défauts pour le reste).

---

## 4. Les raccourcis (helpers Promise)

```js
// Alerte — se referme avec OK (ou Échap)
await HolafModal.alert("Sauvegarde", "Ton backup est terminé ✅");

// Confirmation → true / false. danger:true → bouton rouge.
const ok = await HolafModal.confirm("Supprimer le dossier ?", "Action irréversible.", {
    danger: true,
    confirmText: "Supprimer",
    guard: async () => {
        // validation async avant fermeture ; retourner false = rester ouverte
        return await checkNoFileOpen();
    },
});
if (ok) deleteFolder();

// Saisie → string (ou null si annulé). Entrée dans le champ = valider.
const name = await HolafModal.prompt("Nom du profil", "Comment l'appeler ?", {
    placeholder: "ex: Atelier",
    initial: "Mon profil",
});
if (name !== null) createProfile(name); // "" = chaîne vide acceptée

// Attente non fermable (ni croix, ni Échap, ni fond) → close() par code
const wait = HolafModal.busy("Upload en cours…");
try {
    await doUpload();
    wait.set("Presque fini…");   // changer le message
} finally {
    wait.close();                // refermer
}
```

Les helpers refusent la fermeture par clic sur le fond (anti-dismiss
accidentel) ; `alert`/`confirm`/`prompt` se ferment par leurs boutons ou Échap.
Ils héritent du thème global et acceptent une option `theme` (string, objet
ou `{ preset, vars }`) transmise à `open()` :

```js
await HolafModal.confirm("Passer en clair ?", "Toute l'app suivra.", { theme: "light" });
```

---

## 5. Comportements garantis

- **Pile d'overlays** : toutes les modales s'empilent ; une pression sur Échap
  ne ferme que la plus récente (le sommet). Si le sommet interdit Échap
  (`closeOnEscape:false`), rien ne se ferme — jamais de cascade.
- **Z-index** : compteur global unique, base 100 000 → chaque modale ouverte
  ou `bringToFront()` passe au-dessus, sans jamais écraser les valeurs du site.
- **Scroll-lock** : le body reçoit `holaf-modal-open { overflow:hidden }` ;
  avec plusieurs modales empilées, le scroll n'est rendu qu'à la dernière
  fermeture (compteur interne).
- **Anti-doublon** : `open({ id: "reglages" })` appelé deux fois ne crée pas
  de doublon — la modale existante est remise au premier plan.
- **Mobile (<768px)** : la modale se centre en 92vw.
- **Sans localStorage, sans drag, sans resize** : c'est le rôle de la future
  brique HolafWindow.
- **Thèmes** : variables résolues à l'ouverture (`open.theme` > `setTheme`
  global > défauts) ; rien n'est posé sur `:root`, rien n'est persisté.

---

## 6. Procédure de sync (mettre à jour / installer dans un projet)

Le fichier consommé vit dans `vendor/holaf/` du projet cible. Depuis ce dépôt
holaf-ui :

```bash
# Copier toutes les briques vers le projet cible :
DEST=/chemin/vers/mon-projet ./scripts/sync-holaf-ui.sh
# → copie js/*.js vers /chemin/vers/mon-projet/vendor/holaf/
```

Puis, dans le projet cible, committer `vendor/holaf/` pour figer la version
utilisée. Pour mettre à jour plus tard : `git pull` dans holaf-ui, relancer le
même script, committer à nouveau. Vérifier la version avec
`HolafModal.version` (v0.2.0).

---

## 7. Notes techniques

- Fichier **dual** : module ES (export) **et** global `window.HolafModal`.
- Un **seul** listener `keydown` au niveau document pour tout le module
  (Échap + Tab du focus trap), en capture, supprimé… jamais : installé une
  fois, il est inactif quand aucune modale n'est ouverte.
- `content` en string passe par `innerHTML` (le HTML fourni est réputé de
  confiance). Pour toute donnée utilisateur, passez un **Node** :
  `const p = document.createElement("p"); p.textContent = userInput;`
- **Thèmes** : le registre (`HolafModal.themes`) vit en mémoire — les presets
  sont déclarés au chargement du fichier, les thèmes customs par le projet ;
  `setTheme` est lui aussi volatil (pas de localStorage, par conception).
- Tests : `npm test` (vitest + jsdom) dans ce dépôt.