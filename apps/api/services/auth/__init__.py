"""Persistent auth sessions (LighthouseDB / SQLite)."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

from services.auth.email_store import get_user_by_id, upsert_oauth_user
from services.db import connect, init_schema
from services.wallet.db import ensure_user_balance

_TTL_SECONDS = 60 * 60 * 24 * 14  # 14 days


@dataclass
class SessionUser:
    id: str
    email: str
    name: str
    avatar: str | None
    provider: str
    bio: str | None = None
    role: str = "user"
    status: str = "active"


def create_session(user: SessionUser) -> tuple[SessionUser, str]:
    """Persist user (OAuth upsert preserves in-app profile) and return (session user, token)."""
    init_schema()
    # Ensure a users row exists (email signup already wrote one; OAuth/admin need upsert).
    sub = user.id.replace("google:", "", 1) if user.id.startswith("google:") else None
    persisted = upsert_oauth_user(
        user_id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        provider=user.provider,
        google_sub=sub if user.provider == "google" else None,
    )
    # Wallet row for Tokens (starts at 0 until redeem).
    ensure_user_balance(persisted.id, starting_tokens=0)
    token = secrets.token_urlsafe(32)
    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO auth_sessions (token, user_id, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, persisted.id, now + _TTL_SECONDS, now),
        )
    # Re-read so role/status from DB are on the session.
    fresh = get_user_by_id(persisted.id) or persisted
    return (
        SessionUser(
            id=fresh.id,
            email=fresh.email,
            name=fresh.name,
            avatar=fresh.avatar,
            provider=fresh.provider,
            bio=fresh.bio,
            role=getattr(fresh, "role", None) or "user",
            status=getattr(fresh, "status", None) or "active",
        ),
        token,
    )


def get_session(token: str | None) -> SessionUser | None:
    if not token:
        return None
    init_schema()
    now = time.time()
    user_id: str | None = None
    with connect() as conn:
        row = conn.execute(
            "SELECT user_id, expires_at FROM auth_sessions WHERE token = ?",
            (token,),
        ).fetchone()
        if not row:
            return None
        if float(row["expires_at"]) < now:
            conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
            return None
        user_id = row["user_id"]
    user = get_user_by_id(user_id) if user_id else None
    if not user:
        return None
    return SessionUser(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar=user.avatar,
        provider=user.provider,
        bio=user.bio,
        role=getattr(user, "role", None) or "user",
        status=getattr(user, "status", None) or "active",
    )


def revoke_session(token: str | None) -> None:
    if not token:
        return
    init_schema()
    with connect() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))


def purge_expired_sessions() -> None:
    init_schema()
    with connect() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE expires_at < ?", (time.time(),))
