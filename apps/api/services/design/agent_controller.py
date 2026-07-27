"""Design Agent LangGraph controller.

Published Admin flow is the runtime graph. Host: hold → bootstrap → flow nodes
→ settle. Intent chat|ask|done|edit|create drives edges; tools = canvas tool_ops.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, TypedDict

from services.agent_memory.service import memory_service
from services.design.canvas_scene import (
    parse_size as _parse_size,
    resolve_agent_scene,
    scene_key as _scene_key,
)
from services.design.decision_log import DesignRunDecision
from services.design.llm_step import stream_skill_step
from services.design.models_route import (
    clamp_tier,
    enabled_tiers,
    estimate_task_tier,
    resolve_model_for_skill,
)
from services.design.pipeline_support import (
    _normalize_ref_images,
    _user_facing_run_error,
)
from services.design.prompt_build import _edit_context_block, _finalize_memory_patch
from services.design.rules_text import _as_text, _rule_text, exec_trace
from services.design.scene_feedback import begin_wait, wait_for_scene
from services.design.task_store import _insert_task, _update_task
from services.design.tool_ops_contract import (
    TOOL_OPS_SCHEMA_VERSION,
    extract_and_validate_tool_ops,
    format_canvas_tools_catalog,
    format_canvas_tools_details,
    format_canvas_tools_for_model,
    normalize_need_tools,
    tool_ops_activity_events as _tool_ops_activity_events,
    tool_ops_for_sse,
    validation_failure_reason,
)
from services.design.knowledge_store import (
    format_knowledge_catalog,
    format_knowledge_details,
    normalize_need_knowledge,
)
from services.design.aesthetics.scorer import (
    format_aesthetics_catalog,
    normalize_need_aesthetics,
    parse_use_user_refs,
    retrieve_aesthetic_refs,
)
from services.design.validate import extract_json_object
from services.design.admin_store import STAGE_RULE_DEFAULTS
from services.wallet.db import get_user_tokens

_log = logging.getLogger(__name__)

# Defaults when Admin global rules are empty (zero-base).
_DEFAULT_MAX_ROUNDS = 4
_DEFAULT_MAX_REFLECT = 1
_SCENE_WAIT_SEC = 12.0

# Appended when agent.react.defer_tools is on (catalog-first; details on need_*).
_NEED_TOOLS_OVERLAY = (
    "DEFER_RESOURCES：完整工具 schema、知识正文、美学参考不在 system 中。"
    "短目录只列出你可以申请的内容。\n"
    "输出一个 JSON 对象（允许额外字段）：\n"
    "{\n"
    '  "thought": "...",\n'
    '  "intent": "chat|ask|done|edit|create",\n'
    '  "reply": "...",\n'
    '  "need_tools": ["create_text"],\n'
    '  "need_knowledge": ["palette","layout"],\n'
    '  "need_aesthetics": false,\n'
    '  "use_user_refs": false,\n'
    '  "tool_ops": [],\n'
    '  "done": true\n'
    "}\n"
    "规则：\n"
    "- chat / ask / done：必须写 reply；need_*=空/false；tool_ops=[]；done=true。\n"
    "- edit / create 且尚未拿到详情：按需设置 need_tools / need_knowledge / need_aesthetics"
    "（只能从目录中选）；tool_ops=[]；done=false。Host 会在下一回合注入详情。\n"
    "- 同一回合可同时申请多种资源（工具 + 知识 + 美学）。\n"
    "- 附件：阅读 USER_PROMPT — 不要默认附件=风格参考。\n"
    "  仅当用户要匹配/模仿附件风格（配色/照着这张/同款）时 use_user_refs=true。\n"
    "  附件是 logo/照片位、纯内容素材，或用户拒绝风格参考"
    "（不要参考/别学这张/不要这张的风格）时 use_user_refs=false。\n"
    "  need_aesthetics=true + use_user_refs=false → 语料质量阶梯；\n"
    "  need_aesthetics=true + use_user_refs=true → Host 从附件抽取令牌。\n"
    "- 出现 TOOL_DETAILS / KNOWLEDGE_DETAILS / AESTHETIC_REFS 时：输出 tool_ops；"
    "清空对应 need_*；不要重复申请同一资源。\n"
    "- 不要发明目录中不存在的 op 名或知识 kind。"
)


def _prompt_text(rules: dict[str, str] | None, key: str) -> str:
    """Admin design_global_rule first; STAGE_RULE_DEFAULTS only if DB row empty."""
    got = _rule_text(rules, key).strip()
    if got:
        return got
    return str(STAGE_RULE_DEFAULTS.get(key) or "").strip()


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
        return _rule_text(rules, "agent.persona.auto").strip()
    tmpl = _rule_text(rules, "agent.persona.locked").strip()
    if not tmpl:
        return ""
    return tmpl.replace("{model_label}", _model_display_label(mid))


@dataclass
class AgentRunState:
    """P1.2 explicit run state for ReAct + audit."""

    trace_id: str
    task_id: str
    goal: str
    round: int = 0
    intent: str = "chat"
    reply: str = ""
    # Quick-reply chips for ask mode (surfaced in result.choices).
    choices: list[str] = field(default_factory=list)
    # Ask mode: validated ops held until user picks apply_choice (model-named).
    proposed_ops: list[dict[str, Any]] = field(default_factory=list)
    # Ask mode: which choices[] label applies proposed_ops (from model JSON).
    apply_choice: str = ""
    errors: list[str] = field(default_factory=list)
    applied_ops: list[dict[str, Any]] = field(default_factory=list)
    reflect_left: int = 1
    reflect_note: str = ""
    painted: bool = False
    total_tokens: int = 0
    family: str = "doubao"
    plan: list[str] = field(default_factory=list)
    dual_picked: bool = False
    images_hydrated: int = 0
    # Host-side image gen (Seedream etc.) — not ReAct chat tokens.
    images_used: dict[str, int] = field(default_factory=dict)
    # simple | medium | complex — from precheck.task_tiers matrix
    task_tier: str = ""
    # True when look-at-image (vision model) was selected or switched to
    vision_used: bool = False
    # Deferred tools: op_keys whose full details were injected this run.
    tools_loaded: list[str] = field(default_factory=list)
    # Deferred knowledge kinds injected this run.
    knowledge_loaded: list[str] = field(default_factory=list)
    # Deferred aesthetics refs injected this run.
    aesthetics_loaded: bool = False
    # Published Admin flow identity (for 运行复盘).
    flow_id: str = ""
    flow_version: int = 0
    current_node_id: str = ""
    log: list[dict[str, Any]] = field(default_factory=list)

    def push_log(self, **row: Any) -> None:
        entry = {"round": self.round, **{k: v for k, v in row.items() if v is not None}}
        if self.current_node_id and "node_id" not in entry:
            entry["node_id"] = self.current_node_id
        self.log.append(entry)
        if len(self.log) > 180:
            self.log = self.log[-180:]

    def note_images(self, model_id: str, count: int) -> None:
        n = max(0, int(count or 0))
        mid = (model_id or "").strip()
        if n <= 0 or not mid:
            return
        self.images_hydrated += n
        self.images_used[mid] = self.images_used.get(mid, 0) + n

    def note_error(self, err: str) -> None:
        e = (err or "").strip()
        if not e:
            return
        self.errors.append(e[:240])
        if len(self.errors) > 20:
            self.errors = self.errors[-20:]
        self.reflect_note = e[:500]

    def to_execution_log(self) -> dict[str, Any]:
        models_used: dict[str, int] = {}
        for step in self.log:
            mid = _as_text(step.get("model")).strip()
            if not mid:
                continue
            # Skip pure image / route markers without tokens when model is image-only step
            try:
                tok = int(step.get("tokens") or 0)
            except (TypeError, ValueError):
                tok = 0
            phase = _as_text(step.get("phase")).strip()
            # Route / switch / hydrate markers — tokens live on LLM phases.
            if phase in (
                "route",
                "model_route",
                "model_switch",
                "hydrate",
                "need_tools",
                "tool_details",
                "need_knowledge",
                "knowledge_details",
                "need_aesthetics",
                "aesthetics_details",
                "clarify",
            ) and tok <= 0:
                continue
            models_used[mid] = models_used.get(mid, 0) + max(0, tok)
        return {
            "trace_id": self.trace_id,
            "task_id": self.task_id,
            "goal": (self.goal or "")[:2000],
            "round": self.round,
            "intent": self.intent,
            "errors": list(self.errors),
            "ops_count": len(self.applied_ops),
            "painted": self.painted,
            "total_tokens": self.total_tokens,
            "model": self.family,
            "task_tier": self.task_tier or None,
            "vision_used": bool(self.vision_used),
            "models_used": [
                {"model": mid, "tokens": tok} for mid, tok in models_used.items()
            ],
            "images_hydrated": self.images_hydrated,
            "images_used": [
                {"model": mid, "count": n} for mid, n in self.images_used.items()
            ],
            "plan": list(self.plan),
            "dual_picked": self.dual_picked,
            "tools_loaded": list(self.tools_loaded),
            "knowledge_loaded": list(self.knowledge_loaded),
            "aesthetics_loaded": bool(self.aesthetics_loaded),
            "flow_id": self.flow_id or None,
            "flow_version": self.flow_version or None,
            "steps": list(self.log),
        }


def _flag_on(rules: dict[str, str] | None, key: str, default: str = "0") -> bool:
    raw = _rule_text(rules, key, default).strip().lower()
    if not raw:
        raw = default.strip().lower()
    return raw in ("1", "true", "on", "yes")


def _wants_short_plan(prompt: str, *, rules: dict[str, str]) -> bool:
    """P2.2: short plan for create-ish / long briefs when Admin enables."""
    if not _flag_on(rules, "agent.react.short_plan", "0"):
        return False
    p = (prompt or "").strip()
    if len(p) >= 36:
        return True
    keys = (
        "海报",
        "整页",
        "官网",
        "落地页",
        "landing",
        "一套",
        "完整",
        "做一张",
        "设计一张",
        "创建海报",
        "banner",
        "主视觉",
    )
    return any(k in p for k in keys)


def _parse_plan(content: str) -> list[str]:
    obj = extract_json_object(content) or {}
    raw = obj.get("plan")
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        s = _as_text(item).strip()
        if s:
            out.append(s[:24])
        if len(out) >= 5:
            break
    return out[:5] if len(out) >= 2 else out


def _score_ops_candidate(ops: list[dict[str, Any]], errors: list[str]) -> int:
    """Higher is better. Used by dual-sample pick."""
    if not ops:
        return -1000 - 40 * len(errors or [])
    return 10 * len(ops) - 50 * len(errors or [])


def _validate_ops_payload(
    raw: Any,
    *,
    nodes: list[dict[str, Any]],
    frames: list[dict[str, Any]],
    rules: dict[str, str],
) -> tuple[list[dict[str, Any]], list[str]]:
    step_ops, op_errors = extract_and_validate_tool_ops(
        _normalize_ops_payload(raw),
        scene_nodes=nodes,
        scene_frames=frames,
        rules=rules,
    )
    if not step_ops and isinstance(raw, str):
        step_ops, op_errors = extract_and_validate_tool_ops(
            raw,
            scene_nodes=nodes,
            scene_frames=frames,
            rules=rules,
        )
    return step_ops, op_errors


def _ops_have_create_frame(ops: list[dict[str, Any]]) -> bool:
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("op_key") or "").strip()
        if name == "create_frame":
            return True
    return False


def _wh_from_create_frame_ops(ops: list[dict[str, Any]]) -> tuple[int, int]:
    """First create_frame width/height in a validated op batch."""
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("op_key") or "").strip()
        if name != "create_frame":
            continue
        args = o.get("args") if isinstance(o.get("args"), dict) else {}
        try:
            fw = int(args.get("width") or args.get("w") or 0)
            fh = int(args.get("height") or args.get("h") or 0)
        except (TypeError, ValueError):
            continue
        if fw > 0 and fh > 0:
            return fw, fh
    return 0, 0


def _strip_create_frame_ops(ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Host opens the artboard; drop model create_frame to avoid a second plate."""
    out: list[dict[str, Any]] = []
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("op_key") or "").strip()
        if name == "create_frame":
            continue
        out.append(o)
    return out


