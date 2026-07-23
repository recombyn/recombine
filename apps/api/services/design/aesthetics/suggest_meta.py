"""Suggest quality-sample comment / tags from a design screenshot (vision LLM)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from services.design.admin_store import list_global_rules
from services.design.llm_step import complete_skill_step
from services.design import models_route as design_models_route

logger = logging.getLogger(__name__)

_SYSTEM = """你是设计美学标注助手。根据设计截图，为美学样本库写「短评」和「标签」。
短评会在后续回炉时给生成模型看，必须具体、可执行（留白、层级、对齐、色彩、字体、节奏等），不要空话。
只输出一个 JSON 对象，不要 markdown 代码块，不要其它解释。
格式：{"comment":"...","tags":"tag1, tag2, tag3","name":"可选短名"}
comment 用中文，约 40–180 字；tags 用英文小写逗号分隔，3–8 个；name 可选中文短标题。"""


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return {}
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}


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

    scene_l = (scene or "").strip().lower() or "unknown"
    grade_l = (grade or "").strip().lower() or "good"
    user = (
        f"场景 scene={scene_l}；等级 grade={grade_l}。\n"
        "请根据附图写出短评与标签 JSON。"
    )

    content, tokens = await complete_skill_step(
        model_family=family,
        system=_SYSTEM,
        user=user,
        max_tokens=800,
        images=[url],
    )
    parsed = _extract_json(content)
    comment = str(parsed.get("comment") or "").strip()
    tags = _clean_tags(str(parsed.get("tags") or ""))
    name = str(parsed.get("name") or "").strip()[:128]

    if not comment:
        # Fallback: treat whole reply as comment if JSON failed.
        comment = re.sub(r"```[\s\S]*?```", "", content).strip()[:500]
    if not comment:
        raise RuntimeError("模型未返回可用短评")

    return {
        "comment": comment[:500],
        "tags": tags[:512],
        "name": name,
        "model": family,
        "visionNote": note or None,
        "tokens": tokens,
    }
