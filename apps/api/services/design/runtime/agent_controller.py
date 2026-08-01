"""Design Agent LangGraph controller.

Fixed LangGraph: bootstrap → memory → intent → decide → paint_ops → action/propose → settle.
Decision stage never paints; paint_ops is the dedicated tool_ops emitter.
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
    early_status_canvas_fields,
    explicit_canvas_size,
    parse_size as _parse_size,
    resolve_agent_scene,
    scene_key as _scene_key,
)
from services.design.decision_log import DesignRunDecision
from services.design.llm_step import stream_skill_step
from services.design.models_route import (
    clamp_tier,
    classify_user_intent,
    enabled_tiers,
    estimate_task_tier,
    resolve_model_for_skill,
    router_model_id,
)
from services.design.pipeline_support import (
    _normalize_ref_images,
    _user_facing_run_error,
)
from services.design.prompt_build import _edit_context_block, _finalize_memory_patch
from services.design.rules_text import _as_text, _rule_text, exec_trace, render_prompt_template
from services.design.scene_feedback import begin_wait, wait_for_scene
from services.design.task_store import _insert_task, _update_task
from services.design.tool_ops_contract import (
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
from services.design.knowledge_store import (
    format_knowledge_details,
    normalize_need_knowledge,
)
from services.design.skill_store import (
    filter_ops_by_skill_allowlist,
    filter_need_resources_by_skill_acl,
    format_skills_catalog,
    format_skills_details,
    normalize_need_skills,
    resolve_triggered_skill_keys,
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
from pydantic import BaseModel, Field, field_validator, model_validator

_log = logging.getLogger(__name__)
logger = _log

# Defaults when Admin global rules are empty (zero-base).
_DEFAULT_MAX_ROUNDS = 4
_DEFAULT_MAX_REFLECT = 1
_SCENE_WAIT_SEC = 12.0

_PAINT_OP_META_KEYS = frozenset(
    {
        "name",
        "tool",
        "type",
        "op",
        "op_key",
        "opKey",
        "args",
        "properties",
        "props",
        "updates",
        "params",
        "op_id",
        "opId",
    }
)


class PaintToolOp(BaseModel):
    """LangChain envelope for one canvas op — name + args only (not canvas semantics)."""

    name: str = Field(..., min_length=1)
    args: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _coalesce_flat_op(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        name = (
            d.get("name")
            or d.get("tool")
            or d.get("op")
            or d.get("op_key")
            or d.get("opKey")
            or ""
        )
        type_as_name = str(d.get("type") or "").strip()
        if not str(name or "").strip() and type_as_name in {
            "create_shape",
            "create_text",
            "create_image",
            "create_frame",
            "update_node",
            "delete_nodes",
            "delete_frame",
            "create_svg",
            "create_icon",
        }:
            name = type_as_name
        args = d.get("args")
        if not isinstance(args, dict):
            args = {k: v for k, v in d.items() if k not in _PAINT_OP_META_KEYS}
        else:
            args = dict(args)
        for nest_key in ("properties", "props", "updates", "params"):
            nested = d.get(nest_key)
            if isinstance(nested, dict):
                for nk, nv in nested.items():
                    args.setdefault(nk, nv)
        if (
            str(name or "").strip() == "create_shape"
            and args.get("shapeType") is None
            and d.get("type") is not None
            and str(d.get("type")) not in {"create_shape"}
        ):
            args.setdefault("shapeType", d.get("type"))
        return {"name": str(name or "").strip(), "args": args}


class AgentTurnSchema(BaseModel):
    """LangChain structured agent turn (canvas tool_ops stay FE-applied)."""

    thought: str = ""
    intent: str = "chat"
    reply: str = ""
    tool_ops: list[PaintToolOp] = Field(default_factory=list)
    ops: list[PaintToolOp] = Field(default_factory=list)
    need_tools: list[Any] = Field(default_factory=list)
    need_knowledge: list[Any] = Field(default_factory=list)
    need_skills: list[Any] = Field(default_factory=list)
    need_aesthetics: bool = False
    use_user_refs: bool = False
    choices: list[Any] = Field(default_factory=list)
    apply_choice: str = ""
    applyChoice: str = ""
    # Ask interaction format — AI fills labels; runtime only validates shape.
    choice_ui: Any = None
    choiceUi: Any = None
    ask_ui: Any = None
    done: bool | None = None
    needTools: list[Any] = Field(default_factory=list)
    needKnowledge: list[Any] = Field(default_factory=list)
    needSkills: list[Any] = Field(default_factory=list)
    needAesthetics: bool | None = None
    useUserRefs: bool | None = None
    tools_needed: list[Any] = Field(default_factory=list)

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _alias_ops_to_tool_ops(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if not d.get("tool_ops") and d.get("ops"):
            d["tool_ops"] = d.get("ops")
        return d


class DecideTurnSchema(BaseModel):
    """Decision stage only — never emits canvas ops (paint_ops node does that)."""

    thought: str = ""
    intent: str = "chat"
    reply: str = ""
    need_tools: list[Any] = Field(default_factory=list)
    need_knowledge: list[Any] = Field(default_factory=list)
    need_skills: list[Any] = Field(default_factory=list)
    need_aesthetics: bool = False
    use_user_refs: bool = False
    choices: list[Any] = Field(default_factory=list)
    choice_ui: Any = None
    done: bool | None = None

    model_config = {"extra": "allow"}


class PaintOpsSchema(BaseModel):
    """Paint stage — LangChain validates op envelope; host validates canvas semantics."""

    tool_ops: list[PaintToolOp] = Field(default_factory=list)
    intent: str = "create"
    reply: str = ""

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _alias_ops_to_tool_ops(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if not d.get("tool_ops") and d.get("ops"):
            d["tool_ops"] = d.get("ops")
        return d

    @field_validator("tool_ops", mode="before")
    @classmethod
    def _coerce_tool_ops_list(cls, value: Any) -> Any:
        if value is None:
            return []
        if isinstance(value, dict):
            return [value]
        return value


class PlanSchema(BaseModel):
    plan: list[str] = Field(default_factory=list)

    model_config = {"extra": "allow"}


# Fallback paint kits (structural — not content-category lists).
# Prefer `_paint_tool_keys_for_turn` which trims by scene / vision / intent.
_DEFAULT_PAINT_CREATE_TOOLS = (
    "create_frame",
    "create_shape",
    "create_text",
    "create_image",
)
_DEFAULT_PAINT_EDIT_TOOLS = (
    "create_shape",
    "create_text",
    "create_image",
    "update_node",
    "delete_nodes",
)
# Compact prompt length (whitespace-stripped) for lean paint / skip skill preload.
_LEAN_PAINT_PROMPT_CHARS = 96


def _agent_turn_parser():
    from langchain_core.output_parsers import PydanticOutputParser

    return PydanticOutputParser(pydantic_object=AgentTurnSchema)


def _plan_parser():
    from langchain_core.output_parsers import PydanticOutputParser

    return PydanticOutputParser(pydantic_object=PlanSchema)


def _thought_chat_prompt():
    """Canonical LangChain ChatPromptTemplate for Design Agent thought turns."""
    from langchain_core.prompts import ChatPromptTemplate

    return ChatPromptTemplate.from_messages(
        [
            ("system", "{system}"),
            (
                "human",
                "{recent_dialogue}"
                "USER_PROMPT:\n{prompt}\n\n"
                "CANVAS_SIZE: {canvas_size}\n\n"
                "SCENE: {scene}\n\n"
                "{scene_digest}\n\n"
                "{pending_blocks}"
                "{plan_block}"
                "{memory_block}"
                "{error_block}"
                "{edit_context}",
            ),
        ]
    )


def _prompt_text(rules: dict[str, str] | None, key: str) -> str:
    """Prefer Admin/DB (via rules or pack table); local seed only if DB empty."""
    try:
        from services.design.prompt_pack_store import resolve_prompt_body

        return resolve_prompt_body(key, rules=rules)
    except Exception:
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
    return render_prompt_template(tmpl, model_label=_model_display_label(mid))


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
    # Ask mode: validated ops held until user picks apply action.
    proposed_ops: list[dict[str, Any]] = field(default_factory=list)
    # Ask mode: label of the apply option (compat + typed confirm).
    apply_choice: str = ""
    # Ask interaction UI from model: {mode, options:[{label, action}]}.
    choice_ui: dict[str, Any] | None = None
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
    # Host-side image gen (Seedream etc.) ? not ReAct chat tokens.
    images_used: dict[str, int] = field(default_factory=dict)
    # simple | medium | complex ? from precheck.task_tiers matrix
    task_tier: str = ""
    # True when look-at-image (vision model) was selected or switched to
    vision_used: bool = False
    # Deferred tools: op_keys whose full details were injected this run.
    tools_loaded: list[str] = field(default_factory=list)
    # Deferred knowledge kinds injected this run.
    knowledge_loaded: list[str] = field(default_factory=list)
    # Deferred skill keys injected this run.
    skills_loaded: list[str] = field(default_factory=list)
    # Deferred aesthetics refs injected this run.
    aesthetics_loaded: bool = False
    # Published Admin flow identity (for 运行复盘).
    flow_id: str = ""
    flow_version: int = 0
    current_node_id: str = ""
    # Langfuse root trace id when CallbackHandler reports last_trace_id.
    langfuse_trace_id: str = ""
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
            # Route / switch / hydrate markers ? tokens live on LLM phases.
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
            "skills_loaded": list(self.skills_loaded),
            "aesthetics_loaded": bool(self.aesthetics_loaded),
            "flow_id": self.flow_id or None,
            "flow_version": self.flow_version or None,
            "steps": list(self.log)
        }


def _flag_on(rules: dict[str, str] | None, key: str, default: str = "0") -> bool:
    raw = _rule_text(rules, key, default).strip().lower()
    if not raw:
        raw = default.strip().lower()
    return raw in ("1", "true", "on", "yes")


def _wants_short_plan(prompt: str, *, rules: dict[str, str]) -> bool:
    """Short plan when Admin enables — length gate only (no content keywords).

    Whether the brief is a poster/page/etc. is the planner LLM's job.
    """
    if not _flag_on(rules, "agent.react.short_plan", "0"):
        return False
    try:
        min_chars = int(
            _rule_text(rules, "agent.react.short_plan_min_chars", "36") or 36
        )
    except ValueError:
        min_chars = 36
    min_chars = max(8, min_chars)
    return len((prompt or "").strip()) >= min_chars


def _parse_plan(content: Any) -> list[str]:
    """Plan steps from PlanSchema, dict, or model JSON text."""
    raw_obj: dict[str, Any] = {}
    if isinstance(content, PlanSchema):
        raw_obj = content.model_dump() if hasattr(content, "model_dump") else {"plan": content.plan}
    elif isinstance(content, dict):
        raw_obj = content
    else:
        try:
            parsed = _plan_parser().parse(content or "")
            raw_obj = parsed.model_dump() if hasattr(parsed, "model_dump") else {}
        except Exception:
            raw_obj = extract_json_object(content) or {}
    raw = raw_obj.get("plan")
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
    skill_keys: list[str] | None = None,
    scene: str = "website",
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
    if skill_keys:
        step_ops, allow_errs = filter_ops_by_skill_allowlist(
            step_ops, skill_keys=skill_keys, scene=scene
        )
        op_errors = list(op_errors or []) + list(allow_errs or [])
    return step_ops, op_errors



def _op_name(op: dict[str, Any]) -> str:
    return str(op.get("name") or op.get("op_key") or "").strip()


def _ops_patch_too_broad(
    ops: list[dict[str, Any]],
    scene_nodes: list[dict[str, Any]],
    *,
    intent: str,
) -> tuple[bool, str]:
    """Heuristic: edit rounds should not wipe / flood the canvas in one batch."""
    if (intent or "").strip().lower() == "create":
        return False, ""
    batch = [o for o in (ops or []) if isinstance(o, dict)]
    if not batch:
        return False, ""
    names = [_op_name(o) for o in batch]
    wipe = {"clear_canvas", "reset_scene", "delete_all", "clear_artboard"}
    if any(n in wipe for n in names):
        return True, "single-round canvas wipe op"
    deletes = [
        n for n in names if n.startswith("delete") or n in ("remove_node", "remove_nodes")
    ]
    creates = [
        n
        for n in names
        if n.startswith("create_") or n in ("add_node", "add_text", "add_image", "add_shape")
    ]
    n_scene = len([n for n in (scene_nodes or []) if isinstance(n, dict) and n.get("id")])
    if n_scene >= 4 and len(deletes) >= max(6, int(0.55 * n_scene)):
        return True, f"too many deletes ({len(deletes)}/{n_scene})"
    if n_scene >= 1 and len(creates) > 40:
        return True, f"too many creates on edit ({len(creates)})"
    if len(batch) > 60:
        return True, f"too many ops ({len(batch)})"
    return False, ""


def _structure_verify_issues(
    *,
    nodes: list[dict[str, Any]],
    frames: list[dict[str, Any]],
    painted: bool,
    intent: str,
) -> list[str]:
    """Deterministic canvas sanity checks ? fact flags only, no routing."""
    if not painted:
        return []
    issues: list[str] = []
    clean_nodes = [n for n in (nodes or []) if isinstance(n, dict) and n.get("id")]
    clean_frames = [f for f in (frames or []) if isinstance(f, dict) and f.get("id")]
    intent_l = (intent or "").strip().lower()
    if intent_l in ("edit", "create") and not clean_nodes and not clean_frames:
        issues.append("canvas empty after apply (no nodes/frames)")
        return issues
    if (
        intent_l in ("edit", "create")
        and clean_frames
        and not clean_nodes
        and all(bool(f.get("is_empty")) for f in clean_frames)
    ):
        issues.append("artboard still empty after apply")
    zero_box = 0
    for n in clean_nodes[:80]:
        try:
            w = float(n.get("w") or n.get("width") or 0)
            h = float(n.get("h") or n.get("height") or 0)
        except (TypeError, ValueError):
            w, h = 0.0, 0.0
        if w <= 0 or h <= 0:
            zero_box += 1
    if clean_nodes and zero_box >= max(3, int(0.7 * len(clean_nodes))):
        issues.append(f"most nodes have invalid size ({zero_box}/{len(clean_nodes)})")
    return issues


def _optional_aesthetics_verify(
    *,
    preview_url: str,
    scene: str,
    rules: dict[str, str],
) -> tuple[bool, str, float]:
    """CLIP RAG gate when preview URL + corpus exist; fail-open otherwise."""
    url = (preview_url or "").strip()
    if not url:
        return True, "", 0.0
    flag = str(rules.get("agent.verify.aesthetics") or "0").strip().lower()
    if flag in ("0", "false", "off", "no"):
        return True, "", 0.0
    try:
        from services.design.aesthetics.scorer import score_design_image

        res = score_design_image(image_url=url, scene=scene or "website")
    except Exception as exc:
        _log.warning("verify aesthetics skipped: %s", exc)
        return True, "", 0.0
    if not isinstance(res, dict):
        return True, "", 0.0
    if res.get("status") in ("unavailable", "skipped", "error"):
        return True, "", float(res.get("score") or 0)
    passed = bool(res.get("pass", True))
    score = float(res.get("score") or 0)
    if passed:
        return True, "", score
    thr = float(res.get("threshold") or 0)
    return False, f"aesthetics below threshold score={score:.2f} thr={thr:.2f}", score


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


def _has_pending_resource_details(rt: Any) -> bool:
    """True when tool/knowledge/skill/aesthetics details were injected this run."""
    return bool(
        str(getattr(rt, "pending_tool_details", "") or "").strip()
        or str(getattr(rt, "pending_knowledge_details", "") or "").strip()
        or str(getattr(rt, "pending_skill_details", "") or "").strip()
        or str(getattr(rt, "pending_aesthetics_details", "") or "").strip()
    )


def _should_recover_edit_after_resources(
    *,
    prior_intent: str,
    intent: str,
    has_ops: bool,
    has_pending_resources: bool,
) -> bool:
    """After TOOL_DETAILS etc., model must not drop edit/create into bare chat."""
    if has_ops or not has_pending_resources:
        return False
    if prior_intent not in ("edit", "create"):
        return False
    return intent in ("chat", "ask", "done")


def _lc_design_needs_canvas_ops(
    *,
    classified: str,
    turn_intent: str,
    has_ops: bool,
    has_clarify: bool = False,
    ask_mode: bool = False,
) -> bool:
    """True when runtime must route to paint_ops (not narrate-only / clarify)."""
    if has_ops:
        return False
    t = (turn_intent or "").strip().lower()
    # Real clarify = ask + choices/choice_ui. Ask mode: any intent=ask waits on the user.
    if t == "ask" and (has_clarify or ask_mode):
        return False
    c = (classified or "").strip().lower()
    if c in ("edit", "create"):
        return True
    return t in ("edit", "create")


def _should_route_to_paint(
    *,
    classified: str,
    turn_intent: str,
    has_clarify: bool,
    ask_mode: bool = False,
) -> bool:
    """Decision stage → paint_ops when canvas work is required."""
    return _lc_design_needs_canvas_ops(
        classified=classified,
        turn_intent=turn_intent,
        has_ops=False,
        has_clarify=has_clarify,
        ask_mode=ask_mode,
    )


def _turn_has_clarify(turn: dict[str, Any] | None) -> bool:
    """True when the model asked the user with chips / choice_ui (not bare ask)."""
    if not isinstance(turn, dict):
        return False
    if turn.get("choice_ui"):
        return True
    choices = turn.get("choices")
    return isinstance(choices, list) and bool(choices)


def _prompt_compact_len(prompt: str | None) -> int:
    return len(re.sub(r"\s+", "", str(prompt or "")))


def _is_lean_paint_turn(rt: Any) -> bool:
    """Short, no-vision canvas add/edit — slim paint prompt (no content keywords)."""
    if bool(getattr(rt, "images", None)):
        return False
    return _prompt_compact_len(getattr(rt, "prompt", None)) <= _LEAN_PAINT_PROMPT_CHARS


def _paint_tool_keys_for_turn(rt: Any) -> list[str]:
    """Structural paint tool kit — not hard-coded to rect / one shape type.

    - Always: create_shape + create_text (covers shapes, paths, labels).
    - create_frame only when there is no artboard yet / canvas empty.
    - create_image only when the turn has attachments.
    - update/delete when edit intent and scene has nodes.
    - Plus any tools the model already requested via need_tools.
    """
    st = rt.run
    want = str(rt.classified_intent or st.intent or "create").strip().lower()
    if want not in ("edit", "create"):
        want = "create"
    has_images = bool(getattr(rt, "images", None))
    empty = _canvas_is_empty(rt)
    frames = [
        f for f in (getattr(rt, "scene_frames", None) or [])
        if isinstance(f, dict) and f.get("id")
    ]
    nodes = [
        n for n in (getattr(rt, "scene_nodes", None) or [])
        if isinstance(n, dict) and n.get("id")
    ]

    keys: list[str] = ["create_shape", "create_text"]
    if want == "create" and (empty or not frames):
        keys.insert(0, "create_frame")
    if has_images:
        keys.append("create_image")
    if want == "edit" and nodes:
        for k in ("update_node", "delete_nodes"):
            if k not in keys:
                keys.append(k)

    for raw in st.tools_loaded or []:
        k = str(raw or "").strip()
        if k and k not in keys:
            keys.append(k)
    return keys[:8]


def _ensure_paint_tool_details(rt: Any) -> None:
    """Guarantee TOOL_DETAILS before the paint stage (no narrate-only escape)."""
    st = rt.run
    keys = _paint_tool_keys_for_turn(rt)
    if not keys:
        want = str(rt.classified_intent or st.intent or "create").strip().lower()
        keys = list(
            _DEFAULT_PAINT_EDIT_TOOLS if want == "edit" else _DEFAULT_PAINT_CREATE_TOOLS
        )
    details = format_canvas_tools_details(keys, rules=rt.rules)
    if not details:
        return
    rt.pending_tool_details = "TOOL_DETAILS:\n" + details
    for k in keys:
        if k not in st.tools_loaded:
            st.tools_loaded.append(k)


def _paint_ops_system(rt: Any) -> str:
    persona = str(getattr(rt, "persona", "") or "").strip()
    head = f"IDENTITY: {persona}\n\n" if persona else ""
    flags = getattr(rt, "flags", None)
    if not isinstance(flags, dict):
        flags = {}
    ask_mode = str(flags.get("mode") or "").strip().lower() == "ask"
    ask_rule = (
        "- Ask mode: user already clarified; emit ops only; reply briefly (never claim applied).\n"
        if ask_mode
        else "- Do not ask questions.\n"
    )
    tmpl = _prompt_text(rt.rules, "agent.prompt.paint_system")
    if tmpl:
        try:
            return head + tmpl.format(ask_rule=ask_rule)
        except Exception:
            pass
    return (
        head
        + "You are the canvas PAINT stage of a design editor agent.\n"
        "Your ONLY job: emit non-empty tool_ops that change the canvas.\n"
        "Rules:\n"
        "- tool_ops must be a non-empty array; use TOOL_DETAILS `name`/`op_key` exactly.\n"
        "- New poster/page/artboard → create_frame first (with width/height), then children.\n"
        "- Infinite canvas: add shape/text (添加矩形等) → create_shape/create_text in world "
        "space; do NOT create_frame unless the user asked for a new artboard/page/poster.\n"
        "- If FOCUS_FRAME_ID is set, prefer placing inside that frame; otherwise free-canvas.\n"
        "- When the user gives no position: use PLACEMENT.suggested_place_world (or "
        "suggested_place inside a focused frame). Keep new nodes inside viewport_world.\n"
        "- Do NOT place free-canvas creates far outside the current viewport.\n"
        "- CANVAS_SIZE concrete WxH → create_frame must use that size; auto → pick WxH yourself.\n"
        "- intent must be edit or create. reply ≤40 characters (no design essay).\n"
        "- Never say you already added/applied anything; ops are applied by the host after this.\n"
        + ask_rule
        + "- Do not leave tool_ops empty. Do not invent node ids.\n"
    )


def _box_num(d: dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for k in keys:
        if k in d and d[k] is not None:
            try:
                return float(d[k])
            except (TypeError, ValueError):
                pass
    return default


def _derive_suggested_place_world(
    spatial: dict[str, Any] | None,
    *,
    focus_frame: dict[str, Any] | None = None,
) -> dict[str, float] | None:
    """Host derives free-canvas place from FE viewport / frame-local slot / focus frame."""
    spatial = spatial if isinstance(spatial, dict) else {}
    vp = spatial.get("viewport")
    if isinstance(vp, dict):
        vx = _box_num(vp, "x")
        vy = _box_num(vp, "y")
        vw = _box_num(vp, "w", "width")
        vh = _box_num(vp, "h", "height")
        if vw > 8 and vh > 8:
            cw = min(320.0, max(80.0, vw * 0.25))
            ch = min(200.0, max(80.0, vh * 0.25))
            return {
                "x": round(vx + max(24.0, (vw - cw) / 2)),
                "y": round(vy + max(24.0, (vh - ch) / 2)),
                "w": round(cw),
                "h": round(ch),
            }
    sp = spatial.get("suggested_place")
    if isinstance(sp, dict) and isinstance(focus_frame, dict):
        fox = _box_num(focus_frame, "x")
        foy = _box_num(focus_frame, "y")
        fw = _box_num(focus_frame, "w", "width")
        fh = _box_num(focus_frame, "h", "height")
        # Only promote frame-local slots when the focus frame has a world origin.
        if fw > 8 and fh > 8:
            return {
                "x": round(fox + _box_num(sp, "x")),
                "y": round(foy + _box_num(sp, "y")),
                "w": round(_box_num(sp, "w", "width", default=320)),
                "h": round(_box_num(sp, "h", "height", default=200)),
            }
    # Last resort: center of the focused artboard in world coords.
    if isinstance(focus_frame, dict):
        fox = _box_num(focus_frame, "x")
        foy = _box_num(focus_frame, "y")
        fw = _box_num(focus_frame, "w", "width")
        fh = _box_num(focus_frame, "h", "height")
        if fw > 8 and fh > 8:
            cw = min(320.0, max(80.0, fw * 0.25))
            ch = min(200.0, max(80.0, fh * 0.25))
            return {
                "x": round(fox + max(24.0, (fw - cw) / 2)),
                "y": round(foy + max(24.0, (fh - ch) / 2)),
                "w": round(cw),
                "h": round(ch),
            }
    return None


def _format_spatial_placement(
    spatial: dict[str, Any] | None,
    *,
    focus_frame: dict[str, Any] | None = None,
) -> str:
    """Host placement brief — concrete numbers the paint model must use."""
    spatial = spatial if isinstance(spatial, dict) else {}
    spw = _derive_suggested_place_world(spatial, focus_frame=focus_frame)
    vp = spatial.get("viewport")
    sp = spatial.get("suggested_place")
    empties = spatial.get("empty_rects")
    has_vp = isinstance(vp, dict) and _box_num(vp, "w", "width") > 0
    has_sp = isinstance(sp, dict) and _box_num(sp, "w", "width") > 0
    if not spw and not has_vp and not has_sp:
        return ""
    lines: list[str] = [
        "PLACEMENT (no user position → pick a visible empty slot; stay in viewport):",
        "- free-canvas create_shape/create_text (omit frameId): use suggested_place_world x/y as WORLD coords.",
        "- inside FOCUS_FRAME_ID: pass frameId + suggested_place / empty_rects (frame-local).",
        "- Never invent near-origin x/y when suggested_place_world is far from (0,0).",
    ]
    if has_vp:
        lines.append(
            f"- viewport_world: x={vp.get('x')} y={vp.get('y')} "
            f"w={vp.get('w') or vp.get('width')} h={vp.get('h') or vp.get('height')}"
        )
    if spw:
        lines.append(
            f"- suggested_place_world: x={spw['x']} y={spw['y']} "
            f"w={spw['w']} h={spw['h']}"
        )
    if has_sp:
        lines.append(
            f"- suggested_place (frame-local): x={sp.get('x')} y={sp.get('y')} "
            f"w={sp.get('w')} h={sp.get('h')}"
        )
    if isinstance(empties, list):
        for i, box in enumerate(empties[:3]):
            if not isinstance(box, dict):
                continue
            lines.append(
                f"- empty_rect[{i}] (frame-local): x={box.get('x')} y={box.get('y')} "
                f"w={box.get('w')} h={box.get('h')}"
            )
    return "\n".join(lines)


def _focus_frame_from_rt(rt: Any) -> dict[str, Any] | None:
    focus_id = str(getattr(rt, "focus_id", "") or "").strip()
    if not focus_id:
        return None
    for f in getattr(rt, "scene_frames", None) or []:
        if isinstance(f, dict) and str(f.get("id") or "") == focus_id:
            return f
    return None


def _point_outside_world_box(
    x: float,
    y: float,
    box: dict[str, Any],
    *,
    pad: float = 0.0,
) -> bool:
    bx = _box_num(box, "x")
    by = _box_num(box, "y")
    bw = _box_num(box, "w", "width")
    bh = _box_num(box, "h", "height")
    if bw <= 0 or bh <= 0:
        return False
    return (
        x < bx - pad
        or y < by - pad
        or x > bx + bw + pad
        or y > by + bh + pad
    )


def _create_op_placement_fields(op: dict[str, Any]) -> tuple[Any, Any, str]:
    """Return (x, y, frameId) from normalized {args} or flat model shape."""
    args = op.get("args") if isinstance(op.get("args"), dict) else None
    src = args if args is not None else op
    return src.get("x"), src.get("y"), str(src.get("frameId") or src.get("frame_id") or "").strip()


def _placement_errors_for_free_creates(rt: Any, ops: list[dict[str, Any]]) -> list[str]:
    """Reject free-canvas creates outside the camera; model must re-emit with suggested_place_world.

    Does not mutate ops. Frame-scoped creates (frameId set) are skipped — those use frame-local coords.
    """
    if not ops:
        return []
    spatial = (
        getattr(rt, "spatial_summary", None)
        if isinstance(getattr(rt, "spatial_summary", None), dict)
        else {}
    )
    focus_frame = _focus_frame_from_rt(rt)
    spw = _derive_suggested_place_world(spatial, focus_frame=focus_frame)
    vp = spatial.get("viewport") if isinstance(spatial, dict) else None
    view_box = vp if isinstance(vp, dict) and _box_num(vp, "w", "width") > 0 else None
    if view_box is None and isinstance(focus_frame, dict):
        view_box = focus_frame
    if view_box is None:
        return []
    pad = max(
        64.0,
        0.25 * min(_box_num(view_box, "w", "width"), _box_num(view_box, "h", "height")),
    )
    errors: list[str] = []
    for op in ops:
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or op.get("op_key") or "").strip()
        if name not in ("create_shape", "create_text", "create_image"):
            continue
        ox_raw, oy_raw, frame_id = _create_op_placement_fields(op)
        if frame_id:
            continue
        if ox_raw is None and oy_raw is None:
            continue
        try:
            ox = float(ox_raw if ox_raw is not None else (spw["x"] if spw else 0))
            oy = float(oy_raw if oy_raw is not None else (spw["y"] if spw else 0))
        except (TypeError, ValueError):
            continue
        if not _point_outside_world_box(ox, oy, view_box, pad=pad):
            continue
        if spw is not None:
            errors.append(
                format_op_error(
                    "placement_outside_viewport",
                    fix=(
                        f"re-emit {name} with x={spw['x']} y={spw['y']} "
                        f"from suggested_place_world (omit frameId for free-canvas)"
                    ),
                    detail=(
                        f"{name} at world ({int(round(ox))},{int(round(oy))}) "
                        f"outside viewport_world"
                    ),
                )
            )
        else:
            errors.append(
                format_op_error(
                    "placement_outside_viewport",
                    fix=(
                        f"re-emit {name} with x/y inside the visible camera "
                        f"(omit frameId for free-canvas)"
                    ),
                    detail=(
                        f"{name} at world ({int(round(ox))},{int(round(oy))}) "
                        f"outside viewport_world"
                    ),
                )
            )
    return errors[:8]


def _paint_ops_user(rt: Any) -> str:
    vars_ = _thought_prompt_variables(rt)
    spatial = (
        getattr(rt, "spatial_summary", None)
        if isinstance(getattr(rt, "spatial_summary", None), dict)
        else {}
    )
    focus_frame = _focus_frame_from_rt(rt)
    spatial_hint = _format_spatial_placement(spatial, focus_frame=focus_frame)
    lean = _is_lean_paint_turn(rt)
    # Lean: tools + scene only — drop skill/knowledge/aesthetics essays for short adds.
    if lean:
        pending = str(getattr(rt, "pending_tool_details", "") or "").strip()
    else:
        pending = vars_["pending_blocks"]
    parts = [
        f"USER_PROMPT:\n{vars_['prompt']}",
        f"CANVAS_SIZE: {vars_['canvas_size']}",
        f"SCENE: {vars_['scene']}",
        vars_["scene_digest"],
        spatial_hint,
        pending,
    ]
    if not lean:
        parts.append(vars_["plan_block"])
        parts.append(vars_["edit_context"])
    parts.append(vars_["error_block"])
    parts.append("Emit PaintOpsSchema now: non-empty tool_ops first.")
    return "\n\n".join(p for p in parts if str(p or "").strip())


def _slim_failure_steps(steps: list[dict[str, Any]], *, limit: int = 12) -> list[dict[str, Any]]:
    """Keep a compact trail when paint failed (Langfuse often misses local task ids)."""
    keep_keys = (
        "phase",
        "intent",
        "summary",
        "reply",
        "error",
        "errors",
        "ops_count",
        "tokens",
        "model",
        "need_tools",
        "need_skills",
        "llm_raw",
        "dropped_intent",
    )
    out: list[dict[str, Any]] = []
    for step in list(steps or [])[-limit:]:
        if not isinstance(step, dict):
            continue
        slim = {k: step[k] for k in keep_keys if k in step and step[k] not in (None, "", [], {})}
        if slim:
            out.append(slim)
    return out


def _should_early_open_artboard(_rt: Any) -> bool:
    """Do not invent an artboard before paint.

    Infinite canvas: shapes/text need no plate. A plate opens only when paint
    emits ``create_frame`` (see ``_emit_canvas_size_from_ops``).
    """
    return False


def _resolve_loading_wh(rt: Any) -> tuple[int, int]:
    """Concrete WxH for early loading plate (client lock or scene stock default)."""
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
    ow, oh = _wh_from_create_frame_ops(step_ops)
    if ow <= 0 or oh <= 0:
        return False
    return _emit_canvas_size_step(
        rt, ow=ow, oh=oh, design_loading=True, reason="paint_ops"
    )


def _chat_fallback_text(rt: Any) -> str:
    """Render agent.prompt.chat_fallback with persona + prompt slots filled."""
    tmpl = str(getattr(rt, "chat_fallback_tmpl", "") or "").strip()
    if not tmpl:
        return ""
    persona = str(getattr(rt, "persona", "") or "").strip() or "设计助手"
    prompt = str(getattr(rt, "prompt", "") or "")[:80]
    return render_prompt_template(tmpl, persona=persona, prompt=prompt)


def _clear_ask_choice_state(st: AgentRunState) -> None:
    st.choices = []
    st.choice_ui = None
    st.apply_choice = ""


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
            "\n".join(prompts or []) or f"hydrate?{n_img}",
            limit=4000,
        ),
        "llm_raw": _clip_llm_raw(
            "\n".join(f"result_src={u}" for u in (srcs or []))
            or f"filled={n_img} (no src captured)",
            limit=4000,
        )
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
            "chat": '打招呼',
            "ask": '确认需求',
            "done": '完成',
            "edit": '编辑画布',
            "create": '创建内容'
        }.get(intent, '处理中')
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


def _fresh_skill_keys(
    need_skills: list[str], *, skills_loaded: list[str]
) -> list[str]:
    if not need_skills:
        return []
    if "*" in need_skills:
        return list(need_skills)
    fresh = [k for k in need_skills if k not in skills_loaded]
    return fresh or list(need_skills)


def _fetch_deferred_knowledge(*, kinds: list[str], scene: str) -> dict[str, Any]:
    details = format_knowledge_details(kinds=kinds, scene=scene)
    return {"kinds": list(kinds), "details": details or ""}


def _fetch_deferred_skills(
    *,
    keys: list[str],
    scene: str,
    version_pins: dict[str, int | str] | None = None,
    input_args: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    from services.design.skill_store import format_skills_details_checked

    details, errs = format_skills_details_checked(
        keys=keys,
        scene=scene,
        version_pins=version_pins,
        input_args=input_args,
        user_id=user_id,
    )
    return {"keys": list(keys), "details": details or "", "errors": errs}


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
            "mode": "error"
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
        "use_user_refs": use_user_refs
    }


async def _gather_deferred_resource_details(
    *,
    fresh_k: list[str],
    fresh_skills: list[str],
    fresh_tools: list[str],
    load_aesthetics: bool,
    prompt: str,
    scene: str,
    canvas_w: int,
    canvas_h: int,
    user_ref_urls: list[str],
    use_user_refs: bool,
    rules: dict[str, str],
    skill_version_pins: dict[str, int | str] | None = None,
    skill_input_args: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Fetch knowledge / skills / tools / aesthetics in parallel."""
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
    if fresh_skills:
        jobs.append(
            (
                "skills",
                asyncio.to_thread(
                    _fetch_deferred_skills,
                    keys=fresh_skills,
                    scene=scene,
                    version_pins=skill_version_pins,
                    input_args=skill_input_args,
                    user_id=user_id,
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


_ASK_CHOICE_MODES = frozenset({"confirm", "single", "multi", "buttons", "text"})
_ASK_CHOICE_ACTIONS = frozenset({"apply", "reply", "dismiss"})


def _normalize_choice_option(raw: Any) -> dict[str, str] | None:
    """One option: label (AI text) + action (format enum)."""
    if isinstance(raw, str):
        label = raw.strip()[:48]
        if not label:
            return None
        return {"label": label, "action": "reply"}
    if not isinstance(raw, dict):
        return None
    label = _as_text(
        raw.get("label") or raw.get("text") or raw.get("title") or raw.get("id")
    ).strip()[:48]
    action = _as_text(raw.get("action") or raw.get("role") or "reply").strip().lower()
    if action in ("cancel", "close", "reject"):
        action = "dismiss"
    if action in ("ok", "confirm", "execute", "paint"):
        action = "apply"
    if action not in _ASK_CHOICE_ACTIONS:
        action = "reply"
    # apply/dismiss may omit label — FE fills i18n chrome.
    if not label and action == "reply":
        return None
    return {"label": label, "action": action}


def _normalize_choice_ui(
    raw: Any,
    *,
    legacy_choices: list[str] | None = None,
    legacy_apply: str = "",
) -> dict[str, Any] | None:
    """Validate Ask choice format. Content labels stay model-authored."""
    mode = ""
    options_raw: list[Any] = []
    placeholder = ""
    if isinstance(raw, dict):
        mode = _as_text(raw.get("mode") or raw.get("type") or "").strip().lower()
        if mode in ("freeform", "free_text", "input", "textarea"):
            mode = "text"
        options_raw = list(raw.get("options") or raw.get("items") or raw.get("choices") or [])
        placeholder = _as_text(
            raw.get("placeholder") or raw.get("hint") or raw.get("prompt")
        ).strip()[:120]
    elif isinstance(raw, list):
        options_raw = list(raw)
    if not options_raw and legacy_choices:
        options_raw = list(legacy_choices)
    options: list[dict[str, str]] = []
    for item in options_raw[:8]:
        opt = _normalize_choice_option(item)
        if not opt:
            continue
        options.append(opt)
    apply_label = _as_text(legacy_apply).strip()[:48]
    if apply_label:
        matched = False
        for opt in options:
            if opt["label"] == apply_label:
                opt["action"] = "apply"
                matched = True
                break
        if not matched:
            options.insert(0, {"label": apply_label, "action": "apply"})
    # text mode is valid with zero options (user types freeform).
    if not options and mode != "text":
        return None
    if mode not in _ASK_CHOICE_MODES:
        # Infer mode from actions — still format, not content keywords.
        actions = {o["action"] for o in options}
        if actions <= {"apply", "dismiss"}:
            mode = "confirm"
        elif "apply" in actions:
            mode = "buttons"
        else:
            mode = "single"
    # Dedupe by label+action, keep order.
    seen: set[tuple[str, str]] = set()
    uniq: list[dict[str, str]] = []
    for opt in options:
        key = (opt["label"], opt["action"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(opt)
    out: dict[str, Any] = {"mode": mode, "options": uniq[:8]}
    if placeholder:
        out["placeholder"] = placeholder
    return out


def _choice_ui_sync_compat(st: AgentRunState) -> None:
    """Keep choices[] / apply_choice in sync for older SSE clients."""
    ui = st.choice_ui if isinstance(st.choice_ui, dict) else None
    if not ui:
        return
    opts = [o for o in (ui.get("options") or []) if isinstance(o, dict)]
    st.choices = [str(o.get("label") or "").strip() for o in opts if str(o.get("label") or "").strip()][:6]
    apply = next(
        (
            str(o.get("label") or "").strip()
            for o in opts
            if str(o.get("action") or "") == "apply" and str(o.get("label") or "").strip()
        ),
        "",
    )
    if apply:
        st.apply_choice = apply[:48]


def _absorb_ask_choices(st: AgentRunState, turn: dict[str, Any]) -> None:
    """Persist Ask choice_ui from the model turn (create|edit propose included)."""
    legacy_choices = list(turn.get("choices") or [])[:6]
    legacy_apply = _as_text(turn.get("apply_choice")).strip()
    raw_ui = turn.get("choice_ui")
    ui = _normalize_choice_ui(
        raw_ui,
        legacy_choices=legacy_choices,
        legacy_apply=legacy_apply,
    )
    st.choice_ui = ui
    if ui:
        _choice_ui_sync_compat(st)
        return
    st.choices = legacy_choices
    if legacy_apply:
        st.apply_choice = legacy_apply[:48]
        if legacy_apply not in st.choices:
            st.choices = [legacy_apply] + [c for c in st.choices if c != legacy_apply]
            st.choices = st.choices[:6]


def _ensure_propose_choice_ui(st: AgentRunState) -> dict[str, Any]:
    """Propose must expose format-valid choice_ui; do not invent question content."""
    ui = _normalize_choice_ui(
        st.choice_ui,
        legacy_choices=list(st.choices),
        legacy_apply=st.apply_choice,
    )
    if not ui:
        # Structural chrome only — empty labels → FE i18n for confirm/cancel.
        ui = {
            "mode": "confirm",
            "options": [
                {"label": "", "action": "apply"},
                {"label": "", "action": "dismiss"},
            ]
        }
    elif not any(str(o.get("action") or "") == "apply" for o in ui.get("options") or []):
        # Ops ready but no apply action — keep mode (incl. text); add format slot.
        opts = list(ui.get("options") or [])
        opts.insert(0, {"label": "", "action": "apply"})
        ui = {**ui, "options": opts[:8]}
    st.choice_ui = ui
    _choice_ui_sync_compat(st)
    return ui


def _ask_propose_user_text(*, model_reply: str, detail: str) -> str:
    """User-facing propose copy: model reply only. Never append ops-detail lines."""
    del detail  # detail reads like already painted; Confirm chips carry the ask.
    return (model_reply or "").strip()


def _normalize_agent_turn_obj(obj: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize a structured AgentTurn dict for graph flags."""
    obj = obj if isinstance(obj, dict) else {}
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
            if isinstance(c, dict):
                text = _as_text(c.get("label") or c.get("text") or "").strip()
            else:
                text = _as_text(c).strip()
            if text and text not in choices:
                choices.append(text[:48])
            if len(choices) >= 6:
                break
    apply_choice = _as_text(obj.get("apply_choice") or obj.get("applyChoice")).strip()[:48]
    choice_ui = _normalize_choice_ui(
        obj.get("choice_ui") or obj.get("choiceUi") or obj.get("ask_ui"),
        legacy_choices=choices,
        legacy_apply=apply_choice,
    )
    if choice_ui:
        choices = [
            str(o.get("label") or "").strip()
            for o in choice_ui.get("options") or []
            if str(o.get("label") or "").strip()
        ][:6]
        apply_choice = next(
            (
                str(o.get("label") or "").strip()
                for o in choice_ui.get("options") or []
                if str(o.get("action") or "") == "apply"
                and str(o.get("label") or "").strip()
            ),
            apply_choice,
        )
    need_tools = normalize_need_tools(
        obj.get("need_tools") or obj.get("needTools") or obj.get("tools_needed")
    )
    need_knowledge = normalize_need_knowledge(
        obj.get("need_knowledge") or obj.get("needKnowledge")
    )
    from services.design.skill_store import parse_need_skills_with_pins

    need_skills, skill_version_pins, skill_input_args, skill_parse_errs = (
        parse_need_skills_with_pins(obj.get("need_skills") or obj.get("needSkills"))
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
        "need_skills": need_skills,
        "skill_version_pins": skill_version_pins,
        "skill_input_args": skill_input_args,
        "skill_parse_errs": skill_parse_errs,
        "need_aesthetics": need_aesthetics,
        "use_user_refs": use_user_refs,
        "choices": choices,
        "apply_choice": apply_choice,
        "choice_ui": choice_ui,
        "done": bool(done),
        "raw_obj": obj
    }


def _parse_agent_turn(content: str) -> dict[str, Any]:
    """Parse free-form model text → normalized turn (legacy / fallback)."""
    obj: dict[str, Any] = {}
    try:
        parsed = _agent_turn_parser().parse(content or "")
        obj = parsed.model_dump() if hasattr(parsed, "model_dump") else dict(parsed)
    except Exception:
        obj = extract_json_object(content) or {}
    return _normalize_agent_turn_obj(obj)


def _turn_from_structured(structured: Any) -> dict[str, Any]:
    """LangChain ``with_structured_output`` / response_format result → turn dict."""
    if structured is None:
        return _normalize_agent_turn_obj({})
    if hasattr(structured, "model_dump"):
        return _normalize_agent_turn_obj(structured.model_dump())
    if isinstance(structured, dict):
        return _normalize_agent_turn_obj(structured)
    return _normalize_agent_turn_obj({})


def _append_pending_reinject(
    parts: list[str],
    details: str,
    *,
    rules: dict[str, str] | None,
    prompt_key: str,
) -> None:
    """Append resource details + Admin-editable reinject instruction (if any)."""
    text = str(details or "").strip()
    if not text:
        return
    parts.append(text)
    reinject = _prompt_text(rules, prompt_key).strip()
    if reinject:
        parts.append(reinject)


def _thought_prompt_variables(rt: Any) -> dict[str, str]:
    """Variables for LangChain ChatPromptTemplate (thought turn)."""
    st = rt.run
    if rt.w > 0 and rt.h > 0:
        canvas_size = f"{rt.w}x{rt.h}"
    elif _as_text(rt.canvas_size).strip().lower() in ("", "auto"):
        hint = (rt.size_auto_hint or _prompt_text(rt.rules, "agent.prompt.size_auto")).strip()
        canvas_size = ("auto\n" + hint) if hint else "auto"
    else:
        canvas_size = _as_text(rt.canvas_size).strip() or "unknown"

    pending_parts: list[str] = []
    _append_pending_reinject(
        pending_parts,
        rt.pending_tool_details,
        rules=rt.rules,
        prompt_key="agent.prompt.pending_tools",
    )
    _append_pending_reinject(
        pending_parts,
        rt.pending_knowledge_details,
        rules=rt.rules,
        prompt_key="agent.prompt.pending_knowledge",
    )
    _append_pending_reinject(
        pending_parts,
        rt.pending_skill_details,
        rules=rt.rules,
        prompt_key="agent.prompt.pending_skills",
    )
    _append_pending_reinject(
        pending_parts,
        rt.pending_aesthetics_details,
        rules=rt.rules,
        prompt_key="agent.prompt.pending_aesthetics",
    )
    pending_blocks = ("\n\n".join(pending_parts) + "\n\n") if pending_parts else ""

    plan_block = ""
    if st.plan:
        plan_block = (
            "PLAN:\n"
            + "\n".join(f"{i+1}. {s}" for i, s in enumerate(st.plan))
            + "\n\n"
        )
    memory_block = f"MEMORY:\n{rt.mem_blocks[:4000]}\n\n" if rt.mem_blocks else ""
    recent_dialogue = ""
    if rt.mem_short:
        dial_lines: list[str] = []
        for t in list(rt.mem_short)[-8:]:
            if not isinstance(t, dict):
                continue
            role = "User" if str(t.get("role") or "") == "user" else "Assistant"
            text = _as_text(t.get("text") or t.get("content")).strip()
            if not text:
                continue
            dial_lines.append(f"{role}: {text[:400]}")
        if dial_lines:
            recent_dialogue = (
                "RECENT_DIALOGUE (continue this thread; do not re-greet):\n"
                + "\n".join(dial_lines)
                + "\n\n"
            )
    error_parts: list[str] = []
    if st.errors:
        trail = "\n".join(f"- {e}" for e in st.errors[-5:])
        error_parts.append(f"PRIOR_ERRORS (fix):\n{trail}")
    if st.reflect_note:
        error_parts.append(f"LAST_ERROR (fix):\n{st.reflect_note}")
    error_block = ("\n\n".join(error_parts) + "\n\n") if error_parts else ""

    edit_context = ""
    if rt.scene_nodes or rt.scene_frames:
        edit_context = _edit_context_block(
            rt.rules,
            "",
            include_full_svg=False,
            scene_nodes=rt.scene_nodes,
        )

    return {
        "system": str(rt.system or ""),
        "prompt": str(rt.prompt or ""),
        "canvas_size": canvas_size,
        "scene": str(rt.scene_key or "-"),
        "scene_digest": _scene_digest(
            rt.scene_nodes, rt.scene_frames, focus_id=rt.focus_id
        ),
        "pending_blocks": pending_blocks,
        "plan_block": plan_block,
        "recent_dialogue": recent_dialogue,
        "memory_block": memory_block,
        "error_block": error_block,
        "edit_context": edit_context
    }


def _format_thought_messages(rt: Any) -> tuple[str, str]:
    """Return (system, user) strings via LangChain ChatPromptTemplate."""
    vars_ = _thought_prompt_variables(rt)
    messages = _thought_chat_prompt().format_messages(**vars_)
    system = ""
    user = ""
    for m in messages:
        role = getattr(m, "type", None) or ""
        content = m.content if isinstance(m.content, str) else str(m.content or "")
        if role in ("system",):
            system = content
        elif role in ("human", "user"):
            user = content
    return system or vars_["system"], user


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
    """Persist thin decision + Langfuse pointer. Step traces live in Langfuse, not meta_json."""
    try:
        from config.settings import settings
        from services.llm.agent import langfuse_console_url, langfuse_enabled

        control = "langgraph"
        if state.flow_version:
            control = f"langgraph:v{state.flow_version}"
        exec_log = state.to_execution_log()
        # Success: drop bulky steps (Langfuse holds the timeline).
        # Paint failed: keep a slim trail — local Langfuse often lacks the task_id.
        if state.painted:
            exec_log["steps"] = []
        else:
            exec_log["steps"] = _slim_failure_steps(list(state.log or []))
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


from langgraph.graph import END, START, StateGraph
from langgraph.config import get_stream_writer
from langgraph.types import Command, RetryPolicy, TimeoutPolicy

try:
    from typing_extensions import NotRequired
except ImportError:
    from typing import NotRequired  # type: ignore


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


async def _llm_ux_reply(
    rt: Any,
    *,
    situation: str,
    facts: str = "",
    max_tokens: int = 120,
) -> str:
    """Short assistant copy in the user's language — never hardcode locale strings."""
    prompt = _as_text(getattr(rt, "prompt", "") or "").strip()[:1200]
    system = (
        "You write one short assistant message for a design-canvas product. "
        "Match the language of the user request (English if unclear). "
        "At most two sentences. No markdown lists, no tool_ops, no JSON."
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


def _log_graph_hop(
    st: AgentRunState,
    *,
    frm: str,
    to: str,
    **extra: Any,
) -> None:
    """Track current node only. Timeline lives in Langfuse — do not push_log hops."""
    del to, extra
    frm_phase = str(frm or "").strip() or "?"
    st.current_node_id = frm_phase

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
    persona: str = ""
    defer_tools: bool = True
    max_rounds: int = _DEFAULT_MAX_ROUNDS
    dual_on: bool = False
    pending_tool_details: str = ""
    pending_tool_keys: list[str] = field(default_factory=list)
    pending_knowledge_details: str = ""
    pending_knowledge_kinds: list[str] = field(default_factory=list)
    pending_skill_details: str = ""
    pending_skill_keys: list[str] = field(default_factory=list)
    pending_aesthetics_details: str = ""
    pending_aesthetic_images: list[str] = field(default_factory=list)
    turn: dict[str, Any] = field(default_factory=dict)
    step_ops: list[dict[str, Any]] = field(default_factory=list)
    op_errors: list[str] = field(default_factory=list)
    paint_ops: list[dict[str, Any]] = field(default_factory=list)
    verify_preview_url: str = ""
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
    # Upstream intent gate (intent_classify); empty when node absent/skipped.
    classified_intent: str = ""
    classified_reply: str = ""
    # FE dual-context map (empty_rects / suggested_place / viewport).
    spatial_summary: dict[str, Any] | None = None


class GraphState(TypedDict):
    rt: AgentRuntime
    tick: NotRequired[int]


def _bump(rt: AgentRuntime) -> dict[str, Any]:
    return {"rt": rt, "tick": int(rt.run.round) + len(rt.run.log)}


def _goto_cmd(rt: AgentRuntime, *, frm: str, to: str, **extra: Any) -> Command:
    """Log graph_hop then jump — so mid-run 复盘 shows path even before settle."""
    _log_graph_hop(rt.run, frm=frm, to=to, **extra)
    return Command(update=_bump(rt), goto=to)


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


def _commit(rt: AgentRuntime) -> Command:
    """Compat: update-only (no goto) for tests."""
    return Command(update=_bump(rt))


def _route_cmd(rt: AgentRuntime, node_id: str | None = None) -> Command:
    """Admin flow hops removed — leftover callers settle."""
    del node_id
    _log_graph_hop(rt.run, frm=str(rt.run.current_node_id or "route"), to="__settle__")
    return Command(update=_bump(rt), goto="__settle__")


def invalidate_agent_graph_cache(flow_id: str | None = None) -> None:
    del flow_id
    global _LC_DESIGN_GRAPH
    _LC_DESIGN_GRAPH = None
    # Keep process-local checkpointer so in-flight thread_ids stay readable until cleanup.




def _canvas_is_empty(rt: Any) -> bool:
    nodes = [n for n in (rt.scene_nodes or []) if isinstance(n, dict) and n.get("id")]
    if nodes:
        return False
    frames = [f for f in (rt.scene_frames or []) if isinstance(f, dict) and f.get("id")]
    if not frames:
        return True
    return all(bool(f.get("is_empty")) for f in frames)


def _preload_triggered_skills(rt: Any) -> None:
    """Hard-load skills whose triggers match (empty canvas / images / intent)."""
    if not rt.defer_tools:
        return
    st = rt.run
    intent = str(
        getattr(rt, "classified_intent", None) or st.intent or ""
    ).strip().lower()
    if intent not in ("edit", "create"):
        return
    keys = resolve_triggered_skill_keys(
        scene=rt.scene_key or "website",
        empty_canvas=_canvas_is_empty(rt),
        has_images=bool(rt.images),
        intent=intent,
        prompt_chars=len(str(rt.prompt or "").strip()),
        already_loaded=list(st.skills_loaded or []),
    )
    if not keys:
        return
    try:
        details = format_skills_details(
            keys=keys, scene=rt.scene_key or "website"
        )
    except Exception:
        details = ""
    if not details.strip():
        return
    # Append if something already pending; else set.
    prev = str(getattr(rt, "pending_skill_details", "") or "").strip()
    block = "SKILL_DETAILS:\n" + details
    rt.pending_skill_details = (prev + "\n\n" + block) if prev else block
    for k in keys:
        if k not in st.skills_loaded:
            st.skills_loaded.append(k)
    st.push_log(
        phase="skill_preload",
        need_skills=list(keys),
        summary="triggers 预载 skill：" + "、".join(keys),
    )
    _emit(
        {
            "type": "activity",
            "id": f"skill-preload-{st.task_id[:8]}",
            "kind": "explored",
            "status": "done",
            "stage": "skill_preload",
            "detail": "skills",
        }
    )


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


async def _node_apply_confirm(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops, op_errors = _validate_ops_payload(
        rt.apply_ops, nodes=rt.scene_nodes, frames=rt.scene_frames, rules=rt.rules
    )
    if not step_ops:
        err = validation_failure_reason(op_errors) if op_errors else "missing_tool_ops"
        st.note_error(err)
        msg = await _llm_ux_reply(
            rt,
            situation=(
                "The confirmed plan could not be applied safely; ask the user "
                "to rephrase or try again."
            ),
            facts=f"error={err[:120]}",
        )
        if msg:
            st.reply = msg
            _emit({"type": "token", "text": msg})
        rt.terminal = True
        return Command(update=_bump(rt), goto="__settle__")

    from services.design.image_hydrate import (
        _hydrate_tool_ops_images,
        _image_model_from_rules,
    )

    # Size / shimmer before hydrate so the plate is visible while images generate.
    if _ops_have_create_frame(step_ops):
        _emit_canvas_size_from_ops(rt, step_ops)
    step_ops, n_img = await _hydrate_tool_ops_images(
        step_ops, limit=6, policy="auto", rules=rt.rules
    )
    img_mid = _image_model_from_rules(rt.rules) if n_img else ""
    if n_img and img_mid:
        st.note_images(img_mid, int(n_img))
        st.push_log(**_hydrate_log_kwargs(step_ops, img_mid=img_mid, n_img=n_img))
    paint_ops = list(step_ops)
    if _ops_have_create_frame(step_ops):
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
            "ops": tool_ops_for_sse(paint_ops)
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
    reply = await _llm_ux_reply(
        rt,
        situation=(
            "User confirmed a previously proposed canvas plan; ops were just "
            "applied successfully. Confirm briefly."
        ),
        facts=f"applied_ops={len(step_ops)}",
    )
    if reply:
        st.reply = reply
        _emit({"type": "token", "text": reply})
    st.push_log(
        phase="action",
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_count=len(step_ops),
        ops_detail=_ops_for_log(step_ops),
        apply_confirm=True,
        model=st.family or None,
        reply=(st.reply or "")[:500] or None,
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
    return Command(update=_bump(rt), goto="observe")


async def _node_route(state: GraphState) -> Command:
    """Legacy phase: task-tier / mode init. Prefer folding into memory when graph has no route node."""
    rt = state["rt"]
    _apply_task_route_flags(rt)
    return _route_cmd(rt)


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


async def _node_memory(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    # When graph has no「任务分流」node, do tier/mode init here before Ask/Agent fork.
    if not (rt.phase_to_id.get("route") or "").strip():
        _apply_task_route_flags(rt)
    mem_bundle = await asyncio.to_thread(
        memory_service.load,
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
    return Command(update=_bump(rt), goto="intent_classify")


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
            "skill_key": "plan"
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
            "skill_name": "Plan",
            "category": "agent",
            "model": st.family,
            "model_reason": reason,
            "trace_id": st.trace_id
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
                "summary": '计划：' + " · ".join(st.plan)
            }
        )
    _emit(
        {
            "type": "skill_done",
            "index": -1,
            "skill_key": "plan",
            "skill_name": "Plan",
            "tokens": plan_used
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
    rt.flags["llm_call"] = True
    return _route_cmd(rt)


async def _node_intent_classify(state: GraphState) -> Command:
    """Cheap intent gate: chat → end; edit/create → model_route."""
    rt = state["rt"]
    st = rt.run
    decision = await classify_user_intent(
        prompt=rt.prompt,
        rules=rt.rules,
        has_images=bool(rt.images),
        canvas_node_count=len(rt.scene_nodes or []),
        scene=rt.scene_key,
        interaction_mode=str(rt.flags.get("mode") or rt.mode or ""),
    )
    intent = str(decision.intent or "chat").strip().lower()
    if intent == "ask":
        intent = "create"
    if intent not in ("chat", "edit", "create"):
        intent = "chat"
    reply = (decision.reply or "").strip()
    if intent == "chat" and not reply:
        reply = _chat_fallback_text(rt)
    rt.classified_intent = intent
    rt.classified_reply = reply
    st.intent = intent
    rt.flags["intent"] = intent
    st.push_log(
        phase="intent_classify",
        intent=intent,
        reply=(reply[:500] if intent == "chat" else None),
        summary=f"意图={intent}"
        + (f" · {(decision.rationale or '')[:80]}" if decision.rationale else ""),
        model=None,
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
        nxt = "__settle__"
    else:
        # Short no-vision adds: skip trigger skill dump (decide can still need_skills).
        if not _is_lean_paint_turn(rt):
            await asyncio.to_thread(_preload_triggered_skills, rt)
        # Loading plate + shimmer right after intent (not waiting for paint/action).
        _emit_design_loading_artboard(rt)
        nxt = "design_agent"
    return Command(update=_bump(rt), goto=nxt)


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
            "trace_id": st.trace_id
        }
    )

    turn: dict[str, Any] = {}
    intent = "chat"
    reply = ""
    content = ""
    used = 0
    llm_think = ""
    system_msg = ""
    user_msg = ""
    turn_images: list[str] | None = None
    has_ops_payload = False
    prior_intent = st.intent if st.intent in ("edit", "create", "ask", "chat", "done") else "chat"

    # One forced re-think when resources were injected but model dropped to chat.
    for attempt in range(2):
        system_msg, user_msg = _format_thought_messages(rt)
        turn_images = None
        if rt.pending_aesthetic_images:
            turn_images = list(rt.pending_aesthetic_images)[:4]
            st.vision_used = True
        elif round_i == 0 and rt.images and attempt == 0:
            turn_images = rt.images

        st.family, content, used, llm_ev, llm_think = await _stream_llm_text(
            model_family=st.family,
            system=system_msg,
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
        reply = turn["reply"]
        has_ops_payload = _ops_payload_nonempty(turn.get("tool_ops_raw"))
        prior_intent = (
            st.intent if st.intent in ("edit", "create", "ask", "chat", "done") else "chat"
        )

        if attempt == 0 and _should_recover_edit_after_resources(
            prior_intent=prior_intent,
            intent=intent,
            has_ops=has_ops_payload,
            has_pending_resources=_has_pending_resource_details(rt),
        ):
            tools_hint = "、".join(st.tools_loaded[-6:]) or "已申请工具"
            retry_tmpl = _prompt_text(rt.rules, "agent.prompt.recover_edit_retry")
            try:
                retry_msg = (
                    retry_tmpl.format(
                        tools_hint=tools_hint, prior_intent=prior_intent
                    ).strip()
                    if retry_tmpl
                    else ""
                )
            except Exception:
                retry_msg = ""
            st.note_error(
                retry_msg
                or (
                    f"资源详情已注入（{tools_hint}）。必须立即输出 tool_ops 完成用户请求；"
                    f"保持 intent={prior_intent}，禁止改回 chat/ask。"
                )
            )
            st.intent = prior_intent
            st.push_log(
                phase="recover_edit",
                intent=prior_intent,
                dropped_intent=intent,
                summary=f"资源已注入但落到 {intent}，强制重试写出 tool_ops",
            )
            _emit(
                {
                    "type": "activity",
                    "id": f"recover-edit-{round_i}",
                    "kind": "thought",
                    "status": "done",
                    "summary": "工具已就绪，继续写出操作"
}
            )
            continue
        break

    # Ask: absorb chips only when clarifying / chatting. Clear ops → paint
    # (no propose), so drop confirm chips that would imply「先确认再改」.
    ask_mode = str(rt.flags.get("mode") or "") == "ask"
    if ask_mode or intent in ("ask", "chat"):
        _absorb_ask_choices(st, turn)
    st.intent = intent
    thought = _short_ui_thought(turn["thought"], intent=intent)
    thought_full = _full_thought_for_log(turn["thought"])
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
            system=system_msg, user=user_msg, images=turn_images, max_tokens=2048
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

                # Full model thought for the fold body — not the short SSE label.
                "body": thought_full or thought
            }
        )

    need_tools = list(turn.get("need_tools") or [])
    need_knowledge = list(turn.get("need_knowledge") or [])
    need_skills = list(turn.get("need_skills") or [])
    need_aesthetics = bool(turn.get("need_aesthetics"))
    use_user_refs = turn.get("use_user_refs") is True
    # Fact flags only ? graph edges choose the next hop.
    rt.flags["intent"] = intent
    rt.flags["has_ops"] = has_ops_payload
    rt.flags["no_ops"] = not has_ops_payload
    defer = bool(rt.defer_tools)
    editable = intent in ("edit", "create")
    can_skill = intent in ("ask", "edit", "create")
    rt.flags["need_tools"] = bool(defer and editable and need_tools)
    rt.flags["need_knowledge"] = bool(defer and editable and need_knowledge)
    rt.flags["need_skills"] = bool(defer and can_skill and need_skills)
    rt.flags["need_aesthetics"] = bool(defer and editable and need_aesthetics)
    rt.flags["slot_missing"] = False

    wants_fetch = bool(
        rt.flags["need_tools"]
        or rt.flags["need_knowledge"]
        or rt.flags["need_skills"]
        or rt.flags["need_aesthetics"]
    )
    if wants_fetch and not has_ops_payload:
        return _route_cmd(rt)

    if intent in ("chat", "ask", "done") and not has_ops_payload:
        # Still dropped after tools: keep design intent → slot_missing, never greet.
        if _should_recover_edit_after_resources(
            prior_intent=prior_intent,
            intent=intent,
            has_ops=False,
            has_pending_resources=_has_pending_resource_details(rt),
        ):
            intent = prior_intent
            st.intent = intent
            rt.flags["intent"] = intent
            _clear_ask_choice_state(st)
            if reply:
                st.reply = reply
                _emit({"type": "token", "text": reply})
            rt.flags["slot_missing"] = True
            rt.flags["has_ops"] = False
            rt.flags["no_ops"] = True
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "react",
                    "skill_name": "Design Agent",
                    "tokens": used
                }
            )
            return _route_cmd(rt)

        text = reply or _chat_fallback_text(rt)
        if text:
            st.reply = text
            _emit({"type": "token", "text": text})
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "skill_name": "Design Agent",
                "tokens": used
            }
        )
        if intent == "ask":
            rt.flags["await_user"] = True
        return _route_cmd(rt)

    if intent in ("edit", "create") and not has_ops_payload and not wants_fetch:
        if reply:
            st.reply = reply
            _emit({"type": "token", "text": reply})
        rt.flags["slot_missing"] = True
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": used
            }
        )
        return _route_cmd(rt)

    # Validate ops when payload present ? set edge flags for published graph.
    step_ops, op_errors = _validate_ops_payload(
        turn.get("tool_ops_raw"),
        nodes=rt.scene_nodes,
        frames=rt.scene_frames,
        rules=rt.rules,
        skill_keys=list(st.skills_loaded or []),
        scene=rt.scene_key or "website",
    )
    rt.step_ops = step_ops
    rt.op_errors = op_errors
    if has_ops_payload and not step_ops:
        err = validation_failure_reason(op_errors) if op_errors else "missing_tool_ops"
        st.note_error(err)
        st.push_log(phase="validate_fail", error=err[:200], summary=f'校验失败：{err[:120]}')
        rt.flags["ops_invalid"] = True
        rt.flags["ops_valid"] = False
        rt.flags["reflect_left"] = st.reflect_left > 0 and not turn.get("done")
        rt.flags["no_reflect"] = not rt.flags["reflect_left"]
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": used
            }
        )
        return _route_cmd(rt)

    rt.flags["ops_valid"] = bool(step_ops)
    rt.flags["ops_invalid"] = False
    broad, broad_reason = _ops_patch_too_broad(
        step_ops, rt.scene_nodes, intent=str(intent or st.intent or "")
    )
    rt.flags["patch_too_broad"] = broad
    rt.flags["patch_scoped"] = bool(step_ops) and not broad
    if broad:
        st.note_error(f"patch_too_broad: {broad_reason}")
        st.push_log(
            phase="patch_guard",
            error=broad_reason,
            summary=f"patch too broad: {broad_reason}"[:160],
        )
        rt.flags["ops_invalid"] = True
        rt.flags["ops_valid"] = False
        rt.flags["reflect_left"] = st.reflect_left > 0 and not turn.get("done")
        rt.flags["no_reflect"] = not rt.flags["reflect_left"]
    # Ask + valid ops paint immediately — no confirm chips / proposed_ops.
    if ask_mode and rt.flags.get("ops_valid"):
        _clear_ask_choice_state(st)
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": used
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
    need_skills = list(turn.get("need_skills") or [])
    need_aesthetics = bool(turn.get("need_aesthetics"))
    use_user_refs = turn.get("use_user_refs") is True
    # Hard triggers mid-run (e.g. aesthetics_align when need_aesthetics).
    for k in resolve_triggered_skill_keys(
        scene=rt.scene_key or "website",
        empty_canvas=_canvas_is_empty(rt),
        has_images=bool(rt.images),
        intent=str(st.intent or ""),
        need_aesthetics=need_aesthetics,
        prompt_chars=len(str(rt.prompt or "").strip()),
        already_loaded=list(st.skills_loaded or []) + list(need_skills),
    ):
        if k not in need_skills:
            need_skills.append(k)
    # Custom skills cannot unlock knowledge / aesthetics without ACL.
    acl_skills = list(st.skills_loaded or []) + list(need_skills)
    need_knowledge, need_aesthetics, acl_errs = filter_need_resources_by_skill_acl(
        skill_keys=acl_skills,
        scene=rt.scene_key or "website",
        need_knowledge=need_knowledge,
        need_aesthetics=need_aesthetics,
    )
    if acl_errs:
        st.push_log(phase="skill_acl", errors=acl_errs[:8])
        turn["need_knowledge"] = need_knowledge
        turn["need_aesthetics"] = need_aesthetics
    fresh_k = _fresh_knowledge_kinds(need_knowledge, knowledge_loaded=st.knowledge_loaded)
    load_knowledge = bool(need_knowledge) and not (
        set(need_knowledge) <= set(st.knowledge_loaded) and "*" not in need_knowledge
    )
    if not load_knowledge:
        fresh_k = []
    fresh_s = _fresh_skill_keys(need_skills, skills_loaded=st.skills_loaded)
    load_skills = bool(need_skills) and not (
        set(need_skills) <= set(st.skills_loaded) and "*" not in need_skills
    )
    if not load_skills:
        fresh_s = []
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
                "summary": (", ".join(fresh_k))[:200],

                "index": round_i
            }
        )
    if load_skills:
        st.push_log(
            phase="need_skills",
            need_skills=list(fresh_s),
            intent=st.intent,
            summary="申请 skill：" + "、".join(fresh_s),
        )
        _emit(
            {
                "type": "activity",
                "id": f"need-skills-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": (", ".join(fresh_s))[:200],

                "index": round_i
            }
        )
    if load_aesthetics:
        st.push_log(phase="need_aesthetics", need_aesthetics=True, summary='申请美学样本')
        _emit(
            {
                "type": "activity",
                "id": f"need-aesthetics-{round_i}",
                "kind": "explored",
                "status": "done",
                "summary": "申请美学样本",

                "index": round_i
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
                "summary": (", ".join(need_tools))[:200],

                "index": round_i
            }
        )

    if turn.get("skill_parse_errs"):
        st.push_log(phase="skill_input", errors=list(turn.get("skill_parse_errs") or [])[:8])

    bundles = await _gather_deferred_resource_details(
        fresh_k=fresh_k if load_knowledge else [],
        fresh_skills=fresh_s if load_skills else [],
        fresh_tools=fresh_tools if need_tools else [],
        load_aesthetics=load_aesthetics,
        prompt=rt.prompt,
        scene=rt.scene_key or "website",
        canvas_w=rt.w,
        canvas_h=rt.h,
        user_ref_urls=user_ref_urls,
        use_user_refs=use_user_refs,
        rules=rt.rules,
        skill_version_pins=turn.get("skill_version_pins") or None,
        skill_input_args=turn.get("skill_input_args") or None,
        user_id=str(getattr(rt, "user_id", "") or "") or None,
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
                "summary": (", ".join(fresh_k))[:200],

                "index": round_i
            }
        )
    sb = bundles.get("skills") if load_skills else None
    if isinstance(sb, dict):
        skill_errs = list(sb.get("errors") or [])
        if skill_errs:
            st.push_log(phase="skill_validate", errors=skill_errs[:8])
        if sb.get("details"):
            details_s = str(sb["details"])
            rt.pending_skill_details = "SKILL_DETAILS:\n" + details_s
            for k in fresh_s:
                if k not in st.skills_loaded:
                    st.skills_loaded.append(k)
            st.push_log(
                phase="skill_details",
                need_skills=list(fresh_s),
                detail_chars=len(details_s),
                summary="注入 skill：" + "、".join(fresh_s),
            )
            _emit(
                {
                    "type": "activity",
                    "id": f"skill-details-{round_i}",
                    "kind": "explored",
                    "status": "done",
                    "summary": (", ".join(fresh_s))[:200],

                    "index": round_i
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
                "summary": (", ".join(fresh_tools))[:200],

                "index": round_i
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
                summary='注入美学参考',
            )
            _emit(
                {
                    "type": "activity",
                    "id": f"aesthetics-details-{round_i}",
                    "kind": "explored",
                    "status": "done",
                    "summary": "aesthetics",

                    "index": round_i
                }
            )
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "tokens": rt.last_used
        }
    )
    st.round = round_i + 1
    rt.flags["fetched"] = True
    rt.flags["ready"] = True
    rt.flags["next_round"] = True
    # Details are pending on rt; clear need_* so fork outs match mode=agent/ask
    # (not the same need_tools edge that sent us here).
    rt.flags["need_tools"] = False
    rt.flags["need_knowledge"] = False
    rt.flags["need_skills"] = False
    rt.flags["need_aesthetics"] = False
    return Command(update=_bump(rt))


