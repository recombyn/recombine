"""Shared pytest fixtures for API tests."""

from __future__ import annotations

import os

import pytest

# Prefer isolated sqlite for tests (avoid touching developer DB).
os.environ.setdefault("SQLITE_DB_PATH", "storage/test-recombyn.db")
os.environ.setdefault("DATABASE_URL", "")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """FastAPI TestClient with sqlite under tmp_path + stubbed external checks."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    monkeypatch.setenv("DATABASE_URL", "")

    # Reload settings / app bindings that read env at import time where needed.
    from config import settings as settings_mod

    settings_mod.settings.sqlite_db_path = str(db_path)
    settings_mod.settings.database_url = ""

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as c:
        yield c
