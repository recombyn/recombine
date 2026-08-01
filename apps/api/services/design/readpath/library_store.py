"""Official design library items (styles / templates / icons)."""
from __future__ import annotations

import json
import time
from typing import Any

from services.db import connect
from services.design.readpath.catalog import ensure_design_catalog


def _pub(r: Any) -> dict[str, Any]:
    meta = None
    if r["meta_json"]:
        try:
            meta = json.loads(r["meta_json"])
        except Exception:
            meta = None
    return {
        "id": int(r["id"]),
        "name": r["name"],
        "kind": r["kind"] or "style",
        "scene": r["scene"] or "all",
        "coverUrl": r["cover_url"] or "",
        "tags": r["tags"] or "",
        "description": r["description"] or "",
        "enabled": bool(int(r["enabled"] or 0)),
        "sortOrder": int(r["sort_order"] or 0),
        "meta": meta,
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
        "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
    }


def get_library_item(item_id: int) -> dict[str, Any] | None:
    ensure_design_catalog()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM design_library_item WHERE id = ?",
            (int(item_id),),
        ).fetchone()
    return _pub(row) if row else None


def list_library_items(
    *,
    kind: str | None = None,
    scene: str | None = None,
    q: str | None = None,
    enabled: bool | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    ensure_design_catalog()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 24), 100))
    offset = (page_n - 1) * page_size_n
    where = ["1=1"]
    params: list[Any] = []
    if kind and kind.strip():
        where.append("kind = ?")
        params.append(kind.strip())
    if scene and scene.strip() and scene.strip() != "all":
        where.append("(scene = ? OR scene = 'all' OR scene LIKE ?)")
        params.extend([scene.strip(), f"%{scene.strip()}%"])
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    if q and q.strip():
        like = f"%{q.strip()}%"
        where.append("(name LIKE ? OR tags LIKE ? OR description LIKE ?)")
        params.extend([like, like, like])
    where_sql = " AND ".join(where)
    with connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM design_library_item WHERE {where_sql}",
            tuple(params),
        ).fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            f"""
            SELECT * FROM design_library_item
            WHERE {where_sql}
            ORDER BY sort_order ASC, id DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [page_size_n, offset]),
        ).fetchall()
    items = [_pub(r) for r in rows]
    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(items) < total,
    }


def upsert_library_item(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("name required")
    kind = str(payload.get("kind") or "style").strip() or "style"
    scene = str(payload.get("scene") or "all").strip() or "all"
    cover_url = str(payload.get("coverUrl") or "").strip()
    tags = str(payload.get("tags") or "").strip()
    description = str(payload.get("description") or "").strip()
    enabled = 1 if payload.get("enabled", True) else 0
    sort_order = int(payload.get("sortOrder") or 0)
    meta = payload.get("meta")
    meta_json = json.dumps(meta, ensure_ascii=False) if meta is not None else None
    item_id = payload.get("id")
    now = time.time()
    with connect() as conn:
        if item_id:
            conn.execute(
                """
                UPDATE design_library_item SET
                  name=?, kind=?, scene=?, cover_url=?, tags=?, description=?,
                  enabled=?, sort_order=?, meta_json=?, updated_at=?
                WHERE id=?
                """,
                (
                    name, kind, scene, cover_url, tags, description,
                    enabled, sort_order, meta_json, now, int(item_id),
                ),
            )
            row = conn.execute(
                "SELECT * FROM design_library_item WHERE id = ?", (int(item_id),)
            ).fetchone()
        else:
            cur = conn.execute(
                """
                INSERT INTO design_library_item (
                  name, kind, scene, cover_url, tags, description,
                  enabled, sort_order, meta_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name, kind, scene, cover_url, tags, description,
                    enabled, sort_order, meta_json, now, now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM design_library_item WHERE id = ?", (int(cur.lastrowid),)
            ).fetchone()
        conn.commit()
    return _pub(row)


def soft_delete_library_item(item_id: int) -> bool:
    ensure_design_catalog()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE design_library_item SET enabled = 0, updated_at = ? WHERE id = ?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0


def hard_delete_library_item(item_id: int) -> bool:
    ensure_design_catalog()
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM design_library_item WHERE id = ?",
            (int(item_id),),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0
