from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
APP_CONFIG_PATH = PROJECT_ROOT / "frontend" / "public" / "config" / "app.json"


@lru_cache(maxsize=1)
def load_app_config() -> dict:
    with APP_CONFIG_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def players_csv_path(edition: int) -> Path:
    config = load_app_config()
    file_name = config["playersFilePattern"].replace("{edition}", str(edition))
    return DATA_DIR / file_name


def player_columns() -> dict[str, str]:
    return load_app_config()["playerColumns"]


def club_column() -> str:
    return load_app_config()["clubColumn"]


def editions() -> list[int]:
    return load_app_config()["editions"]
