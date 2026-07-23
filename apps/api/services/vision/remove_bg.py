"""Background removal (抠图) → RGBA PNG with real transparency.

Primary: rembg (U2Net). Fallback: OpenCV GrabCut + edge refine.
Seedream is NOT used — it cannot reliably emit alpha.
"""

from __future__ import annotations

import base64
import io
from typing import Any

import httpx


async def _load_bytes(image_ref: str) -> bytes:
    ref = (image_ref or "").strip()
    if not ref:
        raise ValueError("image is required")
    if ref.startswith("data:"):
        try:
            _, b64 = ref.split(",", 1)
        except ValueError as exc:
            raise ValueError("invalid data URL") from exc
        return base64.b64decode(b64)
    if ref.startswith("http://") or ref.startswith("https://"):
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
            resp = await client.get(ref)
            if resp.status_code >= 400:
                raise ValueError(f"failed to download image ({resp.status_code})")
            return resp.content
    raise ValueError("image must be a data URL or https URL")


def _png_data_url_from_pil(img) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _rembg_available() -> bool:
    try:
        import rembg  # noqa: F401
        from PIL import Image  # noqa: F401

        return True
    except ImportError:
        return False


def _cutout_rembg(raw: bytes):
    from rembg import remove
    from PIL import Image

    src = Image.open(io.BytesIO(raw))
    # rembg returns RGBA PNG bytes when given bytes; PIL when given PIL.
    out = remove(src)
    if isinstance(out, (bytes, bytearray)):
        return Image.open(io.BytesIO(out)).convert("RGBA")
    return out.convert("RGBA")


def _cutout_grabcut(raw: bytes):
    """OpenCV GrabCut fallback when rembg is not installed."""
    import cv2
    import numpy as np
    from PIL import Image

    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("could not decode image")
    h, w = bgr.shape[:2]
    # Inner rect as probable foreground — typical product/portrait framing.
    margin_x = max(4, w // 12)
    margin_y = max(4, h // 12)
    rect = (margin_x, margin_y, max(1, w - 2 * margin_x), max(1, h - 2 * margin_y))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    # 0/2 = bg, 1/3 = fg
    binary = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    # Soften edges slightly
    binary = cv2.GaussianBlur(binary, (3, 3), 0)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = binary
    # Trim empty margins
    ys, xs = np.where(binary > 8)
    if len(xs) and len(ys):
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        rgba = rgba[y0:y1, x0:x1]
    return Image.fromarray(cv2.cvtColor(rgba, cv2.COLOR_BGRA2RGBA))


def _trim_transparent(img):
    """Crop to non-transparent content bbox (keeps a 2px pad)."""
    from PIL import Image

    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    pad = 2
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


async def remove_background(image: str) -> dict[str, Any]:
    """
    Cut out the main subject; return transparent PNG data URL.

    Returns ``{ image, kind, engine, width, height }``.
    """
    raw = await _load_bytes(image)
    engine = "rembg"
    try:
        if _rembg_available():
            rgba = _cutout_rembg(raw)
        else:
            engine = "grabcut"
            try:
                rgba = _cutout_grabcut(raw)
            except ImportError as exc:
                raise RuntimeError(
                    "去背景需要 rembg 或 OpenCV。请安装: "
                    "pip install -e '.[vision]'  "
                    "或 pip install 'rembg[cpu]' Pillow"
                ) from exc
    except RuntimeError:
        raise
    except Exception as exc:  # noqa: BLE001
        # rembg failed → try grabcut
        if engine == "rembg":
            try:
                engine = "grabcut"
                rgba = _cutout_grabcut(raw)
            except Exception as grab_exc:  # noqa: BLE001
                raise RuntimeError(f"去背景失败: {exc}") from grab_exc
        else:
            raise RuntimeError(f"去背景失败: {exc}") from exc

    rgba = _trim_transparent(rgba)
    out = _png_data_url_from_pil(rgba)
    return {
        "image": out,
        "kind": "removeBg",
        "engine": engine,
        "width": int(rgba.width),
        "height": int(rgba.height),
    }