def _ops_payload_nonempty(raw: Any) -> bool:
    if isinstance(raw, list) and raw:
        return True
    if isinstance(raw, dict):
        inner = raw.get("ops") or raw.get("tool_ops")
        return isinstance(inner, list) and bool(inner)
    return False


async def _stream_llm_text(
    *,
    model_family: str,
    system: str,
    user: str,
    rules: dict[str, str],
    images: list[str] | None = None,
    max_tokens: int = 1024,
) -> tuple[str, str, int, list[dict[str, Any]], str]:
    """Returns (family, content, tokens, host_events, thinking_text)."""
    family = model_family
    content = ""
    thinking = ""
    used = 0
    events: list[dict[str, Any]] = []
    pending_reason: str | None = None
    async for kind, piece in stream_skill_step(
        model_family=family,
        system=system,
        user=user,
        max_tokens=max_tokens,
        images=images,
        enable_thinking=False,
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
                        "summary": f"{family} → {new_f}",
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
                    "summary": "看图不可用，降级为纯文本",
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
            content += piece
    if pending_reason and events:
        for ev in reversed(events):
            if ev.get("phase") == "model_switch" and not ev.get("model_reason"):
                ev["model_reason"] = pending_reason
                break
    if used <= 0:
        used = max(1, len(content) // 3)
    return family, content, used, events, thinking


def _thinking_field(thinking: str | None) -> dict[str, Any]:
    t = _clip_llm_raw(thinking, limit=8000)
    return {"llm_thinking": t} if t else {}


def _op_errors_for_log(errors: list[Any] | None, *, limit: int = 20) -> list[str] | None:
    out: list[str] = []
    for e in list(errors or [])[:limit]:
        s = str(e or "").strip()
        if s:
            out.append(s[:400])
    return out or None


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
            "\n".join(prompts or []) or f"hydrate×{n_img}",
            limit=4000,
        ),
        "llm_raw": _clip_llm_raw(
            "\n".join(f"result_src={u}" for u in (srcs or []))
            or f"filled={n_img} (no src captured)",
            limit=4000,
        ),
    }


def _flush_host_events(state: AgentRunState, events: list[dict[str, Any]]) -> None:
    for ev in events or []:
        sk = _as_text(ev.get("switch_kind")).strip()
        reason = _as_text(ev.get("model_reason")).strip()
        if sk == "vision" or "vision" in reason:
            state.vision_used = True
        state.push_log(**ev)


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


def _short_ui_thought(raw: str, *, intent: str) -> str:
    """One short progress line for live SSE — never schema / ReAct meta."""
    t = (raw or "").strip()
    banned = (
        "intent",
        "tool_ops",
        "done",
        "json",
        "react",
        "schema",
        "输出",
        "契约",
        "字段",
    )
    low = t.lower()
    if any(b in low for b in banned) or len(t) > 40:
        return {
            "chat": "打招呼",
            "ask": "确认需求",
            "done": "完成",
            "edit": "编辑画布",
            "create": "创建内容",
        }.get(intent, "处理中")
    return t[:24]


def _full_thought_for_log(raw: str, *, limit: int = 4000) -> str | None:
    """Persist model thought for admin replay (not the SSE short line)."""
    t = (raw or "").strip()
    if not t:
        return None
    return t[:limit]


def _clip_llm_raw(raw: str | None, *, limit: int = 12000) -> str | None:
    """Full model return text for Admin 运行复盘 (vision / ReAct / plan / …)."""
    t = (raw or "").strip()
    if not t:
        return None
    if len(t) <= limit:
        return t
    return t[:limit] + f"\n…[truncated {len(t) - limit} chars]"


def _clip_urls(urls: list[str] | None, *, limit: int = 8, each: int = 500) -> list[str] | None:
    out: list[str] = []
    for u in list(urls or []):
        s = str(u or "").strip()
        if not s:
            continue
        out.append(s if len(s) <= each else s[:each] + "…")
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


def _ops_for_log(ops: list[dict[str, Any]] | None, *, limit: int = 30) -> list[dict[str, Any]]:
    """Compact tool ops for execution_log (name + truncated args)."""
    out: list[dict[str, Any]] = []
    for op in list(ops or [])[:limit]:
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or op.get("op") or op.get("tool") or "").strip()
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        slim: dict[str, Any] = {}
        for k, v in list(args.items())[:12]:
            key = str(k)[:48]
            if isinstance(v, (int, float, bool)) or v is None:
                slim[key] = v
            elif isinstance(v, str):
                slim[key] = v[:160]
            elif isinstance(v, (list, dict)):
                slim[key] = str(v)[:160]
            else:
                slim[key] = str(v)[:80]
        row: dict[str, Any] = {"name": name or "op"}
        if slim:
            row["args"] = slim
        out.append(row)
    return out


def _int_rule(rules: dict[str, str], key: str, default: int) -> int:
    raw = _rule_text(rules, key).strip()
    if not raw:
        return default
    try:
        return max(0, int(float(raw)))
    except ValueError:
        return default


def _normalize_ops_payload(raw: Any) -> Any:
    """Accept op_key / ops aliases before schema validate."""
    if isinstance(raw, list):
        out = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            d = dict(item)
            if not (d.get("name") or d.get("type") or d.get("op") or d.get("tool")):
                ok = str(d.get("op_key") or d.get("opKey") or "").strip()
                if ok:
                    d["name"] = ok
            out.append(d)
        return out
    if isinstance(raw, dict):
        inner = raw.get("ops") or raw.get("tool_ops")
        if isinstance(inner, list):
            return {"ops": _normalize_ops_payload(inner)}
        return raw
    return raw


def _fresh_knowledge_kinds(
    need_knowledge: list[str], *, knowledge_loaded: list[str]
) -> list[str]:
    if not need_knowledge:
        return []
    if "*" in need_knowledge:
        return list(need_knowledge)
    fresh = [k for k in need_knowledge if k not in knowledge_loaded]
    return fresh or list(need_knowledge)


def _fetch_deferred_knowledge(*, kinds: list[str], scene: str) -> dict[str, Any]:
    details = format_knowledge_details(kinds=kinds, scene=scene)
    return {"kinds": list(kinds), "details": details or ""}


def _fetch_deferred_tools(*, keys: list[str], rules: dict[str, str]) -> dict[str, Any]:
    details = format_canvas_tools_details(keys, rules=rules)
    return {"keys": list(keys), "details": details or ""}


def _fetch_deferred_aesthetics(
    *,
    prompt: str,
    scene: str,
    canvas_w: int,
    canvas_h: int,
    user_ref_urls: list[str],
    use_user_refs: bool,
) -> dict[str, Any]:
    try:
        rag = retrieve_aesthetic_refs(
            prompt=prompt,
            scene=scene,
            canvas_w=canvas_w,
            canvas_h=canvas_h,
            user_ref_urls=user_ref_urls,
            use_user_refs=use_user_refs,
        )
    except Exception as exc:
        _log.exception("retrieve_aesthetic_refs failed")
        return {
            "ok": False,
            "guidance": "",
            "imageUrls": [],
            "status": "error",
            "reason": str(exc),
            "usedClip": False,
            "userRefCount": len(user_ref_urls or []),
            "corpusIds": [],
            "ms": 0,
            "mode": "error",
        }
    guidance = str(rag.get("guidance") or "").strip()
    img_urls = [
        str(u).strip() for u in (rag.get("imageUrls") or []) if str(u).strip()
    ][:4]
    return {
        "ok": bool(guidance or img_urls or rag.get("userRefCount")),
        "guidance": guidance,
        "imageUrls": img_urls,
        "status": str(rag.get("status") or ""),
        "reason": str(rag.get("reason") or ""),
        "usedClip": bool(rag.get("usedClip")),
        "userRefCount": int(rag.get("userRefCount") or 0),
        "corpusIds": list(rag.get("corpusIds") or [])[:8],
        "ms": int(rag.get("ms") or 0),
        "mode": str(rag.get("mode") or ""),
        "use_user_refs": use_user_refs,
    }


