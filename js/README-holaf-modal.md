# HolafModal — doc d'usage (brique holaf-ui v0.1.0)

Modale autonome : **un seul fichier** (`holaf-modal.js`), zéro dépendance.
Elle gère pour vous : l'overlay sombre, le centrage, la pile de modales
(Échap ne ferme que la dernière ouverte), le blocage du scroll de fond, la
navigation clavier (focus piégé dans la modale), l'accessibilité (aria), le
mobile (92 % de largeur), et quatre raccourcis tout prêts : `alert`,
`confirm`, `prompt`, `busy`.

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
| `theme`          | —      | Objet de variables CSS `{"--hm-accent": "#e91e63"}` pour CETTE instance |
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

### Thème par instance (sombre par défaut)

Toutes les variables (`--hm-*`) vivent sur la racine de la modale — jamais sur
`:root` — donc chaque instance peut être re-colorée indépendamment :

```js
HolafModal.open({
    title: "Important",
    theme: { "--hm-accent": "#e91e63", "--hm-accent-hover": "#f06292" },
});
```

---

## 3. Les raccourcis (helpers Promise)

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

---

## 4. Comportements garantis

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

---

## 5. Procédure de sync (mettre à jour / installer dans un projet)

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
`HolafModal.version` (v0.1.0).

---

## 6. Notes techniques

- Fichier **dual** : module ES (export) **et** global `window.HolafModal`.
- Un **seul** listener `keydown` au niveau document pour tout le module
  (Échap + Tab du focus trap), en capture, supprimé… jamais : installé une
  fois, il est inactif quand aucune modale n'est ouverte.
- `content` en string passe par `innerHTML` (le HTML fourni est réputé de
  confiance). Pour toute donnée utilisateur, passez un **Node** :
  `const p = document.createElement("p"); p.textContent = userInput;`
- Tests : `npm test` (vitest + jsdom) dans ce dépôt.