"""Plaza list covers — prefer active / first artboard (no dedicated 「封面」 required)."""

from __future__ import annotations

import copy
import json
from typing import Any

# Legacy name still recognized when picking a cover frame, but not required.
COVER_FRAME_NAME = "封面"


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def list_artboard_frames(document: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Valid artboards with positive size."""
    if not isinstance(document, dict):
        return []
    frames = document.get("frames")
    if not isinstance(frames, list):
        return []
    out: list[dict[str, Any]] = []
    for frame in frames:
        if not isinstance(frame, dict):
            continue
        w = max(0.0, _num(frame.get("width")))
        h = max(0.0, _num(frame.get("height")))
        if w > 0 and h > 0:
            out.append(frame)
    return out


def find_cover_frame(document: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    Frame used for Plaza list cards / publish preview.
    Prefer activeFrameId, then a board named 「封面」, then the first artboard.
    """
    frames = list_artboard_frames(document)
    if not frames or not isinstance(document, dict):
        return None

    active_id = str(document.get("activeFrameId") or "").strip()
    if active_id:
        for frame in frames:
            if str(frame.get("id") or "") == active_id:
                return frame

    for frame in frames:
        name = str(frame.get("name") or "").strip()
        if name == COVER_FRAME_NAME:
            return frame

    return frames[0]


def _node_center(node: dict[str, Any]) -> tuple[float, float]:
    x = _num(node.get("x"))
    y = _num(node.get("y"))
    w = max(0.0, _num(node.get("width")))
    h = max(0.0, _num(node.get("height")))
    return x + w / 2.0, y + h / 2.0


def _inside_frame(cx: float, cy: float, frame: dict[str, Any]) -> bool:
    fx = _num(frame.get("x"))
    fy = _num(frame.get("y"))
    fw = max(1.0, _num(frame.get("width"), 1.0))
    fh = max(1.0, _num(frame.get("height"), 1.0))
    return fx <= cx <= fx + fw and fy <= cy <= fy + fh


def validate_cover_for_publish(document: dict[str, Any] | None) -> tuple[bool, str]:
    """
    Return (ok, error_code).
    error_code: artboard_required | '' (legacy cover_required kept as alias).
    """
    if not list_artboard_frames(document):
        return False, "artboard_required"
    if not extract_cover_document(document):
        return False, "artboard_required"
    return True, ""


def extract_frame_document(
    document: dict[str, Any] | None,
    frame: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Build a lightweight single-frame document from one artboard (+ nodes inside)."""
    if not frame or not isinstance(document, dict):
        return None

    fw = max(1.0, _num(frame.get("width"), 1.0))
    fh = max(1.0, _num(frame.get("height"), 1.0))
    fx = _num(frame.get("x"))
    fy = _num(frame.get("y"))
    fid = str(frame.get("id") or "frame")

    dsl = document.get("deltaSetLike")
    if not isinstance(dsl, dict):
        dsl = {}

    children: list[str] = []
    nodes: dict[str, Any] = {}
    for key, node in dsl.items():
        if key == "ROOT" or not isinstance(node, dict):
            continue
        cx, cy = _node_center(node)
        if not _inside_frame(cx, cy, frame):
            continue
        cloned = copy.deepcopy(node)
        cloned["x"] = _num(cloned.get("x")) - fx
        cloned["y"] = _num(cloned.get("y")) - fy
        nid = str(cloned.get("id") or key)
        cloned["id"] = nid
        nodes[nid] = cloned
        children.append(nid)

    cover_frame = {
        "id": fid,
        "name": str(frame.get("name") or "").strip() or fid,
        "x": 0,
        "y": 0,
        "width": fw,
        "height": fh,
        "backgroundColor": frame.get("backgroundColor")
        or document.get("backgroundColor")
        or "#ffffff",
    }

    return {
        "width": fw,
        "height": fh,
        "backgroundColor": cover_frame["backgroundColor"],
        "backgroundFillType": "solid",
        "frames": [cover_frame],
        "activeFrameId": fid,
        "deltaSetLike": {
            "ROOT": {"id": "ROOT", "children": children},
            **nodes,
        },
    }


def extract_cover_document(document: dict[str, Any] | None) -> dict[str, Any] | None:
    """Plaza list / publish preview: active or first artboard content."""
    return extract_frame_document(document, find_cover_frame(document))


def cover_json_dumps(document: dict[str, Any] | None) -> str | None:
    """Persist list cover when the project has at least one artboard."""
    ok, _ = validate_cover_for_publish(document)
    if not ok:
        return None
    cover = extract_cover_document(document)
    if not cover:
        return None
    return json.dumps(cover, ensure_ascii=False, separators=(",", ":"))
