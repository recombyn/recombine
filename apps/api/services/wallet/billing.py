"""Wallet billing — unified 积分 (credits) for chat + images.

Conversions:
  - LLM:  billed_tokens = ceil(provider_tokens × markup)
          credits = ceil(billed_tokens / TOKENS_PER_CREDIT)   (0 if no usage)
  - Image: credits = ceil(price_cny × credits_per_cny × markup)
           credits_per_cny aligns with Plus list (¥29 → 200 积分 face value)

Rules (design_global_rule):
  - billing.token_markup  default 1.2
"""

from __future__ import annotations

import math
from typing import Any

from services.wallet.db import credit_tokens, spend_tokens

DEFAULT_MARKUP = 1.2
RULE_MARKUP = "billing.token_markup"

# How many billed LLM tokens equal 1 wallet 积分 (Plus: 3M Token ≈ 200 积分 share).
TOKENS_PER_CREDIT = 15_000

# Plus list price — ¥29 → 200 积分（1 积分 ≈ ¥0.145，避免单张出图显示几十积分）.
PLUS_LIST_PRICE_CNY = 29.0
PLUS_IMAGE_FACE_CREDITS = 200
# Fallback when catalog has no image price (~¥0.25 → ~2 积分).
DEFAULT_IMAGE_CREDITS = 2


def _as_float(raw: Any, default: float) -> float:
    try:
        n = float(str(raw or "").strip().split()[0])
        return n if math.isfinite(n) and n > 0 else default
    except (TypeError, ValueError, IndexError):
        return default


def parse_price_amount(raw: Any) -> float | None:
    """Leading number from catalog price (e.g. '0.25' or '0.25 元/张')."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        n = float(s.split()[0])
    except (TypeError, ValueError, IndexError):
        return None
    return n if math.isfinite(n) and n >= 0 else None


def load_billing_markup(rules: dict[str, Any] | None = None) -> float:
    """Return credit markup multiplier (>= 1)."""
    src = rules or {}
    if not src:
        try:
            from services.design.admin.admin_store import list_global_rules

            src = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
        except Exception:
            src = {}
    return _as_float(src.get(RULE_MARKUP), DEFAULT_MARKUP)


def load_billing_settings(rules: dict[str, Any] | None = None) -> tuple[float, float]:
    """Return (markup, unused_legacy). Second value kept for call-site compatibility."""
    return load_billing_markup(rules), 1.0


def credits_per_cny() -> float:
    """How many 积分 equal ¥1, from Plus face (¥29 → 200 积分)."""
    return float(PLUS_IMAGE_FACE_CREDITS) / PLUS_LIST_PRICE_CNY


def tokens_to_credits(billed_tokens: int) -> int:
    """Convert billed LLM tokens (after markup) into wallet 积分."""
    n = max(0, int(billed_tokens or 0))
    if n <= 0:
        return 0
    return max(1, int(math.ceil(n / float(TOKENS_PER_CREDIT))))


def charge_from_llm_tokens(
    actual_tokens: int,
    *,
    rules: dict[str, Any] | None = None,
    markup: float | None = None,
) -> int:
    """Convert provider LLM token usage into wallet 积分."""
    tokens = max(0, int(actual_tokens or 0))
    if tokens <= 0:
        return 0
    m = float(markup) if markup is not None else load_billing_markup(rules)
    if not math.isfinite(m) or m <= 0:
        m = DEFAULT_MARKUP
    billed = max(1, int(math.ceil(tokens * m)))
    return tokens_to_credits(billed)


def charge_from_image_cny(
    price_cny: float,
    *,
    count: int = 1,
    rules: dict[str, Any] | None = None,
    markup: float | None = None,
) -> int:
    """Convert vendor CNY/image × count into wallet 积分 (with markup)."""
    n = max(1, int(count or 1))
    cny = float(price_cny or 0) * n
    if not math.isfinite(cny) or cny <= 0:
        return max(1, DEFAULT_IMAGE_CREDITS * n)
    m = float(markup) if markup is not None else load_billing_markup(rules)
    if not math.isfinite(m) or m <= 0:
        m = DEFAULT_MARKUP
    return max(1, int(math.ceil(cny * credits_per_cny() * m)))


def image_model_credit_cost(
    model_id: str | None,
    *,
    count: int = 1,
    resolution: str | None = None,
    rules: dict[str, Any] | None = None,
) -> int:
    """Look up image catalog price (元/张, resolution-aware) → wallet 积分."""
    mid = (model_id or "").strip()
    price_cny: float | None = None
    if mid:
        try:
            from services.llm import list_image_models
            from services.llm.image_price import resolve_image_unit_cny

            for m in list_image_models():
                if str(m.get("id") or "") == mid:
                    meta = m.get("priceMeta") or m.get("price_meta")
                    price_cny = resolve_image_unit_cny(
                        price=m.get("price"),
                        price_meta=meta if isinstance(meta, dict) else None,
                        resolution=resolution,
                        provider=str(m.get("provider") or ""),
                    )
                    break
        except Exception:
            price_cny = None
    if price_cny is None or price_cny <= 0:
        return max(1, DEFAULT_IMAGE_CREDITS * max(1, int(count or 1)))
    return charge_from_image_cny(price_cny, count=count, rules=rules)


def settle_token_hold(
    user_id: str,
    *,
    hold: int,
    actual_tokens: int,
    detail: str,
    rules: dict[str, Any] | None = None,
    extra_credits: int = 0,
) -> int:
    """
    After a run: adjust unified 积分 hold to match LLM + image charges.
    ``hold`` was already spent. Returns total 积分 charged (LLM + image).
    """
    hold_n = max(0, int(hold or 0))
    charged_llm = charge_from_llm_tokens(actual_tokens, rules=rules)
    extra_img = max(0, int(extra_credits or 0))
    total = charged_llm + extra_img
    uid = (user_id or "").strip()
    if not uid or hold_n <= 0:
        if uid and total > 0 and hold_n <= 0:
            try:
                spend_tokens(uid, total, detail=f"{(detail or 'design').strip()[:200]}:charge")
            except ValueError:
                pass
        return total

    note = (detail or "design_settle").strip()[:400]
    if total < hold_n:
        refund = hold_n - total
        try:
            credit_tokens(uid, refund, detail=f"{note}:refund:{refund}")
        except Exception:
            pass
    elif total > hold_n:
        extra = total - hold_n
        try:
            spend_tokens(uid, extra, detail=f"{note}:extra:{extra}")
        except ValueError:
            total = hold_n
    return total
