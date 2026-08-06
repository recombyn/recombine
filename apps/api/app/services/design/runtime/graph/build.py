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

from app.services.design.readpath.canvas_scene import resolve_agent_scene, scene_key as _scene_key
from app.services.design.runtime.decision_log import DesignRunDecision
from app.services.design.runtime.host import assemble_stage_system, require_prompt_pack
from app.services.design.runtime.graph import support as S
from app.services.design.runtime.graph.support import (
    _bump,
    _commit,
    _goto_cmd,
    _persist_progress,
    _persist_task_meta,
    _log_graph_hop,
)
from app.services.design.runtime.graph.nodes import (
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
from app.services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    GraphState,
    _DEFAULT_MAX_REFLECT,
    _DEFAULT_MAX_ROUNDS,
)
from app.services.design.runtime.pipeline_support import _normalize_ref_images, _user_facing_run_error
from app.services.design.prompts.rules_text import _as_text
from app.services.design.ops.tool_ops_contract import format_canvas_tools_catalog, format_canvas_tools_for_model
from app.services.design.prompts.knowledge_store import format_knowledge_catalog
from app.services.design.prompts.skill_store import format_skills_catalog
from app.services.design.aesthetics.scorer import format_aesthetics_catalog
from app.services.fonts_store import format_fonts_catalog
from app.services.design.admin.task_store import (
    STATUS_CANCELLED,
    STATUS_ERROR,
    STATUS_PAUSED,
    STATUS_RUNNING,
    STATUS_SUCCESS,
    STATUS_WAITING_CLIENT,
    _update_task,
    build_run_lifecycle,
    claim_run_lease,
    design_worker_id,
    expire_stale_design_task,
    get_design_task,
    get_run_lifecycle,
    heartbeat_run_lease,
    list_stale_resumable_task_ids,
    merge_task_meta,
    new_resume_token,
    parse_task_meta,
    peek_run_intent,
    release_run_lease,
    set_run_intent,
    task_is_resumable,
)

_log = logging.getLogger(__name__)
_LC_DESIGN_GRAPH: Any = None
_DESIGN_HOLD_FNS: dict[str, tuple[Any, Any]] = {}
_DESIGN_HOLD_LOCK = threading.Lock()
# Cooperative control for an in-flight graph asyncio task.
_RUN_INTENT: dict[str, str] = {}  # task_id → pause | cancel
_ACTIVE_RUN_TASKS: dict[str, asyncio.Task[Any]] = {}
_RUN_CONTROL_LOCK = threading.Lock()

_INTENT_PAUSE = "pause"
_INTENT_CANCEL = "cancel"


class _SceneInterruptPark(Exception):
    """Park run on non-scene interrupt; keep checkpoint without error settle."""
    pass


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


def _register_active_run(task_id: str, task: asyncio.Task[Any] | None = None) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    cur = task or asyncio.current_task()
    with _RUN_CONTROL_LOCK:
        if cur is not None:
            _ACTIVE_RUN_TASKS[tid] = cur
        _RUN_INTENT.pop(tid, None)


def _unregister_active_run(task_id: str) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    with _RUN_CONTROL_LOCK:
        _ACTIVE_RUN_TASKS.pop(tid, None)
        _RUN_INTENT.pop(tid, None)


def _get_run_intent(task_id: str) -> str | None:
    tid = str(task_id or "").strip()
    with _RUN_CONTROL_LOCK:
        local = _RUN_INTENT.get(tid)
    if local in (_INTENT_PAUSE, _INTENT_CANCEL):
        return local
    try:
        return peek_run_intent(tid)
    except Exception:
        return None


def _request_run_intent(task_id: str, intent: str) -> bool:
    """Set pause/cancel intent (memory + durable) and cancel in-flight task if local."""
    tid = str(task_id or "").strip()
    if not tid or intent not in (_INTENT_PAUSE, _INTENT_CANCEL):
        return False
    with _RUN_CONTROL_LOCK:
        _RUN_INTENT[tid] = intent
        running = _ACTIVE_RUN_TASKS.get(tid)
    try:
        set_run_intent(tid, intent)
    except Exception:
        _log.debug("durable run_intent write failed task=%s", tid, exc_info=True)
    if running is not None and not running.done():
        running.cancel()
        return True
    return False


