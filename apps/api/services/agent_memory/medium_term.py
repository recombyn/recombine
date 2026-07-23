"""Medium-term task state — session meta + snapshot table."""

from __future__ import annotations

import json
import time
from typing import Any

from services.db import connect, init_schema
from services.agent_memory.schema import normalize_task_state


def _parse_meta(raw: Any) -> dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(str(raw))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def load_task_state_from_session(
    user_id: str,
    session_id: str,
    *,
    project_id: str = "",
) -> dict[str, Any] | None:
    sid = str(session_id or "").strip()
    if not sid:
        return None
    init_schema()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT meta_json FROM chat_sessions
            WHERE id = ? AND user_id = ?
            """,
            (sid, user_id),
        ).fetchone()
    if not row:
        return None
    meta = _parse_meta(row["meta_json"])
    ts = meta.get("task_state")
    if not isinstance(ts, dict):
        return None
    return normalize_task_state(ts, session_id=sid, project_id=project_id, user_id=user_id)


def save_task_state_to_session(
    user_id: str,
    session_id: str,
    task_state: dict[str, Any],
) -> None:
    sid = str(session_id or "").strip()
    if not sid:
        return
    init_schema()
    now = time.time()
    payload = json.dumps({"task_state": task_state}, ensure_ascii=False)
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
            (sid, user_id),
        ).fetchone()
        if not row:
            return
        conn.execute(
            "UPDATE chat_sessions SET meta_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (payload, now, sid, user_id),
        )
        conn.commit()


def upsert_session_snapshot(
    user_id: str,
    session_id: str,
    project_id: str,
    task_state: dict[str, Any],
) -> None:
    from services.db import dialect

    sid = str(session_id or "").strip()
    if not sid:
        return
    init_schema()
    now = time.time()
    blob = json.dumps(task_state, ensure_ascii=False)
    pid = str(project_id or "").strip() or "__none__"
    mysql = dialect() == "mysql"
    with connect() as conn:
        if mysql:
            conn.execute(
                """
                INSERT INTO agent_session_snapshot (
                    session_id, user_id, project_id, task_state_json, updated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    task_state_json = VALUES(task_state_json),
                    project_id = VALUES(project_id),
                    updated_at = VALUES(updated_at)
                """,
                (sid, user_id, pid, blob, now, now),
            )
        else:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_session_snapshot (
                    session_id, user_id, project_id, task_state_json, updated_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (sid, user_id, pid, blob, now, now),
            )
        conn.commit()


def persist_medium_term(
    user_id: str,
    session_id: str,
    project_id: str,
    task_state: dict[str, Any],
) -> None:
    save_task_state_to_session(user_id, session_id, task_state)
    upsert_session_snapshot(user_id, session_id, project_id, task_state)
