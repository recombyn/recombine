"""Collab room-token minting — ACL check then HMAC token for apps/collab."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services import projects as project_store
from services.collab_tokens import mint_room_token
from services.shares import get_share

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


class RoomTokenIn(BaseModel):
    projectId: str | None = Field(default=None, max_length=64)
    shareId: str | None = Field(default=None, max_length=64)


@router.post("/room-token")
def collab_room_token(
    body: RoomTokenIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    project_id = (body.projectId or "").strip()
    share_id = (body.shareId or "").strip()

    if bool(project_id) == bool(share_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of projectId or shareId",
        )

    if project_id:
        row = project_store.get_project(user.id, project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        # Room id == project id (same id the editor already uses).
        return mint_room_token(
            room_id=project_id,
            user_id=user.id,
            role="edit",
            name=user.name or user.email or "",
        )

    share = get_share(share_id, actor_user_id=user.id)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if not share.get("viewerCanView"):
        raise HTTPException(status_code=403, detail="Forbidden")

    role = "edit" if share.get("viewerCanEdit") else "view"
    # Prefer source project room so share editors sync with the owner's open project.
    source_project_id = str(share.get("sourceProjectId") or "").strip()
    room_id = source_project_id or share_id
    return mint_room_token(
        room_id=room_id,
        user_id=user.id,
        role=role,
        name=user.name or user.email or "",
    )
