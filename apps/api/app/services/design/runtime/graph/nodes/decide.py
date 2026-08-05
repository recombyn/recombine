"""LangGraph graph nodes."""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from langgraph.types import Command

from app.services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    DecideTurnSchema,
    GraphState,
    _DEFAULT_MAX_ROUNDS,
)
from app.services.design.runtime.graph.support import (
    _absorb_ask_choices,
    _append_prompt_pack,
    _bump,
    _chat_fallback_text,
    _clip_llm_raw,
    _clip_urls,
    _commit,
    _emit,
    _flush_host_events,
    _format_thought_messages,
    _goto_cmd,
    _interaction_mode_rules_pack,
    _llm_io_fields,
    _llm_ux_reply,
    _parse_agent_turn,
    _persist_progress,
    _resolve_and_log_model,
    _resolve_paint_want,
    _should_route_to_paint,
    _stream_llm_text,
    _thinking_field,
    _turn_from_structured,
    _turn_has_clarify,
    _ui_thought_text,
)
from app.services.design.runtime.host import assemble_stage_system
from app.services.design.runtime.host.resources import load_deferred_resources

async def _node_resource(state: GraphState) -> Command:
    rt = state["rt"]
    await load_deferred_resources(rt, rt.turn)
    return Command(update=_bump(rt))



