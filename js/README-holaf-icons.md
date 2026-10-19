# HolafIcons — doc d'usage (brique holaf-lib v0.1.7)

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

`bar-chart` · `shield` · `globe` · `layout` · `link` · `clock` · `image` ·
`bookmark` · `search` · `edit` ·
`cloud` · `x` · `plus` · `trash` · `pencil` · `gear` · `play` · `pause` ·
`stop` · `arrow-right` · `eye` · `eye-off` · `chevron-down` · `chevron-up` ·
`chevron-left` · `chevron-right` · `check` · `alert-triangle` · `info` ·
`download` · `upload` · `copy` · `refresh` · `maximize` · `minimize` ·
`folder` · `terminal` · `git-branch` · `sun` · `moon` ·
`file-text` · `external-link` · `arrow-up-circle` · `arrow-up` · `arrow-down` ·
`user` · `key` · `power` · `star` · `folder-open` · `brain` ·
`arrow-left` · `volume` · `volume-off` ·
`file` · `file-down` · `folder-plus` · `folder-x` ·
`save` · `send` · `undo-2` · `redo-2` · `unlink` · `zoom-in` · `zoom-out` ·
`message-square-plus` ·
`check-check` · `check-circle` · `check-square` · `plus-square` · `square` ·
`toggle-left` · `toggle-right` ·
`code` · `cpu` · `git-commit` · `keyboard` · `wifi` · `wrench` · `test-tube` ·
`calendar` · `hash` · `pie-chart` · `trending-up` · `gauge` ·
`package` · `palette` · `puzzle` · `lightbulb` · `sparkles` · `mail` ·
`paperclip` · `image-off` ·
`lock` · `lock-open` · `ban` ·
`users` · `message-square` · `heart` ·
`monitor` · `video` ·
`filter` · `tag` · `shuffle` · `dices` ·
`crosshair` · `circle` · `grip-vertical` ·
`eraser` ·
`loader` · `skip-forward` ·
`syringe` · `recycle` · `scaling`

> **114 icônes** au total. `HolafIcons.list()` retourne ce tableau (dans l'ordre
> de définition). Les 21 dernières sont les ajouts **v0.1.7** (migration
> d'icônes d'AI-Helper), tracés **Lucide** (ISC) — voir §7.

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

