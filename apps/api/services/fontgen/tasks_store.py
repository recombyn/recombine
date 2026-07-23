"""MySQL/SQLite store for font_tasks."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from services.db import connect, init_schema


def _row_to_task(row: Any) -> dict[str, Any]:
    meta = None
    if row["meta_json"]:
        try:
            meta = json.loads(row["meta_json"])
        except json.JSONDecodeError:
            meta = None
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "status": row["status"],
        "progress": int(row["progress"] or 0),
        "description": row["description"],
        "referenceUrl": row["reference_url"],
        "charset": row["charset_text"],
        "styleObjectKey": row["style_object_key"],
        "ttfObjectKey": row["ttf_object_key"],
        "ttfUrl": row["ttf_url"],
        "previewUrl": row["preview_url"],
        "assetId": row["asset_id"],
        "familyName": row["family_name"],
        "error": row["error"],
        "meta": meta,
        "createdAt": int(float(row["created_at"]) * 1000),
        "updatedAt": int(float(row["updated_at"]) * 1000),
    }


def create_task(
    user_id: str,
    *,
    description: str | None = None,
    reference_url: str | None = None,
    charset: str | None = None,
) -> dict[str, Any]:
    init_schema()
    task_id = f"font_{uuid.uuid4().hex[:16]}"
    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO font_tasks (
                id, user_id, status, progress, description, reference_url,
                charset_text, style_object_key, ttf_object_key, ttf_url,
                preview_url, asset_id, family_name, error, meta_json,
                created_at, updated_at
            ) VALUES (?, ?, 'queued', 0, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
            """,
            (
                task_id,
                user_id,
                (description or None),
                (reference_url or None),
                (charset or None),
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM font_tasks WHERE id = ?", (task_id,)).fetchone()
    return _row_to_task(row)


def get_task(task_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    init_schema()
    with connect() as conn:
        if user_id:
            row = conn.execute(
                "SELECT * FROM font_tasks WHERE id = ? AND user_id = ?",
                (task_id, user_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM font_tasks WHERE id = ?",
                (task_id,),
            ).fetchone()
    return _row_to_task(row) if row else None


def update_task(task_id: str, **fields: Any) -> dict[str, Any] | None:
    """Update allowed columns. Keys are snake_case DB columns."""
    init_schema()
    allowed = {
        "status",
        "progress",
        "description",
        "reference_url",
        "charset_text",
        "style_object_key",
        "ttf_object_key",
        "ttf_url",
        "preview_url",
        "asset_id",
        "family_name",
        "error",
        "meta_json",
    }
    sets: list[str] = []
    vals: list[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        if key == "meta_json" and value is not None and not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        sets.append(f"{key} = ?")
        vals.append(value)
    if not sets:
        return get_task(task_id)
    sets.append("updated_at = ?")
    vals.append(time.time())
    vals.append(task_id)
    with connect() as conn:
        conn.execute(
            f"UPDATE font_tasks SET {', '.join(sets)} WHERE id = ?",
            tuple(vals),
        )
        row = conn.execute("SELECT * FROM font_tasks WHERE id = ?", (task_id,)).fetchone()
    return _row_to_task(row) if row else None


def list_tasks(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 24), 100))
    offset = (page_n - 1) * page_size_n
    with connect() as conn:
        total_row = conn.execute(
            "SELECT COUNT(*) AS c FROM font_tasks WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        rows = conn.execute(
            """
            SELECT * FROM font_tasks
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, page_size_n, offset),
        ).fetchall()
    total = int(total_row["c"] if total_row else 0)
    items = [_row_to_task(r) for r in rows]
    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(items) < total,
    }
