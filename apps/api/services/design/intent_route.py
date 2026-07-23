"""Intent classifier — LLM JSON only; backend parses and executes, does not invent intent.

Public API: classify_route_intent(…) → (intent, task_kind).
Context flags (has_canvas / has_target_chip / …) are params for the model, not code routing.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any

from services.design.decision_log import focus_frame_from_medium
from services.design.llm_step import complete_skill_step
from services.design.validate import extract_json

_log = logging.getLogger(__name__)

ROUTE_INTENTS = frozenset({"chat", "blank", "edit", "create", "sibling"})
TASK_KINDS = frozenset({"direct", "design"})


def _as_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def _rule_text(rules: dict[str, Any] | None, key: str, default: str = "") -> str:
    rules = rules or {}
    if key not in rules or rules.get(key) is None:
        return default
    return _as_text(rules.get(key), default)


def prompt_probe(prompt: str) -> str:
    """User-looking line when client wraps chips / context above the request."""
    text = (prompt or "").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return text
    for i, ln in enumerate(lines):
        low = ln.lower()
        if low.startswith("user request:"):
            rest = ln.split(":", 1)[-1].strip()
            if rest:
                return rest
            collected: list[str] = []
            for nxt in lines[i + 1 :]:
                if nxt.startswith("[") or nxt.lower().startswith("name:"):
                    break
                collected.append(nxt)
            if collected:
                return "\n".join(collected).strip()
            return ln
    for ln in reversed(lines):
        if not ln.startswith("[") and not ln.lower().startswith("name:"):
            return ln
    return lines[-1]


def parse_route_intent(content: str) -> str | None:
    data = extract_json(content)
    if not isinstance(data, dict):
        raw = (content or "").strip().lower().strip("`\"'")
        if raw in ROUTE_INTENTS:
            return raw
        return None
    raw_intent = str(data.get("intent") or data.get("route") or "").strip().lower()
    return raw_intent if raw_intent in ROUTE_INTENTS else None


def parse_task_kind(content: str) -> str | None:
    """Normalize model synonyms → direct|design. Not prompt keyword routing."""
    data = extract_json(content)
    if not isinstance(data, dict):
        return None
    raw = str(
        data.get("task_kind")
        or data.get("taskKind")
        or data.get("edit_scope")
        or data.get("editScope")
        or data.get("scope")
        or ""
    ).strip().lower()
    if raw in ("direct", "modify", "patch", "simple", "compose", "ops"):
        return "direct"
    if raw in ("design", "redesign"):
        return "design"
    return raw if raw in TASK_KINDS else None


def coerce_task_kind(
    kind: str | None,
    *,
    intent: str,
    has_target_chip: bool = False,
) -> str:
    """task_kind only applies to edit.

    Missing kind: prefer direct when the user @-mentioned a target (execute-first);
    otherwise design (full agent). Explicit model values still win.
    """
    if intent != "edit":
        return ""
    if kind in TASK_KINDS:
        return kind
    return "direct" if has_target_chip else "design"


def fallback_route_intent(**_unused: Any) -> str:
    """Classifier unavailable — chat only (do not invent create/edit).

    Structural kwargs are ignored; kept so call sites / tests can pass context flags.
    """
    return "chat"


def coerce_route_intent(intent: str, **_unused: Any) -> str:
    """Accept classifier intent as-is. Unknown → chat.

    Structural kwargs are ignored; kept so call sites / tests can pass context flags.
    """
    if intent in ROUTE_INTENTS:
        return intent
    return "chat"


def task_state_classifier_lines(medium: dict[str, Any] | None) -> list[str]:
    """Compact task-state facts for the classifier (referents, not routing)."""
    if not isinstance(medium, dict):
        return [
            "has_focus_frame: false",
            "focus_frame_id: (none)",
            "last_agent_frame_id: (none)",
            "last_run_intent: (none)",
            "last_run_blank: false",
        ]
    canvas = medium.get("canvas") if isinstance(medium.get("canvas"), dict) else {}
    last_run = medium.get("last_run") if isinstance(medium.get("last_run"), dict) else {}
    focus = str(canvas.get("focus_frame_id") or "").strip()
    last_agent = str(canvas.get("last_agent_frame_id") or "").strip()
    last_intent = str(last_run.get("intent") or "").strip() or "(none)"
    last_blank = bool(last_run.get("blank_artboard"))
    return [
        f"has_focus_frame: {str(bool(focus or last_agent)).lower()}",
        f"focus_frame_id: {focus or '(none)'}",
        f"last_agent_frame_id: {last_agent or '(none)'}",
        f"last_run_intent: {last_intent}",
        f"last_run_blank: {str(last_blank).lower()}",
    ]


async def classify_route_intent(
    *,
    prompt: str,
    rules: dict[str, str] | None,
    has_canvas: bool = False,
    has_target_chip: bool = False,
    has_ref_images: bool = False,
    has_focus_frame: bool = False,
    medium: dict[str, Any] | None = None,
    short_turns: list[dict[str, Any]] | None = None,
    user_selected_model: str | None = None,
) -> tuple[str, str]:
    """
    Call the intent LLM → (intent, task_kind).

    intent: chat|blank|edit|create|sibling
    task_kind: direct|design when intent=edit, else "".
    Backend does not rewrite the model’s intent; only parses JSON.
    """
    rules = rules or {}
    focus = has_focus_frame or bool(focus_frame_from_medium(medium))

    def _pack(intent_raw: str, kind_raw: str | None = None) -> tuple[str, str]:
        intent = coerce_route_intent(intent_raw)
        return intent, coerce_task_kind(kind_raw, intent=intent)

    enabled = _rule_text(rules, "intent.classifier.enabled", "1").strip().lower()
    if enabled not in ("1", "true", "yes", "on"):
        out = _pack(fallback_route_intent())
        _log.info(
            "[intent.classifier] disabled → fallback intent=%s task_kind=%s "
            "has_target=%s has_canvas=%s has_focus=%s",
            out[0],
            out[1] or "-",
            has_target_chip,
            has_canvas,
            focus,
        )
        return out

    probe = prompt_probe(prompt)
    system = _rule_text(rules, "intent.classifier.system") or (
        "You are a design-agent intent router. Reply with JSON only."
    )
    system = (
        f"{system}\n"
        "Reply with JSON only: "
        '{"intent":"chat|blank|edit|create|sibling","task_kind":"direct|design"}.\n'
        "INTENT (pick exactly one):\n"
        "- chat: greetings, thanks, meta/history questions, capability Q&A — "
        "no canvas change. Prefer chat when there is no design ask.\n"
        "- blank: user explicitly wants an empty / new blank artboard only.\n"
        "- edit: change the current canvas (especially when has_target_chip=true).\n"
        "- create: design something new from scratch.\n"
        "- sibling: another page/artboard like the current one.\n"
        "Never map greetings or remember/history questions to blank or create.\n"
        "TASK_KIND (required only when intent=edit): direct = canvas tool_ops alone; "
        "design = creative redesign / illustration. Ambiguous → design."
    )
    kind_hint = (
        _rule_text(rules, "intent.classifier.task_kind_hint")
        or _rule_text(rules, "intent.classifier.edit_scope_hint")
    )
    if kind_hint:
        system = f"{system}\n{kind_hint}"
    recent_lines: list[str] = []
    for turn in (short_turns or [])[-4:]:
        if not isinstance(turn, dict):
            continue
        role = str(turn.get("role") or "").strip().lower()
        text = str(turn.get("text") or turn.get("content") or "").strip()
        if role in ("user", "assistant") and text:
            recent_lines.append(f"{role}: {text[:240]}")
    recent_block = "\n".join(recent_lines) if recent_lines else "(none)"
    task_lines = "\n".join(task_state_classifier_lines(medium))
    user_msg = (
        "CONTEXT:\n"
        f"has_canvas: {str(bool(has_canvas)).lower()}\n"
        f"has_target_chip: {str(bool(has_target_chip)).lower()}\n"
        f"has_ref_images: {str(bool(has_ref_images)).lower()}\n"
        f"{task_lines}\n"
        "NOTE: has_focus_frame / last_agent_frame_id mean an addressable artboard exists "
        "(may be empty). has_target_chip=true means the user @-mentioned a canvas object.\n"
        "If no design ask → intent=chat. blank only when user asks for an empty artboard.\n"
        "If intent=edit, set task_kind: canvas tools enough → direct; creative design → design.\n"
        f"RECENT:\n{recent_block}\n\n"
        f"USER:\n{(probe or prompt or '')[:2000]}"
    )
    try:
        max_tokens = int(_rule_text(rules, "intent.classifier.max_tokens", "96").strip())
    except ValueError:
        max_tokens = 96
    # Locked composer model → same model for this gate (design agent, not image mode).
    # Image generators are not a design chat/completions router — keep Admin classifier model.
    primary = _rule_text(rules, "intent.classifier.model") or "doubao"
    sel = _as_text(user_selected_model).strip().lower()
    locked_user_model = bool(sel and sel not in ("auto", ""))
    is_image_gen = bool(
        locked_user_model
        and re.search(
            r"seedream|t2i|i2i|dreamina|flux|ideogram|kling|sora|minimax|image",
            sel,
        )
    )
    if locked_user_model and not is_image_gen:
        primary = sel
    # Second try still LLM-owned (no keyword invent). Helps when primary endpoint stalls.
    fallback_model = (
        _rule_text(rules, "intent.classifier.fallback_model") or "deepseek-v4-flash"
    ).strip()
    candidates: list[str] = [primary]
    if fallback_model and fallback_model.lower() != primary.lower():
        candidates.append(fallback_model)
    try:
        timeout_s = float(
            _rule_text(rules, "intent.classifier.timeout_s", "12").strip() or "12"
        )
    except ValueError:
        timeout_s = 12.0
    timeout_s = max(5.0, min(30.0, timeout_s))

    async def _once(model_family: str) -> tuple[str, str] | None:
        _log.info(
            "[intent.classifier] start model=%s probe=%r has_target=%s has_canvas=%s "
            "has_focus=%s has_refs=%s timeout=%.1fs",
            model_family,
            (probe or "")[:120],
            has_target_chip,
            has_canvas,
            focus,
            has_ref_images,
            timeout_s,
        )
        t_cls = time.time()
        try:
            content, _used = await asyncio.wait_for(
                complete_skill_step(
                    model_family=model_family,
                    system=system,
                    user=user_msg,
                    max_tokens=max(32, min(256, max_tokens)),
                ),
                timeout=timeout_s,
            )
        except Exception as exc:
            err = str(exc).strip() or type(exc).__name__
            _log.warning(
                "[intent.classifier] failed model=%s took=%.2fs err=%s",
                model_family,
                time.time() - t_cls,
                err[:200],
            )
            return None
        parsed = parse_route_intent(content)
        kind_raw = parse_task_kind(content)
        if parsed:
            out = _pack(parsed, kind_raw)
            _log.info(
                "[intent.classifier] ok model=%s took=%.2fs raw_intent=%s "
                "raw_task_kind=%s → intent=%s task_kind=%s reply=%r",
                model_family,
                time.time() - t_cls,
                parsed,
                kind_raw or "-",
                out[0],
                out[1] or "-",
                (content or "").strip()[:240],
            )
            return out
        _log.warning(
            "[intent.classifier] unparseable model=%s took=%.2fs reply=%r",
            model_family,
            time.time() - t_cls,
            (content or "").strip()[:240],
        )
        return None

    for mid in candidates:
        got = await _once(mid)
        if got:
            return got

    out = _pack(fallback_route_intent())
    _log.info(
        "[intent.classifier] fallback → intent=%s task_kind=%s has_target=%s "
        "tried=%s",
        out[0],
        out[1] or "-",
        has_target_chip,
        ",".join(candidates),
    )
    return out