async def _node_propose(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops = rt.step_ops
    round_i = st.round
    from services.design.tool_ops_contract import tool_ops_batch_detail

    st.proposed_ops = tool_ops_for_sse(step_ops)
    ui = _ensure_propose_choice_ui(st)
    apply_label = st.apply_choice or next(
        (
            str(o.get("label") or "")
            for o in (ui.get("options") or [])
            if str(o.get("action") or "") == "apply"
        ),
        "",
    )
    detail = (tool_ops_batch_detail(step_ops) or "").strip()
    # Confirm copy is LLM-written; do not reuse paint-stage wording (may claim applied).
    text = await _llm_ux_reply(
        rt,
        situation=(
            "Ask mode: canvas ops are prepared but NOT applied yet. "
            "Write a short confirm prompt for the user (what will change + ask to confirm). "
            "Do not claim anything was already added or applied."
        ),
        facts=(detail[:160] if detail else "propose_ops=1"),
    )
    if not text:
        text = _ask_propose_user_text(
            model_reply=(rt.turn.get("reply") or st.reply or "").strip(),
            detail=detail,
        )
    if text:
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
        reply=(st.reply or "")[:2000] or None,
        summary=('提议确认：' + (apply_label or f"{len(step_ops)} ops"))[:120],
        **({"choices": list(st.choices)[:6]} if st.choices else {}),
        **({"apply_choice": st.apply_choice} if st.apply_choice else {}),
        **({"choice_ui": st.choice_ui} if st.choice_ui else {}),
    )
    if text:
        _emit({"type": "token", "text": text})
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": rt.last_used
        }
    )
    rt.terminal = True
    rt.flags["await_confirm"] = True
    return Command(update=_bump(rt), goto="__settle__")


