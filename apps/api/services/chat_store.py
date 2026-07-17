"""Chat session persistence — MySQL/SQLite via services.db."""

from __future__ import annotations

import time
import uuid
from typing import Any

from services.db import connect, init_schema

_MAX_SESSIONS = 40
_MAX_MESSAGES = 200


def list_sessions(user_id: str, project_id: str) -> list[dict[str, Any]]:
    """Return sessions for user/project, newest first, each with messages."""
    init_schema()
    pid = (project_id or "").strip() or "__none__"
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, project_id, title, updated_at, created_at
            FROM chat_sessions
            WHERE user_id = ? AND project_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (user_id, pid, _MAX_SESSIONS),
        ).fetchall()
        result: list[dict[str, Any]] = []
        for r in rows:
            msgs = conn.execute(
                """
                SELECT id, role, content, thinking, created_at, sort_order
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY sort_order ASC, created_at ASC
                LIMIT ?
                """,
                (r["id"], _MAX_MESSAGES),
            ).fetchall()
            result.append(
                {
                    "id": r["id"],
                    "projectId": r["project_id"],
                    "title": r["title"] or "",
                    "updatedAt": int(float(r["updated_at"]) * 1000),
                    "createdAt": int(float(r["created_at"]) * 1000),
                    "messages": [
                        {
                            "id": m["id"],
                            "role": m["role"],
                            "content": m["content"] or "",
                            **(
                                {"thinking": m["thinking"]}
                                if m["thinking"]
                                else {}
                            ),
                        }
                        for m in msgs
                    ],
                }
            )
    return result


def upsert_session(
    user_id: str,
    project_id: str,
    *,
    session_id: str | None = None,
    title: str = "",
    messages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Create or replace a session and its messages. Enforces max 40 sessions."""
    init_schema()
    pid = (project_id or "").strip() or "__none__"
    sid = (session_id or "").strip() or f"chat_{uuid.uuid4().hex[:16]}"
    title_n = (title or "").strip()[:255]
    now = time.time()
    msgs = (messages or [])[-_MAX_MESSAGES:]

    with connect() as conn:
        existing = conn.execute(
            "SELECT id, created_at FROM chat_sessions WHERE id = ? AND user_id = ?",
            (sid, user_id),
        ).fetchone()
        created = float(existing["created_at"]) if existing else now

        if existing:
            conn.execute(
                """
                UPDATE chat_sessions
                SET project_id = ?, title = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (pid, title_n, now, sid, user_id),
            )
            conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (sid,))
        else:
            conn.execute(
                """
                INSERT INTO chat_sessions (
                    id, user_id, project_id, title, updated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (sid, user_id, pid, title_n, now, now),
            )

        for i, m in enumerate(msgs):
            mid = (m.get("id") or "").strip() or f"msg_{uuid.uuid4().hex[:12]}"
            role = (m.get("role") or "user").strip()[:16]
            content = m.get("content") or ""
            thinking = m.get("thinking")
            msg_ts = now + (i * 0.001)
            conn.execute(
                """
                INSERT INTO chat_messages (
                    id, session_id, role, content, thinking, created_at, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (mid, sid, role, content, thinking, msg_ts, i),
            )

        # Cap sessions per user+project (keep newest N)
        keep = conn.execute(
            """
            SELECT id FROM chat_sessions
            WHERE user_id = ? AND project_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (user_id, pid, _MAX_SESSIONS),
        ).fetchall()
        keep_ids = {r["id"] for r in keep}
        all_rows = conn.execute(
            """
            SELECT id FROM chat_sessions
            WHERE user_id = ? AND project_id = ?
            """,
            (user_id, pid),
        ).fetchall()
        for r in all_rows:
            if r["id"] in keep_ids:
                continue
            oid = r["id"]
            conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (oid,))
            conn.execute(
                "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
                (oid, user_id),
            )

    return {
        "id": sid,
        "projectId": pid,
        "title": title_n,
        "updatedAt": int(now * 1000),
        "createdAt": int(created * 1000),
        "messages": [
            {
                "id": (m.get("id") or "").strip() or f"msg_{i}",
                "role": (m.get("role") or "user"),
                "content": m.get("content") or "",
                **({"thinking": m["thinking"]} if m.get("thinking") else {}),
            }
            for i, m in enumerate(msgs)
        ],
    }


def delete_session(user_id: str, session_id: str) -> bool:
    """Delete a session owned by user. Returns False if not found."""
    init_schema()
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
        conn.execute(
            "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        )
    return True
