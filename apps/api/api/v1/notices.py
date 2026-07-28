"""Notices API — published announcements / notifications for account inbox."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query

from services.auth import get_session
from services.notices import list_notices_public

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


@router.get("")
def notices_list(
    kind: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_user(authorization)
    items = list_notices_public(kind=kind)
    return {
        "items": [
            {
                "id": it["id"],
                "kind": it["kind"],
                "title": it["title"],
                "body": it["body"],
                "createdAt": it["publishedAt"] or it["createdAt"],
            }
            for it in items
        ]
    }