async def _node_design_agent(state: GraphState) -> Command:
    """Decision stage: chat / clarify / need_* only. Canvas ops → paint_ops."""
    rt = state["rt"]
    st = rt.run
    ask_mode = str(rt.flags.get("mode") or "") == "ask"
    max_rounds = max(1, int(rt.max_rounds or _DEFAULT_MAX_ROUNDS))

    st.family, reason = _resolve_and_log_model(
        st,
        skill={
            "category": "agent",
            "default_model": "doubao",
            "name": "react",
            "skill_key": "react"
        },
        user_selected_model=rt.user_selected_model,
        run_mode=rt.mode,
        prompt=rt.prompt,
        rules=rt.rules,
        scene=rt.scene_key,
        attempt=st.round,
        has_images=bool(rt.images),
    )
    rt.last_reason = reason

    for _round in range(max_rounds):
        round_i = st.round
        _emit(
            {
                "type": "skill_start",
                "index": round_i,
                "skill_id": None,
                "skill_key": "react",
                "skill_name": "Design Agent",
                "category": "agent",
                "model": st.family,
                "model_reason": rt.last_reason,
                "trace_id": st.trace_id
            }
        )
        lc_system, user_msg = _format_thought_messages(rt)
        if not str(lc_system or "").strip():
            # 配提示词：decide 阶段唯一入口（无 A or B or C 兜底链）
            lc_system = assemble_stage_system(
                rt.rules,
                stage="decide",
                ask_mode=ask_mode,
                persona=str(rt.persona or ""),
            )
        else:
            lc_system = _append_prompt_pack(
                lc_system,
                _interaction_mode_rules_pack(rt.rules, ask_mode=ask_mode),
            )
            if rt.persona and "IDENTITY:" not in lc_system:
                lc_system = f"IDENTITY: {rt.persona}\n\n{lc_system}"
        turn_images = list(rt.images or [])[:4] if rt.images else None
        if turn_images:
            st.vision_used = True
            rt.last_images = turn_images

        content = ""
        used_hint = 0
        llm_think = ""
        turn: dict[str, Any] = {}
        t_decide = time.perf_counter()
        try:
            st.family, content, used_hint, llm_ev, llm_think = await _stream_llm_text(
                model_family=st.family,
                system=lc_system,
                user=user_msg,
                rules=rt.rules,
                images=turn_images,
                max_tokens=2048,
                enable_thinking=True,
                live_emit=True,
            )
            _flush_host_events(st, llm_ev)
            st.total_tokens += used_hint
            turn = _parse_agent_turn(content)
            # Ignore any accidental tool_ops from decision text — paint stage owns ops.
            turn["tool_ops_raw"] = None
            if (
                not turn.get("intent")
                and not turn.get("reply")
                and not turn.get("need_tools")
                and not turn.get("need_skills")
            ):
                from app.services.llm import build_user_message_content
                from app.services.llm.agent import ainvoke_structured

                user_content = build_user_message_content(user_msg, turn_images)
                structured_out = await ainvoke_structured(
                    schema=DecideTurnSchema,
                    messages=[{"role": "user", "content": user_content}],
                    model=st.family,
                    system=lc_system,
                    source="design",
                    run_name=f"design_decide:{st.task_id[:8]}",
                    metadata={
                        "task_id": st.task_id,
                        "trace_id": st.trace_id,
                        "user_id": rt.user_id,
                        "scene": rt.scene_key or "",
                        "intent": str(rt.classified_intent or st.intent or ""),
                        "round": round_i,
                        "has_images": bool(turn_images),
                        "stage": "decide"
                    },
                    tags=["design", "lc_design", "design_agent", "decide"],
                )
                turn = _turn_from_structured(structured_out.get("structured"))
                turn["tool_ops_raw"] = None
        except Exception as err:  # noqa: BLE001
            st.note_error(f"design_agent_llm_failed: {err}"[:240])
            st.push_log(
                phase="design_agent",
                error=str(err)[:200],
                summary="决策回合失败",
                duration_ms=max(0, int((time.perf_counter() - t_decide) * 1000)),
            )
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "react",
                    "skill_name": "Design Agent",
                    "tokens": 0
                }
            )
            fail = await _llm_ux_reply(
                rt,
                situation="The design model failed this turn; ask the user to retry.",
                facts=str(err)[:160],
            )
            if fail:
                st.reply = fail
                _emit({"type": "token", "text": fail})
            rt.terminal = True
            return Command(update=_bump(rt), goto="__settle__")

        rt.turn = turn
        rt.last_content = content or str(turn.get("reply") or turn.get("thought") or "")
        rt.last_user_msg = user_msg
        rt.last_used = used_hint
        if llm_think:
            rt.last_think = llm_think
        intent = str(turn.get("intent") or "chat").strip().lower()
        reply = str(turn.get("reply") or "").strip()
        thought = str(turn.get("thought") or "").strip()
        has_clarify = _turn_has_clarify(turn)
        st.intent = intent

        # Chat fold: readable thought (not protocol dump). Keep off the black reply stream.
        ui_thought = _ui_thought_text(thought, limit=280)
        if ui_thought:
            _emit({"type": "thinking", "text": ui_thought, "replace": True})

        st.push_log(
            phase="design_agent",
            intent=intent,
            summary=(thought or intent or "decide")[:120],
            model=st.family,
            reply=(reply[:500] if reply else None),
            has_images=bool(turn_images) or None,
            llm_image_urls=_clip_urls(turn_images) if turn_images else None,
            tokens=used_hint or None,
            duration_ms=max(0, int((time.perf_counter() - t_decide) * 1000)),
            llm_raw=_clip_llm_raw(content, limit=4000),
            **_thinking_field(llm_think),
            **_llm_io_fields(
                system=lc_system, user=user_msg, images=turn_images, max_tokens=2048
            ),
            stage="decide",
            **({"ask_mode": True} if ask_mode else {}),
        )
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "skill_name": "Design Agent",
                "tokens": used_hint
            }
        )

        need_any = bool(
            turn.get("need_tools")
            or turn.get("need_knowledge")
            or turn.get("need_skills")
            or turn.get("need_aesthetics")
        )
        if need_any:
            await _node_resource(state)
            # Ask: after tools/skills land, decide again (clarify or paint).
            if ask_mode:
                st.round = round_i + 1
                continue
            # Agent: resources ready → paint when this is canvas work.
            if _should_route_to_paint(
                classified=str(rt.classified_intent or ""),
                turn_intent=str(intent or rt.classified_intent or "create"),
                has_clarify=False,
                ask_mode=False,
            ):
                st.intent = _resolve_paint_want(rt, intent)
                # Stash only — stream after paint actually sends tool_ops.
                if reply and len(reply) <= 80:
                    st.reply = reply
                return Command(update=_bump(rt), goto="paint_ops")
            st.round = round_i + 1
            continue

        # Ask mode only: intent=ask → wait on user (chips and/or open reply).
        if ask_mode and intent == "ask" and reply:
            st.reply = reply
            _emit({"type": "token", "text": reply})
            _absorb_ask_choices(st, turn)
            rt.flags["await_user"] = True
            rt.terminal = True
            return Command(update=_bump(rt), goto="__settle__")

        if _should_route_to_paint(
            classified=str(rt.classified_intent or ""),
            turn_intent=intent,
            has_clarify=has_clarify,
            ask_mode=ask_mode,
        ):
            st.intent = _resolve_paint_want(rt, intent)
            # Stash only — stream after paint sends ops (or Ask propose rewrite).
            if reply and len(reply) <= 80:
                st.reply = reply
            return Command(update=_bump(rt), goto="paint_ops")

        text = reply or _chat_fallback_text(rt)
        if text:
            st.reply = text
            _emit({"type": "token", "text": text})
        rt.terminal = True
        return Command(update=_bump(rt), goto="__settle__")

    # Rounds exhausted on decide — if classified canvas work, still try paint.
    if _should_route_to_paint(
        classified=str(rt.classified_intent or ""),
        turn_intent=str(st.intent or ""),
        has_clarify=False,
        ask_mode=False,
    ):
        st.intent = _resolve_paint_want(rt, st.intent)
        return Command(update=_bump(rt), goto="paint_ops")

    rt.terminal = True
    if not st.reply:
        st.reply = _chat_fallback_text(rt)
        _emit({"type": "token", "text": st.reply})
    return Command(update=_bump(rt), goto="__settle__")