async def _gather_deferred_resource_details(
    *,
    fresh_k: list[str],
    fresh_tools: list[str],
    load_aesthetics: bool,
    prompt: str,
    scene: str,
    canvas_w: int,
    canvas_h: int,
    user_ref_urls: list[str],
    use_user_refs: bool,
    rules: dict[str, str],
) -> dict[str, Any]:
    """Fetch knowledge / tools / aesthetics in parallel (same need_* turn)."""
    jobs: list[tuple[str, Any]] = []
    if fresh_k:
        jobs.append(
            (
                "knowledge",
                asyncio.to_thread(
                    _fetch_deferred_knowledge,
                    kinds=fresh_k,
                    scene=scene,
                ),
            )
        )
    if fresh_tools:
        jobs.append(
            (
                "tools",
                asyncio.to_thread(
                    _fetch_deferred_tools,
                    keys=fresh_tools,
                    rules=rules,
                ),
            )
        )
    if load_aesthetics:
        jobs.append(
            (
                "aesthetics",
                asyncio.to_thread(
                    _fetch_deferred_aesthetics,
                    prompt=prompt,
                    scene=scene,
                    canvas_w=canvas_w,
                    canvas_h=canvas_h,
                    user_ref_urls=user_ref_urls,
                    use_user_refs=use_user_refs,
                ),
            )
        )
    out: dict[str, Any] = {}
    if not jobs:
        return out
    results = await asyncio.gather(
        *(coro for _, coro in jobs),
        return_exceptions=True,
    )
    for (kind, _), result in zip(jobs, results):
        if isinstance(result, BaseException):
            _log.exception("deferred %s fetch failed", kind, exc_info=result)
            out[kind] = {"error": str(result)[:240]}
        else:
            out[kind] = result
    return out


def _parse_agent_turn(content: str) -> dict[str, Any]:
    obj = extract_json_object(content) or {}
    intent = str(obj.get("intent") or "").strip().lower()
    if intent not in ("chat", "ask", "done", "edit", "create"):
        intent = "edit" if (obj.get("tool_ops") or obj.get("ops")) else "chat"
    reply = _as_text(obj.get("reply")).strip()
    thought = _as_text(obj.get("thought")).strip()
    ops_raw = obj.get("tool_ops")
    if ops_raw is None:
        ops_raw = obj.get("ops")
    done = obj.get("done")
    if done is None:
        done = intent in ("chat", "ask", "done")
    choices: list[str] = []
    raw_choices = obj.get("choices")
    if isinstance(raw_choices, list):
        for c in raw_choices:
            text = _as_text(c).strip()
            if text and text not in choices:
                choices.append(text[:24])
            if len(choices) >= 6:
                break
    apply_choice = _as_text(obj.get("apply_choice") or obj.get("applyChoice")).strip()[:24]
    need_tools = normalize_need_tools(
        obj.get("need_tools") or obj.get("needTools") or obj.get("tools_needed")
    )
    need_knowledge = normalize_need_knowledge(
        obj.get("need_knowledge") or obj.get("needKnowledge")
    )
    need_aesthetics = normalize_need_aesthetics(
        obj.get("need_aesthetics")
        if "need_aesthetics" in obj
        else obj.get("needAesthetics")
    )
    use_user_refs = parse_use_user_refs(
        obj.get("use_user_refs")
        if "use_user_refs" in obj
        else obj.get("useUserRefs")
    )
    return {
        "intent": intent,
        "reply": reply,
        "thought": thought,
        "tool_ops_raw": ops_raw,
        "need_tools": need_tools,
        "need_knowledge": need_knowledge,
        "need_aesthetics": need_aesthetics,
        "use_user_refs": use_user_refs,
        "choices": choices,
        "apply_choice": apply_choice,
        "done": bool(done),
        "raw_obj": obj,
    }


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
        lines.append("SCENE_FRAMES:")
        for f in frames[:16]:
            lines.append(
                f"- id={f.get('id')} name={f.get('name') or ''} "
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
    try:
        control = "langgraph"
        if state.flow_version:
            control = f"langgraph:v{state.flow_version}"
        _update_task(
            task_id,
            meta_json=json.dumps(
                {
                    "control": control,
                    "flow_id": state.flow_id or None,
                    "flow_version": state.flow_version or None,
                    "trace_id": state.trace_id,
                    "decision_log": decision.to_log(),
                    "execution_log": state.to_execution_log(),
                },
                ensure_ascii=False,
            ),
        )
    except Exception:
        _log.exception("persist execution_log failed task=%s", task_id)

from langgraph.graph import END, START, StateGraph
from langgraph.config import get_stream_writer
from langgraph.types import Command

try:
    from typing_extensions import NotRequired
except ImportError:
    from typing import NotRequired  # type: ignore


def _emit(ev: dict[str, Any]) -> None:
    try:
        get_stream_writer()(ev)
    except Exception:
        pass


@dataclass
class AgentRuntime:
    """Mutable host context shared across LangGraph nodes."""

    user_id: str
    mode: str
    prompt: str
    rules: dict[str, str]
    user_selected_model: str | None
    canvas_id: str | None
    canvas_size: str | None
    scene_key: str
    scene_nodes: list[dict[str, Any]]
    scene_frames: list[dict[str, Any]]
    focus_id: str
    images: list[str]
    memory_in: dict[str, Any] | None
    session_id: str
    project_id: str
    hold: int
    free_daily: bool
    t0: float
    settle_hold_fn: Any
    refund_hold_fn: Any
    apply_ops: list[dict[str, Any]]
    w: int
    h: int
    run: AgentRunState
    decision: DesignRunDecision
    mem_blocks: str = ""
    mem_short: list[Any] = field(default_factory=list)
    mem_short_all: list[Any] = field(default_factory=list)
    mem_medium: dict[str, Any] = field(default_factory=dict)
    system: str = ""
    plan_system: str = ""
    size_auto_hint: str = ""
    unsafe_ops_tmpl: str = ""
    chat_fallback_tmpl: str = ""
    defer_tools: bool = True
    max_rounds: int = _DEFAULT_MAX_ROUNDS
    dual_on: bool = False
    pending_tool_details: str = ""
    pending_tool_keys: list[str] = field(default_factory=list)
    pending_knowledge_details: str = ""
    pending_knowledge_kinds: list[str] = field(default_factory=list)
    pending_aesthetics_details: str = ""
    pending_aesthetic_images: list[str] = field(default_factory=list)
    turn: dict[str, Any] = field(default_factory=dict)
    step_ops: list[dict[str, Any]] = field(default_factory=list)
    op_errors: list[str] = field(default_factory=list)
    paint_ops: list[dict[str, Any]] = field(default_factory=list)
    last_used: int = 0
    last_reason: str = ""
    last_content: str = ""
    last_think: str = ""
    last_user_msg: str = ""
    last_images: list[str] | None = None
    flags: dict[str, Any] = field(default_factory=dict)
    skip_loop: bool = False
    terminal: bool = False
    fatal: str = ""
    # Published Admin flow (runtime source of truth)
    flow_id: str = "default"
    flow_version: int = 0
    current_node_id: str = ""
    node_by_id: dict[str, Any] = field(default_factory=dict)
    outgoing: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    phase_to_id: dict[str, str] = field(default_factory=dict)


class GraphState(TypedDict):
    rt: AgentRuntime
    tick: NotRequired[int]


def _bump(rt: AgentRuntime) -> dict[str, Any]:
    return {"rt": rt, "tick": int(rt.run.round) + len(rt.run.log)}


def _bind_published_flow(rt: AgentRuntime, published: dict[str, Any] | None) -> None:
    """Attach published graph topology onto runtime for edge routing."""
    pub = published or {}
    graph = pub.get("graph") if isinstance(pub.get("graph"), dict) else {}
    nodes = [n for n in (graph.get("nodes") or []) if isinstance(n, dict) and n.get("id")]
    edges = [e for e in (graph.get("edges") or []) if isinstance(e, dict)]
    node_by_id = {str(n["id"]): n for n in nodes}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    for e in edges:
        src = str(e.get("source") or "")
        if src in node_by_id:
            outgoing.setdefault(src, []).append(e)
    phase_to_id: dict[str, str] = {}
    for n in nodes:
        pk = str(n.get("phaseKey") or "").strip()
        if pk and pk not in phase_to_id:
            phase_to_id[pk] = str(n["id"])
    # Also honor Admin phaseMap (phase → node id)
    for pk, nid in (pub.get("phaseMap") or {}).items():
        k, v = str(pk).strip(), str(nid).strip()
        if k and v and v in node_by_id:
            phase_to_id[k] = v
    rt.flow_id = str(pub.get("id") or "default")
    rt.flow_version = int(pub.get("version") or 0)
    rt.node_by_id = node_by_id
    rt.outgoing = outgoing
    rt.phase_to_id = phase_to_id
    rt.run.flow_id = rt.flow_id
    rt.run.flow_version = rt.flow_version


def _route_flags_snapshot(flags: dict[str, Any]) -> dict[str, Any]:
    """Compact flags that usually decide edges (for 运行复盘)."""
    keys = (
        "mode",
        "intent",
        "short_plan_on",
        "need_resources",
        "need_tools",
        "need_knowledge",
        "need_aesthetics",
        "has_ops",
        "ops_valid",
        "ops_invalid",
        "ask_mode_ops",
        "info_enough",
        "info_insufficient",
        "dual_on",
        "await_user",
        "await_confirm",
        "llm_call",
        "plan_done",
        "ok",
        "op_failed",
        "retry",
        "reflect_left",
        "no_reflect",
        "fatal",
        "next_round",
        "ready",
        "fetched",
        "tool_ops",
        "wait_scene",
        "pick_best",
    )
    out: dict[str, Any] = {}
    for k in keys:
        v = flags.get(k)
        if v is None or v is False or v == "" or v == 0:
            continue
        out[k] = v
    return out


def _route_next_id(rt: AgentRuntime, node_id: str) -> str:
    from services.design.flow_runtime import choose_outgoing_edges

    nid = str(node_id or "").strip()
    node = rt.node_by_id.get(nid) or {"id": nid, "kind": ""}
    outs, edge_detail = choose_outgoing_edges(
        node=node,
        edges=list(rt.outgoing.get(nid) or []),
        ctx=rt.flags,
    )
    from_phase = _phase_key(rt, nid) if nid else ""
    if not outs:
        next_id = "__settle__"
        via = "settle"
        tgt = next_id
        to_phase = "settle"
    else:
        tgt = str(outs[0].get("target") or "").strip()
        if not tgt:
            next_id = "__settle__"
            via = str(edge_detail.get("via") or "settle")
            to_phase = "settle"
        else:
            meta = rt.node_by_id.get(tgt) or {}
            kind = str(meta.get("kind") or "").lower()
            phase = str(meta.get("phaseKey") or "").lower()
            if kind == "end" or phase == "end":
                next_id = "__settle__"
                via = str(edge_detail.get("via") or "match")
                to_phase = "end"
            elif kind == "error" or phase == "error":
                next_id = tgt if tgt in rt.node_by_id else "__settle__"
                via = str(edge_detail.get("via") or "match")
                to_phase = phase or kind or next_id
            else:
                next_id = tgt if tgt in rt.node_by_id else "__settle__"
                via = str(edge_detail.get("via") or "match")
                to_phase = _phase_key(rt, next_id) if next_id != "__settle__" else "settle"

    cond = edge_detail.get("condition")
    label = edge_detail.get("label")
    summary_bits = [from_phase or nid or "?", "→", to_phase or next_id]
    if via == "match" and cond:
        summary_bits.append(f"[{cond}]")
    elif via == "default":
        summary_bits.append("[default]")
    elif via == "settle":
        summary_bits.append("[无出边→settle]")
    else:
        summary_bits.append(f"[{via}]")
    rt.run.push_log(
        phase="graph_hop",
        node_id=nid or None,
        from_phase=from_phase or None,
        to_node_id=next_id if next_id != "__settle__" else None,
        to_phase=to_phase or None,
        edge_id=edge_detail.get("edge_id"),
        edge_condition=cond,
        edge_label=label,
        edge_via=via,
        edge_priority=edge_detail.get("priority"),
        edge_is_default=bool(edge_detail.get("is_default")) or None,
        edge_candidates=edge_detail.get("candidate_count"),
        flags=_route_flags_snapshot(rt.flags) or None,
        summary=" ".join(str(x) for x in summary_bits),
    )
    return next_id


def _route_cmd(rt: AgentRuntime, node_id: str | None = None) -> Command:
    nid = node_id or rt.current_node_id
    rt.run.current_node_id = str(nid or "")
    return Command(update=_bump(rt), goto=_route_next_id(rt, nid))


def _phase_key(rt: AgentRuntime, node_id: str) -> str:
    n = rt.node_by_id.get(node_id) or {}
    pk = str(n.get("phaseKey") or "").strip()
    if pk:
        return pk
    return str(n.get("kind") or node_id or "").strip().lower()


_AGENT_GRAPH_CACHE: dict[tuple[str, int], Any] = {}


def invalidate_agent_graph_cache(flow_id: str | None = None) -> None:
    if not flow_id:
        _AGENT_GRAPH_CACHE.clear()
        return
    fid = str(flow_id)
    for key in list(_AGENT_GRAPH_CACHE.keys()):
        if key[0] == fid:
            _AGENT_GRAPH_CACHE.pop(key, None)


def _load_published_flow_bundle(flow_id: str = "default") -> dict[str, Any]:
    try:
        from services.design.admin_store import (
            get_published_agent_flow,
            _normalize_agent_flow_graph,
        )

        item = get_published_agent_flow(flow_id)
        if isinstance(item, dict) and isinstance(item.get("graph"), dict):
            graph, _ = _normalize_agent_flow_graph(item.get("graph"))
            return {**item, "graph": graph}
    except Exception:
        _log.exception("load published agent flow failed")
    return {
        "id": flow_id,
        "version": 0,
        "graph": {"version": 1, "nodes": [], "edges": []},
        "phaseMap": {},
    }


async def _node_bootstrap(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    _insert_task(
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
                    **({"apply_ops": True} if rt.apply_ops else {}),
                },
                ensure_ascii=False,
            ),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
    )
    _emit(
        {
            "type": "status",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "run_mode": rt.mode,
            "scene": rt.scene_key or None,
            **(
                {
                    "canvas_width": rt.w,
                    "canvas_height": rt.h,
                    "canvas_size": f"{rt.w}x{rt.h}",
                }
                if rt.w > 0 and rt.h > 0
                else {}
            ),
        }
    )
    _emit(rt.decision.to_event())
    if rt.apply_ops:
        rt.flags["apply_ops"] = True
        return Command(update=_bump(rt), goto="apply_confirm")
    start_id = rt.phase_to_id.get("start") or next(
        (
            str(n.get("id"))
            for n in rt.node_by_id.values()
            if str(n.get("kind") or "").lower() == "start"
        ),
        "",
    )
    if start_id:
        rt.current_node_id = start_id
        rt.flags["mode"] = rt.flags.get("mode") or "agent"
        return _route_cmd(rt, start_id)
    # Fallback if published graph empty
    route_id = rt.phase_to_id.get("route") or "route"
    return Command(update=_bump(rt), goto=route_id if route_id in rt.node_by_id else "__settle__")


