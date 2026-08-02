from __future__ import annotations

"""Scene digest, admin-step logging, and graph control helpers."""


import asyncio
import json
import logging
import re
import threading
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, RetryPolicy, TimeoutPolicy
from pydantic import BaseModel, Field, field_validator, model_validator

from services.agent_memory.service import memory_service
from services.design.admin.admin_store import STAGE_RULE_DEFAULTS
from services.design.admin.task_store import _insert_task, _update_task
from services.design.aesthetics.scorer import (
    format_aesthetics_catalog,
    normalize_need_aesthetics,
    parse_use_user_refs,
    retrieve_aesthetic_refs,
)
from services.design.ops.tool_ops_contract import (
    TOOL_OPS_SCHEMA_VERSION,
    extract_and_validate_tool_ops,
    format_canvas_tools_catalog,
    format_canvas_tools_details,
    format_canvas_tools_for_model,
    format_op_error,
    normalize_need_tools,
    tool_ops_activity_events as _tool_ops_activity_events,
    tool_ops_for_sse,
    validation_failure_reason,
)
from services.design.ops.validate import extract_json_object
from services.design.prompts.knowledge_store import (
    format_knowledge_catalog,
    format_knowledge_details,
    normalize_need_knowledge,
)
from services.design.prompts.prompt_build import _edit_context_block, _finalize_memory_patch
from services.design.prompts.rules_text import _as_text, _rule_text, exec_trace, render_prompt_template
from services.design.prompts.skill_store import (
    filter_ops_by_skill_allowlist,
    filter_need_resources_by_skill_acl,
    format_skills_catalog,
    format_skills_details,
    normalize_need_skills,
    resolve_triggered_skill_keys,
)
from services.design.readpath.canvas_scene import (
    early_status_canvas_fields,
    explicit_canvas_size,
    parse_size as _parse_size,
    resolve_agent_scene,
    scene_key as _scene_key,
)
from services.design.runtime.decision_log import DesignRunDecision
from services.design.runtime.host import (
    assemble_stage_system,
    build_placement_block,
    interaction_mode_rules_pack,
    load_deferred_resources,
    placement_errors_for_free_creates,
    require_prompt_pack,
    validate_paint_ops,
)
from services.design.runtime.host.ops_gate import (
    _normalize_ops_payload,
    _op_name,
    _validate_ops_payload,
)
from services.design.runtime.host.placement import (
    _derive_suggested_place_world,
    _focus_frame_from_rt,
    _format_spatial_placement,
    _placement_errors_for_free_creates,
)
from services.design.runtime.llm_step import stream_skill_step
from services.design.runtime.models_route import (
    CANVAS_WORK_INTENTS,
    clamp_tier,
    classify_user_intent,
    enabled_tiers,
    estimate_task_tier,
    normalize_intent_decision,
    normalize_user_intent,
    paint_ops_intent,
    resolve_model_for_skill,
    router_model_id,
)
from services.design.runtime.pipeline_support import (
    _normalize_ref_images,
    _user_facing_run_error,
)
from services.design.runtime.scene_feedback import begin_wait, wait_for_scene
from services.wallet.db import get_user_tokens
from services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    AgentTurnSchema,
    DecideTurnSchema,
    GraphState,
    PaintOpsSchema,
    PaintToolOp,
    _DEFAULT_MAX_REFLECT,
    _DEFAULT_MAX_ROUNDS,
    _DEFAULT_PAINT_CREATE_TOOLS,
    _DEFAULT_PAINT_EDIT_TOOLS,
    _LEAN_PAINT_PROMPT_CHARS,
    _SCENE_WAIT_SEC,
    _agent_turn_parser,
    _thought_chat_prompt,
)

_log = logging.getLogger(__name__)
logger = _log

_interaction_mode_rules_pack = interaction_mode_rules_pack
_require_prompt_pack = require_prompt_pack


def _clip_admin_step_io(value: Any, *, limit: int) -> Any:
    if not isinstance(value, str):
        return value
    t = value.strip()
    if not t:
        return None
    if len(t) <= limit:
        return t
    return t[:limit] + f"\n…[truncated {len(t) - limit} chars]"

