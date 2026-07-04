from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

import pandas as pd

from .config import club_column, editions, player_columns, players_csv_path, DATA_DIR
from .club_relations import build_club_catalog, partition_club_relations, infer_club_country


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


@lru_cache(maxsize=16)
def load_club_to_league_map(edition: int) -> dict[str, str]:
    path = DATA_DIR / "other_dataset_15_22" / f"players_{edition}.csv"
    if not path.is_file():
        return {}
    try:
        df = pd.read_csv(path, usecols=["club_name", "league_name"], low_memory=False)
        df = df.dropna(subset=["club_name", "league_name"])
        mapping = {}
        for row in df.itertuples(index=False):
            club = str(row.club_name).strip()
            league = str(row.league_name).strip()
            if club and league:
                mapping[club.lower()] = league
        return mapping
    except Exception:
        return {}


def clear_frame_cache() -> None:
    load_players_frame.cache_clear()
    list_all_clubs.cache_clear()
    load_club_to_league_map.cache_clear()


def _estimate_value(overall: int, age: int, potential: int) -> int:
    if overall < 50:
        val = 30000 + (overall - 40) * 2000
    elif overall < 60:
        val = 50000 + (overall - 50) * 15000
    elif overall < 70:
        val = 200000 + (overall - 60) * 80000
    elif overall < 80:
        val = 1000000 + (overall - 70) * 500000
    elif overall < 90:
        val = 6000000 + (overall - 80) * 4000000
    else:
        val = 46000000 + (overall - 90) * 12000000

    if age < 20:
        age_mult = 1.2
    elif age < 24:
        age_mult = 1.3
    elif age < 28:
        age_mult = 1.1
    elif age < 32:
        age_mult = 0.8
    elif age < 35:
        age_mult = 0.5
    else:
        age_mult = 0.2
    
    pot_diff = max(0, potential - overall)
    pot_mult = 1.0 + (pot_diff * 0.08)

    return int(val * age_mult * pot_mult)


def _estimate_wage(overall: int, value: int) -> int:
    if overall < 50:
        base_wage = 500 + (overall - 40) * 50
    elif overall < 60:
        base_wage = 1000 + (overall - 50) * 200
    elif overall < 70:
        base_wage = 3000 + (overall - 60) * 700
    elif overall < 80:
        base_wage = 10000 + (overall - 70) * 3000
    elif overall < 90:
        base_wage = 40000 + (overall - 80) * 15000
    else:
        base_wage = 190000 + (overall - 90) * 45000

    val_bonus = int(value * 0.001)
    return int(base_wage + val_bonus)


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
                record[key] = 0
            elif key in ("overall", "potential", "age"):
                record[key] = int(value)
            else:
                record[key] = int(value)

        ovr = record.get("overall") or 50
        pot = record.get("potential") or ovr
        age = record.get("age") or 24

        if not record.get("value") or int(record["value"]) <= 0:
            record["value"] = _estimate_value(ovr, age, pot)

        if not record.get("wage") or int(record["wage"]) <= 0:
            record["wage"] = _estimate_wage(ovr, int(record["value"]))

        contract_value = record.get("contract")
        if pd.isna(contract_value) or contract_value == "":
            record["contract"] = ""
        elif isinstance(contract_value, (int, float)) and float(contract_value).is_integer():
            record["contract"] = str(int(contract_value))
        else:
            record["contract"] = str(contract_value).strip()

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


def list_all_players_in_edition(edition: int) -> list[dict]:
    frame = load_players_frame(edition)
    return _player_records(frame)


COUNTRY_ALIASES = {
    "cotedivoire": "ivorycoast",
    "ctedivoire": "ivorycoast",
    "ivorycoast": "ivorycoast",
}


def _country_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", ascii_text.casefold())


def _canonical_country_key(value: str) -> str:
    key = _country_key(value)
    return COUNTRY_ALIASES.get(key, key)


def _national_team_clubs(frame: pd.DataFrame) -> set[str]:
    club_col = club_column()
    nat_col = player_columns()["nationality"]
    national_team_clubs: set[str] = set()

    for club, group in frame.groupby(frame[club_col].astype(str).str.strip(), sort=False):
        club_name = str(club).strip()
        if not club_name:
            continue

        nationalities = group[nat_col].astype(str).str.strip()
        nationalities = nationalities[nationalities != ""]
        if nationalities.empty:
            continue

        top_nationality = str(nationalities.mode().iloc[0]).strip()
        share = (nationalities == top_nationality).sum() / len(nationalities)
        club_key = _canonical_country_key(club_name)
        nationality_key = _canonical_country_key(top_nationality)
        if share >= 0.85 and club_key == nationality_key:
            national_team_clubs.add(club_name)

    return national_team_clubs


def search_players(edition: int, query: str, limit: int = 50) -> list[dict]:
    normalized = query.strip().lower()
    if len(normalized) < 2:
        return []

    frame = load_players_frame(edition)
    columns_map = player_columns()
    search_cols = [columns_map["name"], columns_map["fullName"], columns_map["club"]]

    mask = False
    for column in search_cols:
        mask = mask | frame[column].astype(str).str.lower().str.contains(normalized, na=False, regex=False)

    filtered = frame[mask].copy()

    club_col = club_column()
    clubs_to_exclude = _national_team_clubs(frame)

    if clubs_to_exclude:
        filtered_clubs = filtered[club_col].astype(str).str.strip()
        filtered = filtered[~filtered_clubs.isin(clubs_to_exclude)]

    filtered = filtered.sort_values("overall", ascending=False).head(limit)
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


def infer_league_for_club(edition: int, club_name: str, players: list[dict]) -> str | None:
    # Require at least one player to make inference meaningful.
    if not players:
        return None

    # 1. Try to look up from the other dataset mapping
    league_map = load_club_to_league_map(edition)
    cleaned_club = club_name.strip().lower()
    if cleaned_club in league_map:
        return league_map[cleaned_club]

    # 2. Fallback to country-based mapping
    try:
        frame = load_players_frame(edition)
    except FileNotFoundError:
        return None

    # Try to infer the club's country from the players in this edition.
    country = infer_club_country(frame, club_name)
    if not country:
        return None

    # Map common countries to their primary/top domestic league name used in our datasets.
    mapping = {
        "england": "English Premier League",
        "spain": "Spain Primera Division",
        "germany": "German 1. Bundesliga",
        "italy": "Italian Serie A",
        "france": "French Ligue 1",
        "netherlands": "Holland Eredivisie",
        "portugal": "Portuguese Liga ZON SAGRES",
        "scotland": "Scottish Premiership",
        "usa": "USA Major League Soccer",
        "united states": "USA Major League Soccer",
        "argentina": "Argentina Primera División",
        "mexico": "Mexican Liga MX",
        "brazil": "Campeonato Brasileiro Série A",
        "australia": "Australian Hyundai A-League",
        "china": "Chinese Super League",
        "japan": "Japanese J. League Division 1",
        "switzerland": "Swiss Super League",
    }

    key = str(country).strip().casefold()
    for k, v in mapping.items():
        if key == k or key.startswith(k) or k in key:
            return v
    return None


