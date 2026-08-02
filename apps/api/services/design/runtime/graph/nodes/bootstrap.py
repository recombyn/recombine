"""LangGraph graph nodes."""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from langgraph.types import Command

from services.design.runtime.graph.state import AgentRunState, AgentRuntime, GraphState
from services.design.runtime.graph.support import (
    _clip_llm_raw,
    _clip_urls,
    _emit,
    _goto_cmd,
    _persist_progress,
)
from services.design.runtime.graph.support import _bump
from services.design.runtime.graph.support import _commit


def _canvas_is_empty(rt: Any) -> bool:
    nodes = [n for n in (rt.scene_nodes or []) if isinstance(n, dict) and n.get("id")]
    if nodes:
        return False
    frames = [f for f in (rt.scene_frames or []) if isinstance(f, dict) and f.get("id")]
    if not frames:
        return True
    return all(bool(f.get("is_empty")) for f in frames)


async def _node_bootstrap(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    # Sync MySQL / catalog must not block the ASGI event loop (Admin lists starve).
    await asyncio.to_thread(
        _insert_task,
        {
            "id": st.task_id,
            "user_id": rt.user_id,
            "canvas_id": rt.canvas_id,
            "scene": rt.scene_key or "",
            "skill_group_id": None,
            "task_type": rt.mode,
            "user_selected_model": rt.user_selected_model,
            "actual_models": "[]",
            "target_layer_id": rt.focus_id or None,
            "current_skill_index": 0,
            "status": "running",
            "hold_credits": rt.hold,
            "charged_credits": 0,
            "total_tokens": 0,
            "prompt": rt.prompt,
            "canvas_size": rt.canvas_size or (f"{rt.w}x{rt.h}" if rt.w and rt.h else ""),
            "result_svg": None,
            "error_message": None,
            "meta_json": json.dumps(
                {
                    "control": "langgraph",
                    "trace_id": st.trace_id,
                    "max_rounds": rt.max_rounds,
                    "decision_log": rt.decision.to_log(),
                    "execution_log": st.to_execution_log(),
                    **({"apply_ops": True} if rt.apply_ops else {})
                },
                ensure_ascii=False,
            ),
            "created_at": time.time(),
            "updated_at": time.time()
        },
    )
    _emit(
        {
            "type": "status",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "run_mode": rt.mode,
            "scene": rt.scene_key or None,
            **early_status_canvas_fields(
                w=rt.w,
                h=rt.h,
                client_size_locked=explicit_canvas_size(rt.canvas_size),
                client_canvas_raw=rt.canvas_size,
            )
        }
    )
    _emit(rt.decision.to_event())
    if rt.apply_ops:
        rt.flags["apply_ops"] = True
        return _goto_cmd(rt, frm="bootstrap", to="apply_confirm")
    rt.flags["mode"] = rt.flags.get("mode") or "agent"
    _apply_task_route_flags(rt)
    await _persist_progress(rt)
    return _goto_cmd(rt, frm="bootstrap", to="memory")


def _apply_task_route_flags(rt: AgentRuntime) -> None:
    """Estimate task tier + mode flags (formerly the standalone「任务分流」node)."""
    st = rt.run
    st.task_tier = clamp_tier(
        estimate_task_tier(
            rt.prompt, rules=rt.rules, skill_category="agent", scene=rt.scene_key or None
        ),
        enabled_tiers(rt.rules),
    )
    tier_label = {"simple": "简单", "medium": "中等", "complex": "复杂"}.get(
        st.task_tier, st.task_tier or "-"
    )
    # Do not set vision_used here — only after pixels are actually sent to the LLM.
    st.push_log(
        phase="route",
        task_tier=st.task_tier or None,
        has_images=bool(rt.images) or None,
        vision=None,
        user_selected_model=(rt.user_selected_model or "auto"),
        run_mode=rt.mode,
        llm_image_urls=_clip_urls(rt.images) if rt.images else None,
        llm_user=_clip_llm_raw(rt.prompt, limit=4000),
        summary=(
            f"任务类型 {tier_label}"
            + (" · 含附图" if rt.images else "")
            + f" · 模式 {rt.mode}"
        ),
    )
    if _as_text(rt.flags.get("mode")).strip().lower() not in ("agent", "ask"):
        rt.flags["mode"] = "agent"
    rt.flags["task_tier"] = st.task_tier

