# HolafIcons — doc d'usage (brique holaf-lib v0.1.0)

Set d'icônes SVG en **trait** (style « feather »), destiné aux widgets Homy
(frame, link, clock, image, search, notes, weather, …) qui n'utilisent
aujourd'hui que des emojis.

Zéro dépendance runtime, **zéro CSS** : chaque icône utilise
`stroke="currentColor"` — c'est l'hôte qui colore via son propre CSS
(`color`) ; aucun style n'est injecté.

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-icons.js"></script>
<script>
    const svg = HolafIcons.render("clock");       // <svg …>…</svg>
</script>
```

**Option B — import ES Module :**

```js
import { HolafIcons } from "./vendor/holaf/holaf-icons.js";
```

---

## 2. Liste des icônes (stroke-currentColor, 24×24, stroke-width 2, fill none)

`layout` · `link` · `clock` · `image` · `bookmark` · `search` · `edit` ·
`cloud` · `x` · `plus` · `trash` · `pencil` · `gear` · `play` · `pause` ·
`arrow-right` · `eye` · `eye-off` · `chevron-down` · `chevron-up` ·
`chevron-left` · `chevron-right` · `check` · `alert-triangle` · `info` ·
`download` · `upload` · `copy` · `refresh` · `maximize` · `minimize` ·
`folder` · `terminal` · `git-branch` · `sun` · `moon`

> `HolafIcons.list()` retourne ce tableau (dans l'ordre de définition).

---

## 3. Usage

### `list()`
```js
const noms = HolafIcons.list(); // ["layout", "link", "clock", …]
```

### `get(name)` → SVG complet (24×24)
```js
const svg = HolafIcons.get("cloud");
// <svg xmlns="…" viewBox="0 0 24 24" width="24" height="24" fill="none"
//      stroke="currentColor" stroke-width="2" stroke-linecap="round"
//      stroke-linejoin="round"><path d="…"/></svg>
```

### `render(name, { size, class })` → SVG avec taille / class
```js
const icone = HolafIcons.render("clock", { size: 32, class: "widget-clock" });
// width="32" height="32" class="widget-clock"
```

`size` → `width`/`height` (défaut 24 · un `size` invalide retombe sur 24).
`class` → attribut `class` de l'élément `<svg>` (optionnel).

### Coloration par l'hôte (currentColor)
```js
// CSS du host :
.widget-clock { color: #06b6d4; }
```
L'icône hérite automatiquement de `currentColor` — aucun style interne.

### Erreur sur nom inconnu
```js
HolafIcons.get("plasma");
// TypeError : [HolafIcons] icône inconnue : 'plasma'. Disponibles : …
// Proches : play, pause, …
```
L'erreur liste toujours les noms **les plus proches** (distance de Levenshtein),
avec `←` sur les quasi-correspondances (fautes de frappe).

---

## 4. Intégration dans un widget (ex. `weather`/`clock` Homy)

```js
// widget clock : remplace l'emoji 🕐 par une vraie icône
document.querySelector(".widget-clock-icon").innerHTML =
    HolafIcons.render("clock", { size: 20 });
```

---

## 5. Crédit & licence

Les tracés sont repris du jeu d'icônes **[Feather Icons](https://feathericons.com/)**
de Cole Bemis, distribué sous **licence MIT** :

```
MIT License

Copyright (c) 2013-2017 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 6. Comment ajouter une icône

1. Dans `js/holaf-icons.js`, ajoute une entrée à la table `ICONS` :
   ```js
   "bell":  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>' +
            '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
   ```
2. Le nom devient automatiquement disponible via `get()`, `render()` et
   `list()` (et proposé dans l'erreur « Proches » pour les fautes de frappe).
3. Rien d'autre à faire : chaque corps SVG est un trait 24×24, `fill="none"`,
   `stroke="currentColor"`, `stroke-width="2"` — appliqués par le wrapper.
4. (Optionnel) documente l'icône dans la liste de la « §2 », et **incrémente la
   version PATCH** : en-tête + `const VERSION` du fichier.
