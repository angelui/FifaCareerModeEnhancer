from __future__ import annotations

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import editions, load_app_config
from . import bootstrap, data
from .saves import CareerSaveState, list_all_saves, list_profiles, load_state, save_state

app = FastAPI(
    title="FIFA Career Narrative Companion API",
    version="0.1.0",
    description="Offline backend for FIFA/FC career mode companion datasets.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/bootstrap/status")
def bootstrap_status() -> dict:
    return bootstrap.get_status()


@app.post("/api/bootstrap/start")
def bootstrap_start() -> dict:
    return bootstrap.start_warmup()


@app.get("/api/health")
def health() -> dict:
    config = load_app_config()
    return {
        "status": "ok",
        "appName": config.get("appName"),
        "editions": editions(),
    }


@app.get("/api/editions/{edition}/clubs")
def edition_clubs(edition: int) -> dict:
    _ensure_edition(edition)
    try:
        clubs = data.list_clubs_for_edition(edition)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {"edition": edition, "count": len(clubs), "clubs": clubs}


@app.get("/api/clubs")
def all_clubs() -> dict:
    clubs = data.list_all_clubs()
    return {"count": len(clubs), "clubs": clubs}


@app.get("/api/editions/{edition}/players/search")
def search_players(
    edition: int,
    q: str = Query(min_length=2),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    _ensure_edition(edition)
    try:
        players = data.search_players(edition, q, limit)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {
        "edition": edition,
        "query": q.strip(),
        "count": len(players),
        "players": players,
    }


@app.get("/api/editions/{edition}/players")
def players_by_club(
    edition: int,
    club: str = Query(min_length=1),
) -> dict:
    _ensure_edition(edition)
    try:
        players = data.players_for_club(edition, club)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {
        "edition": edition,
        "club": club.strip(),
        "count": len(players),
        "players": players,
    }


@app.get("/api/clubs/archive")
def archive(club: str = Query(min_length=1)) -> dict:
    timeline = data.club_archive(club.strip())
    present = sum(1 for entry in timeline if entry["summary"]["count"] > 0)
    return {
        "club": club.strip(),
        "presentInEditions": present,
        "totalEditions": len(timeline),
        "timeline": timeline,
    }


@app.get("/api/editions/{edition}/signing-suggestions")
def signing_suggestions(
    edition: int,
    club: str = Query(min_length=1),
    max_value: int | None = Query(default=None, ge=0),
    max_wage: int | None = Query(default=None, ge=0),
    position: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=40, ge=1, le=100),
) -> dict:
    _ensure_edition(edition)
    try:
        return data.signing_suggestions(edition, club.strip(), max_value, max_wage, limit, position)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/api/editions/{edition}/fixture-hints")
def fixture_hints(
    edition: int,
    club: str = Query(min_length=1),
    limit: int = Query(default=24, ge=1, le=100),
) -> dict:
    _ensure_edition(edition)
    try:
        return data.fixture_hints(edition, club.strip(), limit)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/api/editions/{edition}/narrative")
def club_narrative(
    edition: int,
    club: str = Query(min_length=1),
) -> dict:
    _ensure_edition(edition)
    try:
        return data.club_narrative(edition, club.strip())
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


def _ensure_edition(edition: int) -> None:
    if edition not in editions():
        raise HTTPException(status_code=404, detail=f"FIFA {edition} is not configured.")


class CareerSaveStatePayload(BaseModel):
    edition: int
    team: str
    profileId: str
    profileName: str | None = None
    season: int | None = None
    objectives: list[dict] = []
    matches: list[dict] = []
    transactions: list[dict] = []


@app.get("/api/career-saves")
def career_saves_list() -> dict:
    saves = list_all_saves()
    return {"count": len(saves), "saves": saves}


@app.get("/api/career-saves/profiles")
def career_save_profiles(
    edition: int,
    team: str = Query(min_length=1),
) -> dict:
    _ensure_edition(edition)
    profiles = list_profiles(edition, team.strip())
    return {
        "edition": edition,
        "team": team.strip(),
        "count": len(profiles),
        "profiles": profiles,
    }


@app.get("/api/career-saves/state")
def career_save_state(
    edition: int,
    team: str = Query(min_length=1),
    profileId: str = Query(min_length=1),
) -> dict:
    _ensure_edition(edition)
    state = load_state(edition, team.strip(), profileId.strip())
    return {
        "edition": edition,
        "team": team.strip(),
        "profileId": profileId.strip(),
        "season": state.season,
        "objectives": state.objectives,
        "matches": state.matches,
        "transactions": state.transactions,
    }


@app.post("/api/career-saves/state")
def career_save_write(payload: CareerSaveStatePayload = Body(...)) -> dict:
    _ensure_edition(int(payload.edition))
    season = int(payload.season) if payload.season is not None else 1
    state = CareerSaveState(
        season=season,
        objectives=payload.objectives or [],
        matches=payload.matches or [],
        transactions=payload.transactions or [],
    )
    save_state(
        edition=int(payload.edition),
        team=payload.team.strip(),
        profile_id=payload.profileId.strip(),
        profile_name=payload.profileName or payload.profileId.strip(),
        state=state,
    )
    return {"ok": True}


@app.get("/api/editions/{edition}/all-players")
def list_all_players(edition: int) -> list[dict]:
    _ensure_edition(edition)
    try:
        return data.list_all_players_in_edition(edition)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/api/editions/{edition}/random-club")
def random_club(edition: int) -> dict:
    _ensure_edition(edition)
    try:
        return data.random_club(edition)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/api/editions/{edition}/random-player")
def random_player(edition: int) -> dict:
    _ensure_edition(edition)
    try:
        return data.random_player(edition)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