def _try_claim_run_lease(task_id: str) -> dict[str, Any]:
    return claim_run_lease(task_id, owner_id=design_worker_id())


def _heartbeat_run_lease_safe(task_id: str) -> None:
    try:
        heartbeat_run_lease(task_id, owner_id=design_worker_id())
    except Exception:
        _log.debug("run lease heartbeat failed task=%s", task_id, exc_info=True)


def _release_run_lease_safe(task_id: str) -> None:
    try:
        release_run_lease(task_id, owner_id=design_worker_id())
    except Exception:
        _log.debug("run lease release failed task=%s", task_id, exc_info=True)


def _interrupt_payloads(raw: Any) -> list[Any]:
    """Normalize ``__interrupt__`` tuple / list / Interrupt → value list."""
    out: list[Any] = []
    if raw is None:
        return out
    items = raw if isinstance(raw, (list, tuple)) else (raw,)
    for it in items:
        if it is None:
            continue
        val = getattr(it, "value", it)
        out.append(val)
    return out


def _scene_interrupt_from_state(state: Any) -> dict[str, Any] | None:
    """Return pending scene_feedback interrupt value, if any."""
    if state is None:
        return None
    for task in getattr(state, "tasks", None) or ():
        for val in _interrupt_payloads(getattr(task, "interrupts", None)):
            if isinstance(val, dict) and val.get("kind") == "scene_feedback":
                return dict(val)
    for val in _interrupt_payloads(getattr(state, "interrupts", None)):
        if isinstance(val, dict) and val.get("kind") == "scene_feedback":
            return dict(val)
    return None


async def _resolve_scene_resume_value(task_id: str, *, timeout_sec: float) -> Any:
    """Wait for FE scene (or timeout / pause marker) to resume an observe interrupt."""
    from app.services.design.runtime.scene_feedback import wait_for_scene

    snap = await wait_for_scene(task_id, timeout_sec=timeout_sec)
    intent = _get_run_intent(task_id)
    if intent == _INTENT_CANCEL:
        return {"cancelled": True}
    if intent == _INTENT_PAUSE:
        return {"paused": True}
    if snap is None:
        return {"timeout": True}
    return snap


def request_design_pause(task_id: str) -> dict[str, Any]:
    """Ask a running design graph to pause at the next cancel boundary (keep checkpoint)."""
    tid = str(task_id or "").strip()
    row = get_design_task(tid)
    if not row:
        return {"ok": False, "error": "not_found"}
    status = str(row.get("status") or "")
    if status == STATUS_PAUSED:
        return {"ok": True, "status": STATUS_PAUSED, "already": True}
    if status == STATUS_WAITING_CLIENT:
        # Already stopped at client wait — treat as resumable pause.
        merge_task_meta(
            tid,
            {
                "run_lifecycle": build_run_lifecycle(
                    thread_id=_design_thread_id(tid),
                    resumable=True,
                    interrupt_kind="waiting_client",
                    resume_token=get_run_lifecycle(parse_task_meta(row.get("meta_json"))).get(
                        "resume_token"
                    )
                    or new_resume_token(),
                )
            },
        )
        _update_task(tid, status=STATUS_PAUSED, error_message="paused")
        return {"ok": True, "status": STATUS_PAUSED}
    if status != STATUS_RUNNING:
        return {"ok": False, "error": "not_running", "status": status}
    cancelled = _request_run_intent(tid, _INTENT_PAUSE)
    return {"ok": True, "status": STATUS_RUNNING, "cancel_signaled": cancelled}


