from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import pandas as pd

from .config import DATA_DIR


_SLUG_RE = re.compile(r"[^a-z0-9_-]+")


def _ascii_slug(value: str) -> str:
    """
    Safe-ish slug for filesystem paths.
    Keeps it stable across runs while avoiding path traversal.
    """
    raw = str(value or "").strip().lower()
    if not raw:
        return "unknown"

    normalized = unicodedata.normalize("NFKD", raw)
    without_accents = "".join(ch for ch in normalized if not unicodedata.combining(ch))

    slug = _SLUG_RE.sub("_", without_accents)
    slug = slug.strip("_")
    return slug or "unknown"


def career_save_root() -> Path:
    return DATA_DIR / "career_saves"


def save_dir(edition: int, team: str, profile_id: str) -> Path:
    edition_dir = career_save_root() / str(int(edition))
    team_dir = edition_dir / _ascii_slug(team)
    profile_dir = team_dir / _ascii_slug(profile_id)
    return profile_dir


def meta_path(edition: int, team: str, profile_id: str) -> Path:
    return save_dir(edition, team, profile_id) / "meta.csv"


def objectives_path(edition: int, team: str, profile_id: str) -> Path:
    return save_dir(edition, team, profile_id) / "objectives.csv"


def matches_path(edition: int, team: str, profile_id: str) -> Path:
    return save_dir(edition, team, profile_id) / "matches.csv"


def transactions_path(edition: int, team: str, profile_id: str) -> Path:
    return save_dir(edition, team, profile_id) / "transactions.csv"


@dataclass(frozen=True)
class CareerSaveState:
    season: int
    objectives: list[dict]
    matches: list[dict]
    transactions: list[dict]


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    s = str(value).strip().lower()
    return s in {"1", "true", "yes", "y", "t"}


def default_state() -> CareerSaveState:
    return CareerSaveState(season=1, objectives=[], matches=[], transactions=[])


def _prettify_slug(slug: str) -> str:
    return str(slug or "").replace("_", " ").strip().title() or "Unknown club"


@lru_cache(maxsize=16)
def _team_slug_map(edition: int) -> dict[str, str]:
    from .data import list_clubs_for_edition

    mapping: dict[str, str] = {}
    try:
        for club in list_clubs_for_edition(edition):
            mapping[_ascii_slug(club)] = club
    except Exception:
        pass
    return mapping


def resolve_team_name(edition: int, team_slug: str, meta_team: str | None = None) -> str:
    if meta_team and str(meta_team).strip():
        return str(meta_team).strip()
    return _team_slug_map(edition).get(team_slug, _prettify_slug(team_slug))


def list_all_saves() -> list[dict]:
    root = career_save_root()
    if not root.is_dir():
        return []

    saves: list[dict] = []
    for edition_dir in sorted(root.iterdir(), key=lambda p: p.name):
        if not edition_dir.is_dir():
            continue
        try:
            edition = int(edition_dir.name)
        except ValueError:
            continue

        for team_dir in sorted(team_dir for team_dir in edition_dir.iterdir() if team_dir.is_dir()):
            team_slug = team_dir.name
            for profile_dir in sorted(p for p in team_dir.iterdir() if p.is_dir()):
                mp = profile_dir / "meta.csv"
                if not mp.is_file():
                    continue
                try:
                    meta = pd.read_csv(mp, low_memory=False)
                    if meta.empty:
                        continue
                    row = meta.iloc[0].to_dict()
                    meta_team = row.get("team")
                    saves.append(
                        {
                            "edition": edition,
                            "team": resolve_team_name(edition, team_slug, meta_team),
                            "teamSlug": team_slug,
                            "profileId": str(row.get("profileId") or profile_dir.name),
                            "profileName": str(row.get("profileName") or profile_dir.name),
                            "season": int(row.get("season") or 1),
                            "updatedAt": str(row.get("updatedAt") or ""),
                        }
                    )
                except Exception:
                    continue

    saves.sort(key=lambda item: item.get("updatedAt") or "", reverse=True)
    return saves


def list_profiles(edition: int, team: str) -> list[dict]:
    root = career_save_root() / str(int(edition)) / _ascii_slug(team)
    if not root.is_dir():
        return []

    profiles: list[dict] = []
    for child in sorted(root.iterdir(), key=lambda p: p.name):
        if not child.is_dir():
            continue
        mp = child / "meta.csv"
        if not mp.is_file():
            continue
        try:
            meta = pd.read_csv(mp, low_memory=False)
            if meta.empty:
                continue
            row = meta.iloc[0].to_dict()
            profiles.append(
                {
                    "profileId": str(row.get("profileId") or child.name),
                    "profileName": str(row.get("profileName") or child.name),
                    "season": int(row.get("season") or 1),
                    "updatedAt": str(row.get("updatedAt") or ""),
                }
            )
        except Exception:
            # Best effort: ignore malformed meta rows
            continue
    return profiles


