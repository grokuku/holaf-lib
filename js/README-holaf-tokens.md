# HolafTokens — tokens CSS de page (brique holaf-lib v0.2.0)

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

**Version : 0.2.0**

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

## 2. Catalogue à 2 axes : famille × mode

Depuis **0.2.0**, les thèmes forment un **catalogue à deux axes** :

- **Axe 1 — la famille** : une identité chromatique (une graine d'accent + des
  fonds). Il y en a **5** : `indigo`, `midnight`, `slate`, `emerald`, `amber`.
- **Axe 2 — le mode** : `light` ou `dark`.

Chaque croisement est un **preset** nommé **`<famille>-<mode>`** → **10 presets** :

| Preset | Famille | Mode | Accent | Accent-text | Surface | Texte | Contraste texte/surface |
|--------|---------|------|--------|-------------|---------|-------|--------------------------|
| `indigo-light`   | indigo  | light | `#4f46e5` | `#ffffff` | `#ffffff` | `#18181b` | 17.72:1 |
| `indigo-dark`    | indigo  | dark  | `#6366f1` | `#ffffff` | `#1e1e1e` | `#e4e4e7` | 13.14:1 |
| `midnight-light` | midnight| light | `#5b63d3` | `#ffffff` | `#f6f7fc` | `#18181b` | 16.56:1 |
| `midnight-dark`  | midnight| dark  | `#818cf8` | `#10111d` | `#10111d` | `#e2e4f0` | 14.81:1 |
| `slate-light`    | slate   | light | `#475569` | `#ffffff` | `#f4f6f8` | `#18181b` | 16.35:1 |
| `slate-dark`     | slate   | dark  | `#94a3b8` | `#1f232b` | `#1f232b` | `#e6e9ee` | 12.94:1 |
| `emerald-light`  | emerald | light | `#047857` | `#ffffff` | `#ffffff` | `#18181b` | 17.72:1 |
| `emerald-dark`   | emerald | dark  | `#34d399` | `#000000` | `#0b1512` | `#f4f4f5` | 16.90:1 |
| `amber-light`    | amber   | light | `#b45309` | `#ffffff` | `#ffffff` | `#18181b` | 17.72:1 |
| `amber-dark`     | amber   | dark  | `#fbbf24` | `#000000` | `#1a1408` | `#f4f4f5` | 16.65:1 |

> Tableau **indicatif** (accent / accent-text / surface / texte / ratio de
> contraste) ; les **14 clés** complètes de chaque preset sont exposées par
> `HolafTokens.PRESETS`. Le tableau exhaustif (clé par clé) figure dans le
> rapport de lot.

### Familles

| Famille | Graine (accent) | Fond clair | Fond sombre | Origine |
|---------|-----------------|------------|-------------|---------|
| `indigo`  | `#6366f1` | `#ffffff` | `#1e1e1e` | Palettes **historiques** (figées, les deux modes) |
| `midnight`| `#818cf8` | `#f6f7fc` | `#10111d` | Mode sombre **historique** figé + mode clair **généré** |
| `slate`   | `#94a3b8` | `#f4f6f8` | `#1f232b` | Mode sombre **historique** figé + mode clair **généré** |
| `emerald` | `#10b981` | `#ffffff` | `#0b1512` | **Générée** dans les deux modes |
| `amber`   | `#f59e0b` | `#ffffff` | `#1a1408` | **Générée** dans les deux modes |

Les modes **générés** sont calculés par une version **minimale interne** du
`generateTheme` de HolafColor (mêmes ratios, même calcul de contraste) ; le
texte s'adapte automatiquement au fond (**≥ 4.5:1**). Les palettes **figées**
indigo / midnight-dark / slate-dark sont **identiques au bit près** aux presets
livrés en 0.1.0.

### Alias rétrocompatibles (zéro rupture)

Les **4 presets historiques** restent utilisables et pointent sur leur jumeau :

| Alias | Équivaut à |
|-------|------------|
| `dark`     | `indigo-dark`   |
| `light`    | `indigo-light`  |
| `midnight` | `midnight-dark` |
| `slate`    | `slate-dark`    |

`dark` / `light` / `midnight` / `slate` ont donc **exactement** les valeurs
d'antan (test de non-régression dans `tests/holaf-tokens.test.js`).