def request_design_cancel(task_id: str, *, refund_hold_fn: Any | None = None) -> dict[str, Any]:
    """Abandon a run: refund hold, mark cancelled (checkpoint cleaned by caller/async)."""
    tid = str(task_id or "").strip()
    row = get_design_task(tid)
    if not row:
        return {"ok": False, "error": "not_found"}
    status = str(row.get("status") or "")
    if status in (STATUS_SUCCESS, STATUS_CANCELLED):
        return {"ok": True, "status": status, "already": True}

    cancelled = _request_run_intent(tid, _INTENT_CANCEL)
    hold = int(row.get("hold_credits") or 0)
    charged = int(row.get("charged_credits") or 0)
    user_id = str(row.get("user_id") or "")
    if refund_hold_fn and hold > 0 and charged <= 0 and user_id:
        try:
            refund_hold_fn(user_id, hold, task_id=tid)
        except Exception:
            _log.exception("cancel refund failed task=%s", tid)

    thread_id = _design_thread_id(tid)
    merge_task_meta(
        tid,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=thread_id,
                resumable=False,
                interrupt_kind="cancelled",
                settled=charged > 0,
            )
        },
    )
    _update_task(tid, status=STATUS_CANCELLED, error_message="cancelled")
    _unbind_design_hold_fns(tid)
    return {
        "ok": True,
        "status": STATUS_CANCELLED,
        "cancel_signaled": cancelled,
        "thread_id": thread_id,
        "cleanup_checkpoint": True,
    }


async def cleanup_design_checkpoint(task_id: str) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    await _cleanup_design_thread(_lc_design_graph(), _design_thread_id(tid))


def get_design_run_status(task_id: str) -> dict[str, Any] | None:
    row = get_design_task(task_id)
    if not row:
        return None
    meta = parse_task_meta(row.get("meta_json"))
    lc = get_run_lifecycle(meta)
    status = str(row.get("status") or "")
    resumable = task_is_resumable(row)
    return {
        "task_id": row["id"],
        "user_id": row.get("user_id"),
        "status": status,
        "resumable": resumable,
        "hold_credits": int(row.get("hold_credits") or 0),
        "charged_credits": int(row.get("charged_credits") or 0),
        "error_message": row.get("error_message"),
        "thread_id": lc.get("thread_id") or _design_thread_id(str(row["id"])),
        "interrupt_kind": lc.get("interrupt_kind"),
        "checkpoint_at": lc.get("checkpoint_at"),
        "resume_token": lc.get("resume_token") if resumable else None,
        "updated_at": row.get("updated_at"),
        "lease_owner": (meta.get("run_lease") or {}).get("owner_id")
        if isinstance(meta.get("run_lease"), dict)
        else None,
        "run_intent": meta.get("run_intent"),
    }


def mark_design_waiting_client(task_id: str) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    merge_task_meta(
        tid,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=_design_thread_id(tid),
                resumable=True,
                interrupt_kind="waiting_client",
            )
        },
    )
    _update_task(tid, status=STATUS_WAITING_CLIENT, error_message=None)


def mark_design_running(task_id: str) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    _update_task(tid, status=STATUS_RUNNING, error_message=None)


def _resume_token_for(task_id: str) -> str | None:
    row = get_design_task(task_id)
    lc = get_run_lifecycle(parse_task_meta((row or {}).get("meta_json")))
    tok = lc.get("resume_token")
    return str(tok) if tok else None


def _persist_lifecycle(
    task_id: str,
    *,
    status: str,
    resumable: bool,
    interrupt_kind: str | None,
    error_message: str | None = None,
    settled: bool = False,
) -> None:
    token = new_resume_token() if resumable else None
    merge_task_meta(
        task_id,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=_design_thread_id(task_id),
                resumable=resumable,
                interrupt_kind=interrupt_kind,
                resume_token=token,
                settled=settled,
            )
        },
    )
    fields: dict[str, Any] = {"status": status}
    if error_message is not None:
        fields["error_message"] = error_message
    _update_task(task_id, **fields)


def invalidate_agent_graph_cache(flow_id: str | None = None) -> None:
    del flow_id
    global _LC_DESIGN_GRAPH
    _LC_DESIGN_GRAPH = None


def _design_thread_id(task_id: str) -> str:
    return f"design:{str(task_id or '').strip()}"


