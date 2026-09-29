# HolafQrcode — doc d'usage (brique holaf-lib v0.1.0)

Générateur de **QR codes auto-hébergé** : un seul fichier
(`holaf-qrcode.js`), **zéro dépendance runtime**, **aucune requête réseau**,
aucun service tiers. On lui donne une chaîne (URL, deeplink, invitation), il
rend la matrice ISO/IEC 18004 en **SVG** (défaut), **`<canvas>`** ou
**dataURL**.

> Pourquoi auto-hébergé ? une URL d'album public contient une **clé secrète** :
> elle ne doit JAMAIS être envoyée à un service de QR tiers. Ici, tout est
> calculé sur le poste qui affiche le code.

---

## 1. Inclure la brique

**Option A — chargement global :**

```html
<script type="module" src="vendor/holaf/holaf-qrcode.js"></script>
<script>
    const svg = HolafQrcode.render({ text: "https://exemple.fr/a/KEY", size: 180 });
    document.querySelector(".mon-conteneur").appendChild(svg);
</script>
```

**Option B — import ES Module :**

```js
import { HolafQrcode } from "./vendor/holaf/holaf-qrcode.js";
```

CSS : la brique auto-injecte un `<style id="holaf-qrcode-style">` minuscule
(`.holaf-qrcode { display:block; max-width:100%; height:auto }`). Pour un hôte à
CSP strict : `HolafQrcode.getCss()` + `{ injectStyles: false }` (par appel) ou
`HolafQrcode.configure({ injectStyles: false })`, et un nonce via
`{ nonce: "…" }` / `HolafQrcode.configure({ nonce: "…" })` /
`HolafQrcode.setStyleNonce("…")`. Le CSS ne touche JAMAIS `:root`.

---

## 2. API

### `HolafQrcode.render(options)` → `SVGElement`

```js
const svg = HolafQrcode.render({
    text: "https://albums.exemple.fr/a/k3y-2025", // requis
    ecc: "M",        // L | M | Q | H (défaut M)
    version: 0,      // 0/absent = automatique (la plus petite qui tient)
    mask: null,      // null = automatique (pénalités ISO) ; 0..7 = forcé
    margin: 4,       // zone silencieuse en modules (défaut 4, ISO)
    size: 200,       // côté du SVG en px CSS (défaut 200)
    dark: "#111827", light: "#ffffff",
    background: true,     // rect de fond clair (défaut true)
    className: "album-qr",
    alt: "QR de l'album", title: "Album public",
    inline: false,        // ajoute .holaf-qrcode--inline
});
// <svg class="holaf-qrcode" data-holaf-qr-version="…" data-holaf-qr-ecc="…"
//      data-holaf-qr-mask="…" data-holaf-qr-modules="…" role="img" …>
//   <rect …/><path fill="…" d="M…h1v1h-1z…"/></svg>
```

Le QR est un **seul `<path>`** (un sous-chemin carré par module sombre) : léger
même en version 40, et `shape-rendering="crispEdges"` garde les bords nets.
Les attributs `data-holaf-qr-*` exposent la version/le niveau/le masque/le
nombre de modules (diagnostic, tests, CSS hôte).

### `HolafQrcode.renderCanvas(options)` → `<canvas>`

Rendu raster : **1 module = `scale` pixels** (défaut 8) ; `margin`, `dark` et
`light` s'appliquent. `dark`/`light` doivent être des **hex** (`#rgb`,
`#rrggbb`, `#rrggbbaa`) — nécessaire pour écrire les pixels (TypeError sinon).
Nécessite un canvas 2D (erreur claire si absent, ex. jsdom sans `canvas`).

```js
const canvas = HolafQrcode.renderCanvas({ text: url, scale: 10, margin: 4 });
```

### `HolafQrcode.toDataURL(options)` → `string`

`renderCanvas` + `canvas.toDataURL(type = "image/png", quality?)`.

```js
const dataUrl = HolafQrcode.toDataURL({ text: url, scale: 8 });
img.src = dataUrl;
```

### `HolafQrcode.encode(text, options)` / `getMatrix({ text, … })` → modèle

```js
const m = HolafQrcode.encode("café ☕", { ecc: "Q" });
m.version;   // version QR (1..40)
m.ecc;       // "L"|"M"|"Q"|"H"
m.mask;      // masque retenu (0..7)
m.size;      // côté en modules = 4*version + 17
m.modules;   // Uint8Array size*size, 0|1 (ligne par ligne)
m.bytes;     // octets UTF-8 encodés
m.darkAt(row, col); // true si sombre (false hors bornes)
```

`getMatrix(options)` est l'alias de `encode(options.text, options)`.

### `HolafQrcode.capacity({ version, ecc })` → `number`

Nombre max d'**octets** de texte encodables (en-tête compté). Sans `version` :
capacité de la v40. Utile pour choisir/afficher une limite :

```js
HolafQrcode.capacity({ version: 10, ecc: "M" }); // 213
HolafQrcode.capacity({ version: 1, ecc: "H" });  // 7
```

### `HolafQrcode.minimalVersion(byteLen, ecc)` → `number`

Première version (1..40) acceptant `byteLen` octets ; `0` si trop long.