async def _node_action(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    step_ops = rt.step_ops
    round_i = st.round
    from services.design.image_hydrate import (
        _hydrate_tool_ops_images,
        _image_model_from_rules,
    )

    # Safety net: size/shimmer before hydrate (paint_ops usually already did this).
    if _ops_have_create_frame(step_ops):
        _emit_canvas_size_from_ops(rt, step_ops)
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
            "ops": tool_ops_for_sse(paint_ops)
        }
    )
    for act in _tool_ops_activity_events(
        batch=paint_ops,
        totals={"created": 0, "updated": 0, "deleted": 0},
        skill_index=round_i,
    ):
        _emit(act)
    ops_sent = bool(paint_ops)
    # Reply only after real ops were pushed — never claim「已添加」with empty ops.
    _emit_deferred_paint_reply(st, ops_sent=ops_sent)
    if ops_sent:
        st.applied_ops.extend(step_ops)
        # Tentative until observe confirms op_results — cleared if all ops failed.
        st.painted = True
    else:
        st.painted = False
        st.reply = ""
    st.push_log(
        phase="action",
        ops=[str(o.get("name") or "") for o in step_ops[:20]],
        ops_count=len(step_ops),
        ops_detail=_ops_for_log(step_ops),
        tokens=rt.last_used,
        model=st.family,
        **({"image_model": img_mid, "images_hydrated": int(n_img)} if n_img and img_mid else {}),
    )
    if not ops_sent:
        return Command(update=_bump(rt), goto="__settle__")
    # Wait for FE scene_feedback (nodes + per-op ok/fail) before settle / retry.
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
    return Command(update=_bump(rt), goto="observe")


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


