"""System prompt stack + edit/create context for design skills."""
from __future__ import annotations

import json
import re
from typing import Any

from services.agent_memory.service import memory_service
from services.design.pipeline_support import _bg_candidate_from_nodes
from services.design.rules_text import _as_text, _rule_flag_on, _rule_text
from services.design.stream_face import _is_analysis_skill
from services.design.svg_patch import svg_content_digest

def _edit_context_block(
    rules: dict[str, str],
    svg: str,
    *,
    include_full_svg: bool,
    scene_nodes: list[dict[str, Any]] | None = None,
    scene_frames: list[dict[str, Any]] | None = None,
    canvas_id: str = "",
    focus_frame_id: str = "",
) -> str:
    hint = _rule_text(rules, "edit.in_place").strip()
    digest = svg_content_digest(svg)
    parts = ["EDIT_MODE: in_place"]
    if hint:
        parts.append(hint)
    tool_ops = _rule_text(rules, "edit.tool_ops").strip()
    if tool_ops:
        parts.append(tool_ops)
    cid = (canvas_id or "").strip()
    if cid:
        parts.append(f"CANVAS_ID: {cid}")
    focus = (focus_frame_id or "").strip()
    if focus:
        parts.append(f"FOCUS_FRAME_ID: {focus}")
    if scene_frames:
        try:
            raw_frames = json.dumps(scene_frames, ensure_ascii=False)
        except Exception:
            raw_frames = "[]"
        parts.append(
            "SCENE_FRAMES (artboard ids — delete_frame / create must use these ids only):\n"
            f"{raw_frames[:8000]}"
        )
    if digest:
        parts.append(f"ACTUAL_CANVAS_DIGEST:\n{digest[:2400]}")
    if scene_nodes:
        try:
            raw = json.dumps(scene_nodes, ensure_ascii=False)
        except Exception:
            raw = "[]"
        parts.append(f"SCENE_NODES:\n{raw[:16000]}")
        bg = _bg_candidate_from_nodes(scene_nodes)
        if bg:
            parts.append(
                "BG_CANDIDATE_NODE_ID: "
                f"{bg.get('id')} (fill={bg.get('fill') or '?'}; "
                f"{bg.get('w')}x{bg.get('h')}) — "
                "改底色/背景色时必须 update_node 此 id，禁止 create_shape 叠新底。"
            )
    elif include_full_svg and (svg or "").strip():
        # Fallback when client did not send scene inventory.
        parts.append(f"CURRENT_SVG:\n{svg[:18000]}")
    return "\n".join(parts) + "\n"

def _create_context_block(
    rules: dict[str, str],
    *,
    w: int,
    h: int,
    scene_key: str = "website",
) -> str:
    tip = _rule_text(rules, "create.tool_ops").strip()
    scene = (scene_key or "website").strip().lower() or "website"
    parts = [f"CREATE_MODE: new_artboard {w}x{h} scene={scene}"]
    # Admin-owned policy (create.artboard_policy). Supports {scene} / {suggested_name}.
    policy = _rule_text(rules, "create.artboard_policy").strip()
    if policy:
        suggested = _suggested_frame_name(rules, scene)
        parts.append(
            policy.replace("{scene}", scene).replace("{suggested_name}", suggested)
        )
    if tip:
        parts.append(tip)
    return "\n".join(parts) + "\n"


def _suggested_frame_name(rules: dict[str, str] | None, scene: str) -> str:
    """Parse create.frame_name_by_scene: website=官网首页;mobile=App页面;…"""
    raw = _rule_text(rules, "create.frame_name_by_scene").strip()
    mapping: dict[str, str] = {}
    for part in re.split(r"[;\n]+", raw):
        part = part.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k, v = k.strip().lower(), v.strip()
        if k and v:
            mapping[k] = v
    return mapping.get((scene or "").strip().lower()) or mapping.get("default") or "画板"

def _resolve_agent_persona(
    rules: dict[str, str] | None,
    user_selected_model: str | None,
) -> str | None:
    """Chat/design identity from admin global rules. None for image generators."""
    mid = _as_text(user_selected_model or "auto").strip()
    low = mid.lower()
    if low and low != "auto" and re.search(
        r"seedream|t2i|i2i|dreamina|flux|ideogram|kling|sora|minimax|image",
        low,
    ):
        return None
    rules = rules or {}
    if not mid or low == "auto":
        return _rule_text(rules, "agent.persona.auto") or None
    label = _model_display_label(mid)
    tmpl = _rule_text(rules, "agent.persona.locked").strip()
    if not tmpl:
        return None
    # Prefer replace over str.format — admin text may contain stray { } / %.
    return tmpl.replace("{model_label}", label)


def _model_display_label(model_id: str) -> str:
    """Prefer catalog label (DeepSeek V4 Flash) over raw id."""
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
    try:
        from services.llm import MODEL_CATALOG

        for m in MODEL_CATALOG or []:
            if str(m.get("id") or "").strip().lower() == mid.lower():
                lab = str(m.get("label") or "").strip()
                if lab:
                    return lab
    except Exception:
        pass
    return mid

