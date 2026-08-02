from __future__ import annotations

from typing import Any

from services.design.prompts.prompt_pack_store import render_prompt_body
from services.design.prompts.rules_text import render_prompt_template


def require_prompt_pack(rules: dict[str, str] | None, key: str, **variables: Any) -> str:
    """Load Admin pack body; missing pack is a hard error (no code fallback prose)."""
    try:
        text = render_prompt_body(key, rules=rules, **variables).strip()
    except Exception:
        text = ""
        if rules is not None:
            from services.design.prompts.rules_text import _rule_text

            raw = _rule_text(rules, key).strip()
            if raw:
                text = render_prompt_template(raw, **variables).strip() if variables else raw
    if not text:
        raise RuntimeError(
            f"missing prompt pack: {key} "
            "(Admin → prompt packs / design_prompt_packs_seed)"
        )
    return text


def interaction_mode_rules_pack(
    rules: dict[str, str] | None, *, ask_mode: bool
) -> str:
    """Mode-only rules: Ask → ask_system; Agent → agent_system."""
    key = "agent.prompt.ask_system" if ask_mode else "agent.prompt.agent_system"
    try:
        return require_prompt_pack(rules, key)
    except RuntimeError:
        return ""


def assemble_stage_system(
    rules: dict[str, str] | None,
    *,
    stage: str,
    ask_mode: bool,
    persona: str = "",
    catalog_blocks: list[str] | None = None,
) -> str:
    """Assemble stage system prompt from Admin packs + Ask/Agent mode pack."""
    stage_key = str(stage or "").strip().lower()
    if stage_key == "decide":
        protocol_key = "agent.prompt.need_tools_overlay"
    elif stage_key == "paint":
        protocol_key = "agent.prompt.paint_system"
    else:
        raise ValueError(f"unknown prompt stage: {stage}")

    parts: list[str] = []
    persona_s = str(persona or "").strip()
    if persona_s:
        parts.append(
            persona_s
            if persona_s.startswith("IDENTITY:")
            else f"IDENTITY: {persona_s}"
        )
    parts.append(require_prompt_pack(rules, protocol_key))
    mode_pack = interaction_mode_rules_pack(rules, ask_mode=ask_mode)
    if mode_pack.strip():
        parts.append(mode_pack.strip())
    for block in catalog_blocks or []:
        b = str(block or "").strip()
        if b:
            parts.append(b)
    return "\n\n".join(parts)
