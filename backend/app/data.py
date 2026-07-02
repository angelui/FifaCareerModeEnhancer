from __future__ import annotations

from functools import lru_cache

import pandas as pd

from .config import club_column, editions, player_columns, players_csv_path
from .club_relations import build_club_catalog, partition_club_relations


def _validate_players_frame(frame: pd.DataFrame, edition: int) -> pd.DataFrame:
    required = {club_column(), *player_columns().values()}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"FIFA {edition} dataset is missing columns: {', '.join(missing)}")

    if "sofifa_id" in frame.columns:
        frame["sofifa_id"] = frame["sofifa_id"].astype("Int64").astype(str)

    for numeric_col in ("overall", "potential", "value_eur", "wage_eur", "age"):
        if numeric_col in frame.columns:
            frame[numeric_col] = pd.to_numeric(frame[numeric_col], errors="coerce")

    return frame


@lru_cache(maxsize=16)
def load_players_frame(edition: int) -> pd.DataFrame:
    path = players_csv_path(edition)
    if not path.is_file():
        raise FileNotFoundError(f"Dataset not found for FIFA {edition}: {path.name}")

    frame = pd.read_csv(path, low_memory=False)
    return _validate_players_frame(frame, edition)


def clear_frame_cache() -> None:
    load_players_frame.cache_clear()
    list_all_clubs.cache_clear()


def _player_records(frame: pd.DataFrame) -> list[dict]:
    columns_map = player_columns()
    subset = frame[list(columns_map.values())].copy()
    subset.columns = list(columns_map.keys())

    records: list[dict] = []
    for row in subset.itertuples(index=False):
        record = row._asdict()
        record["id"] = "" if pd.isna(record["id"]) else str(record["id"])
        for key in ("overall", "potential", "value", "wage", "age"):
            value = record.get(key)
            if pd.isna(value):
                record[key] = ""
            elif key in ("overall", "potential", "age"):
                record[key] = int(value)
            else:
                record[key] = int(value)
        for key in ("name", "fullName", "club", "positions", "nationality"):
            value = record.get(key)
            record[key] = "" if pd.isna(value) else str(value).strip()
        records.append(record)

    return records


def edition_dataset_stats(edition: int) -> dict[str, int]:
    frame = load_players_frame(edition)
    club_col = club_column()
    clubs = frame[club_col].dropna().astype(str).str.strip()
    clubs = clubs[clubs != ""]
    return {"rows": len(frame), "clubs": int(clubs.nunique())}


def list_clubs_for_edition(edition: int) -> list[str]:
    frame = load_players_frame(edition)
    club_col = club_column()
    clubs = frame[club_col].dropna().astype(str).str.strip()
    clubs = clubs[clubs != ""]
    return sorted(clubs.unique().tolist(), key=str.casefold)


@lru_cache(maxsize=1)
def list_all_clubs() -> list[str]:
    merged: set[str] = set()
    for edition in editions():
        try:
            merged.update(list_clubs_for_edition(edition))
        except FileNotFoundError:
            continue
    return sorted(merged, key=str.casefold)


def players_for_club(edition: int, club_name: str) -> list[dict]:
    frame = load_players_frame(edition)
    club_col = club_column()
    filtered = frame[frame[club_col].astype(str).str.strip() == club_name.strip()]
    filtered = filtered.sort_values("overall", ascending=False)
    return _player_records(filtered)


def search_players(edition: int, query: str, limit: int = 50) -> list[dict]:
    normalized = query.strip().lower()
    if len(normalized) < 2:
        return []

    frame = load_players_frame(edition)
    columns_map = player_columns()
    search_cols = [columns_map["name"], columns_map["fullName"], columns_map["club"], columns_map["nationality"]]

    mask = False
    for column in search_cols:
        mask = mask | frame[column].astype(str).str.lower().str.contains(normalized, na=False, regex=False)

    filtered = frame[mask].sort_values("overall", ascending=False).head(limit)
    return _player_records(filtered)


