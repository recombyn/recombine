"""Model routing for design pipeline.

Mainstream-style router (not just prompt length):
  1) Score task tier from length + keywords + skill category bumps
  2) Map tier -> model via precheck.model_threshold (per-tier matrix)
  3) Optional fallback_chain for retries / degrade
  4) precheck.vision_model when multimodal images are attached
"""

from __future__ import annotations

import re
from typing import Any


STRUCTURE_CATEGORIES = {"plan", "layout", "element", "color"}
ADVANCED_CATEGORIES = {"validate", "render", "refine", "typography"}


def _split_list(raw: str, seps: str = "|;,") -> list[str]:
    if not raw:
        return []
    parts = re.split(f"[{re.escape(seps)}]+", raw)
    return [p.strip() for p in parts if p.strip()]


def parse_tier_thresholds(rules: dict[str, str] | None) -> tuple[int, int]:
    medium_min, complex_min = 80, 280
    raw = str((rules or {}).get("precheck.tier_thresholds") or "").strip()
    for part in raw.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k, v = k.strip().lower(), v.strip()
        try:
            n = int(v)
        except ValueError:
            continue
        if k in ("medium_min", "medium"):
            medium_min = max(1, n)
        elif k in ("complex_min", "complex"):
            complex_min = max(medium_min + 1, n)
    return medium_min, complex_min


def parse_model_routes(rules: dict[str, str] | None) -> dict[str, str]:
    raw = str((rules or {}).get("precheck.model_threshold") or "").strip()
    out: dict[str, str] = {}
    if not raw:
        return out
    for part in raw.split(";"):
        part = part.strip()
        if not part or "->" not in part:
            continue
        left, right = part.split("->", 1)
        left, right = left.strip().lower(), right.strip()
        if left and right:
            out[left] = right
    if "else" in out:
        for tier in ("simple", "medium"):
            out.setdefault(tier, out["else"])
    return out


def parse_fallback_chain(rules: dict[str, str] | None) -> list[str]:
    raw = str((rules or {}).get("precheck.fallback_chain") or "").strip()
    if not raw:
        routes = parse_model_routes(rules)
        chain: list[str] = []
        for k in ("complex", "medium", "else", "simple"):
            m = routes.get(k)
            if m and m not in chain:
                chain.append(m)
        return chain
    return _split_list(raw, "|;,")


def _keyword_hits(prompt: str, pattern: str) -> int:
    if not pattern or not prompt:
        return 0
    try:
        return len(re.findall(pattern, prompt, flags=re.I))
    except re.error:
        return 0


def _default_complex_kw() -> str:
    # Chinese + English banks (unicode escapes keep file ASCII-safe)
    return (
        "\u591a\u753b\u677f|\u6574\u9875|\u54c1\u724c\u7cfb\u7edf|design system|dashboard|"
        "\u6570\u636e\u770b\u677f|\u7ec4\u4ef6\u5e93|\u8bbe\u8ba1\u89c4\u8303|\u54cd\u5e94\u5f0f|"
        "\u591a\u7aef|\u65e0\u969c\u788d|\u5370\u5237|\u51fa\u8840|\u4e13\u8272|\u590d\u6742\u4ea4\u4e92|"
        "\u5b8c\u6574\u540e\u53f0|\u591a\u9875\u9762"
    )


def _default_medium_kw() -> str:
    return (
        "\u6d77\u62a5|banner|\u914d\u8272|\u56fe\u6807\u7ec4|\u63d2\u753b\u7ec4|\u767b\u5f55\u9875|"
        "\u843d\u5730\u9875|landing|\u5361\u7247|\u6a21\u5757|\u7248\u5f0f|\u6807\u9898\u5c42\u7ea7|"
        "\u4e3b\u89c6\u89c9|\u4fc3\u9500"
    )


