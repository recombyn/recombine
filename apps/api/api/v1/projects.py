"""User projects API — metadata in DB, large docs in COS when enabled."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services import projects as project_store
from services.projects import ProjectConflictError, ProjectNotFoundError

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


def _parse_if_match(if_match: str | None) -> int | None:
    """Parse If-Match into a revision int. ``*`` / empty → no lock."""
    if not if_match:
        return None
    s = str(if_match).strip()
    if not s or s == "*":
        return None
    if s.upper().startswith("W/"):
        s = s[2:].strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1]
    try:
        return int(s)
    except ValueError:
        return None


def _conflict_http(exc: ProjectConflictError) -> HTTPException:
    return HTTPException(
        status_code=412,
        detail={
            "code": "project_revision_conflict",
            "id": exc.project_id,
            "revision": exc.revision,
            "updatedAt": exc.updated_at_ms,
        },
    )


class UpsertProjectIn(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    name: str = Field(default="Untitled", max_length=255)
    document: dict[str, Any] | None = None
    thumbnailDataUrl: str | None = None
    """Up to 4 raster data URLs for list collage (preferred over single)."""
    thumbnailDataUrls: list[str] | None = None
    """Up to 4 already-hosted image URLs (element-node srcs)."""
    thumbnailUrls: list[str] | None = None
    """True when the client is uploading a user-chosen cover (protect from auto thumbs)."""
    thumbnailCustom: bool | None = None
    """Client's last known revision — must match server or 412."""
    baseRevision: int | None = None


class PatchProjectIn(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    baseRevision: int | None = None
    thumbnailDataUrl: str | None = None
    thumbnailDataUrls: list[str] | None = None
    thumbnailUrls: list[str] | None = None
    thumbnailCustom: bool | None = None
    upsertNodes: dict[str, Any] | None = None
    removeNodeIds: list[str] | None = None
    pageChildren: list[str] | None = None
    frames: list[Any] | None = None
    activeFrameId: str | None = None
    canvas: dict[str, Any] | None = None


class BatchDeleteIn(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=100)


@router.get("")
def list_my_projects(
    page: int = 1,
    pageSize: int = 24,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return project_store.list_projects(user.id, page=page, page_size=pageSize)


@router.post("/batch-delete")
def batch_remove(
    body: BatchDeleteIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    deleted = project_store.delete_projects(user.id, body.ids)
    return {"ok": True, "deleted": deleted}


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
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> dict[str, Any]:
    user = _require_user(authorization)
    base_rev = body.baseRevision
    if base_rev is None:
        base_rev = _parse_if_match(if_match)
    try:
        row = project_store.upsert_project(
            user.id,
            project_id=body.id,
            name=body.name,
            document=body.document,
            thumbnail_data_url=body.thumbnailDataUrl,
            thumbnail_data_urls=body.thumbnailDataUrls,
            thumbnail_urls=body.thumbnailUrls,
            thumbnail_custom=body.thumbnailCustom,
            base_revision=base_rev,
        )
    except ProjectConflictError as exc:
        raise _conflict_http(exc) from exc
    return {"project": row}


@router.patch("/{project_id}")
def patch_one(
    project_id: str,
    body: PatchProjectIn,
    authorization: str | None = Header(default=None),
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> dict[str, Any]:
    user = _require_user(authorization)
    base_rev = body.baseRevision
    if base_rev is None:
        base_rev = _parse_if_match(if_match)
    patch: dict[str, Any] = {}
    if body.upsertNodes is not None:
        patch["upsertNodes"] = body.upsertNodes
    if body.removeNodeIds is not None:
        patch["removeNodeIds"] = body.removeNodeIds
    if body.pageChildren is not None:
        patch["pageChildren"] = body.pageChildren
    if body.frames is not None:
        patch["frames"] = body.frames
    # Distinguish omitted vs explicit null for activeFrameId.
    if "activeFrameId" in body.model_fields_set:
        patch["activeFrameId"] = body.activeFrameId
    if body.canvas is not None:
        patch["canvas"] = body.canvas
    # Allow thumbnail-only patches (cover refresh with no node delta).
    has_thumb = bool(
        body.thumbnailDataUrl
        or body.thumbnailDataUrls
        or body.thumbnailUrls
        or body.thumbnailCustom is not None
    )
    if not patch and not has_thumb:
        raise HTTPException(status_code=400, detail="Empty patch")
    if not patch:
        patch = {}
    try:
        row = project_store.patch_project(
            user.id,
            project_id,
            name=body.name,
            patch=patch,
            thumbnail_data_url=body.thumbnailDataUrl,
            thumbnail_data_urls=body.thumbnailDataUrls,
            thumbnail_urls=body.thumbnailUrls,
            thumbnail_custom=body.thumbnailCustom,
            base_revision=base_rev,
        )
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except ProjectConflictError as exc:
        raise _conflict_http(exc) from exc
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
