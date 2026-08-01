"""LangChain-style model routing for the design agent runtime graph.

Flow (recommended LC pattern):
  1) Router node: cheap model + structured output → ``ModelRouteDecision``
  2) Map ``lane`` → catalog id via Admin ``precheck.model_threshold``
  3) Lock / user Auto overrides / vision soft-switch / fallback_chain

Lanes (not difficulty tiers):
  - fast      — Q&A, tiny tweaks, no layout redesign
  - standard  — typical canvas edits / moderate posters
  - reasoning — blank create, multi-artboard, design systems, hard multi-step
  - vision    — must understand attached images
  - image     — image-generation catalog slot (not a text chat lane)

Legacy Admin keys ``simple|medium|complex`` still parse → ``fast|standard|reasoning``.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field


ROUTE_LANES = ("fast", "standard", "reasoning", "vision")
IMAGE_SLOT = "image"

# Old product keys → new lanes (read path only).
_LEGACY_LANE_ALIASES = {
    "simple": "fast",
    "medium": "standard",
    "complex": "reasoning",
    "else": "standard",
}

LANE_LABELS_ZH = {
    "fast": "轻量",
    "standard": "标准",
    "reasoning": "推理",
    "vision": "看图",
    "image": "生图",
}

_ROUTER_SYSTEM_KEY = "precheck.router_system"
_INTENT_SYSTEM_KEY = "agent.prompt.intent_classify"


class ModelRouteDecision(BaseModel):
    """Structured router output (LangChain ``response_format`` / ``with_structured_output``)."""

    lane: Literal["fast", "standard", "reasoning", "vision"] = Field(
        description="Model lane for this turn",
    )
    needs_image_gen: bool = Field(
        default=False,
        description="True when the user needs AI image generation",
    )
    rationale: str = Field(
        default="",
        description="Short reason for the lane choice",
    )


# Gate intents — judged by LLM against the canvas tools catalog.
USER_INTENTS = ("chat", "canvas_op", "design")
# Continues into paint / decide (not chat-end).
CANVAS_WORK_INTENTS = frozenset({"canvas_op", "design"})
# Paint tool family for canvas_op / design (create_* vs update_*).
PAINT_LANES = ("create", "edit")


class IntentClassifyDecision(BaseModel):
    """Narrow intent gate before decide / paint.

    - chat: no canvas work
    - canvas_op: request is achievable with catalog canvas tools (create_shape,
      update_node, …) — direct tool path, no methodology skills
    - design: needs design composition / creative judgment beyond a single tool op
    """

    intent: Literal["chat", "canvas_op", "design"] = Field(
        default="chat",
        description=(
            "chat=greet/end; canvas_op=doable via canvas tool catalog; "
            "design=creative layout/page/poster work"
        ),
    )
    paint_lane: Literal["create", "edit", ""] = Field(
        default="",
        description=(
            "When intent is canvas_op or design: create=add new nodes; "
            "edit=change existing. Empty when intent=chat."
        ),
    )
    reply: str = Field(
        default="",
        description="Short Chinese reply when intent=chat; empty otherwise",
    )
    rationale: str = Field(
        default="",
        description="Short reason — cite tool names from the catalog when canvas_op",
    )


def normalize_paint_lane(raw: str | None, *, intent: str) -> str:
    if intent == "chat":
        return ""
    s = str(raw or "").strip().lower()
    if s in PAINT_LANES:
        return s
    return "create"


def normalize_user_intent(raw: str | None) -> str:
    """Map classifier / legacy labels → chat | canvas_op | design."""
    s = str(raw or "").strip().lower()
    if s in USER_INTENTS:
        return s
    # Legacy two-axis / create|edit labels.
    if s in ("create", "edit"):
        return "canvas_op"
    if s in ("basic",):
        return "canvas_op"
    if s == "ask":
        return "design"
    return "chat"


def normalize_intent_decision(
    raw_intent: str | None,
    raw_lane: str | None = None,
    *,
    raw_grade: str | None = None,
) -> tuple[str, str]:
    """Return (intent, paint_lane). Accepts legacy work_grade / create|edit."""
    s = str(raw_intent or "").strip().lower()
    g = str(raw_grade or "").strip().lower()
    lane = str(raw_lane or "").strip().lower()
    if s in ("create", "edit"):
        # Old primary create|edit + optional work_grade.
        if g == "design":
            return "design", normalize_paint_lane(lane or s, intent="design")
        return "canvas_op", normalize_paint_lane(lane or s, intent="canvas_op")
    if s == "basic":
        return "canvas_op", normalize_paint_lane(lane or "create", intent="canvas_op")
    intent = normalize_user_intent(s)
    return intent, normalize_paint_lane(lane, intent=intent)


def paint_ops_intent(classified: str | None, paint_lane: str | None = None) -> str:
    """Map gate → paint tool lane (create | edit)."""
    intent = normalize_user_intent(classified)
    lane = normalize_paint_lane(paint_lane, intent=intent)
    if lane in PAINT_LANES:
        return lane
    return "create"


def allows_skill_preload(*, intent: str) -> bool:
    """Methodology packs only for design-grade work."""
    return normalize_user_intent(intent) == "design"


def _split_list(raw: str, seps: str = "|;,") -> list[str]:
    if not raw:
        return []
    parts = re.split(f"[{re.escape(seps)}]+", raw)
    return [p.strip() for p in parts if p.strip()]


def normalize_lane(raw: str | None) -> str:
    s = str(raw or "").strip().lower()
    if not s:
        return "standard"
    s = _LEGACY_LANE_ALIASES.get(s, s)
    if s in ROUTE_LANES or s == IMAGE_SLOT:
        return s
    return "standard"


def parse_model_lanes(rules: dict[str, str] | None) -> dict[str, str]:
    """Parse Admin lane→model map from ``precheck.model_threshold`` (or ``model_lanes``)."""
    raw = str(
        (rules or {}).get("precheck.model_lanes")
        or (rules or {}).get("precheck.model_threshold")
        or ""
    ).strip()
    out: dict[str, str] = {}
    if not raw:
        return {
            "fast": "doubao-seed-2-1-turbo",
            "standard": "deepseek-v4-flash",
            "reasoning": "deepseek-v4-pro",
            "vision": "doubao-seed-2-1-turbo",
            "image": "doubao-seedream-5-0-lite",
            "else": "deepseek-v4-flash",
        }
    for part in raw.split(";"):
        part = part.strip()
        if not part or "->" not in part:
            continue
        left, right = part.split("->", 1)
        key = normalize_lane(left.strip().lower())
        # Preserve explicit vision/image keys; normalize_lane maps else→standard.
        left_l = left.strip().lower()
        if left_l in ("vision", "image"):
            key = left_l
        elif left_l == "else":
            key = "else"
        val = right.strip()
        if key and val:
            out[key] = val
    # Promote legacy-only maps that never used new names.
    for legacy, lane in (("simple", "fast"), ("medium", "standard"), ("complex", "reasoning")):
        if lane not in out:
            # Re-parse raw for un-normalized legacy keys.
            for part in raw.split(";"):
                part = part.strip()
                if not part or "->" not in part:
                    continue
                left, right = part.split("->", 1)
                if left.strip().lower() == legacy and right.strip():
                    out.setdefault(lane, right.strip())
    if "else" in out:
        out.setdefault("fast", out["else"])
        out.setdefault("standard", out["else"])
    out.setdefault(
        "else",
        out.get("standard") or out.get("reasoning") or out.get("fast") or "deepseek-v4-flash",
    )
    return out


# Back-compat alias used by older imports / Admin copy.
def parse_model_routes(rules: dict[str, str] | None) -> dict[str, str]:
    return parse_model_lanes(rules)


def parse_fallback_chain(rules: dict[str, str] | None) -> list[str]:
    raw = str((rules or {}).get("precheck.fallback_chain") or "").strip()
    if not raw:
        lanes = parse_model_lanes(rules)
        chain: list[str] = []
        for k in ("reasoning", "standard", "else", "fast"):
            m = lanes.get(k)
            if m and m not in chain:
                chain.append(m)
        return chain
    return _split_list(raw, "|;,")


def enabled_lanes(rules: dict[str, str] | None) -> list[str]:
    raw = str(
        (rules or {}).get("precheck.route_lanes")
        or (rules or {}).get("precheck.task_tiers")
        or "fast|standard|reasoning|vision"
    ).strip()
    lanes = [normalize_lane(x) for x in _split_list(raw, "|;,")]
    # Drop image from chat lanes if present.
    lanes = [x for x in lanes if x in ROUTE_LANES]
    return lanes or ["fast", "standard", "reasoning", "vision"]


# Back-compat
def enabled_tiers(rules: dict[str, str] | None) -> list[str]:
    return enabled_lanes(rules)


def clamp_lane(lane: str, enabled: list[str] | None) -> str:
    t = normalize_lane(lane)
    if t == "vision" and (not enabled or "vision" in [x.lower() for x in (enabled or [])]):
        if not enabled or "vision" in [x.lower() for x in enabled]:
            return "vision"
    if not enabled:
        return t if t in ROUTE_LANES else "standard"
    enabled_l = [normalize_lane(x) for x in enabled]
    if t in enabled_l:
        return t
    order = ["reasoning", "standard", "fast", "vision"]
    try:
        idx = order.index(t)
    except ValueError:
        idx = 1
    for cand in order[idx:]:
        if cand in enabled_l:
            return cand
    return enabled_l[0]


def clamp_tier(tier: str, enabled: list[str] | None) -> str:
    return clamp_lane(tier, enabled)


def pick_fallback_model(
    primary: str,
    rules: dict[str, str] | None,
    *,
    attempt: int = 0,
) -> str:
    chain = parse_fallback_chain(rules)
    if not chain:
        return primary
    ordered = [primary] + [m for m in chain if m != primary]
    if attempt <= 0:
        return ordered[0]
    return ordered[min(attempt, len(ordered) - 1)]


def normalize_model_ref(selected: str | None) -> str:
    s = str(selected if selected is not None else "auto").strip()
    low = s.lower()
    if not low or low == "auto":
        return "auto"
    # Preserve BYOK provider id casing after prefix.
    if low.startswith("custom:") or low.startswith("byok:"):
        prefix, _, rest = s.partition(":")
        return f"{prefix.lower()}:{rest.strip()}"
    s = low
    if s in ("doubao-seed", "doubao-pro"):
        return "doubao"
    if s in ("deepseek-chat", "deepseek-reasoner"):
        return "deepseek"
    return s


def _is_concrete(ref: str) -> bool:
    low = str(ref or "").strip().lower()
    if low.startswith("custom:") or low.startswith("byok:"):
        return bool(low.split(":", 1)[-1].strip())
    return ref not in ("doubao", "deepseek", "auto", "glm", "kimi") and bool(ref)


_VISION_MODEL_IDS = frozenset(
    {
        "doubao-seed-2-1-pro",
        "doubao-seed-2-1-turbo",
    }
)
_VISION_MODEL_MARKERS = (
    "vision",
    "seed-2-1-pro",
    "seed-2-1-turbo",
    "seed-2.1-pro",
    "seed-2.1-turbo",
)
_DEFAULT_VISION_FALLBACK = "doubao-seed-2-1-pro"


def model_supports_vision(model_ref: str | None) -> bool:
    """Whether chat/completions may include image_url for this model."""
    ref = str(model_ref or "").strip()
    low = ref.lower()
    if not low or "seedream" in low:
        return False
    from services.security import parse_byok_model_ref

    byok_pid = parse_byok_model_ref(ref)
    if byok_pid:
        try:
            from services.llm import get_byok_user_id
            from services.security import get_byok_provider_row

            uid = get_byok_user_id()
            if uid:
                row = get_byok_provider_row(uid, byok_pid)
                if row:
                    return str(row.get("modelKind") or "").strip().lower() == "vision"
        except Exception:
            pass
        return False
    try:
        from services.llm.catalog_store import get_model

        item = get_model(low)
        if item:
            types = item.get("referenceTypes") or item.get("reference_types") or []
            if isinstance(types, list) and types:
                return "vision" in types
    except Exception:
        pass
    if "mini" in low or "flash" in low:
        return False
    if low in _VISION_MODEL_IDS:
        return True
    return any(m in low for m in _VISION_MODEL_MARKERS)


def _vision_ok(model_ref: str | None) -> bool:
    return model_supports_vision(model_ref)


def resolve_vision_model(rules: dict[str, str] | None) -> str:
    candidates: list[str] = []
    raw = str((rules or {}).get("precheck.vision_model") or "").strip()
    if raw:
        candidates.append(raw)
    lanes = parse_model_lanes(rules)
    if lanes.get("vision"):
        candidates.append(lanes["vision"])
    candidates.extend(parse_fallback_chain(rules))
    candidates.extend(lanes.values())
    for mid in candidates:
        if _vision_ok(mid):
            return mid
    return _DEFAULT_VISION_FALLBACK


def ensure_vision_model(
    model_ref: str,
    *,
    has_images: bool,
    rules: dict[str, str] | None = None,
    prefer: str | None = None,
    allow_switch: bool = True,
) -> tuple[str, str | None]:
    if not has_images:
        return model_ref, None
    if _vision_ok(model_ref):
        return model_ref, None
    if not allow_switch:
        return model_ref, None
    vision = (prefer or "").strip()
    if not _vision_ok(vision):
        vision = resolve_vision_model(rules)
    if not _vision_ok(vision):
        vision = _DEFAULT_VISION_FALLBACK
    if vision == model_ref:
        return model_ref, None
    return vision, f"precheck_vision_from_{normalize_model_ref(model_ref)}"


def is_user_locked_model(user_selected_model: str | None) -> bool:
    return _is_concrete(normalize_model_ref(user_selected_model))


def pin_user_locked_model_routes(
    rules: dict[str, str] | None,
    user_selected_model: str | None,
) -> dict[str, str]:
    """Lock: all lanes + vision + fallback pin to the concrete catalog id."""
    out = dict(rules or {})
    mid = normalize_model_ref(user_selected_model)
    if not _is_concrete(mid):
        return out
    out["precheck.model_threshold"] = (
        f"fast->{mid};standard->{mid};reasoning->{mid};else->{mid}"
    )
    out["precheck.model_lanes"] = out["precheck.model_threshold"]
    out["precheck.vision_model"] = mid
    out["precheck.fallback_chain"] = mid
    return out


def apply_user_route_overrides(
    rules: dict[str, str] | None,
    overrides: dict[str, Any] | None,
) -> dict[str, str]:
    """Merge user Auto prefs. Accepts new lanes and legacy simple/medium/complex."""
    out = dict(rules or {})
    if not overrides or not isinstance(overrides, dict):
        return out

    lanes = parse_model_lanes(out)
    for key in ("fast", "standard", "reasoning", "simple", "medium", "complex"):
        raw = overrides.get(key)
        mid = str(raw or "").strip()
        if mid and mid.lower() not in ("auto", "platform", "default"):
            lanes[normalize_lane(key)] = mid
    if lanes:
        if "else" not in lanes:
            lanes["else"] = (
                lanes.get("standard")
                or lanes.get("reasoning")
                or lanes.get("fast")
                or resolve_vision_model(out)
            )
        serialized = ";".join(
            f"{k}->{v}"
            for k, v in lanes.items()
            if k and v and k in ("fast", "standard", "reasoning", "else", "vision", "image")
        )
        out["precheck.model_threshold"] = serialized
        out["precheck.model_lanes"] = serialized

    vision = str(
        overrides.get("vision") or overrides.get("vision_model") or ""
    ).strip()
    if vision and vision.lower() not in ("auto", "platform", "default"):
        out["precheck.vision_model"] = vision

    image = str(
        overrides.get("image") or overrides.get("image_default_model") or ""
    ).strip()
    if image and image.lower() not in ("auto", "platform", "default"):
        out["assets.image_default_model"] = image

    return out


def _serialize_lanes(lanes: dict[str, str]) -> str:
    return ";".join(
        f"{k}->{v}"
        for k, v in lanes.items()
        if k and v and k in ("fast", "standard", "reasoning", "else", "vision", "image")
    )


def sanitize_rules_for_openrouter_region(
    rules: dict[str, str] | None,
    *,
    platform_rules: dict[str, str] | None,
    country: str | None,
) -> dict[str, str]:
    """Replace OpenRouter lane models with Standard (platform) map when region blocks OR."""
    from services.geoip import is_openrouter_model_ref, openrouter_allowed_for_country

    out = dict(rules or {})
    if openrouter_allowed_for_country(country):
        return out
    plat = parse_model_lanes(platform_rules)
    lanes = parse_model_lanes(out)
    changed = False
    for key in ("fast", "standard", "reasoning", "else", "vision", "image"):
        mid = str(lanes.get(key) or "").strip()
        if not is_openrouter_model_ref(mid):
            continue
        fallback = (
            str(plat.get(key) or "").strip()
            or str(plat.get("standard") or "").strip()
            or str(plat.get("else") or "").strip()
            or mid
        )
        if fallback and fallback != mid:
            lanes[key] = fallback
            changed = True
    if changed:
        serialized = _serialize_lanes(lanes)
        out["precheck.model_threshold"] = serialized
        out["precheck.model_lanes"] = serialized
    vision = str(out.get("precheck.vision_model") or "").strip()
    if is_openrouter_model_ref(vision):
        out["precheck.vision_model"] = (
            str(plat.get("vision") or "").strip()
            or str(platform_rules or {}).get("precheck.vision_model")
            or str(plat.get("standard") or "").strip()
            or vision
        )
    image = str(out.get("assets.image_default_model") or "").strip()
    if is_openrouter_model_ref(image):
        out["assets.image_default_model"] = (
            str(plat.get("image") or "").strip()
            or str(platform_rules or {}).get("assets.image_default_model")
            or image
        )
    return out


def sanitize_model_ref_for_openrouter_region(
    model_ref: str | None,
    *,
    platform_rules: dict[str, str] | None,
    country: str | None,
) -> str:
    """Locked/BYOK OpenRouter picks fall back to platform standard lane when blocked."""
    from services.geoip import is_openrouter_model_ref, openrouter_allowed_for_country

    mid = str(model_ref or "").strip()
    if not mid or mid.lower() in ("auto", "platform", "default"):
        return mid or "auto"
    if openrouter_allowed_for_country(country) or not is_openrouter_model_ref(mid):
        return mid
    plat = parse_model_lanes(platform_rules)
    return (
        str(plat.get("standard") or "").strip()
        or str(plat.get("else") or "").strip()
        or "auto"
    )


def heuristic_route_lane(
    prompt: str,
    *,
    has_images: bool = False,
    canvas_node_count: int = 0,
    scene: str | None = None,
) -> ModelRouteDecision:
    """Deterministic fallback when the LLM router is unavailable.

    Uses only structural signals (images / length / node count / scene) —
    no prompt keyword lists. Content judgment belongs to the LLM router pack.
    """
    text = (prompt or "").strip()
    n = len(text)
    emptyish = canvas_node_count <= 2

    if has_images:
        return ModelRouteDecision(
            lane="vision",
            needs_image_gen=False,
            rationale="heuristic: has_images",
        )
    if emptyish and n >= 60:
        return ModelRouteDecision(
            lane="reasoning",
            needs_image_gen=False,
            rationale="heuristic: empty_canvas+long_prompt",
        )
    if n >= 220:
        return ModelRouteDecision(
            lane="reasoning",
            needs_image_gen=False,
            rationale="heuristic: long_prompt",
        )
    if n < 40 and canvas_node_count > 0:
        return ModelRouteDecision(
            lane="fast",
            needs_image_gen=False,
            rationale="heuristic: short_prompt+existing_nodes",
        )
    sc = (scene or "").strip().lower()
    if sc in ("website", "mobile") and n >= 80:
        return ModelRouteDecision(
            lane="reasoning",
            needs_image_gen=False,
            rationale="heuristic: scene+mid_prompt",
        )
    return ModelRouteDecision(
        lane="standard",
        needs_image_gen=False,
        rationale="heuristic: default_standard",
    )


def estimate_task_tier(
    prompt: str,
    *,
    rules: dict[str, str] | None = None,
    skill_category: str | None = None,
    scene: str | None = None,
    has_images: bool = False,
    canvas_node_count: int = 0,
) -> str:
    """Back-compat name → returns a lane id (fast|standard|reasoning|vision)."""
    del rules, skill_category
    return heuristic_route_lane(
        prompt,
        has_images=has_images,
        canvas_node_count=canvas_node_count,
        scene=scene,
    ).lane


def model_for_lane(
    lane: str,
    rules: dict[str, str] | None,
) -> str:
    lanes = parse_model_lanes(rules)
    key = normalize_lane(lane)
    if key == "vision":
        return (
            str((rules or {}).get("precheck.vision_model") or "").strip()
            or lanes.get("vision")
            or resolve_vision_model(rules)
        )
    return lanes.get(key) or lanes.get("else") or lanes.get("standard") or "deepseek-v4-flash"


def family_from_precheck(
    prompt: str,
    rules: dict[str, str] | None,
    *,
    skill_category: str | None = None,
    scene: str | None = None,
    has_images: bool = False,
    canvas_node_count: int = 0,
    route_lane: str | None = None,
) -> tuple[str | None, str]:
    """Return (model_ref, lane). Uses ``route_lane`` when provided (from LLM router)."""
    del skill_category
    if route_lane:
        lane = clamp_lane(route_lane, enabled_lanes(rules))
    else:
        lane = clamp_lane(
            heuristic_route_lane(
                prompt,
                has_images=has_images,
                canvas_node_count=canvas_node_count,
                scene=scene,
            ).lane,
            enabled_lanes(rules),
        )
    return model_for_lane(lane, rules), lane


def router_model_id(rules: dict[str, str] | None) -> str:
    """Cheap model for the LangChain structured router call."""
    raw = str((rules or {}).get("precheck.router_model") or "").strip()
    if raw:
        return raw
    lanes = parse_model_lanes(rules)
    return lanes.get("fast") or lanes.get("else") or "doubao-seed-2-1-turbo"


def _user_request_core(prompt: str) -> str:
    """Strip FE ``User request:`` wrapper so greetings are not mistaken for tasks."""
    p = (prompt or "").strip()
    m = re.search(r"(?is)\buser\s*request\s*:\s*(.*)\Z", p)
    if m:
        return (m.group(1) or "").strip()
    return p


def heuristic_user_intent(
    prompt: str,
    *,
    has_images: bool = False,
    canvas_node_count: int = 0,
) -> IntentClassifyDecision:
    """Fallback when the intent LLM is unavailable.

    Structural only (images / length / target blob) — no content keyword lists.
    Normal path uses ``agent.prompt.intent_classify`` + canvas tools catalog.
    """
    full = str(prompt or "")
    p = _user_request_core(full)
    compact = re.sub(r"\s+", "", p)
    has_target = "[Target element" in full or "Target element —" in full
    if has_images:
        return IntentClassifyDecision(
            intent="design",
            paint_lane="edit" if has_target else "create",
            reply="",
            rationale="heuristic_images",
        )
    if has_target:
        return IntentClassifyDecision(
            intent="canvas_op",
            paint_lane="edit",
            reply="",
            rationale="heuristic_target",
        )
    if len(compact) >= 4:
        return IntentClassifyDecision(
            intent="canvas_op",
            paint_lane="create",
            reply="",
            rationale="heuristic_task",
        )
    del canvas_node_count
    return IntentClassifyDecision(
        intent="chat", paint_lane="", reply="", rationale="heuristic_short"
    )


async def classify_user_intent(
    *,
    prompt: str,
    rules: dict[str, str] | None = None,
    has_images: bool = False,
    canvas_node_count: int = 0,
    scene: str | None = None,
    interaction_mode: str | None = None,
) -> IntentClassifyDecision:
    """Cheap structured intent gate. Falls back to ``heuristic_user_intent`` on error.

    Injects the live canvas tools catalog so the model judges canvas_op vs design
    against real capabilities.
    """
    fallback = heuristic_user_intent(
        prompt, has_images=has_images, canvas_node_count=canvas_node_count
    )
    mode = str(interaction_mode or "").strip().lower()
    try:
        from services.design.ops.tool_ops_contract import format_canvas_tools_catalog

        tools_catalog = format_canvas_tools_catalog(rules)
    except Exception:
        tools_catalog = ""
    user_blob = (
        f"scene={scene or 'unknown'}\n"
        f"has_images={bool(has_images)}\n"
        f"canvas_node_count={int(canvas_node_count)}\n"
        f"interaction_mode={mode or 'agent'}\n"
        f"{tools_catalog}\n\n"
        f"user_prompt:\n{(prompt or '').strip()[:4000]}"
    )
    try:
        from services.design.prompts.prompt_pack_store import render_prompt_body
        from services.llm.agent import ainvoke_structured

        system = render_prompt_body(_INTENT_SYSTEM_KEY, rules=rules)
        if not system:
            return fallback
        out = await ainvoke_structured(
            schema=IntentClassifyDecision,
            messages=[{"role": "user", "content": user_blob}],
            model=router_model_id(rules),
            system=system,
            source="intent_classify",
        )
        structured = out.get("structured")
        if isinstance(structured, IntentClassifyDecision):
            raw_intent = structured.intent
            raw_lane = structured.paint_lane
            rationale = structured.rationale
            reply = structured.reply
            raw_grade = None
        elif isinstance(structured, dict):
            raw_intent = structured.get("intent")
            raw_lane = structured.get("paint_lane") or structured.get("paintLane")
            raw_grade = structured.get("work_grade") or structured.get("workGrade")
            rationale = structured.get("rationale")
            reply = structured.get("reply")
        else:
            return fallback
        intent, lane = normalize_intent_decision(
            raw_intent, raw_lane, raw_grade=raw_grade
        )
        if intent not in USER_INTENTS:
            return fallback
        reply_s = str(reply or "").strip()
        if intent != "chat":
            reply_s = ""
        return IntentClassifyDecision(
            intent=intent,  # type: ignore[arg-type]
            paint_lane=lane if intent != "chat" else "",  # type: ignore[arg-type]
            reply=reply_s[:500],
            rationale=str(rationale or "").strip() or "llm_intent",
        )
    except Exception:
        return fallback


async def classify_model_route(
    *,
    prompt: str,
    rules: dict[str, str] | None = None,
    has_images: bool = False,
    canvas_node_count: int = 0,
    scene: str | None = None,
    interaction_mode: str | None = None,
) -> ModelRouteDecision:
    """LangChain structured router. Falls back to ``heuristic_route_lane`` on error."""
    fallback = heuristic_route_lane(
        prompt,
        has_images=has_images,
        canvas_node_count=canvas_node_count,
        scene=scene,
    )
    # Ask / no-paint UI mode: stay cheap unless images need understanding.
    mode = str(interaction_mode or "").strip().lower()
    if mode == "ask" and not has_images:
        return ModelRouteDecision(
            lane="fast",
            needs_image_gen=False,
            rationale="ask mode → fast",
        )

    user_blob = (
        f"scene={scene or 'unknown'}\n"
        f"has_images={bool(has_images)}\n"
        f"canvas_node_count={int(canvas_node_count)}\n"
        f"interaction_mode={mode or 'agent'}\n"
        f"user_prompt:\n{(prompt or '').strip()[:4000]}"
    )
    try:
        from services.design.prompts.rules_text import _rule_text
        from services.llm.agent import ainvoke_structured

        router_system = _rule_text(rules, _ROUTER_SYSTEM_KEY).strip()
        out = await ainvoke_structured(
            schema=ModelRouteDecision,
            messages=[{"role": "user", "content": user_blob}],
            model=router_model_id(rules),
            system=router_system,
            source="model_route",
        )
        structured = out.get("structured")
        if isinstance(structured, ModelRouteDecision):
            decision = structured
        elif isinstance(structured, dict):
            decision = ModelRouteDecision.model_validate(structured)
        else:
            return fallback
        lane = clamp_lane(decision.lane, enabled_lanes(rules))
        # Soft force vision when images present and classifier picked fast with long prompt.
        if has_images and lane == "fast" and len((prompt or "").strip()) >= 80:
            lane = "vision"
        return ModelRouteDecision(
            lane=lane,  # type: ignore[arg-type]
            needs_image_gen=bool(decision.needs_image_gen),
            rationale=(decision.rationale or "").strip() or "llm_router",
        )
    except Exception:
        return fallback


def resolve_model_for_skill(
    *,
    skill: dict[str, Any],
    user_selected_model: str | None,
    run_mode: str,
    is_premium: bool = False,
    prompt: str = "",
    rules: dict[str, str] | None = None,
    scene: str | None = None,
    attempt: int = 0,
    has_images: bool = False,
    canvas_node_count: int = 0,
    route_lane: str | None = None,
) -> tuple[str, str]:
    """Returns (model_ref, reason). Auto follows lane map; lock skips classifier."""
    del is_premium
    selected = normalize_model_ref(user_selected_model)
    skill_default = str(skill.get("default_model") or "doubao").strip().lower() or "doubao"

    def from_precheck(reason_prefix: str) -> tuple[str, str]:
        pre, lane = family_from_precheck(
            prompt,
            rules,
            scene=scene,
            has_images=has_images,
            canvas_node_count=canvas_node_count,
            route_lane=route_lane,
        )
        primary = pre or skill_default
        if primary in ("doubao", "deepseek", "glm", "kimi"):
            lanes = parse_model_lanes(rules)
            primary = (
                lanes.get("else")
                or lanes.get("standard")
                or lanes.get("reasoning")
                or (parse_fallback_chain(rules) or [primary])[0]
            )
        chosen = pick_fallback_model(primary, rules, attempt=attempt)
        reason = f"{reason_prefix}_{lane}"
        if attempt > 0 and chosen != primary:
            reason = f"{reason_prefix}_fallback_{lane}_attempt_{attempt}"
        if has_images and not _vision_ok(chosen):
            vision = resolve_vision_model(rules)
            return vision, f"{reason}+precheck_vision"
        if lane == "vision" and not _vision_ok(chosen):
            return resolve_vision_model(rules), f"{reason}+lane_vision"
        return chosen, reason

    if run_mode == "single_model":
        if _is_concrete(selected):
            if has_images and not _vision_ok(selected):
                return resolve_vision_model(rules), "user_single_model+precheck_vision"
            return selected, "user_single_model"
        if selected in ("doubao", "deepseek", "glm", "kimi", "auto") or not selected:
            return from_precheck("single_precheck")
        chosen, reason = skill_default, "single_model_fallback_default"
        if has_images and not _vision_ok(chosen):
            return resolve_vision_model(rules), f"{reason}+precheck_vision"
        return chosen, reason

    if run_mode == "partial":
        if _is_concrete(selected):
            if has_images and not _vision_ok(selected):
                return resolve_vision_model(rules), "user_partial_priority+precheck_vision"
            return selected, "user_partial_priority"
        return from_precheck("partial_precheck")

    if selected in ("auto", "doubao", "deepseek", "glm", "kimi") or not selected:
        return from_precheck("precheck_lane")

    if _is_concrete(selected):
        if has_images and not _vision_ok(selected):
            return resolve_vision_model(rules), "user_locked+precheck_vision"
        return selected, "user_locked"

    return from_precheck("precheck_lane")


def to_endpoint_model_id(model_ref: str) -> str:
    ref = str(model_ref or "").strip().lower()
    if ref == "deepseek":
        return "deepseek-v4-pro"
    if ref == "doubao":
        return "doubao-seed-2-1-turbo"
    if ref == "glm":
        return "deepseek-v4-flash"
    if ref == "kimi":
        return "deepseek-v4-pro"
    if ref:
        return ref
    return "doubao-seed-2-1-turbo"