async def _node_apply_confirm(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops, op_errors = _validate_ops_payload(
        rt.apply_ops, nodes=rt.scene_nodes, frames=rt.scene_frames, rules=rt.rules
    )
    if not step_ops:
        err = validation_failure_reason(op_errors) if op_errors else "missing_tool_ops"
        st.note_error(err)
        msg = "方案无法安全执行，请换个说法或再试一次。"
        st.reply = msg
        _emit({"type": "token", "text": msg})
        rt.terminal = True
        return Command(update=_bump(rt), goto="__settle__")

    from services.design.image_hydrate import (
        _hydrate_tool_ops_images,
        _image_model_from_rules,
    )

    step_ops, n_img = await _hydrate_tool_ops_images(
        step_ops, limit=6, policy="auto", rules=rt.rules
    )
    img_mid = _image_model_from_rules(rt.rules) if n_img else ""
    if n_img and img_mid:
        st.note_images(img_mid, int(n_img))
        st.push_log(**_hydrate_log_kwargs(step_ops, img_mid=img_mid, n_img=n_img))
    paint_ops = list(step_ops)
    if _ops_have_create_frame(step_ops):
        ow, oh = rt.w, rt.h
        if ow <= 0 or oh <= 0:
            ow, oh = _wh_from_create_frame_ops(step_ops)
        if ow > 0 and oh > 0:
            _emit(
                {
                    "type": "status",
                    "task_id": st.task_id,
                    "trace_id": st.trace_id,
                    "open_artboard": True,
                    "canvas_width": ow,
                    "canvas_height": oh,
                    "canvas_size": f"{ow}x{oh}",
                }
            )
            paint_ops = _strip_create_frame_ops(step_ops)
    _emit(
        {
            "type": "tool_ops",
            "index": 0,
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "schema_version": TOOL_OPS_SCHEMA_VERSION,
            "ops": tool_ops_for_sse(paint_ops),
        }
    )
    for act in _tool_ops_activity_events(
        batch=paint_ops,
        totals={"created": 0, "updated": 0, "deleted": 0},
        skill_index=0,
    ):
        _emit(act)
    st.applied_ops.extend(step_ops)
    st.painted = True
    st.intent = "edit"
    st.reply = "已按方案更新画布。"
    st.push_log(
        phase="action",
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_count=len(step_ops),
        ops_detail=_ops_for_log(step_ops),
        apply_confirm=True,
        model=st.family or None,
        **({"image_model": img_mid, "images_hydrated": int(n_img)} if n_img and img_mid else {}),
    )
    rt.paint_ops = paint_ops
    rt.step_ops = step_ops
    rt.skip_loop = True
    await begin_wait(st.task_id, round_n=0)
    _emit(
        {
            "type": "scene_feedback_request",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "round": 0,
            "timeout_ms": int(_SCENE_WAIT_SEC * 1000),
        }
    )
    obs = rt.phase_to_id.get("observe") or "observe"
    return Command(update=_bump(rt), goto=obs if obs in rt.node_by_id else "__settle__")


async def _node_route(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    st.task_tier = clamp_tier(
        estimate_task_tier(
            rt.prompt, rules=rt.rules, skill_category="agent", scene=rt.scene_key or None
        ),
        enabled_tiers(rt.rules),
    )
    if rt.images:
        st.vision_used = True
    tier_label = {"simple": "简单", "medium": "中等", "complex": "复杂"}.get(
        st.task_tier, st.task_tier or "-"
    )
    st.push_log(
        phase="route",
        task_tier=st.task_tier or None,
        has_images=bool(rt.images) or None,
        vision=True if rt.images else None,
        user_selected_model=(rt.user_selected_model or "auto"),
        run_mode=rt.mode,
        llm_image_urls=_clip_urls(rt.images),
        llm_user=_clip_llm_raw(rt.prompt, limit=4000),
        summary=f"任务类型 {tier_label}" + (" · 看图" if rt.images else "") + f" · 模式 {rt.mode}",
    )
    # Preserve FE Ask mode (interaction_mode=ask); default agent otherwise.
    if _as_text(rt.flags.get("mode")).strip().lower() not in ("agent", "ask"):
        rt.flags["mode"] = "agent"
    rt.flags["task_tier"] = st.task_tier
    return _route_cmd(rt)


async def _node_memory(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    mem_bundle = memory_service.load(
        user_id=rt.user_id,
        session_id=rt.session_id,
        project_id=rt.project_id,
        memory_in=rt.memory_in,
        rules=rt.rules,
        query=rt.prompt,
        scene=rt.scene_key or "",
    )
    rt.mem_blocks = mem_bundle.blocks or ""
    rt.mem_short = list(mem_bundle.short or [])
    rt.mem_short_all = list(mem_bundle.short_all or mem_bundle.short or [])
    rt.mem_medium = mem_bundle.medium if isinstance(mem_bundle.medium, dict) else {}
    if rt.mem_blocks or rt.mem_short:
        st.push_log(
            phase="memory",
            memory_injected=True,
            detail_chars=len(rt.mem_blocks or ""),
            short_turns=len(rt.mem_short or []),
            summary=(
                f"注入记忆 {len(rt.mem_blocks or '')} 字"
                f" / 短记 {len(rt.mem_short or [])}"
            ),
            llm_user=_clip_llm_raw(rt.mem_blocks or "", limit=6000),
            llm_raw=_clip_llm_raw(
                "\n".join(str(x)[:200] for x in list(rt.mem_short or [])[:8]),
                limit=2000,
            ),
        )
    rt.decision.memory_injected = bool(rt.mem_blocks)
    rt.decision.memory_blocks_chars = len(rt.mem_blocks or "")
    rt.decision.short_turns = len(rt.mem_short)
    if _wants_short_plan(rt.prompt, rules=rt.rules):
        rt.flags["short_plan_on"] = True
    return _route_cmd(rt)


async def _node_mode_fork(state: GraphState) -> Command:
    rt = state["rt"]
    rt.flags["mode"] = rt.flags.get("mode") or "agent"
    return _route_cmd(rt)


async def _node_plan(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    st.family, reason = _resolve_and_log_model(
        st,
        skill={
            "category": "agent",
            "default_model": "doubao",
            "name": "plan",
            "skill_key": "plan",
        },
        user_selected_model=rt.user_selected_model,
        run_mode=rt.mode,
        prompt=rt.prompt,
        rules=rt.rules,
        scene=rt.scene_key,
        attempt=0,
        has_images=False,
    )
    _emit(
        {
            "type": "skill_start",
            "index": -1,
            "skill_id": None,
            "skill_key": "plan",
            "skill_name": "短计划",
            "category": "agent",
            "model": st.family,
            "model_reason": reason,
            "trace_id": st.trace_id,
        }
    )
    plan_user = "\n\n".join(
        p
        for p in [
            f"USER_PROMPT:\n{rt.prompt}",
            f"CANVAS_SIZE: {rt.w}x{rt.h}" if rt.w > 0 and rt.h > 0 else "CANVAS_SIZE: unknown",
            f"SCENE: {rt.scene_key or '-'}",
            _scene_digest(rt.scene_nodes, rt.scene_frames, focus_id=rt.focus_id),
        ]
        if p
    )
    st.family, plan_raw, plan_used, plan_ev, plan_think = await _stream_llm_text(
        model_family=st.family,
        system=rt.plan_system,
        user=plan_user,
        rules=rt.rules,
        max_tokens=512,
    )
    _flush_host_events(st, plan_ev)
    st.total_tokens += plan_used
    st.plan = _parse_plan(plan_raw)
    st.push_log(
        phase="plan",
        steps=list(st.plan),
        tokens=plan_used,
        model=st.family,
        model_reason=reason,
        task_tier=st.task_tier or None,
        llm_raw=_clip_llm_raw(plan_raw),
        **_thinking_field(plan_think),
        **_llm_io_fields(system=rt.plan_system, user=plan_user, max_tokens=512),
    )
    if st.plan:
        _emit(
            {
                "type": "activity",
                "id": "plan-0",
                "kind": "explored",
                "status": "done",
                "summary": "计划：" + " → ".join(st.plan),
            }
        )
    _emit(
        {
            "type": "skill_done",
            "index": -1,
            "skill_key": "plan",
            "skill_name": "短计划",
            "tokens": plan_used,
        }
    )
    rt.flags["plan_done"] = True
    return _route_cmd(rt)


async def _node_model_route(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    st.family, reason = _resolve_and_log_model(
        st,
        skill={
            "category": "agent",
            "default_model": "doubao",
            "name": "react",
            "skill_key": "react",
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
    rt.flags["llm_call"] = True
    return _route_cmd(rt)


async def _node_thought(
    state: GraphState,
) -> Command:
    rt = state["rt"]
    st = rt.run
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
            "trace_id": st.trace_id,
        }
    )
    user_parts = [
        f"USER_PROMPT:\n{rt.prompt}",
        (
            f"CANVAS_SIZE: {rt.w}x{rt.h}"
            if rt.w > 0 and rt.h > 0
            else (
                "CANVAS_SIZE: auto\n"
                + (rt.size_auto_hint or "SIZE_MODE: auto — 自行选择宽高。")
                if _as_text(rt.canvas_size).strip().lower() in ("", "auto")
                else f"CANVAS_SIZE: {_as_text(rt.canvas_size).strip() or 'unknown'}"
            )
        ),
        f"SCENE: {rt.scene_key or '-'}",
        _scene_digest(rt.scene_nodes, rt.scene_frames, focus_id=rt.focus_id),
    ]
    if rt.pending_tool_details:
        user_parts.append(rt.pending_tool_details)
        user_parts.append("以上 TOOL_DETAILS 为准。现在输出 tool_ops；将 need_tools 设为 []。")
    if rt.pending_knowledge_details:
        user_parts.append(rt.pending_knowledge_details)
        user_parts.append(
            "以上 KNOWLEDGE_DETAILS 为准。写 tool_ops 时使用它们；将 need_knowledge 设为 []。"
        )
    if rt.pending_aesthetics_details:
        user_parts.append(rt.pending_aesthetics_details)
        user_parts.append(
            "以上 AESTHETIC_REFS 为准。以优秀样本为目标质量；将 need_aesthetics 设为 false。"
        )
    if st.plan:
        user_parts.append("PLAN:\n" + "\n".join(f"{i+1}. {s}" for i, s in enumerate(st.plan)))
    if rt.mem_blocks:
        user_parts.append(f"MEMORY:\n{rt.mem_blocks[:4000]}")
    if st.errors:
        trail = "\n".join(f"- {e}" for e in st.errors[-5:])
        user_parts.append(f"PRIOR_ERRORS (fix):\n{trail}")
    if st.reflect_note:
        user_parts.append(f"LAST_ERROR (fix):\n{st.reflect_note}")
    if rt.scene_nodes or rt.scene_frames:
        user_parts.append(
            _edit_context_block(
                rt.rules,
                "",
                include_full_svg=False,
                scene_nodes=rt.scene_nodes,
            )
        )
    user_msg = "\n\n".join(p for p in user_parts if p)
    turn_images = None
    if rt.pending_aesthetic_images:
        turn_images = list(rt.pending_aesthetic_images)[:4]
        st.vision_used = True
    elif round_i == 0 and rt.images:
        turn_images = rt.images

    st.family, content, used, llm_ev, llm_think = await _stream_llm_text(
        model_family=st.family,
        system=rt.system,
        user=user_msg,
        rules=rt.rules,
        images=turn_images,
        max_tokens=2048,
    )
    _flush_host_events(st, llm_ev)
    st.total_tokens += used
    rt.last_used = used
    rt.last_content = content
    rt.last_think = llm_think
    rt.last_user_msg = user_msg
    rt.last_images = turn_images

    turn = _parse_agent_turn(content)
    rt.turn = turn
    intent = turn["intent"]
    if intent in ("ask", "chat"):
        st.choices = list(turn.get("choices") or [])[:6]
        apply_label = _as_text(turn.get("apply_choice")).strip()
        if apply_label:
            st.apply_choice = apply_label[:24]
            if apply_label not in st.choices:
                st.choices = [apply_label] + [c for c in st.choices if c != apply_label]
                st.choices = st.choices[:6]
    st.intent = intent
    thought = _short_ui_thought(turn["thought"], intent=intent)
    thought_full = _full_thought_for_log(turn["thought"])
    reply = turn["reply"]
    st.push_log(
        phase="thought",
        intent=intent,
        thought=thought or None,
        thought_full=thought_full,
        reply=(reply or "")[:2000] or None,
        tokens=used,
        model=st.family,
        model_reason=rt.last_reason,
        task_tier=st.task_tier or None,
        vision=True if st.vision_used else None,
        llm_raw=_clip_llm_raw(content),
        **_thinking_field(llm_think),
        **_llm_io_fields(
            system=rt.system, user=user_msg, images=turn_images, max_tokens=2048
        ),
        **({"apply_choice": st.apply_choice} if st.apply_choice else {}),
    )
    if thought:
        _emit(
            {
                "type": "activity",
                "id": f"thought-{round_i}",
                "kind": "thought",
                "status": "done",
                "summary": thought,
            }
        )

    need_tools = list(turn.get("need_tools") or [])
    need_knowledge = list(turn.get("need_knowledge") or [])
    need_aesthetics = bool(turn.get("need_aesthetics"))
    has_ops_payload = _ops_payload_nonempty(turn.get("tool_ops_raw"))
    use_user_refs = turn.get("use_user_refs") is True
    rt.flags["intent"] = intent
    rt.flags["has_ops"] = has_ops_payload
    rt.flags["need_tools"] = bool(need_tools)
    rt.flags["need_knowledge"] = bool(need_knowledge)
    rt.flags["need_aesthetics"] = bool(need_aesthetics)
    rt.flags["need_resources"] = bool(
        rt.defer_tools
        and intent in ("edit", "create")
        and not has_ops_payload
        and (need_tools or need_knowledge or need_aesthetics)
    )
    rt.flags["dual_on"] = bool(rt.dual_on and intent in ("edit", "create") and has_ops_payload)
    # Ask UI mode: ops go to propose (confirm) instead of immediate paint.
    ask_ui = _as_text(rt.flags.get("mode")).strip().lower() == "ask"
    rt.flags["ask_mode_ops"] = bool(
        (intent == "ask" and has_ops_payload)
        or (ask_ui and has_ops_payload and intent in ("edit", "create", "ask"))
    )
    rt.flags["info_enough"] = intent not in ("ask",) or has_ops_payload
    rt.flags["info_insufficient"] = False

    if intent in ("chat", "ask", "done") and not has_ops_payload:
        text = reply or (
            rt.chat_fallback_tmpl.replace("{prompt}", rt.prompt[:80])
            if rt.chat_fallback_tmpl
            else ""
        )
        if text:
            st.reply = text
            _emit({"type": "token", "text": text})
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "skill_name": "Design Agent",
                "tokens": used,
            }
        )
        if intent == "ask":
            rt.flags["await_user"] = True
        return _route_cmd(rt)

    if intent in ("edit", "create") and not has_ops_payload and not rt.flags["need_resources"]:
        ask = reply or "可以再说具体一点要改哪里吗？"
        st.reply = ask
        st.intent = "ask"
        rt.flags["intent"] = "ask"
        _emit({"type": "token", "text": ask})
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": used,
            }
        )
        return _route_cmd(rt)

    if rt.flags["need_resources"]:
        return _route_cmd(rt)

    # Validate ops when payload present — set edge flags for published graph.
    step_ops, op_errors = _validate_ops_payload(
        turn.get("tool_ops_raw"),
        nodes=rt.scene_nodes,
        frames=rt.scene_frames,
        rules=rt.rules,
    )
    rt.step_ops = step_ops
    rt.op_errors = op_errors
    if has_ops_payload and not step_ops:
        err = validation_failure_reason(op_errors) if op_errors else "missing_tool_ops"
        st.note_error(err)
        st.push_log(phase="validate_fail", error=err[:200], summary=f"校验失败：{err[:120]}")
        rt.flags["ops_invalid"] = True
        rt.flags["ops_valid"] = False
        rt.flags["reflect_left"] = st.reflect_left > 0 and not turn.get("done")
        rt.flags["no_reflect"] = not rt.flags["reflect_left"]
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": used,
            }
        )
        return _route_cmd(rt)

    rt.flags["ops_valid"] = bool(step_ops)
    rt.flags["ops_invalid"] = False
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": used,
        }
    )
    del use_user_refs  # reserved for aesthetics path via need_*
    return _route_cmd(rt)


