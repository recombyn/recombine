"""Agent memory contracts — task state, short-term turns, patches."""

from __future__ import annotations

import copy
from typing import Any

TASK_STATE_VERSION = 1


def empty_task_state(
    *,
    session_id: str = "",
    project_id: str = "",
    user_id: str = "",
) -> dict[str, Any]:
    return {
        "v": TASK_STATE_VERSION,
        "session_id": session_id,
        "project_id": project_id,
        "user_id": user_id,
        "config": {},
        "canvas": {
            "focus_frame_id": None,
            "last_agent_frame_id": None,
            "frames": [],
        },
        "design": {},
        "last_run": None,
        "referents": {},
    }


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base) if base else {}
    for key, val in (patch or {}).items():
        if val is None:
            continue
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], val)
        else:
            out[key] = copy.deepcopy(val)
    return out


def normalize_task_state(raw: Any, *, session_id: str = "", project_id: str = "", user_id: str = "") -> dict[str, Any]:
    base = empty_task_state(session_id=session_id, project_id=project_id, user_id=user_id)
    if not isinstance(raw, dict):
        return base
    merged = deep_merge(base, raw)
    merged["v"] = TASK_STATE_VERSION
    if session_id:
        merged["session_id"] = session_id
    if project_id:
        merged["project_id"] = project_id
    if user_id:
        merged["user_id"] = user_id
    canvas = merged.get("canvas")
    if not isinstance(canvas, dict):
        merged["canvas"] = base["canvas"]
    else:
        for k in ("focus_frame_id", "last_agent_frame_id"):
            if canvas.get(k) == "":
                canvas[k] = None
    return merged


def trim_short_turn(turn: dict[str, Any]) -> dict[str, Any] | None:
    role = str(turn.get("role") or "").strip().lower()
    if role not in ("user", "assistant"):
        return None
    text = str(turn.get("text") or turn.get("content") or "").strip()
    if not text:
        return None
    if re_looks_like_markup(text):
        return None
    text = text[:2800]
    out: dict[str, Any] = {"role": role, "text": text}
    tags = turn.get("tags")
    if isinstance(tags, list) and tags:
        out["tags"] = [str(t) for t in tags[:8]]
    return out


def re_looks_like_markup(text: str) -> bool:
    import re

    return bool(re.search(r"<svg\b|</svg>|\{\s*\"tool_ops\"|\"ops\"\s*:", text, flags=re.I))
