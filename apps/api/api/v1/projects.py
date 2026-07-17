"""User projects API — metadata in DB, large docs in COS when enabled."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services import projects as project_store

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


class UpsertProjectIn(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    name: str = Field(default="Untitled", max_length=255)
    document: dict[str, Any] | None = None
    thumbnailDataUrl: str | None = None


@router.get("")
def list_my_projects(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    return {"projects": project_store.list_projects(user.id)}


@router.get("/{project_id}")
def get_one(
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    row = project_store.get_project(user.id, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return {"project": row}


@router.put("")
def upsert(
    body: UpsertProjectIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    row = project_store.upsert_project(
        user.id,
        project_id=body.id,
        name=body.name,
        document=body.document,
        thumbnail_data_url=body.thumbnailDataUrl,
    )
    return {"project": row}


@router.delete("/{project_id}")
def remove(
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    ok = project_store.delete_project(user.id, project_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