def load_state(edition: int, team: str, profile_id: str) -> CareerSaveState:
    state = default_state()
    save_directory = save_dir(edition, team, profile_id)
    if not save_directory.is_dir():
        return state

    # meta
    mp = save_directory / "meta.csv"
    if mp.is_file():
        try:
            meta = pd.read_csv(mp, low_memory=False)
            if not meta.empty:
                season_raw = meta.iloc[0].get("season", 1)
                try:
                    state = CareerSaveState(
                        season=int(season_raw) if pd.notna(season_raw) else 1,
                        objectives=[],
                        matches=[],
                    )
                except Exception:
                    # Keep defaults if meta season is invalid
                    pass
        except Exception:
            pass

    # objectives
    objp = save_directory / "objectives.csv"
    objectives: list[dict] = []
    if objp.is_file():
        try:
            obj_df = pd.read_csv(objp, low_memory=False)
            if not obj_df.empty:
                for row in obj_df.to_dict(orient="records"):
                    # Normalize types for the frontend
                    objectives.append(
                        {
                            "id": str(row.get("id") or ""),
                            "text": str(row.get("text") or ""),
                            "done": _parse_bool(row.get("done")),
                            "season": int(row.get("season") or 1),
                            "gold": _parse_bool(row.get("gold")) if "gold" in row else False,
                        }
                    )
        except Exception:
            objectives = []

    # matches
    mp2 = save_directory / "matches.csv"
    matches: list[dict] = []
    if mp2.is_file():
        try:
            match_df = pd.read_csv(mp2, low_memory=False)
            if not match_df.empty:
                for row in match_df.to_dict(orient="records"):
                    matches.append(
                        {
                            "id": str(row.get("id") or ""),
                            "opponent": str(row.get("opponent") or ""),
                            "date": str(row.get("date") or "") if pd.notna(row.get("date")) else "",
                            "distanceKm": row.get("distanceKm"),
                            "isRivalry": _parse_bool(row.get("isRivalry")),
                            "notes": str(row.get("notes") or ""),
                            "played": _parse_bool(row.get("played")),
                            "result": str(row.get("result") or ""),
                            "season": int(row.get("season") or 1),
                        }
                    )
        except Exception:
            matches = []

    # transactions
    txp = save_directory / "transactions.csv"
    transactions: list[dict] = []
    if txp.is_file():
        try:
            tx_df = pd.read_csv(txp, low_memory=False)
            if not tx_df.empty:
                for row in tx_df.to_dict(orient="records"):
                    transactions.append(
                        {
                            "id": str(row.get("id") or ""),
                            "playerName": str(row.get("playerName") or ""),
                            "type": str(row.get("type") or ""),
                            "details": str(row.get("details") or "") if pd.notna(row.get("details")) else "",
                            "fee": str(row.get("fee") or "") if pd.notna(row.get("fee")) else "",
                            "wage": str(row.get("wage") or "") if pd.notna(row.get("wage")) else "",
                            "season": int(row.get("season") or 1),
                        }
                    )
        except Exception:
            transactions = []

    return CareerSaveState(season=state.season, objectives=objectives, matches=matches, transactions=transactions)


def save_state(
    edition: int,
    team: str,
    profile_id: str,
    profile_name: str,
    state: CareerSaveState,
) -> None:
    dir_path = save_dir(edition, team, profile_id)
    dir_path.mkdir(parents=True, exist_ok=True)

    updated_at = datetime.now(timezone.utc).isoformat()

    meta_df = pd.DataFrame(
        [
            {
                "profileId": str(profile_id),
                "profileName": str(profile_name or profile_id),
                "team": str(team),
                "season": int(state.season),
                "updatedAt": updated_at,
            }
        ]
    )
    meta_df.to_csv(meta_path(edition, team, profile_id), index=False, encoding="utf-8")

    # objectives.csv
    if state.objectives:
        obj_df = pd.DataFrame(
            [
                {
                    "id": o.get("id", ""),
                    "text": o.get("text", ""),
                    "done": 1 if bool(o.get("done")) else 0,
                    "season": int(o.get("season") or 1),
                    "gold": 1 if bool(o.get("gold")) else 0,
                }
                for o in state.objectives
            ]
        )
    else:
        obj_df = pd.DataFrame(columns=["id", "text", "done", "season", "gold"])
    obj_df.to_csv(objectives_path(edition, team, profile_id), index=False, encoding="utf-8")

    # matches.csv
    if state.matches:
        match_df = pd.DataFrame(
            [
                {
                    "id": m.get("id", ""),
                    "opponent": m.get("opponent", ""),
                    "date": m.get("date", ""),
                    "distanceKm": m.get("distanceKm", ""),
                    "isRivalry": 1 if bool(m.get("isRivalry")) else 0,
                    "notes": m.get("notes", ""),
                    "played": 1 if bool(m.get("played")) else 0,
                    "result": m.get("result", ""),
                    "season": int(m.get("season") or 1),
                }
                for m in state.matches
            ]
        )
    else:
        match_df = pd.DataFrame(
            columns=["id", "opponent", "date", "distanceKm", "isRivalry", "notes", "played", "result", "season"]
        )
    match_df.to_csv(matches_path(edition, team, profile_id), index=False, encoding="utf-8")

    # transactions.csv
    if state.transactions:
        tx_df = pd.DataFrame(
            [
                {
                    "id": t.get("id", ""),
                    "playerName": t.get("playerName", ""),
                    "type": t.get("type", ""),
                    "details": t.get("details", ""),
                    "fee": t.get("fee", ""),
                    "wage": t.get("wage", ""),
                    "season": int(t.get("season") or 1),
                }
                for t in state.transactions
            ]
        )
    else:
        tx_df = pd.DataFrame(
            columns=["id", "playerName", "type", "details", "fee", "wage", "season"]
        )
    tx_df.to_csv(transactions_path(edition, team, profile_id), index=False, encoding="utf-8")

