"""Fetch sample images and run three-tower CLIP embed → MySQL BLOB."""

from __future__ import annotations

import logging
import re
import threading
from typing import Any
from urllib.parse import urlparse

import httpx

from app.services.design.aesthetics.clip_encoder import MODEL_ID, encode_towers
from app.services.design.aesthetics.views import (
    aesthetic_view,
    color_view,
    layout_view,
    load_pil,
)
from app.services.design.admin.quality_sample_store import (
    get_quality_sample,
    save_embeddings,
    set_embed_status,
)
from app.services.storage import get_bytes

logger = logging.getLogger(__name__)

_URL_KEY = re.compile(r"/uploads/(.+)$|/objects/(.+)$|/files/(.+)$", re.I)


def fetch_image_bytes(image_url: str) -> bytes:
    url = (image_url or "").strip()
    if not url:
        raise ValueError("empty image_url")

    # data URL
    if url.startswith("data:image"):
        import base64

        _, _, b64 = url.partition(",")
        return base64.b64decode(b64)

    # Try object storage key from path
    m = _URL_KEY.search(url)
    if m:
        key = next(g for g in m.groups() if g)
        raw = get_bytes(key)
        if raw:
            return raw

    parsed = urlparse(url)
    if parsed.scheme in ("http", "https"):
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.content

    # Local file path
    from pathlib import Path

    p = Path(url)
    if p.is_file():
        return p.read_bytes()

    raise FileNotFoundError(f"cannot load image: {url[:120]}")


def embed_quality_sample(sample_id: int) -> dict[str, Any]:
    """
    Load sample image → layout/color/aesthetic views → OpenCLIP → DB.
    Sets embed_status ready|failed.
    """
    item = get_quality_sample(int(sample_id))
    if not item:
        return {"ok": False, "error": "not_found"}
    set_embed_status(int(sample_id), "pending", error="")
    try:
        raw = fetch_image_bytes(item["imageUrl"])
        pil = load_pil(raw)
        blobs = encode_towers(
            layout_view(pil),
            color_view(pil),
            aesthetic_view(pil),
        )
        save_embeddings(
            int(sample_id),
            layout_emb=blobs["layout_emb"],
            color_emb=blobs["color_emb"],
            aesthetic_emb=blobs["aesthetic_emb"],
            emb_dim=int(blobs["dim"]),
            emb_model=MODEL_ID,
        )
        return {"ok": True, "id": int(sample_id), "dim": blobs["dim"], "model": MODEL_ID}
    except Exception as exc:
        logger.exception("embed sample %s failed", sample_id)
        set_embed_status(int(sample_id), "failed", error=str(exc)[:2000])
        return {"ok": False, "id": int(sample_id), "error": str(exc)}


def schedule_embed(sample_id: int) -> dict[str, Any]:
    """Queue embed: Celery only if a worker is alive; otherwise background thread."""
    from app.services.design.aesthetics.clip_encoder import clip_available, clip_status

    sid = int(sample_id)
    if not clip_available():
        st = clip_status()
        err = st.get("hint") or "OpenCLIP unavailable"
        set_embed_status(sid, "failed", error=str(err))
        return {"queued": False, "backend": "none", "id": sid, "error": err}

    set_embed_status(sid, "pending", error="")

    # Prefer live Celery workers; bare .delay() would leave status=pending forever.
    try:
        from worker.celery_app import celery
        from worker.tasks import embed_quality_sample_job

        insp = celery.control.inspect(timeout=0.6)
        ping = insp.ping() if insp is not None else None
        if ping:
            embed_quality_sample_job.delay(sid)
            return {"queued": True, "backend": "celery", "id": sid}
    except Exception as exc:
        logger.warning("celery embed check failed (%s); using thread", exc)

    def _run() -> None:
        embed_quality_sample(sid)

    threading.Thread(target=_run, name=f"embed-{sid}", daemon=True).start()
    return {"queued": True, "backend": "thread", "id": sid}
