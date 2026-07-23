"""Fonts catalog + AI font generator (async TTF pipeline via Celery)."""

from __future__ import annotations

import logging
import re
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from config.settings import settings
from services import assets as asset_store
from services import fonts_store
from services.auth import get_session
from services.fontgen import tasks_store
from services.fontgen.charset import DEFAULT_LATIN_CHARSET
from services.fontgen.pipeline import run_font_generate_pipeline
from services.storage import put_bytes
from services.wallet.db import spend_tokens

router = APIRouter()
logger = logging.getLogger(__name__)

# Matches Lovart-style UI cost chip on Generate.
_FONT_TOKEN_COST = 28

_STYLE_SAMPLES = (
    "Bold geometric sans-serif, high contrast, modern tech, crisp terminals",
    "Elegant high-contrast Didone serif, fashion editorial, sharp serifs",
    "Rounded friendly sans, soft terminals, playful but clean",
    "Condensed industrial gothic, narrow letters, strong verticals",
    "Brush script with controlled flourish, dynamic but legible",
    "Monospace technical typewriter, even widths, inked texture",
)


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


def _charge(user_id: str, amount: int, detail: str) -> None:
    try:
        spend_tokens(user_id, amount, detail)
    except ValueError as err:
        if str(err) == "insufficient_tokens":
            raise HTTPException(status_code=402, detail="Insufficient credits") from err
        raise HTTPException(status_code=400, detail=str(err)) from err


class FontGenerateIn(BaseModel):
    description: str = Field(default="", max_length=2000)
    reference_image: str | None = Field(
        default=None,
        description="Optional style reference (https URL or data URL)",
    )
    charset: str | None = Field(
        default=None,
        description="Optional target charset; default Latin A-Z a-z 0-9",
        max_length=512,
    )


def _enqueue_font_task(task_id: str) -> str:
    """Push to Celery; optionally fall back to a background thread."""
    try:
        from worker.tasks import run_font_generate_job

        run_font_generate_job.delay(task_id)
        return "celery"
    except Exception as err:  # noqa: BLE001 — broker down
        logger.warning("Celery enqueue failed for font task %s: %s", task_id, err)
        if not settings.font_sync_fallback:
            raise HTTPException(
                status_code=503,
                detail=f"Job queue unavailable (start Redis + worker). {err}",
            ) from err

        def _run() -> None:
            try:
                run_font_generate_pipeline(task_id)
            except Exception:  # noqa: BLE001
                logger.exception("font sync fallback failed task=%s", task_id)

        threading.Thread(target=_run, name=f"font-{task_id}", daemon=True).start()
        return "thread"


@router.get("")
def list_fonts_endpoint(
    page: int = 1,
    pageSize: int = 100,
) -> dict[str, Any]:
    return fonts_store.list_fonts(page=page, page_size=pageSize)


class FontFaceIn(BaseModel):
    family: str | None = None
    displayName: str = "Regular"
    weight: int = 400
    url: str
    format: str | None = None


class FontRegisterIn(BaseModel):
    """Register a font family via CDN/URL faces (or a single url)."""

    family: str = Field(..., min_length=1, max_length=255)
    displayName: str | None = Field(default=None, max_length=255)
    url: str | None = Field(
        default=None,
        description="Single face URL shorthand (creates Regular 400)",
    )
    format: str | None = None
    weight: int | None = Field(default=400, ge=100, le=900)
    faces: list[FontFaceIn] | None = None


