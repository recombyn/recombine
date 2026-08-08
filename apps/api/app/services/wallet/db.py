"""Wallet balances / ledger — unified 积分 stored in ``tokens`` column.

Legacy ``image_credits`` is migrated into ``tokens`` once
(``wallet_unified_credits_v1``), then kept at 0. API still exposes
``credits`` / ``tokens`` / ``imageCredits`` (aliases of the same balance).
"""

from __future__ import annotations

from typing import Any

from app.services.db import init_schema

_UNIFIED_MIGRATION_ID = "wallet_unified_credits_v1"
_SCALE_X10_MIGRATION_ID = "wallet_credits_scale_x10_v1"
# Historical: used only by the first unified migration (legacy Token → 积分).
_LEGACY_TOKENS_PER_CREDIT = 30_000
_unified_ready = False
_scale_x10_ready = False


def init_wallet_db() -> None:
    init_schema()
    ensure_unified_credits_migration()
    ensure_credits_scale_x10_migration()


def ensure_unified_credits_migration() -> None:
    """One-shot: tokens(旧 Token) / 30000 + image_credits → 统一积分 in tokens."""
    global _unified_ready
    if _unified_ready:
        return
    init_schema()
    import time
    from math import ceil

    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    now = time.time()
    with Session(engine) as session:
        try:
            crud.ensure_app_migrations_table(session=session)
        except Exception:
            pass
        if crud.app_migration_applied(
            session=session, migration_id=_UNIFIED_MIGRATION_ID
        ):
            _unified_ready = True
            return
        for r in crud.list_all_user_balances(session=session):
            uid = str(r.user_id or "")
            if not uid:
                continue
            old_tok = int(r.tokens or 0)
            old_img = int(r.image_credits or 0)
            # Large ``tokens`` = legacy LLM units; small = already 积分-sized.
            if old_tok >= _LEGACY_TOKENS_PER_CREDIT:
                merged = int(ceil(old_tok / float(_LEGACY_TOKENS_PER_CREDIT))) + old_img
            else:
                merged = old_tok + old_img
            r.tokens = max(0, merged)
            r.image_credits = 0
            r.updated_at = now
            session.add(r)
        crud.mark_app_migration(
            session=session,
            migration_id=_UNIFIED_MIGRATION_ID,
            applied_at=now,
            commit=False,
        )
        session.commit()
    _unified_ready = True


def ensure_credits_scale_x10_migration() -> None:
    """One-shot: multiply wallet balances ×10 to match the new display scale."""
    global _scale_x10_ready
    if _scale_x10_ready:
        return
    ensure_unified_credits_migration()
    import time

    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    now = time.time()
    with Session(engine) as session:
        try:
            crud.ensure_app_migrations_table(session=session)
        except Exception:
            pass
        if crud.app_migration_applied(
            session=session, migration_id=_SCALE_X10_MIGRATION_ID
        ):
            _scale_x10_ready = True
            return
        crud.scale_positive_user_balances(
            session=session, factor=10, updated_at=now
        )
        crud.mark_app_migration(
            session=session,
            migration_id=_SCALE_X10_MIGRATION_ID,
            applied_at=now,
            commit=False,
        )
        session.commit()
    _scale_x10_ready = True


__all__ = [
    "init_wallet_db",
    "ensure_unified_credits_migration",
    "ensure_user_balance",
    "get_user_tokens",
    "get_user_image_credits",
    "get_user_plan",
    "get_wallet",
    "list_ledger",
    "list_ledger_page",
    "spend_tokens",
    "credit_tokens",
    "spend_image_credits",
    "is_wallet_billing_enabled",
    "FREE_DAILY_LIMIT",
    "free_daily_remaining",
    "consume_free_daily_quota",
]


def is_wallet_billing_enabled() -> bool:
    """Master switch for platform credit holds / charges.

    - Default / ``WALLET_BILLING_ENABLED=false`` → off (self-host)
    - Desktop local auto-login → always off (BYOK / no cloud wallet)
    - Cloud / SaaS → set ``WALLET_BILLING_ENABLED=true``
    """
    from app.core.config import is_desktop_local, settings

    if is_desktop_local():
        return False
    return bool(getattr(settings, "wallet_billing_enabled", False))



