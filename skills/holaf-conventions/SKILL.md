---
name: holaf-conventions
description: "Règles communes de l'écosystème holaf — NE S'APPLIQUE QUE si la bibliothèque holaf-lib est présente sur la machine (emplacement de référence : /projects/holaf-lib ; adapter les chemins si elle est installée ailleurs). Source unique de vérité : /projects/holaf-lib/docs/conventions/ (index : README.md). À consulter AVANT d'introduire ou modifier un composant, une intégration ou un outil, avant d'écrire du code réutilisable, et avant toute intervention sur le SDK Pi. Déclencheurs : toucher au SDK Pi (@earendil-works/pi-coding-agent), monter la version du SDK, concevoir une façade / des événements / des erreurs d'intégration, ajouter une règle commune, chercher « où sont les conventions ? ». Ne jamais recopier une convention dans un projet — pointer vers le dossier."
---

# Conventions partagées holaf

> ⚠️ **Portée.** Cette fiche n'est valable QUE sur une machine où la
> bibliothèque `holaf-lib` est présente (emplacement de référence :
> `/projects/holaf-lib` ; adapter les chemins si elle est installée ailleurs —
> p. ex. sous un autre dossier `/projects/…`). Si ce dossier n'existe pas,
> **ignorer cette skill** : les chemins qu'elle cite ne veulent rien dire.

Source unique de vérité : `/projects/holaf-lib/docs/conventions/`.
**Lire d'abord l'index** (`docs/conventions/README.md`) : 1 fichier = 1 sujet ;
ensuite seulement, le fichier du sujet concerné.

## Règles
1. Une règle commune ne se recopie JAMAIS dans un projet : les `AGENTS.md` de
   chaque projet pointent déjà vers ce dossier. Une copie = une divergence future.
2. Une règle propre à un seul projet reste dans l'`AGENTS.md` de ce projet.
3. Pour ajouter une règle : un fichier `docs/conventions/<sujet>.md` autoportant
   + une ligne dans le tableau de l'index (procédure : README §2).
4. Signaler l'incertain comme incertain — une convention n'invente rien.

## Avant de toucher au SDK Pi
Lire `docs/conventions/pi-sdk.md` (seul sujet existant à ce jour). Très court
rappel immédiat — **le fichier fait foi** :
- version du SDK pinnée EXACTE (jamais `^`, jamais `@latest`), y compris le pin
  de `entrypoint.sh` si le déploiement réinstalle le paquet au démarrage ;
- jamais de montée de version sans relire les ruptures (table manuelle du
  projet, ex. Pi-Web : `backend/src/pi/sdk-breaking-changes.ts`) ;
- le SDK reste derrière une façade maison : ses types ne fuient pas dans le
  code produit ;
- en cas de doute, le paquet installé (`node_modules/@earendil-works/pi-coding-agent`)
  et sa documentation font foi.

Toute intervention SDK, même petite : ouvrir `pi-sdk.md` — ce résumé ne remplace pas.
