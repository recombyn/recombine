"""Agent graph state types and structured-output schemas."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.design.prompts.rules_text import _as_text
from app.services.design.runtime.decision_log import DesignRunDecision

_log = logging.getLogger(__name__)
logger = _log
_DEFAULT_MAX_ROUNDS = 4
# Allow one craft fix + one long-canvas continue without Admin rule overrides.
_DEFAULT_MAX_REFLECT = 2
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
        "parameters",
        "arguments",
        "properties",
        "props",
        "updates",
        "params",
        "op_id",
        "opId",
    }
)
_PAINT_OP_NEST_ARG_KEYS = (
    "args",
    "parameters",
    "arguments",
    "properties",
    "props",
    "updates",
    "params",
)
_PAINT_OP_NAME_ALIASES = ("name", "tool", "op", "op_key", "opKey")
_PAINT_CREATE_SHAPE_NAMES = frozenset(
    {
        "create_shape",
        "create_text",
        "create_image",
        "create_frame",
        "update_node",
        "delete_nodes",
        "delete_frame",
        "create_svg",
        "create_icon",
    }
)


def _paint_op_name(d: dict[str, Any]) -> str:
    for key in _PAINT_OP_NAME_ALIASES:
        raw = d.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    type_as_name = str(d.get("type") or "").strip()
    if type_as_name in _PAINT_CREATE_SHAPE_NAMES:
        return type_as_name
    return ""


def _merge_nested_op_args(d: dict[str, Any]) -> dict[str, Any]:
    args: dict[str, Any] = {}
    for nest_key in _PAINT_OP_NEST_ARG_KEYS:
        nested = d.get(nest_key)
        if not isinstance(nested, dict):
            continue
        for nk, nv in nested.items():
            args.setdefault(nk, nv)
    if not args:
        return {k: v for k, v in d.items() if k not in _PAINT_OP_META_KEYS}
    for k, v in d.items():
        if k not in _PAINT_OP_META_KEYS:
            args.setdefault(k, v)
    return args


def _coalesce_paint_tool_op(data: Any) -> Any:
    """Normalize one tool_op envelope to ``{name, args}`` (accepts parameters)."""
    if not isinstance(data, dict):
        return data
    d = dict(data)
    name = _paint_op_name(d)
    args = _merge_nested_op_args(d)
    if (
        name == "create_shape"
        and args.get("shapeType") is None
        and d.get("type") is not None
        and str(d.get("type")) not in {"create_shape"}
    ):
        args.setdefault("shapeType", d.get("type"))
    return {"name": name, "args": args}


class PaintToolOp(BaseModel):
    """LangChain envelope for one canvas op — normalized to ``{name, args}``."""

    name: str = Field(..., min_length=1)
    args: dict[str, Any] = Field(
        default_factory=dict,
        description="Canvas op arguments. Prefer key 'args'; 'parameters' also accepted.",
    )

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def _coalesce_flat_op(cls, data: Any) -> Any:
        return _coalesce_paint_tool_op(data)


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


# Fallback paint kits (structural — not content-category lists).
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
_LEAN_PAINT_PROMPT_CHARS = 96


def _agent_turn_parser():
    from langchain_core.output_parsers import PydanticOutputParser

    return PydanticOutputParser(pydantic_object=AgentTurnSchema)


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
    # Stable id for server-bound Ask confirm (chat + design_task.meta).
    proposal_id: str = ""
    # Ask mode: label of the apply option (compat + typed confirm).
    apply_choice: str = ""
    # Ask interaction UI from model: {mode, options:[{label, action}]}.
    choice_ui: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
    applied_ops: list[dict[str, Any]] = field(default_factory=list)
    # op_ids already pushed to FE via tool_ops SSE — skip on LangGraph resume.
    emitted_op_ids: list[str] = field(default_factory=list)
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
    # perf_counter start of this run (Admin duration / step t_ms).
    t0: float = 0.0
    _last_log_t: float = 0.0
    log: list[dict[str, Any]] = field(default_factory=list)

    def push_log(self, **row: Any) -> None:
        now = time.perf_counter()
        entry = {"round": self.round, **{k: v for k, v in row.items() if v is not None}}
        if self.current_node_id and "node_id" not in entry:
            entry["node_id"] = self.current_node_id
        if self.t0 > 0:
            entry.setdefault("t_ms", max(0, int((now - self.t0) * 1000)))
            if self._last_log_t > 0:
                entry.setdefault(
                    "duration_ms", max(0, int((now - self._last_log_t) * 1000))
                )
            self._last_log_t = now
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
            "total_duration_ms": (
                max(0, int((time.perf_counter() - self.t0) * 1000))
                if self.t0 > 0
                else None
            ),
            "path": [
                str(s.get("phase") or "").strip()
                for s in self.log
                if isinstance(s, dict) and str(s.get("phase") or "").strip()
            ],
            "steps": list(self.log),
        }


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
    # Must stay None in graph state — durable checkpointer cannot pickle callables.
    # Real fns live in ``_DESIGN_HOLD_FNS`` (see ``_bind_design_hold_fns``).
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
    size_auto_hint: str = ""
    chat_fallback_tmpl: str = ""
    persona: str = ""
    defer_tools: bool = True
    max_rounds: int = _DEFAULT_MAX_ROUNDS
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
    flow_id: str = "lc_design"
    flow_version: int = 0
    current_node_id: str = ""
    # Upstream intent gate (intent_classify); empty when node absent/skipped.
    classified_intent: str = ""
    classified_paint_lane: str = ""
    classified_reply: str = ""
    # FE dual-context map (empty_rects / suggested_place / viewport).
    spatial_summary: dict[str, Any] | None = None


class GraphState(TypedDict):
    rt: AgentRuntime
    tick: NotRequired[int]