async def _node_resource(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    turn = rt.turn
    round_i = st.round
    need_tools = list(turn.get("need_tools") or [])
    need_knowledge = list(turn.get("need_knowledge") or [])
    need_aesthetics = bool(turn.get("need_aesthetics"))
    use_user_refs = turn.get("use_user_refs") is True
    fresh_k = _fresh_knowledge_kinds(need_knowledge, knowledge_loaded=st.knowledge_loaded)
    load_knowledge = bool(need_knowledge) and not (
        set(need_knowledge) <= set(st.knowledge_loaded) and "*" not in need_knowledge
    )
    if not load_knowledge:
        fresh_k = []
    fresh_tools = (
        [k for k in need_tools if k not in st.tools_loaded] or list(need_tools)
        if need_tools
        else []
    )
    load_aesthetics = bool(need_aesthetics and not st.aesthetics_loaded)
    user_ref_urls = [u for u in (rt.images or []) if isinstance(u, str) and u.strip()][:4]

    if load_knowledge:
        st.push_log(
            phase="need_knowledge",
            need_knowledge=list(fresh_k),
            intent=st.intent,
            summary="申请设计知识：" + "、".join(fresh_k),
        )
        _emit(
            {
                "type": "activity",
                "id": f"need-knowledge-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": ("申请知识：" + "、".join(fresh_k))[:200],
                "index": round_i,
            }
        )
    if load_aesthetics:
        st.push_log(phase="need_aesthetics", need_aesthetics=True, summary="申请美学样本")
        _emit(
            {
                "type": "activity",
                "id": f"need-aesthetics-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": "申请美学样本",
                "index": round_i,
            }
        )
    if need_tools:
        st.push_log(
            phase="need_tools",
            need_tools=list(need_tools),
            summary="申请工具详情：" + "、".join(need_tools),
        )
        _emit(
            {
                "type": "activity",
                "id": f"need-tools-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": ("申请工具：" + "、".join(need_tools))[:200],
                "index": round_i,
            }
        )

    bundles = await _gather_deferred_resource_details(
        fresh_k=fresh_k if load_knowledge else [],
        fresh_tools=fresh_tools if need_tools else [],
        load_aesthetics=load_aesthetics,
        prompt=rt.prompt,
        scene=rt.scene_key or "website",
        canvas_w=rt.w,
        canvas_h=rt.h,
        user_ref_urls=user_ref_urls,
        use_user_refs=use_user_refs,
        rules=rt.rules,
    )
    kb = bundles.get("knowledge") if load_knowledge else None
    if isinstance(kb, dict) and kb.get("details"):
        details_k = str(kb["details"])
        rt.pending_knowledge_details = "KNOWLEDGE_DETAILS:\n" + details_k
        for k in fresh_k:
            if k not in st.knowledge_loaded:
                st.knowledge_loaded.append(k)
        st.push_log(
            phase="knowledge_details",
            need_knowledge=list(fresh_k),
            detail_chars=len(details_k),
            summary="注入设计知识：" + "、".join(fresh_k),
        )
        _emit(
            {
                "type": "activity",
                "id": f"knowledge-details-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": ("注入知识：" + "、".join(fresh_k))[:200],
                "index": round_i,
            }
        )
    tb = bundles.get("tools") if need_tools else None
    if isinstance(tb, dict) and tb.get("details"):
        details_t = str(tb["details"])
        rt.pending_tool_details = "TOOL_DETAILS:\n" + details_t
        for k in fresh_tools:
            if k not in st.tools_loaded:
                st.tools_loaded.append(k)
        st.push_log(
            phase="tool_details",
            need_tools=list(fresh_tools),
            detail_chars=len(details_t),
            summary="注入工具详情：" + "、".join(fresh_tools),
        )
        _emit(
            {
                "type": "activity",
                "id": f"tool-details-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": ("注入工具：" + "、".join(fresh_tools))[:200],
                "index": round_i,
            }
        )
    ab = bundles.get("aesthetics") if load_aesthetics else None
    if isinstance(ab, dict):
        guidance = str(ab.get("guidance") or "").strip()
        img_urls = [str(u).strip() for u in (ab.get("imageUrls") or []) if str(u).strip()][:4]
        if guidance or img_urls:
            rt.pending_aesthetics_details = "AESTHETIC_REFS:\n" + (guidance or "(images)")
            rt.pending_aesthetic_images = img_urls
            st.aesthetics_loaded = True
            st.push_log(
                phase="aesthetics_details",
                detail_chars=len(guidance),
                summary="注入美学参考",
            )
            _emit(
                {
                    "type": "activity",
                    "id": f"aesthetics-details-{round_i}",
                    "kind": "explored",
                    "status": "done",
                    "summary": "注入美学参考",
                    "index": round_i,
                }
            )
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "tokens": rt.last_used,
        }
    )
    st.round = round_i + 1
    rt.flags["fetched"] = True
    rt.flags["ready"] = True
    rt.flags["next_round"] = True
    return _route_cmd(rt)



