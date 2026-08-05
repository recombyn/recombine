"""LangGraph graph nodes."""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from langgraph.types import Command

from services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    GraphState,
    _SCENE_WAIT_SEC,
)
from services.design.runtime.graph.support import (
    _bump,
    _commit,
    _emit,
    _goto_cmd,
    _llm_ux_reply,
    _persist_progress,
)
from services.design.runtime.scene_feedback import wait_for_scene


async def _node_observe(
    state: GraphState,
) -> Command:
    rt = state["rt"]
    st = rt.run
    round_i = st.round
    from services.design.runtime.graph.build import (
        mark_design_running,
        mark_design_waiting_client,
    )

    await asyncio.to_thread(mark_design_waiting_client, st.task_id)
    try:
        snap = await wait_for_scene(st.task_id, timeout_sec=_SCENE_WAIT_SEC)
    finally:
        await asyncio.to_thread(mark_design_running, st.task_id)
    op_failures: list[dict[str, Any]] = []
    if snap:
        nodes = [
            n for n in (snap.get("nodes") or []) if isinstance(n, dict) and n.get("id")
        ][:120]
        frames = [
            f for f in (snap.get("frames") or []) if isinstance(f, dict) and f.get("id")
        ][:32]
        rt.scene_nodes = nodes
        rt.scene_frames = frames
        spatial = snap.get("spatial")
        if isinstance(spatial, dict):
            rt.spatial_summary = spatial
        op_failures = [
            r
            for r in (snap.get("op_results") or [])
            if isinstance(r, dict) and not r.get("ok", True)
        ]
        fail_bits = [
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:8]
            if isinstance(r, dict)
        ]
        st.push_log(
            phase="observe",
            nodes=len(nodes),
            frames=len(frames),
            ok=not op_failures,
            op_failed=len(op_failures) or None,
            op_errors=fail_bits or None,
            summary=(
                f"观察画布 nodes={len(nodes)} frames={len(frames)}"
                + (f" · 失败×{len(op_failures)}" if op_failures else " · ok")
            ),
        )
    else:
        st.note_error("scene_feedback_timeout: FE did not post scene; assume ops applied")
        st.push_log(
            phase="observe",
            ok=False,
            error="timeout",
            summary='观察超时：前端未回传 scene',
        )

    if rt.skip_loop:
        # Ask confirm apply: feedback landed (or timed out) → finish.
        if st.reply:
            _emit({"type": "token", "text": st.reply})
        rt.terminal = True
        rt.flags["ok"] = True
        rt.flags["scene_ready"] = bool(snap)
        rt.flags["op_failed"] = False
        return Command(update=_bump(rt), goto="__settle__")

    if op_failures:
        fail_notes = "; ".join(
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:3]
        )
        all_failed = len(rt.paint_ops) > 0 and len(op_failures) >= len(rt.paint_ops)
        if all_failed:
            st.painted = False
        st.note_error(f"op_apply_failed: {fail_notes}")
        st.push_log(
            phase="reflect",
            error=st.reflect_note,
            reason="op_apply_failed",
            op_failed=len(op_failures),
            reflect_left=st.reflect_left,
            summary=f"操作未生效×{len(op_failures)}：{fail_notes}"[:160],
        )
        _emit(
            {
                "type": "activity",
                "id": f"opfail-{round_i}",
                "kind": "skipped",
                "status": "done",
                "count": len(op_failures),
                "detail": f"ops_failed×{len(op_failures)}: {fail_notes}"[:200],
                "index": round_i,
            }
        )
        if st.reflect_left > 0 and not rt.turn.get("done"):
            st.reflect_left -= 1
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "react",
                    "skill_name": "Design Agent",
                    "tokens": rt.last_used,
                }
            )
            st.round = round_i + 1
            rt.flags["op_failed"] = True
            rt.flags["retry"] = True
            rt.flags["ok"] = False
            # Re-paint with LAST_ERROR in prompt — do not settle as success.
            return Command(update=_bump(rt), goto="paint_ops")
        corrected = await _llm_ux_reply(
            rt,
            situation=(
                "Some canvas ops failed to apply (targets may be gone). "
                "Explain briefly and invite the user to retry on a specific element."
            ),
            facts=f"failed={len(op_failures)}; notes={fail_notes[:240]}",
        )
        if corrected:
            st.reply = corrected
            _emit({"type": "token", "text": corrected})
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": rt.last_used,
            }
        )
        rt.terminal = True
        rt.flags["ok"] = False
        return Command(update=_bump(rt), goto="__settle__")

    # Apply confirmed — keep painted; finish turn (no verify loop in fixed graph).
    rt.flags["scene_ready"] = True
    rt.flags["op_failed"] = False
    rt.flags["ok"] = True
    rt.flags["retry"] = False
    rt.terminal = True
    return Command(update=_bump(rt), goto="__settle__")

