"""LLM usage → wallet credits (积分), with admin-configurable markup (差价).

Wallet balances stay in integer credits. After each design/LLM run we convert
provider ``total_tokens`` into credits:

    billable = actual_tokens × markup
    credits  = ceil(billable / tokens_per_credit)   # 0 if no LLM tokens

Rules (design_global_rule):
  - billing.token_markup       default 1.2  — user pays 20% more than raw usage
  - billing.tokens_per_credit  default 1000 — API tokens per 1 credit (pre-markup)
"""

from __future__ import annotations

import math
from typing import Any

from services.wallet.db import credit_tokens, spend_tokens

DEFAULT_MARKUP = 1.2
DEFAULT_TOKENS_PER_CREDIT = 1000.0

RULE_MARKUP = "billing.token_markup"
RULE_TOKENS_PER_CREDIT = "billing.tokens_per_credit"


def _as_float(raw: Any, default: float) -> float:
    try:
        n = float(str(raw or "").strip().split()[0])
        return n if math.isfinite(n) and n > 0 else default
    except (TypeError, ValueError, IndexError):
        return default


def load_billing_settings(rules: dict[str, Any] | None = None) -> tuple[float, float]:
    """Return (markup, tokens_per_credit)."""
    src = rules or {}
    if not src:
        try:
            from services.design.admin_store import list_global_rules

            src = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
        except Exception:
            src = {}
    markup = _as_float(src.get(RULE_MARKUP), DEFAULT_MARKUP)
    tpc = _as_float(src.get(RULE_TOKENS_PER_CREDIT), DEFAULT_TOKENS_PER_CREDIT)
    return markup, tpc


def credits_from_llm_tokens(
    actual_tokens: int,
    *,
    rules: dict[str, Any] | None = None,
    markup: float | None = None,
    tokens_per_credit: float | None = None,
) -> int:
    """
    Convert provider token usage into wallet credits.
    Returns 0 when there was no LLM usage (do not charge blank / non-LLM paths).
    """
    tokens = max(0, int(actual_tokens or 0))
    if tokens <= 0:
        return 0
    if markup is None or tokens_per_credit is None:
        m, tpc = load_billing_settings(rules)
        if markup is None:
            markup = m
        if tokens_per_credit is None:
            tokens_per_credit = tpc
    assert markup is not None and tokens_per_credit is not None
    billable = tokens * float(markup)
    credits = int(math.ceil(billable / float(tokens_per_credit)))
    return max(1, credits)


def settle_token_hold(
    user_id: str,
    *,
    hold: int,
    actual_tokens: int,
    detail: str,
    rules: dict[str, Any] | None = None,
) -> int:
    """
    After a run: adjust wallet so net spend equals ``credits_from_llm_tokens``.
    ``hold`` was already spent upfront. Returns final charged credits.
    """
    hold_n = max(0, int(hold or 0))
    charged = credits_from_llm_tokens(actual_tokens, rules=rules)
    uid = (user_id or "").strip()
    if not uid or hold_n <= 0:
        return charged

    note = (detail or "design_settle").strip()[:400]
    if charged < hold_n:
        refund = hold_n - charged
        try:
            credit_tokens(uid, refund, detail=f"{note}:refund:{refund}")
        except Exception:
            pass
        return charged
    if charged > hold_n:
        extra = charged - hold_n
        try:
            spend_tokens(uid, extra, detail=f"{note}:extra:{extra}")
            return charged
        except ValueError:
            # Cannot collect overage — keep the reservation as the charge.
            return hold_n
    return hold_n
