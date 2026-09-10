#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""════════════════════════════════════════════════════════════════════════════
 HolafNotify — Brique émetteur Python de holaf-lib · version 0.1.0
 ──────────────────────────────────────────────────────────────────────────────
 Notifie OpenClaw (le « cerveau » de l'écosystème holaf) qu'un fait vient de se
 produire, via son webhook POST /hooks/wake (auth Bearer hooks.token). C'est la
 couche événements du design d'interopérabilité : les outils (PEH, AiKore,
 scripts Pi-Web…) poussent des FAITS vers OpenClaw, qui décide s'il réagit.

 Référence : docs/design-webhooks-mcp.md — sections « Couche événements »,
 « Brique émetteur Python » et « Convention d'événements » (§5).

 ZÉRO DÉPENDANCE : stdlib pur (urllib, json, os, time). Tourne sur n'importe
 quel serveur Python 3.6+ sans installation (aucun pip install).

 CONFIG — variables d'environnement :
   HOLAF_WEBHOOK_URL       URL du gateway OpenClaw, ex.
                           http://127.0.0.1:18789/hooks/wake        (requis)
   HOLAF_WEBHOOK_TOKEN     le hooks.token d'OpenClaw, envoyé en Bearer (requis)
   HOLAF_WEBHOOK_TIMEOUT   timeout réseau par tentative, en secondes (défaut 10)

 USAGE :
   from holaf_notify import notify          # import : voir README (nom à tiret)
   notify(event="peh.job.completed",                          # <source>.<objet>.<verbe>
          message="Encodage terminé : film-4k.mp4 → 1080p",   # texte orienté agent
          priority="info",                       # info | warning | critical
          data={"file": "film-4k.mp4", "errors": 0},   # résumé clé=valeur du text
          project="media")                       # préfixé « projet=media » du text
   # POST http://…/hooks/wake  Authorization: Bearer <hooks.token>
   # {"text": "[peh.job.completed] Encodage terminé : film-4k.mp4 → 1080p
   #           (projet=media, file=film-4k.mp4, errors=0)", "mode": "now"}

 COMPORTEMENT :
   - payload {"text": ..., "mode": "now"} ; v0.1.0 simple : mode « now » pour
     toutes les priorités (critical comme les autres).
   - retry léger : 3 tentatives, backoff 1s → 2s → 4s, UNIQUEMENT sur erreur
     réseau (DNS, refusé, timeout…) ou HTTP 5xx. Un 4xx est définitif (auth ou
     payload invalide : re-POSTer ne changerait rien).
   - échec définitif → HolafNotifyError (à l'appelant de choisir sa politique :
     log, file de retry locale, abandon…). Un outil ne doit pas bloquer sur un
     webhook.
   - JAMAIS de secret dans les exceptions ni les logs (le token n'y figure
     jamais ; cf. design §6.5).
══════════════════════════════════════════════════════════════════════════════"""

import json
import os
import time
import urllib.error
import urllib.request

VERSION = "0.1.0"

# ─── Constantes ───────────────────────────────────────────────────────────────
ENV_URL = "HOLAF_WEBHOOK_URL"          # URL du gateway OpenClaw
ENV_TOKEN = "HOLAF_WEBHOOK_TOKEN"      # hooks.token (Bearer) — ne JAMAIS loguer
ENV_TIMEOUT = "HOLAF_WEBHOOK_TIMEOUT"  # timeout par tentative (secondes)
DEFAULT_TIMEOUT = 10.0                 # secondes
WAKE_MODE = "now"                      # valeur du champ "mode" du payload /hooks/wake
MAX_ATTEMPTS = 3                       # tentatives d'émission au total
BACKOFFS = (1, 2, 4)                   # pauses (s) avant les tentatives 2, 3, (4)
SUMMARY_MAX_CHARS = 200                # limite du résumé clé=valeur dans le text
PRIORITIES = ("info", "warning", "critical")


class HolafNotifyError(RuntimeError):
    """Échec d'émission du webhook (réseau/5xx après retries, ou 4xx définitif)."""


class HolafNotifyConfigError(HolafNotifyError):
    """Configuration absente ou invalide (variables d'environnement)."""


# ─── Config ───────────────────────────────────────────────────────────────────
def _config():
    """Lit la config dans l'environnement. Exception explicite si incomplète ;
    la valeur du token n'apparaît jamais dans un message (secret, design §6.5)."""
    url = (os.environ.get(ENV_URL) or "").strip()
    token = (os.environ.get(ENV_TOKEN) or "").strip()
    if not url:
        raise HolafNotifyConfigError(
            f"[holaf-notify] {ENV_URL} absente ou vide : indiquer l'URL du gateway "
            "OpenClaw, ex. http://127.0.0.1:18789/hooks/wake"
        )
    if not url.startswith(("http://", "https://")):
        raise HolafNotifyConfigError(
            f"[holaf-notify] {ENV_URL} doit commencer par http:// ou https://"
        )
    if not token:
        raise HolafNotifyConfigError(
            f"[holaf-notify] {ENV_TOKEN} absente ou vide : indiquer le hooks.token "
            "d'OpenClaw (envoyé en en-tête Bearer, jamais journalisé)"
        )
    timeout_raw = (os.environ.get(ENV_TIMEOUT) or "").strip()
    if not timeout_raw:
        return url, token, DEFAULT_TIMEOUT
    try:
        return url, token, float(timeout_raw)
    except ValueError:
        raise HolafNotifyConfigError(
            f"[holaf-notify] {ENV_TIMEOUT} doit être un nombre de secondes "
            f"(reçu : {timeout_raw!r})"
        )


