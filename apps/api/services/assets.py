"""User AI assets (image/video) — metadata in DB, blobs in COS/local storage."""

from __future__ import annotations

import base64
import json
import mimetypes
import time
import uuid
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from services.db import connect, init_schema
from services.storage import delete_object, get_storage, put_bytes


def _row_to_asset(row: Any) -> dict[str, Any]:
    meta = None
    if row["meta_json"]:
        try:
            meta = json.loads(row["meta_json"])
        except json.JSONDecodeError:
            meta = None
    return {
        "id": row["id"],
        "kind": row["kind"],
        "url": row["url"],
        "objectKey": row["object_key"],
        "mime": row["mime"],
        "width": row["width"],
        "height": row["height"],
        "source": row["source"],
        "prompt": row["prompt"],
        "meta": meta,
        "createdAt": int(float(row["created_at"]) * 1000),
    }


def list_assets(
    user_id: str,
    *,
    kind: str | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 24), 100))
    offset = (page_n - 1) * page_size_n
    kind_n = (kind or "").strip().lower() or None
    with connect() as conn:
        if kind_n in ("image", "video", "font"):
            total_row = conn.execute(
                "SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND kind = ?",
                (user_id, kind_n),
            ).fetchone()
            rows = conn.execute(
                """
                SELECT * FROM assets
                WHERE user_id = ? AND kind = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, kind_n, page_size_n, offset),
            ).fetchall()
        else:
            total_row = conn.execute(
                "SELECT COUNT(*) AS c FROM assets WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            rows = conn.execute(
                """
                SELECT * FROM assets
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, page_size_n, offset),
            ).fetchall()
    total = int(total_row["c"] if total_row else 0)
    items = [_row_to_asset(r) for r in rows]
    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(items) < total,
    }


def _guess_ext_mime(url: str, content_type: str | None) -> tuple[str, str]:
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype.startswith("image/") or ctype.startswith("video/"):
        ext = mimetypes.guess_extension(ctype) or ".bin"
        if ext == ".jpe":
            ext = ".jpg"
        return ext.lstrip("."), ctype
    path = urlparse(url).path.lower()
    for ext, mime in (
        (".png", "image/png"),
        (".jpg", "image/jpeg"),
        (".jpeg", "image/jpeg"),
        (".webp", "image/webp"),
        (".gif", "image/gif"),
        (".mp4", "video/mp4"),
        (".webm", "video/webm"),
    ):
        if path.endswith(ext):
            return ext.lstrip("."), mime
    return "png", "image/png"


def _decode_data_url(data_url: str) -> tuple[bytes, str | None]:
    # data:[<mediatype>][;base64],<data>
    header, _, payload = data_url.partition(",")
    if not payload:
        raise ValueError("invalid data url")
    mime = None
    if header.startswith("data:"):
        meta = header[5:]
        mime = meta.split(";")[0].strip() or None
    if ";base64" in header.lower():
        return base64.b64decode(payload), mime
    from urllib.parse import unquote_to_bytes

    return unquote_to_bytes(payload), mime


def _fetch_bytes(url: str) -> tuple[bytes, str | None]:
    url = (url or "").strip()
    if not url:
        raise ValueError("empty url")
    if url.startswith("data:"):
        return _decode_data_url(url)
    req = Request(url, headers={"User-Agent": "recombyn-assets/1.0"})
    with urlopen(req, timeout=60) as resp:  # noqa: S310 — controlled AI/CDN urls
        ctype = resp.headers.get("Content-Type")
        data = resp.read()
    if not data:
        raise ValueError("empty body")
    return data, ctype


def _probe_image_size(data: bytes) -> tuple[int | None, int | None]:
    try:
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(data)) as im:
            return int(im.width), int(im.height)
    except Exception:
        return None, None


def create_asset_from_url(
    user_id: str,
    url: str,
    *,
    kind: str = "image",
    source: str = "ai_image",
    prompt: str | None = None,
) -> dict[str, Any]:
    init_schema()
    kind_n = (kind or "image").strip().lower()
    if kind_n not in ("image", "video", "font"):
        kind_n = "image"
    data, ctype = _fetch_bytes(url)
    ext, mime = _guess_ext_mime(url, ctype)
    width, height = (None, None)
    if kind_n in ("image", "font"):
        width, height = _probe_image_size(data)

    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    object_key = f"assets/{user_id}/{asset_id}.{ext}"
    put_bytes(object_key, data, content_type=mime)
    public_url = get_storage().url_for(object_key)
    now = time.time()

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO assets (
                id, user_id, kind, object_key, url, mime, width, height,
                source, prompt, meta_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                asset_id,
                user_id,
                kind_n,
                object_key,
                public_url,
                mime,
                width,
                height,
                (source or "ai_image")[:32],
                (prompt or None),
                now,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
    return _row_to_asset(row)


def delete_asset(user_id: str, asset_id: str) -> bool:
    init_schema()
    with connect() as conn:
        row = conn.execute(
            "SELECT object_key FROM assets WHERE id = ? AND user_id = ?",
            (asset_id, user_id),
        ).fetchone()
        if not row:
            return False
        conn.execute(
            "DELETE FROM assets WHERE id = ? AND user_id = ?",
            (asset_id, user_id),
        )
        conn.commit()
    if row["object_key"]:
        delete_object(row["object_key"])
    return True
