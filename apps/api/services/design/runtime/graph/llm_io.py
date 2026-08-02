from __future__ import annotations

"""LLM streaming, persona, and prompt-text helpers for graph nodes."""


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


def _prompt_text(
    rules: dict[str, str] | None, key: str, **variables: Any
) -> str:
    """Admin/DB pack → LangChain PromptTemplate (every kind)."""
    try:
        from services.design.prompts.prompt_pack_store import render_prompt_body

        return render_prompt_body(key, rules=rules, **variables)
    except Exception:
        got = _rule_text(rules, key).strip()
        if not got:
            got = str(STAGE_RULE_DEFAULTS.get(key) or "").strip()
        return render_prompt_template(got, **variables) if got else ""

def _model_display_label(model_id: str) -> str:
    mid = _as_text(model_id).strip()
    if not mid:
        return "unknown"
    try:
        from services.llm.catalog_store import get_model

        row = get_model(mid)
        if isinstance(row, dict):
            lab = str(row.get("label") or "").strip()
            if lab:
                return lab
    except Exception:
        pass
    return mid

def _resolve_agent_persona(
    rules: dict[str, str] | None,
    user_selected_model: str | None,
) -> str:
    """IDENTITY from design_global_rule (Admin 模型路由); empty if unset."""
    mid = _as_text(user_selected_model or "auto").strip() or "auto"
    low = mid.lower()
    rules = rules or {}
    if not mid or low == "auto":
        return _prompt_text(rules, "agent.persona.auto").strip()
    return _prompt_text(
        rules, "agent.persona.locked", model_label=_model_display_label(mid)
    ).strip()

def _flag_on(rules: dict[str, str] | None, key: str, default: str = "0") -> bool:
    raw = _rule_text(rules, key, default).strip().lower()
    if not raw:
        raw = default.strip().lower()
    return raw in ("1", "true", "on", "yes")

def _chat_fallback_text(rt: Any) -> str:
    """Render agent.prompt.chat_fallback with persona + prompt slots filled."""
    rules = getattr(rt, "rules", None)
    rules_d = rules if isinstance(rules, dict) else None
    persona = str(getattr(rt, "persona", "") or "").strip()
    if not persona:
        persona = _prompt_text(
            rules_d, "agent.prompt.default_assistant_name"
        ).strip()
    prompt = str(getattr(rt, "prompt", "") or "")[:80]
    out = _prompt_text(
        rules_d,
        "agent.prompt.chat_fallback",
        persona=persona,
        prompt=prompt,
    ).strip()
    if out:
        return out
    tmpl = str(getattr(rt, "chat_fallback_tmpl", "") or "").strip()
    if not tmpl:
        return ""
    return render_prompt_template(tmpl, persona=persona, prompt=prompt)