async def _node_propose(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops = rt.step_ops
    round_i = st.round
    from services.design.tool_ops_contract import tool_ops_batch_detail

    st.proposed_ops = tool_ops_for_sse(step_ops)
    apply_label = _as_text(st.apply_choice).strip()
    if not apply_label and st.choices:
        apply_label = _as_text(st.choices[0]).strip()
    if apply_label:
        st.apply_choice = apply_label[:24]
        rest = [c for c in st.choices if c and c != apply_label]
        st.choices = ([apply_label] + rest)[:6]
    detail = (tool_ops_batch_detail(step_ops) or "").strip()
    model_reply = (rt.turn.get("reply") or "").strip()
    if detail and model_reply and model_reply != detail and len(model_reply) >= 12:
        text = f"{model_reply}\n{detail}"
    else:
        text = detail or model_reply or apply_label or ""
    st.reply = text
    st.push_log(
        phase="propose",
        ops_count=len(step_ops),
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_detail=_ops_for_log(step_ops),
        tokens=rt.last_used,
        model=st.family,
        proposed=True,
        intent=st.intent,
        reply=(text or "")[:2000] or None,
        summary=("提议确认：" + (apply_label or f"{len(step_ops)} ops"))[:120],
        **({"choices": list(st.choices)[:6]} if st.choices else {}),
        **({"apply_choice": st.apply_choice} if st.apply_choice else {}),
    )
    if text:
        _emit({"type": "token", "text": text})
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": rt.last_used,
        }
    )
    rt.terminal = True
    rt.flags["await_confirm"] = True
    return _route_cmd(rt)


