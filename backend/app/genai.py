from __future__ import annotations

import json
import os
import re
import socket
import urllib.error
import urllib.request
from typing import Any

from . import data
from . import narrative as narrative_module
from .saves import load_state

DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
# DEFAULT_MODEL = "llama3.2:3b"
DEFAULT_MODEL = "phi3:mini"
REQUEST_TIMEOUT_SEC = 240
SIGNING_CANDIDATE_LIMIT = 25

VALID_SCOPES = {"narrative", "objectives", "context", "all", "signings"}


def ollama_config() -> tuple[str, str]:
    base = os.environ.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_URL).rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)
    return base, model


def check_status() -> dict:
    base, model = ollama_config()
    try:
        req = urllib.request.Request(f"{base}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {
            "available": False,
            "model": model,
            "baseUrl": base,
            "hint": f"Start Ollama and run: ollama pull {model}",
        }

    models = [entry.get("name", "") for entry in payload.get("models") or []]
    model_ready = any(name == model or name.startswith(f"{model}:") for name in models)
    return {
        "available": True,
        "model": model,
        "baseUrl": base,
        "modelReady": model_ready,
        "models": models[:12],
        "hint": None if model_ready else f"Run: ollama pull {model}",
    }


def _compact_profile(profile: dict) -> dict:
    return {
        "squadSize": profile.get("count"),
        "avgOverall": profile.get("avgOverall"),
        "best11Overall": profile.get("best11Overall"),
        "avgAge": profile.get("avgAge"),
        "youngUnder23": profile.get("youngUnder23Count"),
        "stars85Plus": profile.get("starCount"),
        "prospects": profile.get("prospectCount"),
        "dominantNationalities": (profile.get("dominantNationalities") or [])[:3],
    }


def _compact_candidate(player: dict, index: int) -> dict:
    return {
        "i": index,
        "name": player.get("name"),
        "ovr": player.get("overall"),
        "pot": player.get("potential"),
        "pos": player.get("positions"),
        "nat": player.get("nationality"),
        "reason": player.get("reason"),
    }


def _light_club_context(edition: int, club: str) -> dict[str, Any]:
    players = data.players_for_club(edition, club)
    profile = narrative_module.analyze_squad(players)
    top_players = sorted(players, key=lambda player: -(int(player.get("overall") or 0)))[:5]
    philosophy = narrative_module.derive_philosophy(club, profile, top_players)
    budget = narrative_module.derive_budget(profile)
    return {
        "profile": profile,
        "philosophy": philosophy,
        "budget": budget,
    }


def build_signing_context(
    edition: int,
    club: str,
    profile_id: str | None,
    max_value: int | None = None,
    max_wage: int | None = None,
    position: str | None = None,
) -> tuple[dict[str, Any], list[dict]]:
    club_context = _light_club_context(edition, club)
    suggestions = data.signing_suggestions(
        edition,
        club,
        max_value=max_value,
        max_wage=max_wage,
        limit=40,
        position=position,
    )

    candidates: list[dict] = []
    seen_ids: set[str] = set()
    for bucket in ("exPlayers", "futurePlayers", "otherPlayers"):
        for player in suggestions.get(bucket) or []:
            player_id = str(player.get("id") or "")
            if player_id and player_id in seen_ids:
                continue
            if player_id:
                seen_ids.add(player_id)
            candidates.append(player)

    limited_candidates = candidates[:SIGNING_CANDIDATE_LIMIT]
    compact_candidates = [_compact_candidate(player, index) for index, player in enumerate(limited_candidates)]

    context: dict[str, Any] = {
        "club": club,
        "edition": edition,
        "scope": "signings",
        "profile": _compact_profile(club_context.get("profile") or {}),
        "philosophy": {
            "title": (club_context.get("philosophy") or {}).get("title"),
            "tier": (club_context.get("philosophy") or {}).get("tier"),
        },
        "budget": {
            "maxTransfer": (club_context.get("budget") or {}).get("maxTransfer"),
            "maxWage": (club_context.get("budget") or {}).get("maxWage"),
        },
        "candidates": compact_candidates,
    }

    if profile_id:
        state = load_state(edition, club, profile_id)
        context["save"] = {
            "season": state.season,
            "transactions": [
                {
                    "player": tx.get("playerName"),
                    "type": tx.get("type"),
                }
                for tx in state.transactions[:5]
            ],
        }

    return context, limited_candidates


