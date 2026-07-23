"""Returning Google logins must not clobber in-app name / avatar."""

from __future__ import annotations

from pathlib import Path


def _use_tmp_db(tmp_path: Path, monkeypatch, name: str) -> None:
    db = tmp_path / name
    monkeypatch.setenv("SQLITE_DB_PATH", str(db))
    monkeypatch.setenv("DATABASE_URL", "")
    from config import settings as settings_mod
    from services import db as db_mod

    settings_mod.settings.sqlite_db_path = str(db)
    settings_mod.settings.database_url = ""
    # init_schema is process-global; reset so each temp DB gets tables.
    db_mod._SCHEMA_READY = False


def test_upsert_oauth_preserves_custom_profile(tmp_path: Path, monkeypatch):
    _use_tmp_db(tmp_path, monkeypatch, "oauth-profile.db")

    from services.auth.email_store import upsert_oauth_user
    from services.db import init_schema

    init_schema()

    first = upsert_oauth_user(
        user_id="google:sub-1",
        email="user@example.com",
        name="Google Name",
        avatar="https://lh3.googleusercontent.com/a/default",
        provider="google",
        google_sub="sub-1",
    )
    assert first.name == "Google Name"
    assert first.avatar and "googleusercontent" in first.avatar

    # User edited profile in-app.
    from services.auth.email_store import update_profile

    updated = update_profile(
        first.id,
        name="本地昵称",
        avatar="data:image/png;base64,aaa",
    )
    assert updated is not None
    assert updated.name == "本地昵称"

    # Second Google login brings Google profile again — must keep local edits.
    again = upsert_oauth_user(
        user_id="google:sub-1",
        email="user@example.com",
        name="Google Name",
        avatar="https://lh3.googleusercontent.com/a/default",
        provider="google",
        google_sub="sub-1",
    )
    assert again.name == "本地昵称"
    assert again.avatar == "data:image/png;base64,aaa"


def test_create_session_returns_persisted_profile(tmp_path: Path, monkeypatch):
    _use_tmp_db(tmp_path, monkeypatch, "oauth-session.db")

    from services.auth import SessionUser, create_session
    from services.auth.email_store import update_profile, upsert_oauth_user
    from services.db import init_schema

    init_schema()
    upsert_oauth_user(
        user_id="google:sub-2",
        email="b@example.com",
        name="From Google",
        avatar="https://example.com/g.png",
        provider="google",
        google_sub="sub-2",
    )
    update_profile("google:sub-2", name="Edited", avatar="/uploads/me.png")

    session, token = create_session(
        SessionUser(
            id="google:sub-2",
            email="b@example.com",
            name="From Google",
            avatar="https://example.com/g.png",
            provider="google",
        )
    )
    assert token
    assert session.name == "Edited"
    assert session.avatar == "/uploads/me.png"
