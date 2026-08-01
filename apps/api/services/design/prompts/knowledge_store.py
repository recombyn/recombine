"""Design knowledge base — scene/skill scoped prompt injection (not global rules)."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from services.db import connect
from services.design.catalog import ensure_design_catalog

_KNOWLEDGE_READY = False
_KNOWLEDGE_LOCK = threading.RLock()


def _load_knowledge_seed() -> tuple[dict[str, str], list[dict[str, Any]]]:
    """Load kind labels + seed rows from apps/api/data/design_knowledge_seed.json."""
    path = Path(__file__).resolve().parents[3] / "data" / "design_knowledge_seed.json"
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


def ensure_design_knowledge() -> None:
    """Insert missing seed knowledge rows. Never overwrite Admin edits."""
    global _KNOWLEDGE_READY
    if _KNOWLEDGE_READY:
        # Catalog-ready flag can outlive a switched SQLITE_DB_PATH in tests.
        try:
            with connect() as conn:
                conn.execute("SELECT 1 FROM design_knowledge LIMIT 1").fetchone()
            return
        except Exception:
            _KNOWLEDGE_READY = False
    # Do not call ensure_design_catalog() here — catalog invokes this while still
    # holding the ensure lock and before _CATALOG_READY, which would recurse forever.
    with _KNOWLEDGE_LOCK:
        if _KNOWLEDGE_READY:
            try:
                with connect() as conn:
                    conn.execute("SELECT 1 FROM design_knowledge LIMIT 1").fetchone()
                return
            except Exception:
                _KNOWLEDGE_READY = False
        now = time.time()
        from services.db import dialect, init_schema
        from services.design.schema import ensure_design_tables

        init_schema()
        with connect() as conn:
            ensure_design_tables(conn, mysql=dialect() == "mysql")
            existing_keys = {
                (str(r["kind"] or ""), str(r["title"] or ""))
                for r in conn.execute("SELECT kind, title FROM design_knowledge").fetchall()
            }
            for item in _SEED:
                kind = str(item["kind"])
                title = str(item["title"])
                if (kind, title) in existing_keys:
                    continue
                body = str(item["body"])
                conn.execute(
                    """
                    INSERT INTO design_knowledge
                    (kind, title, body, when_to_use, scenes, skill_categories, sort_order, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        kind,
                        title,
                        body,
                        item.get("when_to_use") or "",
                        item.get("scenes") or "all",
                        item.get("skill_categories") or "all",
                        int(item.get("sort_order") or 0),
                        now,
                        now,
                    ),
                )
                existing_keys.add((kind, title))
            conn.commit()
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
    clauses: list[str] = []
    params: list[Any] = []
    if kind:
        clauses.append("kind = ?")
        params.append(kind)
    if enabled is not None:
        clauses.append("enabled = ?")
        params.append(1 if enabled else 0)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM design_knowledge{where} ORDER BY sort_order ASC, id ASC",
            tuple(params),
        ).fetchall()
    return [_pub(r) for r in rows]


def upsert_knowledge(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    ensure_design_knowledge()
    now = time.time()
    kid = payload.get("id")
    kind = str(payload.get("kind") or "").strip()[:32]
    title = str(payload.get("title") or "").strip()[:128]
    body = str(payload.get("body") or "").strip()
    if not kind or not title or not body:
        raise ValueError("kind, title, body required")
    when = str(payload.get("whenToUse") or payload.get("when_to_use") or "").strip()
    scenes = str(payload.get("scenes") or "all").strip()[:128] or "all"
    cats = str(payload.get("skillCategories") or payload.get("skill_categories") or "all").strip()[:128] or "all"
    sort_order = int(payload.get("sortOrder") or payload.get("sort_order") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    with connect() as conn:
        if kid:
            conn.execute(
                """
                UPDATE design_knowledge SET kind=?, title=?, body=?, when_to_use=?, scenes=?,
                skill_categories=?, sort_order=?, enabled=?, updated_at=? WHERE id=?
                """,
                (kind, title, body, when, scenes, cats, sort_order, enabled, now, int(kid)),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM design_knowledge WHERE id=?", (int(kid),)).fetchone()
        else:
            cur = conn.execute(
                """
                INSERT INTO design_knowledge
                (kind, title, body, when_to_use, scenes, skill_categories, sort_order, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (kind, title, body, when, scenes, cats, sort_order, enabled, now, now),
            )
            conn.commit()
            new_id = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM design_knowledge WHERE id=?", (new_id,)).fetchone()
    if not row:
        raise ValueError("upsert failed")
    return _pub(row)


def soft_delete_knowledge(item_id: int) -> bool:
    ensure_design_catalog()
    ensure_design_knowledge()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE design_knowledge SET enabled=0, updated_at=? WHERE id=?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        return cur.rowcount > 0


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
        if not _csv_has(row["scenes"], scene_l):
            continue
        sc = str(row.get("skillCategories") or "all")
        parts = {p.strip().lower() for p in sc.split(",") if p.strip()}
        if parts and "all" not in parts and not (parts & cats):
            continue
        out.append(row)
    out.sort(key=lambda x: (int(x.get("sortOrder") or 0), int(x.get("id") or 0)))
    return out


def format_knowledge_block(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    try:
        from services.design.prompt_pack_store import resolve_prompt_body

        header = resolve_prompt_body("agent.prompt.knowledge_details_header").strip()
    except Exception:
        header = ""
    parts = [
        header
        or (
            "以下为可选设计知识【规范】：按 USER_PROMPT 自行选用，不必套全；"
            "与用户明示冲突时以用户为准。"
        )
    ]
    for r in rows:
        label = KIND_LABELS.get(r["kind"], r["kind"])
        title = r.get("title") or label
        when = (r.get("whenToUse") or "").strip()
        head = f"【{label}·{title}】"
        if when:
            head += f"\n适用：{when}"
        parts.append(f"{head}\n{r.get('body') or ''}".strip())
    return "\n\n".join(parts)


def format_knowledge_catalog(*, scene: str = "website") -> str:
    """Short index of enabled knowledge (kinds + titles) for deferred loading."""
    scene_l = str(scene or "website").strip().lower() or "website"
    rows = list_knowledge(enabled=True, ensure=True)
    try:
        from services.design.prompt_pack_store import resolve_prompt_body

        header = resolve_prompt_body("agent.prompt.knowledge_catalog_header").strip()
    except Exception:
        header = ""
    lines: list[str] = [
        header or "设计知识目录（用 need_knowledge: [\"palette\", …] 申请正文）："
    ]
    seen_line: set[str] = set()
    for r in rows:
        scenes = str(r.get("scenes") or "all")
        if not (_csv_has(scenes, scene_l) or _csv_has(scenes, "all")):
            continue
        kind = str(r.get("kind") or "").strip()
        if not kind:
            continue
        label = KIND_LABELS.get(kind, kind)
        title = str(r.get("title") or label).strip()
        line = f"- `{kind}` — {label}·{title}"
        if line in seen_line:
            continue
        seen_line.add(line)
        lines.append(line)
        if len(lines) >= 40:
            break
    if len(lines) == 1:
        lines.append("（本场景暂无启用知识）")
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
        items = [p.strip() for p in s.replace("；", ",").split(",")]
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
    """Full knowledge bodies for selected kinds (scene-filtered). kinds=['*'] → all."""
    scene_l = str(scene or "website").strip().lower() or "website"
    wanted = [str(k).strip().lower() for k in (kinds or []) if str(k).strip()]
    if not wanted:
        return ""
    load_all = "*" in wanted
    rows: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    source = list_knowledge(enabled=True, ensure=True)
    for r in source:
        kind = str(r.get("kind") or "").strip().lower()
        if not load_all and kind not in wanted:
            continue
        scenes = str(r.get("scenes") or "all")
        if not (_csv_has(scenes, scene_l) or _csv_has(scenes, "all")):
            continue
        rid = int(r.get("id") or 0)
        if rid and rid in seen_ids:
            continue
        if rid:
            seen_ids.add(rid)
        rows.append(r)
        if load_all and len(rows) >= 12:
            break
    return format_knowledge_block(rows)
