"""Me — liked Plaza submissions (server-side)."""

from __future__ import annotations

import time
from typing import Any

from services.db import connect, dialect, init_schema
from services.plaza.store import _parse_cover, _row_to_meta, sync_like_count


def list_liked(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    size = max(1, min(int(page_size or 24), 50))
    offset = (page_n - 1) * size
    with connect() as conn:
        total_row = conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM plaza_likes l
            INNER JOIN plaza_submissions s ON s.id = l.submission_id
            WHERE l.user_id = ?
              AND s.status = 'approved'
              AND COALESCE(s.is_visible, 1) = 1
            """,
            (user_id,),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            """
            SELECT s.*, l.created_at AS liked_at
            FROM plaza_likes l
            INNER JOIN plaza_submissions s ON s.id = l.submission_id
            WHERE l.user_id = ?
              AND s.status = 'approved'
              AND COALESCE(s.is_visible, 1) = 1
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, size, offset),
        ).fetchall()

    items = []
    for r in rows:
        meta = _row_to_meta(r)
        try:
            liked_raw = r["liked_at"]
            liked_f = float(liked_raw) if liked_raw is not None else 0.0
            # created_at is unix seconds; tolerate accidental ms values.
            meta["likedAt"] = int(liked_f if liked_f > 1e12 else liked_f * 1000) or int(
                time.time() * 1000
            )
        except (TypeError, ValueError, KeyError):
            meta["likedAt"] = int(time.time() * 1000)
        if meta.get("coverDocument") is None:
            meta["coverDocument"] = _parse_cover(r)
        items.append(meta)

    return {
        "items": items,
        "page": page_n,
        "pageSize": size,
        "total": total,
        "hasMore": offset + len(items) < total,
    }


def list_liked_ids(user_id: str) -> list[str]:
    init_schema()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT l.submission_id
            FROM plaza_likes l
            INNER JOIN plaza_submissions s ON s.id = l.submission_id
            WHERE l.user_id = ?
              AND s.status = 'approved'
              AND COALESCE(s.is_visible, 1) = 1
            ORDER BY l.created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [str(r["submission_id"]) for r in rows]


def _upsert_like(conn: Any, user_id: str, sid: str, now: float) -> None:
    if dialect() == "sqlite":
        conn.execute(
            """
            INSERT OR IGNORE INTO plaza_likes (user_id, submission_id, created_at)
            VALUES (?, ?, ?)
            """,
            (user_id, sid, now),
        )
    else:
        conn.execute(
            """
            INSERT IGNORE INTO plaza_likes (user_id, submission_id, created_at)
            VALUES (?, ?, ?)
            """,
            (user_id, sid, now),
        )


def like_submission(user_id: str, submission_id: str) -> dict[str, Any]:
    init_schema()
    sid = (submission_id or "").strip()
    if not sid:
        raise ValueError("submission_id required")
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id FROM plaza_submissions
            WHERE id = ? AND status = 'approved' AND COALESCE(is_visible, 1) = 1
            """,
            (sid,),
        ).fetchone()
        if not row:
            raise LookupError("not_found")
        _upsert_like(conn, user_id, sid, now)
        like_count = sync_like_count(conn, sid)
        conn.commit()
    return {"ok": True, "liked": True, "id": sid, "likeCount": like_count}


def unlike_submission(user_id: str, submission_id: str) -> dict[str, Any]:
    init_schema()
    sid = (submission_id or "").strip()
    with connect() as conn:
        conn.execute(
            "DELETE FROM plaza_likes WHERE user_id = ? AND submission_id = ?",
            (user_id, sid),
        )
        like_count = sync_like_count(conn, sid) if sid else 0
        conn.commit()
    return {"ok": True, "liked": False, "id": sid, "likeCount": like_count}


def sync_likes(user_id: str, submission_ids: list[str]) -> dict[str, Any]:
    """Upsert a batch of likes (migrate from client localStorage)."""
    init_schema()
    ids = [str(x).strip() for x in submission_ids if str(x).strip()][:200]
    now = time.time()
    with connect() as conn:
        for sid in ids:
            exists = conn.execute(
                "SELECT id FROM plaza_submissions WHERE id = ? AND status = 'approved' AND COALESCE(is_visible, 1) = 1",
                (sid,),
            ).fetchone()
            if not exists:
                continue
            _upsert_like(conn, user_id, sid, now)
            sync_like_count(conn, sid)
        conn.commit()
    return {"ok": True, "ids": list_liked_ids(user_id)}