def estimate_task_tier(
    prompt: str,
    *,
    rules: dict[str, str] | None = None,
    skill_category: str | None = None,
    scene: str | None = None,
) -> str:
    """Multi-signal tier: length + keywords + category/scene bumps."""
    text = (prompt or "").strip()
    n = len(text)
    medium_min, complex_min = parse_tier_thresholds(rules)
    score = 0

    if n >= complex_min:
        score += 2
    elif n >= medium_min:
        score += 1

    complex_kw = (rules or {}).get("precheck.complex_keywords") or _default_complex_kw()
    medium_kw = (rules or {}).get("precheck.medium_keywords") or _default_medium_kw()
    c_hits = _keyword_hits(text, complex_kw)
    m_hits = _keyword_hits(text, medium_kw)
    if c_hits >= 2:
        score += 2
    elif c_hits == 1:
        score += 1
    if m_hits >= 2 and score < 2:
        score += 1

    cat = (skill_category or "").strip().lower()
    if cat in ADVANCED_CATEGORIES:
        score += 1
    if cat in ("validate", "refine"):
        score += 1

    sc = (scene or "").strip().lower()
    if sc in ("website", "mobile") and n >= medium_min:
        score += 1

    if score >= 3:
        return "complex"
    if score >= 1:
        return "medium"
    return "simple"


def clamp_tier(tier: str, enabled: list[str] | None) -> str:
    t = (tier or "simple").lower()
    if not enabled:
        return t
    enabled_l = [x.lower() for x in enabled]
    if t in enabled_l:
        return t
    order = ["complex", "medium", "simple"]
    try:
        idx = order.index(t)
    except ValueError:
        idx = 2
    for cand in order[idx:]:
        if cand in enabled_l:
            return cand
    return enabled_l[-1]


def enabled_tiers(rules: dict[str, str] | None) -> list[str]:
    raw = str((rules or {}).get("precheck.task_tiers") or "simple|medium|complex").strip()
    tiers = [x.lower() for x in _split_list(raw, "|;,")]
    return tiers or ["simple", "medium", "complex"]


def family_from_precheck(
    prompt: str,
    rules: dict[str, str] | None,
    *,
    skill_category: str | None = None,
    scene: str | None = None,
) -> tuple[str | None, str]:
    """Return (model_ref, tier)."""
    routes = parse_model_routes(rules)
    tier = estimate_task_tier(
        prompt, rules=rules, skill_category=skill_category, scene=scene
    )
    tier = clamp_tier(tier, enabled_tiers(rules))
    if not routes:
        return None, tier
    model = routes.get(tier) or routes.get("else")
    return model, tier


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
    s = str(selected if selected is not None else "auto").strip().lower()
    if not s or s == "auto":
        return "auto"
    # Legacy family aliases — keep as aliases; concrete routing happens in resolve.
    if s in ("doubao-seed", "doubao-pro"):
        return "doubao"
    if s in ("deepseek-chat", "deepseek-reasoner"):
        return "deepseek"
    return s


def _is_concrete(ref: str) -> bool:
    return ref not in ("doubao", "deepseek", "auto", "glm", "kimi") and bool(ref)


# Catalog ids that accept multimodal image_url (Ark Seed 2.1 Pro / Turbo).
# Official Ark example uses doubao-seed-2-1-turbo-260628 with image_url.
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
    ref = str(model_ref or "").strip().lower()
    if not ref or "seedream" in ref:
        return False
    # Seed 2.0 Mini / flash / text-only — never treat as vision.
    if "mini" in ref or "flash" in ref:
        return False
    if ref in _VISION_MODEL_IDS:
        return True
    return any(m in ref for m in _VISION_MODEL_MARKERS)


def _vision_ok(model_ref: str | None) -> bool:
    """Reload-safe wrapper — never bind the public name as a local."""
    return model_supports_vision(model_ref)


def resolve_vision_model(rules: dict[str, str] | None) -> str:
    """Pick vision chat model from precheck rules (not a hardcoded constant)."""
    candidates: list[str] = []
    raw = str((rules or {}).get("precheck.vision_model") or "").strip()
    if raw:
        candidates.append(raw)
    candidates.extend(parse_fallback_chain(rules))
    candidates.extend(parse_model_routes(rules).values())
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
) -> tuple[str, str | None]:
    """
    If images are attached and model cannot see them, switch via precheck.vision_model.
    Returns (model_ref, override_reason_or_none).
    """
    if not has_images:
        return model_ref, None
    if _vision_ok(model_ref):
        return model_ref, None
    vision = (prefer or "").strip()
    if not _vision_ok(vision):
        vision = resolve_vision_model(rules)
    if not _vision_ok(vision):
        vision = _DEFAULT_VISION_FALLBACK
    if vision == model_ref:
        return model_ref, None
    return vision, f"precheck_vision_from_{normalize_model_ref(model_ref)}"


