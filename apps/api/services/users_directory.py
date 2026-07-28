"""Authenticated user directory search (invite collaborators — limited fields)."""

from __future__ import annotations

from typing import Any

from services.db import connect, init_schema


def _row_public(row: Any) -> dict[str, Any]:
    custom = ""
    default = ""
    try:
        custom = str(row["avatar"] or "").strip()
    except Exception:
        custom = ""
    try:
        if "default_avatar" in row.keys():
            default = str(row["default_avatar"] or "").strip()
    except Exception:
        default = ""
    return {
        "id": row["id"],
        "name": row["name"] or "User",
        "email": row["email"] or "",
        # Prefer user upload; fall back to OAuth/default.
        "avatar": custom or default or None,
    }


def search_users(*, q: str, limit: int = 12, exclude_user_id: str | None = None) -> dict[str, Any]:
    init_schema()
    query = (q or "").strip()
    if len(query) < 1:
        return {"items": []}
    lim = max(1, min(int(limit or 12), 20))
    like = f"%{query}%"
    exclude = (exclude_user_id or "").strip()
    where = [
        "(email LIKE ? OR name LIKE ? OR id LIKE ?)",
        "COALESCE(status, 'active') = 'active'",
    ]
    params: list[Any] = [like, like, like]
    if exclude:
        where.append("id != ?")
        params.append(exclude)
    where_sql = " AND ".join(where)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, email, name, avatar, default_avatar
            FROM users
            WHERE {where_sql}
            ORDER BY
              CASE WHEN id = ? THEN 0
                   WHEN email = ? THEN 1
                   WHEN name = ? THEN 2
                   ELSE 3 END,
              created_at DESC
            LIMIT ?
            """,
            tuple(params + [query, query, query, lim]),
        ).fetchall()
    return {"items": [_row_public(r) for r in rows]}


def get_users_by_ids(user_ids: list[str]) -> list[dict[str, Any]]:
    init_schema()
    ids = []
    seen: set[str] = set()
    for raw in user_ids or []:
        uid = str(raw or "").strip()
        if not uid or uid in seen:
            continue
        seen.add(uid)
        ids.append(uid)
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, email, name, avatar, default_avatar
            FROM users
            WHERE id IN ({placeholders})
            """,
            tuple(ids),
        ).fetchall()
    by_id = {str(r["id"]): _row_public(r) for r in rows}
    return [by_id[i] for i in ids if i in by_id]
