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


def _display_url(
    object_key: str,
    *,
    source_url: str | None = None,
    kind: str | None = None,
    image_bytes: bytes | None = None,
    mime: str | None = None,
) -> str:
    """URL clients can load without auth when possible.

    - Remote COS/S3 → public object URL
    - Local images → ``data:image/…;base64,…`` (SVG / ``<img>`` cannot send Bearer)
    - Local video/audio → keep public https source when present, else auth download route
    """
    key = (object_key or "").replace("\\", "/").lstrip("/")
    storage = get_storage()
    if storage.enabled_remote():
        return storage.url_for(key)

    kind_n = (kind or "").strip().lower()
    if kind_n == "image" and image_bytes:
        return _image_data_url(image_bytes, mime or "image/png")

    src = (source_url or "").strip()
    if src.startswith(("http://", "https://", "data:")):
        return src
    return f"/api/v1/uploads/files/{key}"


def _image_data_url(data: bytes, mime: str) -> str:
    """Inline image for local storage — thumbs stay small; full object stays on disk."""
    raw = bytes(data or b"")
    if not raw:
        raise ValueError("empty image")
    try:
        from app.services.design.admin.blob_codec import make_webp_thumb

        # Large enough for dock thumbs + light canvas; full fidelity via object_key fetch.
        thumb = make_webp_thumb(raw, max_edge=1536, quality=85)
        return f"data:image/webp;base64,{base64.b64encode(thumb).decode('ascii')}"
    except Exception:
        mt = (mime or "image/png").split(";")[0].strip() or "image/png"
        # Cap runaway DB rows if webp thumb fails.
        if len(raw) > 1_800_000:
            from io import BytesIO

            from PIL import Image

            im = Image.open(BytesIO(raw))
            im.thumbnail((1280, 1280))
            buf = BytesIO()
            im.convert("RGB").save(buf, format="JPEG", quality=85)
            raw = buf.getvalue()
            mt = "image/jpeg"
        return f"data:{mt};base64,{base64.b64encode(raw).decode('ascii')}"


def _normalize_asset_url(url: str | None, object_key: str | None) -> str:
    """Rewrite legacy bare storage keys so FE can hydrate via /uploads/files."""
    raw = (url or "").strip()
    key = (object_key or "").replace("\\", "/").lstrip("/")
    if not raw and key:
        return _display_url(key)
    if raw.startswith(("http://", "https://", "data:", "/")):
        return raw
    # Local storage.url_for used to return the bare key (assets/…, uploads/…).
    if key and (raw == key or raw.startswith(("assets/", "uploads/", "projects/", "font-tasks/"))):
        return _display_url(key)
    if raw.startswith(("assets/", "uploads/", "projects/", "font-tasks/")):
        return _display_url(raw)
    return raw


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
    object_key = _get("object_key")
    return {
        "id": _get("id"),
        "kind": _get("kind"),
        "url": _normalize_asset_url(_get("url"), object_key),
        "objectKey": object_key,
        "mime": _get("mime"),
        "width": _get("width"),
        "height": _get("height"),
        "source": _get("source"),
        "prompt": _get("prompt"),
        "meta": meta,
        "createdAt": int(float(_get("created_at") or 0) * 1000),
    }


_ASSET_KINDS = ("image", "video", "audio", "font", "lottie")


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
    if kind_n not in _ASSET_KINDS:
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
    if (
        ctype.startswith("image/")
        or ctype.startswith("video/")
        or ctype.startswith("audio/")
    ):
        ext = mimetypes.guess_extension(ctype) or ".bin"
        if ext == ".jpe":
            ext = ".jpg"
        if ctype == "audio/mpeg" and ext in (".mp2", ".mpga", ".bin"):
            ext = ".mp3"
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
        (".mp3", "audio/mpeg"),
        (".wav", "audio/wav"),
        (".ogg", "audio/ogg"),
        (".m4a", "audio/mp4"),
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


