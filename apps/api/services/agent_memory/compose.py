"""Format memory blocks for LLM prompts."""

from __future__ import annotations

import json
from typing import Any


def compose_memory_blocks(
    *,
    medium: dict[str, Any],
    short: list[dict[str, Any]],
    long_hits: list[dict[str, Any]],
    rules: dict[str, str],
) -> str:
    parts: list[str] = []
    hint = str(rules.get("memory.task_state_hint") or "").strip()
    if hint:
        parts.append(hint)

    canvas = medium.get("canvas") if isinstance(medium.get("canvas"), dict) else {}
    last_run = medium.get("last_run") if isinstance(medium.get("last_run"), dict) else None
    referents = medium.get("referents") if isinstance(medium.get("referents"), dict) else {}
    design = medium.get("design") if isinstance(medium.get("design"), dict) else {}

    task_lines: list[str] = []
    focus = canvas.get("focus_frame_id") or canvas.get("last_agent_frame_id")
    if focus:
        task_lines.append(f"focus_frame_id: {focus}")
    if canvas.get("last_agent_frame_id"):
        task_lines.append(f"last_agent_frame_id: {canvas.get('last_agent_frame_id')}")
    frames = canvas.get("frames") if isinstance(canvas.get("frames"), list) else []
    if frames:
        try:
            slim = [
                {
                    "id": f.get("id"),
                    "name": f.get("name"),
                    "w": f.get("w"),
                    "h": f.get("h"),
                    "is_empty": f.get("is_empty"),
                }
                for f in frames[:24]
                if isinstance(f, dict) and f.get("id")
            ]
            task_lines.append(f"frames: {json.dumps(slim, ensure_ascii=False)}")
        except Exception:
            pass
    if referents:
        try:
            task_lines.append(f"referents: {json.dumps(referents, ensure_ascii=False)[:1200]}")
        except Exception:
            pass
    if design:
        try:
            task_lines.append(f"design: {json.dumps(design, ensure_ascii=False)[:800]}")
        except Exception:
            pass
    if last_run:
        lr = {
            k: last_run.get(k)
            for k in (
                "intent",
                "edit_in_place",
                "blank_artboard",
                "summary",
                "scene",
                "canvas_size",
                "critique_notes",
            )
            if last_run.get(k) is not None
        }
        if lr:
            task_lines.append(f"last_run: {json.dumps(lr, ensure_ascii=False)}")

    if task_lines:
        parts.append("[Task state]\n" + "\n".join(task_lines))

    if short:
        dial_lines: list[str] = []
        for t in short:
            role = "User" if t.get("role") == "user" else "Assistant"
            dial_lines.append(f"{role}: {t.get('text', '')}")
        parts.append("[Recent dialogue]\n" + "\n".join(dial_lines))

    if long_hits:
        long_lines = [f"- ({h.get('kind', 'note')}) {h.get('text', '')}" for h in long_hits]
        parts.append("[Long-term preferences]\n" + "\n".join(long_lines))

    empty_hint = str(rules.get("memory.empty_frame_add_shape") or "").strip()
    if empty_hint and _last_frame_empty(medium):
        parts.append(f"[Canvas hint]\n{empty_hint}")

    return "\n\n".join(parts).strip()


def _last_frame_empty(medium: dict[str, Any]) -> bool:
    canvas = medium.get("canvas") if isinstance(medium.get("canvas"), dict) else {}
    fid = canvas.get("last_agent_frame_id") or canvas.get("focus_frame_id")
    frames = canvas.get("frames") if isinstance(canvas.get("frames"), list) else []
    for f in frames:
        if isinstance(f, dict) and f.get("id") == fid:
            return bool(f.get("is_empty"))
    return False


def skill_allows_memory(skill: dict[str, Any], rules: dict[str, str]) -> bool:
    allow = str(rules.get("memory.skill_allowlist") or "req_parse,summary,chat").strip().lower()
    allowed = {x.strip() for x in allow.split(",") if x.strip()}
    key = str(skill.get("skill_key") or "").strip().lower()
    cat = str(skill.get("category") or "").strip().lower()
    name = str(skill.get("name") or "")
    if key in allowed or cat in allowed:
        return True
    if "req_parse" in allowed and (key in ("req_parse", "brief", "intent") or cat == "plan" or "需求" in name):
        return True
    if "summary" in allowed and (key in ("result_summary", "summary") or cat == "summary"):
        return True
    return False
