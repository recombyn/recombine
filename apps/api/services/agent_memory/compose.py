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
    episodes: list[dict[str, Any]] | None = None,
    kg_triples: list[dict[str, Any]] | None = None,
    dialogue: dict[str, Any] | None = None,
    include_recent_dialogue: bool = False,
) -> str:
    parts: list[str] = []
    hint = str(rules.get("memory.task_state_hint") or "").strip()
    if hint:
        parts.append(hint)

    canvas = medium.get("canvas") if isinstance(medium.get("canvas"), dict) else {}
    last_run = medium.get("last_run") if isinstance(medium.get("last_run"), dict) else None
    referents = medium.get("referents") if isinstance(medium.get("referents"), dict) else {}
    design = medium.get("design") if isinstance(medium.get("design"), dict) else {}
    dial = dialogue if isinstance(dialogue, dict) else (
        medium.get("dialogue") if isinstance(medium.get("dialogue"), dict) else {}
    )

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
            design_slim = {
                k: v for k, v in design.items() if k != "subgoals"
            }
            if design_slim:
                task_lines.append(
                    f"design: {json.dumps(design_slim, ensure_ascii=False)[:800]}"
                )
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
                "await_user",
            )
            if last_run.get(k) is not None
        }
        if lr:
            task_lines.append(f"last_run: {json.dumps(lr, ensure_ascii=False)}")

    if task_lines:
        parts.append("[Task state]\n" + "\n".join(task_lines))

    if design:
        from services.agent_memory.subgoals import format_queue_block, normalize_queue

        sg_block = format_queue_block(normalize_queue(design.get("subgoals")))
        if sg_block:
            parts.append(sg_block)

    # Optimal chat context: facts + rolling summary (+ optional recent verbatim).
    # Short-term verbatim history now lives in LangGraph checkpointer + thread_id.
    fact_lines: list[str] = []
    facts = dial.get("facts") if isinstance(dial.get("facts"), list) else []
    for f in facts[:16]:
        if not isinstance(f, dict):
            continue
        kind = str(f.get("kind") or "").strip()
        text = str(f.get("text") or "").strip()
        if kind and text:
            fact_lines.append(f"- ({kind}) {text}")
    summary = str(dial.get("summary") or "").strip()
    if fact_lines or summary:
        dial_parts: list[str] = []
        if fact_lines:
            dial_parts.append("[Dialogue facts]\n" + "\n".join(fact_lines))
        if summary:
            dial_parts.append("[Dialogue summary]\n" + summary)
        parts.append("\n\n".join(dial_parts))

    if include_recent_dialogue and short:
        dial_lines: list[str] = []
        for t in short:
            role = "User" if t.get("role") == "user" else "Assistant"
            dial_lines.append(f"{role}: {t.get('text', '')}")
        parts.append("[Recent dialogue]\n" + "\n".join(dial_lines))

    if long_hits:
        long_lines = []
        for h in long_hits:
            via = h.get("retrieve")
            score = h.get("score")
            suffix = ""
            if isinstance(score, (int, float)) and via == "embedding":
                suffix = f" sim={float(score):.2f}"
            elif via:
                suffix = f" via={via}"
            long_lines.append(
                f"- ({h.get('kind', 'note')}) {h.get('text', '')}{suffix}"
            )
        parts.append("[Long-term preferences]\n" + "\n".join(long_lines))

    if episodes:
        from services.agent_memory.episodes import format_episode_block

        ep_block = format_episode_block(episodes)
        if ep_block:
            parts.append(ep_block)

    if kg_triples:
        from services.agent_memory.kg import format_kg_block

        kg_block = format_kg_block(kg_triples)
        if kg_block:
            parts.append(kg_block)

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
