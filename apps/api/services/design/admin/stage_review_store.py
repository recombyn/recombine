"""Admin stage-review persistence (legacy training ratings)."""

from __future__ import annotations

import time
from typing import Any

from services.db import connect
from services.design.catalog import ensure_design_catalog


def insert_stage_review(row: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO design_stage_review (
                task_id, user_id, scene, skill_index, skill_id, skill_name, skill_category,
                rating, verdict, comment, preview_svg, tokens, model_actual, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["task_id"],
                row["user_id"],
                row.get("scene"),
                int(row.get("skill_index") or 0),
                row.get("skill_id"),
                row.get("skill_name"),
                row.get("skill_category"),
                int(row.get("rating") or 0),
                str(row.get("verdict") or "pass"),
                row.get("comment"),
                row.get("preview_svg"),
                int(row.get("tokens") or 0),
                row.get("model_actual"),
                float(row.get("created_at") or time.time()),
            ),
        )
        conn.commit()


def list_stage_reviews(
    *,
    page: int = 1,
    page_size: int = 50,
    skill_id: int | None = None,
    min_rating: int | None = None,
    max_rating: int | None = None,
) -> dict[str, Any]:
    ensure_design_catalog()
    where = ["1=1"]
    params: list[Any] = []
    if skill_id is not None:
        where.append("skill_id = ?")
        params.append(int(skill_id))
    if min_rating is not None:
        where.append("rating >= ?")
        params.append(int(min_rating))
    if max_rating is not None:
        where.append("rating <= ?")
        params.append(int(max_rating))
    page = max(1, int(page or 1))
    page_size = max(1, min(100, int(page_size or 50)))
    offset = (page - 1) * page_size
    sql_where = " AND ".join(where)
    with connect() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM design_stage_review WHERE {sql_where}",
            tuple(params),
        ).fetchone()["c"]
        rows = conn.execute(
            f"""
            SELECT * FROM design_stage_review
            WHERE {sql_where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size, offset]),
        ).fetchall()
    items = []
    for r in rows:
        items.append(
            {
                "id": int(r["id"]),
                "taskId": r["task_id"],
                "userId": r["user_id"],
                "scene": r["scene"],
                "skillIndex": int(r["skill_index"] or 0),
                "skillId": int(r["skill_id"]) if r["skill_id"] is not None else None,
                "skillName": r["skill_name"],
                "skillCategory": r["skill_category"],
                "rating": int(r["rating"] or 0),
                "verdict": r["verdict"] or "pass",
                "comment": r["comment"] or "",
                "tokens": int(r["tokens"] or 0),
                "modelActual": r["model_actual"],
                "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
            }
        )
    return {"items": items, "total": int(total), "page": page, "pageSize": page_size}