def merge_design_rules(raw: dict[str, str], scene: str) -> dict[str, str]:
    """Merge rule layers: global base, then scene.* overlays (scene wins on same key).

    Scene keys use prefix ``scene.{scene}.`` e.g. ``scene.poster.negative_global``.
    Style-pack tokens are injected separately into the system prompt (DESIGN.md layer).
    """
    out = dict(raw or {})
    scene_key = (scene or "").strip().lower()
    if not scene_key:
        return out
    prefix = f"scene.{scene_key}."
    for k, v in list(raw.items()):
        if not k.startswith(prefix):
            continue
        base = k[len(prefix) :]
        if base:
            out[base] = v
    return out

def _format_style_contract(meta: dict[str, Any] | None, name: str | None) -> str:
    """DESIGN.md-like brand contract from library style pack meta."""
    if not isinstance(meta, dict) or not meta:
        return ""
    parts = [f"DESIGN_SYSTEM: {name or 'style_pack'}"]
    palette = meta.get("palette")
    if isinstance(palette, list) and palette:
        parts.append("PALETTE: " + ", ".join(str(x) for x in palette))
    elif isinstance(palette, str) and palette.strip():
        parts.append(f"PALETTE: {palette.strip()}")
    for key, label in (
        ("type", "TYPE"),
        ("font", "TYPE"),
        ("radius", "RADIUS"),
        ("spacing", "SPACING"),
        ("stroke", "STROKE"),
        ("ratio", "RATIO"),
        ("mood", "MOOD"),
    ):
        val = meta.get(key)
        if val is None or val == "":
            continue
        if isinstance(val, list):
            parts.append(f"{label}: " + ", ".join(str(x) for x in val))
        else:
            parts.append(f"{label}: {val}")
    extra = meta.get("tokens")
    if isinstance(extra, dict) and extra:
        parts.append("TOKENS: " + json.dumps(extra, ensure_ascii=False))
    return "\n".join(parts)

def _format_template_brief(meta: dict[str, Any] | None, name: str | None) -> str:
    if not isinstance(meta, dict) or not meta:
        return ""
    parts = [f"TEMPLATE: {name or 'composition'}"]
    canvas = meta.get("canvas")
    if canvas:
        parts.append(f"TEMPLATE_CANVAS: {canvas}")
    modules = meta.get("modules")
    if isinstance(modules, list) and modules:
        parts.append("MODULES: " + ", ".join(str(x) for x in modules))
    layout = meta.get("layout")
    if layout:
        parts.append(f"LAYOUT: {layout}")
    return "\n".join(parts)

def _apply_prompt_pattern(prompt: str, meta: dict[str, Any] | None) -> str:
    if not isinstance(meta, dict):
        return prompt
    template = str(meta.get("template") or "").strip()
    if not template:
        return prompt
    if "{prompt}" in template:
        return template.replace("{prompt}", prompt)
    if prompt in template:
        return template
    return f"{template}\n\nUSER_BRIEF:\n{prompt}"

