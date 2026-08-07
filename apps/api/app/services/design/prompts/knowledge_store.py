"""Design knowledge base — scene/skill scoped prompt injection (not global rules)."""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from sqlmodel import Session

from app import crud
from app.core import db as core_db
from app.services.design.readpath.catalog import ensure_design_catalog

_KNOWLEDGE_READY = False
_KNOWLEDGE_LOCK = threading.RLock()


def _load_knowledge_seed() -> tuple[dict[str, str], list[dict[str, Any]]]:
    """Load kind labels + seed rows from apps/api/data/."""
    from app.core.config import resolve_data_file

    path = resolve_data_file("design_knowledge_seed.json")
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}, []
    if not isinstance(parsed, dict):
        return {}, []
    labels_raw = parsed.get("kindLabels") or {}
    labels = (
        {str(k): str(v) for k, v in labels_raw.items()}
        if isinstance(labels_raw, dict)
        else {}
    )
    items_raw = parsed.get("items") or []
    items = (
        [x for x in items_raw if isinstance(x, dict)]
        if isinstance(items_raw, list)
        else []
    )
    return labels, items


KIND_LABELS, _SEED = _load_knowledge_seed()


def _csv_has(csv: str, token: str) -> bool:
    parts = {p.strip().lower() for p in str(csv or "").split(",") if p.strip()}
    if not parts or "all" in parts:
        return True
    return token.strip().lower() in parts


