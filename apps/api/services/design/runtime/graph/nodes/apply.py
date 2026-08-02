"""LangGraph graph nodes."""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from langgraph.types import Command

from services.design.runtime.graph.state import AgentRunState, AgentRuntime, GraphState
from services.design.runtime.graph.support import (
    _ask_propose_user_text,
    _bump,
    _emit,
    _emit_canvas_size_from_ops,
    _emit_deferred_paint_reply,
    _ensure_propose_choice_ui,
    _hydrate_log_kwargs,
    _llm_ux_reply,
    _ops_for_log,
    _ops_have_create_frame,
    _prompt_text,
    _strip_create_frame_ops,
)
from services.design.runtime.graph.support import _goto_cmd
from services.design.runtime.graph.support import _commit
from services.design.runtime.graph.support import _persist_progress


async def _node_apply_confirm(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops, op_errors = _validate_ops_payload(
        rt.apply_ops, nodes=rt.scene_nodes, frames=rt.scene_frames, rules=rt.rules
    )
    if not step_ops:
        err = validation_failure_reason(op_errors) if op_errors else "missing_tool_ops"
        st.note_error(err)
        msg = await _llm_ux_reply(
            rt,
            situation=(
                "The confirmed plan could not be applied safely; ask the user "
                "to rephrase or try again."
            ),
            facts=f"error={err[:120]}",
        )
        if msg:
            st.reply = msg
            _emit({"type": "token", "text": msg})
        rt.terminal = True
        return Command(update=_bump(rt), goto="__settle__")

    from services.design.ops.image_hydrate import (
        _hydrate_tool_ops_images,
        _image_model_from_rules,
    )

    # Size / shimmer before hydrate so the plate is visible while images generate.
    if _ops_have_create_frame(step_ops):
        _emit_canvas_size_from_ops(rt, step_ops)
    step_ops, n_img = await _hydrate_tool_ops_images(
        step_ops, limit=6, policy="auto", rules=rt.rules
    )
    img_mid = _image_model_from_rules(rt.rules) if n_img else ""
    if n_img and img_mid:
        st.note_images(img_mid, int(n_img))
        st.push_log(**_hydrate_log_kwargs(step_ops, img_mid=img_mid, n_img=n_img))
    paint_ops = list(step_ops)
    if _ops_have_create_frame(step_ops):
        paint_ops = _strip_create_frame_ops(step_ops)
    _emit(
        {
            "type": "tool_ops",
            "index": 0,
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "schema_version": TOOL_OPS_SCHEMA_VERSION,
            "ops": tool_ops_for_sse(paint_ops)
        }
    )
    for act in _tool_ops_activity_events(
        batch=paint_ops,
        totals={"created": 0, "updated": 0, "deleted": 0},
        skill_index=0,
    ):
        _emit(act)
    st.applied_ops.extend(step_ops)
    st.painted = True
    st.intent = "edit"
    reply = await _llm_ux_reply(
        rt,
        situation=(
            "User confirmed a previously proposed canvas plan; ops were just "
            "applied successfully. Confirm briefly."
        ),
        facts=f"applied_ops={len(step_ops)}",
    )
    if reply:
        st.reply = reply
        _emit({"type": "token", "text": reply})
    st.push_log(
        phase="action",
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_count=len(step_ops),
        ops_detail=_ops_for_log(step_ops),
        apply_confirm=True,
        model=st.family or None,
        reply=(st.reply or "")[:500] or None,
        **({"image_model": img_mid, "images_hydrated": int(n_img)} if n_img and img_mid else {}),
    )
    rt.paint_ops = paint_ops
    rt.step_ops = step_ops
    rt.skip_loop = True
    await begin_wait(st.task_id, round_n=0)
    _emit(
        {
            "type": "scene_feedback_request",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "round": 0,
            "timeout_ms": int(_SCENE_WAIT_SEC * 1000),
        }
    )
    return Command(update=_bump(rt), goto="observe")


async def _node_propose(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops = rt.step_ops
    round_i = st.round
    from services.design.ops.tool_ops_contract import tool_ops_batch_detail

    st.proposed_ops = tool_ops_for_sse(step_ops)
    ui = _ensure_propose_choice_ui(st)
    apply_label = st.apply_choice or next(
        (
            str(o.get("label") or "")
            for o in (ui.get("options") or [])
            if str(o.get("action") or "") == "apply"
        ),
        "",
    )
    detail = (tool_ops_batch_detail(step_ops) or "").strip()
    # Confirm copy is LLM-written; do not reuse paint-stage wording (may claim applied).
    propose_situation = _prompt_text(
        rt.rules, "agent.prompt.ask_propose_situation"
    ).strip()
    if not propose_situation:
        raise RuntimeError(
            "missing prompt pack: agent.prompt.ask_propose_situation "
            "(Admin → 提示词包 / design_prompt_packs_seed)"
        )
    text = await _llm_ux_reply(
        rt,
        situation=propose_situation,
        facts=(detail[:160] if detail else "propose_ops=1"),
    )
    if not text:
        text = _ask_propose_user_text(
            model_reply=(rt.turn.get("reply") or st.reply or "").strip(),
            detail=detail,
        )
    if text:
        st.reply = text
    st.push_log(
        phase="propose",
        ops_count=len(step_ops),
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_detail=_ops_for_log(step_ops),
        tokens=rt.last_used,
        model=st.family,
        proposed=True,
        intent=st.intent,
        reply=(st.reply or "")[:2000] or None,
        summary=('提议确认：' + (apply_label or f"{len(step_ops)} ops"))[:120],
        **({"choices": list(st.choices)[:6]} if st.choices else {}),
        **({"apply_choice": st.apply_choice} if st.apply_choice else {}),
        **({"choice_ui": st.choice_ui} if st.choice_ui else {}),
    )
    if text:
        _emit({"type": "token", "text": text})
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": rt.last_used
        }
    )
    rt.terminal = True
    rt.flags["await_confirm"] = True
    return Command(update=_bump(rt), goto="__settle__")


