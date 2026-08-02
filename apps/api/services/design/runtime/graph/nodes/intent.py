"""LangGraph graph nodes."""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from langgraph.types import Command

from services.design.runtime.graph.state import AgentRunState, AgentRuntime, GraphState
from services.design.runtime.graph.support import (
    _chat_fallback_text,
    _clip_llm_raw,
    _emit,
    _emit_design_loading_artboard,
    _goto_cmd,
)
from services.design.runtime.graph.support import _bump
from services.design.runtime.graph.support import _commit
from services.design.runtime.graph.support import _persist_progress


async def _node_intent_classify(state: GraphState) -> Command:
    """Cheap intent gate: chat → end; canvas_op → paint; design → decide (+ skills)."""
    rt = state["rt"]
    st = rt.run
    t_intent = time.perf_counter()
    decision = await classify_user_intent(
        prompt=rt.prompt,
        rules=rt.rules,
        has_images=bool(rt.images),
        canvas_node_count=len(rt.scene_nodes or []),
        scene=rt.scene_key,
        interaction_mode=str(rt.flags.get("mode") or rt.mode or ""),
    )
    intent_ms = max(0, int((time.perf_counter() - t_intent) * 1000))
    intent, paint_lane = normalize_intent_decision(
        decision.intent, decision.paint_lane
    )
    reply = (decision.reply or "").strip()
    if intent == "chat" and not reply:
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
        reply=(reply[:500] if intent == "chat" else None),
        summary=(
            f"意图={intent}"
            + (f"/{paint_lane}" if paint_lane else "")
            + (f" · {(decision.rationale or '')[:80]}" if decision.rationale else "")
        ),
        duration_ms=intent_ms,
        llm_raw=_clip_llm_raw(
            json.dumps(
                {
                    "intent": intent,
                    "paint_lane": paint_lane,
                    "rationale": (decision.rationale or "")[:400],
                    "reply": reply[:400] if intent == "chat" else "",
                },
                ensure_ascii=False,
            ),
            limit=1200,
        ),
    )
    # No Chinese detail — FE i18n via activityThoughtBrief / process labels.
    _emit(
        {
            "type": "activity",
            "id": f"intent-{st.task_id[:8]}",
            "kind": "thought",
            "status": "done",
            "stage": intent
        }
    )
    if intent == "chat":
        if reply:
            st.reply = reply
            _emit({"type": "token", "text": reply})
        return _goto_cmd(rt, frm="intent_classify", to="__settle__")

    # Catalogs (tools/skills/knowledge/…) are already on rt.system; skill bodies
    # load only after the model emits need_skills. Memory is injected in memory node.
    _emit_design_loading_artboard(rt)
    if intent == "canvas_op":
        # Achievable via canvas tools — skip decide, paint tool_ops immediately.
        return _goto_cmd(rt, frm="intent_classify", to="paint_ops")
    return _goto_cmd(rt, frm="intent_classify", to="design_agent")

