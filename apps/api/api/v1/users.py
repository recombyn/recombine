"""Public authenticated user directory (invite / collaborator lookup)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query

from services.auth import get_session
from services.users_directory import get_users_by_ids, search_users

router = APIRouter()


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def _require_user(authorization: str | None):
    user = get_session(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


@router.get("/search")
def users_search(
    q: str = Query(default="", max_length=80),
    limit: int = Query(default=12, ge=1, le=20),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return search_users(q=q, limit=limit, exclude_user_id=user.id)


@router.get("/lookup")
def users_lookup(
    ids: str = Query(default="", max_length=800),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_user(authorization)
    raw_ids = [p.strip() for p in (ids or "").split(",") if p.strip()]
    return {"items": get_users_by_ids(raw_ids[:40])}
