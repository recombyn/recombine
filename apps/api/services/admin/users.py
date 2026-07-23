"""Admin user listing / status / role / balance adjustments."""

from __future__ import annotations

import time
from typing import Any

from services.db import connect, init_schema
from services.wallet.db import credit_tokens, get_user_tokens, list_ledger_page, spend_tokens


def list_users(
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    role: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 20), 100))
    offset = (page_n - 1) * page_size_n

    where = ["1=1"]
    params: list[Any] = []
    if q and q.strip():
        like = f"%{q.strip()}%"
        where.append("(email LIKE ? OR name LIKE ? OR id LIKE ?)")
        params.extend([like, like, like])
    if role and role.strip() and role.strip().lower() != "all":
        where.append("role = ?")
        params.append(role.strip().lower())
    if status and status.strip() and status.strip().lower() != "all":
        where.append("status = ?")
        params.append(status.strip().lower())

    where_sql = " AND ".join(where)
    with connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM users WHERE {where_sql}",
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT u.id, u.email, u.name, u.avatar, u.bio, u.provider,
                   u.role, u.status, u.created_at, u.updated_at,
                   COALESCE(b.tokens, 0) AS tokens
            FROM users u
            LEFT JOIN user_balances b ON b.user_id = u.id
            WHERE {where_sql}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()

    items = [_row_to_user(r) for r in rows]
    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
    }


def get_user(user_id: str) -> dict[str, Any] | None:
    init_schema()
    uid = (user_id or "").strip()
    if not uid:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.email, u.name, u.avatar, u.bio, u.provider,
                   u.role, u.status, u.created_at, u.updated_at,
                   COALESCE(b.tokens, 0) AS tokens
            FROM users u
            LEFT JOIN user_balances b ON b.user_id = u.id
            WHERE u.id = ?
            """,
            (uid,),
        ).fetchone()
    if not row:
        return None
    return _row_to_user(row)


def update_user(
    user_id: str,
    *,
    role: str | None = None,
    status: str | None = None,
    name: str | None = None,
) -> dict[str, Any] | None:
    init_schema()
    uid = (user_id or "").strip()
    if not uid:
        return None
    sets: list[str] = []
    params: list[Any] = []
    if role is not None:
        role_n = role.strip().lower()
        if role_n not in ("user", "admin"):
            raise ValueError("invalid_role")
        sets.append("role = ?")
        params.append(role_n)
    if status is not None:
        status_n = status.strip().lower()
        if status_n not in ("active", "disabled"):
            raise ValueError("invalid_status")
        sets.append("status = ?")
        params.append(status_n)
    if name is not None:
        sets.append("name = ?")
        params.append(name.strip()[:80] or "User")
    if not sets:
        return get_user(uid)
    sets.append("updated_at = ?")
    params.append(time.time())
    params.append(uid)
    with connect() as conn:
        conn.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE id = ?",
            tuple(params),
        )
        conn.commit()
    return get_user(uid)


def adjust_tokens(user_id: str, amount: int, detail: str = "") -> dict[str, Any]:
    """Positive amount credits; negative spends (absolute)."""
    uid = (user_id or "").strip()
    if not uid:
        raise ValueError("user_id required")
    amt = int(amount)
    if amt == 0:
        raise ValueError("amount must be non-zero")
    note = (detail or "admin adjust").strip()[:500]
    if amt > 0:
        balance = credit_tokens(uid, amt, detail=note)
    else:
        balance = spend_tokens(uid, abs(amt), detail=note)
    return {"userId": uid, "tokens": balance, "amount": amt}


def user_ledger(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    kind: str = "all",
) -> dict[str, Any]:
    return {
        "tokens": get_user_tokens(user_id),
        **list_ledger_page(user_id, page=page, page_size=page_size, kind=kind),
    }


def ensure_super_admin_role() -> None:
    """Make sure bootstrap super-admin row has role=admin."""
    init_schema()
    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            UPDATE users
            SET role = 'admin', status = 'active', updated_at = ?
            WHERE id = 'user_super_admin'
               OR email = 'admin@recombyn.com'
            """,
            (now,),
        )
        conn.commit()


def _row_to_user(r: Any) -> dict[str, Any]:
    return {
        "id": r["id"],
        "email": r["email"],
        "name": r["name"],
        "avatar": r["avatar"],
        "bio": r["bio"],
        "provider": r["provider"] or "email",
        "role": (r["role"] or "user"),
        "status": (r["status"] or "active"),
        "tokens": int(r["tokens"] or 0),
        "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }
