from __future__ import annotations

import math
from functools import lru_cache

import pandas as pd

from .config import DATA_DIR, club_column, player_columns


@lru_cache(maxsize=1)
def load_city_coords() -> dict[str, tuple[float, float]]:
    path = DATA_DIR / "city_coords.csv"
    if not path.is_file():
        return {}

    # Be tolerant: some rows in the provided CSV can be malformed.
    frame = pd.read_csv(path, engine="python", on_bad_lines="skip")
    coords: dict[str, tuple[float, float]] = {}
    for row in frame.itertuples(index=False):
        city = str(row.city).strip()
        if not city:
            continue
        coords[city.casefold()] = (float(row.latitude), float(row.longitude))
    return coords


@lru_cache(maxsize=1)
def load_team_cities() -> dict[str, str]:
    """
    Map `club` -> `city` using the generated `data/teams_15_20.csv`.
    This is preferred over fuzzy substring matching because we already have
    a normalized city per club in the dataset.
    """
    path = DATA_DIR / "teams_15_20.csv"
    if not path.is_file():
        return {}

    frame = pd.read_csv(path, engine="python", on_bad_lines="skip")
    if "club" not in frame.columns or "city" not in frame.columns:
        return {}

    frame["club"] = frame["club"].astype(str).str.strip()
    frame["city"] = frame["city"].astype(str).str.strip()
    frame = frame[(frame["club"] != "") & (frame["city"] != "")]

    mapping: dict[str, str] = {}
    for row in frame.itertuples(index=False):
        club = str(row.club).strip()
        city = str(row.city).strip()
        if club and city:
            mapping[club.casefold()] = city
    return mapping


def infer_club_city(club_name: str) -> str | None:
    coords = load_city_coords()
    if not coords:
        return None

    team_cities = load_team_cities()
    key = club_name.strip().casefold()
    if team_cities and key in team_cities:
        return team_cities[key]

    # Fallback: try to infer city from the club name by substring matching.
    # (Kept for resilience for clubs not present in teams_15_20.csv.)
    normalized = club_name.casefold()
    matches = [city for city in coords if city in normalized]
    if not matches:
        return None
    return max(matches, key=len).title()


def haversine_km(origin: tuple[float, float], destination: tuple[float, float]) -> int:
    lat1, lon1 = origin
    lat2, lon2 = destination
    radius_km = 6371.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(round(radius_km * c))


def rivalry_tokens(club_name: str) -> set[str]:
    stopwords = {
        "fc",
        "cf",
        "ac",
        "sc",
        "cd",
        "ud",
        "sd",
        "real",
        "club",
        "de",
        "the",
        "and",
        "city",
        "united",
        "athletic",
        "atletico",
        "sporting",
        "olympique",
        "sv",
        "vfb",
        "tsg",
        "rb",
        "afc",
        "as",
        "ss",
        "us",
        "calcio",
    }
    tokens = {
        token
        for token in club_name.lower().replace(".", " ").replace("-", " ").split()
        if len(token) >= 4 and token not in stopwords
    }
    return tokens


def infer_club_country(frame: pd.DataFrame, club_name: str) -> str | None:
    club_col = club_column()
    nationality_col = player_columns()["nationality"]
    subset = frame[frame[club_col].astype(str).str.strip() == club_name.strip()]
    if subset.empty:
        return None

    nationalities = subset[nationality_col].astype(str).str.strip()
    nationalities = nationalities[nationalities != ""]
    if nationalities.empty:
        return None

    return str(nationalities.mode().iloc[0])


def build_club_catalog(frame: pd.DataFrame, exclude_club: str) -> list[dict]:
    club_col = club_column()
    columns_map = player_columns()
    overall_col = columns_map["overall"]
    nationality_col = columns_map["nationality"]

    working = frame[frame[club_col].astype(str).str.strip() != ""].copy()
    working[club_col] = working[club_col].astype(str).str.strip()
    working = working[working[club_col] != exclude_club.strip()]

    coords = load_city_coords()
    own_country = infer_club_country(frame, exclude_club)
    own_city = infer_club_city(exclude_club)
    own_coords = coords.get(own_city.casefold()) if own_city else None
    own_tokens = rivalry_tokens(exclude_club)

    catalog: list[dict] = []

    for other_club, group in working.groupby(club_col, sort=False):
        overalls = pd.to_numeric(group[overall_col], errors="coerce").dropna()
        if overalls.empty:
            continue

        nationalities = group[nationality_col].astype(str).tolist()
        if nationalities:
            top_nation = max(set(nationalities), key=nationalities.count)
            nation_share = nationalities.count(top_nation) / len(nationalities)
            if nation_share >= 0.85 and str(other_club).strip().casefold() == top_nation.strip().casefold():
                continue

        overall_list = [int(v) for v in overalls.tolist() if str(v).isdigit()]
        avg_overall = int(round(overalls.mean()))
        overall_list_sorted = sorted(overall_list, reverse=True)
        best11 = overall_list_sorted[:11]
        subs = overall_list_sorted[11:]
        best11_overall = round(sum(best11) / len(best11)) if best11 else None
        subs_overall = round(sum(subs) / len(subs)) if subs else None
        count = int(len(group))
        top_row = group.loc[overalls.idxmax()]
        top_name = str(top_row[columns_map["name"]]).strip()

        other_country = infer_club_country(frame, other_club)
        other_city = infer_club_city(other_club)
        other_coords = coords.get(other_city.casefold()) if other_city else None

        distance_km: int | None = None
        if own_coords and other_coords:
            distance_km = haversine_km(own_coords, other_coords)
        elif own_city and other_city and own_city.casefold() == other_city.casefold():
            distance_km = 0

        other_tokens = rivalry_tokens(other_club)
        shared_tokens = own_tokens & other_tokens
        rivalry_score = len(shared_tokens)
        same_city = bool(own_city and other_city and own_city.casefold() == other_city.casefold())
        same_country = bool(own_country and other_country and own_country == other_country)

        is_rival = rivalry_score > 0 or same_city or (same_country and distance_km is not None and distance_km <= 80)

        catalog.append(
            {
                "club": other_club,
                "avgOverall": avg_overall,
                "best11Overall": best11_overall,
                "subsOverall": subs_overall,
                "squadSize": count,
                "topPlayer": top_name,
                "rivalryScore": rivalry_score,
                "isRivalry": is_rival,
                "city": other_city,
                "country": other_country,
                "distanceKm": distance_km,
                "sameCountry": same_country,
            }
        )

    return catalog


def partition_club_relations(catalog: list[dict], limit: int = 24) -> dict[str, list[dict]]:
    rivals = [
        entry
        for entry in catalog
        if entry.get("isRivalry")
    ]
    rivals.sort(
        key=lambda entry: (
            -int(entry.get("rivalryScore") or 0),
            entry.get("distanceKm") if entry.get("distanceKm") is not None else 99999,
            -(entry.get("best11Overall") if entry.get("best11Overall") is not None else entry.get("avgOverall") or 0),
            entry["club"].casefold(),
        )
    )

    nearest = [
        entry
        for entry in catalog
        if entry.get("sameCountry") and entry.get("distanceKm") is not None
    ]
    nearest.sort(
        key=lambda entry: (
            entry.get("distanceKm") if entry.get("distanceKm") is not None else 99999,
            -(entry.get("best11Overall") if entry.get("best11Overall") is not None else entry.get("avgOverall") or 0),
            entry["club"].casefold(),
        )
    )

    if not nearest:
        nearest = sorted(
            [entry for entry in catalog if entry.get("sameCountry")],
            key=lambda entry: (-(entry.get("best11Overall") if entry.get("best11Overall") is not None else entry.get("avgOverall") or 0), entry["club"].casefold()),
        )

    top_threshold = sorted(
        (
            (entry.get("best11Overall") if entry.get("best11Overall") is not None else entry.get("avgOverall")) or 0
            for entry in catalog
        ),
        reverse=True,
    )
    cutoff = top_threshold[min(len(top_threshold) // 4, len(top_threshold) - 1)] if top_threshold else 0

    hints: list[dict] = []
    seen: set[str] = set()

    def append_hint(entry: dict) -> None:
        club = entry["club"]
        if club in seen:
            return
        seen.add(club)
        best11 = entry.get("best11Overall") if entry.get("best11Overall") is not None else entry.get("avgOverall") or 0
        hints.append(
            {
                **entry,
                "isTopSide": best11 >= cutoff and best11 >= 72,
            }
        )

    for entry in rivals[: max(limit // 2, 8)]:
        append_hint(entry)
    for entry in nearest[: max(limit // 2, 8)]:
        append_hint(entry)

    remaining = sorted(
        catalog,
        key=lambda entry: (
            -int(entry.get("isRivalry") or False),
            -(entry.get("best11Overall") if entry.get("best11Overall") is not None else entry.get("avgOverall") or 0),
            entry["club"].casefold(),
        ),
    )
    for entry in remaining:
        if len(hints) >= limit:
            break
        append_hint(entry)

    return {
        "rivals": rivals[:12],
        "nearestClubs": nearest[:12],
        "hints": hints[:limit],
    }