def build_objectives_context(
    edition: int,
    club: str,
    profile_id: str | None,
) -> dict[str, Any]:
    club_context = _light_club_context(edition, club)
    profile = club_context.get("profile") or {}
    philosophy = club_context.get("philosophy") or {}
    budget = club_context.get("budget") or {}
    existing = narrative_module.derive_board_objectives(philosophy, profile, club)

    context: dict[str, Any] = {
        "club": club,
        "edition": edition,
        "scope": "objectives",
        "profile": _compact_profile(profile),
        "philosophy": {
            "title": philosophy.get("title"),
            "summary": philosophy.get("summary"),
            "tier": philosophy.get("tier"),
        },
        "budget": {
            "maxTransfer": budget.get("maxTransfer"),
            "maxWage": budget.get("maxWage"),
        },
        "existingObjectives": [objective.get("text") for objective in existing[:5]],
    }

    if profile_id:
        state = load_state(edition, club, profile_id)
        context["save"] = {
            "season": state.season,
            "objectivesDone": [
                objective.get("text") for objective in state.objectives if objective.get("done")
            ][:5],
            "objectivesPending": [
                objective.get("text") for objective in state.objectives if not objective.get("done")
            ][:5],
            "recentMatches": [
                {
                    "opponent": match.get("opponent"),
                    "played": match.get("played"),
                    "result": match.get("result"),
                }
                for match in state.matches[:5]
            ],
        }

    return context


def build_context(
    edition: int,
    club: str,
    profile_id: str | None,
    scope: str,
) -> dict[str, Any]:
    narrative = data.club_narrative(edition, club)
    players = data.players_for_club(edition, club)[:5]
    top_players = [
        {
            "name": player.get("name"),
            "overall": player.get("overall"),
            "age": player.get("age"),
            "positions": player.get("positions"),
        }
        for player in players
    ]

    context: dict[str, Any] = {
        "club": club,
        "edition": edition,
        "scope": scope,
        "profile": _compact_profile(narrative.get("profile") or {}),
        "philosophy": {
            "title": (narrative.get("philosophy") or {}).get("title"),
            "summary": (narrative.get("philosophy") or {}).get("summary"),
            "tier": (narrative.get("philosophy") or {}).get("tier"),
        },
        "budget": {
            "maxTransfer": (narrative.get("budget") or {}).get("maxTransfer"),
            "maxWage": (narrative.get("budget") or {}).get("maxWage"),
        },
        "topPlayers": top_players,
        "eraHeadlines": [
            {"edition": era.get("edition"), "headline": era.get("headline")}
            for era in (narrative.get("eraNarratives") or [])[-3:]
        ],
        "existingStorylines": [
            {"title": storyline.get("title"), "type": storyline.get("type")}
            for storyline in (narrative.get("storylines") or [])[:4]
        ],
        "existingObjectives": [
            objective.get("text")
            for objective in (narrative.get("suggestedObjectives") or [])[:5]
        ],
    }

    if profile_id:
        state = load_state(edition, club, profile_id)
        context["save"] = {
            "season": state.season,
            "objectivesDone": [
                objective.get("text") for objective in state.objectives if objective.get("done")
            ][:5],
            "objectivesPending": [
                objective.get("text") for objective in state.objectives if not objective.get("done")
            ][:5],
            "recentMatches": [
                {
                    "opponent": match.get("opponent"),
                    "played": match.get("played"),
                    "result": match.get("result"),
                }
                for match in state.matches[:5]
            ],
        }

    return context


