"""Wallet balances / ledger — shared MySQL (LighthouseDB) or SQLite."""

from __future__ import annotations

from typing import Any

from services.db import connect, init_schema


def init_wallet_db() -> None:
    init_schema()


__all__ = ["connect", "init_wallet_db", "get_user_tokens", "list_ledger"]


def get_user_tokens(user_id: str) -> int:
    init_schema()
    with connect() as conn:
        row = conn.execute(
            "SELECT tokens FROM user_balances WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return int(row["tokens"]) if row else 0


def list_ledger(user_id: str, limit: int = 100) -> list[dict[str, Any]]:
    init_schema()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, kind, amount, balance_after, detail, created_at
            FROM wallet_ledger
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, max(1, min(limit, 200))),
        ).fetchall()
    return [
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