Les tracés ne proviennent pas uniquement de Feather : ils peuvent être repris
de **n'importe quelle collection** disponible via
**[icons0.dev](https://icons0.dev/)** (voir §6, étape 0).

**icons0.dev n'est PAS un fournisseur d'icônes** : c'est un **moteur de
recherche multi-collections** (200k+ icônes, 150+ collections open source) qui
ne détient aucun droit sur les tracés qu'il indexe.

**La licence d'un tracé est celle de sa COLLECTION D'ORIGINE** — pas de
Feather systématique, et aucune « licence icons0.dev ». **Vérifie la licence de
la collection avant de copier un tracé** : les collections disponibles
mélangent des licences permissives (MIT, ISC, Apache-2.0, CC0, Unlicense) et
des licences copyleft/restrictives (GPL, CC BY-NC 4.0, CC BY-NC-SA, CC BY-SA).

### Règles de sélection du set (`holaf-icons`)

- **Seules les collections permissives sont admises** (MIT, ISC,
  Apache-2.0, CC0, Unlicense). Aucun tracé **GPL / copyleft / non-commercial**
  n'entre dans la brique.
- **Style retenu : trait (`stroke`) uniquement**, `stroke-width="2"`,
  `fill="none"`, 24×24, `currentColor`. Priorité à **Lucide** (préfixe
  `lucide:`, ISC), repli sur **Feather** (`feather:`, MIT) si la recherche
  Lucide ne renvoie rien. Les styles **« filled » / « duotone » / colorés**
  sont écartés (incompatibles avec le wrapper `buildSvg`).
- Le tracé est repris **à l'identique** (géométrie inchangée) : on ne retire
  que le groupe `<g>` englobant et les attributs de présentation fournis par
  le wrapper (voir §6, étape 1).

La plupart des tracés du set viennent de collections sous licence permissive :
**[Feather Icons](https://feathericons.com/)** (MIT), **Tabler Icons** (MIT),
et, depuis les v0.1.6 et v0.1.7, **Lucide** (ISC) — plus quelques tracés
propres au set (style Feather). Feather est distribué sous **licence MIT** :

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

La v0.1.6 reprend 39 tracés de **Lucide** (`lucide-react` v0.446.0, dont
certaines icônes dérivent de Feather) et la v0.1.7 en reprend 21 de plus
(**Lucide**, sourcés via l'API icons0.dev), Lucide étant distribué sous
**licence ISC** :

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part
of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 6. Comment ajouter une icône

0. **Cherche l'icône sur [icons0.dev](https://icons0.dev/) avant tout.**
   L'API JSON publique (sans clé) renvoie directement le tracé :
   ```
   GET https://icons0.dev/api/icons?q=<prefix>:<nom>
   # ex. : https://icons0.dev/api/icons?q=lucide:bot
   ```
   La réponse contient un tableau `results` ; chaque entrée porte `fullName`,
   `name`, `prefix`, `collection`, `width`/`height` et **`body`** — le SVG
   24×24 (déjà en `currentColor`), au format attendu par la table `ICONS`.
   **Vérifie la licence de la collection d'origine (§5) avant de copier le
   tracé** : seules les collections **permissives** sont admises (MIT, ISC,
   Apache-2.0, CC0, Unlicense — jamais GPL/copyleft/non-commercial).
   **Style** : viser **Lucide** (`lucide:<nom>`, ISC) ; si la requête `lucide:`
   ne renvoie rien d'exploitable, se replier sur **Feather** (`feather:<nom>`,
   MIT). Refuser tout tracé « filled »/« duotone ».
   `q=` fait une **recherche** (résultats approchants) : ne retiens que
   l'entrée dont `fullName` vaut **exactement** `<prefix>:<nom>`.

   > **Attention au nommage** : le nom de la brique est un nom **sémantique**,
   > pas nécessairement le nom de la collection. Ex. `loader` ←
   > `lucide:loader-circle`, `volume` ← `feather:volume-2`, `volume-off` ←
   > `feather:volume-x`, `test-tube` ← `lucide:test-tube-2`. Documente l'alias
   > dans le commentaire de la table **et** au §7.

1. Dans `js/holaf-icons.js`, ajoute une entrée à la table `ICONS` :
   ```js
   "bell":  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>' +
            '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
   ```
   **Normalise le `body` avant de le coller** (géométrie inchangée) :
   - retire le groupe `<g fill="none" …>` **englobant** s'il existe (le wrapper
     `buildSvg` porte déjà `stroke`, `fill`, `stroke-width`, `stroke-linecap`,
     `stroke-linejoin`) ;
   - retire des éléments les mêmes attributs de présentation
     (`fill="none"`, `stroke="currentColor"`, `stroke-width`, `*-linecap`,
     `*-linejoin`) — **sauf** les `fill="currentColor"` des points pleins
     (ex. le point de `tag`, les points de `palette`) ;
   - convertit les balises auto-fermantes (`<path … />`) en `<path …></path>`
     (style de la table).
   Si une requête ne renvoie **rien d'exploitable**, replie-toi sur
   `feather:` ; si les deux échouent, **n'invente jamais de tracé** : signale
   l'icône manquante.
2. Le nom devient automatiquement disponible via `get()`, `render()` et
   `list()` (et proposé dans l'erreur « Proches » pour les fautes de frappe).
3. Rien d'autre à faire : chaque corps SVG est un trait 24×24, `fill="none"`,
   `stroke="currentColor"`, `stroke-width="2"` — appliqués par le wrapper.
4. (Optionnel) documente l'icône dans la liste de la « §2 ».
5. **Incrémente la version PATCH** : en-tête + `const VERSION` +
   `manifest.json` — les trois synchronisés (ainsi que la ligne du tableau
   `icons` de `README.md` racine et le compte d'icônes).

---

## 7. Version

- **0.1.7** — +21 icônes pour la **phase 0 du plan de migration d'icônes
d'AI-Helper** : `lock`, `lock-open`, `ban`, `users`, `message-square`,
`heart`, `monitor`, `video`, `filter`, `tag`, `shuffle`, `dices`,
`crosshair`, `circle`, `grip-vertical`, `eraser`, `loader`, `skip-forward`,
`syringe`, `recycle`, `scaling`. Tracés **repris à l'identique de la
collection Lucide** (licence **ISC** — Lucide Contributors, portions Feather
MIT ; texte au §5), **sourcés via l'API de
[icons0.dev](https://icons0.dev/)** : `GET /api/icons?q=lucide:<nom>` → champ
`body`, puis retrait du `<g>` englobant et des attributs de présentation
(aucune géométrie modifiée — vérifié icône par icône contre le `body` de
l'API). Un seul alias de nom : `loader` reprend `lucide:loader-circle` (nom
court demandé par AI-Helper). Aucun repli Feather n'a été nécessaire et aucun
nom n'était déjà présent. Compte : **93 → 114** icônes. En-tête +
`const VERSION` + `manifest.json` + tableau `icons` de `README.md` racine
synchronisés (règle du §6, étape 5).
- **0.1.6** — +39 icônes pour **finir la migration d'icônes de Pi-Web** :
  `file`, `file-down`, `folder-plus`, `folder-x`, `save`, `send`, `undo-2`,
  `redo-2`, `unlink`, `zoom-in`, `zoom-out`, `message-square-plus`,
  `check-check`, `check-circle`, `check-square`, `plus-square`, `square`,
  `toggle-left`, `toggle-right`, `code`, `cpu`, `git-commit`, `keyboard`,
  `wifi`, `wrench`, `test-tube`, `calendar`, `hash`, `pie-chart`,
  `trending-up`, `gauge`, `package`, `palette`, `puzzle`, `lightbulb`,
  `sparkles`, `mail`, `paperclip`, `image-off`. Tracés repris **à l'identique
  de lucide-react v0.446.0** (licence **ISC** — Lucide Contributors, portions
  Feather MIT ; texte au §5) : la parité de rendu a été vérifiée icône par
  icône (innerHTML identique), aucun changement visuel à la migration. Deux
  noms sémantiques courts : `test-tube` reprend le tracé Lucide `test-tube-2`
  (tube incliné) et `check-circle`/`check-square` les tracés Lucide
  `circle-check-big`/`square-check-big` (alias actuels de `CheckCircle` /
  `CheckSquare` côté lucide-react). En-tête + `const VERSION` + `manifest.json`
  synchronisés (règle du §6, étape 5).
- **0.1.5** — +3 icônes pour la migration d'icônes de Yuki : `arrow-left`,
  `volume`, `volume-off` (tracés **Feather littéraux**, MIT — Cole Bemis).
  `arrow-left` est le miroir exact de `arrow-right` ; `volume` reprend le tracé
  Feather `volume-2` (haut-parleur + ondes) sous le nom court, et `volume-off`
  le tracé Feather `volume-x` (haut-parleur barré) sous le nom sémantique
  `volume-off` (Feather nomme cette icône `volume-x`). En-tête + `const VERSION`
  + `manifest.json` synchronisés (règle du §6, étape 5).
- **0.1.4** — +11 icônes pour la migration d'icônes de Pi-Web : `file-text`,
  `external-link`, `arrow-up-circle`, `arrow-up`, `arrow-down`, `user`, `key`,
  `power`, `star` (tracés **Feather littéraux**, MIT — Cole Bemis) et
  `folder-open`, `brain` (tracés **Tabler Icons**, MIT — absents de Feather :
  Feather ne fournit pas de dossier-ouvert ni de cerveau). En-tête +
  `const VERSION` + `manifest.json` synchronisés (règle du §6, étape 5).
- **0.1.3** — convention de recherche d'icônes : les tracés peuvent être
  repris de n'importe quelle collection via [icons0.dev](https://icons0.dev/)
  (nouvelle étape 0 au §6 ; licence = collection d'origine rappelée au §5) ;
  en-tête + `const VERSION` + `manifest.json` synchronisés (règle du §6,
  étape 5).
- **0.1.2** — ajout de `stop` (carré centré, coins arrondis) pour distinguer
  l'arrêt de la pause ; en-tête + `const VERSION` + `manifest.json`
  synchronisés (règle du §6, étape 5).
- **0.1.1** — ajout de `bar-chart`, `shield` et `globe` ; clarification du
  crédit : `bar-chart` est un tracé propre au set (style Feather, mais **pas**
  un tracé Feather littéral). En-tête + `const VERSION` + `manifest.json`
  synchronisés (règle du §6, étape 5).
- **0.1.0** — première version (36 icônes en trait, zéro CSS).
