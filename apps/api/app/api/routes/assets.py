"""User assets API — AI-generated images/videos."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from app.api.deps import CurrentUser

from app.services import assets as asset_store

router = APIRouter(prefix="/assets", tags=["assets"])






@router.get("")
def list_my_assets(
    current_user: CurrentUser,
    page: int = 1,
    pageSize: int = 24,
    kind: str | None = None,
) -> dict[str, Any]:
    return asset_store.list_assets(
        current_user.id,
        kind=kind,
        page=page,
        page_size=pageSize,
    )


@router.delete("/{asset_id}")
def delete_my_asset(
    current_user: CurrentUser,
    asset_id: str,
) -> dict[str, Any]:
    ok = asset_store.delete_asset(current_user.id, asset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
