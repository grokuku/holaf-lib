# HolafColor — utilitaires couleur (brique holaf-lib v0.1.1)

Brique **sans style** (comme `viewport`) : des utilitaires couleur en **PUR JS,
sans DOM ni CSS**. Un seul fichier (`holaf-color.js`), zéro dépendance. Elle ne
touche pas au DOM, ne pose aucune variable CSS ni feuille de style — c'est une
boîte à outils pure.

**Version : 0.1.1**

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-color.js"></script>
<script>
    const c = HolafColor.contrastRatio("#ffffff", "#000000"); // 21
</script>
```

**Option B — import ES Module :**

```js
import { HolafColor } from "./vendor/holaf/holaf-color.js";
```

---

## 2. Fonctions

### Conversions

| Fonction | Entrée | Retour |
|----------|--------|--------|
| `hexToRgb(hex)` | `"#ff0000"` ou `"#f00"` | `[r, g, b]` (0-255) |
| `rgbToHex(r,g,b)` | `(255,0,0)` · `[255,0,0]` · `{r,g,b}` | `"#FF0000"` |
| `hexToHsl(hex)` | `"#ff0000"` | `[h, s, l]` (h 0-360, s/l 0-100) |
| `hslToHex(h,s,l)` | `(0,100,50)` · `[0,100,50]` | `"#FF0000"` |
| `rgbToHsl(r,g,b)` | `(255,0,0)` | `[0,100,50]` |
| `hslToRgb(h,s,l)` | `(0,100,50)` | `[255,0,0]` |

### Mix & tonalité

| Fonction | Rôle |
|----------|------|
| `mix(a, b, ratio)` | Mélange deux couleurs ; `ratio` 0..1 = part de `b` (0→`a`, 1→`b`). Retourne un hex. Accepte hex ou `[r,g,b]`. |
| `lighten(hex, amount)` | Éclaircit vers le blanc (`mix(hex, "#ffffff", amount)`). |
| `darken(hex, amount)` | Fonce vers le noir (`mix(hex, "#000000", amount)`). |

### Contraste & lisibilité (WCAG 2.1)

| Fonction | Rôle |
|----------|------|
| `contrastRatio(a, b)` | Luminance relative WCAG 2.1 → ratio 1..21 (`"#000"`/`"#fff"` = 21). |
| `readableText(bg, dark?, light?)` | Retourne `dark` (défaut `#000`) ou `light` (défaut `#fff`), **le plus lisible** sur `bg` — on préfère celui atteignant ≥ 4.5:1, sinon le plus contrasté. |

### Palette

| Fonction | Rôle |
|----------|------|
| `generateTheme(accent, options?)` | Retourne un objet de tokens **couleur** calculés à partir d'un accent (pur calcul, **rien n'est posé**). |
| `generateFamily(accent, options?)` | Retourne **`{ light, dark }`** : deux palettes `generateTheme`, une par fond (clair/sombre), le texte s'adaptant par contraste. |

### `generateTheme` — sortie (clés)

```js
generateTheme("#4f46e5")
// {
//   accent, accentHover (= mix accent/fond ~15 %), accentText (lisible ≥ 4.5:1),
//   border (mix ~22 %), borderSubtle (mix ~11 %),
//   surface, surfaceHover, background,
//   text (lisible sur surface ≥ 4.5:1), textMuted,
//   danger, dangerHover, dangerText (lisible ≥ 4.5:1),
//   radius, shadow
// }
```

Options :
| Option | Défaut | Rôle |
|--------|--------|------|
| `background` | `"#ffffff"` | Fond de base du thème. |
| `surface` | `mix(background, accent, 0.04)` | Surface principale. |
| `text` | texte lisible sur `background` | Couleur de texte principal. |
| `danger` | `"#dc2626"` | Couleur danger. |
| `accentText` / `dangerText` | lisible ≥ 4.5:1 | Texte des boutons accent/danger. |
| `hoverRatio` | `0.15` | Part mélangée pour les teintes `*-hover`. |
| `borderRatio` | `0.22` | Part mélangée pour les bordures. |
| `radius` | `"12px"` | Pass-through (non calculé). |
| `shadow` | ombre par défaut | Pass-through. |

---

### `generateFamily` — paire clair / sombre

`generateFamily(accent, options?)` appelle `generateTheme` **deux fois** avec
des fonds **opposés** et renvoie `{ light, dark }`. Comme le texte est calculé
par `readableText` (contraste **≥ 4.5:1**), il s'adapte à chaque fond : texte
**sombre** sur fond clair, texte **clair** sur fond sombre.

`options` :

| Option | Rôle |
|--------|------|
| `light` | Options transmises à `generateTheme` pour le **mode clair** (`background`, `surface`, `text`, `danger`, `accentText`, `dangerText`…). |
| `dark` | Idem pour le **mode sombre**. |
| `hoverRatio`, `borderRatio`, `radius`, `shadow` | Valeurs **partagées** par les deux modes (chaque mode peut les surcharger). |

Défauts : fond clair `"#ffffff"`, fond sombre `"#111111"`.

```js
import { HolafColor } from "./vendor/holaf/holaf-color.js";

const fam = HolafColor.generateFamily("#818cf8", {
    light: { background: "#f6f7fc", surface: "#ffffff" },
    dark:  { background: "#10111d", surface: "#181a2c" },
    radius: "12px",
});

fam.light.text;       // texte sombre sur le fond clair
fam.dark.text;        // texte clair sur le fond sombre
HolafColor.contrastRatio(fam.light.text, fam.light.background); // ≥ 4.5
HolafColor.contrastRatio(fam.dark.text,  fam.dark.background);  // ≥ 4.5
```

> `generateFamily` est **exposée dans les deux modes** : `HolafColor.generateFamily`
> (global) **et** l'export ESM (`import { HolafColor }`).

---

## 3. Notes

- **Zéro CSS / zéro DOM** : la brique ne pose aucun style et ne lit aucun
  élément — utilisable en `headless` (Node, canvas…).
- **Validation** : un hex invalide lève une `Error` claire
  (`[HolafColor] hex invalide : …`). Les autres arguments sont bornés/coercés
  proprement (ratio borné à `[0,1]`, canaux rgb bornés à `[0,255]` et arrondis).
- **Convention de sortie** : les conversions renvoient des tableaux
  `[r,g,b]` / `[h,s,l]` ; `rgbToHex`/`mix`/`lighten`/`darken`/`hslToHex`
  renvoient des hex `#RRGGBB` (majuscules).
- **VERSION** : disponible via `HolafColor.VERSION` (sync en-tête + const).

---

## 4. Version

- **0.1.1** — ajout de `generateFamily(accent, options?)` → `{ light, dark }`
  (deux palettes `generateTheme`, fonds clair/sombre, texte adaptatif).
- **0.1.0** — première version (brique autonome, sans style).
