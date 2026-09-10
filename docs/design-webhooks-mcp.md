# Design d'interopérabilité de l'écosystème holaf — architecture centrée OpenClaw

**Statut :** proposition de design (design only — aucun code dans ce document)
**Dossier :** `holaf-lib/docs/`
**Public :** toute session agent future, sans contexte préalable (document autoportant)
**Date :** 2026

---

## 0. Résumé en une phrase

**OpenClaw est le cerveau** (l'agent principal, piloté par l'utilisateur via ses
canaux Telegram/WhatsApp/…) ; **Pi-Web, Docky, PEH et AiKore sont des bras** :
des *outils* que OpenClaw pilote via **MCP** (couche commandes) et qui le
**notifient** via des **webhooks sortants** (couche événements). Pi-Web doit
**exposer un serveur MCP** pour OpenClaw et **émettre** des webhooks vers lui —
il n'a **aucun endpoint webhook entrant** dans cette architecture.

Ce document décrit les **deux couches** de cette interopérabilité :

1. **Couche commandes** — chaque outil expose un **serveur MCP** que OpenClaw
   appelle pour agir (lister, lire, écrire, exécuter, déléguer).
2. **Couche événements** — chaque outil **notifie** OpenClaw via ses webhooks
   `/hooks/wake` et `/hooks/agent` (Bearer `hooks.token`).

Plus la **brique émetteur Python** (`holaf-notify.py`) pour que n'importe quel
outil Python puisse émettre un webhook vers OpenClaw sans réinventer l'auth.

> **Portabilité** : l'architecture reste **identique** si l'utilisateur migre de
> OpenClaw vers **hermes-agent** (concurrent, API server OpenAI-compatible
> `:8642`). Seuls l'URL cible et le mode d'auth de l'émetteur changent (cf. §4).

---

## 1. Vue d'ensemble — le cerveau et les bras

### 1.1 Les acteurs

| Acteur | Rôle | Interfaces |
|---|---|---|
| **OpenClaw** | **Le cerveau.** Agent principal, autonome, piloté par l'utilisateur via ses canaux (Telegram, WhatsApp, …). Décide, planifie, délègue. | Gateway `:18789` (WebSocket), webhooks **sortants** `/hooks/wake` + `/hooks/agent` (Bearer `hooks.token`), egress |
| **Pi-Web / Yuki** | **Outil de développement.** Backend Express + WebSocket + SDK Pi. Agent de session code **Yuki**. **Expose un serveur MCP** pour OpenClaw (à construire) et **émet** des webhooks vers OpenClaw. | **MCP serveur** (à construire), API REST `/api` (Bearer), WebSocket, `injectSessionNotification` (interne) |
| **Docky** | Outil — gestion de stacks Docker. **Serveur MCP existant** (le pattern de référence). | MCP (existant) |
| **PEH** | Outil — encodage vidéo (BullMQ, files de jobs). | MCP (à créer) + webhooks |
| **AiKore** | Outil — orchestrateur IA (instances de modèles). | MCP (à créer) + webhooks |
| **hermes-agent** | **Alternative d'OpenClaw** (NousResearch). API server **OpenAI-compatible** sur `:8642` (Bearer + `X-Hermes-Session-Id`), webhooks signés **HMAC** (`X-Hermes-Signature-256`). | API `:8642`, webhooks HMAC |

### 1.2 Le flux complet (schéma ASCII)

```
        ┌──────────────────────────────────────────────────────────────┐
        │                        OpenClaw (le cerveau)                │
        │   agent principal — piloté par l'utilisateur                 │
        │   (Telegram / WhatsApp / …) — gateway :18789                │
        └──────────────────────────────────────────────────────────────┘
          ▲                          │
          │  webhooks sortants       │  MCP (couche commandes)
          │  /hooks/wake + /hooks/agent│  OpenClaw appelle les tools
          │  (Bearer hooks.token)    │  des outils
          │  (couche événements)     ▼
   ┌───────┴────────┐   ┌───────────┐   ┌───────────┐   ┌──────────────┐
   │  Pi-Web (Yuki) │   │   Docky   │   │    PEH    │   │    AiKore    │
   │  serveur MCP   │   │  MCP exist│   │  MCP à    │   │  MCP à       │
   │  À CONSTRUIRE  │   │ (référence)│  │  créer    │   │  créer       │
   └────────────────┘   └───────────┘   └───────────┘   └──────────────┘
        │  code / sessions / git / terminal      │  stacks / jobs / instances
        └─────────────── les BRAS (outils) ───────┘
```