def _pub(r: Any) -> dict[str, Any]:
    if hasattr(r, "model_dump"):
        return {
            "id": int(r.id or 0),
            "kind": str(r.kind or ""),
            "title": str(r.title or ""),
            "body": str(r.body or ""),
            "whenToUse": str(r.when_to_use or ""),
            "scenes": str(r.scenes or "all"),
            "skillCategories": str(r.skill_categories or "all"),
            "sortOrder": int(r.sort_order or 0),
            "enabled": bool(int(r.enabled or 0)),
            "updatedAt": int(float(r.updated_at) * 1000) if r.updated_at else None,
        }
    return {
        "id": int(r["id"]),
        "kind": str(r["kind"] or ""),
        "title": str(r["title"] or ""),
        "body": str(r["body"] or ""),
        "whenToUse": str(r["when_to_use"] or ""),
        "scenes": str(r["scenes"] or "all"),
        "skillCategories": str(r["skill_categories"] or "all"),
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def _knowledge_seed_needed(session: Session) -> bool:
    """True when seed rows exist but the active DB has none (stale ready flag / new file)."""
    if not _SEED:
        return False
    return len(crud.list_design_knowledge_keys(session=session)) == 0


def ensure_design_knowledge() -> None:
    """Insert missing seed knowledge rows. Never overwrite Admin edits."""
    global _KNOWLEDGE_READY
    if _KNOWLEDGE_READY:
        # Catalog-ready flag can outlive a switched SQLITE_DB_PATH in tests.
        try:
            with Session(core_db.engine) as session:
                if not _knowledge_seed_needed(session):
                    return
            _KNOWLEDGE_READY = False
        except Exception:
            _KNOWLEDGE_READY = False
    # Do not call ensure_design_catalog() here — catalog invokes this while still
    # holding the ensure lock and before _CATALOG_READY, which would recurse forever.
    with _KNOWLEDGE_LOCK:
        if _KNOWLEDGE_READY:
            try:
                with Session(core_db.engine) as session:
                    if not _knowledge_seed_needed(session):
                        return
                _KNOWLEDGE_READY = False
            except Exception:
                _KNOWLEDGE_READY = False
        now = time.time()
        from app.services.db import init_schema
        from app.services.design.admin.schema import ensure_design_tables_boot

        init_schema()
        ensure_design_tables_boot()
        with Session(core_db.engine) as session:
            existing_keys = crud.list_design_knowledge_keys(session=session)
            for item in _SEED:
                kind = str(item["kind"])
                title = str(item["title"])
                if (kind, title) in existing_keys:
                    continue
                crud.insert_design_knowledge_seed(
                    session=session,
                    kind=kind,
                    title=title,
                    body=str(item["body"]),
                    when_to_use=str(item.get("when_to_use") or ""),
                    scenes=str(item.get("scenes") or "all"),
                    skill_categories=str(item.get("skill_categories") or "all"),
                    sort_order=int(item.get("sort_order") or 0),
                    created_at=now,
                )
                existing_keys.add((kind, title))
            session.commit()
        _KNOWLEDGE_READY = True


def list_knowledge(
    *,
    kind: str | None = None,
    enabled: bool | None = True,
    ensure: bool = True,
) -> list[dict[str, Any]]:
    if ensure:
        ensure_design_catalog()
        ensure_design_knowledge()
    with Session(core_db.engine) as session:
        rows = crud.list_design_knowledge(
            session=session, kind=kind, enabled=enabled
        )
    return [_pub(r) for r in rows]


def upsert_knowledge(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    ensure_design_knowledge()
    kid = payload.get("id")
    kind = str(payload.get("kind") or "").strip()[:32]
    title = str(payload.get("title") or "").strip()[:128]
    body = str(payload.get("body") or "").strip()
    if not kind or not title or not body:
        raise ValueError("kind, title, body required")
    when = str(payload.get("whenToUse") or payload.get("when_to_use") or "").strip()
    scenes = str(payload.get("scenes") or "all").strip()[:128] or "all"
    cats = str(
        payload.get("skillCategories") or payload.get("skill_categories") or "all"
    ).strip()[:128] or "all"
    sort_order = int(payload.get("sortOrder") or payload.get("sort_order") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    with Session(core_db.engine) as session:
        row = crud.upsert_design_knowledge(
            session=session,
            item_id=int(kid) if kid else None,
            kind=kind,
            title=title,
            body=body,
            when_to_use=when,
            scenes=scenes,
            skill_categories=cats,
            sort_order=sort_order,
            enabled=enabled,
        )
    return _pub(row)


def soft_delete_knowledge(item_id: int) -> bool:
    ensure_design_catalog()
    ensure_design_knowledge()
    with Session(core_db.engine) as session:
        return crud.soft_delete_design_knowledge(
            session=session, item_id=int(item_id)
        )


def _skill_categories(skill_category: str) -> set[str]:
    c = str(skill_category or "").strip().lower()
    out: set[str] = {c} if c else set()
    if c == "plan":
        # Design-thinking step needs the full knowledge stack before draw.
        out |= {"layout", "refine", "validate", "color"}
    return out


def list_for_injection(*, scene: str, skill_category: str) -> list[dict[str, Any]]:
    """Return enabled knowledge rows matching scene + skill category (admin CSV)."""
    # Read-only for design-run hot path — seed/bootstrap is process startup.
    scene_l = str(scene or "website").strip().lower() or "website"
    cats = _skill_categories(skill_category)
    if not cats:
        return []
    out: list[dict[str, Any]] = []
    for row in list_knowledge(enabled=True, ensure=False):
        if not _csv_has(str(row.get("scenes") or "all"), scene_l):
            continue
        row_cats = {
            p.strip().lower()
            for p in str(row.get("skillCategories") or "all").split(",")
            if p.strip()
        }
        if row_cats and "all" not in row_cats and not (row_cats & cats):
            continue
        out.append(row)
    return out


def format_knowledge_block(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    parts: list[str] = []
    for r in rows:
        title = str(r.get("title") or "").strip()
        body = str(r.get("body") or "").strip()
        if not body:
            continue
        kind = str(r.get("kind") or "").strip()
        label = KIND_LABELS.get(kind, kind)
        head = f"### {label}: {title}" if title else f"### {label}"
        parts.append(f"{head}\n{body}")
    return "\n\n".join(parts)


def format_knowledge_catalog(*, scene: str = "website") -> str:
    scene_l = str(scene or "website").strip().lower() or "website"
    rows = [
        r
        for r in list_knowledge(enabled=True, ensure=True)
        if _csv_has(str(r.get("scenes") or "all"), scene_l)
    ]
    if not rows:
        return ""
    lines = ["Available knowledge kinds (request via need_knowledge):"]
    for r in rows:
        kind = str(r.get("kind") or "").strip()
        title = str(r.get("title") or "").strip()
        when = str(r.get("whenToUse") or "").strip()
        label = KIND_LABELS.get(kind, kind)
        bit = f"- `{kind}` ({label}): {title}"
        if when:
            bit += f" — {when}"
        lines.append(bit)
    return "\n".join(lines)


def normalize_need_knowledge(raw: Any, *, max_n: int = 8) -> list[str]:
    """Parse model need_knowledge → kind keys (deduped). True → ['*'] (all for scene)."""
    if raw is None or raw is False:
        return []
    if raw is True:
        return ["*"]
    items: list[Any]
    if isinstance(raw, str):
        s = raw.strip()
        if s.lower() in ("1", "true", "yes", "all", "*"):
            return ["*"]
        items = [p.strip() for p in s.replace(";", ",").split(",")]
    elif isinstance(raw, list):
        items = raw
    else:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = str(item or "").strip().lower()
        if not key or key in seen:
            continue
        if key in ("all", "*"):
            return ["*"]
        seen.add(key)
        out.append(key)
        if len(out) >= max_n:
            break
    return out


def format_knowledge_details(*, kinds: list[str], scene: str = "website") -> str:
    want = {k.strip().lower() for k in kinds if str(k).strip()}
    if not want:
        return ""
    scene_l = str(scene or "website").strip().lower() or "website"
    rows = [
        r
        for r in list_knowledge(enabled=True, ensure=False)
        if str(r.get("kind") or "").strip().lower() in want
        and _csv_has(str(r.get("scenes") or "all"), scene_l)
    ]
    return format_knowledge_block(rows)
