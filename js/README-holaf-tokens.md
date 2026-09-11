# HolafTokens — tokens CSS de page (brique holaf-lib v0.1.0)

Brique **FONDATION** : elle pose les **tokens CSS de PAGE** sous le préfixe
**réservé `--holaf-*`** sur `:root`. Un seul fichier (`holaf-tokens.js`), zéro
dépendance.

## ⚠️ Contrat de privilège (FONDATION)

**HolafTokens est la SEULE brique du kit autorisée à poser des variables CSS
sur `:root`.** C'est l'exception à la règle du kit (« chaque brique scope son
CSS sous ses propres classes, **jamais sur :root** »).

> **Installer cette brique, c'est choisir (opt-in) d'installer un THÈME GLOBAL
> de page.** Elle prend le contrôle de la palette : surfaces, texte, accent,
> danger, rayon, ombre, taille de base. Si vous voulez seulement des composants
> isolés, ne l'installez pas — elle est volontairement intrusive (par contrat).

### SANS RENDU

La brique **ne rend aucun élément** : elle ne fait que poser / retirer des
variables CSS sur `:root`. Le CSS auto-injecté est donc minimal (un repère
documenté, injecté une seule fois) — **rien de scopé n'est nécessaire**.

**Version : 0.1.0**

---

## 1. Inclure la brique

```html
<!-- Chargement global : window.HolafTokens devient disponible partout -->
<script type="module" src="vendor/holaf/holaf-tokens.js"></script>
<script>
    HolafTokens.setTheme("dark");
</script>
```

Ou en modern JavaScript :

```js
import { HolafTokens } from "./vendor/holaf/holaf-tokens.js";
```

Au chargement, **si l'hôte n'a fait aucun choix**, la brique applique le
**preset initial issu de `prefers-color-scheme`** (`dark` ou `light`).

---

## 2. Presets

Les **4 presets** (`dark` / `light` / `midnight` / `slate`) sont **cohérents
avec les presets de HolafModal** (mêmes noms, valeurs alignées) : la page et
ses modales partagent la même ambiance. Les textes sont **≥ 4.5:1** sur leurs
surfaces (réutilise les ratios des presets modal).

```js
HolafTokens.setTheme("midnight");
HolafTokens.setTheme("light");   // etc.
```

`HolafTokens.listPresets()` → `["dark", "light", "midnight", "slate"]`.

---

## 3. Tokens posés sur `:root` (préfixe `--holaf-*`)

| Token | Variable | Préfixe hôte (ex. Homy) |
|-------|----------|--------------------------|
| surface | `--holaf-surface` | `--bg` |
| surface-elev | `--holaf-surface-elev` | `--bg-elev` |
| surface-raised | `--holaf-surface-raised` | `--bg-elev-2` |
| border | `--holaf-border` | `--border` |
| text | `--holaf-text` | `--text` |
| text-muted | `--holaf-text-muted` | `--text-muted` |
| accent | `--holaf-accent` | `--accent` |
| accent-hover | `--holaf-accent-hover` | `--accent-hover` |
| accent-text | `--holaf-accent-text` | *(lisible ≥ 4.5:1 sur accent)* |
| danger | `--holaf-danger` | `--danger` |
| danger-hover | `--holaf-danger-hover` | *(dérivé)* |
| danger-text | `--holaf-danger-text` | *(lisible ≥ 4.5:1 sur danger)* |
| radius | `--holaf-radius` | `--radius` |
| shadow | `--holaf-shadow` | `--shadow` |
| font-size | `--holaf-font-size` | *(taille de base)* |

### Mapping hôte (ex. Homy — ses 11 vars actuelles)

```css
:root {
    /* Homy → brique HolafTokens (FONDATION) */
    --bg:         var(--holaf-surface);
    --bg-elev:    var(--holaf-surface-elev);
    --bg-elev-2:  var(--holaf-surface-raised);
    --border:     var(--holaf-border);
    --text:       var(--holaf-text);
    --text-muted: var(--holaf-text-muted);
    --accent:         var(--holaf-accent);
    --accent-hover:   var(--holaf-accent-hover);
    --danger:     var(--holaf-danger);
    --radius:     var(--holaf-radius);
    --shadow:     var(--holaf-shadow);
}
```

---

## 4. API

| Fonction | Rôle |
|----------|------|
| `HolafTokens.setTokens({ name?, values })` | Pose des tokens (clés non-préfixées → préfixées `--holaf-*` ; clés déjà `--…` passées telles quelles). |
| `HolafTokens.setTheme(presetName)` | Applique un preset (throw clair si inconnu). |
| `HolafTokens.getTheme()` | → `{ name, vars }` (copie des `--holaf-*` posées) ou `null` après `reset()`. |
| `HolafTokens.applyPalette(accentHex, options?)` | Génère et pose une palette dérivée d'un accent (calculs internes **mix/contrast** — **PAS de dépendance inter-briques** vers HolafColor). |
| `HolafTokens.reset()` | **Retire toutes** les variables `--holaf-*` posées (retour à « sans thème », aucun preset n'est réappliqué). |
| `HolafTokens.listPresets()` | Noms des presets. |
| `HolafTokens.VERSION` | Version (sync en-tête + const). |

### `setTokens` — exemples

```js
// Pose des tokens customs (clés préfixées automatiquement)
HolafTokens.setTokens({
    name: "ma-palette",
    values: { surface: "#111", text: "#eee", accent: "#1e90ff" },
});

// Clés déjà préfixées : passées telles quelles
HolafTokens.setTokens({ values: { "--holaf-accent": "#123456" } });
```

### `applyPalette` — exemple

```js
// Base = preset en cours (sinon dark) → accent + dérivés cohérents
HolafTokens.setTheme("dark");
HolafTokens.applyPalette("#6366f1");
```

La palette est calculée **et posée** : `accent-hover = mix(accent, surface,
15 %)`, `border = mix(surface, accent, ~22 %)`, `accent-text` = la plus
lisible sur l'accent (≥ 4.5:1 quand possible), etc.

### Événement

À **chaque changement** (`setTokens` / `setTheme` / `applyPalette` / `reset`,
et le preset initial), la brique dispatch sur `document` :

```js
document.addEventListener("holaf-tokens-changed", (e) => {
    const theme = e.detail.theme; // nom de preset (string) ou { vars } / null (reset)
});
```

---

## 5. Contraste

Presets et palette calculée garantissent **textes ≥ 4.5:1** sur leurs surfaces
(WCAG AA) : `text` ≥ 4.5:1 sur `surface` / `surface-elev` / `surface-raised`,
`accent-text` et `danger-text` lisibles sur leur teinte.

---

## 6. Persistance (côté hôte)

Comme `modal` et `toast`, **la brique ne persiste rien**. Le thème global est
volatile ; si vous voulez mémoriser le choix de l'utilisateur (ex. dans
`localStorage`), c'est à l'**hôte** de le faire et de rejouer `setTheme` /
`setTokens` à l'init. Ex. :

```js
const saved = localStorage.getItem("homy-theme");
HolafTokens.setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
```

---

## 7. Version

- **0.1.0** — première version (brique FONDATION, tokens de page, 4 presets,
  `applyPalette`, événement `holaf-tokens-changed`).
