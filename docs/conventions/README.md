# Conventions partagées de l'écosystème holaf

**Statut :** espace vivant — source unique de vérité pour tous les projets
**Dossier :** `holaf-lib/docs/conventions/`
**Public :** toute session agent travaillant sur un projet de l'écosystème, et tout contributeur humain
**Date :** 2026

---

## 0. Pourquoi cet espace existe

holaf-lib est déjà la **bibliothèque de briques** commune (du code autonome,
copié et pinné dans `vendor/holaf/` de chaque projet). Il lui manquait
l'équivalent pour les **conventions** : les règles d'intégration qui ne sont
pas du code, mais qui doivent être les mêmes dans tous les projets.

Trois constats ont mené à cet espace :

1. **La duplication fait diverger les projets.** Quand chaque projet garde sa
   propre copie d'une règle, les copies se désynchronisent. Constats réels :
   Docky avait deux générations de retard sur les briques, Yuki n'était branché
   qu'« à moitié » sur la brique `tokens`, Pi-Web utilisait `lucide-react` au
   lieu de sa propre brique `icons`. Une seule source évite ces dérives.
2. **Un document sans pointeur n'est jamais lu.** Un agent Pi lit
   automatiquement le `AGENTS.md` du projet au démarrage de sa session. C'est
   ce pointeur — et lui seul — qui rend ces conventions réellement connues des
   agents. Chaque projet de l'écosystème porte donc une section courte
   « Conventions partagées » vers ce dossier.
3. **Il faut pouvoir ajouter des conventions sans retoucher les projets.** Le
   pointeur vise le **dossier**, pas un fichier : ajouter une convention ne
   demande **aucune** modification dans les projets.

## 1. Index des conventions

| Convention | Fichier | Pour qui | Ce qu'elle couvre |
|---|---|---|---|
| Intégration du SDK Pi | [`pi-sdk.md`](./pi-sdk.md) | Projets Node/TS qui utilisent `@earendil-works/pi-coding-agent` (aujourd'hui Pi-Web et Yuki) | Politique de version du SDK, surfaces d'API, patterns de façade (événements, erreurs, instrumentation, config), garde-fous d'exécution, concurrence, frontière de mutualisation, voie des projets Python |
| _(à compléter)_ | | | |

> **Une nouvelle convention = un nouveau fichier + une ligne dans ce tableau.**
> Voir la procédure en §2.

## 2. Comment ajouter une convention

1. **Créer le fichier** `docs/conventions/<sujet>.md` — un fichier = un sujet,
   **autoportant** (lisible sans contexte préalable), en français, avec ses
   chemins réels. Reprendre l'en-tête des documents existants
   (`Statut` / `Dossier` / `Public` / `Date`).
2. **L'ajouter au tableau de l'index** ci-dessus : fichier, public visé, résumé
   d'une ligne.
3. **Ne rien recopier dans les projets.** Les `AGENTS.md` de tous les projets
   pointent déjà vers ce dossier ; dupliquer une convention dans un projet est
   exactement ce que cet espace cherche à éviter.
4. **Préférer l'actionnable au rapport d'audit** : on écrit des règles
   (« faire X », « éviter Y ») ; les faits datés et les chemins réels servent
   de preuves, pas de narration.
5. **Signaler l'incertain comme incertain** (« à vérifier », « estimation ») —
   une convention n'invente rien.

### Le pointeur, côté projets (référence)

La section présente dans le `AGENTS.md` de chaque projet est volontairement
courte et identique d'un projet à l'autre :

```markdown
## Conventions partagées (écosystème holaf)

Avant d'introduire ou de modifier un composant, une intégration ou un outil,
consulter les conventions communes : `/projects/holaf-lib/docs/conventions/`
(notamment l'intégration du SDK Pi, `/projects/holaf-lib/docs/conventions/pi-sdk.md`).

**Une seule source de vérité — ne pas recopier ces conventions dans le projet.**
```

Ce pointeur n'a **jamais** besoin d'être mis à jour quand une convention est
ajoutée : il vise le dossier, dont l'index (§1) fait foi.

## 3. Ce que ces conventions ne sont pas

- **Pas des briques.** Les briques (`js/`, `python/`) sont du **code** copié et
  pinné par le script `holaf`, avec version et manifest ; les conventions sont
  des **documents**, jamais copiés.
- **Pas une nouvelle brique `holaf`** : la doctrine holaf = un seul fichier,
  zéro dépendance. Une convention n'a pas de version, pas de manifest, pas de
  copie — elle vit ici, en un seul exemplaire.
- **Pas spécifiques à un projet.** Si une règle ne vaut que pour Pi-Web (ou un
  autre projet précis), elle reste dans l'`AGENTS.md` de ce projet.

## 4. En clair

Cet espace est le **carnet de règles communes** de tous les projets. Chaque
projet possède un petit panneau dans son `AGENTS.md` qui dit aux agents :
« avant de toucher à un composant, une intégration ou un outil, va lire les
règles ici ». Comme il n'y a qu'un seul carnet, corriger une règle une fois la
corrige pour tous les projets — et aucun document ne peut être « en retard »
ou « à moitié branché ».

Pour ajouter une règle : écrire un fichier dans ce dossier, l'inscrire dans le
tableau de l'index ci-dessus. C'est tout — les projets n'ont rien à changer.
