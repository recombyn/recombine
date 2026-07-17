"""Plaza API — submit to square, public feed, admin review."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services.plaza import (
    approve_submission,
    get_submission,
    list_admin,
    list_feed,
    list_mine,
    reject_submission,
    submit_to_plaza,
)
from services.plaza.store import PlazaError

router = APIRouter()

_SUPER_ADMIN_EMAIL = "admin@recombyn.com"
_SUPER_ADMIN_ID = "user_super_admin"


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


def _require_super_admin(authorization: str | None):
    user = _require_user(authorization)
    if user.id != _SUPER_ADMIN_ID and (user.email or "").strip().lower() != _SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _plaza_http(err: PlazaError) -> HTTPException:
    status = {
        "not_found": 404,
        "already_pending": 409,
        "already_published": 409,
        "document_too_large": 413,
        "invalid_project": 400,
        "invalid_document": 400,
    }.get(err.code, 400)
    return HTTPException(status_code=status, detail=err.message)


class SubmitIn(BaseModel):
    projectId: str = Field(..., min_length=1, max_length=128)
    title: str = Field(default="", max_length=120)
    category: str = Field(default="resume", max_length=32)
    document: dict[str, Any]


class RejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.post("/submit")
def plaza_submit(
    body: SubmitIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    try:
        item = submit_to_plaza(
            user_id=user.id,
            author_name=user.name or user.email or "User",
            author_avatar=user.avatar,
            project_id=body.projectId,
            title=body.title,
            document=body.document,
            category=body.category,
        )
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}


@router.get("/mine")
def plaza_mine(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    return {"items": list_mine(user.id)}


@router.get("/feed")
def plaza_feed(limit: int = 100) -> dict[str, Any]:
    return {"items": list_feed(limit=limit)}


@router.get("/items/{submission_id}")
def plaza_item(submission_id: str) -> dict[str, Any]:
    item = get_submission(submission_id, include_document=True)
    if not item or item.get("status") != "approved":
        raise HTTPException(status_code=404, detail="Not found")
    return {"item": item}


@router.get("/admin/list")
def plaza_admin_list(
    status: str | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_super_admin(authorization)
    return {"items": list_admin(status=status)}


@router.post("/admin/{submission_id}/approve")
def plaza_admin_approve(
    submission_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_super_admin(authorization)
    try:
        item = approve_submission(submission_id, user.id)
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}


@router.post("/admin/{submission_id}/reject")
def plaza_admin_reject(
    submission_id: str,
    body: RejectIn | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_super_admin(authorization)
    try:
        item = reject_submission(
            submission_id,
            user.id,
            reason=(body.reason if body else None),
        )
    except PlazaError as err:
        raise _plaza_http(err) from err
    return {"item": item}
