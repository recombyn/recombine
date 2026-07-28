"""Product notices — announcements & notifications for account inbox."""

from __future__ import annotations

import time
import uuid
from typing import Any

from services.db import connect, init_schema

VALID_KINDS = frozenset({"announcement", "notification"})
VALID_STATUSES = frozenset({"draft", "published"})

_SEED = (
    {
        "id": "ann-welcome-v1",
        "kind": "announcement",
        "title": "欢迎使用 recombyn",
        "body": "用对话驱动设计：描述需求，Agent 会帮你完成画板与排版。免费档每天可体验 1 次 Auto 执行。",
        "status": "published",
        "published_at": 1751328000.0,  # 2026-07-01
    },
    {
        "id": "ann-plans-v1",
        "kind": "announcement",
        "title": "会员与卡密兑换说明",
        "body": "支持套餐卡密与 Token 卡密。兑换后会员权益与额度立即生效；可在「兑换」中输入卡密。",
        "status": "published",
        "published_at": 1752969600.0,  # 2026-07-20
    },
)


def _row_to_item(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "kind": str(row["kind"] or "announcement"),
        "title": str(row["title"] or ""),
        "body": str(row["body"] or ""),
        "status": str(row["status"] or "draft"),
        "publishedAt": float(row["published_at"]) if row["published_at"] is not None else None,
        "createdAt": float(row["created_at"] or 0),
        "updatedAt": float(row["updated_at"] or 0),
    }


def ensure_notices_ready() -> None:
    init_schema()
    with connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM notices").fetchone()
        count = int((row or {}).get("c") or 0)
        if count > 0:
            return
        now = time.time()
        for item in _SEED:
            conn.execute(
                """
                INSERT INTO notices
                    (id, kind, title, body, status, published_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    item["kind"],
                    item["title"],
                    item["body"],
                    item["status"],
                    item["published_at"],
                    item["published_at"],
                    now,
                ),
            )
        conn.commit()


def list_notices_admin(
    *,
    kind: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    ensure_notices_ready()
    clauses: list[str] = []
    args: list[Any] = []
    if kind and kind in VALID_KINDS:
        clauses.append("kind = ?")
        args.append(kind)
    if status and status in VALID_STATUSES:
        clauses.append("status = ?")
        args.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, kind, title, body, status, published_at, created_at, updated_at
            FROM notices
            {where}
            ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
            """,
            tuple(args),
        ).fetchall()
    return [_row_to_item(r) for r in rows]


def list_notices_public(*, kind: str | None = None) -> list[dict[str, Any]]:
    """Published notices for the account inbox."""
    ensure_notices_ready()
    clauses = ["status = 'published'"]
    args: list[Any] = []
    if kind and kind in VALID_KINDS:
        clauses.append("kind = ?")
        args.append(kind)
    where = "WHERE " + " AND ".join(clauses)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, kind, title, body, status, published_at, created_at, updated_at
            FROM notices
            {where}
            ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
            """,
            tuple(args),
        ).fetchall()
    return [_row_to_item(r) for r in rows]


def get_notice(notice_id: str) -> dict[str, Any] | None:
    ensure_notices_ready()
    nid = (notice_id or "").strip()
    if not nid:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, kind, title, body, status, published_at, created_at, updated_at
            FROM notices WHERE id = ?
            """,
            (nid,),
        ).fetchone()
    return _row_to_item(row) if row else None


def upsert_notice(
    *,
    notice_id: str | None,
    kind: str,
    title: str,
    body: str,
    status: str,
    published_at: float | None = None,
) -> dict[str, Any]:
    ensure_notices_ready()
    k = (kind or "").strip().lower()
    if k not in VALID_KINDS:
        raise ValueError("invalid_kind")
    st = (status or "").strip().lower()
    if st not in VALID_STATUSES:
        raise ValueError("invalid_status")
    title_s = (title or "").strip()
    body_s = (body or "").strip()
    if not title_s:
        raise ValueError("title_required")
    if not body_s:
        raise ValueError("body_required")

    now = time.time()
    nid = (notice_id or "").strip() or f"n-{uuid.uuid4().hex[:12]}"
    existing = get_notice(nid)

    pub = published_at
    if st == "published":
        if pub is None:
            pub = float(existing["publishedAt"]) if existing and existing.get("publishedAt") else now
    else:
        pub = None

    with connect() as conn:
        if existing:
            conn.execute(
                """
                UPDATE notices
                SET kind = ?, title = ?, body = ?, status = ?, published_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (k, title_s, body_s, st, pub, now, nid),
            )
        else:
            conn.execute(
                """
                INSERT INTO notices
                    (id, kind, title, body, status, published_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (nid, k, title_s, body_s, st, pub, now, now),
            )
        conn.commit()
    item = get_notice(nid)
    assert item is not None
    return item


def delete_notice(notice_id: str) -> bool:
    ensure_notices_ready()
    nid = (notice_id or "").strip()
    if not nid:
        return False
    with connect() as conn:
        before = conn.execute(
            "SELECT id FROM notices WHERE id = ?", (nid,)
        ).fetchone()
        if not before:
            return False
        conn.execute("DELETE FROM notices WHERE id = ?", (nid,))
        conn.commit()
        return True
