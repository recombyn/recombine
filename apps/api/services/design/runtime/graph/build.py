"""LangGraph compile + run_agent_graph entry."""
from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, RetryPolicy, TimeoutPolicy

from services.design.readpath.canvas_scene import resolve_agent_scene, scene_key as _scene_key
from services.design.runtime.decision_log import DesignRunDecision
from services.design.runtime.host import assemble_stage_system, require_prompt_pack
from services.design.runtime.host import interaction_mode_rules_pack  # noqa: F401
from services.design.runtime.graph import support as S
from services.design.runtime.graph.support import (
    _bump,
    _commit,
    _goto_cmd,
    _persist_progress,
    _persist_task_meta,
    _log_graph_hop,
)
from services.design.runtime.graph.nodes import (
    _node_action,
    _node_apply_confirm,
    _node_bootstrap,
    _node_design_agent,
    _node_intent_classify,
    _node_memory,
    _node_observe,
    _node_paint_ops,
    _node_propose,
    _node_settle,
)
from services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    GraphState,
    _DEFAULT_MAX_REFLECT,
    _DEFAULT_MAX_ROUNDS,
)
from services.design.runtime.pipeline_support import _normalize_ref_images, _user_facing_run_error
from services.design.prompts.rules_text import _as_text
from services.design.ops.tool_ops_contract import format_canvas_tools_catalog, format_canvas_tools_for_model
from services.design.prompts.knowledge_store import format_knowledge_catalog
from services.design.prompts.skill_store import format_skills_catalog
from services.design.aesthetics.scorer import format_aesthetics_catalog
from services.design.admin.task_store import _update_task

_log = logging.getLogger(__name__)
_LC_DESIGN_GRAPH: Any = None
_DESIGN_HOLD_FNS: dict[str, tuple[Any, Any]] = {}
_DESIGN_HOLD_LOCK = threading.Lock()

def _bind_design_hold_fns(task_id: str, settle: Any, refund: Any) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    with _DESIGN_HOLD_LOCK:
        _DESIGN_HOLD_FNS[tid] = (settle, refund)


def _unbind_design_hold_fns(task_id: str) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    with _DESIGN_HOLD_LOCK:
        _DESIGN_HOLD_FNS.pop(tid, None)


def _design_settle_hold_fn(rt: AgentRuntime) -> Any:
    tid = str(rt.run.task_id or "").strip()
    with _DESIGN_HOLD_LOCK:
        pair = _DESIGN_HOLD_FNS.get(tid)
    if pair and callable(pair[0]):
        return pair[0]
    fn = getattr(rt, "settle_hold_fn", None)
    if callable(fn):
        return fn
    raise RuntimeError("design settle_hold_fn not bound")


def _design_refund_hold_fn(rt: AgentRuntime) -> Any:
    tid = str(rt.run.task_id or "").strip()
    with _DESIGN_HOLD_LOCK:
        pair = _DESIGN_HOLD_FNS.get(tid)
    if pair and callable(pair[1]):
        return pair[1]
    fn = getattr(rt, "refund_hold_fn", None)
    if callable(fn):
        return fn
    raise RuntimeError("design refund_hold_fn not bound")


def invalidate_agent_graph_cache(flow_id: str | None = None) -> None:
    del flow_id
    global _LC_DESIGN_GRAPH
    _LC_DESIGN_GRAPH = None


def _design_thread_id(task_id: str) -> str:
    return f"design:{str(task_id or '').strip()}"


def _design_graph_retry_policy() -> RetryPolicy:
    from config.settings import settings

    attempts = max(1, int(getattr(settings, "design_graph_retry_attempts", 3) or 3))
    return RetryPolicy(
        max_attempts=attempts,
        initial_interval=0.5,
        backoff_factor=2.0,
        max_interval=8.0,
    )


def _design_graph_node_timeout() -> TimeoutPolicy | None:
    from config.settings import settings

    sec = float(getattr(settings, "design_graph_node_timeout_sec", 180.0) or 0.0)
    if sec <= 0:
        return None
    return TimeoutPolicy(run_timeout=sec)


