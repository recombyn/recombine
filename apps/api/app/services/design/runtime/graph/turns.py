from __future__ import annotations

"""Turn parsing, Ask choice UI, and decide-to-paint routing helpers."""

import logging
from typing import Any
from app.services.design.aesthetics.scorer import (
    normalize_need_aesthetics,
    parse_use_user_refs,
)
from app.services.design.ops.tool_ops_contract import normalize_need_tools
from app.services.design.ops.validate import extract_json_object
from app.services.design.prompts.knowledge_store import normalize_need_knowledge
from app.services.design.prompts.prompt_build import _edit_context_block
from app.services.design.prompts.rules_text import _as_text
from app.services.design.runtime.host import (
    interaction_mode_rules_pack,
    require_prompt_pack,
)
from app.services.design.runtime.models_route import (
    CANVAS_WORK_INTENTS,
    normalize_user_intent,
    paint_ops_intent,
)
from app.services.design.runtime.graph.state import (
    AgentRunState,
    _agent_turn_parser,
    _thought_chat_prompt,
)

_log = logging.getLogger(__name__)


_ASK_CHOICE_MODES = frozenset({"confirm", "single", "multi", "buttons", "text"})
_ASK_CHOICE_ACTIONS = frozenset({"apply", "reply", "dismiss"})


def _is_canvas_work_intent(raw: str | None) -> bool:
    s = str(raw or "").strip().lower()
    if s in CANVAS_WORK_INTENTS:
        return True
    # Legacy create|edit still mean "continue to paint".
    if s in ("create", "edit"):
        return True
    return normalize_user_intent(s) in CANVAS_WORK_INTENTS

def _resolve_paint_want(rt: Any, turn_intent: str | None = None) -> str:
    """create|edit for paint validation / tool kit."""
    t = str(turn_intent or "").strip().lower()
    if t in ("edit", "create"):
        return t
    lane = str(getattr(rt, "classified_paint_lane", None) or "").strip().lower()
    if lane in ("edit", "create"):
        return lane
    return paint_ops_intent(
        getattr(rt, "classified_intent", None) or getattr(rt.run, "intent", None) or t,
        lane,
    )

def _append_prompt_pack(system: str, pack: str) -> str:
    base = str(system or "").strip()
    extra = str(pack or "").strip()
    if not extra:
        return base
    if extra in base:
        return base
    return f"{base}\n\n{extra}" if base else extra

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
    # Clarify waits only in Ask mode. Agent mode continues with defaults (mode pack).
    _ = has_clarify
    if t == "ask" and ask_mode:
        return False
    if _is_canvas_work_intent(classified):
        return True
    return _is_canvas_work_intent(t)

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

def _clear_ask_choice_state(st: AgentRunState) -> None:
    st.choices = []
    st.choice_ui = None
    st.apply_choice = ""

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
    from app.services.design.prompts.skill_store import parse_need_skills_with_pins

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
    from app.services.design.runtime.graph.llm_io import _prompt_text
    text = str(details or "").strip()
    if not text:
        return
    parts.append(text)
    reinject = _prompt_text(rules, prompt_key).strip()
    if reinject:
        parts.append(reinject)

def _thought_prompt_variables(rt: Any) -> dict[str, str]:
    """Variables for LangChain ChatPromptTemplate (thought turn)."""
    from app.services.design.runtime.graph.llm_io import _prompt_text
    from app.services.design.runtime.graph.scene_log import _scene_digest
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

__all__ = [
    '_ASK_CHOICE_MODES',
    '_ASK_CHOICE_ACTIONS',
    '_is_canvas_work_intent',
    '_resolve_paint_want',
    '_append_prompt_pack',
    '_lc_design_needs_canvas_ops',
    '_should_route_to_paint',
    '_turn_has_clarify',
    '_clear_ask_choice_state',
    '_normalize_choice_option',
    '_normalize_choice_ui',
    '_choice_ui_sync_compat',
    '_absorb_ask_choices',
    '_ensure_propose_choice_ui',
    '_ask_propose_user_text',
    '_normalize_agent_turn_obj',
    '_parse_agent_turn',
    '_turn_from_structured',
    '_append_pending_reinject',
    '_thought_prompt_variables',
    '_format_thought_messages',
]