async def _node_verify(state: GraphState) -> Command:
    """Structure / optional aesthetics gate. Writes fact flags only."""
    rt = state["rt"]
    st = rt.run
    round_i = st.round
    issues = _structure_verify_issues(
        nodes=list(rt.scene_nodes or []),
        frames=list(rt.scene_frames or []),
        painted=bool(st.painted),
        intent=str(st.intent or ""),
    )
    aes_ok, aes_note, aes_score = _optional_aesthetics_verify(
        preview_url=str(getattr(rt, "verify_preview_url", "") or ""),
        scene=str(rt.scene_key or "website"),
        rules=rt.rules if isinstance(rt.rules, dict) else {},
    )
    if not aes_ok and aes_note:
        issues.append(aes_note)

    notes = "; ".join(issues)
    st.push_log(
        phase="verify",
        ok=not issues,
        score=aes_score or None,
        summary=(
            f"verify ok score={aes_score:.2f}"
            if not issues
            else f"verify fail: {notes}"[:160]
        ),
        verify_notes=notes or None,
    )
    if issues:
        st.note_error(f"verify_fail: {notes}")
        rt.flags["verify_fail"] = True
        rt.flags["verify_ok"] = False
        rt.flags["ok"] = False
        rt.flags["retry"] = False
        rt.flags["scene_ready"] = False
        rt.flags["reflect_left"] = st.reflect_left > 0
        rt.flags["no_reflect"] = not rt.flags["reflect_left"]
        if st.reflect_left > 0:
            st.reflect_left -= 1
        if not st.reply:
            ask = f"This result needs another pass: {notes[:120]}"
            st.reply = ask
            _emit({"type": "token", "text": ask})
        return _route_cmd(rt)

    rt.flags["verify_ok"] = True
    rt.flags["verify_fail"] = False
    rt.flags["scene_ready"] = False
    intent = st.intent
    finish = bool(
        rt.flags.get("task_done")
        or rt.turn.get("done")
        or intent == "done"
        or (st.painted and intent in ("edit", "create"))
        or rt.flags.get("rounds_exhausted")
    )
    if finish:
        rt.terminal = True
        rt.flags["ok"] = True
        rt.flags["retry"] = False
        return _route_cmd(rt)
    st.round = round_i + 1
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
        st.reply = await _llm_ux_reply(
            rt,
            situation="Ask one short clarifying question so you can continue the design.",
        )
        if st.reply:
            _emit({"type": "token", "text": st.reply})
    st.push_log(
        phase="clarify",
        intent=st.intent or "ask",
        reply=(st.reply or "")[:1000] or None,
    )
    rt.terminal = True
    rt.flags["await_user"] = True
    return _route_cmd(rt)


