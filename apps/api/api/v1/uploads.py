"""Multipart image upload → Tencent COS / local object storage."""

from __future__ import annotations

from typing import Any
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response

from config.settings import settings
from services.auth import get_session
from services.storage import get_bytes
from services import uploads as upload_store

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


def _mime_for_key(key: str) -> str:
    mime = "application/octet-stream"
    lower = (key or "").lower()
    for ext, ctype in (
        (".png", "image/png"),
        (".jpg", "image/jpeg"),
        (".jpeg", "image/jpeg"),
        (".webp", "image/webp"),
        (".gif", "image/gif"),
        (".svg", "image/svg+xml"),
        (".ttf", "font/ttf"),
        (".otf", "font/otf"),
        (".woff", "font/woff"),
        (".woff2", "font/woff2"),
    ):
        if lower.endswith(ext):
            return ctype
    return mime


def _user_owns_key(user_id: str, key: str) -> bool:
    return (
        key.startswith(f"uploads/{user_id}/")
        or key.startswith(f"assets/{user_id}/")
        or key.startswith(f"font-tasks/{user_id}/")
        # Quality-sample originals (server-written); any authed user may fetch for vision/preview.
        or key.startswith("assets/quality-samples/")
    )


def _object_key_from_url(raw: str) -> str | None:
    """Map display URL → storage key (API path or public COS/S3 base + key)."""
    s = (raw or "").strip()
    if not s or s.startswith("data:") or s.startswith("blob:"):
        return None
    try:
        if s.startswith("/"):
            path = s.split("?", 1)[0]
        else:
            path = urlparse(s).path or ""
        path = unquote(path)
        api_prefix = "/api/v1/uploads/files/"
        if path.startswith(api_prefix):
            key = path[len(api_prefix) :].lstrip("/")
            return key or None
        # Public object URL: …/uploads/{userId}/…
        marker = "/uploads/"
        idx = path.find(marker)
        if idx >= 0:
            key = path[idx + 1 :].lstrip("/")  # uploads/…
            return key if key.startswith("uploads/") else None
        # Fallback: strip configured public base path if present.
        base = (settings.s3_public_base_url or "").rstrip("/")
        if base and s.startswith(base + "/"):
            key = unquote(s[len(base) + 1 :].split("?", 1)[0]).lstrip("/")
            return key or None
    except Exception:
        return None
    return None


def _file_response(key: str) -> Response:
    data = get_bytes(key)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=data,
        media_type=_mime_for_key(key),
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post("")
async def upload_files(
    files: list[UploadFile] = File(..., description="One or more image files"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Upload image file(s) to object storage (Tencent COS when ``S3_ENABLED``).

    Form field name: ``files`` (repeatable).
    Returns ``{ items: [{ url, key, mime, name, size, width?, height? }] }``.
    Frontend should display ``url`` directly.
    """
    user = _require_user(authorization)
    if not files:
        raise HTTPException(status_code=400, detail="files required")

    batch: list[tuple[bytes, str | None, str | None]] = []
    for f in files:
        raw = await f.read()
        batch.append((raw, f.filename, f.content_type))

    try:
        items = upload_store.upload_user_files(user.id, batch)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"upload failed: {err}") from err

    return {"items": items}


@router.get("/content")
def get_upload_content_by_url(
    url: str = Query(..., min_length=1, description="Display URL (COS/public or /api/v1/uploads/files/…)"),
    authorization: str | None = Header(default=None),
) -> Response:
    """
    Resolve a public COS / API display URL to bytes via storage (same-origin for canvas crop/export).
    Avoids browser CORS on the object bucket.
    """
    user = _require_user(authorization)
    key = _object_key_from_url(url)
    if not key or ".." in key or not _user_owns_key(user.id, key):
        raise HTTPException(status_code=404, detail="Not found")
    return _file_response(key)


@router.get("/files/{object_key:path}")
def get_uploaded_file(
    object_key: str,
    authorization: str | None = Header(default=None),
) -> Response:
    """
    Serve stored uploads by object key (local disk or S3/COS via get_bytes).
    """
    user = _require_user(authorization)
    key = (object_key or "").lstrip("/")
    if ".." in key or not _user_owns_key(user.id, key):
        raise HTTPException(status_code=404, detail="Not found")
    return _file_response(key)


@router.delete("/files/{object_key:path}")
def delete_uploaded_file(
    object_key: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Delete a previously uploaded object owned by the current user."""
    user = _require_user(authorization)
    ok = upload_store.delete_user_file(user.id, object_key)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
