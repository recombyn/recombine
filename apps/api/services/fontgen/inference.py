"""Font inference client — remote zi2zi/DG-Font service or local fallback."""

from __future__ import annotations

import base64
import logging
from io import BytesIO
from typing import Any

import httpx

from config.settings import settings
from services.fontgen.charset import DEFAULT_EXTRA_CHARS, DEFAULT_LATIN_CHARSET

logger = logging.getLogger(__name__)


def resolve_charset(raw: str | None) -> str:
    text = (raw or "").strip()
    if not text:
        text = DEFAULT_LATIN_CHARSET + DEFAULT_EXTRA_CHARS
    seen: set[str] = set()
    out: list[str] = []
    for ch in text:
        if ch in seen or ord(ch) < 32:
            continue
        seen.add(ch)
        out.append(ch)
    if " " not in seen:
        out.insert(0, " ")
    return "".join(out)


def generate_glyph_bitmaps(
    *,
    style_image_url: str | None,
    style_png: bytes | None,
    charset: str,
    description: str | None = None,
    stroke_px: float = 2.0,
) -> list[dict[str, Any]]:
    chars = resolve_charset(charset)
    base = (settings.font_inference_url or "").strip().rstrip("/")
    if base:
        try:
            return _call_inference_service(
                base_url=base,
                style_image_url=style_image_url,
                style_png=style_png,
                charset=chars,
                description=description,
            )
        except Exception as err:  # noqa: BLE001
            logger.warning("font inference service failed, using local fallback: %s", err)
    return _local_synthesize_glyphs(chars, stroke_px=stroke_px, description=description)


def _call_inference_service(
    *,
    base_url: str,
    style_image_url: str | None,
    style_png: bytes | None,
    charset: str,
    description: str | None,
) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {
        "charset": charset,
        "description": description or "",
    }
    if style_image_url:
        payload["style_image_url"] = style_image_url
    if style_png:
        payload["style_image_b64"] = base64.b64encode(style_png).decode("ascii")

    timeout = max(30, int(settings.font_inference_timeout or 300))
    url = f"{base_url}/generate"
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    glyphs_in = data.get("glyphs") or data.get("images") or []
    if not glyphs_in:
        raise RuntimeError("inference service returned no glyphs")

    out: list[dict[str, Any]] = []
    for item in glyphs_in:
        ch = str(item.get("char") or item.get("character") or "")
        if not ch:
            continue
        raw = item.get("image") or item.get("png") or item.get("data") or ""
        png = _decode_image_payload(raw)
        w = int(item.get("width") or 0) or None
        h = int(item.get("height") or 0) or None
        if w is None or h is None:
            w, h = _probe_size(png)
        out.append({"char": ch[0], "png": png, "width": w, "height": h})
    if not out:
        raise RuntimeError("inference service glyphs could not be decoded")
    return out


def _decode_image_payload(raw: Any) -> bytes:
    if isinstance(raw, (bytes, bytearray)):
        return bytes(raw)
    s = str(raw or "").strip()
    if not s:
        raise ValueError("empty glyph image")
    if s.startswith("data:"):
        _, _, payload = s.partition(",")
        return base64.b64decode(payload)
    return base64.b64decode(s)


def _probe_size(png: bytes) -> tuple[int, int]:
    from PIL import Image

    with Image.open(BytesIO(png)) as im:
        return int(im.width), int(im.height)


def _local_synthesize_glyphs(
    charset: str,
    *,
    stroke_px: float = 2.0,
    description: str | None = None,
) -> list[dict[str, Any]]:
    from PIL import Image, ImageDraw, ImageFilter, ImageOps

    size = 256
    pad = 24
    font = _load_base_font(size - pad * 2)
    desc = (description or "").lower()
    boldish = any(k in desc for k in ("bold", "heavy", "black"))
    thinish = any(k in desc for k in ("thin", "light", "hairline"))
    roundish = any(k in desc for k in ("round", "soft", "rounded"))

    dilate = max(0, int(round(stroke_px / 3.0)))
    if boldish:
        dilate = max(dilate, 2)
    if thinish:
        dilate = 0

    out: list[dict[str, Any]] = []
    for ch in charset:
        if ch == " ":
            blank = Image.new("L", (size // 2, size), 255)
            buf = BytesIO()
            blank.save(buf, format="PNG")
            out.append({"char": " ", "png": buf.getvalue(), "width": size // 2, "height": size})
            continue

        canvas = Image.new("L", (size, size), 255)
        draw = ImageDraw.Draw(canvas)
        bbox = draw.textbbox((0, 0), ch, font=font)
        tw = max(1, bbox[2] - bbox[0])
        th = max(1, bbox[3] - bbox[1])
        x = (size - tw) // 2 - bbox[0]
        y = (size - th) // 2 - bbox[1]
        draw.text((x, y), ch, fill=0, font=font)

        if dilate > 0:
            canvas = ImageOps.invert(canvas)
            for _ in range(dilate):
                canvas = canvas.filter(ImageFilter.MaxFilter(3))
            canvas = ImageOps.invert(canvas)
        if roundish:
            canvas = canvas.filter(ImageFilter.GaussianBlur(radius=0.6))
            canvas = canvas.point(lambda p: 0 if p < 140 else 255)

        buf = BytesIO()
        canvas.save(buf, format="PNG")
        out.append({"char": ch, "png": buf.getvalue(), "width": size, "height": size})
    return out


def _load_base_font(px: int):
    from PIL import ImageFont

    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default()
