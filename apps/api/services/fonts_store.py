"""Font catalog store — seeded from apps/api/data/public/fonts_seed.json."""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from services.db import connect, init_schema


def _slug(family: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", (family or "").strip()).strip("_").lower()
    return (s or "font")[:48]


def _row_to_item(row: Any) -> dict[str, Any]:
    children: list[Any] = []
    try:
        parsed = json.loads(row["faces_json"] or "[]")
        if isinstance(parsed, list):
            children = parsed
    except json.JSONDecodeError:
        children = []
    return {
        "family": row["family"],
        "displayName": row["display_name"],
        "children": children,
        "id": row["id"],
        "sortOrder": int(row["sort_order"] or 0),
    }


def list_fonts(
    *,
    page: int = 1,
    page_size: int = 100,
) -> dict[str, Any]:
    init_schema()
    page_n = max(1, int(page or 1))
    page_size_n = max(1, min(int(page_size or 100), 500))
    offset = (page_n - 1) * page_size_n
    with connect() as conn:
        total_row = conn.execute("SELECT COUNT(*) AS c FROM fonts").fetchone()
        total = int(total_row["c"] if total_row else 0)
        rows = conn.execute(
            """
            SELECT id, family, display_name, faces_json, sort_order, created_at
            FROM fonts
            ORDER BY sort_order ASC, family ASC
            LIMIT ? OFFSET ?
            """,
            (page_size_n, offset),
        ).fetchall()
    items = [_row_to_item(r) for r in rows]
    return {
        "items": items,
        "page": page_n,
        "pageSize": page_size_n,
        "total": total,
        "hasMore": offset + len(items) < total,
    }


def get_font_by_family(family: str) -> dict[str, Any] | None:
    init_schema()
    key = (family or "").strip()
    if not key:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, family, display_name, faces_json, sort_order, created_at
            FROM fonts WHERE family = ?
            """,
            (key,),
        ).fetchone()
    return _row_to_item(row) if row else None


def upsert_font(
    *,
    family: str,
    display_name: str | None = None,
    children: list[dict[str, Any]] | None = None,
    sort_order: int | None = None,
) -> dict[str, Any]:
    """Insert or replace a font family row (matched by ``family``)."""
    init_schema()
    fam = (family or "").strip()
    if not fam:
        raise ValueError("family required")
    display = (display_name or fam).strip() or fam
    faces = children if isinstance(children, list) else []
    # Keep only faces that declare a file URL (weight UI depends on real files).
    normalized: list[dict[str, Any]] = []
    for raw in faces:
        if not isinstance(raw, dict):
            continue
        url = str(raw.get("url") or "").strip()
        if not url:
            continue
        face_family = str(raw.get("family") or fam).strip() or fam
        label = str(raw.get("displayName") or "Regular").strip() or "Regular"
        weight = raw.get("weight")
        try:
            weight_n = int(weight) if weight is not None else 400
        except (TypeError, ValueError):
            weight_n = 400
        fmt = str(raw.get("format") or "").strip() or None
        normalized.append(
            {
                "family": face_family,
                "displayName": label,
                "weight": weight_n,
                "url": url,
                **({"format": fmt} if fmt else {}),
            }
        )
    faces_json = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    now = time.time()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id, sort_order FROM fonts WHERE family = ?",
            (fam,),
        ).fetchone()
        if existing:
            fid = existing["id"]
            order = int(sort_order) if sort_order is not None else int(existing["sort_order"] or 0)
            conn.execute(
                """
                UPDATE fonts
                SET display_name = ?, faces_json = ?, sort_order = ?
                WHERE id = ?
                """,
                (display, faces_json, order, fid),
            )
        else:
            fid = f"font_{uuid.uuid4().hex[:10]}_{_slug(fam)}"
            order = int(sort_order) if sort_order is not None else 9999
            conn.execute(
                """
                INSERT INTO fonts (id, family, display_name, faces_json, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (fid, fam, display, faces_json, order, now),
            )
        conn.commit()
        row = conn.execute(
            """
            SELECT id, family, display_name, faces_json, sort_order, created_at
            FROM fonts WHERE id = ?
            """,
            (fid,),
        ).fetchone()
    return _row_to_item(row)


def delete_font(family: str) -> bool:
    init_schema()
    fam = (family or "").strip()
    if not fam:
        return False
    with connect() as conn:
        cur = conn.execute("DELETE FROM fonts WHERE family = ?", (fam,))
        conn.commit()
        return int(cur.rowcount or 0) > 0