def _get_design_graph_checkpointer() -> Any:
    """Shared durable checkpointer (MySQL 8+ → Sqlite+async-bridge → memory).

    Wallet settle/refund stay on ``_bind_design_hold_fns``, not in graph state.
    """
    from services.llm.agent import checkpointer_backend, get_agent_checkpointer

    cp = get_agent_checkpointer()
    _log.info("design graph checkpointer backend=%s", checkpointer_backend())
    return cp


async def _cleanup_design_thread(graph: Any, thread_id: str) -> None:
    tid = str(thread_id or "").strip()
    if not tid:
        return
    cp = getattr(graph, "checkpointer", None)
    if cp is None:
        return
    try:
        await cp.adelete_thread(tid)
    except Exception:
        _log.debug("design graph thread cleanup failed tid=%s", tid, exc_info=True)


def _build_lc_design_graph():
    """Fixed outer graph: … → paint_ops → action → observe → settle (retry paint on fail)."""
    from config.settings import settings

    g = StateGraph(GraphState)
    dest = (
        "bootstrap",
        "apply_confirm",
        "memory",
        "intent_classify",
        "design_agent",
        "paint_ops",
        "action",
        "observe",
        "propose",
        "__settle__",
        END,
    )
    retry = _design_graph_retry_policy()
    node_timeout = _design_graph_node_timeout()
    # LLM / IO-heavy nodes: RetryPolicy + TimeoutPolicy.
    # paint_ops already retries empty/invalid ops in-node — do NOT also retry the
    # whole node on 180s timeout (that alone made "add a rect" take ~7 minutes).
    io_kw: dict[str, Any] = {"destinations": dest, "retry_policy": retry}
    if node_timeout is not None:
        io_kw["timeout"] = node_timeout
    paint_kw: dict[str, Any] = {
        "destinations": dest,
        "retry_policy": RetryPolicy(
            max_attempts=1,
            initial_interval=0.5,
            backoff_factor=2.0,
            max_interval=8.0,
        ),
    }
    if node_timeout is not None:
        paint_kw["timeout"] = node_timeout
    # observe only waits on FE (~12s) — no LLM graph retry.
    observe_kw: dict[str, Any] = {
        "destinations": dest,
        "retry_policy": RetryPolicy(
            max_attempts=1,
            initial_interval=0.5,
            backoff_factor=2.0,
            max_interval=8.0,
        ),
    }
    g.add_node("bootstrap", _node_bootstrap, destinations=dest)
    g.add_node("apply_confirm", _node_apply_confirm, destinations=dest)
    g.add_node("memory", _node_memory, **io_kw)
    g.add_node("intent_classify", _node_intent_classify, **io_kw)
    g.add_node("design_agent", _node_design_agent, **io_kw)
    g.add_node("paint_ops", _node_paint_ops, **paint_kw)
    g.add_node("action", _node_action, destinations=dest)
    g.add_node("observe", _node_observe, **observe_kw)
    g.add_node("propose", _node_propose, destinations=dest)
    g.add_node("__settle__", _node_settle, destinations=(END,))
    g.add_edge(START, "bootstrap")
    if bool(getattr(settings, "design_graph_checkpoint", True)):
        return g.compile(checkpointer=_get_design_graph_checkpointer())
    return g.compile()


def _lc_design_graph():
    global _LC_DESIGN_GRAPH
    if _LC_DESIGN_GRAPH is None:
        _LC_DESIGN_GRAPH = _build_lc_design_graph()
    return _LC_DESIGN_GRAPH