def _slim_admin_steps(
    steps: list[dict[str, Any]],
    *,
    limit: int = 48,
    io_limit: int = 2500,
) -> list[dict[str, Any]]:
    """Compact Admin 运行监测 trail (path + timing + clipped I/O)."""
    keep_keys = (
        "phase",
        "node_id",
        "from_phase",
        "to_phase",
        "intent",
        "paint_lane",
        "summary",
        "reply",
        "error",
        "errors",
        "ops_count",
        "tokens",
        "model",
        "model_reason",
        "task_tier",
        "duration_ms",
        "t_ms",
        "attempt",
        "need_tools",
        "need_skills",
        "need_knowledge",
        "need_aesthetics",
        "dropped_intent",
        "thought",
        "thought_full",
        "llm_system",
        "llm_user",
        "llm_raw",
        "llm_thinking",
        "llm_image_urls",
        "llm_max_tokens",
        "stage",
        "images_hydrated",
        "image_model",
    )
    io_keys = frozenset(
        {
            "reply",
            "thought_full",
            "llm_system",
            "llm_user",
            "llm_raw",
            "llm_thinking",
        }
    )
    out: list[dict[str, Any]] = []
    for step in list(steps or [])[-limit:]:
        if not isinstance(step, dict):
            continue
        slim: dict[str, Any] = {}
        for k in keep_keys:
            if k not in step or step[k] in (None, "", [], {}):
                continue
            v = step[k]
            if k in io_keys:
                v = _clip_admin_step_io(v, limit=io_limit)
                if v is None:
                    continue
            slim[k] = v
        if slim:
            out.append(slim)
    return out

def _slim_failure_steps(steps: list[dict[str, Any]], *, limit: int = 12) -> list[dict[str, Any]]:
    """Compat alias — prefer ``_slim_admin_steps``."""
    return _slim_admin_steps(steps, limit=limit, io_limit=4000)

def _hydrate_srcs_for_log(ops: list[dict[str, Any]] | None) -> list[str] | None:
    urls: list[str] = []
    for op in list(ops or [])[:12]:
        if not isinstance(op, dict):
            continue
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        src = str((args or {}).get("src") or (args or {}).get("url") or "").strip()
        if src:
            urls.append(src[:500])
    return urls or None

def _hydrate_log_kwargs(
    ops: list[dict[str, Any]] | None,
    *,
    img_mid: str,
    n_img: int,
) -> dict[str, Any]:
    from services.design.runtime.graph.llm_io import _clip_llm_raw, _clip_urls
    prompts = _hydrate_prompts_for_log(ops)
    srcs = _hydrate_srcs_for_log(ops)
    return {
        "phase": "hydrate",
        "image_model": img_mid,
        "images_hydrated": int(n_img),
        "summary": f"Host 生图 hydrate ×{int(n_img)} · {img_mid}",
        "hydrate_prompts": prompts,
        "llm_image_urls": _clip_urls(srcs),
        "llm_user": _clip_llm_raw(
            "\n".join(prompts or []) or f"hydrate?{n_img}",
            limit=4000,
        ),
        "llm_raw": _clip_llm_raw(
            "\n".join(f"result_src={u}" for u in (srcs or []))
            or f"filled={n_img} (no src captured)",
            limit=4000,
        )
    }

def _hydrate_prompts_for_log(ops: list[dict[str, Any]] | None) -> list[str] | None:
    """genPrompt / prompt strings used by Host image hydrate."""
    prompts: list[str] = []
    for op in list(ops or [])[:12]:
        if not isinstance(op, dict):
            continue
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        for key in ("genPrompt", "prompt", "src"):
            val = args.get(key)
            if isinstance(val, str) and val.strip():
                prompts.append(f"{key}: {val.strip()[:400]}")
                break
    return prompts or None

def _scene_digest(
    nodes: list[dict[str, Any]],
    frames: list[dict[str, Any]],
    *,
    focus_id: str,
    limit: int = 40,
) -> str:
    lines: list[str] = []
    if focus_id:
        lines.append(f"FOCUS_FRAME_ID: {focus_id}")
    if frames:
        lines.append("SCENE_FRAMES (world x/y):")
        for f in frames[:16]:
            lines.append(
                f"- id={f.get('id')} name={f.get('name') or ''} "
                f"x={f.get('x')} y={f.get('y')} "
                f"w={f.get('w')} h={f.get('h')} empty={f.get('is_empty')}"
            )
    if nodes:
        lines.append("SCENE_NODES:")
        for n in nodes[:limit]:
            lines.append(
                f"- id={n.get('id')} type={n.get('type') or n.get('key')} "
                f"frameId={n.get('frameId') or ''} "
                f"text={(str(n.get('text') or '')[:40])}"
            )
    return "\n".join(lines) if lines else "SCENE: empty"

def _resolve_wh(
    *,
    canvas_size: str | None,
    scene_key: str,
    rules: dict[str, str],
    scene_frames: list[dict[str, Any]],
    focus_id: str,
) -> tuple[int, int]:
    w, h = _parse_size(canvas_size, scene_key, rules)
    if w > 0 and h > 0:
        return w, h
    for f in scene_frames:
        if focus_id and str(f.get("id") or "") != focus_id:
            continue
        try:
            fw, fh = int(f.get("w") or 0), int(f.get("h") or 0)
        except (TypeError, ValueError):
            continue
        if fw > 0 and fh > 0:
            return fw, fh
    for f in scene_frames:
        try:
            fw, fh = int(f.get("w") or 0), int(f.get("h") or 0)
        except (TypeError, ValueError):
            continue
        if fw > 0 and fh > 0:
            return fw, fh
    return 0, 0

