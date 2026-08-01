"""Vision structure extract: Admin schema → prompt + validate + LLM extract.

Shared by quality-sample suggest-meta and (later) user_primary aesthetics.
Schema lives in design_global_rule:
  - aesthetics.prompt.vision_structure  (prose)
  - aesthetics.vision.structure_schema (canvas-tool style args JSON)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from services.design.admin.admin_store import list_global_rules
from services.design.runtime.llm_step import complete_skill_step
from services.design.runtime import models_route as design_models_route
from services.design.ops.validate import extract_json_object

logger = logging.getLogger(__name__)

SCHEMA_RULE_KEY = "aesthetics.vision.structure_schema"
PROMPT_RULE_KEY = "aesthetics.prompt.vision_structure"

_DEFAULT_SCHEMA: dict[str, str] = {
    "schemaVersion": "number",
    "page.theme": "light|dark",
    "page.background.type": "solid|gradient|image",
    "page.background.fill": "string[]",
    "page.gravity": "string",
    "page.pattern": "string",
    "page.forbiddenPatterns": "string[]?",
    "page.summary": "string",
    "elements": "object",
    "elements[].id": "string",
    "elements[].type": (
        "text|image|shape|line|decoration|logo|qr|icon|"
        "button|button_primary|button_secondary|pill|card|input|"
        "avatar|checkbox_legal|nav_chip|other"
    ),
    "elements[].role": (
        "title|subtitle|body|cta|primary_cta|secondary_cta|"
        "hero|background|brand|ornament|chrome|field|legal|dismiss|other"
    ),
    "elements[].layout.xPct": "number",
    "elements[].layout.yPct": "number",
    "elements[].layout.wPct": "number",
    "elements[].layout.hPct": "number?",
    "elements[].tokens.fill": "string?",
    "elements[].tokens.text": "string?",
    "elements[].tokens.radius": "number?",
    "palette": "object",
    "summary": "string",
}


def parse_structure_schema(raw: str | None) -> dict[str, str]:
    """Parse Admin args_schema JSON → {field: typeStr} (typeStr may end with ?)."""
    text = (raw or "").strip()
    if not text:
        return dict(_DEFAULT_SCHEMA)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("structure_schema JSON invalid; using defaults")
        return dict(_DEFAULT_SCHEMA)
    if not isinstance(obj, dict) or not obj:
        return dict(_DEFAULT_SCHEMA)
    out: dict[str, str] = {}
    for k, v in obj.items():
        name = str(k).strip()
        if not name:
            continue
        out[name] = str(v or "").strip() or "string"
    return out or dict(_DEFAULT_SCHEMA)


def load_structure_schema(rules: dict[str, str] | None = None) -> dict[str, str]:
    if rules is None:
        rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    return parse_structure_schema(rules.get(SCHEMA_RULE_KEY))


def load_structure_prompt(rules: dict[str, str] | None = None) -> str:
    if rules is None:
        rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    prose = str(rules.get(PROMPT_RULE_KEY) or "").strip()
    if prose:
        return prose
    return (
        "识别页面主题与分区；列出主要可见元素；给出 layout 百分比与 design tokens。"
        "只描述图中有的，不要脑补。只输出 JSON。"
    )


def _split_type(type_str: str) -> tuple[str, bool]:
    s = (type_str or "").strip()
    optional = s.endswith("?")
    body = s[:-1].strip() if optional else s
    return body, optional


def format_schema_for_prompt(schema: dict[str, str]) -> str:
    """Human-readable required/optional field list for the vision system prompt."""
    req: list[str] = []
    opt: list[str] = []
    for name, type_str in schema.items():
        body, optional = _split_type(type_str)
        line = f"  - {name}: {body}"
        (opt if optional else req).append(line)
    parts = ["必填字段（适用时必须存在且非空）："]
    parts.extend(req or ["  （无）"])
    if opt:
        parts.append("可选字段：")
        parts.extend(opt)
    parts.append(
        "返回嵌套 JSON 形状：\n"
        '{"schemaVersion":1,"page":{...},"elements":[{...}],'
        '"palette":{...},"summary":"..."}'
    )
    return "\n".join(parts)


def build_vision_structure_system(rules: dict[str, str] | None = None) -> str:
    rules = rules or {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    prose = load_structure_prompt(rules)
    schema = load_structure_schema(rules)
    return f"{prose}\n\n字段契约：\n{format_schema_for_prompt(schema)}"


def _path_get(root: Any, path: str) -> Any:
    """Resolve dotted path on nested dicts."""
    cur: Any = root
    for part in path.split("."):
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _is_empty(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and not val.strip():
        return True
    if isinstance(val, (list, dict)) and len(val) == 0:
        return True
    return False


def validate_vision_structure(
    data: dict[str, Any] | None,
    schema: dict[str, str] | None = None,
) -> list[str]:
    """Return list of missing/invalid required field messages (empty = ok)."""
    schema = schema or dict(_DEFAULT_SCHEMA)
    if not isinstance(data, dict) or not data:
        return ["structure root missing"]

    errors: list[str] = []
    elem_fields: list[tuple[str, str, bool]] = []
    root_fields: list[tuple[str, str, bool]] = []
    for name, type_str in schema.items():
        body, optional = _split_type(type_str)
        if name.startswith("elements[]."):
            elem_fields.append((name[len("elements[].") :], body, optional))
        else:
            root_fields.append((name, body, optional))

    for name, _body, optional in root_fields:
        if name == "elements":
            els = data.get("elements")
            if not optional and (not isinstance(els, list) or len(els) == 0):
                errors.append("elements must be a non-empty array")
            continue
        if name == "palette":
            pal = data.get("palette")
            if not optional and (not isinstance(pal, dict) or len(pal) == 0):
                errors.append("palette must be a non-empty object")
            continue
        if name == "schemaVersion":
            if not optional and data.get("schemaVersion") is None:
                errors.append("schemaVersion required")
            continue
        val = _path_get(data, name)
        if optional:
            continue
        if _is_empty(val):
            errors.append(f"missing required: {name}")

    elements = data.get("elements")
    if isinstance(elements, list):
        for i, el in enumerate(elements):
            if not isinstance(el, dict):
                errors.append(f"elements[{i}] must be object")
                continue
            for sub, _body, optional in elem_fields:
                if optional:
                    continue
                val = _path_get(el, sub)
                if _is_empty(val):
                    errors.append(f"elements[{i}].{sub} required")

    return errors


def format_structure_guidance(structure: dict[str, Any]) -> str:
    """Compact block for execution-model aesthetics injection."""
    if not isinstance(structure, dict) or not structure:
        return ""
    try:
        compact = json.dumps(structure, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return ""
    if len(compact) > 6000:
        compact = compact[:6000] + "…"
    page = structure.get("page") if isinstance(structure.get("page"), dict) else {}
    pattern = str(page.get("pattern") or "").strip()
    forbidden = page.get("forbiddenPatterns")
    lines = [
        "USER_REF_STRUCTURE（必须遵守 — 元素 + 布局百分比 + 令牌；不要脑补缺失模块）：",
    ]
    if pattern:
        lines.append(f"  page.pattern: {pattern}")
    if isinstance(forbidden, list) and forbidden:
        lines.append(f"  forbiddenPatterns: {', '.join(str(x) for x in forbidden)}")
    summary = str(structure.get("summary") or page.get("summary") or "").strip()
    if summary:
        lines.append(f"  summary: {summary[:240]}")
    n = (
        len(structure.get("elements") or [])
        if isinstance(structure.get("elements"), list)
        else 0
    )
    lines.append(f"  elements: {n}")
    lines.append(f"  JSON: {compact}")
    return "\n".join(lines)


def normalize_structure(parsed: dict[str, Any]) -> dict[str, Any]:
    """Accept either top-level structure or nested under `structure`."""
    if not isinstance(parsed, dict):
        return {}
    inner = parsed.get("structure")
    if isinstance(inner, dict) and (
        "elements" in inner or "page" in inner or "palette" in inner
    ):
        out = dict(inner)
    elif "elements" in parsed or "page" in parsed:
        out = {
            k: parsed[k]
            for k in (
                "schemaVersion",
                "page",
                "elements",
                "palette",
                "summary",
            )
            if k in parsed
        }
    else:
        return {}
    if "schemaVersion" not in out:
        out["schemaVersion"] = 1
    return out


async def extract_vision_structure(
    *,
    image_url: str,
    model: str | None = None,
    scene: str | None = None,
    grade: str | None = None,
    rules: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Vision LLM → validated structure dict (+ meta)."""
    url = (image_url or "").strip()
    if not url:
        raise ValueError("imageUrl required")

    rules = rules or {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    schema = load_structure_schema(rules)
    system = build_vision_structure_system(rules)

    preferred = (model or "").strip() or design_models_route.resolve_vision_model(rules)
    family, note = design_models_route.ensure_vision_model(
        preferred,
        has_images=True,
        rules=rules,
    )
    if not design_models_route.model_supports_vision(family):
        family = design_models_route.resolve_vision_model(rules)

    scene_l = (scene or "").strip().lower() or "unknown"
    grade_l = (grade or "").strip().lower() or "good"
    user = (
        f"场景 scene={scene_l}；等级 grade={grade_l}。\n"
        "请根据附图输出结构 JSON（含 page / elements / palette / summary）。"
    )

    content, tokens = await complete_skill_step(
        model_family=family,
        system=system,
        user=user,
        max_tokens=2500,
        images=[url],
        rules=rules,
    )
    parsed = extract_json_object(content) or {}
    structure = normalize_structure(parsed if isinstance(parsed, dict) else {})
    errors = validate_vision_structure(structure, schema)

    return {
        "structure": structure,
        "valid": not errors,
        "errors": errors,
        "model": family,
        "visionNote": note or None,
        "tokens": tokens,
        "raw": (content or "")[:4000],
    }