def _design_graph_retry_policy() -> RetryPolicy:
    from app.core.config import settings

    attempts = max(1, int(getattr(settings, "design_graph_retry_attempts", 3) or 3))
    return RetryPolicy(
        max_attempts=attempts,
        initial_interval=0.5,
        backoff_factor=2.0,
        max_interval=8.0,
    )


def _design_graph_node_timeout() -> TimeoutPolicy | None:
    from app.core.config import settings

    sec = float(getattr(settings, "design_graph_node_timeout_sec", 180.0) or 0.0)
    if sec <= 0:
        return None
    return TimeoutPolicy(run_timeout=sec)


def _get_design_graph_checkpointer() -> Any:
    """Shared durable checkpointer (MySQL 8+ → Sqlite+async-bridge → memory).

    Wallet settle/refund stay on ``_bind_design_hold_fns``, not in graph state.
    When ``design_graph_require_durable_checkpoint`` is set, memory backend is refused
    so pause/resume cannot silently lose checkpoints.
    """
    from app.core.config import settings
    from app.services.llm.agent import checkpointer_backend, get_agent_checkpointer

    cp = get_agent_checkpointer()
    backend = checkpointer_backend()
    _log.debug("design graph checkpointer backend=%s", backend)
    require_durable = bool(
        getattr(settings, "design_graph_require_durable_checkpoint", True)
    )
    if require_durable and backend == "memory":
        raise RuntimeError(
            "design graph requires a durable checkpointer (mysql or sqlite); "
            "got memory. Configure DATABASE_URL / SQLITE checkpointer, or set "
            "DESIGN_GRAPH_REQUIRE_DURABLE_CHECKPOINT=false for ephemeral tests."
        )
    return cp


_CHECKPOINT_SWEEP_STARTED = False


async def sweep_stale_design_checkpoints(*, limit: int = 50) -> dict[str, Any]:
    """Delete checkpoints and expire DB rows for orphaned resumable runs past TTL."""
    from app.core.config import settings

    ttl = float(getattr(settings, "design_run_checkpoint_ttl_hours", 0) or 0)
    if ttl <= 0:
        return {"swept": 0, "candidates": 0, "skipped": True}
    ids = await asyncio.to_thread(
        list_stale_resumable_task_ids,
        ttl_hours=ttl,
        limit=limit,
    )
    swept = 0
    for tid in ids:
        try:
            await cleanup_design_checkpoint(tid)
            ok = await asyncio.to_thread(
                expire_stale_design_task,
                tid,
                reason="checkpoint_ttl_expired",
            )
            if ok:
                swept += 1
        except Exception:
            _log.exception("checkpoint TTL sweep failed task_id=%s", tid)
    return {"swept": swept, "candidates": len(ids), "skipped": False}


