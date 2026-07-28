"""Admin authorization helpers — role-based + legacy super-admin bootstrap."""

from __future__ import annotations

from fastapi import Header, HTTPException

from services.auth import SessionUser, get_session

# Bootstrap admin (seeded on email login). Prefer users.role = 'admin' going forward.
SUPER_ADMIN_EMAIL = "admin@recombyn.com"
SUPER_ADMIN_ID = "user_super_admin"
# Hardcoded bootstrap login password (auth email login + sensitive admin ops confirm).
SUPER_ADMIN_BOOTSTRAP_PASSWORD = "Admin@2026"


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
    status = (getattr(user, "status", None) or "active").strip().lower()
    if status == "disabled":
        raise HTTPException(status_code=403, detail="Account disabled")
    return user
