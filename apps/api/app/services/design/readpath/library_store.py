"""Design library items (styles / templates / icons)."""
from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session

from app import crud
from app.core.db import engine
from app.services.design.readpath.catalog import ensure_design_catalog


def _pub(r: Any) -> dict[str, Any]:
    meta = None
    if r.meta_json:
        try:
            meta = json.loads(r.meta_json)
        except Exception:
            meta = None
    return {
        "id": int(r.id or 0),
        "name": r.name,
        "kind": r.kind or "style",
        "scene": r.scene or "all",
        "coverUrl": r.cover_url or "",
        "tags": r.tags or "",
        "description": r.description or "",
        "enabled": bool(int(r.enabled or 0)),
        "sortOrder": int(r.sort_order or 0),
        "meta": meta,
        "updatedAt": int(float(r.updated_at) * 1000) if r.updated_at else None,
        "createdAt": int(float(r.created_at) * 1000) if r.created_at else None,
    }


def get_library_item(item_id: int) -> dict[str, Any] | None:
    ensure_design_catalog()
    with Session(engine) as session:
        row = crud.get_library_item(session=session, item_id=int(item_id))
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
    with Session(engine) as session:
        rows, total = crud.list_library_items(
            session=session,
            kind=kind,
            scene=scene,
            q=q,
            enabled=enabled,
            offset=offset,
            limit=page_size_n,
        )
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
    with Session(engine) as session:
        row = crud.upsert_library_item(
            session=session,
            item_id=int(item_id) if item_id else None,
            name=name,
            kind=kind,
            scene=scene,
            cover_url=cover_url,
            tags=tags,
            description=description,
            enabled=enabled,
            sort_order=sort_order,
            meta_json=meta_json,
        )
    return _pub(row)


def soft_delete_library_item(item_id: int) -> bool:
    ensure_design_catalog()
    with Session(engine) as session:
        return crud.soft_delete_library_item(session=session, item_id=int(item_id))


def hard_delete_library_item(item_id: int) -> bool:
    ensure_design_catalog()
    with Session(engine) as session:
        return crud.hard_delete_library_item(session=session, item_id=int(item_id))
