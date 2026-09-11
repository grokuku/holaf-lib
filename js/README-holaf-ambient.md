# HolafAmbient — doc d'usage (brique holaf-lib v0.1.0)

Fonds animés canvas, **sans style** : la brique dessine MAIS ne touche pas au
layout. Le host fournit un `<canvas>` (existant ou via sélecteur) et le
positionne / le dimensionne lui-même ; la brique ne modifie que le
**backing store** (`canvas.width/height`) et le contenu dessiné — jamais de CSS
sur l'élément.

Un seul fichier (`holaf-ambient.js`), zéro dépendance runtime, **zéro CSS
injecté**.

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
| `'waves'`     | Lignes sinusoïdales superposées avec **clipping** par bande horizontale ; chaque bande a sa couleur du cycle (décalée dans le temps) → dégradé horizontal vivant. |
| `'particles'` | Particules dérivantes (vitesse aléatoire, rebond sur les bords) + **liaisons légères** entre particules proches (option `links`). |
| `'aurora'`    | Dégradés organiques flous animés (overlays lumineux en `lighter`), lueurs qui dérivent lentement. |

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
| `colors`    | `["#3b82f6","#22d3ee","#a78bfa","#f472b6","#fbbf24"]` | Palette hex. Le **color cycling** mélange les couleurs en continu (blend hex fluide, style AiKore). |
| `speed`     | `1`                       | Vitesse de l'animation (multiplicateur de temps). |
| `density`   | `10` (waves) · `60` (particles) · `4` (aurora) | Nombre d'éléments (lignes / particules / lueurs). |
| `opacity`   | `1`                       | Opacité du rendu (`0..1`). |
| `links`     | `true`                    | Particules : dessine les liaisons légères entre proches. |

### Modifier la config en cours de vol

```js
const a = HolafAmbient.create({ target: canvas, colors: ["#ff5","#0ff"] });
a.setConfig({ mode: "aurora", speed: 2, opacity: 0.7 });
a.setConfig({ mode: "particles", density: 80, links: false }); // change de mode → régénère
```

`setConfig(partial)` valide chaque champ (mode inconnu → erreur, colors filtrées).

---

## 4. Performance (obligatoire)

- **`requestAnimationFrame`** : une seule boucle par instance (pas de `setInterval`).
- **`devicePixelRatio` respecté** : backing store = `css × dpr`, `ctx.setTransform(dpr, …)`.
- **Pause automatique** sur `document.visibilitychange` (`hidden`) → la boucle
  s'arrête ; `visible` → reprise.
- **`prefers-reduced-motion`** → rendu **statique** : une seule frame, aucune boucle.
- **`ResizeObserver`** sur le target : re-dimensionnement à la volée + régénération
  des particules.
- **`destroy()`** = `cancelAnimationFrame` + `disconnect` du ResizeObserver +
  suppression du listener `visibilitychange` → **aucune fuite**.

---

## 5. API de l'instance

`create(opts)` → `{ destroy(), setConfig(partial), pause(), resume(), getConfig(), VERSION }`

```js
const a = HolafAmbient.create({ target: canvas });
a.pause();                 // coupe la boucle
a.resume();                // relance
const cfg = a.getConfig(); // { mode, colors, speed, density, opacity, links }
a.destroy();               // cancel + disconnect + listeners retirés
```

---

## 6. Exemples

**Fond de widget `weather` (Homy) — mode aurora :**

```js
HolafAmbient.create({
    target: document.querySelector(".weather-bg"), // <canvas> posé par le widget
    mode: "aurora",
    colors: ["#7dd3fc", "#38bdf8", "#818cf8"],
    speed: 0.8,
    opacity: 0.9,
});
```

**Fond du dashboard — mode waves :**

```js
const a = HolafAmbient.create({
    target: "#dashboard-bg",
    mode: "waves",
    colors: ["#22d3ee", "#a78bfa", "#f472b6", "#34d399"],
    density: 14,
});
// nettoyage à la fermeture
window.addEventListener("beforeunload", () => a.destroy());
```