def summarize_squad(players: list[dict]) -> dict:
    empty = {
        "count": 0,
        "avgOverall": None,
        "best11Overall": None,
        "subsOverall": None,
        "topPlayers": [],
        "dominantNationalities": [],
        "nationalityCount": 0,
        "nationalityCounts": {},
        "youngUnder23Count": 0,
        "seniorOver32Count": 0,
    }
    if not players:
        return empty

    overalls: list[int] = []
    for player in players:
        overall = player.get("overall")
        if str(overall).isdigit():
            overalls.append(int(overall))

    if not overalls:
        return {**empty, "count": len(players)}

    avg_overall = round(sum(overalls) / len(overalls))
    best11 = overalls[:11]
    subs = overalls[11:]

    counts: dict[str, int] = {}
    young_under_23 = 0
    senior_over_32 = 0
    for player in players:
        age = player.get("age")
        if isinstance(age, int):
            if age < 23:
                young_under_23 += 1
            if age > 32:
                senior_over_32 += 1
        nat = str(player.get("nationality") or "").strip()
        if not nat or nat.lower() == "nan":
            continue
        counts[nat] = counts.get(nat, 0) + 1

    distinct_count = len({nat.casefold() for nat in counts.keys()}) if counts else 0

    top_nats: list[str] = []
    if counts:
        top_nats = [nat for nat, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].casefold()))[:3]]

    return {
        "count": len(players),
        "avgOverall": avg_overall,
        "best11Overall": round(sum(best11) / len(best11)),
        "subsOverall": round(sum(subs) / len(subs)) if subs else None,
        "topPlayers": players[:3],
        "dominantNationalities": top_nats,
        "nationalityCount": distinct_count,
        "nationalityCounts": counts,
        "youngUnder23Count": young_under_23,
        "seniorOver32Count": senior_over_32,
    }


def club_archive(club_name: str) -> list[dict]:
    timeline: list[dict] = []
    for edition in editions():
        try:
            players = players_for_club(edition, club_name)
        except FileNotFoundError:
            players = []

        timeline.append(
            {
                "edition": edition,
                "summary": summarize_squad(players),
            }
        )
    return timeline


def _club_sofifa_ids(edition: int, club_name: str) -> set[str]:
    frame = load_players_frame(edition)
    club_col = club_column()
    id_col = player_columns()["id"]
    filtered = frame[frame[club_col].astype(str).str.strip() == club_name.strip()]
    ids = filtered[id_col].dropna().astype(str).str.strip()
    return {player_id for player_id in ids if player_id and player_id.lower() != "nan"}


def _player_records_for_ids(edition: int, player_ids: set[str]) -> dict[str, dict]:
    if not player_ids:
        return {}

    frame = load_players_frame(edition)
    id_col = player_columns()["id"]
    ids = frame[id_col].astype(str).str.strip()
    filtered = frame[ids.isin(player_ids)]
    records = _player_records(filtered)
    return {record["id"]: record for record in records if record["id"]}


