"""Plaza submission CRUD."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.plaza.db import connect, init_plaza_db

_MAX_DOC_BYTES = 12 * 1024 * 1024  # ~12MB JSON
_CATEGORIES = frozenset({"resume", "poster", "ui"})


class PlazaError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _row_to_meta(row: Any, *, include_document: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row["id"],
        "projectId": row["project_id"],
        "userId": row["user_id"],
        "authorName": row["author_name"],
        "authorAvatar": row["author_avatar"],
        "title": row["title"],
        "category": row["category"] or "resume",
        "status": row["status"],
        "rejectReason": row["reject_reason"],
        "createdAt": int(float(row["created_at"]) * 1000),
        "updatedAt": int(float(row["updated_at"]) * 1000),
        "reviewedAt": (
            int(float(row["reviewed_at"]) * 1000) if row["reviewed_at"] is not None else None
        ),
        "source": "plaza",
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
    cat = (category or "resume").strip().lower()
    if cat not in _CATEGORIES:
        cat = "resume"
    if not isinstance(document, dict):
        raise PlazaError("invalid_document", "document must be an object")

    raw = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > _MAX_DOC_BYTES:
        raise PlazaError("document_too_large", "Document is too large to publish")

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
                title, category, document_json, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
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


def list_feed(limit: int = 100) -> list[dict[str, Any]]:
    init_plaza_db()
    lim = max(1, min(int(limit), 200))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM plaza_submissions
            WHERE status = 'approved'
            ORDER BY reviewed_at DESC, updated_at DESC
            LIMIT ?
            """,
            (lim,),
        ).fetchall()
    return [_row_to_meta(r) for r in rows]


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