def _merge_faces(
    existing: list[Any] | None,
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Keep existing faces; replace same-weight entries with incoming."""
    by_weight: dict[int, dict[str, Any]] = {}
    if isinstance(existing, list):
        for c in existing:
            if not isinstance(c, dict):
                continue
            url = str(c.get("url") or "").strip()
            if not url:
                continue
            try:
                w = int(c.get("weight") or 400)
            except (TypeError, ValueError):
                w = 400
            by_weight[w] = c
    for face in incoming:
        try:
            w = int(face.get("weight") or 400)
        except (TypeError, ValueError):
            w = 400
        by_weight[w] = face
    return [by_weight[k] for k in sorted(by_weight.keys())]


@router.post("/register")
def register_font(
    body: FontRegisterIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Add/update a catalog font from URLs (auth required). Merges by weight."""
    _require_user(authorization)
    family = (body.family or "").strip()
    if not family:
        raise HTTPException(status_code=400, detail="family required")

    faces: list[dict[str, Any]] = []
    if body.faces:
        for f in body.faces:
            url = (f.url or "").strip()
            if not url:
                continue
            weight_n = int(f.weight or 400)
            label = (f.displayName or "Regular").strip() or "Regular"
            face_family = (f.family or "").strip() or (
                family if weight_n == 400 else f"{family} {label}"
            )
            faces.append(
                {
                    "family": face_family,
                    "displayName": label,
                    "weight": weight_n,
                    "url": url,
                    **({"format": f.format} if f.format else {}),
                }
            )
    elif body.url:
        weight_n = int(body.weight or 400)
        label = "Regular" if weight_n == 400 else f"Weight {weight_n}"
        faces.append(
            {
                "family": family if weight_n == 400 else f"{family} {label}",
                "displayName": label,
                "weight": weight_n,
                "url": body.url.strip(),
                **({"format": body.format} if body.format else {}),
            }
        )
    else:
        raise HTTPException(status_code=400, detail="Provide faces[] or url")

    if not faces:
        raise HTTPException(status_code=400, detail="No valid face URLs")

    existing = fonts_store.get_font_by_family(family)
    merged = _merge_faces(
        existing.get("children") if existing else None,
        faces,
    )
    try:
        item = fonts_store.upsert_font(
            family=family,
            display_name=body.displayName or (existing or {}).get("displayName") or family,
            children=merged,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"item": item}


@router.post("/upload")
async def upload_font_file(
    file: UploadFile = File(..., description="ttf / otf / woff / woff2"),
    family: str | None = Form(default=None),
    displayName: str | None = Form(default=None),
    weight: int = Form(default=400),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Upload a font file, store it, and register as a catalog face."""
    user = _require_user(authorization)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="font file too large (max 20MB)")

    name = (file.filename or "font.ttf").strip()
    lower = name.lower()
    if not lower.endswith((".ttf", ".otf", ".woff", ".woff2")):
        raise HTTPException(status_code=400, detail="Only ttf/otf/woff/woff2 supported")

    if lower.endswith(".woff2"):
        mime, fmt, ext = "font/woff2", "woff2", "woff2"
    elif lower.endswith(".woff"):
        mime, fmt, ext = "font/woff", "woff", "woff"
    elif lower.endswith(".otf"):
        mime, fmt, ext = "font/otf", "opentype", "otf"
    else:
        mime, fmt, ext = "font/ttf", "truetype", "ttf"

    stem = Path(name).stem.strip() or "CustomFont"
    fam = (family or stem).strip() or "CustomFont"
    label = (displayName or "Regular").strip() or "Regular"
    try:
        weight_n = int(weight)
    except (TypeError, ValueError):
        weight_n = 400
    weight_n = max(100, min(900, weight_n))

    object_key = f"uploads/{user.id}/fonts/{uuid.uuid4().hex[:12]}_{_safe_name(stem)}.{ext}"
    put_bytes(object_key, raw, content_type=mime)
    url = _public_font_url(object_key)

    face_family = fam if weight_n == 400 else f"{fam} {label}"
    new_face = {
        "family": face_family,
        "displayName": label,
        "weight": weight_n,
        "url": url,
        "format": fmt,
    }
    existing = fonts_store.get_font_by_family(fam)
    merged = _merge_faces(
        existing.get("children") if existing else None,
        [new_face],
    )
    item = fonts_store.upsert_font(
        family=fam,
        display_name=(existing or {}).get("displayName") or fam,
        children=merged,
    )

    return {
        "url": url,
        "key": object_key,
        "mime": mime,
        "format": fmt,
        "family": fam,
        "weight": weight_n,
        "item": item,
    }


def _safe_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name).strip("_")[:64] or "font"


def _public_font_url(object_key: str) -> str:
    from config.settings import settings as _settings

    base = (_settings.s3_public_base_url or "").rstrip("/")
    if _settings.s3_enabled and base:
        return f"{base}/{object_key}"
    return f"/api/v1/uploads/files/{object_key}"


@router.get("/generate/cost")
def font_generate_cost() -> dict[str, Any]:
    return {
        "credits": _FONT_TOKEN_COST,
        "latinOnly": True,
        "producesTtf": True,
        "defaultCharset": DEFAULT_LATIN_CHARSET,
    }


@router.get("/mine")
def list_my_generated_fonts(
    page: int = 1,
    pageSize: int = 24,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return asset_store.list_assets(
        user.id,
        kind="font",
        page=page,
        page_size=pageSize,
    )


@router.get("/style-samples")
def list_style_samples() -> dict[str, Any]:
    return {"items": list(_STYLE_SAMPLES)}


@router.get("/tasks/{task_id}")
def get_font_task(
    task_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    task = tasks_store.get_task(task_id, user_id=user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": task, "credits": _FONT_TOKEN_COST}


@router.get("/tasks")
def list_font_tasks(
    page: int = 1,
    pageSize: int = 24,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    return tasks_store.list_tasks(user.id, page=page, page_size=pageSize)


@router.post("/generate")
async def generate_font(
    body: FontGenerateIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """
    Queue an AI font job:

    1. Write ``font_tasks`` row (MySQL/SQLite)
    2. Charge credits
    3. Push Celery worker (OpenCV → inference → potrace → fontTools TTF → MinIO/local)
    4. Client polls ``GET /fonts/tasks/{id}`` for ``ttfUrl`` / ``previewUrl``
    """
    user = _require_user(authorization)
    desc = (body.description or "").strip()
    ref = (body.reference_image or "").strip() or None
    if not desc and not ref:
        raise HTTPException(
            status_code=400,
            detail="Provide a style description and/or a reference image",
        )

    _charge(user.id, _FONT_TOKEN_COST, "AI font generator")

    task = tasks_store.create_task(
        user.id,
        description=desc or None,
        reference_url=ref,
        charset=(body.charset or None),
    )
    queue = _enqueue_font_task(task["id"])
    return {
        "task": task,
        "taskId": task["id"],
        "status": task["status"],
        "credits": _FONT_TOKEN_COST,
        "latinOnly": True,
        "producesTtf": True,
        "queue": queue,
    }
