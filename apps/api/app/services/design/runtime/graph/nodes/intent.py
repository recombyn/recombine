from __future__ import annotations

import json
import time
from typing import Any

from langgraph.types import Command

from app.services.design.runtime.graph.state import AgentRuntime, GraphState
from app.services.design.runtime.graph.support import (
    _bump,
    _chat_fallback_text,
    _clip_llm_raw,
    _emit,
    _emit_design_loading_artboard,
    _goto_cmd,
)
from app.services.design.runtime.models_route import (
    classify_user_intent,
    normalize_intent_decision,
    normalize_paint_lane,
    normalize_proposal_action,
    normalize_user_intent,
    paint_ops_intent,
)


def _pending_proposal_flag(rt: AgentRuntime) -> dict[str, Any] | None:
    raw = rt.flags.get("pending_proposal")
    if not isinstance(raw, dict) or not raw.get("ops") or not raw.get("id"):
        return None
    return raw


def _release_ambient_focus_for_new_design(rt: AgentRuntime) -> None:
    """Drop ambient/memory FOCUS so Host can open a shimmer sibling and bind it.

    Flow (no user @): clear old focus → early-open reserves ``ab_*`` → that id
    becomes FOCUS_FRAME_ID / HOST_ARTBOARD for the model. Do not leave the
    previous Design board as focus or paint rewrites it.
    """
    from app.services.design.runtime.decision_log import probe_has_target_chip

    intent = normalize_user_intent(getattr(rt, "classified_intent", None))
    if intent != "design":
        return
    lane = normalize_paint_lane(
        getattr(rt, "classified_paint_lane", None),
        intent=intent,
    )
    if paint_ops_intent(intent, lane) != "create":
        return
    if probe_has_target_chip(rt.prompt or ""):
        return
    rt.focus_id = ""
    rt.flags.pop("artboard_frame_id", None)
    rt.flags.pop("artboard_opened", None)
    rt.flags.pop("artboard_size", None)


def _clear_ask_proposal_meta(proposal_task_id: str) -> None:
    tid = str(proposal_task_id or "").strip()
    if not tid:
        return
    try:
        from app.services.design.admin.task_store import merge_task_meta

        merge_task_meta(tid, {"ask_proposal": None})
    except Exception:
        pass


def _drop_pending(rt: AgentRuntime) -> None:
    rt.flags.pop("pending_proposal", None)


async def _node_intent_classify(state: GraphState) -> Command:
    """Cheap intent gate: chat → end; canvas_op → paint; design → decide (+ skills).

    With Ask PENDING_PROPOSAL: proposal_action apply|dismiss|revise routes first.
    """
    rt = state["rt"]
    st = rt.run
    pending = _pending_proposal_flag(rt)
    t_intent = time.perf_counter()
    decision = await classify_user_intent(
        prompt=rt.prompt,
        rules=rt.rules,
        has_images=bool(rt.images),
        canvas_node_count=len(rt.scene_nodes or []),
        scene=rt.scene_key,
        interaction_mode=str(rt.flags.get("mode") or rt.mode or ""),
        pending_proposal=pending,
    )
    intent_ms = max(0, int((time.perf_counter() - t_intent) * 1000))
    intent, paint_lane = normalize_intent_decision(
        decision.intent, decision.paint_lane
    )
    action = normalize_proposal_action(
        decision.proposal_action, has_pending=bool(pending)
    )
    reply = (decision.reply or "").strip()
    if intent == "chat" and not reply and action != "apply":
        reply = _chat_fallback_text(rt)
    rt.classified_intent = intent
    rt.classified_paint_lane = paint_lane
    rt.classified_reply = reply
    st.intent = (
        paint_ops_intent(intent, paint_lane) if intent != "chat" else "chat"
    )
    rt.flags["intent"] = intent
    rt.flags["paint_lane"] = paint_lane
    st.push_log(
        phase="intent_classify",
        intent=intent,
        paint_lane=paint_lane or None,
        proposal_action=action or None,
        reply=(reply[:500] if intent == "chat" or action == "dismiss" else None),
        summary=(
            f"意图={intent}"
            + (f"/{paint_lane}" if paint_lane else "")
            + (f" · proposal={action}" if action else "")
            + (f" · {(decision.rationale or '')[:80]}" if decision.rationale else "")
        ),
        duration_ms=intent_ms,
        llm_raw=_clip_llm_raw(
            json.dumps(
                {
                    "intent": intent,
                    "paint_lane": paint_lane,
                    "proposal_action": action,
                    "rationale": (decision.rationale or "")[:400],
                    "reply": reply[:400]
                    if intent == "chat" or action == "dismiss"
                    else "",
                },
                ensure_ascii=False,
            ),
            limit=1200,
        ),
    )
    _emit(
        {
            "type": "activity",
            "id": f"intent-{st.task_id[:8]}",
            "kind": "thought",
            "status": "done",
            "stage": intent,
        }
    )

    if action == "apply" and pending:
        ops = [o for o in (pending.get("ops") or []) if isinstance(o, dict)]
        if ops:
            rt.apply_ops = ops[:48]
            rt.flags["apply_ops"] = True
            _drop_pending(rt)
            return _goto_cmd(rt, frm="intent_classify", to="apply_confirm")

    if action == "dismiss" and pending:
        if not reply:
            reply = _chat_fallback_text(rt) or "已取消"
        st.reply = reply
        _emit({"type": "token", "text": reply})
        _clear_ask_proposal_meta(str(pending.get("task_id") or ""))
        _drop_pending(rt)
        return _goto_cmd(rt, frm="intent_classify", to="__settle__")

    # revise / no action — continue normal gate; drop pending so this run won't re-apply.
    if pending:
        _drop_pending(rt)

    if intent == "chat":
        if reply:
            st.reply = reply
            _emit({"type": "token", "text": reply})
        return _goto_cmd(rt, frm="intent_classify", to="__settle__")

    # New design create without @ must not inherit memory/ambient FOCUS —
    # otherwise early-open / paint rewrites the previous plate.
    _release_ambient_focus_for_new_design(rt)

    _emit_design_loading_artboard(rt)
    if intent == "canvas_op":
        return _goto_cmd(rt, frm="intent_classify", to="paint_ops")
    return _goto_cmd(rt, frm="intent_classify", to="design_agent")