async def _node_action(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops = rt.step_ops
    round_i = st.round
    from services.design.image_hydrate import (
        _hydrate_tool_ops_images,
        _image_model_from_rules,
    )

    step_ops, n_img = await _hydrate_tool_ops_images(
        step_ops, limit=6, policy="auto", rules=rt.rules
    )
    rt.step_ops = step_ops
    img_mid = _image_model_from_rules(rt.rules) if n_img else ""
    if n_img and img_mid:
        st.note_images(img_mid, int(n_img))
        st.push_log(**_hydrate_log_kwargs(step_ops, img_mid=img_mid, n_img=n_img))
    paint_ops = list(step_ops)
    if _ops_have_create_frame(step_ops):
        ow, oh = rt.w, rt.h
        if ow <= 0 or oh <= 0:
            ow, oh = _wh_from_create_frame_ops(step_ops)
        if ow > 0 and oh > 0:
            _emit(
                {
                    "type": "status",
                    "task_id": st.task_id,
                    "trace_id": st.trace_id,
                    "open_artboard": True,
                    "canvas_width": ow,
                    "canvas_height": oh,
                    "canvas_size": f"{ow}x{oh}",
                }
            )
            paint_ops = _strip_create_frame_ops(step_ops)
    rt.paint_ops = paint_ops
    _emit(
        {
            "type": "tool_ops",
            "index": round_i,
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "schema_version": TOOL_OPS_SCHEMA_VERSION,
            "ops": tool_ops_for_sse(paint_ops),
        }
    )
    for act in _tool_ops_activity_events(
        batch=paint_ops,
        totals={"created": 0, "updated": 0, "deleted": 0},
        skill_index=round_i,
    ):
        _emit(act)
    st.applied_ops.extend(step_ops)
    st.painted = True
    st.push_log(
        phase="action",
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_count=len(step_ops),
        ops_detail=_ops_for_log(step_ops),
        tokens=rt.last_used,
        model=st.family,
        **({"image_model": img_mid, "images_hydrated": int(n_img)} if n_img and img_mid else {}),
    )
    await begin_wait(st.task_id, round_n=round_i)
    _emit(
        {
            "type": "scene_feedback_request",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "round": round_i,
            "timeout_ms": int(_SCENE_WAIT_SEC * 1000),
        }
    )
    rt.flags["wait_scene"] = True
    return _route_cmd(rt)


async def _node_observe(
    state: GraphState,
) -> Command:
    rt = state["rt"]
    st = rt.run
    round_i = st.round
    snap = await wait_for_scene(st.task_id, timeout_sec=_SCENE_WAIT_SEC)
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
            summary="观察超时：前端未回传 scene",
        )

    if rt.skip_loop:
        if st.reply:
            _emit({"type": "token", "text": st.reply})
        rt.terminal = True
        rt.flags["ok"] = True
        return Command(update=_bump(rt), goto="__settle__")

    if op_failures:
        fail_notes = "; ".join(
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:3]
        )
        all_failed = len(rt.paint_ops) > 0 and len(op_failures) >= len(rt.paint_ops)
        if all_failed and round_i == 0:
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
                "detail": f"{len(op_failures)} 个操作未生效：{fail_notes}"[:200],
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
            return _route_cmd(rt)
        corrected = (
            f"有 {len(op_failures)} 个操作未生效（目标元素可能已被删除）。"
            "画布已按当前状态处理，可以再说一次要改哪个元素。"
        )
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

    reply = rt.turn.get("reply") or ""
    if reply:
        st.reply = reply
        _emit({"type": "token", "text": reply})
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": rt.last_used,
        }
    )
    intent = st.intent
    if rt.turn.get("done") or intent == "done" or (st.painted and intent in ("edit", "create")):
        rt.terminal = True
        rt.flags["ok"] = True
        return _route_cmd(rt)
    if st.round + 1 >= rt.max_rounds:
        rt.terminal = True
        rt.flags["ok"] = True
        return Command(update=_bump(rt), goto="__settle__")
    st.round = round_i + 1
    rt.flags["op_failed"] = False
    rt.flags["ok"] = False
    rt.flags["retry"] = True
    return _route_cmd(rt)


async def _node_reflect(state: GraphState) -> Command:
    rt = state["rt"]
    if rt.terminal or rt.run.round >= rt.max_rounds:
        rt.flags["reflect_exhausted"] = True
        return _route_cmd(rt)
    rt.flags["retry"] = True
    rt.flags["reflect_exhausted"] = False
    return _route_cmd(rt)