def _build_prompt(context: dict[str, Any], scope: str) -> str:
    if scope == "signings":
        return f"""You are a FIFA Career Mode transfer scout assistant.
Pick exactly 10 signing targets for the club using ONLY candidates from the context JSON.
Use candidate field "i" as candidateIndex in your response.
Prefer squad needs, budget limits, club philosophy, ex-player/future-player connections, and predominant nationalities fit.
Do not invent players outside the candidates list.
You can pick ex and future players but just 2 of each, the other players should be from the otherPlayers bucket.
Return a single JSON object with exactly these keys:
- signingPicks: array of exactly 10 objects with keys candidateIndex (integer), reason (short string under 12 words)
- insights: array of 2 short transfer-window insights (strings)

Context:
{json.dumps(context, ensure_ascii=False)}"""

    if scope == "objectives":
        return f"""You are a FIFA Career Mode board advisor.
Use ONLY the facts in the context JSON. Be specific to this club and edition.
Return a single JSON object with exactly these keys:
- objectives: array of 5-7 objects with keys text (string), gold (boolean)
- insights: array of 2 short board or squad insights (strings)

Context:
{json.dumps(context, ensure_ascii=False)}"""

    if scope == "context":
        return f"""You are a FIFA Career Mode narrative assistant.
Use ONLY the facts in the context JSON.
Return a single JSON object with exactly these keys:
- seasonHook: one paragraph opening the current season story (string)
- insights: array of 2 short club-context insights (strings)

Context:
{json.dumps(context, ensure_ascii=False)}"""

    if scope == "narrative":
        return f"""You are a FIFA Career Mode narrative assistant.
Use ONLY the facts in the context JSON. Be specific to this club and edition.
Return a single JSON object with exactly these keys:
- storylines: array of 2-3 objects with keys type, title, body
  (type one of: era, philosophy, squad, future, legacy, timeline)
- seasonHook: one paragraph opening the current season story (string)
- insights: array of 2 short tactical insights (strings)

Context:
{json.dumps(context, ensure_ascii=False)}"""

    return f"""You are a FIFA Career Mode narrative assistant.
Use ONLY the facts in the context JSON. Be specific to this club and edition.
Write immersive but realistic career-mode prose. No markdown.
Return a single JSON object with exactly these keys:
- storylines: array of 2-3 objects with keys type, title, body
  (type one of: era, philosophy, squad, future, legacy, timeline)
- objectives: array of 3-5 objects with keys text, gold (boolean)
- insights: array of 2-3 short tactical or transfer insights (strings)
- seasonHook: one paragraph opening the current season story (string)

Context:
{json.dumps(context, ensure_ascii=False)}"""


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("{"):
        return json.loads(cleaned)

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        return json.loads(cleaned[start : end + 1])

    raise ValueError("The local model did not return valid JSON.")


