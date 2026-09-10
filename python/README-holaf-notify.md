# HolafNotify — brique émetteur Python (webhooks OpenClaw)

Brique autonome, **zéro dépendance** : un seul fichier `holaf-notify.py` en
**stdlib pur** (`urllib`, `json`, `os`, `time`) — à copier dans n'importe quel
projet Python (PEH, AiKore, scripts Pi-Web…), **sans pip install**, Python 3.6+.

**Version : 0.1.0**

Son rôle : notifier **OpenClaw** (le « cerveau » de l'écosystème holaf) qu'un
fait vient de se produire, via son webhook **`POST /hooks/wake`** (nudge — auth
**Bearer `hooks.token`**). C'est la **couche événements** du design
d'interopérabilité : les outils poussent des *faits accomplis* vers OpenClaw,
qui décide s'il réagit et comment.

> Référence : [`docs/design-webhooks-mcp.md`](../docs/design-webhooks-mcp.md) —
> sections « Couche événements » (§3) et « Convention d'événements » (§5).
> La portabilité OpenClaw → hermes-agent est décrite en §4 du design : seul
> l'URL cible et le mode d'auth changent (config), pas le code appelant.

---

## Configuration (variables d'environnement)

| Variable | Description | Défaut |
|---|---|---|
| `HOLAF_WEBHOOK_URL` | URL du gateway OpenClaw, ex. `http://127.0.0.1:18789/hooks/wake` | **requis** |
| `HOLAF_WEBHOOK_TOKEN` | Le `hooks.token` d'OpenClaw, envoyé en en-tête `Authorization: Bearer …` | **requis** |
| `HOLAF_WEBHOOK_TIMEOUT` | Timeout réseau **par tentative**, en secondes | `10` |

Config absente → **exception explicite** (`HolafNotifyConfigError`) qui nomme
la variable manquante. **Jamais de secret dans les messages d'erreur** : le
token n'apparaît jamais dans une exception ni un log (design §6.5).

---

## Usage

```python
from holaf_notify import notify   # voir § Import ci-dessous (nom de fichier à tiret)

# Le cas le plus courant : un nudge vers OpenClaw
notify(
    event="peh.job.completed",                          # convention <source>.<objet>.<verbe>
    message="Encodage terminé : film-4k.mp4 → 1080p",   # texte orienté agent
    priority="info",                                    # info | warning | critical
    data={"file": "film-4k.mp4", "errors": 0},          # résumé clé=valeur
    project="media",                                    # préfixé « projet=media »
)

# Un fait urgent (v0.1.0 : mode « now » pour toutes les priorités — simple)
notify(
    event="pi.build.failed",
    message="Build échoué sur my-app : erreur TS sur src/index.ts",
    priority="critical",
    data={"projectId": "proj_1", "file": "src/index.ts"},
)
```

### Ce qui part sur le fil

Un `POST` JSON vers `HOLAF_WEBHOOK_URL` avec en-tête
`Authorization: Bearer <HOLAF_WEBHOOK_TOKEN>` et le payload :

```json
{
  "text": "[peh.job.completed] Encodage terminé : film-4k.mp4 → 1080p (projet=media, file=film-4k.mp4, errors=0)",
  "mode": "now"
}
```

- **`text`** = `"[event] message"`, suivi si `project`/`data` sont fournis d'un
  résumé ` (projet=…, clé=valeur, …)` limité à **~200 caractères**. Le `text`
  est ce que l'agent OpenClaw lira : il doit rester un résumé **lisible**
  (pas un dump), avec un message orienté agent (cf. §5 du design).
- **`mode`** = `"now"` en v0.1.0, pour toutes les priorités (critical compris) ;
  le paramètre `priority` est validé (`info | warning | critical`) et gardé
  dans la signature pour une évolution future.
- Retour : `True` si le gateway a accepté (HTTP 2xx).

### Retry et erreurs

| Situation | Comportement |
|---|---|
| Erreur réseau (DNS, refusé, timeout…) ou **HTTP 5xx** | **Retry léger** : 3 tentatives au total, backoff **1 s → 2 s → 4 s** |
| **HTTP 4xx** (auth, payload refusé) | Échec **définitif immédiat** — re-POSTer ne changerait rien |
| Échec après les 3 tentatives (ou 4xx) | `HolafNotifyError` (message clair : event, nb de tentatives, dernière erreur — **sans le token**) |
| Config env manquante/invalide | `HolafNotifyConfigError` (sous-classe de `HolafNotifyError`) |
| Arguments invalides (event/message vide, priority inconnue) | `ValueError` |

En cas d'échec définitif, **c'est à l'appelant** de choisir sa politique (log,
file de retry locale, abandon…). La brique ne bloque jamais en retry infini.

