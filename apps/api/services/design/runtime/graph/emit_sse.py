from __future__ import annotations

"""SSE emit helpers and canvas chrome events for graph nodes."""


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


def _should_early_open_artboard(_rt: Any) -> bool:
    """Do not invent an artboard before paint.

    Infinite canvas: shapes/text need no plate. A plate opens only when paint
    emits ``create_frame`` (see ``_emit_canvas_size_from_ops``).
    """
    return False

def _resolve_loading_wh(rt: Any) -> tuple[int, int]:
    """Concrete WxH for early loading plate (client lock or scene stock default)."""
    from services.design.runtime.graph.scene_log import _resolve_wh
    try:
        ow, oh = int(rt.w or 0), int(rt.h or 0)
    except (TypeError, ValueError):
        ow, oh = 0, 0
    if ow > 0 and oh > 0:
        return ow, oh
    return _resolve_wh(
        canvas_size=rt.canvas_size,
        scene_key=str(rt.scene_key or ""),
        rules=rt.rules or {},
        scene_frames=list(rt.scene_frames or []),
        focus_id=str(rt.focus_id or ""),
    )

def _emit_canvas_size_step(
    rt: Any,
    *,
    ow: int,
    oh: int,
    design_loading: bool = True,
    reason: str = "size",
) -> bool:
    """SSE: open loading plate + process row「画布尺寸」so shimmer can start early."""
    if ow <= 0 or oh <= 0:
        return False
    if str(rt.flags.get("mode") or "") == "ask":
        return False
    st = rt.run
    size = f"{ow}x{oh}"
    prev = str(rt.flags.get("artboard_size") or "")
    already = bool(rt.flags.get("artboard_opened")) and prev == size
    if not already:
        _emit(
            {
                "type": "status",
                "task_id": st.task_id,
                "trace_id": st.trace_id,
                "open_artboard": True,
                "canvas_width": ow,
                "canvas_height": oh,
                "canvas_size": size,
                "design_loading": bool(design_loading)
            }
        )
        rt.flags["artboard_opened"] = True
        rt.flags["artboard_size"] = size
    if not explicit_canvas_size(rt.canvas_size):
        rt.canvas_size = size
        rt.w, rt.h = ow, oh
    elif rt.w <= 0 or rt.h <= 0:
        rt.w, rt.h = ow, oh
    # One timeline row per size (skip duplicate same WxH).
    if prev != size:
        # FE i18n: explored + canvas_size: → activityCanvasSizeDone
        _emit(
            {
                "type": "activity",
                "id": f"canvas-size-{st.task_id[:8]}-{size}",
                "kind": "explored",
                "status": "done",
                "stage": "scene",
                "detail": f"canvas_size:{size}",
                "summary": size,
                "index": int(getattr(st, "round", 0) or 0)
            }
        )
        st.push_log(
            phase="canvas_size",
            intent=str(rt.classified_intent or st.intent or ""),
            summary=f"canvas_size {size} ({reason})",
        )
    return True

def _emit_design_loading_artboard(rt: Any) -> bool:
    """Open artboard + shimmer as design loading (after intent, before paint/action)."""
    if str(rt.flags.get("mode") or "") == "ask":
        # Ask waits for user confirm — do not spawn a loading plate yet.
        return False
    if not _should_early_open_artboard(rt):
        return False
    ow, oh = _resolve_loading_wh(rt)
    return _emit_canvas_size_step(
        rt, ow=ow, oh=oh, design_loading=True, reason="intent"
    )

def _emit_canvas_size_from_ops(rt: Any, step_ops: list[dict[str, Any]]) -> bool:
    """Open an artboard only when ops include create_frame.

    Infinite canvas: create_shape / create_text / … do not need a frame plate.
    """
    from services.design.runtime.graph.paint_kit import _wh_from_create_frame_ops
    ow, oh = _wh_from_create_frame_ops(step_ops)
    if ow <= 0 or oh <= 0:
        return False
    return _emit_canvas_size_step(
        rt, ow=ow, oh=oh, design_loading=True, reason="paint_ops"
    )

def _emit_tool_ops_validation_ui(
    rt: Any,
    errors: list[Any] | None,
    *,
    kept: int = 0,
) -> None:
    """Surface tool_ops validation failures in chat (not Admin-only)."""
    from services.design.runtime.graph.paint_kit import _op_error_codes
    errs = [str(e).strip() for e in list(errors or []) if str(e or "").strip()]
    if not errs:
        return
    codes = _op_error_codes(errs)
    code_hint = "、".join(codes[:3]) if codes else "invalid_op"
    if kept > 0:
        detail = f"{len(errs)} 条操作校验失败（已应用 {kept}）：{code_hint}"
    else:
        detail = f"{len(errs)} 条操作校验失败：{code_hint}"
    st = rt.run
    _emit(
        {
            "type": "activity",
            "id": f"validate-ops-{st.task_id[:8]}",
            "kind": "skipped",
            "status": "error",
            "stage": "validate",
            "count": len(errs),
            "detail": detail[:240],
            "summary": "; ".join(errs[:6])[:800],
        }
    )

def _flush_host_events(state: AgentRunState, events: list[dict[str, Any]]) -> None:
    for ev in events or []:
        sk = _as_text(ev.get("switch_kind")).strip()
        reason = _as_text(ev.get("model_reason")).strip()
        if sk == "vision" or "vision" in reason:
            state.vision_used = True
        state.push_log(**ev)

def _emit(ev: dict[str, Any]) -> None:
    try:
        get_stream_writer()(ev)
    except Exception:
        pass

def _paint_user_reply(raw: str | None, *, limit: int = 40) -> str:
    """Short post-paint chat line — never re-emit the decide/thought essay."""
    text = " ".join(str(raw or "").split()).strip()
    if not text:
        return ""
    banned = (
        "tool_ops",
        "create_shape",
        "create_text",
        "create_frame",
        "need_skills",
        "PaintOps",
        "schema",
    )
    low = text.lower()
    if any(b.lower() in low for b in banned) or len(text) > limit:
        return ""
    return text[:limit]

def _emit_deferred_paint_reply(st: AgentRunState, *, ops_sent: bool) -> None:
    """Stream paint reply only after real tool_ops were pushed to the client."""
    if not ops_sent:
        st.reply = ""
        return
    text = _paint_user_reply(st.reply)
    st.reply = text
    if not text:
        return
    _emit({"type": "token", "text": text})

__all__ = [
    '_should_early_open_artboard',
    '_resolve_loading_wh',
    '_emit_canvas_size_step',
    '_emit_design_loading_artboard',
    '_emit_canvas_size_from_ops',
    '_emit_tool_ops_validation_ui',
    '_flush_host_events',
    '_emit',
    '_paint_user_reply',
    '_emit_deferred_paint_reply',
]
