# Pattern d'adaptateur MCP — la recette pour exposer un outil à OpenClaw

**Statut :** pattern documenté (validé par l'utilisateur) — pas de code ici, une recette à réutiliser
**Dossier :** `holaf-lib/docs/`
**Public :** toute session agent future, sans contexte préalable (document autoportant)
**Date :** 2026

---

## 0. Le pattern en une phrase

**Un serveur MCP par outil** — un registre de *tools* → une **façade métier** →
une **auth Bearer** → une **validation humaine** pour les tools sensibles. Le
**protocole est délégué au SDK officiel** du langage (FastMCP / `mcp` v2 en
Python ; `@modelcontextprotocol/sdk` en JS si un jour nécessaire). On ne
réimplémente jamais le protocole à la main.

---

## 1. La règle d'or

**Ne JAMAIS réimplémenter le protocole MCP maison quand le SDK officiel existe.**

- **Docky** utilise **FastMCP 4.x** (SDK `mcp` v2) → il **négocie** le protocole
  **2025-11-25** (transport streamable HTTP `/mcp` + stdio).
- **Pi-Web** a écrit son serveur **à la main** (`stdio-server.mjs`, JSON-RPC
  stdio) → il est **figé au protocole 2024-11-05**. Leçon : si un jour le SDK
  officiel devient nécessaire (incompatibilité, nouveau transport), Pi-Web devra
  **migrer vers `@modelcontextprotocol/sdk`**.

Le SDK gère la négociation de version, les transports, le handshake et le
framing. Réimplémenter = se figer sur une version et réinventer des bugs déjà
résolus.

---

## 2. Les 2 implémentations réelles de l'écosystème

| | **Docky** (référence) | **Pi-Web** (leçon documentée) |
|---|---|---|
| **Implémentation** | FastMCP 4.x (SDK `mcp` v2) | `stdio-server.mjs` maison (JSON-RPC stdio) |
| **Protocole** | **2025-11-25** (négocié) | **2024-11-05** (figé) |
| **Transport** | streamable HTTP `/mcp` + stdio | stdio uniquement |
| **Tools** | **30** (containers / stacks / web / mémoire) | **7** read-only |
| **Nature** | write (gestion de stacks) | read-only (proxy vers API REST) |
| **Auth** | Bearer `security.mcp_api_key` (auto-générée) | agent key Bearer (API REST) |
| **Path-security** | — | via routes agent (chemin relatif au cwd) |
| **Tools sensibles** | `exec_in_container` protégé par marqueur `__NEEDS_HUMAN_VALIDATION__` | n/a (read-only) |
| **Activable** | `mcp_enabled` désactivable | — |
| **Leçon** | ✅ le pattern à imiter | ⚠️ protocole figé → migrer vers SDK si incompatibilité |

---

## 3. La recette pas à pas (ex. ajouter un serveur MCP à PEH)

1. **Choisir le SDK officiel du langage.** Python → **FastMCP** (`fastmcp`,
   SDK `mcp` v2). JS → `@modelcontextprotocol/sdk`. Jamais de protocole maison.
2. **Définir les tools orientés agent.** La **description = ce que l'agent lit** :
   *quand* appeler le tool et *ce qu'il en retire*. Préfixer par le service
   (`peh.*`, `docky.*`, `pi.*`) pour éviter les collisions entre serveurs.
3. **La façade métier.** Chaque tool **exécute les actions du service** (appel
   API REST, commande, etc.) et remonte un résultat clair. Le serveur MCP est un
   **adaptateur** : il ne contient pas la logique métier, il la délègue.
4. **Auth Bearer token.** Un **token par serveur** (`HOLAF_MCP_TOKEN` /
   `security.mcp_api_key`), révocable indépendamment. Le serveur **refuse de
   démarrer** si le token est absent.
5. **Tools destructifs → validation humaine.** Marquer les tools sensibles
   (exécution, suppression, redémarrage) avec un **marqueur**
   (`__NEEDS_HUMAN_VALIDATION__` chez Docky) : l'agent doit obtenir une
   confirmation humaine avant exécution.
6. **Enregistrement chez le consommateur.** Déclarer le serveur chez OpenClaw :
   `mcp add <outil> -- <commande de lancement>` + variables d'environnement
   (token, base URL, timeout).

---

## 4. La frontière des rôles

- **Les outils exposent leurs tools** (ce qu'ils savent faire) via leur serveur
  MCP.
- **L'interconnexion entre outils est le domaine du cerveau (OpenClaw).** Un
  outil **ne se connecte pas lui-même** à un autre outil : c'est OpenClaw qui
  orchestre, appelle les tools des différents serveurs et décide de la suite.
- Un outil compromis ne peut donc **pas** exécuter d'actions sur les autres
  outils — il ne fait qu'exposer ses propres tools.

---

## 5. Sécurité

1. **Bearer par serveur** : un token par outil, révocable indépendamment. Une
   fuite ne compromet qu'un outil.
2. **Tools destructifs → validation humaine** : marqueur
   `__NEEDS_HUMAN_VALIDATION__` (ex. `exec_in_container` chez Docky).
3. **Ne JAMAIS loguer les secrets** : ni tokens, ni corps de réponse sensibles.
   Seuls l'événement, la source et le statut sont journalisés.
4. **Read-only par défaut** pour les tools d'un **nouvel outil** : on expose
   d'abord la lecture, les write/exec viennent derrière un flag explicite
   (`PI_MCP_ALLOW_WRITE=true` chez Pi-Web) et une validation humaine.

---

## 6. Références

- **Docky** : FastMCP 4.x, transport streamable HTTP `/mcp` + stdio, protocole
  2025-11-25, 30 tools, auth Bearer `security.mcp_api_key`, `mcp_enabled`.
- **Pi-Web** : `backend/src/mcp/stdio-server.mjs` (maison, protocole 2024-11-05
  figé), 7 tools read-only, proxy API REST, agent key Bearer, path-security via
  routes agent.
- **holaf-lib** : `docs/design-webhooks-mcp.md` (architecture centrée OpenClaw,
  couche commandes MCP + couche événements webhooks).