def start_design_checkpoint_ttl_scheduler() -> None:
    """Background thread: expire orphaned paused/waiting checkpoints."""
    global _CHECKPOINT_SWEEP_STARTED
    if _CHECKPOINT_SWEEP_STARTED:
        return
    from app.core.config import settings

    ttl = float(getattr(settings, "design_run_checkpoint_ttl_hours", 0) or 0)
    if ttl <= 0:
        return
    interval_h = float(
        getattr(settings, "design_run_checkpoint_sweep_interval_hours", 6.0) or 6.0
    )
    if interval_h <= 0:
        return
    interval_s = max(300.0, interval_h * 3600.0)

    def _loop() -> None:
        time.sleep(min(90.0, interval_s / 12))
        while True:
            try:
                result = asyncio.run(sweep_stale_design_checkpoints(limit=80))
                if not result.get("skipped") and int(result.get("swept") or 0) > 0:
                    _log.info("design checkpoint TTL sweep: %s", result)
            except Exception:
                _log.exception("design checkpoint TTL sweep failed")
            time.sleep(interval_s)

    threading.Thread(
        target=_loop, name="design-checkpoint-ttl", daemon=True
    ).start()
    _CHECKPOINT_SWEEP_STARTED = True
    _log.info(
        "design checkpoint TTL scheduler started ttl_h=%.2f interval_h=%.2f",
        ttl,
        interval_h,
    )


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
    from app.core.config import settings

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
    skill_refs: list[str] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Internal graph runner (public entry: ``design_stream``)."""
    del reserve_hold_fn

    task_id = str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    try:
        from app.services.llm.usage_log import bind_usage_context

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
    skills_catalog, knowledge_catalog, aesthetics_catalog, fonts_catalog = (
        await asyncio.gather(
            asyncio.to_thread(format_skills_catalog, scene=scene_for_cat, user_id=user_id),
            asyncio.to_thread(format_knowledge_catalog, scene=scene_for_cat),
            asyncio.to_thread(format_aesthetics_catalog, scene=scene_for_cat),
            asyncio.to_thread(format_fonts_catalog),
        )
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
            fonts_catalog,
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
    pinned_refs = [
        str(x).strip() for x in (skill_refs or []) if str(x).strip()
    ][:8]
    if pinned_refs:
        rt.flags["skill_refs"] = pinned_refs
    lease = _try_claim_run_lease(task_id)
    if not lease.get("ok"):
        yield {
            "type": "error",
            "message": str(lease.get("error") or "lease_held"),
            "task_id": task_id,
            "owner_id": lease.get("owner_id"),
        }
        return
    _bind_design_hold_fns(task_id, settle_hold_fn, refund_hold_fn)
    _register_active_run(task_id)

    graph = await asyncio.to_thread(_lc_design_graph)
    rt.decision.route = "langgraph:create_agent"
    rt.flow_id = "lc_design"
    rt.flow_version = 1
    rt.run.flow_id = "lc_design"
    rt.run.flow_version = 1
    thread_id = _design_thread_id(task_id)
    merge_task_meta(
        task_id,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=thread_id,
                resumable=True,
                interrupt_kind=None,
            )
        },
    )

    async for ev in _drive_design_graph(
        graph=graph,
        graph_input={"rt": rt, "tick": 0},
        task_id=task_id,
        trace_id=trace_id,
        user_id=user_id,
        thread_id=thread_id,
        hold=hold,
        rules=rules,
        run=run,
        decision=decision,
        refund_hold_fn=refund_hold_fn,
        scene_key=scene_key or "",
        ui_mode=ui_mode,
        run_name=f"lc_design:{task_id[:8]}",
    ):
        yield ev


async def resume_agent_graph(
    *,
    task_id: str,
    user_id: str,
    settle_hold_fn: Any,
    refund_hold_fn: Any,
    resume_token: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Continue a paused / waiting_client / resumable-error design run from checkpoint."""
    tid = str(task_id or "").strip()
    row = get_design_task(tid)
    if not row:
        yield {"type": "error", "message": "task_not_found", "task_id": tid}
        return
    if str(row.get("user_id") or "") != str(user_id or ""):
        yield {"type": "error", "message": "forbidden", "task_id": tid}
        return
    if not task_is_resumable(row):
        yield {
            "type": "error",
            "message": "not_resumable",
            "task_id": tid,
            "status": row.get("status"),
        }
        return

    meta = parse_task_meta(row.get("meta_json"))
    lc = get_run_lifecycle(meta)
    if resume_token:
        expected = str(lc.get("resume_token") or "")
        if expected and expected != str(resume_token).strip():
            yield {"type": "error", "message": "resume_token_mismatch", "task_id": tid}
            return

    lease = _try_claim_run_lease(tid)
    if not lease.get("ok"):
        yield {
            "type": "error",
            "message": str(lease.get("error") or "lease_held"),
            "task_id": tid,
            "owner_id": lease.get("owner_id"),
            "expires_at": lease.get("expires_at"),
        }
        return

    thread_id = str(lc.get("thread_id") or _design_thread_id(tid))
    graph = await asyncio.to_thread(_lc_design_graph)
    config = {"configurable": {"thread_id": thread_id}}
    try:
        snap = await graph.aget_state(config)
    except Exception as err:  # noqa: BLE001
        yield {
            "type": "error",
            "message": f"checkpoint_unavailable:{err}"[:240],
            "task_id": tid,
        }
        return
    values = getattr(snap, "values", None) or {}
    if not values:
        yield {"type": "error", "message": "checkpoint_empty", "task_id": tid}
        return

    rt = values.get("rt")
    if not isinstance(rt, AgentRuntime):
        yield {"type": "error", "message": "checkpoint_corrupt", "task_id": tid}
        return

    run = rt.run
    decision = rt.decision
    trace_id = str(run.trace_id or "")
    hold = int(rt.hold or row.get("hold_credits") or 0)
    rules = rt.rules if isinstance(rt.rules, dict) else {}

    try:
        from app.services.llm.usage_log import bind_usage_context

        bind_usage_context(user_id=user_id, task_id=tid, source="design")
    except Exception:
        pass

    _bind_design_hold_fns(tid, settle_hold_fn, refund_hold_fn)
    _register_active_run(tid)
    mark_design_running(tid)

    # If checkpoint is parked on observe interrupt, resume with FE scene (or timeout).
    pending_scene = _scene_interrupt_from_state(snap)
    graph_input: Any = None
    if pending_scene is not None:
        from app.services.design.runtime.graph.state import _SCENE_WAIT_SEC
        from app.services.design.runtime.scene_feedback import wait_for_scene

        # Use durable scene if posted; else short wait for mid-post FE.
        posted = await wait_for_scene(tid, timeout_sec=min(2.0, float(_SCENE_WAIT_SEC)))
        if posted is not None:
            graph_input = Command(resume=posted)
        else:
            graph_input = Command(resume={"timeout": True})

    merge_task_meta(
        tid,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=thread_id,
                resumable=True,
                interrupt_kind=None,
                resume_token=new_resume_token(),
            )
        },
    )
    yield {
        "type": "status",
        "task_id": tid,
        "trace_id": trace_id,
        "resumed": True,
        "status": STATUS_RUNNING,
        **({"scene_interrupt": True} if pending_scene is not None else {}),
    }

    async for ev in _drive_design_graph(
        graph=graph,
        graph_input=graph_input,
        task_id=tid,
        trace_id=trace_id,
        user_id=user_id,
        thread_id=thread_id,
        hold=hold,
        rules=rules,
        run=run,
        decision=decision,
        refund_hold_fn=refund_hold_fn,
        scene_key=str(rt.scene_key or ""),
        ui_mode=str((rt.flags or {}).get("mode") or rt.mode or "agent"),
        run_name=f"lc_design_resume:{tid[:8]}",
    ):
        yield ev