def _ollama_chat(prompt: str, *, max_tokens: int = 700) -> str:
    base, model = ollama_config()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "format": "json",
        "keep_alive": "10m",
        "options": {
            "temperature": 0.6,
            "num_predict": max_tokens,
        },
    }
    req = urllib.request.Request(
        f"{base}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except TimeoutError as error:
        raise RuntimeError(
            f"Ollama took longer than {REQUEST_TIMEOUT_SEC}s. "
            "Try again, use a smaller model, or close heavy apps while generating."
        ) from error
    except urllib.error.URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            raise RuntimeError(
                f"Ollama took longer than {REQUEST_TIMEOUT_SEC}s. "
                "Try again, use a smaller model, or close heavy apps while generating."
            ) from error
        raise ConnectionError(
            f"Ollama is not reachable at {base}. "
            f"Install from https://ollama.com, start Ollama, then run: ollama pull {model}"
        ) from error

    content = (body.get("message") or {}).get("content", "")
    if not content.strip():
        raise RuntimeError("Ollama returned an empty response.")
    return content


def _normalize_result(raw: dict[str, Any], scope: str) -> dict[str, Any]:
    storylines = raw.get("storylines") if isinstance(raw.get("storylines"), list) else []
    objectives = raw.get("objectives") if isinstance(raw.get("objectives"), list) else []
    insights = raw.get("insights") if isinstance(raw.get("insights"), list) else []
    season_hook = raw.get("seasonHook") if isinstance(raw.get("seasonHook"), str) else ""

    normalized_storylines = []
    for item in storylines:
        if not isinstance(item, dict):
            continue
        text = str(item.get("body") or item.get("text") or "").strip()
        title = str(item.get("title") or "").strip()
        if not title and not text:
            continue
        normalized_storylines.append(
            {
                "type": str(item.get("type") or "squad"),
                "title": title or "AI storyline",
                "body": text,
            }
        )

    normalized_objectives = []
    for item in objectives:
        if isinstance(item, dict):
            text = str(item.get("text") or "").strip()
            if text:
                normalized_objectives.append({"text": text, "gold": bool(item.get("gold"))})
        elif isinstance(item, str) and item.strip():
            normalized_objectives.append({"text": item.strip(), "gold": False})

    normalized_insights = [str(item).strip() for item in insights if str(item).strip()]

    result = {
        "storylines": normalized_storylines,
        "objectives": normalized_objectives,
        "insights": normalized_insights,
        "seasonHook": season_hook.strip(),
        "scope": scope,
        "source": "ollama",
    }

    if scope == "objectives":
        result["storylines"] = []
        result["seasonHook"] = ""
    elif scope == "context":
        result["storylines"] = []
        result["objectives"] = []
    elif scope == "narrative":
        result["objectives"] = []

    return result


def _normalize_signing_result(raw: dict[str, Any], candidates: list[dict]) -> dict[str, Any]:
    picks = raw.get("signingPicks") if isinstance(raw.get("signingPicks"), list) else []
    insights = raw.get("insights") if isinstance(raw.get("insights"), list) else []

    signing_suggestions: list[dict] = []
    used_indices: set[int] = set()

    for item in picks:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("candidateIndex", item.get("i")))
        except (TypeError, ValueError):
            continue
        if index < 0 or index >= len(candidates) or index in used_indices:
            continue

        used_indices.add(index)
        player = candidates[index]
        reason = str(item.get("reason") or "").strip()
        signing_suggestions.append(
            {
                **player,
                "customReason": f"AI pick · {reason}" if reason else "AI pick",
            }
        )
        if len(signing_suggestions) >= 10:
            break

    # Fill remaining slots with top unused candidates if the model returned too few.
    if len(signing_suggestions) < 10:
        for index, player in enumerate(candidates):
            if index in used_indices:
                continue
            signing_suggestions.append(
                {
                    **player,
                    "customReason": "AI fallback · strong fit from dataset pool",
                }
            )
            used_indices.add(index)
            if len(signing_suggestions) >= 10:
                break

    return {
        "signingSuggestions": signing_suggestions,
        "insights": [str(item).strip() for item in insights if str(item).strip()],
        "scope": "signings",
        "source": "ollama",
        "storylines": [],
        "objectives": [],
        "seasonHook": "",
    }


def enhance(
    edition: int,
    club: str,
    profile_id: str | None = None,
    scope: str = "narrative",
    max_value: int | None = None,
    max_wage: int | None = None,
    position: str | None = None,
) -> dict[str, Any]:
    normalized_scope = scope if scope in VALID_SCOPES else "narrative"
    status = check_status()
    if not status.get("available"):
        raise ConnectionError(status.get("hint") or "Ollama is not available.")
    if not status.get("modelReady"):
        raise RuntimeError(status.get("hint") or f"Model {status.get('model')} is not installed.")

    if normalized_scope == "signings":
        context, candidates = build_signing_context(
            edition,
            club.strip(),
            profile_id.strip() if profile_id else None,
            max_value=max_value,
            max_wage=max_wage,
            position=(position or "").strip() or None,
        )
        if not candidates:
            raise ValueError("No signing candidates found for the current filters.")
        prompt = _build_prompt(context, normalized_scope)
        raw_text = _ollama_chat(prompt, max_tokens=650)
        parsed = _extract_json(raw_text)
        return _normalize_signing_result(parsed, candidates)

    if normalized_scope == "objectives":
        context = build_objectives_context(
            edition,
            club.strip(),
            profile_id.strip() if profile_id else None,
        )
        prompt = _build_prompt(context, normalized_scope)
        raw_text = _ollama_chat(prompt, max_tokens=350)
        parsed = _extract_json(raw_text)
        return _normalize_result(parsed, normalized_scope)

    context = build_context(edition, club.strip(), profile_id.strip() if profile_id else None, normalized_scope)
    prompt = _build_prompt(context, normalized_scope)
    token_limit = 700 if normalized_scope == "all" else 450
    raw_text = _ollama_chat(prompt, max_tokens=token_limit)
    parsed = _extract_json(raw_text)
    return _normalize_result(parsed, normalized_scope)
