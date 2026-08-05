"""Suggest quality-sample comment / tags / vision structure from a screenshot."""

from __future__ import annotations

import logging
import re
from typing import Any

from app.services.design.admin.admin_store import list_global_rules
from app.services.design.aesthetics.structure_extract import (
    build_vision_structure_system,
    load_structure_schema,
    normalize_structure,
    validate_vision_structure,
)
from app.services.design.runtime.llm_step import complete_skill_step
from app.services.design.runtime import models_route as design_models_route
from app.services.design.ops.validate import extract_json_object

logger = logging.getLogger(__name__)

_META_HINT = """同时为美学样本库写短评与标签（回炉用，须具体可执行）：
comment 用中文约 40–180 字；tags 英文小写逗号分隔 3–8 个；name 可选中文短标题。
输出 JSON 须同时包含：
{"comment":"...","tags":"...","name":"...","structure":{schemaVersion,page,elements,palette,summary}}
或把 page/elements/palette 放在根级亦可。"""


def _clean_tags(raw: str) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for bit in re.split(r"[,，;；\s]+", raw or ""):
        t = bit.strip().lower()
        if not t or t in seen:
            continue
        seen.add(t)
        parts.append(t)
        if len(parts) >= 10:
            break
    return ", ".join(parts)


async def suggest_sample_meta(
    *,
    image_url: str,
    model: str | None = None,
    scene: str | None = None,
    grade: str | None = None,
) -> dict[str, Any]:
    url = (image_url or "").strip()
    if not url:
        raise ValueError("imageUrl required")

    rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    preferred = (model or "").strip() or design_models_route.resolve_vision_model(rules)
    family, note = design_models_route.ensure_vision_model(
        preferred,
        has_images=True,
        rules=rules,
    )
    if not design_models_route.model_supports_vision(family):
        family = design_models_route.resolve_vision_model(rules)

    system = f"{build_vision_structure_system(rules)}\n\n{_META_HINT}"
    schema = load_structure_schema(rules)

    scene_l = (scene or "").strip().lower() or "unknown"
    grade_l = (grade or "").strip().lower() or "good"
    user = (
        f"场景 scene={scene_l}；等级 grade={grade_l}。\n"
        "请根据附图写出短评、标签，并抽取 structure JSON。"
    )

    content, tokens = await complete_skill_step(
        model_family=family,
        system=system,
        user=user,
        max_tokens=2800,
        images=[url],
        rules=rules,
    )
    parsed = extract_json_object(content) or {}
    if not isinstance(parsed, dict):
        parsed = {}

    comment = str(parsed.get("comment") or "").strip()
    tags = _clean_tags(str(parsed.get("tags") or ""))
    name = str(parsed.get("name") or "").strip()[:128]

    if not comment:
        comment = re.sub(r"```[\s\S]*?```", "", content).strip()[:500]
    if not comment:
        raise RuntimeError("模型未返回可用短评")

    structure = normalize_structure(parsed)
    struct_errors = validate_vision_structure(structure, schema) if structure else [
        "structure missing"
    ]

    return {
        "comment": comment[:500],
        "tags": tags[:512],
        "name": name,
        "structure": structure or None,
        "structureValid": bool(structure) and not struct_errors,
        "structureErrors": struct_errors,
        "model": family,
        "visionNote": note or None,
        "tokens": tokens,
    }
