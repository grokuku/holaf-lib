# Note de migration — HolafTokens `0.3.0 → 0.4.0` (catalogue V2)

> **RUPTURE 0.5.0 → 0.6.0 (2026) — VARIANTE C « Neutres purs + accent ».**
> Les **6 familles couleur** adoptent des **surfaces gris neutre** (chroma
> OKLCH **0**) sur une **rampe de profondeur UNIQUE PARTAGÉE**. Les **fonds
> changent** (clair `#eeeeee`, sombre `#171717` pour les 6 familles) : un hôte
> qui **vendorise** `tokens` **doit rafraîchir sa copie pinnée**
> (`./scripts/holaf upgrade tokens <DEST>`) pour voir la variante C — sinon il
> reste sur les anciens fonds teintés.
>
> - **Aucun nom de preset ni d'alias ne change**, **aucune API ne change** : la
>   table `MIGRATIONS` reste **valable telle quelle** (rien à y ajouter).
> - Les **accents sont inchangés** ; c'est désormais **le seul** axe de
>   distinction entre familles (les fonds sont **partagés**). Les valeurs de
>   `text` / `text-muted` / `danger*` / `accent-hover` sont recalculées sur la
>   nouvelle surface.
> - La famille d'**identité `matrix` reste figée** (hors règle, non modifiée).
> - Les **miroirs** `modal` (`0.7.0`) et `toast` (`0.8.0`) recopient les nouvelles
>   valeurs ; un hôte qui les vendorise doit les rafraîchir aussi. ⚠️ Le CLI ne
>   copie **pas** les `.css` : ré-extraire `holaf-modal.css` via
>   `HolafModal.getCss()` (voir README de la brique).
> - Un hôte qui a **figé** les anciennes surfaces en snapshot de test doit le
>   mettre à jour.
>
> **AJOUT 0.4.1 → 0.5.0 (2026)** — **nouvelle famille d'IDENTITÉ `matrix`**
> (`matrix-dark` / `matrix-light`, thème historique de Pi-Web, valeurs figées).
> **Purement additif** : aucun preset ni alias existant ne change, aucune API ne
> change, aucune étape de migration n'est requise. La famille `matrix` est **hors
> roue chromatique** (non soumise à la garde V2) et porte 7 clés hôte en plus
> (`border-bright`, `text-bright`, `info`, `warn`, `code-inline-bg`,
> `code-block-bg`, `tool-output-bg`) ; `listFamilies()` compte désormais 7 noms
> (`matrix` en tête) et `listPresets()` 18 intégrés.

> **PATCH 0.4.0 → 0.4.1 (2026)** — correctif de **valeur**, sans nouvelle étape
> de migration : la note ci-dessous (0.3.0 → 0.4.0) reste valable telle quelle.
> Le PATCH corrige le **contraste du texte atténué** (`text-muted`) : 6 valeurs du
> catalogue V2 passaient sous le seuil **AA 4,5:1** sur un palier de surface
> (`ambre-light`, `emeraude-light`, `turquoise-light`, `corail-dark`,
> `amethyste-dark`, `neutre-dark`). **Aucun nom de preset ni d'alias ne change,
> aucune API ne change.** Deux conséquences pour un hôte :
> 1. s'il **vendorise** `tokens`, rafraîchir sa copie pinnée
>    (`./scripts/holaf upgrade tokens <DEST>`) pour bénéficier du `text-muted`
>    corrigé ;
> 2. s'il **recopie** `text-muted` (miroir type `modal`) ou a **figé** les
>    anciennes valeurs en snapshot de test, mettre ces copies à jour (le miroir
>    `modal` le fait en `0.6.1` ; le miroir `toast` ne porte pas `text-muted`).

> **Pour les projets HÔTES** (Pi-Web, BxRGB, AiKore, Homy, …). La brique
> fournit la table `HolafTokens.MIGRATIONS` ; **c'est à chaque hôte de
> l'appliquer** à sa préférence stockée et de mettre à jour ses listes de
> familles. Aucune modification d'un autre projet n'est faite par la brique.

## 1. Ce qui change

`0.4.0` **remplace** le catalogue à 2 axes :

| | `0.3.0` (ancien) | `0.4.0` (V2) |
|---|---|---|
| Familles | 5 : `indigo`, `midnight`, `slate`, `emerald`, `amber` | 6 : `corail`, `ambre`, `emeraude`, `turquoise`, `amethyste`, `neutre` |
| Presets | 10 `<famille>-<mode>` | 12 `<famille>-<mode>` |
| Alias | `dark`/`light`/`midnight`/`slate` → anciennes familles | idem, **remappés** vers les nouvelles familles |
| Clés par preset | 14 ou 15 | **16** (15 standard + `surface-hover`) |

Les **anciens noms de presets n'existent plus** : `HolafTokens.setTheme("indigo-dark")`
lève désormais une erreur *« preset inconnu »*. Les **alias** restent valides
(mais leurs valeurs ont changé).

## 2. Table `MIGRATIONS` (exportée par la brique)

```js
HolafTokens.MIGRATIONS   // { ancien → nouveau }
```

