from __future__ import annotations

import threading
import time
from typing import Any

from .config import editions
from . import data

_lock = threading.RLock()
_thread: threading.Thread | None = None
_started_at: float | None = None
_status: str = "idle"
_error_message: str | None = None
_steps: list[dict[str, Any]] = []


def _build_steps() -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = [
        {
            "id": "health",
            "label": "API connection",
            "state": "pending",
            "rows": None,
            "clubs": None,
            "message": None,
        }
    ]

    for edition in editions():
        steps.append(
            {
                "id": f"edition-{edition}",
                "label": f"FIFA {edition} players",
                "state": "pending",
                "rows": None,
                "clubs": None,
                "message": None,
            }
        )

    steps.append(
        {
            "id": "clubs-index",
            "label": "Global club index",
            "state": "pending",
            "rows": None,
            "clubs": None,
            "message": None,
        }
    )

    return steps


def _find_step(step_id: str) -> dict[str, Any]:
    for step in _steps:
        if step["id"] == step_id:
            return step
    raise KeyError(step_id)


def _set_step(
    step_id: str,
    state: str,
    *,
    rows: int | None = None,
    clubs: int | None = None,
    message: str | None = None,
) -> None:
    step = _find_step(step_id)
    step["state"] = state
    if rows is not None:
        step["rows"] = rows
    if clubs is not None:
        step["clubs"] = clubs
    if message is not None:
        step["message"] = message


def _progress_payload() -> dict[str, int]:
    total = len(_steps)
    completed = sum(1 for step in _steps if step["state"] == "done")
    percent = round((completed / total) * 100) if total else 0
    return {
        "completedSteps": completed,
        "totalSteps": total,
        "percent": percent,
    }


def get_status() -> dict[str, Any]:
    with _lock:
        elapsed_ms = None
        if _started_at is not None:
            elapsed_ms = int((time.time() - _started_at) * 1000)

        return {
            "status": _status,
            "phase": "editions" if _status == "loading" else _status,
            "errorMessage": _error_message,
            "steps": [dict(step) for step in _steps],
            "progress": _progress_payload(),
            "elapsedMs": elapsed_ms,
        }


def _run_warmup() -> None:
    global _status, _error_message

    try:
        _set_step("health", "active")
        _set_step("health", "done")

        for edition in editions():
            step_id = f"edition-{edition}"
            _set_step(step_id, "active")

            try:
                stats = data.edition_dataset_stats(edition)
            except FileNotFoundError as error:
                _set_step(step_id, "error", message=str(error))
                with _lock:
                    _status = "error"
                    _error_message = str(error)
                return
            except ValueError as error:
                _set_step(step_id, "error", message=str(error))
                with _lock:
                    _status = "error"
                    _error_message = str(error)
                return

            _set_step(step_id, "done", rows=stats["rows"], clubs=stats["clubs"])

        _set_step("clubs-index", "active")
        clubs = data.list_all_clubs()
        _set_step("clubs-index", "done", clubs=len(clubs))

        with _lock:
            _status = "ready"
            _error_message = None
    except Exception as error:  # pragma: no cover - safety net for unexpected failures
        with _lock:
            _status = "error"
            _error_message = str(error)


def start_warmup() -> dict[str, Any]:
    global _thread, _started_at, _status, _error_message, _steps

    with _lock:
        if _status == "ready":
            return get_status()

        if _status == "loading" and _thread is not None and _thread.is_alive():
            return get_status()

        _steps = _build_steps()
        _status = "loading"
        _error_message = None
        _started_at = time.time()
        _thread = threading.Thread(target=_run_warmup, name="bootstrap-warmup", daemon=True)
        _thread.start()

    return get_status()