### Divers

- `HolafQrcode.version` → `"0.1.0"`.
- `HolafQrcode.getCss()` → CSS injecté (fichier statique possible).
- `HolafQrcode.configure({ injectStyles, nonce })`, `setStyleNonce(nonce)`.

### Erreurs (contrôlées, jamais silencieuses)

| Cas | Erreur |
| --- | --- |
| `text` absent / non-chaîne | `TypeError` |
| `text` vide | `TypeError` (« texte vide ») |
| `ecc` inconnu, `version` hors 1..40, `mask` hors 0..7, `mode` ≠ byte | `TypeError` explicite |
| texte trop long (version forcée ou > v40 niveau L) | `RangeError` (la capacité en octets est dans le message) |
| `render()` sans DOM | `Error` explicite |
| `renderCanvas` sans canvas 2D, couleur non-hex | `Error` / `TypeError` explicites |

---

## 3. Exemple complet — QR d'une URL d'album

```js
function afficherQrAlbum(conteneur, album) {
    if (!album.public_url) {
        conteneur.textContent = "URL publique non configurée (AIH_ALBUM_PUBLIC_BASE_URL).";
        return null;
    }
    if (!window.HolafQrcode) {
        conteneur.textContent = "Brique QR indisponible (vendor/holaf).";
        return null;
    }
    conteneur.innerHTML = "";
    conteneur.appendChild(HolafQrcode.render({
        text: album.public_url,
        ecc: "M",
        size: 180,
        margin: 3,
        className: "album-qr",
        alt: "QR de l'album « " + (album.title || "sans titre") + " »",
    }));
    return conteneur;
}
```

---

## 4. Conformité et limites (assumées, documentées)

**Supporté**

- mode **byte** (chaînes UTF-8, les URL) — sans ECI : les octets sont de
  l'UTF-8, l'interprétation retenue par la quasi-totalité des lecteurs ;
- **versions 1 à 40** (jusqu'à 2953 octets en L, 1273 en H) ;
- niveaux de correction **L / M / Q / H** ;
- indicateur de comptage 8 bits (v1-9) / 16 bits (v10-40) ;
- **Reed-Solomon** GF(256) (polynôme 0x11D), blocs et entrelacement ISO ;
- sélection du masque par **évaluation des pénalités** (4 règles ISO §8.8.2),
  ou **masque forcé** (`mask: 0..7`) ;
- motifs : finders/séparateurs, timing, alignement (v2+), module sombre,
  informations de format et de version (BCH).

**Limites**

- pas de modes **numeric / alphanumeric / Kanji** (optimisations de longueur) ;
- pas de **QR Micro**, pas de **structured append**, pas de **FNC1/ECI** ;
- une seule chaîne par code ;
- `toDataURL`/`renderCanvas` nécessitent un canvas 2D (navigateur) ;
- couleurs canvas en hex uniquement ;
- un texte contenant un demi-surrogate isolé est remplacé par U+FFFD
  (`TextEncoder`) — le décodage ne peut alors pas être octet-identique à
  l'entrée.

---

## 5. Validation (comment on sait que le QR est VRAI)

Un QR faux est pire que pas de QR : la brique est verrouillée par deux
validations indépendantes (tests vitest, devDependencies **de test
uniquement**) :

1. **Décodage aller-retour** — les matrices rendues sont décodées par
   [`jsqr`](https://github.com/cozmo/jsQR) (MIT) : URLs courtes/longues,
   accents/emoji/CJK, caractères spéciaux, et **balayage des 40 versions ×
   4 niveaux** (159/160 combinaisons décodées à l'identique).
2. **Oracle matriciel** — comparaison **cellule pour cellule** avec
   [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator)
   (MIT, Kazuhiko Arase) sur les **40 versions × 4 niveaux** : matrices
   identiques (masque de la référence forcé chez nous). Zéro écart.

**Limite connue du décodeur** : la **v23 niveau L** dense n'est décodée par
jsQR pour AUCUN masque, y compris sur les matrices de `qrcode-generator` —
c'est le détecteur de jsQR qui est trompé par le contenu (les mêmes matrices
sont conformes à la référence). La v23 des autres niveaux se décode
normalement ; la v23-L reste couverte par l'oracle matriciel. En pratique, une
URL (≤ 2953 octets) ne demande jamais la v23-L.

Un **contrôle négatif** vérifie aussi qu'une matrice corrompue n'est PAS
décodée : le test de round-trip échouerait si l'encodeur produisait un motif
faux.

---

## 6. Attribution & licence

- Algorithme conforme à **ISO/IEC 18004** ; les tables de structure
  Reed-Solomon et de positions d'alignement sont des **données de la norme**.
- Inspiration / recoupement : implémentation MIT **qrcode-generator** de
  Kazuhiko Arase. **Aucun code tiers n'est embarqué** dans la brique : elle
  n'embarque que des données normatives. Rien à ajouter aux
  `THIRD-PARTY-NOTICES` d'un projet consommateur.
- `jsqr` et `qrcode-generator` sont des **devDependencies de holaf-lib**
  (tests uniquement), jamais livrées avec la brique.