**Lecture du schéma :**

- **OpenClaw ──MCP──▶ outils** : OpenClaw (le cerveau) appelle les **tools MCP**
  exposés par chaque outil pour agir : lire/écrire du code (Pi-Web), gérer des
  stacks (Docky), lister/annuler des jobs (PEH), redémarrer des instances
  (AiKore). C'est la **couche commandes**.
- **Outils ──webhooks──▶ OpenClaw** : quand un outil finit une tâche, détecte
  une panne, voit un build échouer… il **notifie** OpenClaw via `/hooks/wake`
  (nudge) ou `/hooks/agent` (tâche). C'est la **couche événements**.
- **L'utilisateur pilote OpenClaw** via ses canaux habituels ; OpenClaw orchestre
  les bras et leur délègue le travail.

Les deux couches sont **asymétriques et complémentaires** : le MCP permet à
OpenClaw de *demander* des actions aux outils ; les webhooks poussent des
*facts* des outils vers OpenClaw. Un outil peut n'implémenter qu'une couche
(ex. Docky n'a que le MCP aujourd'hui).

### 1.3 Ce que Pi-Web n'est PAS dans cette architecture

- **Pas un hub central** : Pi-Web n'est plus le point de convergence des
  notifications. C'est **un outil parmi d'autres**, piloté par OpenClaw.
- **Pas d'endpoint webhook entrant** : Pi-Web ne reçoit pas de webhooks
  externes. Il **émet** vers OpenClaw.
- **`injectSessionNotification` n'est pas la cible des alertes externes** : ce
  mécanisme existe dans Pi-Web pour le **streaming interne** (injecter une
  notification dans la session Yuki active, `triggerTurn: false`). Les alertes
  **externes** (build failed, tests red, job terminé…) partent vers **OpenClaw**
  via les webhooks, pas vers la session Yuki.

---

## 2. Couche commandes — MCP par outil

### 2.1 Principe

Chaque outil expose un **serveur MCP** que OpenClaw appelle pour l'**inventorier**
et le **piloter** via des *tools*. C'est la couche *commandes* : OpenClaw
demande, l'outil exécute.

