"""Design job orchestrator — Cursor-style tool-first agent loop (no skill pipeline).

SSE contract kept compatible with the web client:
  status | decision | skill_start | skill_progress | skill_done | analysis |
  thinking | tool_ops | activity | scene_feedback_request | result |
  memory_patch | token | chat_done | error
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from services.agent_memory.service import memory_service
from services.design.agent_loop import run_agent_turns
from services.design.canvas_scene import (
    align_canvas_size_to_scene as _align_canvas_size_to_scene,
    early_status_canvas_fields as _early_status_canvas_fields,
    explicit_canvas_size as _explicit_canvas_size,
    parse_size as _parse_size,
    resolve_agent_scene as _resolve_agent_scene,
    scene_key as _scene_key,
)
from services.design.catalog import get_flow, get_global_rules
from services.design.decision_log import (
    DesignRunDecision,
    focus_frame_from_medium,
    probe_has_target_chip,
)
from services.design.library_store import get_library_item
from services.design.llm_step import stream_skill_step
from services.design.models_route import (
    apply_user_route_overrides,
    resolve_model_for_skill,
)
from services.design.pipeline_support import (
    _illustration_policy,
    _illustration_system_note,
    _normalize_ref_images,
    _precheck_block,
)
from services.design.prompt_build import (
    _apply_prompt_pattern,
    _edit_context_block,
    _finalize_memory_patch,
    _format_style_contract,
    _format_template_brief,
    merge_design_rules,
)
from services.design.rules_text import _as_text, _rule_text, _stage
from services.design.task_store import _insert_task, _lock_layers, _update_task
from services.design.tool_ops_contract import (
    TOOL_OPS_SCHEMA_VERSION,
    extract_and_validate_tool_ops,
    format_canvas_tools_for_model,
    tool_ops_activity_events as _tool_ops_activity_events,
    tool_ops_for_sse,
    validation_failure_reason,
)
from services.wallet.billing import settle_token_hold
from services.wallet.db import credit_tokens, get_user_tokens, spend_tokens

_log = logging.getLogger(__name__)

AGENT_HOLD = 20
CHAT_HOLD = 1
PARTIAL_HOLD = 5
SINGLE_HOLD = 8


def _resolve_scene_frames(
    scene_frames: list[dict[str, Any]] | None,
    medium: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Prefer FE snapshot; fall back to task_state memory frames."""
    if scene_frames:
        return [
            dict(f)
            for f in scene_frames
            if isinstance(f, dict) and f.get("id")
        ][:32]
    canvas = medium.get("canvas") if isinstance(medium, dict) and isinstance(medium.get("canvas"), dict) else {}
    frames = canvas.get("frames") if isinstance(canvas.get("frames"), list) else []
    return [
        dict(f) for f in frames if isinstance(f, dict) and f.get("id")
    ][:32]