---

## Import dans un service Python

Le fichier s'appelle `holaf-notify.py` (tiret, convention de nommage des
briques holaf-lib) : un `import` direct ne marche donc pas. Deux options :

**Option recommandée — chargement par chemin (aucune contrainte) :**

```python
import importlib.util, pathlib

def load_holaf_notify(vendor_dir="vendor/holaf"):
    """Charge la brique holaf-notify (nom de fichier à tiret)."""
    spec = importlib.util.spec_from_file_location(
        "holaf_notify", pathlib.Path(vendor_dir) / "holaf-notify.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

holaf_notify = load_holaf_notify()
holaf_notify.notify(event="peh.job.completed", message="…")
```

**Option simple — renommer la copie pinnée** en `holaf_notify.py` dans le
projet hôte, puis `from holaf_notify import notify` fonctionne directement.

---

## Intégration dans un service Python (PEH / AiKore)

1. **Installer la brique** depuis holaf-lib :
   ```bash
   cd /projects/holaf-lib && ./scripts/holaf install notify /projects/peh
   # → /projects/peh/vendor/holaf/holaf-notify.py
   ```
2. **Configurer le service** (`.env` ou variables d'environnement du
   conteneur/du service) :
   ```bash
   HOLAF_WEBHOOK_URL=http://127.0.0.1:18789/hooks/wake
   HOLAF_WEBHOOK_TOKEN=<hooks.token OpenClaw — un token par outil>
   HOLAF_WEBHOOK_TIMEOUT=10
   ```
3. **Émettre depuis le code métier** — dans le worker BullMQ de PEH, par
   exemple, à la fin d'un job :
   ```python
   import os
   from holaf_notify import notify, HolafNotifyError   # import via § Import

   def on_job_completed(job):
       try:
           notify(
               event="peh.job.completed",
               message=f"Encodage terminé : {job.filename} → {job.preset}",
               priority="info",
               data={"jobId": job.id, "duration": job.duration, "errors": job.error_count},
           )
       except HolafNotifyError as exc:
           log.warning("notification OpenClaw impossible : %s", exc)  # le job, lui, a réussi
   ```
   > **Politique conseillée** : la notification ne doit jamais faire échouer
   > le travail métier. Attraper `HolafNotifyError` et journaliser — OpenClaw
   > rattrapera l'état via le MCP du service de toute façon (couche commandes).

### Convention d'événements (design §5)

Format **`<source>.<objet>.<verbe>`**, verbe au **participe passé** (on
annonce un fait accompli, pas une intention) :

- `source` = l'outil émetteur : `pi`, `peh`, `aikore`, `docky`…
- `objet` = la ressource : `build`, `tests`, `session`, `job`, `instance`, `stack`…
- `verbe` = `failed`, `red`, `completed`, `down`, `updated`, `cancelled`…

Exemples : `peh.job.completed`, `peh.job.failed`, `aikore.instance.down`,
`aikore.instance.up`, `pi.build.failed`, `pi.tests.red`, `docky.stack.updated`.
Le tableau complet des messages orientés agent recommandés est dans le
[design doc §5.2](../docs/design-webhooks-mcp.md).

---

## Notes

- **Portabilité** (design §4) : en cas de migration OpenClaw → hermes-agent,
  seuls `HOLAF_WEBHOOK_URL` et le mode d'auth de l'émetteur changent ; le code
  appelant (`notify(...)`) reste identique. v0.1.0 implémente l'auth Bearer
  OpenClaw (`/hooks/wake`) ; l'abstraction hermes (HMAC) est prévue par le
  design mais pas encore écrite.
- **Sécurité** (design §6) : un webhook ne fait *que notifier* — OpenClaw
  décide. Ne jamais loguer le token ni le contenu sensible de `data` ; la
  brique ne met dans ses exceptions que l'event, l'URL de config et le statut.
- **Validation** : testée manuellement contre un serveur webhook mocké local
  (payload, headers Bearer, retry sur 500 ×1, échec après 3 tentatives, 4xx
  sans retry, config manquante).