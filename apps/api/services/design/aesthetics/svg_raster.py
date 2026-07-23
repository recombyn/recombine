"""Lightweight SVG → PNG for task preview → quality-sample (no cairo)."""

from __future__ import annotations

import base64
import re
from io import BytesIO
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

_NS = {"svg": "http://www.w3.org/2000/svg"}
_ATTR_NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def _num(val: str | None, default: float = 0.0) -> float:
    if val is None:
        return default
    m = _ATTR_NUM.search(str(val))
    if not m:
        return default
    try:
        return float(m.group(0))
    except Exception:
        return default


def _local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1].lower()
    return tag.lower()


def _parse_size(root: ET.Element) -> tuple[int, int]:
    w = _num(root.get("width"), 0)
    h = _num(root.get("height"), 0)
    vb = (root.get("viewBox") or "").strip().split()
    if len(vb) == 4:
        if w <= 0:
            w = _num(vb[2], 1080)
        if h <= 0:
            h = _num(vb[3], 1920)
    if w <= 0:
        w = 1080
    if h <= 0:
        h = 1920
    return max(64, int(round(w))), max(64, int(round(h)))


def _fill(el: ET.Element) -> str | None:
    fill = (el.get("fill") or "").strip()
    if fill and fill.lower() not in ("none", "transparent"):
        return fill
    style = el.get("style") or ""
    m = re.search(r"fill\s*:\s*([^;]+)", style, re.I)
    if m:
        v = m.group(1).strip()
        if v.lower() not in ("none", "transparent"):
            return v
    return None


def svg_to_png_bytes(svg: str, *, max_edge: int = 512) -> bytes:
    """
    Best-effort raster of rect/circle/text layers for CLIP sample ingest.
    Not a full SVG engine — enough for agent result_svg previews.
    """
    raw = (svg or "").strip()
    if not raw:
        raise ValueError("empty svg")
    if raw.startswith("\ufeff"):
        raw = raw.lstrip("\ufeff")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise ValueError(f"invalid svg: {exc}") from exc

    src_w, src_h = _parse_size(root)
    scale = min(1.0, float(max_edge) / float(max(src_w, src_h)))
    out_w = max(32, int(round(src_w * scale)))
    out_h = max(32, int(round(src_h * scale)))
    img = Image.new("RGB", (out_w, out_h), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    def sx(x: float) -> float:
        return x * scale

    def sy(y: float) -> float:
        return y * scale

    for el in root.iter():
        tag = _local(el.tag)
        fill = _fill(el)
        if tag == "rect":
            x = sx(_num(el.get("x")))
            y = sy(_num(el.get("y")))
            w = sx(_num(el.get("width"), 1))
            h = sy(_num(el.get("height"), 1))
            draw.rectangle([x, y, x + max(1, w), y + max(1, h)], fill=fill or "#ddd")
        elif tag in ("circle", "ellipse"):
            cx = sx(_num(el.get("cx")))
            cy = sy(_num(el.get("cy")))
            if tag == "circle":
                r = sx(_num(el.get("r"), 1))
                rx = ry = r
            else:
                rx = sx(_num(el.get("rx"), 1))
                ry = sy(_num(el.get("ry"), 1))
            draw.ellipse(
                [cx - rx, cy - ry, cx + rx, cy + ry],
                fill=fill or "#ddd",
            )
        elif tag == "text":
            x = sx(_num(el.get("x")))
            y = sy(_num(el.get("y")))
            text = "".join(el.itertext()).strip()
            if not text:
                continue
            fs = max(8, int(round(_num(el.get("font-size"), 16) * scale)))
            color = fill or "#111"
            try:
                draw.text((x, y - fs), text[:80], fill=color, font=font)
            except Exception:
                draw.text((x, max(0, y - 12)), text[:40], fill=color)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def svg_to_png_data_url(svg: str, *, max_edge: int = 512) -> str:
    png = svg_to_png_bytes(svg, max_edge=max_edge)
    b64 = base64.b64encode(png).decode("ascii")
    return f"data:image/png;base64,{b64}"
