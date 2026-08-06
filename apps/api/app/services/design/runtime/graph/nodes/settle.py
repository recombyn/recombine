from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import logging

from langgraph.graph import END
from langgraph.types import Command

from app.services.design.admin.task_store import _update_task
from app.services.design.prompts.prompt_build import _finalize_memory_patch
from app.services.design.prompts.rules_text import exec_trace
from app.services.design.runtime.graph.state import AgentRunState, AgentRuntime, GraphState
from app.services.design.runtime.graph.support import (
    _bump,
    _commit,
    _emit,
    _goto_cmd,
    _is_canvas_work_intent,
    _persist_progress,
    _persist_task_meta,
    _resolve_paint_want,
)
from app.services.design.runtime.models_route import CANVAS_WORK_INTENTS, normalize_user_intent
from app.services.wallet.db import get_user_tokens

_log = logging.getLogger(__name__)


async def _node_settle(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    # Lazy import — build.py imports nodes; avoid cycle.
    from app.services.design.runtime.graph.build import _design_settle_hold_fn
    from app.services.design.admin.task_store import (
        get_design_task,
        get_run_lifecycle,
        merge_task_meta,
        parse_task_meta,
        build_run_lifecycle,
    )
    from app.services.design.runtime.graph.build import _design_thread_id

    prior = await asyncio.to_thread(get_design_task, st.task_id)
    prior_charged = int((prior or {}).get("charged_credits") or 0)
    prior_lc = get_run_lifecycle(parse_task_meta((prior or {}).get("meta_json")))
    already_settled = prior_charged > 0 or bool(prior_lc.get("settled"))

    if already_settled:
        spend = prior_charged
        _log.debug("settle idempotent skip task=%s charged=%s", st.task_id, spend)
    else:
        spend = await asyncio.to_thread(
            _design_settle_hold_fn(rt),
            rt.user_id,
            hold=rt.hold,
            actual_tokens=st.total_tokens,
            detail=f"design_settle:{rt.mode}:{st.task_id}",
            rules=rt.rules,
            free_daily=rt.free_daily,
            images_hydrated=st.images_hydrated,
        )
    has_proposal = bool(st.proposed_ops)
    settle_intent = (
        normalize_user_intent(rt.classified_intent)
        if rt.classified_intent
        else (st.intent if st.intent in ("edit", "create", "chat") else "chat")
    )
    settle_lane = (
        _resolve_paint_want(rt)
        if settle_intent in CANVAS_WORK_INTENTS
        else None
    )
    rt.decision.apply(
        intent=settle_intent,
        paint_lane=settle_lane or None,
        tool_ops_applied=st.painted,
        edit_in_place=bool(rt.scene_nodes) and settle_lane == "edit",
        is_chitchat=not st.painted
        and not has_proposal
        and st.intent in ("chat", "ask", "done"),
        route=(
            f"agent_graph:v{rt.flow_version}"
            if st.painted
            else (
                f"agent_graph_ask:v{rt.flow_version}"
                if has_proposal
                else f"agent_graph_chat:v{rt.flow_version}"
            )
        ),
    )
    failed_attempt = bool(st.errors) and not st.painted and not has_proposal
    settle_status = "error" if failed_attempt else "success"
    await asyncio.to_thread(_persist_task_meta, st.task_id, decision=rt.decision, state=st)
    await asyncio.to_thread(
        merge_task_meta,
        st.task_id,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=_design_thread_id(st.task_id),
                resumable=False,
                interrupt_kind=None,
                settled=True,
            )
        },
    )
    await asyncio.to_thread(
        _update_task,
        st.task_id,
        status=settle_status,
        charged_credits=spend,
        total_tokens=st.total_tokens,
        result_svg="",
    )
    exec_payload = st.to_execution_log()
    balance = await asyncio.to_thread(get_user_tokens, rt.user_id)
    _emit({"type": "execution_log", **exec_payload})
    fail_summary = ""
    if failed_attempt and st.errors:
        fail_summary = str(st.errors[-1])[:240]
    _emit(
        {
            "type": "result",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "status": settle_status,
            "svg": "",
            "summary": (st.reply[:500] if st.reply else "") or fail_summary,
            "charged_credits": spend,
            "total_tokens": st.total_tokens,
            "tool_ops_applied": st.painted,
            "intent": rt.decision.intent,
            "edit_in_place": rt.decision.edit_in_place,
            **({"choices": st.choices} if st.choices else {}),
            **({"proposed_ops": st.proposed_ops} if st.proposed_ops else {}),
            **({"proposal_id": st.proposal_id} if st.proposal_id else {}),
            **({"apply_choice": st.apply_choice} if st.apply_choice else {}),
            **({"choice_ui": st.choice_ui} if st.choice_ui else {}),
            **({"errors": list(st.errors)[-5:]} if failed_attempt else {}),
            "balance": balance,
            "decision_log": rt.decision.to_log(),
            "execution_log": exec_payload
        }
    )
    try:
        from app.services.agent_memory.episodes import maybe_write_episode

        failed_attempt = bool(st.errors) and not st.painted
        await asyncio.to_thread(
            maybe_write_episode,
            user_id=rt.user_id,
            session_id=rt.session_id,
            project_id=rt.project_id,
            task_id=st.task_id,
            scene=rt.scene_key or "",
            goal=rt.prompt,
            summary=(st.reply or st.reflect_note or "")[:400],
            applied_ops=list(st.applied_ops),
            observe={
                "ops_applied": st.painted,
                "route": "langgraph",
                "trace_id": st.trace_id,
                "errors": list(st.errors),
                "rounds": st.round + 1
            },
            outcome="failed" if failed_attempt else "success",
            chat_only=not st.painted and not failed_attempt,
            tool_ops_applied=st.painted,
            has_reflexion_errors=bool(st.errors),
            rules=rt.rules,
        )
    except Exception:
        _log.exception("episode write failed task=%s", st.task_id)

    if rt.session_id:
        patch = await asyncio.to_thread(
            _finalize_memory_patch,
            user_id=rt.user_id,
            session_id=rt.session_id,
            project_id=rt.project_id,
            medium=rt.mem_medium,
            task_id=st.task_id,
            intent=(
                normalize_user_intent(rt.classified_intent)
                if rt.classified_intent
                else (st.intent if _is_canvas_work_intent(st.intent) else "chat")
            ),
            edit_in_place=bool(rt.scene_nodes)
            and _resolve_paint_want(rt) == "edit",
            blank_artboard=False,
            summary=st.reply[:400],
            tool_ops_applied=st.painted,
            critique_notes="; ".join(st.errors[-3:]) if st.errors else None,
            scene_key=rt.scene_key,
            canvas_size=f"{rt.w}x{rt.h}" if rt.w and rt.h else (rt.canvas_size or ""),
            user_prompt=rt.prompt,
            assistant_reply=st.reply,
            short_turns=list(rt.mem_short_all or rt.mem_short or []),
            rules=rt.rules,
            await_user=bool(rt.flags.get("await_user") or has_proposal),
        )
        _emit({"type": "memory_patch", **patch})
    if not st.painted and not st.proposed_ops:
        _emit({"type": "chat_done"})
    exec_trace(
        rt.t0,
        "DONE",
        mode="langgraph",
        tokens=st.total_tokens,
        ops=len(st.applied_ops),
        intent=st.intent,
        errors=len(st.errors),
        trace_id=st.trace_id,
    )
    return Command(update=_bump(rt), goto=END)