def _build_system(
    skill: dict[str, Any],
    rules: dict[str, str],
    *,
    style_contract: str = "",
    template_brief: str = "",
    scene: str = "",
    include_svg_spec: bool | None = None,
    lean_edit: bool = False,
) -> str:
    """Prompt stack: global rules + scene + DESIGN system + template + skill pos/neg.

    ``lean_edit`` (targeted @node / @group only): skip design-token / knowledge dump
    and DEEP_THINK. Whole-page edit_in_place still uses the full stack.
    """
    fmt = str(skill.get("output_format") or "").lower()
    want_svg = (
        include_svg_spec
        if include_svg_spec is not None
        else fmt in ("svg", "svg_fragment")
    )
    parts = [
        "You are a design skill worker. Follow ONLY this skill. Obey stacked rules.",
        "PROMPT_STACK: global > scene > design_system > template > skill",
        f"SCENE: {scene or 'general'}",
    ]
    if lean_edit:
        lean = (rules.get("edit.lean") or "").strip()
        if lean:
            parts.append(lean)
        user_first = (rules.get("design.user_first") or "").strip()
        if user_first:
            parts.append(f"USER_FIRST: {user_first}")
        parts.extend(
            [
                f"SKILL: {skill.get('name')}",
                f"POSITIVE: {skill.get('prompt_positive')}",
                f"NEGATIVE_SKILL: {skill.get('prompt_negative') or ''}",
                f"OUTPUT_FORMAT: {skill.get('output_format')}",
            ]
        )
        if _is_analysis_skill(skill):
            tone = (rules.get("tone.user_facing") or "").strip()
            if tone:
                parts.append(f"TONE: {tone}")
            face = (rules.get("face.analysis") or "").strip()
            if face:
                parts.append(f"FACE_ANALYSIS: {face}")
            classify = (rules.get("intent.classify_hint") or "").strip()
            if classify:
                parts.append(f"INTENT_CLASSIFY: {classify}")
            # Prefer edit.analysis_lean; fall back to edit.speed (legacy key).
            analysis_lean = (
                rules.get("edit.analysis_lean") or rules.get("edit.speed") or ""
            ).strip()
            if analysis_lean:
                parts.append(analysis_lean)
        return "\n".join(parts)

    judgment = (rules.get("agent.judgment_policy") or "").strip()
    if judgment:
        parts.append(f"JUDGMENT: {judgment}")
    user_first = (rules.get("design.user_first") or "").strip()
    if user_first:
        parts.append(f"USER_FIRST: {user_first}")
    rule_tiers = (rules.get("design.rule_tiers") or "").strip()
    if rule_tiers:
        parts.append(f"RULE_TIERS: {rule_tiers}")
    if want_svg:
        svg_spec = (rules.get("svg_spec") or "").strip()
        if svg_spec:
            parts.append(f"SVG_SPEC: {svg_spec}")
        layer = (rules.get("layer_naming") or "").strip()
        if layer:
            parts.append(f"LAYER_NAMING: {layer}")
        path_close = (rules.get("path_close") or "").strip()
        if path_close:
            parts.append(f"PATH_CLOSE: {path_close}")
    parts.append(f"NEGATIVE: {rules.get('negative_global', '')}")
    scene_hint = (rules.get("layout_hint") or rules.get("scene_hint") or "").strip()
    if scene_hint:
        parts.append(f"SCENE_HINT: {scene_hint}")
    for extra_key, label in (
        ("typography_hint", "TYPOGRAPHY"),
        ("density_hint", "DENSITY"),
        ("color_hint", "COLOR_HINT"),
        ("spacing_hint", "SPACING"),
        ("design.color_terms", "COLOR_TERMS"),
        ("design.px_baseline", "PX_BASELINE"),
    ):
        extra_val = (rules.get(extra_key) or "").strip()
        if extra_val:
            parts.append(f"{label}: {extra_val}")
    # Design tokens (Admin「设计令牌」) intentionally disconnected from the prompt stack.
    # Design knowledge: optional, by scene + skill category (USER_PROMPT still wins).
    from services.design.knowledge_store import format_knowledge_block, list_for_injection

    cat = str(skill.get("category") or "").lower()
    knowledge_block = format_knowledge_block(
        list_for_injection(scene=scene or "website", skill_category=cat)
    )
    if knowledge_block:
        parts.append(knowledge_block)
    if style_contract:
        parts.append(style_contract)
        obey_ds = (rules.get("prompt.design_system_obey") or "").strip()
        if obey_ds:
            parts.append(obey_ds)
    if template_brief:
        parts.append(template_brief)
        obey_tpl = (rules.get("prompt.template_obey") or "").strip()
        if obey_tpl:
            parts.append(obey_tpl)
    parts.extend(
        [
            f"SKILL: {skill.get('name')}",
            f"POSITIVE: {skill.get('prompt_positive')}",
            f"NEGATIVE_SKILL: {skill.get('prompt_negative') or ''}",
            f"OUTPUT_FORMAT: {skill.get('output_format')}",
        ]
    )
    if _is_analysis_skill(skill):
        deep = (rules.get("plan.deep_think") or "").strip()
        if deep:
            parts.append(f"DEEP_THINK:\n{deep}")
        tone = (rules.get("tone.user_facing") or "").strip()
        if tone:
            parts.append(f"TONE: {tone}")
        face = (rules.get("face.analysis") or "").strip()
        if face:
            parts.append(f"FACE_ANALYSIS: {face}")
        classify = (rules.get("intent.classify_hint") or "").strip()
        if classify:
            parts.append(f"INTENT_CLASSIFY: {classify}")
    return "\n".join(parts)

def _finalize_memory_patch(
    *,
    user_id: str,
    session_id: str | None,
    project_id: str | None,
    medium: dict[str, Any],
    task_id: str,
    intent: str | None,
    edit_in_place: bool,
    blank_artboard: bool,
    summary: str,
    tool_ops_applied: bool,
    critique_notes: str | None,
    scene_key: str | None,
    canvas_size: str | None,
    canvas_frame_patch: dict[str, Any] | None = None,
    subgoals: list[str] | None = None,
    completed_skill_keys: list[str] | None = None,
) -> dict[str, Any]:
    working = dict(medium or {})
    if canvas_frame_patch:
        from services.agent_memory.schema import deep_merge

        working = deep_merge(working, {"canvas": canvas_frame_patch})
    patch = memory_service.build_run_patch(
        working,
        task_id=task_id,
        intent=intent,
        edit_in_place=edit_in_place,
        blank_artboard=blank_artboard,
        summary=summary,
        tool_ops_applied=tool_ops_applied,
        critique_notes=critique_notes,
        scene_key=scene_key,
        canvas_size=canvas_size,
        subgoals=subgoals,
        completed_skill_keys=completed_skill_keys,
    )
    merged = patch["medium"]
    sid = _as_text(session_id).strip()
    pid = _as_text(project_id).strip() or "__none__"
    if sid:
        memory_service.persist_after_run(user_id, sid, pid, merged)
    return patch

