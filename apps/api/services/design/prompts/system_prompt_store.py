"""System prompts (agent / aesthetics / persona) — dedicated table, not dict+KV split."""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from services.db import connect

_READY = False
_LOCK = threading.RLock()

GROUP_LABELS: dict[str, str] = {
    "agent_prompt": "Agent 提示词",
    "agent_persona": "Agent 人设",
    "aesthetics": "美学 / 看图",
    "precheck": "预检 / 路由",
}


def is_system_prompt_key(key: str) -> bool:
    k = (key or "").strip()
    if not k:
        return False
    return (
        k.startswith("agent.prompt.")
        or k.startswith("agent.persona.")
        or k.startswith("aesthetics.prompt.")
        or k == "aesthetics.vision.structure_schema"
        or k == "precheck.router_system"
    )


def _load_seed_items() -> list[dict[str, Any]]:
    """Metadata + bodies from the single design_prompt_packs_seed.json (system-key kinds)."""
    from config.settings import resolve_data_file

    path = resolve_data_file("design_prompt_packs_seed.json")
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(parsed, dict):
        return []
    raw = parsed.get("items") or []
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for x in raw:
        if not isinstance(x, dict):
            continue
        key = str(x.get("kind") or "").strip()
        if not key or not is_system_prompt_key(key):
            continue
        out.append(
            {
                "key": key,
                "label": str(x.get("title") or key).strip() or key,
                "group": str(x.get("group") or "").strip() or _infer_group(key),
                "selectable": bool(x.get("selectable")),
                "sortOrder": int(x.get("sort_order") or 0),
                "description": str(x.get("when_to_use") or "").strip(),
                "body": str(x.get("body") or ""),
            }
        )
    return out


def _infer_group(key: str) -> str:
    if key.startswith("agent.persona."):
        return "agent_persona"
    if key.startswith("aesthetics."):
        return "aesthetics"
    if key.startswith("precheck."):
        return "precheck"
    return "agent_prompt"


def _row_to_item(row: Any) -> dict[str, Any]:
    key = str(row["prompt_key"] or "")
    group = str(row["group_key"] or "") or "agent_prompt"
    return {
        "key": key,
        "label": str(row["label"] or "") or key,
        "description": str(row["description"] or ""),
        "body": str(row["body"] or ""),
        "group": group,
        "groupLabel": GROUP_LABELS.get(group, group),
        "selectable": bool(int(row["selectable"] or 0)),
        "sortOrder": int(row["sort_order"] or 0),
        "enabled": bool(int(row["enabled"] or 0)),
        "usingDefault": not bool(str(row["body"] or "").strip()),
        "updatedAt": float(row["updated_at"] or 0),
    }


def ensure_system_prompts() -> None:
    """Insert missing rows from prompt-pack seed; migrate legacy KV once. Never overwrite Admin body.

    Do not call ``ensure_design_catalog`` here — catalog invokes this while bootstrapping.
    """
    global _READY
    if _READY:
        return
    with _LOCK:
        if _READY:
            return
        seed_items = _load_seed_items()
        now = time.time()
        with connect() as conn:
            existing_rows = conn.execute(
                "SELECT prompt_key FROM design_system_prompt"
            ).fetchall()
            existing = {str(r["prompt_key"]) for r in existing_rows}

            legacy: dict[str, str] = {}
            try:
                legacy_rows = conn.execute(
                    "SELECT rule_key, rule_value FROM design_global_rule"
                ).fetchall()
                for r in legacy_rows:
                    rk = str(r["rule_key"] or "")
                    if is_system_prompt_key(rk):
                        legacy[rk] = str(r["rule_value"] or "")
            except Exception:
                legacy = {}

            for it in seed_items:
                key = str(it.get("key") or "").strip()
                if not key or key in existing:
                    continue
                label = str(it.get("label") or "").strip() or key
                group = str(it.get("group") or "").strip() or _infer_group(key)
                selectable = 1 if bool(it.get("selectable")) else 0
                sort_order = int(it.get("sortOrder") or 0)
                desc = str(it.get("description") or "").strip()
                body = str(legacy.get(key) or it.get("body") or "")
                conn.execute(
                    """
                    INSERT INTO design_system_prompt
                        (prompt_key, label, description, body, group_key,
                         selectable, sort_order, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        key,
                        label,
                        desc,
                        body,
                        group,
                        selectable,
                        sort_order,
                        now,
                        now,
                    ),
                )
                existing.add(key)

            for it in seed_items:
                key = str(it.get("key") or "").strip()
                if not key:
                    continue
                label = str(it.get("label") or "").strip()
                desc = str(it.get("description") or "").strip()
                group = str(it.get("group") or "").strip() or _infer_group(key)
                selectable = 1 if bool(it.get("selectable")) else 0
                sort_order = int(it.get("sortOrder") or 0)
                if label:
                    conn.execute(
                        """
                        UPDATE design_system_prompt
                        SET label = CASE
                                WHEN label IS NULL OR label = '' OR label = prompt_key THEN ?
                                ELSE label
                            END,
                            group_key = ?, selectable = ?, sort_order = ?,
                            description = CASE
                                WHEN description IS NULL OR description = '' THEN ?
                                ELSE description
                            END
                        WHERE prompt_key = ?
                        """,
                        (label, group, selectable, sort_order, desc, key),
                    )

            for key in list(legacy.keys()):
                try:
                    conn.execute(
                        "DELETE FROM design_global_rule WHERE rule_key = ?", (key,)
                    )
                except Exception:
                    pass

            conn.commit()
        _READY = True


def list_system_prompts(
    *,
    group: str | None = None,
    selectable: bool | None = None,
    enabled: bool | None = True,
    ensure: bool = True,
) -> list[dict[str, Any]]:
    if ensure:
        from services.design.readpath.catalog import catalog_ready, ensure_design_catalog

        if not catalog_ready():
            ensure_design_catalog()
        ensure_system_prompts()
    clauses: list[str] = []
    params: list[Any] = []
    if enabled is not None:
        clauses.append("enabled = ?")
        params.append(1 if enabled else 0)
    if group:
        clauses.append("group_key = ?")
        params.append(str(group).strip())
    if selectable is not None:
        clauses.append("selectable = ?")
        params.append(1 if selectable else 0)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM design_system_prompt
            {where}
            ORDER BY group_key ASC, sort_order ASC, prompt_key ASC
            """,
            tuple(params),
        ).fetchall()
    return [_row_to_item(r) for r in rows]


