---
name: holaf-briques
description: "Bibliothèque maison holaf-lib — NE S'APPLIQUE QUE si elle est présente sur la machine (emplacement de référence : /projects/holaf-lib ; adapter les chemins si elle est installée ailleurs). Briques JS/Python autonomes, zéro dépendance runtime, versionnées et copiées « pinnées » dans les projets via /projects/holaf-lib/scripts/holaf. À consulter AVANT d'implémenter un composant réutilisable ou un utilitaire d'interface : vérifier si une brique existe déjà (scripts/holaf list), la préférer à une réécriture, l'installer/mettre à jour avec le script officiel. Déclencheurs : créer une modale, un toast, une galerie / visionneuse, des icônes, un système de thème, un cache, une liste paginée, un util réseau, un QR code, un fond animé ; avant de réinventer un composant ou un utilitaire ; mettre à jour vendor/holaf."
---

# holaf-briques — vérifier la lib AVANT de réimplémenter

> ⚠️ **Portée.** Cette fiche n'est valable QUE si la bibliothèque `holaf-lib`
> est présente sur la machine (emplacement de référence : `/projects/holaf-lib` ;
> adapter les chemins si elle est installée ailleurs). Si ce dossier n'existe
> pas, **ignorer cette skill** : les chemins qu'elle cite ne veulent rien dire.

Dépôt source : `/projects/holaf-lib` — `manifest.json` (versions par brique),
`js/` + `python/` (briques), `js/README-holaf-<brique>.md` (doc de chaque brique),
`tests/` (suites vitest).

## Règle d'or
1. `cd /projects/holaf-lib && ./scripts/holaf list` → la brique existe-t-elle ?
2. Elle existe → installer avec le script, **JAMAIS copier à la main** : le script
   écrit aussi `DEST/vendor/holaf/holaf-manifest.json`, qui porte la version pinnée.
3. Elle n'existe pas → implémenter, puis proposer `adopt` pour la remonter dans
   la lib (une amélioration faite dans un projet doit profiter à tous).

## Commandes officielles (`/projects/holaf-lib/scripts/holaf`)
| Commande | Effet |
|---|---|
| `list` | briques + versions disponibles |
| `install <brique> <DEST>` | copie pinnée dans `<DEST>/vendor/holaf/` + manifest local |
| `check <DEST>` | compare les copies du projet à la lib (✓ à jour / ⚠️ en retard) |
| `upgrade <brique> <DEST>` | réinstalle la version courante (écrase la copie) |
| `adopt <brique> <DEST>` | remonte la copie (améliorée) du projet vers la lib (+version) |

`DEST` = dossier hôte du vendor, ex. Pi-Web : `/projects/Pi-Web/frontend/src` ;
Yuki : `/projects/Yuki/public/ui`.

## Carte besoins → briques (indicative ; `list` fait foi)
modale → `modal` · notification → `toast` · visionneuse/galerie plein écran →
`lightbox` (+ `viewport` pour zoom/pan ; vignettes → `thumbcache`) · grille
virtualisée → `virtualgrid` · liste paginée → `collection` · fond animé →
`ambient` · icônes SVG → `icons` · couleurs → `color` · thème/tokens → `tokens` ·
HTTP avec retries → `fetch` · QR code → `qrcode` · panneau d'infos média →
`infopane` · notification desktop Python → `notify`.

## Pièges
- Une copie pinnée ne se met JAMAIS à jour toute seule : un écart de version est
  normal (le voir avec `check`). Ne pas mettre à jour une brique non demandée.
- `install`/`upgrade` ne copient QUE le fichier de la brique (`.js`) : les briques
  à CSS (modal, toast) exigent de ré-extraire le CSS via `getCss()` côté hôte.
- Chaque brique est autonome, zéro dépendance runtime : ne pas lui ajouter
  d'import npm (les devDependencies servent uniquement aux tests).
- Les `.d.ts` des copies vendorisées sont écrits à la main côté hôte (aucun
  script ne les génère).
- Tester la lib : `cd /projects/holaf-lib && npm test`.
