# Conventions d'intégration du SDK Pi

**SDK concerné :** `@earendil-works/pi-coding-agent` (paquet npm Node/TS)
**Statut :** conventions en vigueur — établies après audit des deux seuls projets consommateurs
**Dossier :** `holaf-lib/docs/conventions/`
**Public :** projets Node/TS de l'écosystème (aujourd'hui Pi-Web et Yuki) ; les projets Python sont guidés au §8
**Date :** 2026

---

## 0. Le principe en une phrase

**Le SDK Pi est une dépendance externe mouvante : on l'isole derrière une
façade maison, on ne la laisse jamais fuir dans le code produit, et on ne monte
jamais sa version sans relire ses ruptures.**

---

## 1. Périmètre et public

**Qui est concerné :** tout projet de l'écosystème qui utilise le SDK Pi en
Node/TS. Aujourd'hui, exactement deux projets (audit 2026-10) :

| Projet | Version SDK | Où elle est pinnée | Particularité |
|---|---|---|---|
| **Pi-Web** | `0.87.1` | `backend/package.json` **et** `entrypoint.sh` (réinstallé au démarrage du conteneur) | garde-fou de version (`backend/src/pi/sdk-breaking-changes.ts`) ; intégration dans `backend/src/pi/` : 45 modules hors tests, ≈ 15 000 lignes |
| **Yuki** | `0.85.1` | `package.json` | façade la plus propre (`src/pi/` : 13 fichiers, ≈ 2 750 lignes) ; **pas** de garde-fou de version ; **en développement actif, pas en production** — sa montée de version tombera naturellement, ce n'est pas un chantier urgent |

Tous les autres projets à LLM de l'écosystème sont en **Python** (Docky,
Kinoscribe, AI-Helper/Blobby, et plus largement la majorité des projets) : ils
ne peuvent pas consommer ce paquet npm nativement → voir §8.

