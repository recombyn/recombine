"""Wallet balances / ledger — unified 积分 stored in ``tokens`` column.

Legacy ``image_credits`` is migrated into ``tokens`` once
(``wallet_unified_credits_v1``), then kept at 0. API still exposes
``credits`` / ``tokens`` / ``imageCredits`` (aliases of the same balance).
"""

from __future__ import annotations

from typing import Any

from services.db import connect, dialect, init_schema

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

    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_migrations (
                id VARCHAR(64) PRIMARY KEY,
                applied_at DOUBLE NOT NULL
            )
            """
        )
        row = conn.execute(
            "SELECT id FROM app_migrations WHERE id = ?",
            (_UNIFIED_MIGRATION_ID,),
        ).fetchone()
        if row:
            _unified_ready = True
            return
        # ceil(tokens/30000) + image_credits → tokens; clear image_credits
        rows = conn.execute(
            "SELECT user_id, tokens, image_credits FROM user_balances"
        ).fetchall()
        for r in rows:
            uid = str(r["user_id"] or "")
            if not uid:
                continue
            old_tok = int(r["tokens"] or 0)
            old_img = int(r["image_credits"] or 0)
            from math import ceil

            # Large ``tokens`` = legacy LLM units; small = already 积分-sized.
            if old_tok >= _LEGACY_TOKENS_PER_CREDIT:
                merged = int(ceil(old_tok / float(_LEGACY_TOKENS_PER_CREDIT))) + old_img
            else:
                merged = old_tok + old_img
            conn.execute(
                """
                UPDATE user_balances
                SET tokens = ?, image_credits = 0, updated_at = ?
                WHERE user_id = ?
                """,
                (max(0, merged), now, uid),
            )
        conn.execute(
            "INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)",
            (_UNIFIED_MIGRATION_ID, now),
        )
        conn.commit()
    _unified_ready = True


def ensure_credits_scale_x10_migration() -> None:
    """One-shot: multiply wallet balances ×10 to match the new display scale."""
    global _scale_x10_ready
    if _scale_x10_ready:
        return
    ensure_unified_credits_migration()
    import time

    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_migrations (
                id VARCHAR(64) PRIMARY KEY,
                applied_at DOUBLE NOT NULL
            )
            """
        )
        row = conn.execute(
            "SELECT id FROM app_migrations WHERE id = ?",
            (_SCALE_X10_MIGRATION_ID,),
        ).fetchone()
        if row:
            _scale_x10_ready = True
            return
        conn.execute(
            """
            UPDATE user_balances
            SET tokens = tokens * 10, updated_at = ?
            WHERE tokens > 0
            """,
            (now,),
        )
        conn.execute(
            "INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)",
            (_SCALE_X10_MIGRATION_ID, now),
        )
        conn.commit()
    _scale_x10_ready = True


__all__ = [
    "connect",
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
    "FREE_DAILY_LIMIT",
    "free_daily_remaining",
    "consume_free_daily_quota",
]


def ensure_user_balance(user_id: str, *, starting_tokens: int = 0) -> int:
    """Ensure a wallet row exists; return current unified 积分."""
    ensure_unified_credits_migration()
    uid = (user_id or "").strip()
    if not uid:
        return 0
    import time

    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_balances WHERE user_id = ?",
            (uid,),
        ).fetchone()
        if row:
            return int(row["tokens"])
        conn.execute(
            """
            INSERT INTO user_balances (user_id, tokens, image_credits, plan_id, updated_at)
            VALUES (?, ?, 0, 'free', ?)
            """,
            (uid, int(starting_tokens), now),
        )
        conn.commit()
        return int(starting_tokens)


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


def get_wallet(user_id: str) -> dict[str, Any]:
    """Unified 积分 + plan. ``tokens`` / ``imageCredits`` / ``credits`` are the same balance."""
    credits = ensure_user_balance(user_id, starting_tokens=0)
    uid = (user_id or "").strip()
    if not uid:
        return {
            "credits": 0,
            "tokens": 0,
            "imageCredits": 0,
            "planId": "free",
            "planExpiresAt": None,
            "planLocked": False,
        }
    import time

    now = time.time()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT tokens, plan_id, plan_expires_at
            FROM user_balances WHERE user_id = ?
            """,
            (uid,),
        ).fetchone()
    credits = int((row or {}).get("tokens") or credits or 0)
    stored = _normalize_plan((row or {}).get("plan_id"))
    expires_raw = (row or {}).get("plan_expires_at")
    expires_at = float(expires_raw) if expires_raw is not None else None
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
    }


# Free users with empty balance: 1 design run / calendar day (UTC date in ledger detail).
FREE_DAILY_LIMIT = 1


def free_daily_remaining(user_id: str, *, limit: int = FREE_DAILY_LIMIT) -> int:
    """How many free daily design runs are left today (does not consume)."""
    init_schema()
    uid = (user_id or "").strip()
    lim = max(1, int(limit or FREE_DAILY_LIMIT))
    if not uid:
        return 0
    import time

    day = time.strftime("%Y-%m-%d", time.gmtime(time.time()))
    prefix = f"free_daily:{day}"
    with connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM wallet_ledger
            WHERE user_id = ? AND detail LIKE ?
            """,
            (uid, f"{prefix}%"),
        ).fetchone()
        used = int(row["c"] or 0) if row else 0
    return max(0, lim - used)