| Ancien nom | Nouveau nom | Raison (teinte la plus proche) |
|------------|-------------|--------------------------------|
| `indigo-light`    | `amethyste-light` | indigo (violet) → améthyste |
| `indigo-dark`     | `amethyste-dark`  | idem |
| `midnight-light`  | `amethyste-light` | midnight (violet-bleu) → améthyste |
| `midnight-dark`   | `amethyste-dark`  | idem |
| `slate-light`     | `neutre-light`    | slate (gris ardoise) → neutre |
| `slate-dark`      | `neutre-dark`     | idem |
| `emerald-light`   | `emeraude-light`  | emerald (vert) → émeraude |
| `emerald-dark`    | `emeraude-dark`   | idem |
| `amber-light`     | `ambre-light`     | amber (jaune-orange) → ambre |
| `amber-dark`      | `ambre-dark`      | idem |
| `dark` (alias)    | `amethyste-dark`  | `dark` était `indigo-dark` |
| `light` (alias)   | `amethyste-light` | `light` était `indigo-light` |
| `midnight` (alias)| `amethyste-dark`  | `midnight` était `midnight-dark` |
| `slate` (alias)   | `neutre-dark`     | `slate` était `slate-dark` |

### Application côté hôte

```js
// à la lecture de la préférence stockée (avant setTheme) :
const saved = localStorage.getItem("mon-app-theme");
const name = HolafTokens.MIGRATIONS[saved] || saved;   // migre si ancien nom
HolafTokens.setTheme(name);
```

La migration est **idempotente** : un nom déjà V2 (`"amethyste-dark"`) n'est pas
dans la table et passe inchangé.

## 3. Correspondance des familles (par teinte ET par mode)

- **Teinte** : `indigo`/`midnight` → `amethyste` ; `slate` → `neutre` ;
  `emerald` → `emeraude` ; `amber` → `ambre` ; nouvelle famille `turquoise`
  (sans équivalent ancien).
- **Mode** : conservé (`-light` reste `-light`, `-dark` reste `-dark`).
- Une liste de familles en dur (`["indigo","midnight",…]`) doit être remplacée
  par `HolafTokens.listFamilies()` (ou `["corail","ambre","emeraude","turquoise","amethyste","neutre"]`).

## 4. Pièges connus (relevés par l'étude)

1. **Pi-Web applique le thème SANS `try/catch`** : un `setTheme(<ancien nom>)`
   mémorisé **crashe** désormais (throw « preset inconnu »). ⇒ Appliquer
   `MIGRATIONS` **et** protéger l'appel :
   ```js
   try { HolafTokens.setTheme(HolafTokens.MIGRATIONS[saved] || saved); }
   catch { HolafTokens.setTheme("amethyste-dark"); }   // repli sûr
   ```
2. **BxRGB `extends` `indigo-dark` / `indigo-light`** : `registerPreset(..., { extends: "indigo-dark" })`
   **throw** maintenant (preset inconnu). ⇒ Remplacer par la famille V2 équivalente
   (`amethyste-dark` / `amethyste-light`) **ou** recalculer la base voulue.
3. **Homy est sur une VIEILLE version de la brique avec un `import` NOMMÉ**
   (`import { HolafTokens } from …`). Depuis la 0.3.0 le fichier **n'a plus
   d'export nommé** : mettre à jour la brique **casse l'import**. ⇒ Migrer vers
   l'import par effet de bord (`import "./holaf-tokens.js"; const { HolafTokens } = window;`)
   **avant** de bumper la version vendorisée.
4. **Les miroirs `modal` / `toast` recopient les presets** : leurs catalogues
   `indigo-*`… et leur test « cohérence inter-briques » référencent les anciens
   noms de `HolafTokens.PRESETS`. Depuis `tokens 0.4.0`, ce sont des **lots
   suivants** : `modal`/`toast` doivent recopier les **12 nouveaux presets** et
   remettre leurs tests à jour (le test inter-briques échoue en attendant —
   c'est **attendu** et assumé par le lot `tokens`).
5. **`surface-hover` a changé de nature** : les 12 presets V2 le portent en
   **hex solide** (4ᵉ palier de profondeur). La règle de dérivation
   `rgba(surface-raised, .70)` ne s'applique qu'aux **packs** dont la clé est
   absente (elle est alors sautée si un `extends` la fournit déjà).

## 5. Ce qu'un hôte DOIT faire

1. **Migrer la préférence stockée** avec `HolafTokens.MIGRATIONS`.
2. **Protéger** l'appel `setTheme` (`try/catch` + repli).
3. **Mettre à jour les listes de familles** codées en dur → `listFamilies()`.
4. **Si l'hôte étend un preset** : remplacer les noms `indigo-*`/`slate-*`/
   `midnight-*`/`emerald-*`/`amber-*` par les équivalents V2 (table §2).
5. **Si vendorisée** : vérifier l'import (effet de bord, pas d'export nommé) et
   bumper la copie pinnée.
6. **Si l'hôte recopie le catalogue** (`modal`/`toast`) : reprendre les 12
   presets V2 et adapter ses tests inter-briques (lot suivant).