**Pourquoi ce document :** les deux intégrations ont divergé (familles d'API
différentes, structures différentes). Ce document fixe ce qui doit être
**semblable** (les patterns, les politiques), ce qui doit rester **libre**
(l'organisation interne), et la marche à suivre lors d'une montée de version.

---

## 2. Politique de version du SDK

### 2.1 Règle d'or

> **Ne jamais monter la version du SDK sans relire ses breaking changes — et ne
> jamais installer `@latest`.**

- **Pinner une version exacte** (`"0.87.1"`, jamais `^0.87.1` ni `latest`) dans
  le manifeste du projet.
- Si le déploiement **réinstalle** le paquet au démarrage (Pi-Web :
  `entrypoint.sh`), mettre à jour **aussi** ce pin — sinon la version réellement
  exécutée diverge du manifeste.
- Avant tout saut **mineur ou majeur** : relire les changements d'API, monter
  dans une branche, et **tester le démarrage réel** (un `tsc` qui passe ne
  garantit pas que la session s'ouvre).
- Après chaque montée : **noter la rupture dans le garde-fou** du projet.

### 2.2 Le cas 0.85.1 → 0.87.1 (pourquoi cette règle existe)

Cette bascule a cassé le démarrage : `agent.state.systemPrompt` est devenu un
**getter sans setter** — toute écriture lève un `TypeError`. Le SDK 0.87.0 a
aussi refondu le prompt système et le transcript : assigner
`agent.state.messages` ne pilote plus le contexte envoyé au provider,
`_baseSystemPrompt` a disparu, `ExtensionRunner.emit()` n'accepte plus
`turn_end`, etc.

Pi-Web en a tiré un garde-fou : **`backend/src/pi/sdk-breaking-changes.ts`**
(≈ 175 lignes, pur et testé, sans I/O). C'est le **modèle à réutiliser** (ou à
porter) dans tout projet qui consomme le SDK :

- une **table statique** `SDK_BREAKING_CHANGES` (version + résumé + détails),
  revue à la main à chaque montée — entrées actuelles : `0.86.0`, `0.86.1`,
  `0.87.0`, `0.87.1` ;
- `evaluateUpdateTarget(versionInstallée, versionCible, acknowledged)` →
  décision `{ alreadyUpToDate, requiresAck, breakingChanges, blocked }` ;
- un saut **mineur/majeur non acquitté est refusé** (HTTP 409) ; un simple
  patch (`0.87.0 → 0.87.1`) ne déclenche pas le garde-fou ;
- `replaceEntrypointPin()` réécrit le pin dans `entrypoint.sh` en même temps
  que l'installation — et **échoue** si aucune ligne n'est trouvée (mieux vaut
  refuser la mise à jour que laisser un pin obsolète).

Côté Pi-Web, la route `POST /api/settings/update`
(`backend/src/routes/settings.ts`) s'en sert pour afficher les ruptures
applicables **avant** l'action et exiger un acquittement explicite.

**Yuki n'a pas encore ce garde-fou** : à créer au moment de sa montée de
version — pas avant (il est en dev actif).

### 2.3 Ce qui est incertain

La liste des ruptures de `sdk-breaking-changes.ts` est **manuelle** : elle ne
se met pas à jour toute seule. En cas de doute sur une version intermédiaire,
le code installé (`node_modules/@earendil-works/pi-coding-agent`) et sa
documentation dans le paquet font foi — pas cette table.

---

## 3. Surfaces du SDK — les deux familles d'API

Le SDK expose **deux familles** pour ouvrir une session. Les deux existent, et
les deux projets ne les utilisent pas pareil — ce n'est pas une erreur, c'est
un choix de structure. Ce qui compte : **la façade maison reste au-dessus** et
le choix d'une famille ne fuit pas dans le code produit.

| | **Famille « session directe »** | **Famille « services → runtime »** |
|---|---|---|
| API | `createAgentSession` + `DefaultResourceLoader` | `createAgentSessionServices` → `createAgentSessionFromServices` → `createAgentSessionRuntime` |
| Utilisée par | **Pi-Web** — `backend/src/pi/session.ts` | **Yuki** — `src/pi/sdk/session-factory.ts` |
| Style | loader explicite, extensions inline (`extensionFactories`) | services construits, puis runtime remplaçable (utile pour les sessions éphémères en mémoire) |

**Surfaces COMMUNES** (les deux projets les utilisent — c'est le socle stable,
celui sur lequel une façade peut s'appuyer sans se figer) :

- `SessionManager` (persistance des sessions ; `inMemory` pour une session
  éphémère) ;
- `SettingsManager` (réglages ; `SettingsManager.inMemory` possible) ;
- `ModelRuntime` (résolution des modèles/providers) ;
- `defineTool` / `ToolDefinition` (outils custom, schémas TypeBox) ;
- les types `AgentSession*` (`AgentSession`, `AgentSessionRuntime`,
  `AgentSessionEvent`, `AgentSessionRuntimeDiagnostic`…).

Surfaces **propres à Pi-Web** (à ne pas ériger en convention) :
`ModelRegistry`, `buildSessionContext`, `estimateTokens`, etc.
Surfaces **propres à Yuki** : `CreateAgentSessionRuntimeFactory`, etc.

> Le SDK évolue vite : toute surface non listée comme commune doit être
> considérée comme locale au projet qui l'utilise.

---

## 4. Patterns recommandés — la façade (le socle)

Le **modèle de référence** est la façade de **Yuki** (`/projects/Yuki/src/pi/`) :
stable, abstraite, testable, et **aucun type du SDK n'en sort**. Cinq volets à
reprendre.

### 4.1 Cycle de vie de session — une seule porte d'entrée

- **Un seul endroit importe le SDK.** Yuki le vérifie par un test de frontière
  (`/projects/Yuki/tests/pi/boundary.test.ts`) : allowlist explicite des
  fichiers autorisés (`src/pi/sdk-host.ts`, `src/pi/sdk/**`), interdiction pour
  le reste du code d'importer `@earendil-works/...` ou `typebox`, et
  interdiction d'importer depuis `src/pi/sdk/**` en dehors de `src/pi/**`.
- **L'interface publique est agnostique du SDK.** Yuki expose `PiHost`
  (`src/pi/host.ts`) : `start`, `isReady`, `ensureSession` / `newSession` /
  `continueRecent` / `resume`, `send(sessionId, text, opts)` → `RunHandle`,
  `abort` (idempotent), `subscribe` / `subscribeAll`, `getState`,
  `listSessions`, `stop`. Les types publics sont des types JSON
  (`src/pi/types.ts`), et `src/pi/index.ts` ne ré-exporte **aucun** type SDK.
- **Une session = un handle de run.** `send()` rend la main immédiatement ; le
  reste du produit ne connaît jamais `AgentSession`.

### 4.2 Normalisation d'événements — un canal neutre

`src/pi/events.ts` (pur, zéro import SDK) traduit les événements bruts du SDK
en valeurs sérialisables :

- **canal `content` / `thinking`** : `text_delta` → `content`,
  `thinking_delta` → `thinking`, tout le reste ignoré
  (`channelForAssistantEvent`) ; le `thinking` transite mais **n'est jamais
  assimilable à une réponse** ;
- **texte de delta** : `deltaText()` ;
- **fin de tour** : `finishReasonForMessage()` → `done` | `abort` | `error`
  (`aborted` → abort ; `error` → error ; `stop` / `length` / `toolUse` /
  `deferred` → done) ;
- **usage** : `usageFromMessage()` → `{ input, output, cacheRead?, cacheWrite?,
  total? }` (nombres finis uniquement) ;
- **texte de contenu** : `contentTextFromMessage()` **exclut explicitement les
  blocs `thinking`** ;
- **hygiène** : `sanitizeErrorText()` masque `Authorization`, `Bearer`,
  `api_key`, `sk-…`, hex longs et jetons opaques **avant toute
  journalisation**.

> **Règle : le canal est structurant.** On ne fusionne jamais `thinking` et
> `content` dans le même flux, et un transcript « contenu seul » n'inclut pas
> les blocs de réflexion.

### 4.3 Erreurs — des codes stables, jamais le brut du SDK

`src/pi/errors.ts` : **aucun message d'erreur brut du SDK ne franchit la
façade**. Tout est traduit en `PiHostError` portant un **code stable** :

`PI_NOT_READY`, `PI_PROMPT_REJECTED`, `PI_ABORTED`, `PI_TIMEOUT`,
`PI_SESSION_ERROR`, `PI_RESOURCE_ERROR`, `LLM_UNAVAILABLE`, `PI_UNKNOWN`.

`toPiHostError()` reconnaît les motifs connus (abort, `TimeoutError`,
filesystem read-only / EACCES / EROFS / ENOSPC, absence de modèle / clé /
authentification, « already processing », compaction en cours…), conserve
l'original dans `cause`, et journalise les cas non mappés en `debug`.

### 4.4 Instrumentation — étages + résumé

`src/pi/instrumentation.ts` :

- `PHASE` = **liste OUVERTE d'étages** (`send_received`, `prompt_accepted`,
  `run_started`, `first_token`, `turn_end`, `run_finished`, `abort`, `error`,
  plus les étages délégation/TTS) : un nouvel étage s'ajoute sans refonte ;
- `RunInstrumentation` émet un événement `phase` par étage **et** une ligne
  JSON-lines `pi.phase`, mesure le **TTFT** (premier token), agrège l'`usage`,
  puis produit un `run_summary` (`ttftMs`, `totalMs`, `tokensIn`, `tokensOut`,
  métriques TTS optionnelles) **et** une ligne `pi.run_summary`.

Corrélation : toujours `session_id` puis `run_id` (et `job_id` pour les
sous-tâches).

### 4.5 Configuration et environnement du SDK

`src/pi/config.ts` :

- `resolvePiPaths()` centralise les chemins (`agentDir`, `cwd`, `home`,
  `sessionsDir`, `settings.json`, `models.json`) — **jamais de chemins ad hoc
  ailleurs** ;
- `ensurePiLayout()` vérifie que tout l'état Pi est **inscriptible AVANT toute
  session** (rootfs read-only sans volume → échec bruyant `PI_RESOURCE_ERROR`) ;
- `seedSettingsFile()` **ne remplace JAMAIS** un fichier existant ;
- `writeModelsFile()` écrit de façon **atomique** (`tmp` + `rename`), TOUJOURS
  réécrit, et ne met **jamais** de clés en clair (références `$…_API_KEY`
  uniquement) ;
- `applyPiEnvironment()` pose les variables reconnues par le SDK :
  `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, `HOME`, plus
  `PI_OFFLINE=1`, `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0` (`PI_SDK_ENV`) —
  noms conformes à la doc du paquet
  (`@earendil-works/pi-coding-agent/docs/environment-variables.md`) ; la
  fonction renvoie une **restauration** (utile aux tests).

> **Frontière de fait :** `events.ts`, `errors.ts`, `instrumentation.ts` sont
> **purs** (aucun import SDK) ; `config.ts` ne cite la doc du SDK que dans un
> commentaire ; `host.ts` ne connaît que l'interface. C'est cette frontière qui
> rend la façade testable et transportable.

---

## 5. Garde-fous d'exécution

Un agent LLM peut « partir en silence » (plus aucun événement) ou rendre une
**réponse vide** (budget épuisé par la réflexion). Deux mécanismes de Pi-Web
sont à reprendre.

### 5.1 Silence de flux — `backend/src/pi/stream-silence.ts`

- **La liveness n'est pas la durée, c'est le flux** : tant que des événements
  arrivent, le compteur de silence repart de zéro — une génération de plusieurs
  heures ne doit **pas** être coupée pour cause de durée ;
- délai par défaut : **15 min sans AUCUN événement** (`0` = illimité) ;
  alerte progressive à ~1/3 du délai, arrêt propre au seuil ;
- **`pause()` / `resume()` obligatoires pendant une attente légitime** (file
  derrière le limiteur LLM : aucun événement n'est émis, ce n'est pas du
  silence) — sinon l'arrêt est un faux positif ;
- machine à états **pure** (horloge injectable, aucun timer interne) : le
  pilote appelle `evaluate()` à intervalle régulier ;
- **marqueur stable** `« flux silencieux »` (`SILENCE_TIMEOUT_MARKER`) : il
  permet de reconnaître un arrêt sur silence (retry possible) sans parser du
  texte libre — helpers `isSilenceTimeoutMessage()`, `formatDurationMs()` ;
- un **hard timeout** de dernier recours existe, **désactivé par défaut**
  (`0`) : volontairement distinct du silence (il ne doit servir que de plafond
  absolu, jamais de timeout de travail normal).

### 5.2 Réponse vide — `backend/src/pi/response-guard.ts`

`detectThinkingOnlyTruncatedTurn()` détecte le tour **tronqué par le budget de
sortie** (`stopReason` `length` / `max_tokens`) qui ne contient **que du
thinking** : 0 caractère de texte, aucun appel d'outil.
`warnIfThinkingOnlyTruncatedTurn()` journalise alors un avertissement explicite
(projet, provider, modèle, niveau de réflexion, nombre de caractères de
réflexion). C'est un **diagnostic**, pas un kill : il explique la réponse vide
pour que l'appelant (ou l'utilisateur) ajuste le niveau de réflexion ou le
budget de sortie.

> **Règle générale :** ne jamais laisser un run sans borne — soit un détecteur
> de silence correctement alimenté, soit un timeout explicite — et toujours
> tracer un **motif d'arrêt exploitable** (« flux silencieux », « budget
> épuisé »…) pour que l'UI et les retries puissent décider sans deviner.

---

## 6. Concurrence — limiter les appels LLM

Les providers facturent et limitent (RPM/TPM) : deux approches existent dans
l'écosystème.

### 6.1 Pi-Web — slots par provider (`backend/src/pi/concurrency.ts`)

- **un seul pool : les slots LLM**, limités **PAR PROVIDER** :
  `providerMaxLLMSlots[providerId]` sinon `maxLLMSlots` (défaut **3**) ;
- **une file d'attente par provider** (promesses) : la tâche suivante est
  débloquée quand un slot du MÊME provider se libère ;
- attente en file bornée (`queueTimeoutMs`, défaut **1 h**, réglable 5 s →
  12 h) — assez généreux pour qu'un sous-agent patiente derrière un provider
  saturé sans être rejeté ;
- **watchdog anti-blocage** : au-delà de `max(30 min, 3 × queueTimeoutMs)`, un
  slot est libéré de force (chemin de release oublié, crash, abort non
  propagé) ;
- **piège documenté (BUG-59)** : la réentrance était basée sur le `projectId` →
  les agents d'un harness partageaient le slot de la session principale et le
  release tuait le mauvais slot. **Règle : chaque appel utilise une `slotKey`
  unique** (ex. `projectId::architect`), jamais une clé métier réutilisée
  telle quelle.

### 6.2 Yuki — file de jobs (`src/jobs/queue.ts`, `src/pi/sdk/heavy-worker.ts`)

Une tâche lourde = **une session éphémère en mémoire = un prompt = une
réponse** (aucune fuite de contexte entre jobs), avec timeouts d'**inactivité**
et **global** → `abort()` + job `failed` avec partiel. C'est le modèle « une
unité de travail isolée » quand le travail n'a pas besoin du contexte de la
session.

> **Ce qui est commun :** borner, par provider, le nombre d'appels simultanés,
> et rendre l'attente observable. **Ce qui est propre à un produit :** la façon
> de faire la file (voir §7).

---

## 7. Ce qu'il ne faut PAS mutualiser

La tentation naturelle est de créer « une brique SDK commune ». L'audit montre
pourquoi c'est une fausse bonne idée :

- le recouvrement entre les deux intégrations est **sémantique** (même
  intention) mais **moins de ~500 lignes sont réellement copiables** : les
  structures et les familles d'API diffèrent ;
- la surface commune utile est mince : ce sont des **patterns** (§4 à §6), pas
  des fonctions à importer ;
- mutualiser ferait dépendre deux produits d'une abstraction qui doit suivre
  une **dépendance externe mouvante** : à chaque montée du SDK, une brique
  commune casserait les deux projets à la fois ;
- la doctrine holaf s'y oppose : une brique = un fichier autonome, zéro
  dépendance. Le SDK est une dépendance externe — **pas de brique holaf pour
  cette couche.**

**Liste explicite — reste dans le projet, jamais dans une couche partagée :**

| Domaine | Où il vit |
|---|---|
| Création de session et choix de la famille d'API | `Pi-Web backend/src/pi/session.ts`, `Yuki src/pi/sdk/session-factory.ts` |
| Boucle de prompt, suivi du run, abonnements | la façade de chaque projet |
| File / concurrence propre à un produit | `Pi-Web concurrency.ts` (slots par provider), `Yuki src/jobs/queue.ts` |
| Routage des modèles, harness, sous-agents, arrêt ciblé | `Pi-Web backend/src/pi/harness-*.ts`, `routing.ts` |
| Logique de mode (architecte, code, review…), mémoire, CBM, design, git | Pi-Web — logique métier |
| Politique de prompt système (contexte projet, bannières, mémoire) | chaque projet |

**Test simple avant de « mutualiser » :** si le code contient un mot du produit
(mode, harness, projet, routage…), ce n'est pas de la couche SDK → il reste où
il est. On ne copie **jamais** un fichier d'un projet à l'autre ; on s'inspire
du **pattern**, on le réimplémente adapté à la façade locale.

---

## 8. Point d'entrée pour les projets Python

Le SDK Pi est un **paquet npm Node/TS** : un projet Python ne peut pas
l'importer. La voie recommandée est un **side-car Node** — un petit processus
Node séparé, **pas une réécriture** :

- précédent réel dans l'écosystème : le serveur MCP stdio de Pi-Web
  (`backend/src/mcp/stdio-server.mjs`) — un **fichier `.mjs` autonome**, non
  compilé par `tsc`, lancé par l'hôte avec `node …`, qui parle JSON-RPC sur
  stdin/stdout et s'authentifie auprès de l'API de Pi-Web avec une agent key
  (`PI_MCP_AGENT_TOKEN`) ;
- pour un projet Python qui veut un agent : côté Python, appeler le side-car
  (stdio, HTTP ou MCP) ; côté Node, le side-car contient la façade et le SDK ;
- **alternative sans nouveau code** : si le besoin est de déléguer du travail
  de code, passer par un service Node existant (MCP/REST de Pi-Web) plutôt que
  de rembarquer le SDK soi-même.

**À éviter :** réimplémenter la boucle d'agent en Python, et installer le
paquet npm dans un projet Python « juste pour voir ».

---

## 9. En clair

- Le **SDK Pi** est le moteur qui permet à un programme de discuter avec un
  modèle d'IA (c'est lui qui « fait tourner » l'agent). Il n'existe qu'en
  version Node/JS — pas en Python.
- **Mettre à jour ce moteur est risqué** : la dernière montée de version a
  changé une pièce interne et empêché le démarrage. Donc : on fixe une version
  précise, on ne prend jamais « la dernière » à l'aveugle, et on vérifie ce qui
  a changé avant de monter. Pi-Web a une « liste de contrôle » automatique pour
  ça ; Yuki devra la reprendre quand il montera (pas urgent : il est en
  développement, pas en production).
- **On ne partage pas de code entre les deux projets**, car leurs branchements
  sont différents. Ce qu'on partage, ce sont les **règles** de ce document :
  bien séparer texte et réflexion, traduire les erreurs en langage clair,
  mesurer les temps, configurer proprement, et protéger contre les blocages
  (agent muet, réponse vide).
- Les **projets Python** ne peuvent pas utiliser ce moteur directement : s'ils
  ont un jour besoin d'un agent « riche », la solution est un petit programme
  Node à côté (side-car), pas une réécriture en Python.
- **Ce document est la seule source** : ne jamais en recopier le contenu
  ailleurs ; tous les projets pointent vers ce dossier.

---

## 10. Références (chemins réels)

| Quoi | Où |
|---|---|
| Garde-fou de version (modèle à réutiliser) | `/projects/Pi-Web/backend/src/pi/sdk-breaking-changes.ts` (+ usage route : `/projects/Pi-Web/backend/src/routes/settings.ts`) |
| Façade de référence (Yuki) | `/projects/Yuki/src/pi/host.ts`, `events.ts`, `errors.ts`, `instrumentation.ts`, `config.ts`, `index.ts` |
| Test de frontière SDK (Yuki) | `/projects/Yuki/tests/pi/boundary.test.ts` |
| Session directe (Pi-Web) | `/projects/Pi-Web/backend/src/pi/session.ts` |
| Services → runtime (Yuki) | `/projects/Yuki/src/pi/sdk/session-factory.ts` |
| Silence de flux | `/projects/Pi-Web/backend/src/pi/stream-silence.ts` |
| Réponse vide (thinking seul tronqué) | `/projects/Pi-Web/backend/src/pi/response-guard.ts` |
| Slots LLM par provider | `/projects/Pi-Web/backend/src/pi/concurrency.ts` |
| File de jobs (Yuki) | `/projects/Yuki/src/jobs/queue.ts`, `/projects/Yuki/src/pi/sdk/heavy-worker.ts` |
| Side-car Node (exemple MCP stdio) | `/projects/Pi-Web/backend/src/mcp/stdio-server.mjs` |

> Les chiffres cités (modules, lignes, versions) datent de l'**audit 2026-10** et
> évoluent avec les projets ; en cas de divergence, le code fait foi.