def consume_free_daily_quota(user_id: str, *, limit: int = FREE_DAILY_LIMIT) -> bool:
    """
    Atomically reserve today's free design run.
    Returns True if reserved; False if the daily quota is already used.
    Writes a zero-amount ledger marker (does not change balance).
    """
    init_schema()
    uid = (user_id or "").strip()
    lim = max(1, int(limit or FREE_DAILY_LIMIT))
    if not uid:
        return False
    import time

    now = time.time()
    day = time.strftime("%Y-%m-%d", time.gmtime(now))
    prefix = f"free_daily:{day}"
    with connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM wallet_ledger
            WHERE user_id = ? AND detail LIKE ?
            """,
            (uid, f"{prefix}%"),
        ).fetchone()
        used = int(row["c"] or 0) if row else 0
        if used >= lim:
            return False
        bal_row = conn.execute(
            "SELECT tokens FROM user_balances WHERE user_id = ?",
            (uid,),
        ).fetchone()
        bal = int(bal_row["tokens"]) if bal_row else 0
        if not bal_row:
            conn.execute(
                """
                INSERT INTO user_balances (user_id, tokens, plan_id, updated_at)
                VALUES (?, 0, 'free', ?)
                """,
                (uid, now),
            )
        conn.execute(
            """
            INSERT INTO wallet_ledger
                (user_id, kind, amount, balance_after, detail, card_key_id, created_at)
            VALUES (?, 'spend', 0, ?, ?, NULL, ?)
            """,
            (uid, bal, f"{prefix}:run", now),
        )
        conn.commit()
    return True


def spend_tokens(user_id: str, amount: int, detail: str = "") -> int:
    """Deduct unified 积分; write ledger kind=spend. Raises ValueError if insufficient."""
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
    with connect(immediate=True) as conn:
        if dialect() in ("mysql", "postgres"):
            row = conn.execute(
                "SELECT tokens FROM user_balances WHERE user_id = ? FOR UPDATE",
                (uid,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT tokens FROM user_balances WHERE user_id = ?",
                (uid,),
            ).fetchone()
        prev = int(row["tokens"]) if row else 0
        if prev < amt:
            raise ValueError("insufficient_tokens")
        next_bal = prev - amt
        if row:
            cur = conn.execute(
                """
                UPDATE user_balances
                SET tokens = ?, image_credits = 0, updated_at = ?
                WHERE user_id = ? AND tokens >= ?
                """,
                (next_bal, now, uid, amt),
            )
            if int(getattr(cur, "rowcount", 0) or 0) <= 0:
                raise ValueError("insufficient_tokens")
        else:
            conn.execute(
                """
                INSERT INTO user_balances (user_id, tokens, image_credits, plan_id, updated_at)
                VALUES (?, ?, 0, 'free', ?)
                """,
                (uid, next_bal, now),
            )
        conn.execute(
            """
            INSERT INTO wallet_ledger
                (user_id, kind, amount, balance_after, detail, card_key_id, created_at)
            VALUES (?, 'spend', ?, ?, ?, NULL, ?)
            """,
            (uid, -amt, next_bal, note, now),
        )
    return next_bal


def credit_tokens(user_id: str, amount: int, detail: str = "") -> int:
    """Add unified 积分; write ledger kind=recharge."""
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
    with connect(immediate=True) as conn:
        if dialect() in ("mysql", "postgres"):
            row = conn.execute(
                "SELECT tokens FROM user_balances WHERE user_id = ? FOR UPDATE",
                (uid,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT tokens FROM user_balances WHERE user_id = ?",
                (uid,),
            ).fetchone()
        prev = int(row["tokens"]) if row else 0
        next_bal = prev + amt
        if row:
            conn.execute(
                "UPDATE user_balances SET tokens = ?, image_credits = 0, updated_at = ? WHERE user_id = ?",
                (next_bal, now, uid),
            )
        else:
            conn.execute(
                """
                INSERT INTO user_balances (user_id, tokens, image_credits, plan_id, updated_at)
                VALUES (?, ?, 0, 'free', ?)
                """,
                (uid, next_bal, now),
            )
        conn.execute(
            """
            INSERT INTO wallet_ledger
                (user_id, kind, amount, balance_after, detail, card_key_id, created_at)
            VALUES (?, 'recharge', ?, ?, ?, NULL, ?)
            """,
            (uid, amt, next_bal, note, now),
        )
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
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n
    kind_n = (kind or "all").strip().lower()
    if kind_n not in ("all", "redeem", "spend", "recharge", "plan"):
        kind_n = "all"

    where = "user_id = ?"
    params: list[Any] = [user_id]
    if kind_n == "redeem":
        where += " AND kind IN (?, ?)"
        params.extend(["redeem", "plan"])
    elif kind_n == "spend":
        where += " AND kind = ?"
        params.append("spend")
    elif kind_n in ("recharge", "plan"):
        where += " AND kind = ?"
        params.append(kind_n)

    with connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM wallet_ledger WHERE {where}",
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT id, kind, amount, balance_after, detail, created_at
            FROM wallet_ledger
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()

    items = [
        {
            "id": str(r["id"]),
            "kind": r["kind"],
            "amount": int(r["amount"]),
            "balanceAfter": int(r["balance_after"]),
            "detail": r["detail"] or "",
            "createdAt": int(float(r["created_at"]) * 1000),
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