**Recommandation : un serveur MCP par outil, sur un port dédié.** Pas de
gateway centralisée. Chaque outil a son propre cycle de vie, ses dépendances et
son secret → isolation (une panne d'un outil ne casse pas les autres),
déploiement indépendant, auth par outil.

| Outil | Serveur MCP | Port (convention) | Statut |
|---|---|---|---|
| **Docky** | stacks Docker | `:9003` | ✅ **existant** (pattern de référence) |
| **Pi-Web** | code / sessions / git / terminal | `:9000` | 🚧 **À CONSTRUIRE** |
| **PEH** | jobs d'encodage | `:9001` | 🚧 à créer |
| **AiKore** | instances de modèles | `:9002` | 🚧 à créer |

### 2.2 Docky — le pattern de référence (déjà fait)

Docky expose déjà un serveur MCP. C'est le **modèle à imiter** pour les autres
outils :

- **Un serveur MCP par outil**, sur un port dédié.
- **Auth par token Bearer** (`HOLAF_MCP_TOKEN`).
- **Tools préfixés par le service** (`docky.stack.updated`, `docky.list_stacks`…)
  pour éviter les collisions quand OpenClaw connecte plusieurs serveurs.
- **Descriptions orientées agent** : chaque tool a une description en français,
  écrite pour que l'agent comprenne *quand* l'appeler et *ce qu'il en retire*.

### 2.3 Pi-Web — serveur MCP À CONSTRUIRE

Pi-Web a déjà des **clients MCP** (l'extension `codebase-memory`, etc.) mais
**pas encore de serveur MCP exposé pour OpenClaw**. C'est le cœur de ce design.

#### 2.3.1 Design des tools à exposer

Le serveur MCP de Pi-Web expose des tools pour qu'OpenClaw puisse travailler sur
le code, les sessions Yuki, git et le terminal. Convention de nommage :
préfixe `pi.` (le service), puis `<objet>.<verbe>`.

| Tool | Description (ce que l'agent lit) | Sûr par défaut ? |
|---|---|---|
| `pi.list_projects` | Liste les projets Pi-Web : id, nom, cwd, git, dernière activité | ✅ read-only |
| `pi.get_project` | Détails d'un projet : cwd, git status, mode actif, modèle | ✅ read-only |
| `pi.read_file` | Lit un fichier d'un projet (chemin relatif au cwd) | ✅ read-only |
| `pi.list_files` | Browse l'arborescence d'un projet | ✅ read-only |
| `pi.get_session_status` | État de la session Yuki d'un projet : active, modèle, contexte, streaming | ✅ read-only |
| `pi.run_git` | Exécute une commande git (status / diff / commit / push) | ⚠️ write derrière flag |
| `pi.edit_file` | Écrit/modifie un fichier d'un projet | ⚠️ write derrière flag |
| `pi.run_terminal_command` | Exécute une commande shell dans le cwd du projet | ⚠️ write derrière flag |
| `pi.run_session_prompt` | **Délègue du code à Yuki** : envoie un prompt à la session Yuki du projet | 🔒 auth + allowlist |

#### 2.3.2 La question de sécurité clé

Tous les tools ne sont **pas** sûrs pour un agent externe. Règle de base :

- **Read-only par défaut** : `list_projects`, `get_project`, `read_file`,
  `list_files`, `get_session_status` sont exposés **sans restriction** (hors
  auth Bearer du serveur MCP). Un agent externe peut *lire* sans risque.
- **Write/exec derrière un flag activé explicitement** : `edit_file`,
  `run_git` (commit/push), `run_terminal_command` modifient l'état. Ils ne sont
  **exposés que si** le flag `PI_MCP_ALLOW_WRITE=true` est activé dans la config
  du serveur MCP. Par défaut, le serveur MCP de Pi-Web est **read-only**.
- **`run_session_prompt` = le mode le plus puissant** : il délègue du travail à
  Yuki (l'agent de session code), qui peut à son tour écrire des fichiers,
  exécuter des commandes, etc. C'est une **délégation de pouvoir**. Il est donc
  derrière **auth + allowlist de projets** : seuls les projets explicitement
  listés dans `PI_MCP_PROMPT_ALLOWLIST` acceptent un prompt délégué, et le
  serveur exige un token dédié (cf. §6).

#### 2.3.3 Exemple de signature (esquisse)

```ts
// serveur MCP Pi-Web — esquisse de surface (implémentation à l'étape 1)
mcp.tool("pi.list_projects", async () => listProjects());
mcp.tool("pi.read_file", async ({ projectId, path }) => readFile(projectId, path));
mcp.tool("pi.get_session_status", async ({ projectId }) => getSessionStatus(projectId));

// write — exposé seulement si PI_MCP_ALLOW_WRITE=true
if (process.env.PI_MCP_ALLOW_WRITE === "true") {
  mcp.tool("pi.edit_file", async ({ projectId, path, content }) => editFile(projectId, path, content));
  mcp.tool("pi.run_git", async ({ projectId, args }) => runGit(projectId, args));
  mcp.tool("pi.run_terminal_command", async ({ projectId, command }) => runTerminal(projectId, command));
}

// délégation à Yuki — auth + allowlist
if (process.env.PI_MCP_PROMPT_ALLOWLIST) {
  mcp.tool("pi.run_session_prompt", async ({ projectId, message }) => {
    assertAllowlisted(projectId);            // allowlist de projets
    return sendPrompt(message, projectId);   // délègue à la session Yuki
  });
}
```

### 2.4 PEH / AiKore — template FastMCP (Python)

PEH et AiKore exposent leur serveur MCP en **Python avec FastMCP** (la lib MCP
Python la plus simple). Structure type :

```
service-mcp/
├── server.py          # point d'entrée FastMCP
├── tools_health.py    # health, status, list (tools standard)
├── tools_metier.py    # tools métier du service
├── requirements.txt   # fastmcp, httpx, ...
└── .env               # HOLAF_MCP_TOKEN, port, etc.
```

**Tools standard obligatoires** (préfixés par le service) :

| Tool | Description (ce que l'agent lit) |
|---|---|
| `<service>.health` | Le service est-il vivant ? Retourne `ok`/`degraded`/`down` + uptime |
| `<service>.status` | État détaillé : version, charge, files en cours, erreurs récentes |
| `<service>.list` | **Inventaire** : liste les ressources du service (jobs, instances, stacks…) |

**Tools métier** (exemples) :

```python
from fastmcp import FastMCP

mcp = FastMCP("peh")

@mcp.tool()
def peh_list_jobs(status: str = "all") -> list[dict]:
    """Liste les jobs d'encodage vidéo. status: all|queued|active|completed|failed.
    Retourne id, nom du fichier, progression %, état."""
    ...

@mcp.tool()
def peh_cancel_job(job_id: str) -> dict:
    """Annule un job d'encodage en cours. Retourne l'état après annulation.
    Ne peut pas annuler un job déjà terminé."""
    ...
```

```python
@mcp.tool()
def aikore_list_instances() -> list[dict]:
    """Liste les instances de modèles IA actives : nom du modèle, état
    (running|stopped|error), charge GPU, mémoire."""
    ...

@mcp.tool()
def aikore_restart_instance(instance_id: str) -> dict:
    """Redémarre une instance de modèle IA (utile après une panne).
    Retourne le nouvel état."""
    ...
```

### 2.4.1 Brancher le serveur MCP Pi-Web dans OpenClaw (config)

Le serveur MCP de Pi-Web est un **process stdio** lancé par OpenClaw via
`node` (découplé du backend Express : il appelle l'API REST de Pi-Web en
localhost avec une agent key). Il est implémenté à la main (JSON-RPC 2.0 sur
stdin/stdout, sans SDK) dans `backend/src/mcp/stdio-server.mjs` — un fichier
`.mjs` autonome, non compilé par tsc.

**Config OpenClaw** (commande `mcp add`) :

```bash
mcp add pi-web -- \
  node /projects/Pi-Web/backend/src/mcp/stdio-server.mjs
```

**Variables d'environnement** (à fournir à OpenClaw pour ce serveur) :

| Variable | Obligatoire | Défaut | Description |
|---|---|---|---|
| `PI_MCP_AGENT_TOKEN` | ✅ | — | Agent key Pi-Web (Bearer) pour l'API REST. Le serveur **refuse de démarrer** si absente. |
| `PI_MCP_BASE_URL` | — | `http://localhost:3000` | Base de l'API REST Pi-Web. |
| `PI_MCP_TIMEOUT_MS` | — | `20000` | Timeout des appels API (10–30 s). |

**Tools exposés (read-only)** : `pi.list_projects`, `pi.get_project`,
`pi.read_file`, `pi.list_files`, `pi.run_git_status`, `pi.list_sessions`,
`pi.get_session_status`. Les write tools (`edit_file`, `run_git` commit/push,
`run_terminal_command`, `run_session_prompt`) viendront à l'étape 4, derrière
`PI_MCP_ALLOW_WRITE=true` et l'allowlist `PI_MCP_PROMPT_ALLOWLIST`.

> **Sécurité** : le serveur MCP n'a **aucun secret dans ses logs** (il ne trace
> ni le token ni les corps de réponse sensibles) et les erreurs API (401, 404,
> path-security, timeout) remontent comme résultats MCP avec un message clair.

### 2.5 Convention commune

- **Préfixe service** : `pi.*`, `docky.*`, `peh.*`, `aikore.*` — évite les
  collisions quand OpenClaw connecte plusieurs serveurs MCP.
- **Auth token par serveur** : chaque serveur exige un **token Bearer**
  (`HOLAF_MCP_TOKEN` dans son `.env`). Un token par outil, révocable
  indépendamment.
- **Descriptions orientées agent** : chaque tool a une description en français,
  écrite pour que l'agent comprenne *quand* l'appeler et *ce qu'il en retire*.

---

## 3. Couche événements — les outils notifient OpenClaw

### 3.1 Les endpoints OpenClaw

OpenClaw expose deux webhooks **sortants** (côté récepteur) que les outils
appellent pour le notifier. Auth : **Bearer `hooks.token`**.

| Endpoint | Rôle | Payload |
|---|---|---|
| `POST /hooks/wake` | **Nudge** : réveille OpenClaw, lui donne un fait à considérer. OpenClaw décide s'il réagit. | `{ "text": "...", "mode": "..." }` |
| `POST /hooks/agent` | **Tâche** : confie une tâche à un agent OpenClaw. | `{ "message": "...", "agentId": "..." }` |

**Exemple `/hooks/wake`** (nudge — le cas le plus courant pour les outils) :

```json
POST /hooks/wake
Authorization: Bearer <hooks.token>
Content-Type: application/json

{
  "text": "Build échoué sur Pi-Web (projet my-app) : erreur TS sur src/index.ts",
  "mode": "notify"
}
```

**Exemple `/hooks/agent`** (tâche déléguée) :

```json
POST /hooks/agent
Authorization: Bearer <hooks.token>
Content-Type: application/json

{
  "message": "Le build de my-app a échoué. Analyse l'erreur et propose un correctif.",
  "agentId": "dev"
}
```

> **Référence** : doc archivée `openclaw-webhooks` (webhooks `/hooks/wake` +
> `/hooks/agent` Bearer, egress, WS `:18789`).

### 3.2 La brique émetteur Python (`holaf-notify.py`)

Pour qu'un outil Python (PEH, AiKore, et tout script Pi-Web) puisse émettre un
webhook vers OpenClaw **sans réinventer l'auth**, holaf-lib fournit une brique
émetteur : `python/holaf-notify.py` (rayon `python/` de holaf-lib).

#### 3.2.1 Configuration par environnement

| Variable | Description |
|---|---|
| `HOLAF_WEBHOOK_URL` | URL du **gateway OpenClaw**, ex. `http://127.0.0.1:18789/hooks/wake` |
| `HOLAF_WEBHOOK_TOKEN` | Le `hooks.token` d'OpenClaw (Bearer) |

> **Portabilité** : en cas de migration vers hermes, on change `HOLAF_WEBHOOK_URL`
> et le mode d'auth de l'émetteur (cf. §4). Le reste du code ne change pas.

#### 3.2.2 API

```python
from holaf_notify import notify

# Nudge OpenClaw (le cas le plus courant)
notify(
    event="pi.build.failed",
    message="Build échoué sur my-app : erreur TS sur src/index.ts",
    priority="critical",          # info | warning | critical
    data={"projectId": "proj_1", "file": "src/index.ts"},
)

# Confier une tâche à un agent OpenClaw
notify(
    event="pi.session.prompt_finished",
    message="Yuki a terminé la refactor de auth.ts. Vérifie le diff.",
    priority="info",
    data={"projectId": "proj_1", "agentId": "dev"},
    agent=True,                   # True → POST /hooks/agent au lieu de /hooks/wake
)
```

#### 3.2.3 Implémentation (esquisse)

```python
import json, os, time, urllib.request

def notify(event, message, priority="info", data=None, agent=False):
    url = os.environ["HOLAF_WEBHOOK_URL"]
    token = os.environ["HOLAF_WEBHOOK_TOKEN"]
    if agent:
        url = url.replace("/hooks/wake", "/hooks/agent")
        payload = {"message": message, "agentId": (data or {}).get("agentId", "dev")}
    else:
        payload = {"text": message, "mode": "notify"}

    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    # retry léger : 3 tentatives, backoff 1s/2s/4s
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 202)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
```

#### 3.2.4 Retry léger

- **3 tentatives** avec backoff exponentiel (1 s, 2 s, 4 s).
- **Timeout 10 s** par tentative.
- En cas d'échec définitif, la brique **lève une exception** (l'outil appelant
  décide de la politique : log, file de retry, etc.). Pas de retry infini (un
  outil ne doit pas bloquer sur un webhook).

### 3.3 Exemples concrets d'émission

| Outil | Événement | Message (orienté agent) |
|---|---|---|
| **Pi-Web** | `pi.build.failed` | « Build échoué sur my-app : erreur TS sur src/index.ts » |
| **Pi-Web** | `pi.tests.red` | « Tests rouges sur my-app : 3 échecs dans auth.test.ts » |
| **Pi-Web** | `pi.session.prompt_finished` | « Yuki a terminé la refactor de auth.ts. Vérifie le diff. » |
| **PEH** | `peh.job.completed` | « Encodage terminé : film-4k.mp4 → 1080p (durée 2h14, 0 erreur) » |
| **AiKore** | `aikore.instance.down` | « Instance qwen3.8-flash-next arrêtée (crash GPU, redémarrage auto tenté) » |

---

## 4. La portabilité OpenClaw → Hermes

L'architecture reste **identique** si l'utilisateur migre de OpenClaw vers
**hermes-agent** (NousResearch, concurrent d'OpenClaw : API server
OpenAI-compatible `:8642` Bearer + webhooks HMAC `X-Hermes-Signature-256`,
sessions `X-Hermes-Session-Id`). Seuls l'URL cible et le mode d'auth de
l'émetteur changent.

### 4.1 Tableau des correspondances

| Concept | OpenClaw | hermes-agent |
|---|---|---|
| **wake** (nudge) | `POST /hooks/wake` | `POST /v1/runs` + `session_id` |
| **agent** (tâche) | `POST /hooks/agent` | `POST /v1/chat/completions` |
| **auth** | `hooks.token` Bearer | `API_SERVER_KEY` Bearer |
| **egress** (sortant) | `hooks.outbound` HMAC | `X-Hermes-Signature-256` (HMAC-SHA256) |
| **session** | — | `X-Hermes-Session-Id` |

### 4.2 Ce qui change concrètement

- **`HOLAF_WEBHOOK_URL`** : de `http://127.0.0.1:18789/hooks/wake` vers
  `http://127.0.0.1:8642/v1/runs` (wake) / `.../v1/chat/completions` (agent).
- **Mode d'auth de l'émetteur** : de Bearer `hooks.token` vers Bearer
  `API_SERVER_KEY` (et, pour l'egress, signature HMAC `X-Hermes-Signature-256`
  du body brut).

La brique `holaf-notify.py` doit donc **abstraire** ces deux paramètres (URL +
mode d'auth) pour que la migration soit un simple changement de config, pas de
code. C'est le principe de **portabilité** : le design ne dépend pas d'OpenClaw
en dur.

> **Référence** : doc archivée `hermes-api-server` (API `:8642` OpenAI-compatible
> Bearer + `X-Hermes-Session-Id`, webhooks HMAC `X-Hermes-Signature-256`).

---

## 5. Convention d'événements

### 5.1 Format

```
<source>.<objet>.<verbe>
```

- **`source`** : l'outil émetteur (`pi`, `peh`, `aikore`, `docky`, …).
- **`objet`** : la ressource concernée (`build`, `tests`, `session`, `job`,
  `instance`, `stack`, …).
- **`verbe`** : l'action au participe passé (`failed`, `red`, `completed`,
  `down`, `updated`, `cancelled`, `loaded`, `prompt_finished`, …).

Le verbe est **au participe passé** (état résultant) : on annonce un *fait
accompli*, pas une intention. C'est cohérent avec le rôle de notification
(OpenClaw reçoit un fait, il décide de la suite).

### 5.2 Exemples concrets

**Pi-Web** (développement) :

| Événement | Message (orienté agent) |
|---|---|
| `pi.build.failed` | « Build échoué sur my-app : erreur TS sur src/index.ts » |
| `pi.tests.red` | « Tests rouges sur my-app : 3 échecs dans auth.test.ts » |
| `pi.session.prompt_finished` | « Yuki a terminé la refactor de auth.ts. Vérifie le diff. » |

**PEH** (encodage vidéo) :

| Événement | Message |
|---|---|
| `peh.job.completed` | « Encodage terminé : film-4k.mp4 → 1080p (durée 2h14, 0 erreur) » |
| `peh.job.failed` | « Échec d'encodage : film-4k.mp4 (codec invalide, étape 3/5) » |
| `peh.job.cancelled` | « Job d'encodage annulé : film-4k.mp4 (demande utilisateur) » |

**AiKore** (orchestrateur IA) :

| Événement | Message |
|---|---|
| `aikore.instance.down` | « Instance qwen3.8-flash-next arrêtée (crash GPU, redémarrage auto tenté) » |
| `aikore.instance.up` | « Instance qwen3.8-flash-next de nouveau opérationnelle » |
| `aikore.model.loaded` | « Modèle llama.cpp chargé en mémoire (8 Go) » |

**Docky** (stacks Docker) :

| Événement | Message |
|---|---|
| `docky.stack.updated` | « Stack media déployée : 3 conteneurs recréés, 0 erreur » |
| `docky.stack.degraded` | « Stack media dégradée : conteneur plex en restart-loop » |

---

## 6. Sécurité

1. **Les webhooks vers OpenClaw ne peuvent pas faire courir du code arbitraire
   chez les outils.** C'est le point le plus important. Un webhook émis par un
   outil ne fait **que notifier** OpenClaw (`/hooks/wake` = nudge, `/hooks/agent`
   = tâche). C'est **OpenClaw qui décide** via ses skills s'il réagit et comment.
   Un outil compromis peut au pire envoyer des notifications trompeuses, mais
   pas exécuter d'actions sur les autres outils.

2. **Tools MCP Pi-Web exposés à OpenClaw — read-only par défaut.** Les tools de
   lecture (`list_projects`, `get_project`, `read_file`, `list_files`,
   `get_session_status`) sont exposés sans restriction (hors auth Bearer du
   serveur). Les tools d'écriture/exécution (`edit_file`, `run_git`,
   `run_terminal_command`) ne sont exposés **que si** `PI_MCP_ALLOW_WRITE=true`.

3. **`run_session_prompt` derrière auth + allowlist.** Déléguer du code à Yuki
   est le mode le plus puissant (Yuki peut écrire/exécuter). Il exige un **token
   dédié** et une **allowlist de projets** (`PI_MCP_PROMPT_ALLOWLIST`) : seuls
   les projets listés acceptent un prompt délégué.

4. **Tokens par service.** Chaque serveur MCP a son propre token
   (`HOLAF_MCP_TOKEN`), chaque webhook sortant son propre `hooks.token`. Une
   fuite d'un token ne compromet qu'un outil, pas tout l'écosystème. Révocation
   indépendante.

5. **Ne JAMAIS loguer les secrets.** Ni les tokens MCP, ni `hooks.token`, ni
   `API_SERVER_KEY`, ni le contenu sensible de `data` ne doivent apparaître dans
   les logs. Seuls l'événement, la source et le statut d'émission sont
   journalisés.

6. **Portabilité sans affaiblissement.** La migration vers hermes conserve les
   mêmes principes : Bearer `API_SERVER_KEY` + signature HMAC
   `X-Hermes-Signature-256` (anti-tampering du body). Le niveau de sécurité ne
   baisse pas en changeant de cerveau.

---

## 7. Le rôle de Yuki

**Yuki** est l'agent de session code **dans Pi-Web** : il exécute les prompts
dans une session Pi (SDK Pi), avec des outils fichier/terminal/git. Dans
l'architecture centrée OpenClaw, Yuki a un rôle **délimité** :

- **Yuki est un bras, pas le cerveau.** Il ne décide pas de la stratégie
  globale ; il exécute du travail de code délégué.
- **OpenClaw peut lui déléguer du travail via le MCP Pi-Web**
  (`pi.run_session_prompt`) : OpenClaw envoie un prompt à la session Yuki d'un
  projet, Yuki l'exécute (écrit des fichiers, lance des commandes), et le
  résultat remonte à OpenClaw.
- **Yuki peut notifier OpenClaw des événements** (build, tests, fin de session)
  via `holaf-notify.py` : `pi.build.failed`, `pi.tests.red`,
  `pi.session.prompt_finished`.

### 7.1 Frontière des rôles

| | OpenClaw | Yuki |
|---|---|---|
| **Rôle** | Cerveau — planifie, décide, orchestre | Bras — exécute du code dans une session Pi |
| **Piloté par** | L'utilisateur (Telegram/WhatsApp/…) | OpenClaw (via MCP `pi.run_session_prompt`) |
| **Décide** | Quoi faire, quand, avec quel outil | Comment exécuter le prompt délégué |
| **Notifie** | Reçoit les webhooks des outils | Émet des webhooks vers OpenClaw |
| **Portée** | Tout l'écosystème (Pi-Web, Docky, PEH, AiKore) | Un projet Pi-Web à la fois |

> **Clarification** : `injectSessionNotification` (streaming interne de Pi-Web)
> reste un mécanisme **interne** à Pi-Web pour injecter une notification dans la
> session Yuki active (`triggerTurn: false`). Il n'est **pas** la cible des
> alertes externes — celles-ci partent vers OpenClaw via les webhooks.

---

## 8. Roadmap d'implémentation

| # | Étape | Contenu | Effort estimé |
|---|---|---|---|
| 1 | **Pi-Web serveur MCP (read-only d'abord)** | Exposer un serveur MCP Pi-Web sur `:9000` avec les tools **read-only** (`list_projects`, `get_project`, `read_file`, `list_files`, `get_session_status`), auth Bearer `HOLAF_MCP_TOKEN`, descriptions orientées agent | **Moyen** (1–2 jours) |
| 2 | **Brique émetteur `python/holaf-notify.py`** | Brique Python dans `holaf-lib/python/`, config par env (`HOLAF_WEBHOOK_URL` + `HOLAF_WEBHOOK_TOKEN`), abstraction URL + mode d'auth (portabilité OpenClaw→Hermes), retry léger, API `notify(...)` | **Faible** (0,5 jour) |
| 3 | **Wiring alertes Pi-Web → OpenClaw** | Brancher les événements Pi-Web (build, tests, sessions) sur `holaf-notify.py` → `POST /hooks/wake` (Bearer `hooks.token`) | **Faible** (0,5–1 jour) |
| 4 | **Write tools + `run_session_prompt`** | Exposer `edit_file`, `run_git`, `run_terminal_command` derrière `PI_MCP_ALLOW_WRITE=true`, et `run_session_prompt` derrière auth + allowlist `PI_MCP_PROMPT_ALLOWLIST` | **Moyen** (1–2 jours) |
| 5 | **PEH MCP** | Serveur MCP de PEH (template FastMCP : `peh.health/status/list` + `peh.list_jobs`, `peh.get_job`, `peh.cancel_job`) + webhooks (`peh.job.completed/failed/cancelled`) | **Moyen** (1–2 jours) |
| 6 | **AiKore MCP** | Serveur MCP d'AiKore (`aikore.list_instances`, `aikore.restart_instance`, …) + webhooks (`aikore.instance.down/up`) | **Moyen** (1 jour) |

**Ordre logique** : on commence par le serveur MCP read-only de Pi-Web (étape 1)
pour que OpenClaw puisse *lire* l'écosystème, puis la brique émetteur (étape 2)
et le wiring des alertes (étape 3) pour que les outils puissent *notifier*
OpenClaw. On ajoute ensuite les write tools et la délégation à Yuki (étape 4),
puis les serveurs MCP de PEH (étape 5) et AiKore (étape 6).

---

## 9. Références

- **Pi-Web** : `backend/src/pi/session.ts` (`injectSessionNotification` — streaming
  interne, `sendPrompt` — délégation à Yuki), `backend/src/pi/cbm-stdio.ts` +
  `backend/src/routes/cbm.ts` (clients MCP existants), `docs/agent-api.md` (API
  agent externe), `AGENTS.md` (conventions).
- **OpenClaw** : doc archivée `openclaw-webhooks` (webhooks `/hooks/wake` +
  `/hooks/agent` Bearer `hooks.token`, egress, WS `:18789`).
- **hermes-agent** : doc archivée `hermes-api-server` (API `:8642`
  OpenAI-compatible Bearer + `X-Hermes-Session-Id`, webhooks HMAC
  `X-Hermes-Signature-256`).
- **holaf-lib** : `README.md` (briques JS versionnées par brique), `manifest.json`,
  rayon `python/` (à créer pour `holaf-notify.py`).
- **Docky** : serveur MCP existant (pattern de référence, §2.2).
