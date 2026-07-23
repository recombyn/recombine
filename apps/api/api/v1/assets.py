"""User assets API — AI-generated images/videos."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException

from services import assets as asset_store
from services.auth import get_session

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
def list_my_assets(
    page: int = 1,
    pageSize: int = 24,
    kind: str | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return asset_store.list_assets(
        user.id,
        kind=kind,
        page=page,
        page_size=pageSize,
    )


@router.delete("/{asset_id}")
def delete_my_asset(
    asset_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    ok = asset_store.delete_asset(user.id, asset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
