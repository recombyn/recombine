"""Chat session CRUD API — persists agent conversations per user/project."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services import chat_store

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


class ChatMessageIn(BaseModel):
    id: str | None = None
    role: str = "user"
    content: str = ""
    thinking: str | None = None
    durationMs: int | None = None
    intent: str | None = None
    steps: list[dict[str, Any]] | None = None
    images: list[str] | None = None


class UpsertSessionIn(BaseModel):
    projectId: str = Field(default="__none__", max_length=128)
    id: str | None = Field(default=None, max_length=64)
    title: str = Field(default="", max_length=255)
    messages: list[ChatMessageIn] = Field(default_factory=list)
    taskState: dict[str, Any] | None = Field(default=None, description="Agent task_state snapshot")


@router.get("/sessions")
def get_sessions(
    projectId: str = "__none__",
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    sessions = chat_store.list_sessions(user.id, projectId)
    return {"sessions": sessions}


@router.put("/sessions")
def put_session(
    body: UpsertSessionIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    session = chat_store.upsert_session(
        user.id,
        body.projectId,
        session_id=body.id,
        title=body.title,
        messages=[m.model_dump() for m in body.messages],
        task_state=body.taskState,
    )
    return {"session": session}


@router.delete("/sessions/{session_id}")
def remove_session(
    session_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    ok = chat_store.delete_session(user.id, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
