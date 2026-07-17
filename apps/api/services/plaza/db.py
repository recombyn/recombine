"""Plaza DB — shared MySQL / SQLite."""

from __future__ import annotations

from services.db import connect, init_schema


def init_plaza_db() -> None:
    init_schema()


# Re-export for store.py compatibility
__all__ = ["connect", "init_plaza_db"]