```js
HolafTokens.setTheme("midnight");      // alias → midnight-dark (inchangé)
HolafTokens.setTheme("slate-light");   // nom <famille>-<mode>
HolafTokens.setFamily("emerald", "dark"); // équivaut à setTheme("emerald-dark")
```

`HolafTokens.listPresets()` → les **14** noms valides (10 `<famille>-<mode>` +
4 alias). `HolafTokens.listFamilies()` → `["indigo", "midnight", "slate",
"emerald", "amber"]`.

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
| `HolafTokens.setTheme(presetName)` | Applique un preset par son nom — **10 `<famille>-<mode>` ET 4 alias** (throw clair si inconnu). |
| `HolafTokens.setFamily(family, mode?)` | Applique `<famille>-<mode>`. Sans `mode` : garde le mode courant de la famille si elle est active, sinon `light`. |
| `HolafTokens.getTheme()` | → `{ name, vars }` (copie des `--holaf-*` posées) ou `null` après `reset()`. |
| `HolafTokens.getFamily()` / `getMode()` | → axe 1 / axe 2 du thème courant (alias résolus), ou `null`. |
| `HolafTokens.applyPalette(accentHex, options?)` | Génère et pose une palette dérivée d'un accent (calculs internes **mix/contrast** — **PAS de dépendance inter-briques** vers HolafColor). |
| `HolafTokens.reset()` | **Retire toutes** les variables `--holaf-*` posées (retour à « sans thème », aucun preset n'est réappliqué). |
| `HolafTokens.listPresets()` | Tous les noms de presets valides (10 famille-mode + 4 alias). |
| `HolafTokens.listFamilies()` | Noms des familles (axe 1). |
| `HolafTokens.FAMILIES` / `HolafTokens.ALIASES` | Copie du descripteur des familles (graine + descripteurs de modes) / table des alias. |
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

### Modèle 2 axes — sélection

```js
// Par nom de preset <famille>-<mode> :
HolafTokens.setTheme("slate-light");
HolafTokens.setTheme("amber-dark");

// Par couple famille + mode :
HolafTokens.setFamily("emerald", "dark");  // → emerald-dark
HolafTokens.setFamily("emerald");          // garde le mode courant → emerald-dark

// Décrire le thème courant (alias résolus) :
HolafTokens.setTheme("dark");
HolafTokens.getFamily(); // → "indigo"
HolafTokens.getMode();   // → "dark"

// Parcourir le catalogue :
HolafTokens.listFamilies(); // ["indigo", "midnight", "slate", "emerald", "amber"]
HolafTokens.listPresets();  // 10 famille-mode + 4 alias
```

### Projection `generateTheme` → clés de tokens

Les modes **générés** sont produits par une version minimale interne du
`generateTheme` de HolafColor, puis **projetés** sur les clés de tokens :

| Clé de token | Source (`generateTheme`) |
|--------------|--------------------------|
| `surface` | `p.background` (le fond de base devient la surface de page) |
| `surface-elev` | `p.surface` *(dérivée)* |
| `surface-raised` | `p.surfaceHover` *(dérivée)* |
| `border` | `p.border` |
| `text` | `p.text` |
| `text-muted` | `p.textMuted` |
| `accent` | `p.accent` |
| `accent-hover` | `p.accentHover` |
| `accent-text` | `p.accentText` |
| `danger` | `p.danger` |
| `danger-hover` | `p.dangerHover` *(dérivée)* |
| `danger-text` | `p.dangerText` |
| `radius` | `p.radius` |
| `shadow` | `p.shadow` |
| `font-size` | constante `"14px"` |

Les modes **figés** (indigo-light, indigo-dark, midnight-dark, slate-dark)
portent les **14 clés historiques** (sans `danger-hover`) ; les modes
**générés** en portent **15** (les 3 dérivées `surface-elev`, `surface-raised`
étant projetés, plus `danger-hover` dérivé de `danger`).

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

- **0.2.0** — catalogue à **2 axes** : 5 familles × clair/sombre → 10 presets
  `<famille>-<mode>` + 4 alias historiques rétrocompatibles ; API
  `setFamily` / `getFamily` / `getMode` / `listFamilies` ; `FAMILIES` et
  `ALIASES` exposés. Générateur interne (miroir de `generateTheme`).
- **0.1.0** — première version (brique FONDATION, tokens de page, 4 presets,
  `applyPalette`, événement `holaf-tokens-changed`).
