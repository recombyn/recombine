"""Admin authorization helpers — role-based + legacy super-admin bootstrap."""

from __future__ import annotations

import os

from fastapi import Header, HTTPException

from services.auth import SessionUser, get_session

# Bootstrap admin (seeded on email login). Prefer users.role = 'admin' going forward.
# Override via env before public deploy (do not ship real secrets in git).
SUPER_ADMIN_EMAIL = (
    os.environ.get("SUPER_ADMIN_EMAIL") or "admin@recombyn.com"
).strip().lower()
SUPER_ADMIN_ID = (os.environ.get("SUPER_ADMIN_ID") or "user_super_admin").strip()
SUPER_ADMIN_BOOTSTRAP_PASSWORD = (
    os.environ.get("SUPER_ADMIN_BOOTSTRAP_PASSWORD") or "Admin@2026"
)


def bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def require_user(authorization: str | None = Header(default=None)) -> SessionUser:
    user = get_session(bearer_token(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    status = (getattr(user, "status", None) or "active").strip().lower()
    if status == "disabled":
        raise HTTPException(status_code=403, detail="Account disabled")
    return user


def is_admin_user(user: SessionUser) -> bool:
    role = (getattr(user, "role", None) or "user").strip().lower()
    if role == "admin":
        return True
    if user.id == SUPER_ADMIN_ID:
        return True
    if (user.email or "").strip().lower() == SUPER_ADMIN_EMAIL:
        return True
    return False


def require_admin(authorization: str | None = Header(default=None)) -> SessionUser:
    user = require_user(authorization)
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user