async def run_agent_graph(
    *,
    user_id: str,
    mode: str,
    prompt: str,
    rules: dict[str, str],
    user_selected_model: str | None,
    canvas_id: str | None,
    canvas_size: str | None,
    scene: str | None,
    scene_nodes: list[dict[str, Any]],
    scene_frames: list[dict[str, Any]],
    spatial_summary: dict[str, Any] | None,
    focus_frame_id: str | None,
    images: list[str] | None,
    memory_in: dict[str, Any] | None,
    session_id: str,
    project_id: str,
    hold: int,
    free_daily: bool,
    t0: float,
    reserve_hold_fn: Any,
    settle_hold_fn: Any,
    refund_hold_fn: Any,
    apply_ops: list[dict[str, Any]] | None = None,
    interaction_mode: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Internal graph runner. Prefer ``design_stream`` at call sites."""
    del reserve_hold_fn

    task_id = str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    try:
        from services.llm.usage_log import bind_usage_context

        bind_usage_context(user_id=user_id, task_id=task_id, source="design")
    except Exception:
        pass

    ui_mode = _as_text(interaction_mode or "agent").strip().lower()
    if ui_mode not in ("agent", "ask"):
        ui_mode = "agent"

    sid = _as_text(session_id).strip()
    pid = _as_text(project_id).strip() or "__none__"
    max_rounds = S._int_rule(rules, "agent.react.max_rounds", _DEFAULT_MAX_ROUNDS) or _DEFAULT_MAX_ROUNDS
    max_reflect = S._int_rule(rules, "agent.react.max_reflect", _DEFAULT_MAX_REFLECT)

    scene_key, _ = resolve_agent_scene(scene, prompt, canvas_size, rules=rules)
    scene_key = scene_key or _scene_key(scene) or ""
    nodes = [n for n in (scene_nodes or []) if isinstance(n, dict) and n.get("id")][:120]
    frames = [f for f in (scene_frames or []) if isinstance(f, dict) and f.get("id")][:32]
    focus_id = _as_text(focus_frame_id).strip()
    w, h = S._resolve_wh(
        canvas_size=canvas_size,
        scene_key=scene_key,
        rules=rules,
        scene_frames=frames,
        focus_id=focus_id,
    )
    ref_images = _normalize_ref_images(images, rules=rules)
    apply_list = [o for o in (apply_ops or []) if isinstance(o, dict)]

    run = AgentRunState(
        trace_id=trace_id,
        task_id=task_id,
        goal=prompt,
        reflect_left=max_reflect,
        t0=float(t0 or 0.0) or time.perf_counter(),
    )
    decision = DesignRunDecision(
        trace_id=trace_id,
        session_id=sid or None,
        focus_frame_id=focus_id or None,
        probe_len=len(prompt),
        has_ref_images=bool(ref_images),
        has_scene_nodes=bool(nodes),
        route="agent_graph",
        task_id=task_id,
        scene=scene_key or None,
    )

    tools_block = format_canvas_tools_for_model(rules)
    tools_catalog = format_canvas_tools_catalog(rules)
    scene_for_cat = scene_key or "website"
    skills_catalog, knowledge_catalog, aesthetics_catalog = await asyncio.gather(
        asyncio.to_thread(format_skills_catalog, scene=scene_for_cat),
        asyncio.to_thread(format_knowledge_catalog, scene=scene_for_cat),
        asyncio.to_thread(format_aesthetics_catalog, scene=scene_for_cat),
    )
    defer_tools = S._flag_on(rules, "agent.react.defer_tools", "1")
    persona = S._resolve_agent_persona(rules, user_selected_model)
    size_auto_hint = S._prompt_text(rules, "agent.prompt.size_auto")
    chat_fallback_tmpl = S._prompt_text(rules, "agent.prompt.chat_fallback")
    # Decide-stage packs + catalogs (full tool/skill bodies arrive via need_*).
    system = assemble_stage_system(
        rules,
        stage="decide",
        ask_mode=(ui_mode == "ask"),
        persona=persona,
        catalog_blocks=[
            tools_catalog if defer_tools else tools_block,
            skills_catalog,
            knowledge_catalog,
            aesthetics_catalog,
        ],
    )

    rt = AgentRuntime(
        user_id=user_id,
        mode=mode,
        prompt=prompt,
        rules=rules,
        user_selected_model=user_selected_model,
        canvas_id=canvas_id,
        canvas_size=canvas_size,
        scene_key=scene_key,
        scene_nodes=nodes,
        scene_frames=frames,
        focus_id=focus_id,
        images=ref_images,
        memory_in=memory_in,
        session_id=sid,
        project_id=pid,
        hold=hold,
        free_daily=free_daily,
        t0=t0,
        settle_hold_fn=None,
        refund_hold_fn=None,
        apply_ops=apply_list,
        w=w,
        h=h,
        run=run,
        decision=decision,
        system=system,
        size_auto_hint=size_auto_hint,
        chat_fallback_tmpl=chat_fallback_tmpl,
        persona=persona,
        defer_tools=defer_tools,
        max_rounds=max_rounds,
        spatial_summary=spatial_summary if isinstance(spatial_summary, dict) else None,
    )
    rt.flags["mode"] = ui_mode
    _bind_design_hold_fns(task_id, settle_hold_fn, refund_hold_fn)

    graph = await asyncio.to_thread(_lc_design_graph)
    rt.decision.route = "langgraph:create_agent"
    rt.flow_id = "lc_design"
    rt.flow_version = 1
    rt.run.flow_id = "lc_design"
    rt.run.flow_version = 1
    thread_id = _design_thread_id(task_id)
    from config.settings import settings as _settings

    run_timeout = float(getattr(_settings, "design_graph_run_timeout_sec", 600.0) or 0.0)
    keep_checkpoint = False
    try:
        from services.llm.agent import langfuse_callback_handler, merge_tracing_config

        lf_handler = langfuse_callback_handler()
        graph_cfg = merge_tracing_config(
            {"configurable": {"thread_id": thread_id}},
            run_name=f"lc_design:{task_id[:8]}",
            metadata={
                "task_id": task_id,
                "trace_id": trace_id,
                "user_id": user_id,
                "scene": scene_key or "",
                "mode": ui_mode,
                "langgraph_thread_id": thread_id
            },
            tags=["design", "lc_design"],
            callbacks=[lf_handler] if lf_handler is not None else None,
        )

        async def _emit_stream() -> AsyncIterator[dict[str, Any]]:
            async for chunk in graph.astream(
                {"rt": rt, "tick": 0},
                config=graph_cfg,
                stream_mode="custom",
            ):
                if isinstance(chunk, dict) and chunk.get("type"):
                    yield chunk

        if run_timeout > 0:
            async with asyncio.timeout(run_timeout):
                async for chunk in _emit_stream():
                    yield chunk
        else:
            async for chunk in _emit_stream():
                yield chunk
        if lf_handler is not None:
            lf_tid = getattr(lf_handler, "last_trace_id", None)
            if lf_tid:
                try:
                    run.langfuse_trace_id = str(lf_tid)
                except Exception:
                    pass
                try:
                    from langfuse import get_client

                    get_client().flush()
                except Exception:
                    pass
    except TimeoutError:
        err = TimeoutError(f"design graph run timed out after {run_timeout:.0f}s")
        rt.fatal = str(err)
        try:
            await asyncio.to_thread(refund_hold_fn, user_id, hold, task_id=task_id)
        except Exception:
            pass
        run.note_error(str(err)[:240])
        run.push_log(phase="error", error=str(err)[:240])
        decision.apply(route="error", intent=run.intent)
        await asyncio.to_thread(_persist_task_meta, task_id, decision=decision, state=run)
        await asyncio.to_thread(
            _update_task, task_id, status="error", error_message=str(err)[:800]
        )
        yield {"type": "execution_log", **run.to_execution_log()}
        yield {
            "type": "error",
            "message": _user_facing_run_error(err, rules=rules),
            "task_id": task_id,
            "trace_id": trace_id,
            "refunded_credits": hold
        }
    except asyncio.CancelledError:
        # Keep process-local checkpoint so same-worker resume/get_state can continue.
        keep_checkpoint = True
        run.note_error("cancelled")
        run.push_log(phase="error", error="cancelled")
        try:
            await asyncio.to_thread(
                _update_task, task_id, status="cancelled", error_message="cancelled"
            )
        except Exception:
            pass
        raise
    except Exception as err:  # noqa: BLE001
        rt.fatal = str(err)
        try:
            await asyncio.to_thread(refund_hold_fn, user_id, hold, task_id=task_id)
        except Exception:
            pass
        run.note_error(str(err)[:240])
        run.push_log(phase="error", error=str(err)[:240])
        decision.apply(route="error", intent=run.intent)
        await asyncio.to_thread(_persist_task_meta, task_id, decision=decision, state=run)
        await asyncio.to_thread(
            _update_task, task_id, status="error", error_message=str(err)[:800]
        )
        yield {"type": "execution_log", **run.to_execution_log()}
        yield {
            "type": "error",
            "message": _user_facing_run_error(err, rules=rules),
            "task_id": task_id,
            "trace_id": trace_id,
            "refunded_credits": hold
        }
    finally:
        if not keep_checkpoint:
            await _cleanup_design_thread(graph, thread_id)
        _unbind_design_hold_fns(task_id)