def ensure_user_balance(user_id: str, *, starting_tokens: int = 0) -> int:
    """Ensure a wallet row exists; return current unified 积分."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    ensure_unified_credits_migration()
    uid = (user_id or "").strip()
    if not uid:
        return 0
    with Session(engine) as session:
        row = crud.ensure_user_balance_row(
            session=session, user_id=uid, starting_tokens=starting_tokens
        )
        return int(row.tokens or 0)


def get_wallet(user_id: str) -> dict[str, Any]:
    """Unified 积分 + plan. ``tokens`` / ``imageCredits`` / ``credits`` are the same balance."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    uid = (user_id or "").strip()
    billing = is_wallet_billing_enabled()
    if not uid:
        return {
            "credits": 0,
            "tokens": 0,
            "imageCredits": 0,
            "planId": "free",
            "planExpiresAt": None,
            "planLocked": False,
            "billingEnabled": billing,
        }
    import time

    ensure_unified_credits_migration()
    now = time.time()
    with Session(engine) as session:
        row = crud.ensure_user_balance_row(session=session, user_id=uid, starting_tokens=0)
        credits = int(row.tokens or 0)
        stored = _normalize_plan(row.plan_id)
        expires_at = float(row.plan_expires_at) if row.plan_expires_at is not None else None
    active = _plan_active(stored, expires_at, now=now)
    effective = stored if (stored == "free" or active) else "free"

    return {
        "credits": credits,
        "tokens": credits,
        "imageCredits": credits,
        "planId": effective,
        "planStored": stored,
        "planExpiresAt": expires_at,
        "planLocked": active,
        "billingEnabled": billing,
    }



def get_user_tokens(user_id: str) -> int:
    """Unified 积分 balance (column name ``tokens`` is historical)."""
    return ensure_user_balance(user_id, starting_tokens=0)


def normalize_plan(raw: Any) -> str:
    pid = str(raw or "free").strip().lower()
    if pid in ("free", "plus", "pro", "ultra"):
        return pid
    return "free"


# Back-compat alias for internal callers.
_normalize_plan = normalize_plan


def plan_is_active(plan_id: str, expires_at: float | None, *, now: float | None = None) -> bool:
    """Paid plan is active only while plan_expires_at is in the future."""
    pid = normalize_plan(plan_id)
    if pid == "free" or expires_at is None:
        return False
    t = float(now if now is not None else __import__("time").time())
    return float(expires_at) > t


_plan_active = plan_is_active


def get_user_plan(user_id: str) -> str:
    """Effective membership plan (expired paid → free)."""
    snap = get_wallet(user_id)
    return str(snap.get("planId") or "free")


# Free users with empty balance: 1 design run / calendar day (UTC date in ledger detail).
FREE_DAILY_LIMIT = 1