async def _node_action(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops = rt.step_ops
    round_i = st.round
    from services.design.ops.image_hydrate import (
        _hydrate_tool_ops_images,
        _image_model_from_rules,
    )

    # Safety net: size/shimmer before hydrate (paint_ops usually already did this).
    if _ops_have_create_frame(step_ops):
        _emit_canvas_size_from_ops(rt, step_ops)
    step_ops, n_img = await _hydrate_tool_ops_images(
        step_ops, limit=6, policy="auto", rules=rt.rules
    )
    rt.step_ops = step_ops
    img_mid = _image_model_from_rules(rt.rules) if n_img else ""
    if n_img and img_mid:
        st.note_images(img_mid, int(n_img))
        st.push_log(**_hydrate_log_kwargs(step_ops, img_mid=img_mid, n_img=n_img))
    paint_ops = list(step_ops)
    if _ops_have_create_frame(step_ops):
        paint_ops = _strip_create_frame_ops(step_ops)
    rt.paint_ops = paint_ops
    _emit(
        {
            "type": "tool_ops",
            "index": round_i,
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "schema_version": TOOL_OPS_SCHEMA_VERSION,
            "ops": tool_ops_for_sse(paint_ops)
        }
    )
    for act in _tool_ops_activity_events(
        batch=paint_ops,
        totals={"created": 0, "updated": 0, "deleted": 0},
        skill_index=round_i,
    ):
        _emit(act)
    ops_sent = bool(paint_ops)
    # Reply only after real ops were pushed — never claim「已添加」with empty ops.
    _emit_deferred_paint_reply(st, ops_sent=ops_sent)
    if ops_sent:
        st.applied_ops.extend(step_ops)
        # Tentative until observe confirms op_results — cleared if all ops failed.
        st.painted = True
    else:
        st.painted = False
        st.reply = ""
    st.push_log(
        phase="action",
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_count=len(step_ops),
        ops_detail=_ops_for_log(step_ops),
        tokens=rt.last_used,
        model=st.family,
        **({"image_model": img_mid, "images_hydrated": int(n_img)} if n_img and img_mid else {}),
    )
    if not ops_sent:
        return Command(update=_bump(rt), goto="__settle__")
    # Wait for FE scene_feedback (nodes + per-op ok/fail) before settle / retry.
    await begin_wait(st.task_id, round_n=round_i)
    _emit(
        {
            "type": "scene_feedback_request",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "round": round_i,
            "timeout_ms": int(_SCENE_WAIT_SEC * 1000),
        }
    )
    return Command(update=_bump(rt), goto="observe")

