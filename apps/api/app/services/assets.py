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

from sqlmodel import Session

from app import crud
from app.core.db import engine
from app.services.db import init_schema
from app.services.storage import delete_object, get_storage, put_bytes


def _row_to_asset(row: Any) -> dict[str, Any]:
    def _get(key: str) -> Any:
        return getattr(row, key) if hasattr(row, key) else row[key]

    meta = None
    raw_meta = _get("meta_json")
    if raw_meta:
        try:
            meta = json.loads(raw_meta)
        except json.JSONDecodeError:
            meta = None
    return {
        "id": _get("id"),
        "kind": _get("kind"),
        "url": _get("url"),
        "objectKey": _get("object_key"),
        "mime": _get("mime"),
        "width": _get("width"),
        "height": _get("height"),
        "source": _get("source"),
        "prompt": _get("prompt"),
        "meta": meta,
        "createdAt": int(float(_get("created_at") or 0) * 1000),
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
    if kind_n not in ("image", "video", "font"):
        kind_n = None
    with Session(engine) as session:
        total = crud.count_user_assets(
            session=session, user_id=user_id, kind=kind_n
        )
        rows = crud.list_user_assets(
            session=session,
            user_id=user_id,
            kind=kind_n,
            offset=offset,
            limit=page_size_n,
        )
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

    with Session(engine) as session:
        row = crud.create_asset(
            session=session,
            asset_id=asset_id,
            user_id=user_id,
            kind=kind_n,
            object_key=object_key,
            url=public_url,
            mime=mime,
            width=width,
            height=height,
            source=(source or "ai_image")[:32],
            prompt=(prompt or None),
            created_at=now,
        )
    return _row_to_asset(row)


def delete_asset(user_id: str, asset_id: str) -> bool:
    init_schema()
    with Session(engine) as session:
        row = crud.delete_user_asset(
            session=session, user_id=user_id, asset_id=asset_id
        )
    if not row:
        return False
    if row.object_key:
        delete_object(row.object_key)
    return True
