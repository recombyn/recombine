"""Plaza submission CRUD."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.plaza.cover import cover_json_dumps, validate_cover_for_publish
from services.plaza.db import connect, init_plaza_db

_MAX_DOC_BYTES = 12 * 1024 * 1024  # ~12MB JSON
# Align with home hero: website | mobile | image | poster
_CATEGORIES = frozenset({"website", "mobile", "image", "poster"})


class PlazaError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _parse_cover(row: Any) -> dict[str, Any] | None:
    """Plaza list cover only — never loads full document_json here."""
    try:
        raw = row["cover_json"]
    except (KeyError, IndexError, TypeError):
        return None
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _row_int(row: Any, key: str, default: int = 0) -> int:
    try:
        val = row[key]
    except (KeyError, IndexError, TypeError):
        return default
    if val is None:
        return default
    try:
        return max(0, int(val))
    except (TypeError, ValueError):
        return default


def _row_to_meta(row: Any, *, include_document: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"],
        "projectId": row["project_id"],
        "userId": row["user_id"],
        "authorName": row["author_name"],
        "authorAvatar": row["author_avatar"],
        "title": row["title"],
        "category": row["category"] or "website",
        "status": row["status"],
        "rejectReason": row["reject_reason"],
        "likeCount": _row_int(row, "like_count"),
        "useCount": _row_int(row, "use_count"),
        "isVisible": _row_int(row, "is_visible", 1) == 1,
        "createdAt": int(float(row["created_at"]) * 1000),
        "updatedAt": int(float(row["updated_at"]) * 1000),
        "reviewedAt": (
            int(float(row["reviewed_at"]) * 1000) if row["reviewed_at"] is not None else None
        ),
        "source": "plaza",
        # Plaza list fields — not full canvas document.
        "coverDocument": _parse_cover(row),
    }
    if include_document:
        try:
            out["document"] = json.loads(row["document_json"])
        except json.JSONDecodeError:
            out["document"] = None
    return out


def submit_to_plaza(
    *,
    user_id: str,
    author_name: str,
    author_avatar: str | None,
    project_id: str,
    title: str,
    document: dict[str, Any],
    category: str = "resume",
) -> dict[str, Any]:
    init_plaza_db()
    pid = (project_id or "").strip()
    if not pid:
        raise PlazaError("invalid_project", "projectId is required")
    name = (title or "").strip() or "Untitled"
    if len(name) > 120:
        name = name[:120]
    cat = (category or "website").strip().lower()
    if cat not in _CATEGORIES:
        cat = "website"
    if not isinstance(document, dict):
        raise PlazaError("invalid_document", "document must be an object")

    cover_ok, cover_err = validate_cover_for_publish(document)
    if not cover_ok:
        raise PlazaError(
            cover_err or "artboard_required",
            "Publish requires at least one artboard (frame) on the canvas",
        )

    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > _MAX_DOC_BYTES:
        raise PlazaError("document_too_large", "Document is too large to publish")
    cover_raw = cover_json_dumps(document)

    now = time.time()
    with connect() as conn:
        active = conn.execute(
            """
            SELECT id, status FROM plaza_submissions
            WHERE user_id = ? AND project_id = ?
              AND status IN ('pending', 'approved')
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (user_id, pid),
        ).fetchone()
        if active:
            if active["status"] == "pending":
                raise PlazaError("already_pending", "This project is already under review")
            raise PlazaError("already_published", "This project is already published on the plaza")

        sid = f"plaza_{uuid.uuid4().hex[:16]}"
        conn.execute(
            """
            INSERT INTO plaza_submissions (
                id, project_id, user_id, author_name, author_avatar,
                title, category, document_json, cover_json, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            """,
            (
                sid,
                pid,
                user_id,
                (author_name or "").strip() or "User",
                (author_avatar or "").strip() or None,
                name,
                cat,
                raw,
                cover_raw,
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (sid,),
        ).fetchone()
    return _row_to_meta(row)


def list_mine(user_id: str) -> list[dict[str, Any]]:
    """Latest submission per project for the current user (for status badges)."""
    init_plaza_db()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT s.*
            FROM plaza_submissions s
            INNER JOIN (
                SELECT project_id, MAX(updated_at) AS max_u
                FROM plaza_submissions
                WHERE user_id = ?
                GROUP BY project_id
            ) t ON s.project_id = t.project_id AND s.updated_at = t.max_u
            WHERE s.user_id = ?
            ORDER BY s.updated_at DESC
            """,
            (user_id, user_id),
        ).fetchall()
    return [_row_to_meta(r) for r in rows]


def list_feed(
    limit: int | None = None,
    *,
    page: int = 1,
    page_size: int | None = None,
    tab: str = "recommended",
    author_ids: list[str] | None = None,
    category: str | None = None,
    visible_only: bool = True,
) -> dict[str, Any]:
    """
    Paginated approved feed.
    tab: recommended | latest | following
    following requires author_ids (from Me follows API or client).
    category: optional plaza category filter (website|mobile|image|poster).
    """
    init_plaza_db()
    ps = page_size if page_size is not None else (limit if limit is not None else 20)
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(ps or 20), 50))
    offset = (page_n - 1) * page_size_n
    tab_n = (tab or "recommended").strip().lower()
    if tab_n not in ("recommended", "latest", "following"):
        tab_n = "recommended"

    ids = [str(x).strip() for x in (author_ids or []) if str(x).strip()]
    where = "status = 'approved'"
    if visible_only:
        where += " AND COALESCE(is_visible, 1) = 1"
    params: list[Any] = []
    if ids:
        placeholders = ", ".join("?" for _ in ids)
        where += f" AND user_id IN ({placeholders})"
        params.extend(ids)
    elif tab_n == "following":
        return {
            "items": [],
            "page": page_n,
            "pageSize": page_size_n,
            "total": 0,
            "hasMore": False,
            "tab": tab_n,
        }

    cat = (category or "").strip().lower()
    if cat and cat in _CATEGORIES:
        where += " AND LOWER(category) = ?"
        params.append(cat)

    if tab_n == "latest":
        order = "created_at DESC, updated_at DESC"
    else:
        # recommended (+ following): editorial / review time first
        order = "reviewed_at DESC, updated_at DESC, created_at DESC"

    with connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM plaza_submissions WHERE {where}",
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT * FROM plaza_submissions
            WHERE {where}
            ORDER BY {order}
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()

        # Fill missing avatars from users table when possible.
        user_ids = list({str(r["user_id"]) for r in rows if r["user_id"]})
        avatar_by_user: dict[str, str] = {}
        if user_ids:
            ph = ", ".join("?" for _ in user_ids)
            try:
                urows = conn.execute(
                    f"SELECT id, avatar FROM users WHERE id IN ({ph})",
                    tuple(user_ids),
                ).fetchall()
                for ur in urows:
                    av = (ur["avatar"] or "").strip()
                    if av:
                        avatar_by_user[str(ur["id"])] = av
            except Exception:
                pass

    items = []
    for r in rows:
        meta = _row_to_meta(r)
        if not (meta.get("authorAvatar") or "").strip():
            fallback = avatar_by_user.get(str(r["user_id"]) or "")
            if fallback:
                meta["authorAvatar"] = fallback
        items.append(meta)

    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(items) < total,
        "tab": tab_n,
    }


def list_admin(status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    init_plaza_db()
    lim = max(1, min(int(limit), 500))
    st = (status or "").strip().lower()
    with connect() as conn:
        if st in ("pending", "approved", "rejected"):
            rows = conn.execute(
                """
                SELECT * FROM plaza_submissions
                WHERE status = ?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (st, lim),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM plaza_submissions
                ORDER BY
                  CASE status
                    WHEN 'pending' THEN 0
                    WHEN 'approved' THEN 1
                    ELSE 2
                  END,
                  updated_at DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
    return [_row_to_meta(r) for r in rows]


def get_submission(submission_id: str, *, include_document: bool = False) -> dict[str, Any] | None:
    init_plaza_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    if not row:
        return None
    return _row_to_meta(row, include_document=include_document)



def set_submission_visible(submission_id: str, visible: bool) -> dict[str, Any]:
    """Toggle C-end visibility without changing review status."""
    init_plaza_db()
    sid = (submission_id or "").strip()
    if not sid:
        raise PlazaError("not_found", "Submission not found")
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (sid,),
        ).fetchone()
        if not row:
            raise PlazaError("not_found", "Submission not found")
        conn.execute(
            """
            UPDATE plaza_submissions
            SET is_visible = ?, updated_at = ?
            WHERE id = ?
            """,
            (1 if visible else 0, now, sid),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (sid,),
        ).fetchone()
    return _row_to_meta(row)