async def _node_settle(state: GraphState) -> Command:
    rt = state["rt"]
    st = rt.run
    spend = await asyncio.to_thread(
        rt.settle_hold_fn,
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
    await asyncio.to_thread(_persist_task_meta, st.task_id, decision=rt.decision, state=st)
    await asyncio.to_thread(
        _update_task,
        st.task_id,
        status="success",
        charged_credits=spend,
        total_tokens=st.total_tokens,
        result_svg="",
    )
    exec_payload = st.to_execution_log()
    balance = await asyncio.to_thread(get_user_tokens, rt.user_id)
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
            **({"choice_ui": st.choice_ui} if st.choice_ui else {}),
            "balance": balance,
            "decision_log": rt.decision.to_log(),
            "execution_log": exec_payload
        }
    )
    try:
        from services.agent_memory.episodes import maybe_write_episode

        failed_attempt = bool(st.errors) and not st.painted
        await asyncio.to_thread(
            maybe_write_episode,
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
                "rounds": st.round + 1
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
        patch = await asyncio.to_thread(
            _finalize_memory_patch,
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
            await_user=bool(rt.flags.get("await_user") or has_proposal),
        )
        _emit({"type": "memory_patch", **patch})
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
        await asyncio.to_thread(
            rt.refund_hold_fn, rt.user_id, rt.hold, task_id=st.task_id
        )
    except Exception:
        pass
    st.note_error(str(err)[:240])
    st.push_log(phase="error", error=str(err)[:240])
    rt.decision.apply(route="error", intent=st.intent)
    await asyncio.to_thread(_persist_task_meta, st.task_id, decision=rt.decision, state=st)
    await asyncio.to_thread(
        _update_task, st.task_id, status="error", error_message=str(err)[:800]
    )
    _emit({"type": "execution_log", **st.to_execution_log()})
    _emit(
        {
            "type": "error",
            "message": _user_facing_run_error(err, rules=rt.rules),
            "task_id": st.task_id,
            "trace_id": st.trace_id,
            "refunded_credits": rt.hold
        }
    )
    return Command(update=_bump(rt), goto=END)


async def _node_passthrough(state: GraphState) -> Command:
    rt = state["rt"]
    return _route_cmd(rt)


async def _node_resource_fork(state: GraphState) -> Command:
    """Fetch deferred resources, then return to thought/ask via graph edges."""
    rt = state["rt"]
    cmd = await _node_resource(state)
    # Legacy graphs may still expose resource_join; prefer routing from there.
    join_id = rt.phase_to_id.get("resource_join")
    if join_id and join_id in rt.node_by_id:
        rt.flags["next_round"] = True
        rt.flags["ready"] = True
        return _route_cmd(rt, join_id)

    # Guard: after a successful fetch never settle — return to the next LLM turn.
    goto = getattr(cmd, "goto", None)
    settle_like = goto is None or str(goto) in ("", END, "__settle__")
    if settle_like:
        mode = str(rt.flags.get("mode") or "agent").strip().lower()
        if mode == "ask":
            nid = rt.phase_to_id.get("ask_thought") or "ask_thought"
        else:
            nid = rt.phase_to_id.get("thought") or "thought"
        if nid in rt.node_by_id:
            return Command(update=_bump(rt), goto=nid)
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
        err_frag = f"?{err[:80]}?" if err else ""
        if rt.unsafe_ops_tmpl:
            ask = render_prompt_template(rt.unsafe_ops_tmpl, error=err_frag)
        else:
            ask = await _llm_ux_reply(
                rt,
                situation=(
                    "The proposed canvas ops could not be applied safely; "
                    "ask the user to rephrase."
                ),
                facts=f"error={err_frag}",
            )
        if ask:
            rt.run.reply = ask
            rt.run.intent = "ask"
            _emit({"type": "token", "text": ask})
    return _route_cmd(rt)


async def _node_dual_sample(state: GraphState) -> Command:
    rt = state["rt"]
    rt.flags["pick_best"] = True
    return _route_cmd(rt)


async def _node_ask_thought(state: GraphState) -> Command:
    """Ask branch LLM ? same contract as thought; edges decide clarify/propose/agent."""
    return await _node_thought(state)


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
            lc_system = (
                _prompt_text(rt.rules, "agent.prompt.need_tools_overlay")
                or _prompt_text(rt.rules, "agent.prompt.system")
                or _prompt_text(rt.rules, "agent.prompt.lc_tools_overlay")
                or _prompt_text(rt.rules, "agent.prompt.chat_agent_system")
                or ""
            )
        if ask_mode:
            ask_pack = _prompt_text(rt.rules, "agent.prompt.ask_system")
            if ask_pack and ask_pack not in lc_system:
                lc_system = f"{lc_system}\n\n{ask_pack}" if lc_system else ask_pack
        if rt.persona and "IDENTITY:" not in lc_system:
            lc_system = f"IDENTITY: {rt.persona}\n\n{lc_system}"
        # Graph contract only — Ask/Agent behavior lives in prompt packs (Admin).
        lc_system = (
            lc_system
            + "\n\nDECISION_STAGE: Do NOT output tool_ops (always []). "
            "Canvas ops are produced in a later paint stage."
        )
        turn_images = list(rt.images or [])[:4] if rt.images else None
        if turn_images:
            st.vision_used = True
            rt.last_images = turn_images

        content = ""
        used_hint = 0
        llm_think = ""
        turn: dict[str, Any] = {}
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
                from services.llm import build_user_message_content
                from services.llm.agent import ainvoke_structured

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
            st.push_log(phase="design_agent", error=str(err)[:200], summary="决策回合失败")
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
            llm_raw=_clip_llm_raw(content, limit=4000),
            **_thinking_field(llm_think),
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
                turn_intent=str(rt.classified_intent or intent or "create"),
                has_clarify=False,
                ask_mode=False,
            ):
                want = str(rt.classified_intent or intent or "create").strip().lower()
                if want not in ("edit", "create"):
                    want = "create"
                st.intent = want
                # Stash only — stream after paint actually sends tool_ops.
                if reply and len(reply) <= 80:
                    st.reply = reply
                return Command(update=_bump(rt), goto="paint_ops")
            st.round = round_i + 1
            continue

        # Ask: intent=ask → wait on user (chips and/or open reply).
        # Missing-slot clarify is model-owned (ask_system pack), not keyword heuristics.
        if ask_mode and intent == "ask" and reply:
            st.reply = reply
            _emit({"type": "token", "text": reply})
            _absorb_ask_choices(st, turn)
            rt.flags["await_user"] = True
            rt.terminal = True
            return Command(update=_bump(rt), goto="__settle__")

        if intent == "ask" and reply and has_clarify:
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
            want = str(rt.classified_intent or intent or "create").strip().lower()
            if want not in ("edit", "create"):
                want = "create" if intent == "create" else "edit"
            st.intent = want
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
        want = str(rt.classified_intent or st.intent or "create").strip().lower()
        if want not in ("edit", "create"):
            want = "create"
        st.intent = want
        return Command(update=_bump(rt), goto="paint_ops")

    rt.terminal = True
    if not st.reply:
        st.reply = _chat_fallback_text(rt)
        _emit({"type": "token", "text": st.reply})
    return Command(update=_bump(rt), goto="__settle__")