async def _node_clarify(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    if not st.reply:
        st.reply = "可以再具体一点吗？"
        _emit({"type": "token", "text": st.reply})
    st.push_log(phase="clarify", intent=st.intent or "ask", reply=st.reply[:1000])
    rt.terminal = True
    rt.flags["await_user"] = True
    return _route_cmd(rt)


async def _node_settle(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    spend = rt.settle_hold_fn(
        rt.user_id,
        hold=rt.hold,
        actual_tokens=st.total_tokens,
        detail=f"design_settle:{rt.mode}:{st.task_id}",
        rules=rt.rules,
        free_daily=rt.free_daily,
        images_hydrated=st.images_hydrated,
    )
    has_proposal = bool(st.proposed_ops)
    rt.decision.apply(
        intent=st.intent if st.intent in ("edit", "create", "chat") else "chat",
        tool_ops_applied=st.painted,
        edit_in_place=bool(rt.scene_nodes) and st.intent == "edit",
        is_chitchat=not st.painted
        and not has_proposal
        and st.intent in ("chat", "ask", "done"),
        route=(
            f"agent_graph:v{rt.flow_version}"
            if st.painted
            else (
                f"agent_graph_ask:v{rt.flow_version}"
                if has_proposal
                else f"agent_graph_chat:v{rt.flow_version}"
            )
        ),
    )
    _persist_task_meta(st.task_id, decision=rt.decision, state=st)
    _update_task(
        st.task_id,
        status="success",
        charged_credits=spend,
        total_tokens=st.total_tokens,
        result_svg="",
    )
    exec_payload = st.to_execution_log()
    _emit({"type": "execution_log", **exec_payload})
    _emit(
        {
            "type": "result",
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "status": "success",
            "svg": "",
            "summary": st.reply[:500] if st.reply else "",
            "charged_credits": spend,
            "total_tokens": st.total_tokens,
            "tool_ops_applied": st.painted,
            "intent": rt.decision.intent,
            "edit_in_place": rt.decision.edit_in_place,
            **({"choices": st.choices} if st.choices else {}),
            **({"proposed_ops": st.proposed_ops} if st.proposed_ops else {}),
            **({"apply_choice": st.apply_choice} if st.apply_choice else {}),
            "balance": get_user_tokens(rt.user_id),
            "decision_log": rt.decision.to_log(),
            "execution_log": exec_payload,
        }
    )
    try:
        from services.agent_memory.episodes import maybe_write_episode

        failed_attempt = bool(st.errors) and not st.painted
        maybe_write_episode(
            user_id=rt.user_id,
            session_id=rt.session_id,
            project_id=rt.project_id,
            task_id=st.task_id,
            scene=rt.scene_key or "",
            goal=rt.prompt,
            summary=(st.reply or st.reflect_note or "")[:400],
            applied_ops=list(st.applied_ops),
            observe={
                "ops_applied": st.painted,
                "route": "langgraph",
                "trace_id": st.trace_id,
                "errors": list(st.errors),
                "rounds": st.round + 1,
            },
            outcome="failed" if failed_attempt else "success",
            chat_only=not st.painted and not failed_attempt,
            tool_ops_applied=st.painted,
            has_reflexion_errors=bool(st.errors),
            rules=rt.rules,
        )
    except Exception:
        _log.exception("episode write failed task=%s", st.task_id)

    if rt.session_id:
        _emit(
            {
                "type": "memory_patch",
                **_finalize_memory_patch(
                    user_id=rt.user_id,
                    session_id=rt.session_id,
                    project_id=rt.project_id,
                    medium=rt.mem_medium,
                    task_id=st.task_id,
                    intent=st.intent if st.intent in ("edit", "create") else "chat",
                    edit_in_place=bool(rt.scene_nodes) and st.intent == "edit",
                    blank_artboard=False,
                    summary=st.reply[:400],
                    tool_ops_applied=st.painted,
                    critique_notes="; ".join(st.errors[-3:]) if st.errors else None,
                    scene_key=rt.scene_key,
                    canvas_size=f"{rt.w}x{rt.h}" if rt.w and rt.h else (rt.canvas_size or ""),
                    user_prompt=rt.prompt,
                    assistant_reply=st.reply,
                    short_turns=list(rt.mem_short_all or rt.mem_short or []),
                    rules=rt.rules,
                ),
            }
        )
    if not st.painted and not st.proposed_ops:
        _emit({"type": "chat_done"})
    exec_trace(
        rt.t0,
        "DONE",
        mode="langgraph",
        tokens=st.total_tokens,
        ops=len(st.applied_ops),
        intent=st.intent,
        errors=len(st.errors),
        trace_id=st.trace_id,
    )
    return Command(update=_bump(rt), goto=END)


async def _node_error(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    err = rt.fatal or "agent_error"
    try:
        rt.refund_hold_fn(rt.user_id, rt.hold, task_id=st.task_id)
    except Exception:
        pass
    st.note_error(str(err)[:240])
    st.push_log(phase="error", error=str(err)[:240])
    rt.decision.apply(route="error", intent=st.intent)
    _persist_task_meta(st.task_id, decision=rt.decision, state=st)
    _update_task(st.task_id, status="error", error_message=str(err)[:800])
    _emit({"type": "execution_log", **st.to_execution_log()})
    _emit(
        {
            "type": "error",
            "message": _user_facing_run_error(err, rules=rt.rules),
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "refunded_credits": rt.hold,
        }
    )
    return Command(update=_bump(rt), goto=END)


async def _node_passthrough(state: GraphState) -> Command:
    rt = state["rt"]
    return _route_cmd(rt)


async def _node_resource_fork(state: GraphState) -> Command:
    """Run deferred resource fetch once, then jump via resource_join outs."""
    rt = state["rt"]
    # Reuse consolidated resource loader
    cmd = await _node_resource(state)
    # Prefer routing from resource_join if present
    join_id = rt.phase_to_id.get("resource_join")
    if join_id:
        rt.flags["next_round"] = True
        rt.flags["ready"] = True
        return _route_cmd(rt, join_id)
    return cmd


async def _node_hydrate(state: GraphState) -> Command:
    """Hydrate image ops; then follow edges to action."""
    rt = state["rt"]
    st = rt.run
    step_ops = list(rt.step_ops)
    if step_ops:
        from services.design.image_hydrate import (
            _hydrate_tool_ops_images,
            _image_model_from_rules,
        )

        step_ops, n_img = await _hydrate_tool_ops_images(
            step_ops, limit=6, policy="auto", rules=rt.rules
        )
        rt.step_ops = step_ops
        img_mid = _image_model_from_rules(rt.rules) if n_img else ""
        if n_img and img_mid:
            st.note_images(img_mid, int(n_img))
            st.push_log(**_hydrate_log_kwargs(step_ops, img_mid=img_mid, n_img=n_img))
    rt.flags["tool_ops"] = True
    return _route_cmd(rt)


async def _node_validate_fail(state: GraphState) -> Command:
    rt = state["rt"]
    # Flags already set by thought; optional clarify messaging when no reflect
    if rt.flags.get("no_reflect") and not rt.flags.get("reflect_left"):
        err = validation_failure_reason(rt.op_errors) if rt.op_errors else "missing_tool_ops"
        err_frag = f"（{err[:80]}）" if err else ""
        if rt.unsafe_ops_tmpl:
            ask = rt.unsafe_ops_tmpl.replace("{error}", err_frag)
        else:
            ask = "这次改动我没法安全执行" + err_frag + "。可以换个说法吗？"
        rt.run.reply = ask
        rt.run.intent = "ask"
        _emit({"type": "token", "text": ask})
    return _route_cmd(rt)


async def _node_dual_sample(state: GraphState) -> Command:
    rt = state["rt"]
    rt.flags["pick_best"] = True
    return _route_cmd(rt)


async def _node_ask_thought(state: GraphState) -> Command:
    """Ask branch LLM — same contract as thought; edges decide clarify/propose/agent."""
    return await _node_thought(state)


_PHASE_HANDLERS: dict[str, Any] = {
    "route": "_node_route",
    "memory": "_node_memory",
    "mode_fork": "_node_mode_fork",
    "plan": "_node_plan",
    "model_route": "_node_model_route",
    "thought": "_node_thought",
    "ask_thought": "_node_ask_thought",
    "resource_fork": "_node_resource_fork",
    "need_knowledge": "_node_passthrough",
    "need_aesthetics": "_node_passthrough",
    "need_tools": "_node_passthrough",
    "knowledge_details": "_node_passthrough",
    "aesthetics_details": "_node_passthrough",
    "tool_details": "_node_passthrough",
    "resource_join": "_node_passthrough",
    "dual_sample": "_node_dual_sample",
    "validate_fail": "_node_validate_fail",
    "reflect": "_node_reflect",
    "clarify": "_node_clarify",
    "propose": "_node_propose",
    "hydrate": "_node_hydrate",
    "action": "_node_action",
    "observe": "_node_observe",
    "error": "_node_error",
    "end": "_node_settle",
}


def _resolve_handler(phase: str):
    name = _PHASE_HANDLERS.get(phase) or "_node_passthrough"
    return globals()[name]


def _wrap_flow_node(node_id: str, phase: str):
    handler = _resolve_handler(phase)

    async def _fn(state: GraphState) -> Command:
        rt = state["rt"]
        rt.current_node_id = node_id
        rt.run.current_node_id = node_id
        return await handler(state)

    _fn.__name__ = f"flow_{node_id}"
    return _fn


def _build_agent_graph_from_published(published: dict[str, Any]):
    graph = published.get("graph") if isinstance(published.get("graph"), dict) else {}
    nodes = [n for n in (graph.get("nodes") or []) if isinstance(n, dict) and n.get("id")]
    g = StateGraph(GraphState)
    all_dest = tuple(
        [str(n["id"]) for n in nodes]
        + ["bootstrap", "apply_confirm", "__settle__", END]
    )
    g.add_node("bootstrap", _node_bootstrap, destinations=all_dest)
    g.add_node("apply_confirm", _node_apply_confirm, destinations=all_dest)
    g.add_node("__settle__", _node_settle, destinations=(END,))
    for n in nodes:
        nid = str(n["id"])
        if nid in ("bootstrap", "apply_confirm", "__settle__"):
            continue
        phase = str(n.get("phaseKey") or n.get("kind") or nid).strip()
        g.add_node(nid, _wrap_flow_node(nid, phase), destinations=all_dest)
    g.add_edge(START, "bootstrap")
    return g.compile()


def _agent_graph(flow_id: str = "default"):
    published = _load_published_flow_bundle(flow_id)
    ver = int(published.get("version") or 0)
    key = (str(published.get("id") or flow_id), ver)
    cached = _AGENT_GRAPH_CACHE.get(key)
    if cached is not None:
        return cached, published
    compiled = _build_agent_graph_from_published(published)
    _AGENT_GRAPH_CACHE[key] = compiled
    return compiled, published


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
    """LangGraph Design Agent driven by published Admin flow."""
    del reserve_hold_fn
    del spatial_summary

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
    max_rounds = _int_rule(rules, "agent.react.max_rounds", _DEFAULT_MAX_ROUNDS) or _DEFAULT_MAX_ROUNDS
    max_reflect = _int_rule(rules, "agent.react.max_reflect", _DEFAULT_MAX_REFLECT)

    scene_key, _ = resolve_agent_scene(scene, prompt, canvas_size, rules=rules)
    scene_key = scene_key or _scene_key(scene) or ""
    nodes = [n for n in (scene_nodes or []) if isinstance(n, dict) and n.get("id")][:120]
    frames = [f for f in (scene_frames or []) if isinstance(f, dict) and f.get("id")][:32]
    focus_id = _as_text(focus_frame_id).strip()
    w, h = _resolve_wh(
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
    knowledge_catalog = format_knowledge_catalog(scene=scene_key or "website")
    aesthetics_catalog = format_aesthetics_catalog(scene=scene_key or "website")
    defer_tools = _flag_on(rules, "agent.react.defer_tools", "1")
    persona = _resolve_agent_persona(rules, user_selected_model)
    persona_block = f"IDENTITY: {persona}" if persona else ""
    react_system = _prompt_text(rules, "agent.prompt.react_system")
    plan_system = _prompt_text(rules, "agent.prompt.plan_system")
    size_auto_hint = _prompt_text(rules, "agent.prompt.size_auto")
    chat_fallback_tmpl = _prompt_text(rules, "agent.prompt.chat_fallback")
    unsafe_ops_tmpl = _prompt_text(rules, "agent.prompt.unsafe_ops_ask")
    if defer_tools:
        system = "\n\n".join(
            p
            for p in [
                react_system,
                _NEED_TOOLS_OVERLAY,
                persona_block,
                tools_catalog,
                knowledge_catalog,
                aesthetics_catalog,
            ]
            if p
        )
    else:
        system = "\n\n".join(
            p for p in [react_system, persona_block, tools_block] if p
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
        settle_hold_fn=settle_hold_fn,
        refund_hold_fn=refund_hold_fn,
        apply_ops=apply_list,
        w=w,
        h=h,
        run=run,
        decision=decision,
        system=system,
        plan_system=plan_system,
        size_auto_hint=size_auto_hint,
        unsafe_ops_tmpl=unsafe_ops_tmpl,
        chat_fallback_tmpl=chat_fallback_tmpl,
        defer_tools=defer_tools,
        max_rounds=max_rounds,
        dual_on=_flag_on(rules, "agent.react.dual_sample", "0"),
    )
    rt.flags["mode"] = ui_mode

    graph, published = _agent_graph("default")
    _bind_published_flow(rt, published)
    rt.decision.route = f"agent_graph:v{rt.flow_version}"
    try:
        async for chunk in graph.astream(
            {"rt": rt, "tick": 0},
            stream_mode="custom",
        ):
            if isinstance(chunk, dict) and chunk.get("type"):
                yield chunk
    except Exception as err:  # noqa: BLE001
        rt.fatal = str(err)
        try:
            refund_hold_fn(user_id, hold, task_id=task_id)
        except Exception:
            pass
        run.note_error(str(err)[:240])
        run.push_log(phase="error", error=str(err)[:240])
        decision.apply(route="error", intent=run.intent)
        _persist_task_meta(task_id, decision=decision, state=run)
        _update_task(task_id, status="error", error_message=str(err)[:800])
        yield {"type": "execution_log", **run.to_execution_log()}
        yield {
            "type": "error",
            "message": _user_facing_run_error(err, rules=rules),
            "task_id": task_id,
            "trace_id": trace_id,
            "refunded_credits": hold,
        }
