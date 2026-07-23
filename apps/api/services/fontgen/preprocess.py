"""OpenCV style-image preprocess: denoise, binarize, optional char crop."""

from __future__ import annotations

from io import BytesIO
from typing import Any


def _cv2():
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        return cv2, np
    except ImportError as err:
        raise RuntimeError(
            "opencv-python-headless + numpy required for font preprocess "
            "(pip install opencv-python-headless numpy)"
        ) from err


def load_image_bytes(data: bytes):
    cv2, np = _cv2()
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("invalid style reference image")
    return img


def preprocess_style_image(data: bytes) -> dict[str, Any]:
    """
    Denoise + adaptive binarize a style reference.

    Returns PNG bytes for the cleaned binary image, stroke stats, and
    optional character crop boxes (image-local coords).
    """
    cv2, np = _cv2()
    bgr = load_image_bytes(data)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    # Adaptive threshold → ink=black (0), paper=white (255)
    binary = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        8,
    )
    # Ensure ink is dark
    if float(np.mean(binary)) < 127:
        binary = 255 - binary

    ink = (binary < 128).astype(np.uint8)
    stroke_ratio = float(ink.mean()) if ink.size else 0.0
    # Approximate stroke width via distance transform on ink
    stroke_px = 2.0
    if ink.any():
        dist = cv2.distanceTransform(ink * 255, cv2.DIST_L2, 3)
        vals = dist[ink > 0]
        if vals.size:
            stroke_px = float(max(1.0, np.median(vals) * 2.0))

    boxes = _segment_char_boxes(binary)
    ok, encoded = cv2.imencode(".png", binary)
    if not ok:
        raise RuntimeError("failed to encode preprocessed style image")
    return {
        "png": bytes(encoded),
        "width": int(binary.shape[1]),
        "height": int(binary.shape[0]),
        "strokePx": stroke_px,
        "strokeRatio": stroke_ratio,
        "boxes": boxes,
    }


def _segment_char_boxes(binary) -> list[dict[str, int]]:
    cv2, np = _cv2()
    ink = (binary < 128).astype(np.uint8) * 255
    contours, _ = cv2.findContours(ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = binary.shape[:2]
    min_area = max(24, (h * w) // 800)
    boxes: list[dict[str, int]] = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw * bh < min_area:
            continue
        if bw < 4 or bh < 8:
            continue
        boxes.append({"x": int(x), "y": int(y), "w": int(bw), "h": int(bh)})
    boxes.sort(key=lambda b: (b["y"] // max(1, h // 8), b["x"]))
    return boxes[:128]


def png_bytes_from_array(arr) -> bytes:
    cv2, _ = _cv2()
    ok, encoded = cv2.imencode(".png", arr)
    if not ok:
        raise RuntimeError("png encode failed")
    return bytes(encoded)


def fetch_image_bytes(url: str) -> bytes:
    """Download https / data URL / local API upload path bytes."""
    from services.assets import _fetch_bytes  # reuse asset fetcher

    data, _ = _fetch_bytes(url)
    return data