def free_daily_remaining(user_id: str, *, limit: int = FREE_DAILY_LIMIT) -> int:
    """How many free daily design runs are left today (does not consume)."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    init_schema()
    uid = (user_id or "").strip()
    lim = max(1, int(limit or FREE_DAILY_LIMIT))
    if not uid:
        return 0
    import time

    day = time.strftime("%Y-%m-%d", time.gmtime(time.time()))
    prefix = f"free_daily:{day}"
    with Session(engine) as session:
        used = crud.count_wallet_ledger_detail_prefix(
            session=session, user_id=uid, detail_prefix=prefix
        )
    return max(0, lim - used)


def consume_free_daily_quota(user_id: str, *, limit: int = FREE_DAILY_LIMIT) -> bool:
    """
    Atomically reserve today's free design run.
    Returns True if reserved; False if the daily quota is already used.
    Writes a zero-amount ledger marker (does not change balance).
    """
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine
    from app.models import UserBalance

    init_schema()
    uid = (user_id or "").strip()
    lim = max(1, int(limit or FREE_DAILY_LIMIT))
    if not uid:
        return False
    import time

    now = time.time()
    day = time.strftime("%Y-%m-%d", time.gmtime(now))
    prefix = f"free_daily:{day}"
    with Session(engine) as session:
        used = crud.count_wallet_ledger_detail_prefix(
            session=session, user_id=uid, detail_prefix=prefix
        )
        if used >= lim:
            return False
        bal = crud.get_user_balance(session=session, user_id=uid)
        if not bal:
            bal = UserBalance(
                user_id=uid,
                tokens=0,
                image_credits=0,
                plan_id="free",
                plan_expires_at=None,
                updated_at=now,
            )
            session.add(bal)
            session.flush()
        crud.add_wallet_ledger(
            session=session,
            user_id=uid,
            kind="spend",
            amount=0,
            balance_after=int(bal.tokens or 0),
            detail=f"{prefix}:run",
            commit=False,
        )
        session.commit()
    return True


def spend_tokens(
    user_id: str,
    amount: int,
    detail: str = "",
    *,
    force: bool = False,
) -> int:
    """Deduct unified 积分; write ledger kind=spend. Raises ValueError if insufficient.

    When wallet billing is off, this is a no-op (returns current balance) unless
    ``force=True`` (admin adjustments).
    """
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine
    from app.models import UserBalance

    ensure_unified_credits_migration()
    uid = (user_id or "").strip()
    amt = int(amount)
    if not uid:
        raise ValueError("user_id required")
    if amt <= 0:
        raise ValueError("amount must be > 0")
    if not force and not is_wallet_billing_enabled():
        return int(get_user_tokens(uid) or 0)
    import time

    now = time.time()
    note = (detail or "").strip()[:500]
    with Session(engine) as session:
        row = crud.get_user_balance_for_update(session=session, user_id=uid)
        prev = int(row.tokens) if row else 0
        if prev < amt:
            raise ValueError("insufficient_tokens")
        next_bal = prev - amt
        if row:
            if int(row.tokens) < amt:
                raise ValueError("insufficient_tokens")
            row.tokens = next_bal
            row.image_credits = 0
            row.updated_at = now
            session.add(row)
        else:
            session.add(
                UserBalance(
                    user_id=uid,
                    tokens=next_bal,
                    image_credits=0,
                    plan_id="free",
                    updated_at=now,
                )
            )
        crud.add_wallet_ledger(
            session=session,
            user_id=uid,
            kind="spend",
            amount=-amt,
            balance_after=next_bal,
            detail=note,
        )
        session.commit()
    return next_bal


def credit_tokens(user_id: str, amount: int, detail: str = "") -> int:
    """Add unified 积分; write ledger kind=recharge."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine
    from app.models import UserBalance

    ensure_unified_credits_migration()
    uid = (user_id or "").strip()
    amt = int(amount)
    if not uid:
        raise ValueError("user_id required")
    if amt <= 0:
        raise ValueError("amount must be > 0")
    import time

    now = time.time()
    note = (detail or "").strip()[:500]
    with Session(engine) as session:
        row = crud.get_user_balance_for_update(session=session, user_id=uid)
        prev = int(row.tokens) if row else 0
        next_bal = prev + amt
        if row:
            row.tokens = next_bal
            row.image_credits = 0
            row.updated_at = now
            session.add(row)
        else:
            session.add(
                UserBalance(
                    user_id=uid,
                    tokens=next_bal,
                    image_credits=0,
                    plan_id="free",
                    updated_at=now,
                )
            )
        crud.add_wallet_ledger(
            session=session,
            user_id=uid,
            kind="recharge",
            amount=amt,
            balance_after=next_bal,
            detail=note,
        )
        session.commit()
    return next_bal


def get_user_image_credits(user_id: str) -> int:
    """Alias of unified 积分 (legacy name)."""
    return get_user_tokens(user_id)


def spend_image_credits(user_id: str, amount: int, detail: str = "") -> int:
    """Alias: deduct unified 积分 (maps insufficient_image_credits → same raise)."""
    try:
        return spend_tokens(user_id, amount, detail=detail or "AI image")
    except ValueError as e:
        if str(e) == "insufficient_tokens":
            raise ValueError("insufficient_image_credits") from e
        raise


def list_ledger(user_id: str, limit: int = 100) -> list[dict[str, Any]]:
    """Legacy helper — returns a flat list (used after redeem)."""
    page = list_ledger_page(user_id, page=1, page_size=limit, kind="all")
    return page["items"]


def list_ledger_page(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    kind: str = "all",
) -> dict[str, Any]:
    """
    Paginated ledger.
    kind: all | redeem | spend (also accepts recharge/plan as spend-side filters if present)
    """
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n
    kind_n = (kind or "all").strip().lower()
    if kind_n not in ("all", "redeem", "spend", "recharge", "plan"):
        kind_n = "all"

    kinds: list[str] | None = None
    if kind_n == "redeem":
        kinds = ["redeem", "plan"]
    elif kind_n == "spend":
        kinds = ["spend"]
    elif kind_n in ("recharge", "plan"):
        kinds = [kind_n]

    with Session(engine) as session:
        rows, total = crud.list_wallet_ledger(
            session=session,
            user_id=user_id,
            offset=offset,
            limit=page_size_n,
            kinds=kinds,
        )

    items = [
        {
            "id": str(r.id),
            "kind": r.kind,
            "amount": int(r.amount),
            "balanceAfter": int(r.balance_after),
            "detail": r.detail or "",
            "createdAt": int(float(r.created_at) * 1000),
        }
        for r in rows
    ]
    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(items) < total,
        "kind": kind_n,
    }