def signing_suggestions(
    edition: int,
    club_name: str,
    max_value: int | None = None,
    max_wage: int | None = None,
    limit: int = 40,
) -> dict:
    normalized_club = club_name.strip()
    current_ids = _club_sofifa_ids(edition, normalized_club)

    ex_meta: dict[str, int] = {}
    future_meta: dict[str, int] = {}

    for other_edition in editions():
        if other_edition == edition:
            continue

        try:
            historical_ids = _club_sofifa_ids(other_edition, normalized_club)
        except FileNotFoundError:
            continue

        for player_id in historical_ids:
            if player_id in current_ids:
                continue

            if other_edition < edition:
                ex_meta[player_id] = max(ex_meta.get(player_id, 0), other_edition)
            else:
                stored = future_meta.get(player_id)
                if stored is None or other_edition < stored:
                    future_meta[player_id] = other_edition

    candidate_ids = set(ex_meta) | set(future_meta)
    current_players = _player_records_for_ids(edition, candidate_ids)

    ex_players: dict[str, dict] = {}
    for player_id, last_edition in ex_meta.items():
        candidate = current_players.get(player_id)
        if not candidate or candidate["club"] == normalized_club:
            continue
        ex_players[player_id] = {
            **candidate,
            "reason": "ex-player",
            "lastAtClubEdition": last_edition,
        }

    future_players: dict[str, dict] = {}
    future_ids_by_edition: dict[int, set[str]] = {}
    for player_id, join_edition in future_meta.items():
        future_ids_by_edition.setdefault(join_edition, set()).add(player_id)

    future_snapshots: dict[str, dict] = {}
    for join_edition, player_ids in future_ids_by_edition.items():
        future_snapshots.update(_player_records_for_ids(join_edition, player_ids))

    for player_id, join_edition in future_meta.items():
        future_snapshot = future_snapshots.get(player_id)
        if not future_snapshot or future_snapshot["club"] != normalized_club:
            continue
        current_snapshot = current_players.get(player_id)
        if not current_snapshot or current_snapshot["club"] == normalized_club:
            continue
        future_players[player_id] = {
            **current_snapshot,
            "reason": "future-player",
            "joinsClubEdition": join_edition,
        }

    def _within_filters(player: dict) -> bool:
        # Empty fields pass through unless the filter is explicitly active.
        if max_value is not None and max_value > 0:
            value = player.get("value")
            if value in ("", None):
                return False
            if int(value) > max_value:
                return False

        if max_wage is not None and max_wage > 0:
            wage = player.get("wage")
            if wage in ("", None):
                return False
            if int(wage) > max_wage:
                return False

        return True

    def _sort_key(player: dict) -> tuple:
        value = player.get("overall")
        overall = int(value) if str(value).isdigit() else 0
        return (-overall, player.get("name", ""))

    ex_list = sorted(
        [player for player in ex_players.values() if _within_filters(player)],
        key=_sort_key,
    )[:limit]
    future_list = sorted(
        [player for player in future_players.values() if _within_filters(player)],
        key=_sort_key,
    )[:limit]

    # "Other players" are budget+Wage fit signings that are neither ex-players nor future players.
    # We pick from any club in the dataset for the current edition (excluding the selected club),
    # then remove any player already present in ex/future lists.
    exclude_ids = set(ex_players.keys()) | set(future_players.keys())
    other_list: list[dict] = []
    try:
        frame = load_players_frame(edition)
        club_col = club_column()
        id_col = player_columns()["id"]
        overall_col = player_columns()["overall"]
        value_col = player_columns()["value"]
        wage_col = player_columns()["wage"]

        clubs = frame[club_col].astype(str).str.strip()
        ids = frame[id_col].astype(str).str.strip()
        valid_id = ids.notna() & (ids != "") & (ids.str.lower() != "nan")

        mask = clubs != normalized_club
        mask = mask & valid_id

        if max_value is not None and max_value > 0:
            mask = mask & frame[value_col].notna() & (frame[value_col] <= max_value)
        if max_wage is not None and max_wage > 0:
            mask = mask & frame[wage_col].notna() & (frame[wage_col] <= max_wage)

        working = frame[mask]
        if exclude_ids:
            working_ids = working[id_col].astype(str).str.strip()
            working = working[~working_ids.isin(exclude_ids)]

        other_records = _player_records(working.sort_values(overall_col, ascending=False).head(limit * 3))
        other_list = other_records[:limit]

        for player in other_list:
            player["reason"] = "other-player"
    except Exception:
        # Keep the endpoint resilient; worst case we only return ex/future lists.
        other_list = []

    return {
        "edition": edition,
        "club": normalized_club,
        "maxValue": max_value,
        "exPlayers": ex_list,
        "futurePlayers": future_list,
        "otherPlayers": other_list,
        "counts": {
            "exPlayers": len(ex_list),
            "futurePlayers": len(future_list),
            "otherPlayers": len(other_list),
        },
    }


def fixture_hints(edition: int, club_name: str, limit: int = 24) -> dict:
    normalized_club = club_name.strip()
    frame = load_players_frame(edition)
    catalog = build_club_catalog(frame, normalized_club)
    relations = partition_club_relations(catalog, limit=limit)

    return {
        "edition": edition,
        "club": normalized_club,
        "hints": relations["hints"],
        "rivals": relations["rivals"],
        "nearestClubs": relations["nearestClubs"],
        "totalPeers": len(catalog),
    }


def club_narrative(edition: int, club_name: str) -> dict:
    from . import narrative as narrative_module

    normalized_club = club_name.strip()
    timeline: list[dict] = []
    current_players: list[dict] = []

    for other_edition in editions():
        try:
            players = players_for_club(other_edition, normalized_club)
        except FileNotFoundError:
            players = []

        if other_edition == edition:
            current_players = players

        timeline.append(
            {
                "edition": other_edition,
                "summary": summarize_squad(players),
                "players": [
                    {"id": player["id"], "name": player["name"]}
                    for player in players
                    if player.get("id")
                ],
            }
        )

    suggestions = signing_suggestions(edition, normalized_club, limit=4)

    return narrative_module.build_club_narrative(
        normalized_club,
        edition,
        current_players,
        timeline,
        future_players=suggestions.get("futurePlayers") or [],
        ex_players=suggestions.get("exPlayers") or [],
    )