async def _stream_llm_text(
    *,
    model_family: str,
    system: str,
    user: str,
    rules: dict[str, str],
    images: list[str] | None = None,
    max_tokens: int = 1024,
    enable_thinking: bool = False,
    live_emit: bool = False,
) -> tuple[str, str, int, list[dict[str, Any]], str]:
    """Returns (family, content, tokens, host_events, thinking_text).

    When ``live_emit`` is True, push non-JSON ``token`` crumbs for plain-text
    turns. Raw chain-of-thought is never SSE'd (leaks protocol / MEMORY);
    callers emit a short parsed ``thought`` for the UI instead.
    """
    from services.design.runtime.graph.emit_sse import _emit
    family = model_family
    content = ""
    thinking = ""
    used = 0
    events: list[dict[str, Any]] = []
    pending_reason: str | None = None
    json_body = False
    async for kind, piece in stream_skill_step(
        model_family=family,
        system=system,
        user=user,
        max_tokens=max_tokens,
        images=images,
        enable_thinking=enable_thinking,
        rules=rules,
        allow_vision_switch=True,
    ):
        if kind == "model" and isinstance(piece, str) and piece.strip():
            new_f = piece.strip()
            if new_f != family:
                events.append(
                    {
                        "phase": "model_switch",
                        "from_model": family,
                        "model": new_f,
                        "switch_kind": "vision",
                        "summary": f"{family} → {new_f}"
                    }
                )
            family = new_f
            continue
        if kind == "model_reason" and isinstance(piece, str) and piece.strip():
            reason = piece.strip()
            if events and events[-1].get("phase") == "model_switch":
                events[-1]["model_reason"] = reason
            else:
                pending_reason = reason
            continue
        if kind == "images_skipped":
            events.append(
                {
                    "phase": "model_switch",
                    "from_model": family,
                    "model": family,
                    "switch_kind": "vision_failed",
                    "images_skipped": True,
                    "error": str(piece),
                    "summary": "看图不可用，降级为纯文本"
                }
            )
            continue
        if kind == "usage":
            used = int(piece) if isinstance(piece, int) else used
            continue
        if kind == "thinking" and isinstance(piece, str):
            thinking += piece
            continue
        if kind == "token" and isinstance(piece, str):
            if not content and not json_body:
                lead = piece.lstrip()[:1]
                json_body = lead in ("{", "[")
            content += piece
            # Structured JSON turns: do not flood the chat with raw `{...}` crumbs.
            if live_emit and piece and not json_body:
                _emit({"type": "token", "text": piece})
            continue
    if pending_reason and events:
        for ev in reversed(events):
            if ev.get("phase") == "model_switch" and not ev.get("model_reason"):
                ev["model_reason"] = pending_reason
                break
    if used <= 0:
        used = max(1, (len(content) + len(thinking)) // 3)
    return family, content, used, events, thinking

def _ui_thought_text(thought: str | None, *, limit: int = 600) -> str:
    """Chat-fold thought line — readable length, still clip runaway protocol dumps."""
    t = " ".join(str(thought or "").split())
    if not t:
        return ""
    if len(t) <= limit:
        return t
    return t[: max(1, limit - 1)].rstrip() + "…"

def _thinking_field(thinking: str | None) -> dict[str, Any]:
    t = _clip_llm_raw(thinking, limit=8000)
    return {"llm_thinking": t} if t else {}

def _resolve_and_log_model(
    state: AgentRunState,
    *,
    skill: dict[str, Any],
    user_selected_model: str | None,
    run_mode: str,
    prompt: str,
    rules: dict[str, str],
    scene: str | None,
    attempt: int,
    has_images: bool,
) -> tuple[str, str]:
    """Resolve model for this skill step and write a model_route log row."""
    prev = (state.family or "").strip()
    family, reason = resolve_model_for_skill(
        skill=skill,
        user_selected_model=user_selected_model,
        run_mode=run_mode,
        prompt=prompt,
        rules=rules,
        scene=scene,
        attempt=attempt,
        has_images=has_images,
    )
    state.family = family
    if "vision" in (reason or ""):
        state.vision_used = True
    changed = bool(prev) and prev != family
    state.push_log(
        phase="model_route",
        skill_key=str(skill.get("skill_key") or skill.get("name") or "") or None,
        from_model=prev or None,
        model=family,
        model_reason=reason,
        task_tier=state.task_tier or None,
        has_images=bool(has_images) or None,
        vision=True if "vision" in (reason or "") else None,
        run_mode=run_mode or None,
        attempt=int(attempt) if attempt is not None else None,
        user_selected_model=(user_selected_model or "auto"),
        llm_user=_clip_llm_raw(
            f"resolve_model skill={skill.get('skill_key') or skill.get('name')}\n"
            f"run_mode={run_mode}\nattempt={attempt}\n"
            f"has_images={has_images}\n"
            f"user_selected={user_selected_model or 'auto'}\n"
            f"scene={scene or '-'}\n"
            f"reason={reason}\n"
            f"prompt={ (prompt or '')[:600] }",
            limit=2000,
        ),
        summary=(
            f"{prev} → {family}"
            if changed
            else f"选用 {family}"
        ),
    )
    return family, reason

def _clip_llm_raw(raw: str | None, *, limit: int = 12000) -> str | None:
    """Full model return text for Admin 运行复盘 (vision / ReAct / plan / …)."""
    t = (raw or "").strip()
    if not t:
        return None
    if len(t) <= limit:
        return t
    return t[:limit] + f"\n?[truncated {len(t) - limit} chars]"

def _clip_urls(urls: list[str] | None, *, limit: int = 8, each: int = 500) -> list[str] | None:
    out: list[str] = []
    for u in list(urls or []):
        s = str(u or "").strip()
        if not s:
            continue
        out.append(s if len(s) <= each else s[:each] + "?")
        if len(out) >= limit:
            break
    return out or None

def _llm_io_fields(
    *,
    system: str | None = None,
    user: str | None = None,
    images: list[str] | None = None,
    max_tokens: int | None = None,
    system_limit: int = 10000,
    user_limit: int = 20000,
) -> dict[str, Any]:
    """Fields for Admin 复盘: everything sent to the LLM this call."""
    out: dict[str, Any] = {}
    sys_t = _clip_llm_raw(system, limit=system_limit)
    if sys_t:
        out["llm_system"] = sys_t
    user_t = _clip_llm_raw(user, limit=user_limit)
    if user_t:
        out["llm_user"] = user_t
    urls = _clip_urls(images)
    if urls:
        out["llm_image_urls"] = urls
        out["images"] = len(urls)
    if max_tokens is not None:
        out["llm_max_tokens"] = int(max_tokens)
    return out

def _int_rule(rules: dict[str, str], key: str, default: int) -> int:
    raw = _rule_text(rules, key).strip()
    if not raw:
        return default
    try:
        return max(0, int(float(raw)))
    except ValueError:
        return default

async def _llm_ux_reply(
    rt: Any,
    *,
    situation: str,
    facts: str = "",
    max_tokens: int = 120,
) -> str:
    """Short assistant copy from Admin packs — never hardcode locale/policy strings."""
    prompt = _as_text(getattr(rt, "prompt", "") or "").strip()[:1200]
    system = _prompt_text(getattr(rt, "rules", None) or {}, "agent.prompt.ux_reply_system").strip()
    if not system:
        raise RuntimeError(
            "missing prompt pack: agent.prompt.ux_reply_system "
            "(Admin → 提示词包 / design_prompt_packs_seed)"
        )
    user = (
        f"Situation: {situation}\n"
        f"Facts: {(facts or '(none)').strip()[:800]}\n"
        f"User request:\n{prompt or '(empty)'}\n"
        "Write only the assistant reply."
    )
    try:
        _fam, content, used, _host, _think = await _stream_llm_text(
            model_family=router_model_id(getattr(rt, "rules", None) or {}),
            system=system,
            user=user,
            rules=getattr(rt, "rules", None) or {},
            max_tokens=max_tokens,
            live_emit=False,
        )
        st = getattr(rt, "run", None)
        if st is not None and used:
            try:
                st.total_tokens += int(used)
            except Exception:
                pass
        text = (content or "").strip()
        if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'“”":
            text = text[1:-1].strip()
        return text[:500]
    except Exception:
        _log.exception("llm ux reply failed")
        return ""

__all__ = [
    '_prompt_text',
    '_model_display_label',
    '_resolve_agent_persona',
    '_flag_on',
    '_chat_fallback_text',
    '_stream_llm_text',
    '_ui_thought_text',
    '_thinking_field',
    '_resolve_and_log_model',
    '_clip_llm_raw',
    '_clip_urls',
    '_llm_io_fields',
    '_int_rule',
    '_llm_ux_reply',
    '_interaction_mode_rules_pack',
    '_require_prompt_pack',
]
