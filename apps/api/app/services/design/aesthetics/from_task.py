"""Promote design_task / stage_review previews into quality samples."""

from __future__ import annotations

import logging
import time
from typing import Any

from sqlmodel import Session

from app import crud
from app.core.db import engine
from app.services.design.admin.blob_codec import make_webp_thumb
from app.services.design.readpath.catalog import ensure_design_catalog
from app.services.design.admin.quality_sample_store import upsert_quality_sample
from app.services.storage import get_storage, put_bytes

logger = logging.getLogger(__name__)


def get_task_preview(task_id: str) -> dict[str, Any] | None:
    ensure_design_catalog()
    tid = (task_id or "").strip()
    if not tid:
        return None
    with Session(engine) as session:
        row = crud.get_design_task(session=session, task_id=tid)
    if not row:
        return None
    svg = row.result_svg or ""
    image_url = ""
    raster_error = ""
    if svg.strip():
        try:
            from app.services.design.aesthetics.svg_raster import svg_to_png_data_url

            image_url = svg_to_png_data_url(svg, max_edge=720)
        except Exception as exc:
            raster_error = str(exc)[:300]
            logger.warning("task %s svg raster failed: %s", tid, exc)
    return {
        "taskId": row.id,
        "scene": (row.scene or "website").strip().lower() or "website",
        "status": row.status,
        "prompt": (row.prompt or "")[:500],
        "hasResultSvg": bool(svg.strip()),
        "imageUrl": image_url,
        "rasterError": raster_error,
        "createdAt": int(float(row.created_at) * 1000) if row.created_at else None,
    }


def sample_from_task(
    *,
    task_id: str,
    grade: str = "good",
    comment: str = "",
    name: str = "",
    tags: str = "",
    scene: str | None = None,
) -> dict[str, Any]:
    """Rasterize task SVG → object storage + webp thumb → quality sample (no giant data-URL in DB)."""
    ensure_design_catalog()
    tid = (task_id or "").strip()
    if not tid:
        raise ValueError("task_id required")
    with Session(engine) as session:
        row = crud.get_design_task(session=session, task_id=tid)
    if not row:
        raise ValueError("task not found")
    svg = (row.result_svg or "").strip()
    if not svg:
        raise ValueError("task has no result_svg")

    try:
        from app.services.design.aesthetics.embed_job import fetch_image_bytes
        from app.services.design.aesthetics.svg_raster import svg_to_png_data_url

        data_url = svg_to_png_data_url(svg, max_edge=720)
        png = fetch_image_bytes(data_url)
    except Exception as exc:
        logger.warning("task %s svg raster failed: %s", tid, exc)
        raise ValueError(f"raster failed: {exc}") from exc

    key = f"assets/quality-samples/{tid}-{int(time.time())}.png"
    put_bytes(key, png, content_type="image/png")
    storage = get_storage()
    url = storage.url_for(key)
    if not storage.enabled_remote():
        url = f"/api/v1/uploads/files/{key}"
    try:
        thumb = make_webp_thumb(png)
    except Exception:
        thumb = None

    sc = (scene or row.scene or "website").strip().lower() or "website"
    return upsert_quality_sample(
        {
            "name": name or f"task-{tid[:8]}",
            "scene": sc,
            "grade": grade,
            "tags": tags,
            "comment": comment or (row.prompt or "")[:200],
            "imageUrl": url,
            "originPath": key,
            "thumbWebp": thumb,
            "meta": {"fromTaskId": tid, "status": row.status},
        }
    )
