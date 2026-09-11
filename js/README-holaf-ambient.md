# HolafAmbient — doc d'usage (brique holaf-lib v0.2.0)

Fonds animés canvas, **sans style** : la brique dessine MAIS ne touche pas au
layout. Le host fournit un `<canvas>` (existant ou via sélecteur) et le
positionne / le dimensionne lui-même ; la brique ne modifie que le
**backing store** (`canvas.width/height`) et le contenu dessiné — jamais de CSS
sur l'élément.

Un seul fichier (`holaf-ambient.js`), zéro dépendance runtime, **zéro CSS
injecté**, **fond transparent** (le fond de page du host reste visible, y
compris en mode `aurora`).

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-ambient.js"></script>
<script>
    const a = HolafAmbient.create({ target: document.getElementById("bg"), mode: "waves" });
</script>
```

**Option B — import ES Module :**

```js
import { HolafAmbient } from "./vendor/holaf/holaf-ambient.js";
```

---

## 2. Les 3 modes

| Mode          | Rendu |
|---------------|-------|
| `'waves'`     | **Rubans liquides** : bandes qui suivent deux sinusoïdes superposées, rendues en 3 passes (halo diffus, corps à dégradé vertical, ligne de crête). Empilées avec `lighter`, elles se mélangent comme un dégradé vivant. |
| `'particles'` | **Halos** dérivants en profondeur (parallaxe : taille, opacité et vitesse selon la distance) + **liaisons** légères et colorées entre voisins (option `links`). |
| `'aurora'`    | **Nappes lumineuses** floutées qui dérivent sur des trajectoires Lissajous continues, en overlay `lighter`. Transparent (aucune plaque de fond). |

```js
HolafAmbient.create({ target: canvas, mode: "particles" });
HolafAmbient.create({ target: canvas, mode: "aurora" });
```

Le mode par défaut est `'waves'`. Un mode inconnu lève une erreur claire
listant les 3 valeurs valides.

---

## 3. Config

| Option      | Défaut                    | Rôle |
|-------------|---------------------------|------|
| `target`    | **requis**                | `<canvas>` existant **ou** sélecteur CSS (ex. `"#bg"`). Erreur si introuvable / non-canvas. |
| `mode`      | `'waves'`                 | `'waves'` · `'particles'` · `'aurora'`. |
| `colors`    | `["#3b82f6","#22d3ee","#a78bfa","#f472b6","#fbbf24"]` | Palette hex. Le **color cycling** mélange les couleurs en continu, et chaque élément reçoit une teinte **étalée sur tout le cycle** (le rendu n'est jamais monochrome). |
| `speed`     | `1`                       | Multiplicateur de temps, appliqué **une seule fois** (déplacement, phases, cycle de couleur). `speed: 0` fige l'animation. |
| `density`   | `10`                      | **Curseur d'intensité 1..100**, commun aux 3 modes : la brique en déduit un nombre d'éléments sensé pour chacun (voir §3.1). |
| `opacity`   | `1`                       | Opacité du rendu (`0..1`). |
| `links`     | `true`                    | Particles : dessine les liaisons entre particules proches. |
| `blur`      | `0`                       | **Flou gaussien global** du rendu, en px CSS (`0..40`). Implémenté par canvas hors-écran + `ctx.filter` → toujours **zéro CSS** sur l'élément, et ignoré (rendu net) là où `ctx.filter` n'existe pas (Safari < 18). |
| `grain`     | `0.022`                   | (Avancé) intensité du bruit anti-banding `source-atop` (`0` = désactivé). Sauté automatiquement si `blur >= 2`, si le canvas est très grand, ou si le contexte ne permet pas de fabriquer la texture. |

Options invalides : `mode` inconnu → exception ; `colors` filtrées (au moins une
couleur garantie) ; `speed`, `density`, `opacity`, `blur`, `grain` bornés.

### 3.1 `density` → nombre d'éléments

| `density` | waves (rubans) | particles | aurora (nappes) |
|-----------|----------------|-----------|-----------------|
| 1         | 2              | 20        | 3               |
| **10** (défaut) | **5**    | **60**    | **6**           |
| 30        | 10 (max)       | 180       | 10 (max)        |
| 100       | 10 (max)       | 220 (max) | 10 (max)        |

La même fonction est exposée pour les UI de réglages (afficher « ≈ N rubans ») :

```js
HolafAmbient.elementCount("particles", 10); // → 60
```

### Modifier la config en cours de vol

```js
const a = HolafAmbient.create({ target: canvas, colors: ["#ff5","#0ff"] });
a.setConfig({ mode: "aurora", speed: 2, opacity: 0.7 });
a.setConfig({ blur: 12 });                       // adoucit tout le rendu
a.setConfig({ mode: "particles", density: 40, links: false });
```

`setConfig(partial)` valide chaque champ (mode inconnu → erreur, colors filtrées).
Changer `mode`, `density` ou `colors` régénère ce qu'il faut (particules,
sprites) ; changer `blur` crée le tampon hors-écran à la volée.

---

## 4. Performance (obligatoire)

- **`requestAnimationFrame`** : une seule boucle par instance (pas de `setInterval`).
- **Horloge dt** (bornée à 50 ms) : l'animation est **indépendante du
  framerate** (60 Hz / 120 Hz / frame perdue = même vitesse apparente).
- **`devicePixelRatio` respecté** : backing store = `css × dpr`, `ctx.setTransform(dpr, …)`.
- **Pause automatique** sur `document.visibilitychange` (`hidden`) → la boucle
  s'arrête ; `visible` → reprise.
- **`prefers-reduced-motion`** → rendu **statique** : une seule frame, aucune boucle.
- **`ResizeObserver`** sur le target : re-dimensionnement + régénération, et le
  canvas est **redessiné immédiatement** (jamais de fond vide après un resize,
  même en pause ou en reduced-motion).
- **`blur > 0`** : un canvas hors-écran supplémentaire + un `drawImage` filtré par
  frame (accéléré GPU). Inutile de l'activer si `opacity` suffit.
- **`destroy()`** = `cancelAnimationFrame` + `disconnect` du ResizeObserver +
  suppression du listener `visibilitychange` → **aucune fuite**.

---

## 5. API de l'instance

`create(opts)` → `{ destroy(), setConfig(partial), pause(), resume(), getConfig(), VERSION }`

```js
const a = HolafAmbient.create({ target: canvas });
a.pause();                 // coupe la boucle
a.resume();                // relance
const cfg = a.getConfig(); // { mode, colors, speed, density, opacity, links, blur, grain }
a.destroy();               // cancel + disconnect + listeners retirés
```

---

## 6. Exemples

**Fond de dashboard (Homy) — mode procedural avec flou doux :**

```js
HolafAmbient.create({
    target: "#bg-canvas",
    mode: "aurora",
    colors: ["#7dd3fc", "#38bdf8", "#818cf8"],
    speed: 0.8,
    density: 10,
    opacity: 0.9,
    blur: 10,
});
```

**Fond de widget `weather` — waves discrètes :**

```js
const a = HolafAmbient.create({
    target: document.querySelector(".weather-bg"), // <canvas> posé par le widget
    mode: "waves",
    colors: ["#22d3ee", "#a78bfa", "#f472b6", "#34d399"],
    density: 6,
    opacity: 0.7,
});
// nettoyage à la fermeture
window.addEventListener("beforeunload", () => a.destroy());
```

---

## 7. Migration 0.1.0 → 0.2.0

| Changement | Impact pour un host |
|---|---|
| Rendu des 3 modes refondu (rubans / halos en profondeur / nappes transparentes) | Visuel différent → **vérifier la lisibilité** au-dessus du fond (les widgets doivent rester lisibles). |
| `aurora` ne peint plus de fond opaque | Sur thème clair, plus de rectangle sombre ; l'effet s'ajoute au fond existant. |
| `density` = intensité 1..100 | Les anciennes valeurs restent valides mais donnent un autre nombre d'éléments (10 → 5 rubans / 60 particules / 6 nappes au lieu de 10 / 10 / 4). |
| `speed` linéaire (plus de vitesse au carré) | À `speed` > 1, le rendu est plus lent qu'avant (= la vitesse réellement demandée). |
| Nouvelle option `blur`, nouvel export `elementCount` | Aucun impact si non utilisés. |
| Resize pendant pause / reduced-motion | Le fond se redessine au lieu de disparaître. |
