"""Shared pytest fixtures for API tests."""

from __future__ import annotations

import os

import pytest

# Prefer isolated sqlite for tests (avoid touching developer DB).
os.environ.setdefault("SQLITE_DB_PATH", "storage/test-recombyn.db")
os.environ.setdefault("DATABASE_URL", "")

_DEFAULT_SQLITE = os.environ["SQLITE_DB_PATH"]


def restore_default_sqlite_engine() -> None:
    """Undo SQLITE_DB_PATH / engine switches so later tests share the default file."""
    from app.core.config import settings
    from app.core.db import reset_engine

    settings.sqlite_db_path = _DEFAULT_SQLITE
    settings.database_url = ""
    os.environ["SQLITE_DB_PATH"] = _DEFAULT_SQLITE
    os.environ["DATABASE_URL"] = ""
    reset_engine()


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """FastAPI TestClient with sqlite under tmp_path + stubbed external checks."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    monkeypatch.setenv("DATABASE_URL", "")

    # Reload settings / app bindings that read env at import time where needed.
    from app.core.config import settings
    from app.core.db import reset_engine

    settings.sqlite_db_path = str(db_path)
    settings.database_url = ""
    reset_engine()

    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        yield c
    restore_default_sqlite_engine()
