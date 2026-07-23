"""Wallet balances / ledger — shared MySQL (LighthouseDB) or SQLite."""

from __future__ import annotations

from typing import Any

from services.db import connect, init_schema


def init_wallet_db() -> None:
    init_schema()


__all__ = [
    "connect",
    "init_wallet_db",
    "ensure_user_balance",
    "get_user_tokens",
    "list_ledger",
    "list_ledger_page",
    "spend_tokens",
    "credit_tokens",
]


def ensure_user_balance(user_id: str, *, starting_tokens: int = 0) -> int:
    """Ensure a wallet row exists for the user; return current tokens."""
    init_schema()
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
            "INSERT INTO user_balances (user_id, tokens, updated_at) VALUES (?, ?, ?)",
            (uid, int(starting_tokens), now),
        )
        conn.commit()
        return int(starting_tokens)


def get_user_tokens(user_id: str) -> int:
    return ensure_user_balance(user_id, starting_tokens=0)


def spend_tokens(user_id: str, amount: int, detail: str = "") -> int:
    """
    Deduct tokens and write a ledger row (kind=spend).
    Returns balance after spend. Raises ValueError if insufficient / invalid.
    """
    init_schema()
    uid = (user_id or "").strip()
    amt = int(amount)
    if not uid:
        raise ValueError("user_id required")
    if amt <= 0:
        raise ValueError("amount must be > 0")
    import time

    now = time.time()
    note = (detail or "").strip()[:500]
    with connect() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_balances WHERE user_id = ?",
            (uid,),
        ).fetchone()
        prev = int(row["tokens"]) if row else 0
        if prev < amt:
            raise ValueError("insufficient_tokens")
        next_bal = prev - amt
        if row:
            conn.execute(
                "UPDATE user_balances SET tokens = ?, updated_at = ? WHERE user_id = ?",
                (next_bal, now, uid),
            )
        else:
            conn.execute(
                "INSERT INTO user_balances (user_id, tokens, updated_at) VALUES (?, ?, ?)",
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
        conn.commit()
    return next_bal


def credit_tokens(user_id: str, amount: int, detail: str = "") -> int:
    """
    Add credits (refund / top-up) and write ledger kind=recharge.
    Returns balance after credit.
    """
    init_schema()
    uid = (user_id or "").strip()
    amt = int(amount)
    if not uid:
        raise ValueError("user_id required")
    if amt <= 0:
        raise ValueError("amount must be > 0")
    import time

    now = time.time()
    note = (detail or "").strip()[:500]
    with connect() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_balances WHERE user_id = ?",
            (uid,),
        ).fetchone()
        prev = int(row["tokens"]) if row else 0
        next_bal = prev + amt
        if row:
            conn.execute(
                "UPDATE user_balances SET tokens = ?, updated_at = ? WHERE user_id = ?",
                (next_bal, now, uid),
            )
        else:
            conn.execute(
                "INSERT INTO user_balances (user_id, tokens, updated_at) VALUES (?, ?, ?)",
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
        conn.commit()
    return next_bal


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
        where += " AND kind = ?"
        params.append("redeem")
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
