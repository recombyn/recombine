"""Auth API — Google ID-token login (pattern)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config.settings import settings
from services.auth import get_session, revoke_session
from services.auth.google import login_with_google_credential

router = APIRouter()


class GoogleAuthIn(BaseModel):
    credential: str = Field(..., min_length=1)


@router.get("/config")
def auth_config() -> dict[str, Any]:
    return {
        "googleEnabled": bool((settings.google_client_id or "").strip()),
        "googleClientId": (settings.google_client_id or "").strip() or None,
    }


@router.post("/google")
def auth_google(body: GoogleAuthIn) -> dict[str, Any]:
    try:
        user, token = login_with_google_credential(body.credential)
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=401, detail=str(err)) from err

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar": user.avatar,
            "provider": user.provider,
        },
        "token": token,
    }


@router.get("/me")
def auth_me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = _bearer(authorization)
    user = get_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar": user.avatar,
            "provider": user.provider,
        }
    }


@router.post("/logout")
def auth_logout(authorization: str | None = Header(default=None)) -> dict[str, str]:
    revoke_session(_bearer(authorization))
    return {"message": "Logged out"}


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None
