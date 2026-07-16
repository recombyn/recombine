"""In-memory session tokens for Google (and future) login."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass


@dataclass
class SessionUser:
    id: str
    email: str
    name: str
    avatar: str | None
    provider: str


_SESSIONS: dict[str, tuple[SessionUser, float]] = {}
_TTL_SECONDS = 60 * 60 * 24 * 14  # 14 days


def create_session(user: SessionUser) -> str:
    token = secrets.token_urlsafe(32)
    _SESSIONS[token] = (user, time.time() + _TTL_SECONDS)
    return token


def get_session(token: str | None) -> SessionUser | None:
    if not token:
        return None
    row = _SESSIONS.get(token)
    if not row:
        return None
    user, expires = row
    if time.time() > expires:
        _SESSIONS.pop(token, None)
        return None
    return user


def revoke_session(token: str | None) -> None:
    if token:
        _SESSIONS.pop(token, None)
