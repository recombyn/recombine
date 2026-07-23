"""Ensure Plaza documents contain a 「封面」 artboard sized for list cards."""

from __future__ import annotations

import copy
from typing import Any

from services.plaza.cover import COVER_FRAME_NAME, find_cover_frame

# Matches plaza card slot (~full-width × 170px) — landscape ~16:9.
COVER_W = 680.0
COVER_H = 385.0


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def ensure_cover_artboard(
    document: dict[str, Any],
    *,
    title: str = "",
) -> dict[str, Any]:
    """
    If document lacks 「封面」, append one with list-card aspect ratio and
    a simple brand plate (shape + title). Existing covers are left as-is.
    """
    if not isinstance(document, dict):
        return document
    if find_cover_frame(document):
        return document

    doc = copy.deepcopy(document)
    frames = doc.get("frames")
    if not isinstance(frames, list):
        frames = []
        doc["frames"] = frames

    max_right = 0.0
    bg = str(doc.get("backgroundColor") or "#ffffff")
    for fr in frames:
        if not isinstance(fr, dict):
            continue
        max_right = max(max_right, _num(fr.get("x")) + _num(fr.get("width")))
        if fr.get("backgroundColor"):
            bg = str(fr.get("backgroundColor"))

    cover_x = max_right + 80.0
    cover_id = "frame_cover"
    frames.append(
        {
            "id": cover_id,
            "name": COVER_FRAME_NAME,
            "x": cover_x,
            "y": 0,
            "width": COVER_W,
            "height": COVER_H,
            "backgroundColor": bg if bg not in ("", "none", "transparent") else "#f4f4f5",
        }
    )

    dsl = doc.get("deltaSetLike")
    if not isinstance(dsl, dict):
        dsl = {"ROOT": {"id": "ROOT", "children": []}}
        doc["deltaSetLike"] = dsl
    root = dsl.get("ROOT")
    if not isinstance(root, dict):
        root = {"id": "ROOT", "children": []}
        dsl["ROOT"] = root
    children = root.get("children")
    if not isinstance(children, list):
        children = []
        root["children"] = children

    plate_id = "cover_plate"
    title_id = "cover_title"
    label = (title or "Design").strip() or "Design"
    fill = "#18181b" if bg.lower() in ("#ffffff", "#fff", "white", "") else bg

    dsl[plate_id] = {
        "id": plate_id,
        "key": "shape",
        "x": cover_x,
        "y": 0,
        "z": 0,
        "width": COVER_W,
        "height": COVER_H,
        "attrs": {
            "shapeType": "rectangle",
            "fill-color": fill,
            "border-color": "transparent",
            "border-width": 0,
            "L": "false",
            "R": "false",
            "T": "false",
            "B": "false",
        },
        "children": [],
    }
    dsl[title_id] = {
        "id": title_id,
        "key": "text",
        "x": cover_x + 40,
        "y": COVER_H / 2 - 28,
        "z": 1,
        "width": COVER_W - 80,
        "height": 56,
        "attrs": {
            "DATA": label,
            "ORIGIN_DATA": label,
            "fontSize": 36,
            "fontWeight": 700,
            "color": "#ffffff",
        },
        "children": [],
    }
    if plate_id not in children:
        children.append(plate_id)
    if title_id not in children:
        children.append(title_id)

    return doc