def get_system_prompt_bodies(*, ensure: bool = True) -> dict[str, str]:
    """Enabled prompt_key → body.

    Prefer ``design_prompt_pack`` (kind = prompt_key). Fall back to
    ``design_system_prompt`` for keys not yet migrated.
    """
    if ensure:
        from services.design.readpath.catalog import catalog_ready, ensure_design_catalog

        if not catalog_ready():
            ensure_design_catalog()
        ensure_system_prompts()
        try:
            from services.design.prompts.prompt_pack_store import ensure_design_prompt_packs

            ensure_design_prompt_packs()
        except Exception:
            pass

    out: dict[str, str] = {}
    try:
        from services.design.prompts.prompt_pack_store import list_prompt_pack_bodies_for_system

        out.update(list_prompt_pack_bodies_for_system(ensure=False))
    except Exception:
        pass

    with connect() as conn:
        rows = conn.execute(
            """
            SELECT prompt_key, body FROM design_system_prompt
            WHERE COALESCE(enabled, 1) = 1
            """
        ).fetchall()
    for r in rows:
        key = str(r["prompt_key"] or "").strip()
        if not key:
            continue
        body = str(r["body"] or "")
        if key not in out or not str(out.get(key) or "").strip():
            out[key] = body
    return out


def upsert_system_prompt(
    *,
    key: str,
    body: str | None = None,
    label: str | None = None,
    description: str | None = None,
    group: str | None = None,
    selectable: bool | None = None,
    sort_order: int | None = None,
    enabled: bool | None = None,
) -> dict[str, Any]:
    from services.design.readpath.catalog import catalog_ready, ensure_design_catalog

    if not catalog_ready():
        ensure_design_catalog()
    ensure_system_prompts()
    prompt_key = (key or "").strip()
    if not prompt_key:
        raise ValueError("key required")
    if not is_system_prompt_key(prompt_key):
        raise ValueError(f"unsupported system prompt key: {prompt_key}")
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM design_system_prompt WHERE prompt_key = ?",
            (prompt_key,),
        ).fetchone()
        if row:
            next_body = str(row["body"] or "") if body is None else str(body)
            next_label = (
                str(row["label"] or "") if label is None else str(label).strip() or prompt_key
            )
            next_desc = (
                str(row["description"] or "")
                if description is None
                else str(description)
            )
            next_group = (
                str(row["group_key"] or "") if group is None else str(group).strip()
            ) or _infer_group(prompt_key)
            next_sel = (
                int(row["selectable"] or 0)
                if selectable is None
                else (1 if selectable else 0)
            )
            next_sort = (
                int(row["sort_order"] or 0)
                if sort_order is None
                else int(sort_order)
            )
            next_en = (
                int(row["enabled"] or 0) if enabled is None else (1 if enabled else 0)
            )
            conn.execute(
                """
                UPDATE design_system_prompt
                SET body=?, label=?, description=?, group_key=?,
                    selectable=?, sort_order=?, enabled=?, updated_at=?
                WHERE prompt_key=?
                """,
                (
                    next_body,
                    next_label,
                    next_desc,
                    next_group,
                    next_sel,
                    next_sort,
                    next_en,
                    now,
                    prompt_key,
                ),
            )
        else:
            from services.design.prompts.prompt_pack_store import seed_prompt_body

            next_body = "" if body is None else str(body)
            if not next_body:
                next_body = seed_prompt_body(prompt_key)
            seed_meta = next(
                (x for x in _load_seed_items() if x.get("key") == prompt_key),
                {},
            )
            next_label = (label or "").strip() or str(
                seed_meta.get("label") or prompt_key
            )
            next_desc = (
                description
                if description is not None
                else str(seed_meta.get("description") or "")
            )
            next_group = (group or "").strip() or _infer_group(prompt_key)
            next_sel = 1 if (True if selectable is None else selectable) else 0
            next_sort = int(sort_order or 0)
            next_en = 1 if (True if enabled is None else enabled) else 0
            conn.execute(
                """
                INSERT INTO design_system_prompt
                    (prompt_key, label, description, body, group_key,
                     selectable, sort_order, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    prompt_key,
                    next_label,
                    str(next_desc or ""),
                    next_body,
                    next_group,
                    next_sel,
                    next_sort,
                    next_en,
                    now,
                    now,
                ),
            )
        conn.commit()
        out = conn.execute(
            "SELECT * FROM design_system_prompt WHERE prompt_key = ?",
            (prompt_key,),
        ).fetchone()
    return _row_to_item(out)
