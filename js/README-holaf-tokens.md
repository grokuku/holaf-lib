# HolafTokens — tokens CSS de page (brique holaf-lib v0.4.1)

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

**Version : 0.4.1**

---

## 1. Inclure la brique

Le fichier est **classic-compatible** depuis 0.3.0 : **aucun export ESM
nommé** (l'`export { HolafTokens }` de la 0.2.0 a été retiré). Il est donc
chargeable de trois façons :

```html
<!-- 1) <script> classique — fonctionne en HTTP ET en file:// -->
<script src="vendor/holaf/holaf-tokens.js"></script>
<script>
    // le script classique s'exécute APRÈS la brique (même ordre synchrone)
    HolafTokens.setTheme("dark");
</script>
```

```html
<!-- 2) <script type="module" src> — la globale window.HolafTokens est posée -->
<script type="module" src="vendor/holaf/holaf-tokens.js"></script>
```

Ou en modern JavaScript (**import par effet de bord**) :

```js
import "./vendor/holaf/holaf-tokens.js";
const { HolafTokens } = window; // la brique expose la globale (repli globalThis)
```

Au chargement, **si l'hôte n'a fait aucun choix**, la brique applique le
**preset initial issu de `prefers-color-scheme`** (`dark` ou `light`).

### Migration d'inclusion (0.2.0 → 0.3.0)

| Avant (0.2.0) | Après (0.3.0) |
|---------------|----------------|
| `import { HolafTokens } from "./holaf-tokens.js";` | `import "./holaf-tokens.js";`<br>`const { HolafTokens } = window;` |
| `<script type="module" src>` puis usage immédiat dans un script classique **suivant** | fonctionne, mais préférez le `<script>` classique (ordre synchrone) |
| copie « classic » ad hoc pour `file://` | plus nécessaire : le fichier officiel est classique |

> ⚠️ Le snippet de la 0.2.0 mettait `HolafTokens.setTheme()` dans un `<script>`
> classique **après** un `<script type="module">` : le module étant **différé**,
> `HolafTokens` pouvait être `undefined` à cet instant. Ne pas le copier tel quel.

---

## 2. Catalogue à 2 axes : famille × mode (V2)

Depuis **0.4.0**, les thèmes forment un **catalogue à deux axes** (catalogue V2,
**rupture** avec les 0.2/0.3) :

- **Axe 1 — la famille** : une identité chromatique (des fonds + un accent). Il
  y en a **6** : `corail`, `ambre`, `emeraude`, `turquoise`, `amethyste`,
  `neutre` (une teinte franche par famille, le Neutre assumé).
- **Axe 2 — le mode** : `light` ou `dark`.

Chaque croisement est un **preset** nommé **`<famille>-<mode>`** → **12 presets**.
Chaque preset porte **16 clés** (les 15 clés standard + `surface-hover`, le 4ᵉ
palier de profondeur : `surface` → `surface-elev` → `surface-raised` →
`surface-hover`). Les valeurs sont **figées en hex** (calculées une fois depuis
la maquette V2 validée ; **aucun moteur OKLCH** n'est embarqué).

| Preset | Famille | Mode | Accent | Accent-text | Surface | Texte |
|--------|---------|------|--------|-------------|---------|-------|
| `corail-light`    | corail    | light | `#9c045e` | `#ffffff` | `#ffe3ed` | `#2f2227` |
| `corail-dark`     | corail    | dark  | `#fa7fb5` | `#0b0b12` | `#36252c` | `#f4eef0` |
| `ambre-light`     | ambre     | light | `#7a4800` | `#ffffff` | `#dcc8b5` | `#2d251c` |
| `ambre-dark`      | ambre     | dark  | `#f29a2d` | `#0b0b12` | `#0c0400` | `#f3efec` |
| `emeraude-light`  | emeraude  | light | `#276701` | `#ffffff` | `#c9dac4` | `#22291f` |
| `emeraude-dark`   | emeraude  | dark  | `#7fc765` | `#0b0b12` | `#081005` | `#eef1ed` |
| `turquoise-light` | turquoise | light | `#07606c` | `#ffffff` | `#c3e2e8` | `#1b292c` |
| `turquoise-dark`  | turquoise | dark  | `#0ec7de` | `#0b0b12` | `#051a1e` | `#ecf1f2` |
| `amethyste-light` | amethyste | light | `#4d41b0` | `#ffffff` | `#dfe1fa` | `#252530` |
| `amethyste-dark`  | amethyste | dark  | `#a1a3ff` | `#0b0b12` | `#1e1f2e` | `#eff0f4` |
| `neutre-light`    | neutre    | light | `#515457` | `#ffffff` | `#f2f4f5` | `#1f2730` |
| `neutre-dark`     | neutre    | dark  | `#aeb1b5` | `#0b0b12` | `#343537` | `#edf0f4` |

> Tableau **indicatif** : les **16 clés** complètes de chaque preset sont
exposées par `HolafTokens.PRESETS` (snapshot clé par clé dans
`tests/holaf-tokens.test.js`).

### Garde V2 (test-only)

La règle V2 est **rejouée en test** (`tests/holaf-tokens.test.js`, helper
`tests/helpers/theme-guard.js`) : fonds et accents **distincts** par mode
(ΔEok ≥ 0,040), texte **et texte atténué** (`text-muted`) ≥ 4,5:1 sur les 4
paliers de profondeur, non-textuel ≥ 3:1, profondeur ≥ 0,020 — avec **preuve de
non-vacuité** (self-test qui échoue volontairement). Aucun coût runtime : la
garde ne vit que dans les tests.

### Alias rétrocompatibles (**remappés**)

Les **4 alias historiques** restent utilisables mais pointent désormais vers les
**nouvelles** familles :

| Alias | Équivaut à | Ancienne cible (0.3.0) |
|-------|------------|------------------------|
| `dark`     | `amethyste-dark`  | `indigo-dark`   |
| `light`    | `amethyste-light` | `indigo-light`  |
| `midnight` | `amethyste-dark`  | `midnight-dark` |
| `slate`    | `neutre-dark`     | `slate-dark`    |

```js
HolafTokens.setTheme("midnight");        // alias → amethyste-dark
HolafTokens.setTheme("turquoise-light"); // nom <famille>-<mode>
HolafTokens.setFamily("emeraude", "dark"); // équivaut à setTheme("emeraude-dark")
```

`HolafTokens.listPresets()` → les **16** noms valides (12 `<famille>-<mode>` +
4 alias), **PUIS** les packs hôte enregistrés (voir §6).
`HolafTokens.listFamilies()` → `["corail", "ambre", "emeraude", "turquoise",
"amethyste", "neutre"]`.

### Migration depuis la 0.3.0

Les 10 anciens presets **n'existent plus** et `setTheme(<ancien nom>)` **throw**
(désormais aussi : un thème mémorisé non migré). La brique exporte
**`HolafTokens.MIGRATIONS`** (table `ancien → nouveau`) ; **c'est à l'hôte de
l'appliquer** à sa préférence stockée. Pièges détaillés (Pi-Web, BxRGB, Homy,
miroirs `modal`/`toast`) :
[`README-holaf-tokens-migration.md`](README-holaf-tokens-migration.md).

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

### Purge / résidu (correctif 0.3.0)

La brique mémorise un **Set des clés `--holaf-*` qu'elle a posées au moins une
fois** (`ownedKeys`). À chaque application, elle **retire d'abord les clés
possédées absentes du nouveau lot**, puis pose le nouveau lot — **dans la même
tâche JS**, donc sans flash intermédiaire. `reset()` retire **tout le set**.

Conséquences :

- Appliquer un lot **minimal** après un preset complet ne laisse plus de
  résidu `--holaf-*` : les clés possédées absentes du nouveau lot sont retirées
  (bug de la 0.2.0).
- Les variables posées **hors brique** (ex. `--ma-var`) n'entrent jamais dans le
  set et ne sont **jamais touchées**.
- `applyPalette`, `setTokens` et `setTheme("<pack>")` bénéficient du même
  nettoyage.

```js
HolafTokens.setTheme("corail-dark");             // pose les 16 clés --holaf-*
HolafTokens.setTokens({ values: { surface: "#111", text: "#eee" } }); // lot minimal
HolafTokens.reset();                             // → plus aucune --holaf-* possédée
```

---

## 4. API

| Fonction | Rôle |
|----------|------|
| `HolafTokens.setTokens({ name?, values })` | Pose des tokens (clés non-préfixées → préfixées `--holaf-*` ; clés déjà `--…` passées telles quelles). |
| `HolafTokens.setTheme(presetName)` | Applique un preset par son nom — **12 `<famille>-<mode>` ET 4 alias** (throw clair si inconnu). |
| `HolafTokens.setFamily(family, mode?)` | Applique `<famille>-<mode>`. Sans `mode` : garde le mode courant de la famille si elle est active, sinon `light`. |
| `HolafTokens.getTheme()` | → `{ name, vars }` (copie des `--holaf-*` posées) ou `null` après `reset()`. |
| `HolafTokens.getFamily()` / `getMode()` | → axe 1 / axe 2 du thème courant (alias résolus), ou `null`. |
| `HolafTokens.applyPalette(accentHex, options?)` | Génère et pose une palette dérivée d'un accent (calculs internes **mix/contrast** — **PAS de dépendance inter-briques** vers HolafColor). |
| `HolafTokens.reset()` | **Retire toutes** les variables `--holaf-*` posées (retour à « sans thème », aucun preset n'est réappliqué). |
| `HolafTokens.listPresets()` | Tous les noms de presets valides : **les 16 intégrés (12 famille-mode + 4 alias) PUIS les packs** dans l'ordre d'enregistrement. |
| `HolafTokens.listFamilies()` | Noms des familles (axe 1). |
| `HolafTokens.registerPreset(name, tokens, options?)` | **(0.3.0)** Enregistre un **pack hôte** → `{ name, vars }` (copie). `options.extends` / `options.derive`. Nom réservé/vide → throw. **N'émet pas** d'événement. |
| `HolafTokens.updatePreset(name, tokens)` | **(0.3.0)** Fusionne dans la spec du pack puis **re-résout** (re-dérive) → `{ name, vars }`. Throw si intégré ou inconnu. N'émet pas. |
| `HolafTokens.unregisterPreset(name)` | **(0.3.0)** Retire un pack → `boolean` (`false` si intégré/inconnu). N'émet pas. |
| `HolafTokens.getPreset(name)` | **(0.3.0)** Copie `{clé: valeur}` d'un intégré / alias / pack ; `null` si inconnu. |
| `HolafTokens.alpha(color, a)` | **(0.3.0)** Utilitaire : hex → `rgba(r, g, b, a)` (alpha borné `[0,1]`) ; non-hex → valeur **inchangée**. |
| `HolafTokens.FAMILIES` / `HolafTokens.ALIASES` / `HolafTokens.PRESETS` | Copies du descripteur des familles / table des alias / catalogue complet. |
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
HolafTokens.setTheme("turquoise-light");
HolafTokens.setTheme("ambre-dark");

// Par couple famille + mode :
HolafTokens.setFamily("emeraude", "dark");  // → emeraude-dark
HolafTokens.setFamily("emeraude");          // garde le mode courant → emeraude-dark

// Décrire le thème courant (alias résolus) :
HolafTokens.setTheme("dark");
HolafTokens.getFamily(); // → "amethyste"
HolafTokens.getMode();   // → "dark"

// Parcourir le catalogue :
HolafTokens.listFamilies(); // ["corail", "ambre", "emeraude", "turquoise", "amethyste", "neutre"]
HolafTokens.listPresets();  // 12 famille-mode + 4 alias
```

### Clés des presets V2 (catalogue figé)

Les **12 presets** portent les **16 clés** standard (voir §3). Les valeurs sont
**figées en hex** : il n'y a **plus** de génération `generateTheme` interne (les
0.2/0.3 en avaient une ; le catalogue V2 est littéral). `applyPalette` reste
calculée par les primitives internes `mix` / `contrast`.

Les clés **non produites par la maquette** V2 suivent des règles documentées :

| Clé | Règle |
|-----|-------|
| `accent-hover` | `mix(accent, surface, 15 %)` (comme `applyPalette`) |
| `danger` | graine `#dc2626` (clair) / `#f87171` (sombre), assombrie par pas de 5 % jusqu'à ≥ 4.5:1 sur la surface de la famille |
| `danger-hover` | `mix(danger, surface, 15 %)` |
| `danger-text` | `readableText(danger)` (`#ffffff` ou `#000000`) |
| `radius` | constante `"12px"` |
| `font-size` | constante `"14px"` |
| `shadow` | ombre par mode (constante de la brique) |

### Événement

À **chaque changement** (`setTokens` / `setTheme` / `applyPalette` / `reset`,
et le preset initial), la brique dispatch sur `document` :

```js
document.addEventListener("holaf-tokens-changed", (e) => {
    const theme = e.detail.theme; // nom de preset (string) ou { vars } / null (reset)
});
```

---

## 5. Tokens étendus (0.3.0) — les 23 clés optionnelles

Depuis 0.3.0, la brique connaît **23 clés optionnelles** en plus des 15 clés
historiques. Elles ne sont **jamais posées par les presets intégrés** (sauf
`surface-hover`, porté par les 12 presets V2) : elles
sont fournies par un **pack hôte** (voir §6) et/ou **dérivées** par la brique
(voir §7). Préfixe inchangé : `--holaf-<clé>`.

### Groupe A — dérivables (13)

| Clé | Format | Dérivation | Si la source manque |
|-----|--------|------------|---------------------|
| `accent-soft` | `rgba(…)` | `alpha(accent, .16)` | clé non posée |
| `accent-glow` | `rgba(…)` | `alpha(accent, .50)` | clé non posée |
| `accent-gradient` | `linear-gradient` | `135deg` accent → accent-hover | clé non posée |
| `accent-gradient-hover` | `linear-gradient` | `135deg` `mix(accent,#fff,.12)` → `mix(accent-hover,#fff,.12)` | clé non posée |
| `accent-shadow` | `box-shadow` | `0 0 18px var(--holaf-accent-soft)` | clé non posée |
| `danger-soft` | `rgba(…)` | `alpha(danger, .12)` | clé non posée |
| `danger-shadow` | `box-shadow` | `0 0 16px var(--holaf-danger-soft)` | clé non posée |
| `danger-gradient` *(opt-in)* | `linear-gradient` | `135deg` danger → danger-hover | clé non posée |
| `border-muted` | `rgba(…)` | `alpha(border, .45)` | clé non posée |
| `text-faint` | couleur hex | `mix(text-muted, surface, .42)` | clé non posée |
| `surface-hover` | `rgba(…)` | `alpha(surface-raised, .70)` | clé non posée |
| `chrome-header` | `linear-gradient` | `180deg` `alpha(surface,.92)` → `alpha(surface,.66)` | clé non posée |
| `chrome-footer` | `linear-gradient` | `0deg` `alpha(surface,.95)` → `alpha(surface,.66)` | clé non posée |

> ⚠️ Les **12 presets V2** portent `surface-hover` en **hex solide** (4ᵉ palier
> de profondeur) : la règle de dérivation `alpha(surface-raised, .70)` ne
> s'applique qu'aux **packs** dont la clé est absente.

### Groupe B — états (5)

Le pack **fournit** `ok` et `warn` (couleur) ; leurs dérivées sont calculées :

| Clé | Format | Origine |
|-----|--------|---------|
| `ok` | couleur | pack (explicite) |
| `ok-text` | couleur hex | dérivé : `readableText(ok)` (lisible ≥ 4.5:1 quand possible) |
| `ok-soft` | `rgba(…)` | dérivé : `alpha(ok, .10)` |
| `warn` | couleur | pack (explicite) |
| `warn-text` | couleur hex | dérivé : `readableText(warn)` |

### Groupe C — identité (5)

| Clé | Format | Nature |
|-----|--------|--------|
| `bg-image` | `<image>` CSS | valeur libre (peut référencer `var(--holaf-accent-soft)`…) |
| `txt-glow` *(opt-in)* | `<shadow>` CSS | valeur libre, **aucune règle de dérivation** |
| `radius-sm` *(opt-in)* | longueur CSS | dérivable à la demande : `calc(<radius> - 2px)` |
| `font-sans` | `<font-family>` | valeur libre |
| `font-mono` | `<font-family>` | valeur libre |

> Les dérivables marquées **opt-in** (`danger-gradient`, `radius-sm`) et
> `txt-glow` sont **hors de la liste de dérivation par défaut** : il faut les
> fournir explicitement ou les demander via `options.derive`.

---

## 6. Theme packs (registre hôte)

Un **pack** est un preset nommé **enregistré par l'hôte** (via `registerPreset`)
sans toucher aux 16 intégrés. Idéal pour l'identité d'un projet.

### API

| Fonction | Retour | Notes |
|----------|--------|-------|
| `registerPreset(name, tokens, options?)` | `{ name, vars }` (copie) | Répéter le nom **remplace** le pack. `options.extends` / `options.derive`. |
| `updatePreset(name, tokens)` | `{ name, vars }` (copie) | Fusion dans la spec **explicite** puis **re-dérivation**. |
| `unregisterPreset(name)` | `boolean` | `false` si intégré/inconnu. |
| `getPreset(name)` | copie \| `null` | Accepte intégré / alias / pack. |
| `alpha(color, a)` | `rgba(…)` \| couleur | Utilitaire hex → rgba. |

### Exemple complet

```js
// 1) Enregistrer un pack dérivé d'un intégré
HolafTokens.registerPreset("bxrgb-neon", {
    accent: "#e94560",
    surface: "#05060b",
    text: "#ffffff",
    ok: "#26e6a5",
    warn: "#f59e0b",
    "font-sans": "'Inter', system-ui, sans-serif",
    "txt-glow": "0 0 12px var(--holaf-accent-glow)",   // opt-in fourni explicitement
}, {
    extends: "corail-dark",       // base = copie complète du preset
    derive: true,                 // + dérivations par défaut
});

// 2) L'appliquer (émet l'événement comme n'importe quel preset)
HolafTokens.setTheme("bxrgb-neon");

// 3) Modifier / retirer plus tard
HolafTokens.updatePreset("bxrgb-neon", { accent: "#ff2e63" }); // re-dérive accent-*
HolafTokens.unregisterPreset("bxrgb-neon");                    // → true
```

### Priorité de fusion

**spec explicite > extends > dérivé.**

1. `base` = copie complète du preset étendu (intégré / alias / **autre pack**) si
   `Options.extends` est fourni, sinon `{}`.
2. `final = { ...base, ...tokens }` (les valeurs explicites écrasent l'héritage).
3. Les dérivations demandées ne remplissent que les clés **absentes** de `final`.

> Étendre un **autre pack** hérite ses clés **résolues** (dérivées incluses) :
> pour **re-dériver** une clé héritée, fournissez-la explicitement ou étendez
> l'intégré sous-jacent.

### Noms réservés

Sont **réservés** (un pack ne peut pas les reprendre → `throw` clair) :

- les **12** `<famille>-<mode>` (`corail-light` … `neutre-dark`) ;
- les **4** alias (`dark`, `light`, `midnight`, `slate`) ;
- les **6** noms de familles (`corail`, `ambre`, `emeraude`, `turquoise`,
  `amethyste`, `neutre`).

Un nom **vide** (ou espaces) → `throw`.

### Registre volatile

Le registre (`PACKS`) est un `Map` **en mémoire** : il est **perdu au
rechargement**. L'hôte **ré-enregistre ses packs au boot**, avant de rejouer son
choix mémorisé :

```js
// script de tête (anti-flash) : packs → thème mémorisé, avant le premier rendu
HolafTokens.registerPreset("bxrgb-neon", { /* … */ });
HolafTokens.setTheme(localStorage.getItem("bxrgb-theme") || "bxrgb-neon");
```

Notes de cycle de vie :

- `registerPreset` / `updatePreset` / `unregisterPreset` **n'émettent pas**
  `holaf-tokens-changed` ; `setTheme("<pack>")` **émet** comme les autres.
- `getFamily()` / `getMode()` renvoient **`null`** pour un pack (aucun axe
  famille × mode).
- `listPresets()` = les **16 intégrés d'abord**, puis les packs dans l'ordre
  d'enregistrement.
- Un `updatePreset` du pack **actif** ne repose rien : refaites `setTheme` pour
  voir le changement appliqué.

---

## 7. Dérivations (règles)

- **Ordre d'évaluation** = ordre des dépendances (`accent-soft` avant
  `accent-shadow`, `danger-soft` avant `danger-shadow`).
- **Skip silencieux** : si la source d'une dérivation est **absente** ou
  **non-hex** (`var(--brand)`, `red`, couleur nommée…), la clé n'est **pas
  posée** et **aucune erreur** n'est levée. Ex. un pack `{ accent: "var(--brand)" }`
  ne pose pas `accent-soft`/`accent-glow`/`accent-gradient(-hover)`/`accent-shadow`,
  mais `chrome-header` reste dérivable du `surface`.
- **Opt-ins hors défaut** : `txt-glow` (aucune règle) et `danger-gradient`
  (règle existante, mais hors liste par défaut). `radius-sm` est dérivable à la
  demande.
- **Ratios** : `.16` / `.50` (accent), `.12` (danger + mix hover des gradients),
  `.45` (border), `.42` (text-faint), `.70` (surface-hover), `.92`/`.66`
  (chrome header), `.95`/`.66` (chrome footer).
- **Normalisation** : les dérivées couleur sont normalisées (hex majuscule,
  `rgba(r, g, b, a)`). En revanche les valeurs **explicites** du pack sont
  conservées **verbatim** (ex. `accent: "#e94560"` reste en minuscules).
- **`options.derive`** : `true`/absent = liste par défaut (groupe A+B **moins**
  `danger-gradient`/`txt-glow`/`radius-sm`) ; `false` = aucune ; tableau = liste
  ciblée. Les clés **sans règle** fournies dans la liste (`txt-glow`, `ok`,
  `warn`) sont ignorées silencieusement.

Exemples (pack `bxrgb-neon`, accent `#e94560`) :

```
accent-soft           = rgba(233, 69, 96, 0.16)
accent-glow           = rgba(233, 69, 96, 0.5)
accent-gradient       = linear-gradient(135deg, #E94560, #DD72A0)
accent-gradient-hover = linear-gradient(135deg, #EC5B73, #E183AB)
accent-shadow         = 0 0 18px var(--holaf-accent-soft)
chrome-header         = linear-gradient(180deg, rgba(5, 6, 11, 0.92), rgba(5, 6, 11, 0.66))
ok-text               = #000000   (readableText de #26e6a5)
```

---

## 8. Contraste

Presets et palette calculée garantissent **textes ≥ 4.5:1** sur leurs surfaces
(WCAG AA) : `text` ≥ 4.5:1 sur `surface` / `surface-elev` / `surface-raised` /
`surface-hover`, `accent-text` et `danger-text` lisibles sur leur teinte. Depuis
le **PATCH 0.4.1**, `text-muted` (texte atténué) est lui aussi garanti ≥ 4.5:1 sur
**les 4 paliers** (6 valeurs du catalogue V2 étaient fautives : `ambre-light` sur
`surface` = 4,42:1, `neutre-dark` sur `surface-hover` = 2,97:1). La **garde V2**
(§2, test-only) vérifie en plus texte **et texte atténué** /fond ≥ 4,5:1,
non-textuel ≥ 3:1, ainsi que la **distinction** des fonds/accents et la
**profondeur** des **12 presets**.

---

## 9. Persistance (côté hôte)

Comme `modal` et `toast`, **la brique ne persiste rien**. Le thème global est
volatile ; si vous voulez mémoriser le choix de l'utilisateur (ex. dans
`localStorage`), c'est à l'**hôte** de le faire et de rejouer `setTheme` /
`setTokens` à l'init. Ex. :

```js
const saved = localStorage.getItem("homy-theme");
HolafTokens.setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
```

---

## 10. Version

- **0.4.1** — **PATCH de VALEUR** (aucun changement d'API, aucune clé nouvelle) :
  correction du contraste du **texte atténué**. Dans le catalogue 0.4.0, 6
  `text-muted` passaient sous le seuil **AA 4,5:1** sur au moins un palier de
  profondeur (`ambre-light` sur `surface` = 4,42:1 ; `emeraude-light` sur
  `surface-hover` = 3,93:1 ; `turquoise-light` = 4,26:1 ; `corail-dark` = 3,60:1 ;
  `amethyste-dark` = 4,23:1 ; `neutre-dark` = 2,97:1). Les 6 valeurs sont
  retouchées **a minima** (luminosité ajustée, **teinte/saturation de la famille
  préservées**) jusqu'à **≥ 4,5:1 sur les 4 paliers**. La **garde V2** contrôle
  désormais AUSSI `text-muted` (lacune comblée). Le miroir `modal` recopie ces
  valeurs (`modal 0.6.1`) ; `toast` n'est pas concerné (pas de `text-muted`).
- **0.4.0** — **RUPTURE** du catalogue : 6 familles × 2 modes = **12 presets**
  `corail` / `ambre` / `emeraude` / `turquoise` / `amethyste` / `neutre` aux
  valeurs **figées en hex** (16 clés, dont `surface-hover`), 4 alias **remappés**,
  **`MIGRATIONS`** exportée, **garde V2** rejouée en test, note de migration
  dédiée. Les 10 anciens presets disparaissent. API, événement et packs de la
  0.3.0 inchangés.
- **0.3.0** — évolution **additive** : **23 clés optionnelles** (dérivables,
  états, identité) + **registre de packs hôte** (`registerPreset` /
  `updatePreset` / `unregisterPreset` / `getPreset` / `alpha`) ; **correctif de
  purge** (possession d'ensemble : plus de résidu `--holaf-*`) ; **correctif de
  chargement** (fichier classic-compatible : suppression de l'`export` nommé,
  chargeable en `<script>` classique `file://`/HTTP, en module et en import par
  effet de bord). **0.2.0 conservé à l'identique** (mêmes valeurs, même API,
  même événement).
- **0.2.0** — catalogue à **2 axes** : 5 familles × clair/sombre → 10 presets
  `<famille>-<mode>` + 4 alias historiques rétrocompatibles ; API
  `setFamily` / `getFamily` / `getMode` / `listFamilies` ; `FAMILIES` et
  `ALIASES` exposés. Générateur interne (miroir de `generateTheme`).
- **0.1.0** — première version (brique FONDATION, tokens de page, 4 presets,
  `applyPalette`, événement `holaf-tokens-changed`).