async def _node_paint_ops(state: GraphState) -> Command:
    """Dedicated paint stage: structured tool_ops only → action."""
    rt = state["rt"]
    st = rt.run
    want = str(rt.classified_intent or st.intent or "create").strip().lower()
    if want not in ("edit", "create"):
        want = "create"
    st.intent = want

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
    _ensure_paint_tool_details(rt)
    # Safety: if intent had no WxH yet / skipped, open loading plate before LLM paint.
    _emit_design_loading_artboard(rt)

    turn_images = list(rt.images or [])[:4] if rt.images else None
    if turn_images:
        st.vision_used = True
        rt.last_images = turn_images

    max_attempts = 3
    from services.llm import build_user_message_content
    from services.llm.agent import ainvoke_structured

    for attempt in range(max_attempts):
        round_i = st.round
        _emit(
            {
                "type": "skill_start",
                "index": round_i,
                "skill_id": None,
                "skill_key": "paint_ops",
                "skill_name": "Paint",
                "category": "agent",
                "model": st.family,
                "model_reason": rt.last_reason,
                "trace_id": st.trace_id
            }
        )
        _emit(
            {
                "type": "activity",
                "id": f"paint-ops-{round_i}-{attempt}",
                "kind": "thought",
                "status": "running",

                "index": round_i
            }
        )
        system = _paint_ops_system(rt)
        user_msg = _paint_ops_user(rt)
        if attempt > 0:
            user_msg += (
                "\n\nCRITICAL RETRY: previous tool_ops were empty or invalid. "
                "Read LAST_ERROR lines (code=…; fix=…) and re-emit tool_ops accordingly. "
                "If code=placement_outside_viewport, use suggested_place_world x/y "
                "(omit frameId for free-canvas). Output a non-empty tool_ops array now."
            )
        try:
            from config.settings import settings as _paint_settings

            user_content = build_user_message_content(user_msg, turn_images)
            attempt_sec = float(
                getattr(_paint_settings, "design_paint_attempt_timeout_sec", 75.0)
                or 75.0
            )
            # Bound each LLM call — hanging providers used to burn the full 180s
            # node timeout before the next empty-ops retry could start.
            async def _paint_structured() -> dict[str, Any]:
                return await ainvoke_structured(
                    schema=PaintOpsSchema,
                    messages=[{"role": "user", "content": user_content}],
                    model=st.family,
                    system=system,
                    source="design",
                    run_name=f"paint_ops:{st.task_id[:8]}",
                    metadata={
                        "task_id": st.task_id,
                        "trace_id": st.trace_id,
                        "user_id": rt.user_id,
                        "scene": rt.scene_key or "",
                        "intent": want,
                        "round": round_i,
                        "attempt": attempt,
                        "has_images": bool(turn_images),
                        "stage": "paint_ops"
                    },
                    tags=["design", "lc_design", "paint_ops"],
                )

            if attempt_sec > 0:
                structured_out = await asyncio.wait_for(
                    _paint_structured(), timeout=attempt_sec
                )
            else:
                structured_out = await _paint_structured()
            structured = structured_out.get("structured")
            if hasattr(structured, "model_dump"):
                raw_obj = structured.model_dump()
            elif isinstance(structured, dict):
                raw_obj = structured
            else:
                raw_obj = {}
            ops_raw = raw_obj.get("tool_ops")
            if ops_raw is None:
                ops_raw = raw_obj.get("ops")
            reply = _as_text(raw_obj.get("reply")).strip()
            intent = str(raw_obj.get("intent") or want).strip().lower()
            if intent not in ("edit", "create"):
                intent = want
            content = json.dumps(raw_obj, ensure_ascii=False)[:8000]
            used_hint = max(1, len(content) // 3)
            st.total_tokens += used_hint
        except Exception as err:  # noqa: BLE001
            st.note_error(f"paint_ops_llm_failed: {err}"[:240])
            st.push_log(
                phase="paint_ops",
                error=str(err)[:200],
                summary="落层回合失败",
                attempt=attempt,
            )
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "paint_ops",
                    "skill_name": "Paint",
                    "tokens": 0
                }
            )
            st.round = round_i + 1
            continue

        st.intent = intent
        step_ops: list[dict[str, Any]] = []
        op_errors: list[str] = []
        if ops_raw:
            step_ops, op_errors = _validate_ops_payload(
                ops_raw,
                nodes=rt.scene_nodes,
                frames=rt.scene_frames,
                rules=rt.rules,
                skill_keys=list(st.skills_loaded or []),
                scene=rt.scene_key or "website",
            )
        if step_ops:
            place_errs = _placement_errors_for_free_creates(rt, step_ops)
            if place_errs:
                # Do not silently rewrite coords — reject and teach via LAST_ERROR / paint retry.
                op_errors = list(op_errors or []) + place_errs
                step_ops = []
        rt.step_ops = step_ops
        rt.op_errors = list(op_errors or [])
        st.push_log(
            phase="paint_ops",
            intent=intent,
            summary=f"落层 attempt={attempt + 1} ops={len(step_ops)}",
            model=st.family,
            reply=(reply[:200] if reply else None),
            tokens=used_hint,
            llm_raw=_clip_llm_raw(content, limit=4000),
            ops_count=len(step_ops),
            attempt=attempt,
            **({"errors": _op_errors_for_log(op_errors)} if op_errors else {}),
        )
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "paint_ops",
                "skill_name": "Paint",
                "tokens": used_hint
            }
        )

        if step_ops:
            ask_mode = str(rt.flags.get("mode") or "") == "ask"
            # Open plate only when create_frame is present (infinite canvas otherwise).
            _emit_canvas_size_from_ops(rt, step_ops)
            st.reply = _paint_user_reply(reply)
            rt.turn = {
                "intent": intent,
                "reply": st.reply,
                "tool_ops_raw": ops_raw
            }
            # Ask: propose for confirm — do not apply yet (confirm copy rewritten in propose).
            if ask_mode:
                st.reply = ""
                return Command(update=_bump(rt), goto="propose")
            return Command(update=_bump(rt), goto="action")

        err = validation_failure_reason(op_errors) if op_errors else "missing_tool_ops"
        st.note_error(f"paint_ops: {err}")
        st.round = round_i + 1

    st.note_error("paint_ops: retries_exhausted")
    fail = await _llm_ux_reply(
        rt,
        situation=(
            "Paint stage could not produce valid canvas tool_ops after retries; "
            "ask the user to specify a concrete edit."
        ),
        facts="error=missing_or_invalid_tool_ops",
    )
    if fail:
        st.reply = fail
        _emit({"type": "token", "text": fail})
    rt.flags["await_user"] = True
    rt.terminal = True
    return Command(update=_bump(rt), goto="__settle__")