def apply_user_route_overrides(
    rules: dict[str, str] | None,
    overrides: dict[str, Any] | None,
) -> dict[str, str]:
    """
    Merge end-user Auto routing prefs into a copy of platform rules.

    Allowed keys only: simple / medium / complex / vision / image.
    Never accept fallback_chain, retry, keywords, thresholds, or blocks from clients.
    """
    out = dict(rules or {})
    if not overrides or not isinstance(overrides, dict):
        return out

    routes = parse_model_routes(out)
    for tier in ("simple", "medium", "complex"):
        raw = overrides.get(tier)
        mid = str(raw or "").strip()
        if mid and mid.lower() not in ("auto", "platform", "default"):
            routes[tier] = mid
    if routes:
        # Preserve else if present; otherwise derive from medium/complex.
        if "else" not in routes:
            routes["else"] = (
                routes.get("medium")
                or routes.get("complex")
                or routes.get("simple")
                or resolve_vision_model(out)
            )
        out["precheck.model_threshold"] = ";".join(
            f"{k}->{v}" for k, v in routes.items() if k and v
        )

    vision = str(
        overrides.get("vision")
        or overrides.get("vision_model")
        or ""
    ).strip()
    if vision and vision.lower() not in ("auto", "platform", "default"):
        out["precheck.vision_model"] = vision

    image = str(
        overrides.get("image")
        or overrides.get("image_default_model")
        or ""
    ).strip()
    if image and image.lower() not in ("auto", "platform", "default"):
        out["assets.image_default_model"] = image

    return out


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
) -> tuple[str, str]:
    """Returns (model_ref, reason). Auto mode always follows precheck routes."""
    selected = normalize_model_ref(user_selected_model)
    category = str(skill.get("category") or "")
    skill_default = str(skill.get("default_model") or "doubao").strip().lower() or "doubao"

    def from_precheck(reason_prefix: str) -> tuple[str, str]:
        pre, tier = family_from_precheck(
            prompt, rules, skill_category=category, scene=scene
        )
        primary = pre or skill_default
        if primary in ("doubao", "deepseek", "glm", "kimi"):
            # Expand family alias via routes.else / complex / fallback head.
            routes = parse_model_routes(rules)
            primary = (
                routes.get("else")
                or routes.get("medium")
                or routes.get("complex")
                or (parse_fallback_chain(rules) or [primary])[0]
            )
        chosen = pick_fallback_model(primary, rules, attempt=attempt)
        reason = f"{reason_prefix}_{tier}"
        if attempt > 0 and chosen != primary:
            reason = f"{reason_prefix}_fallback_{tier}_attempt_{attempt}"
        if has_images and not _vision_ok(chosen):
            vision = resolve_vision_model(rules)
            return vision, f"{reason}+precheck_vision"
        return chosen, reason

    if run_mode == "single_model":
        if _is_concrete(selected):
            chosen = selected
            reason = "user_single_model"
        elif selected in ("doubao", "deepseek", "glm", "kimi", "auto") or not selected:
            return from_precheck("single_precheck")
        else:
            chosen, reason = skill_default, "single_model_fallback_default"
        if has_images and not _vision_ok(chosen):
            return resolve_vision_model(rules), f"{reason}+precheck_vision"
        return chosen, reason

    if run_mode == "partial":
        if _is_concrete(selected):
            chosen, reason = selected, "user_partial_priority"
        else:
            return from_precheck("partial_precheck")
        if has_images and not _vision_ok(chosen):
            return resolve_vision_model(rules), f"{reason}+precheck_vision"
        return chosen, reason

    # Agent / default: Auto and family aliases → precheck matrix (never hardcode one model).
    if selected in ("auto", "doubao", "deepseek", "glm", "kimi") or not selected:
        return from_precheck("precheck_tier")

    # User locked a concrete catalog id — respect it (vision gate may still switch).
    if _is_concrete(selected):
        if has_images and not _vision_ok(selected):
            return resolve_vision_model(rules), "user_locked+precheck_vision"
        return selected, "user_locked"

    return from_precheck("precheck_tier")


def to_endpoint_model_id(model_ref: str) -> str:
    ref = str(model_ref or "").strip().lower()
    if ref == "deepseek":
        return "deepseek-v4-pro"
    if ref == "doubao":
        return "doubao-seed-2-1-turbo"
    if ref == "glm":
        return "glm-5-2"
    if ref == "kimi":
        return "kimi-k2-thinking"
    if ref:
        return ref
    return "doubao-seed-2-1-turbo"
