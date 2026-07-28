"""Prompt helpers used by partial tool_ops / memory patch."""

from __future__ import annotations

import json
from typing import Any

from services.agent_memory.service import memory_service
from services.design.rules_text import _as_text, _rule_text
from services.design.svg_patch import svg_content_digest


def _bg_candidate_from_nodes(nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Largest filled rect-like node — likely artboard background."""
    best: dict[str, Any] | None = None
    best_area = 0
    for n in nodes or []:
        if not isinstance(n, dict) or not n.get("id"):
            continue
        try:
            w = float(n.get("w") or n.get("width") or 0)
            h = float(n.get("h") or n.get("height") or 0)
        except (TypeError, ValueError):
            continue
        area = w * h
        if area <= best_area:
            continue
        fill = n.get("fill") or n.get("backgroundColor")
        if not fill:
            continue
        best = n
        best_area = area
    return best


def _edit_context_block(
    rules: dict[str, str],
    svg: str,
    *,
    include_full_svg: bool,
    scene_nodes: list[dict[str, Any]] | None = None,
    scene_frames: list[dict[str, Any]] | None = None,
    canvas_id: str = "",
    focus_frame_id: str = "",
) -> str:
    hint = _rule_text(rules, "edit.in_place").strip()
    digest = svg_content_digest(svg)
    parts = ["EDIT_MODE: in_place"]
    if hint:
        parts.append(hint)
    tool_ops = _rule_text(rules, "edit.tool_ops").strip()
    if tool_ops:
        parts.append(tool_ops)
    cid = (canvas_id or "").strip()
    if cid:
        parts.append(f"CANVAS_ID: {cid}")
    focus = (focus_frame_id or "").strip()
    if focus:
        parts.append(
            f"FOCUS_FRAME_ID: {focus}\n"
            "FOCUS_FRAME_ID 为权威（用户 @ 画板）。"
            "update_frame / delete_frame 必须使用此精确 id。"
            "不要按名称挑其他画板——名称可能冲突（如多个「新画板」）。"
            "绝不要改指向其他 SCENE_FRAMES id。"
        )
    if scene_frames:
        try:
            raw_frames = json.dumps(scene_frames, ensure_ascii=False)
        except Exception:
            raw_frames = "[]"
        parts.append(
            "SCENE_FRAMES（画板 id — delete_frame / create 只能用这些 id）：\n"
            f"{raw_frames[:8000]}"
        )
    if digest:
        parts.append(f"ACTUAL_CANVAS_DIGEST:\n{digest[:2400]}")
    if scene_nodes:
        try:
            raw = json.dumps(scene_nodes, ensure_ascii=False)
        except Exception:
            raw = "[]"
        parts.append(f"SCENE_NODES:\n{raw[:16000]}")
        nodes_for_bg = scene_nodes
        if focus:
            focused_nodes = [
                n
                for n in scene_nodes
                if isinstance(n, dict) and str(n.get("frameId") or "") == focus
            ]
            nodes_for_bg = focused_nodes
            if not focused_nodes:
                parts.append(
                    f"FOCUS_FRAME_ID {focus} 在 SCENE_NODES 中无节点（空画板）。"
                    f"改画板背景色请用 update_frame，frameId={focus} 且带 backgroundColor。"
                    "不要 update_node 其他画板上的 fill。"
                )
        bg = _bg_candidate_from_nodes(nodes_for_bg)
        if bg:
            parts.append(
                "BG_CANDIDATE_NODE_ID: "
                f"{bg.get('id')} (fill={bg.get('fill') or '?'}; "
                f"{bg.get('w')}x{bg.get('h')}) — "
                "改底色/背景色时必须 update_node 此 id，禁止 create_shape 叠新底。"
            )
    elif include_full_svg and (svg or "").strip():
        parts.append(f"CURRENT_SVG:\n{svg[:18000]}")
    return "\n".join(parts) + "\n"


def merge_design_rules(raw: dict[str, str], scene: str) -> dict[str, str]:
    """Merge rule layers: global base, then scene.* overlays (scene wins on same key)."""
    out = dict(raw or {})
    scene_key = (scene or "").strip().lower()
    if not scene_key:
        return out
    prefix = f"scene.{scene_key}."
    for k, v in list(raw.items()):
        if not k.startswith(prefix):
            continue
        base = k[len(prefix) :]
        if base:
            out[base] = v
    return out


def _finalize_memory_patch(
    *,
    user_id: str,
    session_id: str | None,
    project_id: str | None,
    medium: dict[str, Any],
    task_id: str,
    intent: str | None,
    edit_in_place: bool,
    blank_artboard: bool,
    summary: str,
    tool_ops_applied: bool,
    critique_notes: str | None,
    scene_key: str | None,
    canvas_size: str | None,
    canvas_frame_patch: dict[str, Any] | None = None,
    subgoals: list[str] | None = None,
    subgoals_queue: list[dict[str, Any]] | None = None,
    completed_skill_keys: list[str] | None = None,
    user_prompt: str = "",
    assistant_reply: str = "",
    short_turns: list[dict[str, Any]] | None = None,
    rules: dict[str, str] | None = None,
    design_patch: dict[str, Any] | None = None,
    await_user: bool | None = None,
) -> dict[str, Any]:
    working = dict(medium or {})
    if canvas_frame_patch:
        from services.agent_memory.schema import deep_merge

        working = deep_merge(working, {"canvas": canvas_frame_patch})
    merged_design: dict[str, Any] = dict(design_patch) if isinstance(design_patch, dict) else {}
    if isinstance(subgoals_queue, list) and subgoals_queue:
        from services.agent_memory.subgoals import design_patch_with_queue

        merged_design.update(design_patch_with_queue(subgoals_queue))
    if await_user is not None:
        merged_design["await_user"] = bool(await_user)
    patch = memory_service.build_run_patch(
        working,
        task_id=task_id,
        intent=intent,
        edit_in_place=edit_in_place,
        blank_artboard=blank_artboard,
        summary=summary,
        tool_ops_applied=tool_ops_applied,
        critique_notes=critique_notes,
        scene_key=scene_key,
        canvas_size=canvas_size,
        design_patch=merged_design or None,
        subgoals=subgoals,
        completed_skill_keys=completed_skill_keys,
        user_prompt=user_prompt,
        assistant_reply=assistant_reply or summary,
        short_turns=short_turns,
        rules=rules,
    )
    merged = patch["medium"]
    sid = _as_text(session_id).strip()
    pid = _as_text(project_id).strip() or "__none__"
    if sid:
        memory_service.persist_after_run(user_id, sid, pid, merged)
    return patch