# ─── Formatage du champ "text" ────────────────────────────────────────────────
def _format_text(event, message, data, project):
    """Construit le "text" lisible par l'agent OpenClaw : "[event] message",
    suivi si project/data d'un résumé " (projet=…, clé=valeur, …)" (~200 c max)."""
    text = f"[{event}] {message}"

    # Résumé clé=valeur : d'abord le projet, puis les paires de data.
    parts = []
    if project:
        parts.append(f"projet={project}")
    for key, value in (data or {}).items():
        if isinstance(value, (dict, list, tuple)):
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        parts.append(f"{key}={value}")
    summary = ", ".join(parts)

    if summary:
        # Garde-fou : le résumé reste un RÉSUMÉ lisible, pas un dump complet.
        if len(summary) > SUMMARY_MAX_CHARS:
            summary = summary[: SUMMARY_MAX_CHARS - 1] + "…"
        text = f"{text} ({summary})"
    return text


# ─── Émission HTTP (Bearer + retry léger) ─────────────────────────────────────
def _post_with_retry(url, payload, token, timeout, event):
    """POST JSON avec auth Bearer et retry léger : 3 tentatives au total,
    backoff 1s → 2s → 4s, UNIQUEMENT sur erreur réseau ou HTTP 5xx. Un 4xx
    lève immédiatement (échec définitif). Retourne True si accepté (2xx)."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error = None

    for attempt in range(MAX_ATTEMPTS):
        if attempt > 0:
            time.sleep(BACKOFFS[attempt - 1])  # 1s puis 2s (4s ne sert qu'au-delà)

        # Requête reconstruite à chaque tentative (urllib consomme l'objet).
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": f"Bearer {token}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = getattr(resp, "status", None) or resp.getcode()
                if 200 <= status < 300:
                    return True
                last_error = f"HTTP {status}"
        except urllib.error.HTTPError as exc:
            if exc.code < 500:
                # 4xx : refus définitif (auth, payload…) — inutile de re-POSTer.
                raise HolafNotifyError(
                    f"[holaf-notify] webhook refusé (HTTP {exc.code}) pour "
                    f"« {event} » : vérifier {ENV_URL} et {ENV_TOKEN} "
                    "(détail de la réponse non journalisé)"
                ) from exc
            last_error = f"HTTP {exc.code} (erreur serveur)"
        except urllib.error.URLError as exc:  # pannes réseau classiques (DNS, refus…)
            last_error = f"{type(exc).__name__}: {exc.reason}"
        except OSError as exc:  # timeouts, connexions rompues, etc.
            last_error = f"{type(exc).__name__}: {exc}"

    raise HolafNotifyError(
        f"[holaf-notify] échec d'émission pour « {event} » après "
        f"{MAX_ATTEMPTS} tentatives (backoff 1s/2s/4s) — dernière erreur : {last_error}"
    )


# ─── API publique ─────────────────────────────────────────────────────────────
def notify(event, message, priority="info", data=None, project=None):
    """Notifie OpenClaw d'un fait accompli via POST /hooks/wake (Bearer).

    event    : identifiant d'événement, convention <source>.<objet>.<verbe> au
               participe passé (ex. "peh.job.completed") — cf. design §5.
    message  : texte orienté agent, lisible tel quel par OpenClaw.
    priority : "info" | "warning" | "critical" (v0.1.0 : n'influence pas le
               payload — mode « now » pour toutes les priorités).
    data     : dict optionnel → résumé "clé=valeur" (max ~200 caractères).
    project  : nom du projet concerné → préfixe "projet=…" du résumé.

    Retourne True si le gateway a accepté (2xx). Lève HolafNotifyConfigError
    si la config env est incomplète, HolafNotifyError si l'émission échoue
    définitivement, ValueError si les arguments sont invalides.
    """
    event = str(event or "").strip()
    message = str(message or "").strip()
    if not event:
        raise ValueError("[holaf-notify] event obligatoire (convention <source>.<objet>.<verbe>, cf. design §5)")
    if not message:
        raise ValueError("[holaf-notify] message obligatoire (texte lisible par l'agent OpenClaw)")
    if priority not in PRIORITIES:
        raise ValueError(f"[holaf-notify] priority={priority!r} inconnue (valeurs : {' | '.join(PRIORITIES)})")

    url, token, timeout = _config()
    payload = {
        "text": _format_text(event, message, data, project),
        "mode": WAKE_MODE,
    }
    return _post_with_retry(url, payload, token, timeout, event=event)


__all__ = ["notify", "HolafNotifyError", "HolafNotifyConfigError", "VERSION"]