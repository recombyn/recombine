"""Chat session persistence — MySQL/SQLite via services.db."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.db import connect, init_schema

_MAX_SESSIONS = 40
_MAX_MESSAGES = 200


def _pack_message_meta(m: dict[str, Any]) -> str | None:
    meta: dict[str, Any] = {}
    raw_meta = m.get("meta")
    if isinstance(raw_meta, dict):
        meta.update(raw_meta)
    if m.get("durationMs") is not None:
        try:
            meta["durationMs"] = int(m["durationMs"])
        except (TypeError, ValueError):
            pass
    intent = m.get("intent")
    if isinstance(intent, str) and intent.strip():
        meta["intent"] = intent.strip()
    steps = m.get("steps")
    if isinstance(steps, list) and steps:
        meta["steps"] = steps
    images = m.get("images")
    if isinstance(images, list) and images:
        cleaned = [str(u).strip() for u in images if isinstance(u, str) and str(u).strip()]
        if cleaned:
            meta["images"] = cleaned[:24]
    if not meta:
        return None
    try:
        return json.dumps(meta, ensure_ascii=False)
    except Exception:
        return None


def _unpack_message_meta(raw: Any) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(str(raw))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _message_public(m: dict[str, Any], *, sort_fallback: int = 0) -> dict[str, Any]:
    meta = _unpack_message_meta(m.get("meta_json") or m.get("metaJson") or m.get("meta"))
    # Flat fields on write payload also win when listing from in-memory upsert return.
    if m.get("durationMs") is not None and "durationMs" not in meta:
        try:
            meta["durationMs"] = int(m["durationMs"])
        except (TypeError, ValueError):
            pass
    if m.get("intent") and "intent" not in meta:
        meta["intent"] = m["intent"]
    if m.get("steps") and "steps" not in meta:
        meta["steps"] = m["steps"]
    if m.get("images") and "images" not in meta:
        meta["images"] = m["images"]

    out: dict[str, Any] = {
        "id": (m.get("id") or "").strip() or f"msg_{sort_fallback}",
        "role": (m.get("role") or "user"),
        "content": m.get("content") or "",
    }
    thinking = m.get("thinking")
    if thinking:
        out["thinking"] = thinking
    if meta.get("durationMs") is not None:
        out["durationMs"] = meta["durationMs"]
    if meta.get("intent"):
        out["intent"] = meta["intent"]
    if isinstance(meta.get("steps"), list) and meta["steps"]:
        out["steps"] = meta["steps"]
    if isinstance(meta.get("images"), list) and meta["images"]:
        out["images"] = [
            str(u).strip() for u in meta["images"] if isinstance(u, str) and str(u).strip()
        ][:24]
    return out


def list_sessions(user_id: str, project_id: str) -> list[dict[str, Any]]:
    """Return sessions for user/project, newest first, each with messages."""
    init_schema()
    pid = (project_id or "").strip() or "__none__"
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, project_id, title, updated_at, created_at, meta_json
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
                SELECT id, role, content, thinking, meta_json, created_at, sort_order
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
                    "taskState": _unpack_session_task_state(r.get("meta_json")),
                    "messages": [
                        _message_public(dict(m), sort_fallback=i) for i, m in enumerate(msgs)
                    ],
                }
            )
    return result


def _unpack_session_task_state(raw: Any) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        data = json.loads(str(raw)) if not isinstance(raw, dict) else raw
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    ts = data.get("task_state")
    return ts if isinstance(ts, dict) else None


def _pack_session_meta(task_state: dict[str, Any] | None) -> str | None:
    if not task_state or not isinstance(task_state, dict):
        return None
    try:
        return json.dumps({"task_state": task_state}, ensure_ascii=False)
    except Exception:
        return None


def upsert_session(
    user_id: str,
    project_id: str,
    *,
    session_id: str | None = None,
    title: str = "",
    messages: list[dict[str, Any]] | None = None,
    task_state: dict[str, Any] | None = None,
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
            meta_sql = ""
            meta_args: tuple[Any, ...] = ()
            packed = _pack_session_meta(task_state)
            if packed is not None:
                meta_sql = ", meta_json = ?"
                meta_args = (packed,)
            conn.execute(
                f"""
                UPDATE chat_sessions
                SET project_id = ?, title = ?, updated_at = ?{meta_sql}
                WHERE id = ? AND user_id = ?
                """,
                (pid, title_n, now, *meta_args, sid, user_id),
            )
            conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (sid,))
        else:
            packed = _pack_session_meta(task_state)
            conn.execute(
                """
                INSERT INTO chat_sessions (
                    id, user_id, project_id, title, updated_at, created_at, meta_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (sid, user_id, pid, title_n, now, now, packed),
            )

        for i, m in enumerate(msgs):
            mid = (m.get("id") or "").strip() or f"msg_{uuid.uuid4().hex[:12]}"
            role = (m.get("role") or "user").strip()[:16]
            content = m.get("content") or ""
            thinking = m.get("thinking")
            meta_json = _pack_message_meta(m)
            msg_ts = now + (i * 0.001)
            conn.execute(
                """
                INSERT INTO chat_messages (
                    id, session_id, role, content, thinking, meta_json, created_at, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (mid, sid, role, content, thinking, meta_json, msg_ts, i),
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

    out_task_state = task_state if isinstance(task_state, dict) else None
    return {
        "id": sid,
        "projectId": pid,
        "title": title_n,
        "updatedAt": int(now * 1000),
        "createdAt": int(created * 1000),
        "taskState": out_task_state,
        "messages": [_message_public(m, sort_fallback=i) for i, m in enumerate(msgs)],
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
