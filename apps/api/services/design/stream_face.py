"""User-facing stream scrubbers — structural only; wording comes from Admin rules/skills."""
from __future__ import annotations

import re
from typing import Any

from services.design.rules_text import _as_text
from services.design.validate import extract_json


def _is_analysis_skill(skill: dict[str, Any]) -> bool:
    key = str(skill.get("skill_key") or "").strip().lower()
    cat = str(skill.get("category") or "").strip().lower()
    name = str(skill.get("name") or "")
    return (
        key in ("req_parse", "brief", "intent", "design_think")
        or cat == "plan"
        or "需求" in name
        or "设计思考" in name
    )


def _is_summary_skill(skill: dict[str, Any]) -> bool:
    key = str(skill.get("skill_key") or "").strip().lower()
    cat = str(skill.get("category") or "").strip().lower()
    name = str(skill.get("name") or "")
    return key in ("result_summary", "summary") or cat == "summary" or "结果总结" in name


def _scrub_wire_payload(text: str) -> str:
    """Drop SVG / fenced code / leading JSON object — not keyword catalogs."""
    raw = _as_text(text)
    if not raw:
        return ""
    if re.search(r"<svg\b|</svg>|<g\b|<rect\b", raw, flags=re.I):
        return ""
    # Strip markdown fences.
    raw = re.sub(r"^```(?:json|svg|xml|html)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw).strip()
    # Drop essay title prefixes models like to invent (UI shows steps, not a labeled section).
    raw = re.sub(
        r"^\s*(?:用户)?意图分析\s*[:：]\s*",
        "",
        raw,
        count=1,
        flags=re.I,
    )
    raw = re.sub(
        r"^\s*intent\s*analysis\s*[:：]\s*",
        "",
        raw,
        count=1,
        flags=re.I,
    )
    # Drop a pure JSON object / array blob.
    s = raw.lstrip()
    if s.startswith("{") or s.startswith("["):
        return ""
    # If prose is followed by a JSON object, keep only the prose prefix.
    brace = raw.find("\n{")
    if brace < 0:
        brace = raw.find("{")
        if brace > 0 and raw[:brace].strip():
            raw = raw[:brace].strip()
        elif brace == 0:
            return ""
    else:
        raw = raw[:brace].strip()
    return raw.strip()


def _thinking_face_safe(piece: str) -> str | None:
    """Pass-through after structural scrub. Face wording is owned by Admin rules/skills."""
    if not piece or not str(piece).strip():
        return None
    scrubbed = _scrub_wire_payload(piece)
    return scrubbed or None


def _extract_analysis_prose(content: str) -> str:
    """User-facing brief = model text before the first JSON object."""
    raw = _as_text(content).strip()
    if not raw:
        return ""
    if re.search(r"<svg\b|</svg>", raw, flags=re.I):
        brace = raw.find("{")
        raw = raw[:brace].strip() if brace >= 0 else ""
        if re.search(r"<svg\b|</svg>", raw, flags=re.I):
            return ""
    brace = raw.find("{")
    prose = raw if brace < 0 else raw[:brace].strip()
    prose = re.sub(r"^```(?:json)?\s*", "", prose).strip()
    if not prose or prose.startswith("{"):
        return ""
    prose = _scrub_wire_payload(prose)
    if len(prose) < 8:
        return ""
    return prose


def _analysis_delta_safe(piece: str) -> str | None:
    return _thinking_face_safe(piece)


def _user_facing_analysis(skill: dict[str, Any], content: str) -> str | None:
    """Only the model's own prose — never synthesize from JSON fields."""
    if not _is_analysis_skill(skill):
        return None
    prose = _extract_analysis_prose(content)
    return prose or None


def _analysis_contract_ready(content: str) -> bool:
    """True when req_parse already has a usable JSON contract — stop essaying."""
    data = extract_json(content)
    if not isinstance(data, dict):
        return False
    intent = str(data.get("intent") or "").strip().lower()
    if intent in ("edit", "create", "sibling", "blank"):
        return True
    if data.get("canvas") or data.get("elements") or data.get("must_have"):
        return True
    return False
