"""Bitmap → vector contours (pypotrace when available, else OpenCV)."""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Any

logger = logging.getLogger(__name__)


def vectorize_glyph(png: bytes) -> dict[str, Any]:
    """
    Convert a glyph PNG (black ink on white) into contour paths.

    Returns ``{ contours: list[list[tuple[x,y]]], width, height, engine }``
    where each contour is a closed ring of integer points (image coords,
    origin top-left).
    """
    try:
        return _vectorize_potrace(png)
    except Exception as err:  # noqa: BLE001
        logger.debug("pypotrace unavailable (%s), using OpenCV contours", err)
        return _vectorize_opencv(png)


def _load_binary(png: bytes):
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        arr = np.frombuffer(png, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError("invalid glyph png")
        _, binary = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # Ink dark
        if float(binary.mean()) < 127:
            binary = 255 - binary
        return cv2, np, binary
    except ImportError:
        from PIL import Image
        import numpy as np  # type: ignore

        with Image.open(BytesIO(png)) as im:
            gray = im.convert("L")
            arr = np.array(gray)
        binary = (arr > 127).astype("uint8") * 255
        return None, np, binary


def _vectorize_potrace(png: bytes) -> dict[str, Any]:
    """Prefer pypotrace / potracer if installed."""
    cv2, np, binary = _load_binary(png)
    h, w = binary.shape[:2]
    # potrace wants ink=True bitmap
    ink = binary < 128

    try:
        import potrace  # type: ignore  # pypotrace

        bmp = potrace.Bitmap(ink)
        path = bmp.trace(turdsize=2, opttolerance=0.2)
        contours: list[list[tuple[float, float]]] = []
        for curve in path:
            pts: list[tuple[float, float]] = []
            start = curve.start_point
            pts.append((float(start.x), float(start.y)))
            for segment in curve:
                if segment.is_corner:
                    pts.append((float(segment.c.x), float(segment.c.y)))
                    pts.append((float(segment.end_point.x), float(segment.end_point.y)))
                else:
                    # Approximate cubic with end point (fontTools will smooth later)
                    pts.append((float(segment.end_point.x), float(segment.end_point.y)))
            if len(pts) >= 3:
                contours.append(pts)
        if contours:
            return {"contours": contours, "width": w, "height": h, "engine": "pypotrace"}
    except Exception:
        pass

    # potracer (pure-ish alternative package name in some installs)
    try:
        import potracer  # type: ignore

        result = potracer.trace(ink.astype("uint8") * 255)
        contours = []
        for path in getattr(result, "paths", []) or []:
            pts = [(float(p[0]), float(p[1])) for p in path]
            if len(pts) >= 3:
                contours.append(pts)
        if contours:
            return {"contours": contours, "width": w, "height": h, "engine": "potracer"}
    except Exception:
        pass

    raise RuntimeError("no potrace backend")


def _vectorize_opencv(png: bytes) -> dict[str, Any]:
    cv2, np, binary = _load_binary(png)
    h, w = binary.shape[:2]
    ink = (binary < 128).astype("uint8") * 255
    if cv2 is None:
        # Minimal marching without cv2: empty outer box for space-like glyphs
        return {"contours": [], "width": w, "height": h, "engine": "none"}

    contours_raw, hierarchy = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    contours: list[list[tuple[float, float]]] = []
    for i, cnt in enumerate(contours_raw):
        if cv2.contourArea(cnt) < 8:
            continue
        approx = cv2.approxPolyDP(cnt, epsilon=1.2, closed=True)
        pts = [(float(p[0][0]), float(p[0][1])) for p in approx]
        if len(pts) >= 3:
            contours.append(pts)
    return {"contours": contours, "width": w, "height": h, "engine": "opencv"}