_LC_DESIGN_GRAPH: Any = None
_LC_DESIGN_CHECKPOINTER: Any = None


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
    """Process-local saver for outer design graph.

    AgentRuntime carries settle/refund callables — msgpack cannot encode it.
    pickle_fallback is OK only in-process; do not persist to MySQL/Sqlite
    (RCE risk + callables are not durable across workers).
    """
    global _LC_DESIGN_CHECKPOINTER
    if _LC_DESIGN_CHECKPOINTER is not None:
        return _LC_DESIGN_CHECKPOINTER
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

    _LC_DESIGN_CHECKPOINTER = InMemorySaver(
        serde=JsonPlusSerializer(pickle_fallback=True)
    )
    return _LC_DESIGN_CHECKPOINTER


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
    """LangGraph Design Agent — fixed outer graph + create_agent."""
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
    skills_catalog, aesthetics_catalog = await asyncio.gather(
        asyncio.to_thread(format_skills_catalog, scene=scene_key or "website"),
        asyncio.to_thread(format_aesthetics_catalog, scene=scene_key or "website"),
    )
    defer_tools = _flag_on(rules, "agent.react.defer_tools", "1")
    persona = _resolve_agent_persona(rules, user_selected_model)
    persona_block = f"IDENTITY: {persona}" if persona else ""
    plan_system = _prompt_text(rules, "agent.prompt.plan_system")
    size_auto_hint = _prompt_text(rules, "agent.prompt.size_auto")
    chat_fallback_tmpl = _prompt_text(rules, "agent.prompt.chat_fallback")
    unsafe_ops_tmpl = _prompt_text(rules, "agent.prompt.unsafe_ops_ask")
    need_overlay = _prompt_text(rules, "agent.prompt.need_tools_overlay")
    lc_overlay = _prompt_text(rules, "agent.prompt.lc_tools_overlay")
    chat_agent_system = _prompt_text(rules, "agent.prompt.chat_agent_system")
    react_system = _prompt_text(rules, "agent.prompt.react_system")
    ask_system = _prompt_text(rules, "agent.prompt.ask_system") if ui_mode == "ask" else ""
    # Same pack priority as design_agent; catalogs must stay on rt.system for the LLM.
    system = "\n\n".join(
        p
        for p in [
            need_overlay or lc_overlay or chat_agent_system or react_system,
            ask_system,
            persona_block,
            tools_catalog if defer_tools else tools_block,
            skills_catalog,
            aesthetics_catalog,
        ]
        if p
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
        persona=persona,
        defer_tools=defer_tools,
        max_rounds=max_rounds,
        dual_on=_flag_on(rules, "agent.react.dual_sample", "0"),
        spatial_summary=spatial_summary if isinstance(spatial_summary, dict) else None,
    )
    rt.flags["mode"] = ui_mode

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
