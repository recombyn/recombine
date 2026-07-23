"""End-to-end font generation pipeline (Celery worker entry)."""

from __future__ import annotations

import logging
import re
import time
from io import BytesIO
from typing import Any

from services.fontgen import tasks_store
from services.fontgen.calibrate import calibrate_glyphs
from services.fontgen.compile_ttf import compile_ttf
from services.fontgen.inference import generate_glyph_bitmaps, resolve_charset
from services.fontgen.preprocess import fetch_image_bytes, preprocess_style_image
from services.fontgen.vectorize import vectorize_glyph
from services.storage import get_storage, put_bytes

logger = logging.getLogger(__name__)


def run_font_generate_pipeline(task_id: str) -> dict[str, Any]:
    task = tasks_store.get_task(task_id)
    if not task:
        raise ValueError(f"font task not found: {task_id}")

    user_id = task["userId"]
    description = (task.get("description") or "").strip()
    reference_url = (task.get("referenceUrl") or "").strip() or None
    charset = resolve_charset(task.get("charset"))

    try:
        tasks_store.update_task(task_id, status="preprocessing", progress=10, error=None)

        style_png: bytes | None = None
        stroke_px = 2.0
        style_key = None
        if reference_url:
            raw = fetch_image_bytes(reference_url)
            processed = preprocess_style_image(raw)
            style_png = processed["png"]
            stroke_px = float(processed.get("strokePx") or 2.0)
            style_key = f"font-tasks/{user_id}/{task_id}/style.png"
            put_bytes(style_key, style_png, content_type="image/png")
            tasks_store.update_task(task_id, style_object_key=style_key, progress=25)
        elif not description:
            raise ValueError("Provide a style description and/or a reference image")

        tasks_store.update_task(task_id, status="inferring", progress=35)
        bitmaps = generate_glyph_bitmaps(
            style_image_url=reference_url,
            style_png=style_png,
            charset=charset,
            description=description,
            stroke_px=stroke_px,
        )
        if not bitmaps:
            raise RuntimeError("no glyphs generated")

        # Persist a few glyph previews for debugging (optional)
        for i, g in enumerate(bitmaps[:3]):
            key = f"font-tasks/{user_id}/{task_id}/glyphs/{i}_{ord(g['char']):04x}.png"
            put_bytes(key, g["png"], content_type="image/png")

        tasks_store.update_task(task_id, status="vectorizing", progress=55)
        vectors: list[dict[str, Any]] = []
        for g in bitmaps:
            vec = vectorize_glyph(g["png"])
            vectors.append(
                {
                    "char": g["char"],
                    "contours": vec["contours"],
                    "width": vec["width"],
                    "height": vec["height"],
                    "engine": vec.get("engine"),
                }
            )

        tasks_store.update_task(task_id, status="calibrating", progress=70)
        calibrated = calibrate_glyphs(vectors)
        warnings = [
            w
            for g in calibrated
            for w in (g.get("warnings") or [])
        ]

        family = _family_name(description, task_id)
        tasks_store.update_task(task_id, status="compiling", progress=82, family_name=family)
        ttf_bytes = compile_ttf(calibrated, family_name=family)
        if not ttf_bytes or len(ttf_bytes) < 100:
            raise RuntimeError("TTF compile produced empty font")

        ttf_key = f"font-tasks/{user_id}/{task_id}/{family.replace(' ', '_')}.ttf"
        put_bytes(ttf_key, ttf_bytes, content_type="font/ttf")
        ttf_url = _public_url(ttf_key)

        preview_png = _build_specimen_preview(bitmaps)
        preview_key = f"font-tasks/{user_id}/{task_id}/preview.png"
        put_bytes(preview_key, preview_png, content_type="image/png")
        preview_url = _public_url(preview_key)

        asset = _store_font_asset(
            user_id,
            preview_png=preview_png,
            preview_url=preview_url,
            ttf_url=ttf_url,
            ttf_key=ttf_key,
            family=family,
            description=description,
            task_id=task_id,
            warnings=warnings,
        )

        tasks_store.update_task(
            task_id,
            status="done",
            progress=100,
            ttf_object_key=ttf_key,
            ttf_url=ttf_url,
            preview_url=preview_url,
            asset_id=asset["id"],
            family_name=family,
            error=None,
            meta_json={
                "glyphCount": len(calibrated),
                "warnings": warnings[:20],
                "engines": sorted(
                    {str(g.get("engine")) for g in vectors if g.get("engine")}
                ),
            },
        )
        return {
            "taskId": task_id,
            "status": "done",
            "ttfUrl": ttf_url,
            "previewUrl": preview_url,
            "asset": asset,
            "familyName": family,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("font generate failed task=%s", task_id)
        tasks_store.update_task(
            task_id,
            status="failed",
            progress=100,
            error=str(exc)[:2000],
        )
        return {"taskId": task_id, "status": "failed", "error": str(exc)}


def _public_url(object_key: str) -> str:
    storage = get_storage()
    url = storage.url_for(object_key)
    if not storage.enabled_remote():
        return f"/api/v1/uploads/files/{object_key}"
    return url


def _family_name(description: str, task_id: str) -> str:
    base = (description or "").strip()
    if base:
        # First few words, ascii-ish
        words = re.findall(r"[A-Za-z0-9\u4e00-\u9fff]+", base)
        name = " ".join(words[:3])[:40]
        if name:
            return f"AI {name}"
    short = task_id.replace("font_", "")[-6:]
    return f"AI Font {short}"


def _build_specimen_preview(bitmaps: list[dict[str, Any]]) -> bytes:
    from PIL import Image

    sample = [g for g in bitmaps if g.get("char") and g["char"] not in " "]
    sample = sample[:36] or bitmaps[:1]
    cell = 64
    cols = 6
    rows = max(1, (len(sample) + cols - 1) // cols)
    canvas = Image.new("RGB", (cols * cell, rows * cell), (255, 255, 255))
    for i, g in enumerate(sample):
        try:
            im = Image.open(BytesIO(g["png"])).convert("L")
            im = im.resize((cell - 8, cell - 8))
            rgb = Image.new("RGB", im.size, (255, 255, 255))
            rgb.paste(im.convert("RGB"), mask=Image.eval(im, lambda p: 255 - p))
            x = (i % cols) * cell + 4
            y = (i // cols) * cell + 4
            canvas.paste(rgb, (x, y))
        except Exception:
            continue
    buf = BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def _store_font_asset(
    user_id: str,
    *,
    preview_png: bytes,
    preview_url: str,
    ttf_url: str,
    ttf_key: str,
    family: str,
    description: str,
    task_id: str,
    warnings: list[str],
) -> dict[str, Any]:
    import json
    import uuid

    from services.db import connect, init_schema

    init_schema()
    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    object_key = f"assets/{user_id}/{asset_id}.png"
    put_bytes(object_key, preview_png, content_type="image/png")
    public_url = _public_url(object_key)
    # Prefer the storage URL we just wrote; keep preview_url as alias in meta
    now = time.time()
    meta = {
        "ttfUrl": ttf_url,
        "ttfObjectKey": ttf_key,
        "familyName": family,
        "taskId": task_id,
        "previewUrl": preview_url,
        "warnings": warnings[:20],
        "format": "ttf",
    }
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO assets (
                id, user_id, kind, object_key, url, mime, width, height,
                source, prompt, meta_json, created_at
            ) VALUES (?, ?, 'font', ?, ?, 'image/png', NULL, NULL, 'font_generator', ?, ?, ?)
            """,
            (
                asset_id,
                user_id,
                object_key,
                public_url,
                description or family,
                json.dumps(meta, ensure_ascii=False),
                now,
            ),
        )
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()

    from services.assets import _row_to_asset

    return _row_to_asset(row)