def _persist_task_meta(task_id: str, *, decision: DesignRunDecision, state: AgentRunState) -> None:
    """Persist decision + slim step path/timing for Admin; full I/O also in Langfuse."""
    try:
        from config.settings import settings
        from services.llm.agent import langfuse_console_url, langfuse_enabled

        control = "langgraph"
        if state.flow_version:
            control = f"langgraph:v{state.flow_version}"
        exec_log = state.to_execution_log()
        # Always keep a clipped trail so Admin Timeline works on success too.
        # Success uses tighter I/O caps; failures keep more text for local replay.
        exec_log["steps"] = _slim_admin_steps(
            list(state.log or []),
            limit=48,
            io_limit=4000 if not state.painted else 2000,
        )
        if state.t0 > 0:
            exec_log["total_duration_ms"] = max(
                0, int((time.perf_counter() - state.t0) * 1000)
            )
        exec_log["observability"] = "langfuse"
        key_on = langfuse_enabled()
        host = (settings.langfuse_base_url or "https://cloud.langfuse.com").strip().rstrip("/")
        lf_trace = ""
        try:
            lf_trace = str((getattr(state, "langfuse_trace_id", None) or "")).strip()
        except Exception:
            lf_trace = ""
        langfuse = {
            "enabled": key_on,
            "host": host,
            "projectId": (settings.langfuse_project_id or "").strip() or None,
            "consoleUrl": langfuse_console_url(task_id=task_id, trace_id=lf_trace or None),
            "taskId": task_id,
            "traceId": lf_trace or None,
            "hint": "在 Langfuse 用 metadata.task_id 搜索本任务"
        }
        _update_task(
            task_id,
            meta_json=json.dumps(
                {
                    "control": control,
                    "flow_id": state.flow_id or None,
                    "flow_version": state.flow_version or None,
                    "trace_id": state.trace_id,
                    "decision_log": decision.to_log(),
                    "execution_log": exec_log,
                    "langfuse": langfuse
                },
                ensure_ascii=False,
            ),
        )
    except Exception:
        _log.exception("persist execution_log failed task=%s", task_id)

def _log_graph_hop(
    st: AgentRunState,
    *,
    frm: str,
    to: str,
    **extra: Any,
) -> None:
    """Record graph hop in Admin step path (from → to)."""
    frm_phase = str(frm or "").strip() or "?"
    to_phase = str(to or "").strip() or "?"
    st.current_node_id = frm_phase
    hop: dict[str, Any] = {
        "phase": "graph",
        "from_phase": frm_phase,
        "to_phase": to_phase,
        "summary": f"{frm_phase} → {to_phase}",
    }
    for k, v in extra.items():
        if v is not None:
            hop[k] = v
    st.push_log(**hop)

def _bump(rt: AgentRuntime) -> dict[str, Any]:
    # Never let callables ride into LangGraph checkpoints.
    rt.settle_hold_fn = None
    rt.refund_hold_fn = None
    return {"rt": rt, "tick": int(rt.run.round) + len(rt.run.log)}

def _goto_cmd(rt: AgentRuntime, *, frm: str, to: str, **extra: Any) -> Command:
    """Log graph_hop then jump — so mid-run 复盘 shows path even before settle."""
    _log_graph_hop(rt.run, frm=frm, to=to, **extra)
    return Command(update=_bump(rt), goto=to)

def _commit(rt: AgentRuntime) -> Command:
    """Compat: update-only (no goto) for tests."""
    return Command(update=_bump(rt))

async def _persist_progress(rt: AgentRuntime) -> None:
    """Flush execution_log while status=running so Admin 复盘 is not empty mid-flight."""
    try:
        await asyncio.to_thread(
            _persist_task_meta,
            rt.run.task_id,
            decision=rt.decision,
            state=rt.run,
        )
    except Exception:
        _log.exception("persist progress failed task=%s", rt.run.task_id)

__all__ = [
    '_clip_admin_step_io',
    '_slim_admin_steps',
    '_slim_failure_steps',
    '_hydrate_srcs_for_log',
    '_hydrate_log_kwargs',
    '_hydrate_prompts_for_log',
    '_scene_digest',
    '_resolve_wh',
    '_persist_task_meta',
    '_log_graph_hop',
    '_bump',
    '_goto_cmd',
    '_commit',
    '_persist_progress',
]