async def run_design_job(
    *,
    user_id: str,
    run_mode: str,
    prompt: str,
    scene: str | None = None,
    style_group_id: int | None = None,
    style_pack_id: int | None = None,
    template_id: int | None = None,
    prompt_pattern_id: int | None = None,
    user_selected_model: str | None = "auto",
    canvas_id: str | None = None,
    canvas_size: str | None = None,
    target_layer_id: str | None = None,
    layer_ids: list[str] | None = None,
    current_svg: str | None = None,
    scene_nodes: list[dict[str, Any]] | None = None,
    scene_frames: list[dict[str, Any]] | None = None,
    focus_frame_id: str | None = None,
    images: list[str] | None = None,
    is_premium: bool = False,
    session_id: str | None = None,
    project_id: str | None = None,
    memory: dict[str, Any] | None = None,
    route_overrides: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Tool-first agent loop. No classifier + fixed skill_ids pipeline."""
    del is_premium  # reserved
    mode = _as_text(run_mode or "agent").strip().lower()
    if mode not in ("agent", "single_model", "partial"):
        yield {"type": "error", "message": "invalid_run_mode"}
        return

    prompt = _as_text(prompt).strip()
    if not prompt:
        yield {"type": "error", "message": "prompt_required"}
        return

    t0 = time.time()
    _stage(t0, "BEGIN", prompt=prompt[:80], model=user_selected_model, canvas=canvas_size)
    await asyncio.sleep(0)

    rules = apply_user_route_overrides(get_global_rules(), route_overrides)
    ref_images = _normalize_ref_images(images)
    sid = _as_text(session_id).strip()
    pid = _as_text(project_id or canvas_id).strip() or "__none__"
    mem_bundle = memory_service.load(
        user_id=user_id,
        session_id=sid,
        project_id=pid,
        memory_in=memory,
        rules=rules,
    )
    trace_id = str(uuid.uuid4())
    has_target = probe_has_target_chip(prompt)
    scene_nodes_gate = [
        n for n in (scene_nodes or []) if isinstance(n, dict) and n.get("id")
    ][:120]
    scene_frames_gate = _resolve_scene_frames(scene_frames, mem_bundle.medium)
    focus_id = (
        _as_text(focus_frame_id).strip()
        or focus_frame_from_medium(mem_bundle.medium)
    )
    _log.info(
        "[design.run] inventory canvas_id=%r focus=%r svg_chars=%s "
        "nodes=%s frames=%s frame_detail=%s "
        "(canvas_id is project scope only — backend cannot load document by id; "
        "elements only from scene_nodes/scene_frames body)",
        _as_text(canvas_id).strip() or None,
        focus_id or None,
        len((current_svg or "").strip()),
        len(scene_nodes_gate),
        len(scene_frames_gate),
        [
            {
                "id": str(f.get("id") or ""),
                "name": f.get("name"),
                "is_empty": f.get("is_empty"),
                "w": f.get("w") or f.get("width"),
                "h": f.get("h") or f.get("height"),
            }
            for f in scene_frames_gate[:8]
        ],
    )
    has_focus = bool(focus_id)
    has_canvas_gate = bool(
        (current_svg or "").strip() or scene_nodes_gate or has_focus
    )

    decision = DesignRunDecision(
        trace_id=trace_id,
        session_id=sid or None,
        focus_frame_id=focus_id,
        memory_injected=bool(mem_bundle.blocks),
        memory_blocks_chars=len(mem_bundle.blocks or ""),
        short_turns=len(mem_bundle.short),
        content_pack_version=_rule_text(rules, "content_pack_version") or None,
        probe_len=len(prompt),
        has_target_chip=has_target,
        has_ref_images=bool(ref_images),
        has_scene_nodes=bool(scene_nodes_gate),
        wants_pipeline=False,
        blank_artboard_only=False,
        intent=None,
        is_chitchat=False,
    )

    # Partial: single lean tool_ops turn (layer lock).
    if mode == "partial":
        async for ev in _run_partial(
            user_id=user_id,
            prompt=prompt,
            rules=rules,
            user_selected_model=user_selected_model,
            canvas_id=canvas_id,
            canvas_size=canvas_size,
            target_layer_id=target_layer_id,
            layer_ids=layer_ids,
            current_svg=current_svg or "",
            scene_nodes=scene_nodes_gate,
            scene=scene,
            ref_images=ref_images,
            mem_bundle=mem_bundle,
            sid=sid,
            pid=pid,
            decision=decision,
            t0=t0,
        ):
            yield ev
        return

    hold = AGENT_HOLD if mode == "agent" else SINGLE_HOLD
    bal = get_user_tokens(user_id)
    if bal < hold:
        yield decision.apply(route="error").to_event()
        yield {
            "type": "error",
            "message": "insufficient_credits",
            "balance": bal,
            "need": hold,
        }
        return
    try:
        spend_tokens(user_id, hold, detail=f"design_hold:{mode}")
    except ValueError:
        yield decision.apply(route="error").to_event()
        yield {"type": "error", "message": "insufficient_credits"}
        return

    task_id = str(uuid.uuid4())
    try:
        scene_key, scene_overridden = _resolve_agent_scene(
            scene,
            prompt,
            canvas_size,
            medium=mem_bundle.medium if isinstance(mem_bundle.medium, dict) else None,
        )
        canvas_size = _align_canvas_size_to_scene(
            canvas_size, scene_key=scene_key, overridden=scene_overridden
        )
        if scene_key not in ("website", "mobile", "image", "poster"):
            credit_tokens(user_id, hold, detail=f"design_refund:{task_id}")
            yield {"type": "error", "message": "invalid_scene"}
            return

        rules = apply_user_route_overrides(
            merge_design_rules(get_global_rules(), scene_key),
            route_overrides,
        )
        style_contract = ""
        template_brief = ""
        style_pack = get_library_item(int(style_pack_id)) if style_pack_id else None
        if style_pack and style_pack.get("kind") == "style" and style_pack.get("enabled"):
            style_contract = _format_style_contract(
                style_pack.get("meta"), style_pack.get("name")
            )
        template_item = get_library_item(int(template_id)) if template_id else None
        if (
            template_item
            and template_item.get("kind") == "template"
            and template_item.get("enabled")
        ):
            template_brief = _format_template_brief(
                template_item.get("meta"), template_item.get("name")
            )
            meta_c = (
                (template_item.get("meta") or {}).get("canvas")
                if isinstance(template_item.get("meta"), dict)
                else None
            )
            if meta_c and not _as_text(canvas_size).strip():
                canvas_size = str(meta_c)
        prompt_item = (
            get_library_item(int(prompt_pattern_id)) if prompt_pattern_id else None
        )
        if (
            prompt_item
            and prompt_item.get("kind") == "prompt"
            and prompt_item.get("enabled")
        ):
            prompt = _apply_prompt_pattern(prompt, prompt_item.get("meta"))

        w, h = _parse_size(canvas_size, scene_key, rules)
        if w <= 0 or h <= 0:
            w, h = 1280, 720

        _insert_task(
            {
                "id": task_id,
                "user_id": user_id,
                "canvas_id": canvas_id,
                "scene": scene_key,
                "skill_group_id": style_group_id,
                "task_type": mode,
                "user_selected_model": user_selected_model,
                "actual_models": "[]",
                "target_layer_id": target_layer_id,
                "current_skill_index": 0,
                "status": "running",
                "hold_credits": hold,
                "charged_credits": 0,
                "total_tokens": 0,
                "prompt": prompt,
                "canvas_size": canvas_size or f"{w}x{h}",
                "result_svg": None,
                "error_message": None,
                "meta_json": json.dumps(
                    {"trace_id": trace_id, "control": "agent_loop"},
                    ensure_ascii=False,
                ),
                "created_at": time.time(),
                "updated_at": time.time(),
            }
        )

        yield decision.apply(
            route="agent_loop",
            fast_path=False,
            intent=None,
            edit_in_place=has_canvas_gate,
            tool_ops_applied=False,
            task_id=task_id,
            scene=scene_key,
        ).to_event()

        client_size_locked = _explicit_canvas_size(canvas_size)
        client_canvas_raw = _as_text(canvas_size).strip() or None
        early = _early_status_canvas_fields(
            w=w,
            h=h,
            client_size_locked=client_size_locked,
            client_canvas_raw=client_canvas_raw,
        )
        yield {
            "type": "status",
            "task_id": task_id,
            "status": "running",
            "hold_credits": hold,
            "trace_id": trace_id,
            "edit_in_place": has_canvas_gate,
            "scene": scene_key,
            **early,
        }

        prefer_skill_ids: list[int] = []
        flow = get_flow(scene_key)
        if flow and flow.get("enabled") and flow.get("skill_ids"):
            for x in flow["skill_ids"]:
                try:
                    prefer_skill_ids.append(int(x))
                except (TypeError, ValueError):
                    continue

        meta: dict[str, Any] | None = None
        async for ev in run_agent_turns(
            prompt=prompt,
            rules=rules,
            scene_key=scene_key,
            w=w,
            h=h,
            scene_nodes=scene_nodes_gate,
            scene_frames=scene_frames_gate,
            canvas_id=_as_text(canvas_id).strip(),
            focus_frame_id=focus_id,
            current_svg=current_svg or "",
            user_selected_model=user_selected_model,
            ref_images=ref_images,
            mem_blocks=mem_bundle.blocks or "",
            style_contract=style_contract,
            template_brief=template_brief,
            illus_note=_illustration_system_note(
                _illustration_policy(user_selected_model, mode)
            )
            or "",
            task_id=task_id,
            enable_scene_feedback=True,
            prefer_skill_ids=prefer_skill_ids or None,
        ):
            if ev.get("type") == "_agent_loop_meta":
                meta = ev
                continue
            yield ev

        if not meta:
            meta = {
                "total_tokens": 1,
                "actual_models": [],
                "applied_ops": [],
                "tool_ops_applied": False,
                "summary": "",
                "chat_only": True,
            }

        total_tokens = int(meta.get("total_tokens") or 1)
        actual_models = list(meta.get("actual_models") or [])
        tool_ops_applied = bool(meta.get("tool_ops_applied"))
        summary = str(meta.get("summary") or "").strip()
        choices = [
            str(c).strip()
            for c in (meta.get("choices") or [])
            if str(c or "").strip()
        ][:6]
        chat_only = bool(meta.get("chat_only")) and not tool_ops_applied

        # No canvas ops → chat path (settle on real tokens; empty reply still chat_done).
        if chat_only:
            spend_confirm = settle_token_hold(
                user_id,
                hold=hold,
                actual_tokens=max(1, total_tokens),
                detail=f"design_settle:agent_chat:{task_id}",
                rules=rules,
            )
            # Prefer reply as chat tokens; empty → short fallback so FE clears process chrome.
            face = summary or _rule_text(rules, "summary.fallback_chat").strip() or "OK"
            for i in range(0, len(face), 24):
                yield {"type": "token", "text": face[i : i + 24]}
            yield {"type": "chat_done"}
            decision_log = decision.apply(
                route="agent_loop_chat",
                fast_path=True,
                intent="chat",
                is_chitchat=True,
                wants_pipeline=False,
                tool_ops_applied=False,
                task_id=task_id,
                scene=scene_key,
            ).to_log()
            _update_task(
                task_id,
                status="success",
                charged_credits=spend_confirm,
                total_tokens=total_tokens,
                actual_models=json.dumps(actual_models, ensure_ascii=False),
                result_svg="",
                meta_json=json.dumps(
                    {
                        "trace_id": trace_id,
                        "intent": "chat",
                        "control": "agent_loop",
                        "decision_log": decision_log,
                    },
                    ensure_ascii=False,
                ),
            )
            yield {
                "type": "result",
                "task_id": task_id,
                "status": "success",
                "svg": "",
                "charged_credits": spend_confirm,
                "total_tokens": total_tokens,
                "actual_models": actual_models,
                "summary": summary or None,
                "choices": choices or None,
                "scene": scene_key,
                "canvas_width": w,
                "canvas_height": h,
                "canvas_size": f"{w}x{h}",
                "tool_ops_applied": False,
                "intent": "chat",
                "edit_in_place": False,
                "decision_log": decision_log,
            }
            if sid:
                yield {
                    "type": "memory_patch",
                    **_finalize_memory_patch(
                        user_id=user_id,
                        session_id=sid,
                        project_id=pid,
                        medium=mem_bundle.medium,
                        task_id=task_id,
                        intent="chat",
                        edit_in_place=False,
                        blank_artboard=False,
                        summary=summary or "",
                        tool_ops_applied=False,
                        critique_notes=None,
                        scene_key=scene_key,
                        canvas_size=f"{w}x{h}",
                    ),
                }
            _stage(t0, "agent_loop chat done", tokens=total_tokens)
            return

        spend_confirm = settle_token_hold(
            user_id,
            hold=hold,
            actual_tokens=total_tokens,
            detail=f"design_settle:agent_loop:{task_id}",
            rules=rules,
        )
        decision_log = decision.apply(
            route="agent_loop",
            fast_path=False,
            intent="edit" if has_canvas_gate else "create",
            edit_in_place=has_canvas_gate,
            tool_ops_applied=tool_ops_applied,
            task_id=task_id,
            scene=scene_key,
        ).to_log()
        _update_task(
            task_id,
            status="success",
            charged_credits=spend_confirm,
            total_tokens=total_tokens,
            actual_models=json.dumps(actual_models, ensure_ascii=False),
            result_svg="",
            meta_json=json.dumps(
                {
                    "trace_id": trace_id,
                    "control": "agent_loop",
                    "tool_ops_applied": tool_ops_applied,
                    "decision_log": decision_log,
                },
                ensure_ascii=False,
            ),
        )
        yield {
            "type": "result",
            "task_id": task_id,
            "status": "success",
            "svg": "",
            "charged_credits": spend_confirm,
            "total_tokens": total_tokens,
            "actual_models": actual_models,
            "summary": summary or None,
            "choices": choices or None,
            "scene": scene_key,
            "canvas_width": w,
            "canvas_height": h,
            "canvas_size": f"{w}x{h}",
            "tool_ops_applied": tool_ops_applied,
            "intent": "edit" if has_canvas_gate else "create",
            "edit_in_place": has_canvas_gate,
            "decision_log": decision_log,
        }
        if sid:
            yield {
                "type": "memory_patch",
                **_finalize_memory_patch(
                    user_id=user_id,
                    session_id=sid,
                    project_id=pid,
                    medium=mem_bundle.medium,
                    task_id=task_id,
                    intent="edit" if has_canvas_gate else "create",
                    edit_in_place=has_canvas_gate,
                    blank_artboard=False,
                    summary=summary or "",
                    tool_ops_applied=tool_ops_applied,
                    critique_notes=None,
                    scene_key=scene_key,
                    canvas_size=f"{w}x{h}",
                ),
            }
        _stage(t0, "agent_loop done", ops=tool_ops_applied, tokens=total_tokens)
    except Exception as err:  # noqa: BLE001
        _log.exception("agent_loop failed task=%s", task_id)
        try:
            credit_tokens(user_id, hold, detail=f"design_refund:{task_id}")
        except Exception:
            pass
        try:
            _update_task(
                task_id,
                status="error",
                error_message=str(err)[:800],
                charged_credits=0,
            )
        except Exception:
            pass
        yield {
            "type": "error",
            "message": str(err)[:800],
            "task_id": task_id,
            "refunded_credits": hold,
        }


async def _run_partial(
    *,
    user_id: str,
    prompt: str,
    rules: dict[str, str],
    user_selected_model: str | None,
    canvas_id: str | None,
    canvas_size: str | None,
    target_layer_id: str | None,
    layer_ids: list[str] | None,
    current_svg: str,
    scene_nodes: list[dict[str, Any]],
    scene: str | None,
    ref_images: list[str],
    mem_bundle: Any,
    sid: str,
    pid: str,
    decision: DesignRunDecision,
    t0: float,
) -> AsyncIterator[dict[str, Any]]:
    hold = PARTIAL_HOLD
    bal = get_user_tokens(user_id)
    if bal < hold:
        yield {"type": "error", "message": "insufficient_credits", "balance": bal, "need": hold}
        return
    try:
        spend_tokens(user_id, hold, detail="design_hold:partial")
    except ValueError:
        yield {"type": "error", "message": "insufficient_credits"}
        return

    task_id = str(uuid.uuid4())
    scene_key = _scene_key(scene) or "website"
    w, h = _parse_size(canvas_size, scene_key, rules)
    if w <= 0 or h <= 0:
        w, h = 1280, 720
    if canvas_id and layer_ids and target_layer_id:
        _lock_layers(canvas_id, target_layer_id, layer_ids)

    _insert_task(
        {
            "id": task_id,
            "user_id": user_id,
            "canvas_id": canvas_id,
            "scene": scene_key,
            "skill_group_id": None,
            "task_type": "partial",
            "user_selected_model": user_selected_model,
            "actual_models": "[]",
            "target_layer_id": target_layer_id,
            "current_skill_index": 0,
            "status": "running",
            "hold_credits": hold,
            "charged_credits": 0,
            "total_tokens": 0,
            "prompt": prompt,
            "canvas_size": canvas_size or f"{w}x{h}",
            "result_svg": None,
            "error_message": None,
            "meta_json": json.dumps({"control": "partial_loop"}, ensure_ascii=False),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
    )

    try:
        family, reason = resolve_model_for_skill(
            skill={
                "category": "refine",
                "default_model": "doubao",
                "name": "partial",
                "skill_key": "partial",
            },
            user_selected_model=user_selected_model,
            run_mode="partial",
            prompt=prompt,
            rules=rules,
            scene=scene_key,
            attempt=0,
            has_images=bool(ref_images),
        )
        tools_block = format_canvas_tools_for_model()
        system = "\n".join(
            p
            for p in [
                "You operate the canvas with tool_ops for a targeted layer edit.",
                tools_block,
                "OUTPUT: JSON with an ops array.",
                _rule_text(rules, "edit.tool_ops"),
                f"Canvas {w}x{h}.",
            ]
            if p
        )
        user_msg = (
            f"USER_PROMPT:\n{prompt}\n\nTARGET_LAYER: {target_layer_id or '-'}\n\n"
            + _edit_context_block(
                rules,
                current_svg,
                include_full_svg=False,
                scene_nodes=scene_nodes,
            )
        )
        yield {
            "type": "skill_start",
            "index": 0,
            "skill_id": None,
            "skill_key": "partial",
            "skill_name": "partial",
            "category": "refine",
            "model": family,
            "model_reason": reason,
        }
        content = ""
        used = 0
        async for kind, piece in stream_skill_step(
            model_family=family,
            system=system,
            user=user_msg,
            max_tokens=2048,
            images=ref_images or None,
            enable_thinking=False,
        ):
            if kind == "usage":
                used = int(piece) if isinstance(piece, int) else used
                continue
            if kind == "token" and isinstance(piece, str):
                content += piece
        if used <= 0:
            used = max(1, len(content) // 3)
        step_ops, op_errors = extract_and_validate_tool_ops(
            content, scene_nodes=scene_nodes, rules=rules
        )
        if not step_ops:
            raise RuntimeError(
                validation_failure_reason(op_errors)
                if op_errors
                else "missing_tool_ops"
            )
        yield {
            "type": "tool_ops",
            "index": 0,
            "skill_key": "partial",
            "skill_name": "partial",
            "schema_version": TOOL_OPS_SCHEMA_VERSION,
            "ops": tool_ops_for_sse(step_ops),
        }
        for act in _tool_ops_activity_events(
            batch=step_ops,
            totals={"created": 0, "updated": 0, "deleted": 0},
            skill_index=0,
        ):
            yield act
        yield {
            "type": "skill_done",
            "index": 0,
            "skill_key": "partial",
            "skill_name": "partial",
            "tokens": used,
        }
        spend_confirm = settle_token_hold(
            user_id,
            hold=hold,
            actual_tokens=used,
            detail=f"design_settle:partial:{task_id}",
            rules=rules,
        )
        _update_task(
            task_id,
            status="success",
            charged_credits=spend_confirm,
            total_tokens=used,
            result_svg="",
        )
        yield {
            "type": "result",
            "task_id": task_id,
            "status": "success",
            "svg": "",
            "charged_credits": spend_confirm,
            "total_tokens": used,
            "tool_ops_applied": True,
            "intent": "edit",
            "edit_in_place": True,
        }
        if sid:
            yield {
                "type": "memory_patch",
                **_finalize_memory_patch(
                    user_id=user_id,
                    session_id=sid,
                    project_id=pid,
                    medium=mem_bundle.medium,
                    task_id=task_id,
                    intent="edit",
                    edit_in_place=True,
                    blank_artboard=False,
                    summary="",
                    tool_ops_applied=True,
                    critique_notes=None,
                    scene_key=scene_key,
                    canvas_size=f"{w}x{h}",
                ),
            }
        _stage(t0, "partial done", ops=len(step_ops))
    except Exception as err:  # noqa: BLE001
        try:
            credit_tokens(user_id, hold, detail=f"design_refund:{task_id}")
        except Exception:
            pass
        _update_task(task_id, status="error", error_message=str(err)[:800])
        yield {
            "type": "error",
            "message": str(err)[:800],
            "task_id": task_id,
            "refunded_credits": hold,
        }
