"""Post-pipeline result-summary skill."""
from __future__ import annotations

import json
import re
from typing import Any

from services.design.llm_step import complete_skill_step
from services.design.models_route import resolve_model_for_skill
from services.design.pipeline_support import (
    _assess_tool_ops_density,
    _tool_ops_content_digest,
)
from services.design.prompt_build import _build_system
from services.design.rules_text import _as_text, _rule_text
from services.design.stream_face import _is_summary_skill
from services.design.svg_patch import svg_content_digest
from services.design.validate import hard_validate

# Re-export for callers that historically imported from this module.
__all__ = ["_is_summary_skill", "_run_result_summary_skill", "_normalize_palette"]


def _normalize_palette(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    primary = str(raw.get("primary") or raw.get("主题色") or "").strip()
    accents = raw.get("accents") if "accents" in raw else raw.get("辅助色")
    if isinstance(accents, str):
        accents = [a.strip() for a in re.split(r"[,，、/|]", accents) if a.strip()]
    if not isinstance(accents, list):
        accents = []
    accents = [str(a).strip() for a in accents if str(a).strip()][:4]
    notes = str(raw.get("notes") or "").strip()
    if not primary and not accents:
        return None
    return {"primary": primary, "accents": accents, "notes": notes}


def _clean_summary_text(raw: str) -> str:
    cleaned = _as_text(raw).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```\w*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    return cleaned[:900]


async def _run_result_summary_skill(
    *,
    skill: dict[str, Any],
    prompt: str,
    scene_key: str,
    analysis: str,
    skill_names: list[str],
    rules: dict[str, str],
    style_contract: str,
    template_brief: str,
    user_selected_model: str,
    is_premium: bool,
    w: int,
    h: int,
    final_svg: str = "",
    issue: str = "",
    edit_done: bool = False,
    applied_ops: list[dict[str, Any]] | None = None,
) -> tuple[str, int, str, str]:
    """
    Run catalog summary skill. Returns (text, tokens, model_family, model_reason).
    Language follows the model + Admin skill/rules — no backend language pick.
    """
    skills_line = "、".join(n for n in skill_names if n) or "设计流程"
    canvas_digest = svg_content_digest(final_svg)
    ops_digest = _tool_ops_content_digest(applied_ops)
    # Tool-ops paint on the client — backend final_svg is often empty; use ops inventory.
    if not canvas_digest and ops_digest:
        canvas_digest = ops_digest
    # Dense applied ops mean the canvas is not sparse — drop misleading PIPELINE_ISSUE.
    if str(issue or "").startswith("sparse_") and ops_digest:
        ok_ops, _ = _assess_tool_ops_density(
            applied_ops or [], intent="create", scene=scene_key
        )
        if ok_ops:
            issue = ""
    # Fallback only when the model call fails — Admin rule text, not hardcoded slogans.
    copy_lines = [
        ln[2:].strip()
        for ln in (canvas_digest or "").splitlines()
        if ln.startswith("- ")
    ][:6]
    if edit_done:
        fallback = _rule_text(rules, "summary.fallback_edit").strip()
    else:
        tpl_with = _rule_text(rules, "summary.fallback_with_copy").strip()
        tpl_empty = _rule_text(rules, "summary.fallback_empty").strip()
        if copy_lines and tpl_with:
            fallback = tpl_with.format(copy="、".join(copy_lines))
        else:
            fallback = tpl_empty
    if not fallback:
        fallback = _rule_text(rules, "summary.fallback_empty").strip()
    family, reason = resolve_model_for_skill(
        skill=skill,
        user_selected_model=user_selected_model,
        run_mode="agent",
        is_premium=is_premium,
        prompt=prompt,
        rules=rules,
        scene=scene_key,
    )
    system = _build_system(
        skill,
        rules,
        style_contract=style_contract,
        template_brief=template_brief,
        scene=scene_key,
        include_svg_spec=False,
    )
    if edit_done:
        tip = _rule_text(rules, "summary.edit_done").strip()
        if tip:
            system += f"\n\n{tip}"
    lang_sys = _rule_text(rules, "summary.output_language").strip()
    if lang_sys:
        system += f"\n\n{lang_sys}"
    issue_block = f"PIPELINE_ISSUE: {issue}\n\n" if issue else ""
    if edit_done:
        try:
            ops_raw = json.dumps(applied_ops or [], ensure_ascii=False)
        except Exception:
            ops_raw = "[]"
        lang_line = _rule_text(rules, "summary.user_hint.edit").strip()
        user = (
            f"USER_PROMPT:\n{prompt[:1200]}\n\n"
            f"EDIT_DONE: true\n"
            f"CANVAS: {w}x{h}\n"
            f"APPLIED_OPS:\n{ops_raw[:2400]}\n\n"
            f"{lang_line} Follow POSITIVE / NEGATIVE_SKILL."
        )
    else:
        ops_block = ""
        if applied_ops:
            try:
                ops_raw = json.dumps(applied_ops, ensure_ascii=False)
            except Exception:
                ops_raw = "[]"
            ops_block = f"APPLIED_OPS:\n{ops_raw[:2400]}\n\n"
        lang_line = _rule_text(rules, "summary.user_hint").strip()
        user = (
            f"USER_PROMPT:\n{prompt[:1200]}\n\n"
            f"SCENE: {scene_key or 'design'}\n"
            f"CANVAS: {w}x{h}\n"
            f"PIPELINE_STEPS: {skills_line}\n\n"
            f"{issue_block}"
            f"BRIEF:\n{(analysis or '')[:1200]}\n\n"
            f"{ops_block}"
            f"ACTUAL_CANVAS (source of truth — already on the artboard):\n"
            f"{(canvas_digest or ops_digest or '(empty)')[:2400]}\n\n"
            f"{lang_line} Follow POSITIVE and NEGATIVE_SKILL."
        )
    used = 0
    try:
        content, used = await complete_skill_step(
            model_family=family or "doubao",
            system=system,
            user=user,
            max_tokens=400,
        )
        ok, _why = hard_validate(
            content, output_format=str(skill.get("output_format") or "text"), rules=rules
        )
        text = _clean_summary_text(content)
        if ok and len(text) >= 8:
            return text, used, family or "doubao", reason
    except Exception:
        pass
    return fallback, max(1, used), family or "doubao", reason
