"""Me API — liked Plaza items + BYOK provider vault for the current user."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services.me import likes as likes_store
from services.security import (
    delete_byok_provider,
    list_byok_providers,
    upsert_byok_provider,
)

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


class SyncLikedIn(BaseModel):
    ids: list[str] = Field(default_factory=list)


class ByokProviderIn(BaseModel):
    id: str | None = None
    name: str = ""
    website: str = ""
    baseUrl: str = ""
    apiModel: str = ""
    modelKind: str = "text"
    # Omit or empty on update to keep existing encrypted key.
    apiKey: str | None = None


@router.get("/liked")
def me_liked_list(
    page: int = 1,
    pageSize: int = 24,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return likes_store.list_liked(user.id, page=page, page_size=pageSize)


@router.get("/liked/ids")
def me_liked_ids(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    return {"ids": likes_store.list_liked_ids(user.id)}


@router.put("/liked/{submission_id}")
def me_like(
    submission_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    try:
        return likes_store.like_submission(user.id, submission_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Submission not found") from None
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete("/liked/{submission_id}")
def me_unlike(
    submission_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return likes_store.unlike_submission(user.id, submission_id)


@router.post("/liked/sync")
def me_liked_sync(
    body: SyncLikedIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """One-shot migrate from client-local like ids."""
    user = _require_user(authorization)
    return likes_store.sync_likes(user.id, body.ids or [])


@router.get("/byok/providers")
def me_byok_list(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """List BYOK providers — never returns plaintext apiKey."""
    user = _require_user(authorization)
    return {"items": list_byok_providers(user.id)}


@router.put("/byok/providers")
def me_byok_upsert(
    body: ByokProviderIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    try:
        item = upsert_byok_provider(
            user.id,
            provider_id=body.id,
            name=body.name,
            website=body.website,
            base_url=body.baseUrl,
            model_kind=body.modelKind,
            api_key=body.apiKey,
            api_model=body.apiModel,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"item": item}


@router.delete("/byok/providers/{provider_id}")
def me_byok_delete(
    provider_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    ok = delete_byok_provider(user.id, provider_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"ok": True}