def create_asset_from_remote_url(
    user_id: str,
    url: str,
    *,
    kind: str = "video",
    source: str = "ai_video",
    prompt: str | None = None,
    mime: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> dict[str, Any]:
    """Register a public CDN/http URL without re-downloading (video rehost fallback)."""
    init_schema()
    kind_n = (kind or "video").strip().lower()
    if kind_n not in _ASSET_KINDS:
        kind_n = "video"
    src = (url or "").strip()
    if not src.startswith(("http://", "https://", "data:")):
        raise ValueError("remote url required")
    ext, guessed = _guess_ext_mime(src, mime)
    mime_n = (mime or guessed or "application/octet-stream").split(";")[0].strip()
    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    # No local blob — keep a stable key for deletes / bookkeeping.
    object_key = f"assets/{user_id}/{asset_id}.{ext or 'bin'}"
    now = time.time()
    with Session(engine) as session:
        row = crud.create_asset(
            session=session,
            asset_id=asset_id,
            user_id=user_id,
            kind=kind_n,
            object_key=object_key,
            url=src,
            mime=mime_n,
            width=width,
            height=height,
            source=(source or "ai_video")[:32],
            prompt=(prompt or None),
            created_at=now,
        )
    return _row_to_asset(row)


def create_asset_from_stored(
    user_id: str,
    *,
    kind: str,
    url: str,
    object_key: str | None = None,
    mime: str | None = None,
    source: str = "upload",
    prompt: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> dict[str, Any]:
    """Register an already-uploaded storage object (canvas video/audio upload)."""
    init_schema()
    kind_n = (kind or "image").strip().lower()
    if kind_n not in _ASSET_KINDS:
        kind_n = "image"
    src = (url or "").strip()
    key = (object_key or "").replace("\\", "/").lstrip("/")
    if not src and not key:
        raise ValueError("url or object_key required")
    if not key:
        key = f"assets/{user_id}/asset_{uuid.uuid4().hex[:16]}.bin"
    if not src:
        src = _display_url(key, kind=kind_n, mime=mime)
    mime_n = (mime or "").split(";")[0].strip() or None
    if not mime_n:
        mime_n = _guess_ext_mime(src or key, None)[1]
    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    now = time.time()
    with Session(engine) as session:
        row = crud.create_asset(
            session=session,
            asset_id=asset_id,
            user_id=user_id,
            kind=kind_n,
            object_key=key,
            url=src,
            mime=mime_n,
            width=width,
            height=height,
            source=(source or "upload")[:32],
            prompt=(prompt or None),
            created_at=now,
        )
    return _row_to_asset(row)


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
    if kind_n not in _ASSET_KINDS:
        kind_n = "image"
    data, ctype = _fetch_bytes(url)
    ext, mime = _guess_ext_mime(url, ctype)
    width, height = (None, None)
    if kind_n in ("image", "font"):
        width, height = _probe_image_size(data)

    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    object_key = f"assets/{user_id}/{asset_id}.{ext}"
    put_bytes(object_key, data, content_type=mime)
    public_url = _display_url(
        object_key,
        source_url=url,
        kind=kind_n,
        image_bytes=data if kind_n == "image" else None,
        mime=mime,
    )
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


def create_asset_from_bytes(
    user_id: str,
    data: bytes,
    *,
    kind: str = "audio",
    mime: str | None = None,
    source: str = "ai_audio",
    prompt: str | None = None,
    filename_ext: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> dict[str, Any]:
    """Persist raw bytes (e.g. OpenRouter TTS / Lottie JSON) without a round-trip URL fetch."""
    init_schema()
    kind_n = (kind or "audio").strip().lower()
    if kind_n not in _ASSET_KINDS:
        kind_n = "audio"
    raw = bytes(data or b"")
    if not raw:
        raise ValueError("empty body")
    ctype = (mime or "").split(";")[0].strip().lower() or None
    if filename_ext:
        ext = str(filename_ext).lstrip(".").lower() or "bin"
        guessed = mimetypes.guess_type(f"x.{ext}")[0]
        mime_n = ctype or guessed or "application/octet-stream"
    else:
        ext, mime_n = _guess_ext_mime("", ctype)
        if kind_n == "audio" and ext in ("png", "bin") and not ctype:
            ext, mime_n = "mp3", "audio/mpeg"
        if kind_n == "lottie" and ext in ("png", "bin") and not ctype:
            ext, mime_n = "json", "application/json"
    out_w, out_h = width, height
    if kind_n in ("image", "font"):
        out_w, out_h = _probe_image_size(raw)
    elif kind_n == "lottie" and (out_w is None or out_h is None):
        try:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict):
                if out_w is None:
                    out_w = int(parsed.get("w") or 0) or None
                if out_h is None:
                    out_h = int(parsed.get("h") or 0) or None
        except Exception:
            pass

    asset_id = f"asset_{uuid.uuid4().hex[:16]}"
    object_key = f"assets/{user_id}/{asset_id}.{ext}"
    put_bytes(object_key, raw, content_type=mime_n)
    public_url = _display_url(
        object_key,
        kind=kind_n,
        image_bytes=raw if kind_n == "image" else None,
        mime=mime_n,
    )
    now = time.time()

    with Session(engine) as session:
        row = crud.create_asset(
            session=session,
            asset_id=asset_id,
            user_id=user_id,
            kind=kind_n,
            object_key=object_key,
            url=public_url,
            mime=mime_n,
            width=out_w,
            height=out_h,
            source=(source or "ai_audio")[:32],
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
