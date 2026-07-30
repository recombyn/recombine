"""User file uploads → Tencent COS (S3-compatible) or local object store."""

from __future__ import annotations

import mimetypes
import re
import time
import uuid
from typing import Any

from config.settings import settings
from services.storage import delete_object, get_storage, put_bytes

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._\-]+")

_IMAGE_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
}

_VIDEO_MIME = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/mp4",
}


def _ext_mime(filename: str | None, content_type: str | None) -> tuple[str, str]:
    ctype = (content_type or "").split(";")[0].strip().lower()
    name = (filename or "").strip().lower()
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1]
    if ext in _IMAGE_MIME:
        return ext.lstrip("."), _IMAGE_MIME[ext]
    if ext in _VIDEO_MIME:
        return ext.lstrip("."), _VIDEO_MIME[ext]
    if ctype.startswith("image/"):
        guessed = mimetypes.guess_extension(ctype) or ".bin"
        if guessed == ".jpe":
            guessed = ".jpg"
        return guessed.lstrip("."), ctype
    if ctype.startswith("video/"):
        guessed = mimetypes.guess_extension(ctype) or ".mp4"
        return guessed.lstrip("."), ctype
    if ext:
        mime = mimetypes.guess_type(f"x{ext}")[0] or "application/octet-stream"
        return ext.lstrip("."), mime
    return "bin", ctype or "application/octet-stream"


def _safe_filename(name: str | None) -> str:
    raw = (name or "file").strip() or "file"
    base = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = _SAFE_NAME.sub("_", base).strip("._") or "file"
    return cleaned[:120]


def _probe_image_size(data: bytes, mime: str) -> tuple[int | None, int | None]:
    if not mime.startswith("image/") or mime == "image/svg+xml":
        return None, None
    try:
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(data)) as im:
            return int(im.width), int(im.height)
    except Exception:
        return None, None


def upload_user_file(
    user_id: str,
    *,
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    """
    Store one file in object storage and return a public (or API) URL.

    Keys: ``uploads/{user_id}/{yyyy}/{mm}/{uuid}.{ext}``
    """
    if not data:
        raise ValueError("empty file")

    ext, mime = _ext_mime(filename, content_type)
    if not (mime.startswith("image/") or mime.startswith("video/")):
        raise ValueError("only image or video uploads are supported")

    max_mb = max(1, int(settings.max_upload_mb or 20))
    # Videos need a higher ceiling than stills (default 100MB unless configured higher).
    if mime.startswith("video/"):
        max_mb = max(max_mb, int(getattr(settings, "max_video_upload_mb", None) or 100))
    max_bytes = max_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise ValueError(f"file too large (max {max_mb}MB)")

    now = time.gmtime()
    file_id = uuid.uuid4().hex
    object_key = f"uploads/{user_id}/{now.tm_year:04d}/{now.tm_mon:02d}/{file_id}.{ext}"
    put_bytes(object_key, data, content_type=mime)

    storage = get_storage()
    url = storage.url_for(object_key)
    # Local backend: expose via authenticated download route.
    if not storage.enabled_remote():
        url = f"/api/v1/uploads/files/{object_key}"

    width, height = _probe_image_size(data, mime)
    thumb_b64 = ""
    thumb_key = ""
    if mime.startswith("image/"):
        try:
            from services.design.blob_codec import make_webp_thumb
            import base64

            thumb = make_webp_thumb(data, max_edge=512, quality=70)
            # Also keep a small sibling object for CDN/cache (optional).
            thumb_key = f"{object_key.rsplit('.', 1)[0]}.thumb.webp"
            try:
                put_bytes(thumb_key, thumb, content_type="image/webp")
            except Exception:
                thumb_key = ""
            thumb_b64 = base64.b64encode(thumb).decode("ascii")
        except Exception:
            thumb_key = ""

    return {
        "url": url,
        "key": object_key,
        "originPath": object_key,
        "mime": mime,
        "name": _safe_filename(filename),
        "size": len(data),
        "width": width,
        "height": height,
        "thumbKey": thumb_key or None,
        "thumbWebpBase64": thumb_b64 or None,
    }


def upload_user_files(
    user_id: str,
    files: list[tuple[bytes, str | None, str | None]],
) -> list[dict[str, Any]]:
    """``files`` items: (bytes, filename, content_type)."""
    if not files:
        raise ValueError("files required")
    out: list[dict[str, Any]] = []
    for data, filename, content_type in files:
        out.append(
            upload_user_file(
                user_id,
                data=data,
                filename=filename,
                content_type=content_type,
            )
        )
    return out


def delete_user_file(user_id: str, object_key: str) -> bool:
    """Delete one of the user's uploaded objects. Returns False if key is invalid/foreign."""
    key = (object_key or "").strip().lstrip("/")
    if not key or ".." in key:
        return False
    prefix = f"uploads/{user_id}/"
    if not key.startswith(prefix):
        return False
    try:
        delete_object(key)
    except Exception:
        return False
    return True