async def _drive_design_graph(
    *,
    graph: Any,
    graph_input: Any,
    task_id: str,
    trace_id: str,
    user_id: str,
    thread_id: str,
    hold: int,
    rules: dict[str, str],
    run: AgentRunState,
    decision: DesignRunDecision,
    refund_hold_fn: Any,
    scene_key: str,
    ui_mode: str,
    run_name: str,
) -> AsyncIterator[dict[str, Any]]:
    """Shared start/resume driver: stream, pause/cancel, timeout, cleanup."""
    from app.core.config import settings as _settings
    from app.services.llm.agent import langfuse_callback_handler, merge_tracing_config

    run_timeout = float(getattr(_settings, "design_graph_run_timeout_sec", 600.0) or 0.0)
    timeout_resumable = bool(getattr(_settings, "design_run_timeout_resumable", True))
    keep_checkpoint = False
    lf_handler = None
    try:
        lf_handler = langfuse_callback_handler()
        graph_cfg = merge_tracing_config(
            {"configurable": {"thread_id": thread_id}},
            run_name=run_name,
            metadata={
                "task_id": task_id,
                "trace_id": trace_id,
                "user_id": user_id,
                "scene": scene_key or "",
                "mode": ui_mode,
                "langgraph_thread_id": thread_id,
            },
            tags=["design", "lc_design"],
            callbacks=[lf_handler] if lf_handler is not None else None,
        )

        async def _emit_stream() -> AsyncIterator[dict[str, Any]]:
            """Drive graph; bridge scene_feedback interrupts in-process (same SSE)."""
            from app.services.design.runtime.graph.state import _SCENE_WAIT_SEC

            inp: Any = graph_input
            last_hb = 0.0
            while True:
                saw_interrupt: Any = None
                async for item in graph.astream(
                    inp,
                    config=graph_cfg,
                    stream_mode=["custom", "updates"],
                ):
                    now = time.time()
                    if now - last_hb >= 20.0:
                        await asyncio.to_thread(_heartbeat_run_lease_safe, task_id)
                        last_hb = now
                    intent = _get_run_intent(task_id)
                    if intent in (_INTENT_PAUSE, _INTENT_CANCEL):
                        raise asyncio.CancelledError()

                    mode = "custom"
                    data: Any = item
                    if isinstance(item, tuple) and len(item) == 2:
                        mode, data = item[0], item[1]

                    if mode == "updates" and isinstance(data, dict):
                        if "__interrupt__" in data:
                            saw_interrupt = data.get("__interrupt__")
                        continue

                    if mode == "custom" and isinstance(data, dict) and data.get("type"):
                        yield data

                if saw_interrupt is None:
                    try:
                        st_now = await graph.aget_state(graph_cfg)
                        scene_iv = _scene_interrupt_from_state(st_now)
                        if scene_iv is not None:
                            saw_interrupt = (scene_iv,)
                    except Exception:
                        pass

                if saw_interrupt is None:
                    break

                payloads = _interrupt_payloads(saw_interrupt)
                scene_iv = next(
                    (
                        p
                        for p in payloads
                        if isinstance(p, dict) and p.get("kind") == "scene_feedback"
                    ),
                    None,
                )
                if scene_iv is None:
                    # Unknown interrupt — park for external resume.
                    await asyncio.to_thread(
                        _persist_lifecycle,
                        task_id,
                        status=STATUS_WAITING_CLIENT,
                        resumable=True,
                        interrupt_kind="interrupt",
                    )
                    yield {
                        "type": "paused",
                        "task_id": task_id,
                        "trace_id": trace_id,
                        "resumable": True,
                        "interrupt_kind": "interrupt",
                        "resume_token": _resume_token_for(task_id),
                    }
                    raise _SceneInterruptPark()

                timeout_sec = float(_SCENE_WAIT_SEC)
                raw_ms = scene_iv.get("timeout_ms")
                if raw_ms is not None:
                    try:
                        timeout_sec = max(0.5, float(raw_ms) / 1000.0)
                    except Exception:
                        pass

                resume_val = await _resolve_scene_resume_value(
                    task_id, timeout_sec=timeout_sec
                )
                if isinstance(resume_val, dict) and (
                    resume_val.get("paused") or resume_val.get("cancelled")
                ):
                    raise asyncio.CancelledError()

                inp = Command(resume=resume_val)

        try:
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
            keep_checkpoint = False
        except _SceneInterruptPark:
            keep_checkpoint = True
            return
    except TimeoutError:
        err = TimeoutError(f"design graph run timed out after {run_timeout:.0f}s")
        run.note_error(str(err)[:240])
        run.push_log(phase="error", error=str(err)[:240])
        decision.apply(route="error", intent=run.intent)
        await asyncio.to_thread(_persist_task_meta, task_id, decision=decision, state=run)
        if timeout_resumable:
            keep_checkpoint = True
            await asyncio.to_thread(
                _persist_lifecycle,
                task_id,
                status=STATUS_PAUSED,
                resumable=True,
                interrupt_kind="timeout",
                error_message=str(err)[:800],
            )
            yield {"type": "execution_log", **run.to_execution_log()}
            yield {
                "type": "paused",
                "message": _user_facing_run_error(err, rules=rules),
                "task_id": task_id,
                "trace_id": trace_id,
                "resumable": True,
                "interrupt_kind": "timeout",
                "resume_token": _resume_token_for(task_id),
            }
        else:
            try:
                await asyncio.to_thread(refund_hold_fn, user_id, hold, task_id=task_id)
            except Exception:
                pass
            await asyncio.to_thread(
                _persist_lifecycle,
                task_id,
                status=STATUS_ERROR,
                resumable=False,
                interrupt_kind="timeout",
                error_message=str(err)[:800],
            )
            yield {"type": "execution_log", **run.to_execution_log()}
            yield {
                "type": "error",
                "message": _user_facing_run_error(err, rules=rules),
                "task_id": task_id,
                "trace_id": trace_id,
                "refunded_credits": hold,
            }
    except asyncio.CancelledError:
        intent = _get_run_intent(task_id) or _INTENT_PAUSE
        if intent == _INTENT_CANCEL:
            keep_checkpoint = False
            run.note_error("cancelled")
            run.push_log(phase="error", error="cancelled")
            try:
                await asyncio.to_thread(refund_hold_fn, user_id, hold, task_id=task_id)
            except Exception:
                pass
            await asyncio.to_thread(
                _persist_lifecycle,
                task_id,
                status=STATUS_CANCELLED,
                resumable=False,
                interrupt_kind="cancelled",
                error_message="cancelled",
            )
            yield {
                "type": "cancelled",
                "task_id": task_id,
                "trace_id": trace_id,
                "refunded_credits": hold,
            }
            raise
        # Default / explicit pause: keep durable checkpoint for resume.
        keep_checkpoint = True
        run.note_error("paused")
        run.push_log(phase="error", error="paused")
        await asyncio.to_thread(
            _persist_lifecycle,
            task_id,
            status=STATUS_PAUSED,
            resumable=True,
            interrupt_kind="paused",
            error_message="paused",
        )
        yield {
            "type": "paused",
            "task_id": task_id,
            "trace_id": trace_id,
            "resumable": True,
            "interrupt_kind": "paused",
            "resume_token": _resume_token_for(task_id),
        }
        raise
    except Exception as err:  # noqa: BLE001
        run.fatal = str(err) if hasattr(run, "fatal") else None
        try:
            # Keep checkpoint on error when ``design_run_error_resumable``.
            from app.core.config import settings as _s

            keep_on_error = bool(getattr(_s, "design_run_error_resumable", True))
        except Exception:
            keep_on_error = True
        if keep_on_error:
            keep_checkpoint = True
            run.note_error(str(err)[:240])
            run.push_log(phase="error", error=str(err)[:240])
            decision.apply(route="error", intent=run.intent)
            await asyncio.to_thread(_persist_task_meta, task_id, decision=decision, state=run)
            await asyncio.to_thread(
                _persist_lifecycle,
                task_id,
                status=STATUS_ERROR,
                resumable=True,
                interrupt_kind="error",
                error_message=str(err)[:800],
            )
            yield {"type": "execution_log", **run.to_execution_log()}
            yield {
                "type": "paused",
                "message": _user_facing_run_error(err, rules=rules),
                "task_id": task_id,
                "trace_id": trace_id,
                "resumable": True,
                "interrupt_kind": "error",
                "resume_token": _resume_token_for(task_id),
            }
        else:
            keep_checkpoint = False
            try:
                await asyncio.to_thread(refund_hold_fn, user_id, hold, task_id=task_id)
            except Exception:
                pass
            run.note_error(str(err)[:240])
            run.push_log(phase="error", error=str(err)[:240])
            decision.apply(route="error", intent=run.intent)
            await asyncio.to_thread(_persist_task_meta, task_id, decision=decision, state=run)
            await asyncio.to_thread(
                _persist_lifecycle,
                task_id,
                status=STATUS_ERROR,
                resumable=False,
                interrupt_kind="error",
                error_message=str(err)[:800],
            )
            yield {"type": "execution_log", **run.to_execution_log()}
            yield {
                "type": "error",
                "message": _user_facing_run_error(err, rules=rules),
                "task_id": task_id,
                "trace_id": trace_id,
                "refunded_credits": hold,
            }
    finally:
        if not keep_checkpoint:
            await _cleanup_design_thread(graph, thread_id)
        _unbind_design_hold_fns(task_id)
        _unregister_active_run(task_id)
        _release_run_lease_safe(task_id)
        try:
            set_run_intent(task_id, None)
        except Exception:
            pass