def approve_submission(submission_id: str, reviewer_id: str) -> dict[str, Any]:
    init_plaza_db()
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if not row:
            raise PlazaError("not_found", "Submission not found")
        if row["status"] == "approved":
            return _row_to_meta(row)
        conn.execute(
            """
            UPDATE plaza_submissions
            SET status = 'approved', reject_reason = NULL,
                reviewed_at = ?, reviewed_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (now, reviewer_id, now, submission_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    return _row_to_meta(row)


def reject_submission(
    submission_id: str,
    reviewer_id: str,
    reason: str | None = None,
) -> dict[str, Any]:
    init_plaza_db()
    now = time.time()
    reason_text = (reason or "").strip()[:500] or None
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if not row:
            raise PlazaError("not_found", "Submission not found")
        conn.execute(
            """
            UPDATE plaza_submissions
            SET status = 'rejected', reject_reason = ?,
                reviewed_at = ?, reviewed_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (reason_text, now, reviewer_id, now, submission_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM plaza_submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    return _row_to_meta(row)


def sync_like_count(conn: Any, submission_id: str) -> int:
    """Recalculate like_count from plaza_likes; never below 0."""
    sid = (submission_id or "").strip()
    if not sid:
        return 0
    count_row = conn.execute(
        "SELECT COUNT(*) AS c FROM plaza_likes WHERE submission_id = ?",
        (sid,),
    ).fetchone()
    count = max(0, int(count_row["c"] if count_row else 0))
    conn.execute(
        "UPDATE plaza_submissions SET like_count = ? WHERE id = ?",
        (count, sid),
    )
    return count


def increment_use_count(submission_id: str) -> int:
    """Atomically bump use_count; returns new value. Raises PlazaError if missing."""
    init_plaza_db()
    sid = (submission_id or "").strip()
    if not sid:
        raise PlazaError("not_found", "Submission not found")
    with connect() as conn:
        row = conn.execute(
            "SELECT id, use_count FROM plaza_submissions WHERE id = ?",
            (sid,),
        ).fetchone()
        if not row:
            raise PlazaError("not_found", "Submission not found")
        next_count = _row_int(row, "use_count") + 1
        conn.execute(
            "UPDATE plaza_submissions SET use_count = ? WHERE id = ?",
            (next_count, sid),
        )
        conn.commit()
    return next_count