def club_archive(club_name: str) -> list[dict]:
    timeline: list[dict] = []
    for edition in editions():
        try:
            players = players_for_club(edition, club_name)
        except FileNotFoundError:
            players = []
        league = infer_league_for_club(edition, club_name, players)

        timeline.append(
            {
                "edition": edition,
                "summary": summarize_squad(players),
                "league": league,
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
    position: str | None = None,
) -> dict:
    normalized_club = club_name.strip()
    current_frame = load_players_frame(edition)
    national_team_clubs = _national_team_clubs(current_frame)
    current_ids = _club_sofifa_ids(edition, normalized_club)

    def _mark_free_agent(player: dict) -> dict:
        if str(player.get("club") or "").strip() not in national_team_clubs:
            return player
        return {
            **player,
            "sourceClub": player.get("club", ""),
            "club": "Free agent",
            "isFreeAgent": True,
        }

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
            **_mark_free_agent(candidate),
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
            **_mark_free_agent(current_snapshot),
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

        # Optional position filter: match if the requested position is a substring
        # of the player's positions string (case-insensitive). If position is not
        # provided, all players pass.
        if position:
            positions = str(player.get("positions") or "").lower()
            if position.strip().lower() not in positions:
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
        frame = current_frame
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

        other_records = [
            _mark_free_agent(player)
            for player in _player_records(working.sort_values(overall_col, ascending=False).head(limit * 3))
        ]
        # Apply optional position filter to other players as well.
        if position:
            pos_norm = position.strip().lower()
            other_records = [p for p in other_records if pos_norm in (p.get("positions") or "").lower()]
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
                "league": infer_league_for_club(other_edition, normalized_club, players),
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


def random_club(edition: int) -> dict:
    import random

    clubs = list_clubs_for_edition(edition)
    if not clubs:
        raise ValueError(f"No clubs found for edition {edition}")
    club_name = random.choice(clubs)

    players = players_for_club(edition, club_name)
    summary = summarize_squad(players)

    # Let's extract prospects and seniors
    # Prospects: age < 23, not in top 3 players, sorted by potential descending, then overall descending
    top_3_ids = {p["id"] for p in summary["topPlayers"] if p.get("id")}

    prospects_pool = [
        p
        for p in players
        if p.get("id") not in top_3_ids
        and isinstance(p.get("age"), (int, float))
        and p["age"] < 23
    ]
    prospects_pool.sort(
        key=lambda x: (-int(x.get("potential") or 0), -int(x.get("overall") or 0))
    )
    prospects = prospects_pool[:2]

    # Seniors: age >= 30, not in top 3 players, sorted by overall descending
    seniors_pool = [
        p
        for p in players
        if p.get("id") not in top_3_ids
        and isinstance(p.get("age"), (int, float))
        and p["age"] >= 30
    ]
    seniors_pool.sort(key=lambda x: -int(x.get("overall") or 0))

    if not seniors_pool:
        # Fallback to oldest players not in top 3
        fallback_pool = [
            p
            for p in players
            if p.get("id") not in top_3_ids
            and isinstance(p.get("age"), (int, float))
        ]
        fallback_pool.sort(
            key=lambda x: (-int(x.get("age") or 0), -int(x.get("overall") or 0))
        )
        seniors = fallback_pool[:2]
    else:
        seniors = seniors_pool[:2]

    return {
        "club": club_name,
        "edition": edition,
        "league": infer_league_for_club(edition, club_name, players),
        "best11Overall": summary["best11Overall"],
        "nationalityCounts": summary["nationalityCounts"],
        "topPlayers": summary["topPlayers"],
        "prospects": prospects,
        "seniors": seniors,
    }


def random_player(edition: int) -> dict:
    import random

    frame = load_players_frame(edition)
    if frame.empty:
        raise ValueError(f"No players found for edition {edition}")

    row_idx = random.randint(0, len(frame) - 1)
    row = frame.iloc[row_idx]

    player_dict = {}
    for col in frame.columns:
        val = row[col]
        if pd.isna(val):
            player_dict[col] = ""
        else:
            if hasattr(val, "item"):
                val = val.item()
            player_dict[col] = val

    positions_str = str(player_dict.get("player_positions", ""))
    is_gk = "GK" in [pos.strip().upper() for pos in positions_str.split(",")]

    stats = {}
    if is_gk:
        stats_keys = [
            "gk_diving",
            "gk_handling",
            "gk_kicking",
            "gk_reflexes",
            "gk_speed",
            "gk_positioning",
        ]
        for k in stats_keys:
            val = player_dict.get(k)
            if val == "" or val is None:
                gk_sub = k.replace("gk_", "goalkeeping_")
                val = player_dict.get(gk_sub, 50)
            stats[k] = (
                int(val) if str(val).isdigit() or isinstance(val, (int, float)) else 50
            )
    else:
        stats_keys = ["pace", "shooting", "passing", "dribbling", "defending", "physic"]
        for k in stats_keys:
            val = player_dict.get(k)
            stats[k] = (
                int(val) if str(val).isdigit() or isinstance(val, (int, float)) else 50
            )

    return {
        "id": str(player_dict.get("sofifa_id", "")),
        "name": str(player_dict.get("short_name", "")),
        "fullName": str(player_dict.get("long_name", "")),
        "club": str(player_dict.get("club", "")),
        "overall": int(player_dict.get("overall", 50))
        if player_dict.get("overall")
        else 50,
        "potential": int(player_dict.get("potential", 50))
        if player_dict.get("potential")
        else 50,
        "value": int(player_dict.get("value_eur", 0))
        if player_dict.get("value_eur")
        else 0,
        "wage": int(player_dict.get("wage_eur", 0))
        if player_dict.get("wage_eur")
        else 0,
        "positions": positions_str,
        "nationality": str(player_dict.get("nationality", "")),
        "age": int(player_dict.get("age", 20)) if player_dict.get("age") else 20,
        "isGoalkeeper": is_gk,
        "stats": stats,
    }

