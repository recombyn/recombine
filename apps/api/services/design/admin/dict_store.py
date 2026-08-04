"""Design dictionary CRUD."""
from __future__ import annotations
import json
import threading
import time
from typing import Any
from services.db import connect, dialect
from services.design.admin.schema import ensure_design_tables

# Catalog of dict types lives as rows under this reserved dict_type.
TYPE_CATALOG = "__types__"

_DICTS_READY = False
_DICTS_LOCK = threading.RLock()
# Bump when data/design_dicts_seed.json gains rows (also stored as seed.rev).
_DICT_SEED_REV = 29
_seeded_rev = 0
# Label lookup cache (resolve_edge_condition is identity — no per-edge DB).
_EDGE_COND_LABELS: dict[str, str] | None = None
_EDGE_COND_LABELS_LOCK = threading.Lock()


def _invalidate_edge_condition_label_cache() -> None:
    global _EDGE_COND_LABELS
    with _EDGE_COND_LABELS_LOCK:
        _EDGE_COND_LABELS = None


def _dicts_data_path():
    from config.settings import resolve_data_file

    return resolve_data_file("design_dicts_seed.json")


def _load_dicts_seed() -> dict:
    path = _dicts_data_path()
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _dict_type_defaults() -> list[tuple[str, str, int]]:
    seed = _load_dicts_seed()
    out: list[tuple[str, str, int]] = []
    for row in seed.get("types") or []:
        if not isinstance(row, dict):
            continue
        code = str(row.get("code") or "").strip()
        label = str(row.get("label") or "").strip()
        if not code or not label:
            continue
        try:
            sort_order = int(row.get("sortOrder") or 0)
        except Exception:
            sort_order = 0
        out.append((code, label, sort_order))
    return out


def _dict_item_defaults() -> list[tuple[str, str, str, int]]:
    seed = _load_dicts_seed()
    out: list[tuple[str, str, str, int]] = []
    for row in seed.get("items") or []:
        if not isinstance(row, dict):
            continue
        dict_type = str(row.get("dictType") or "").strip()
        code = str(row.get("code") or "").strip()
        label = str(row.get("label") or "").strip()
        if not dict_type or not code or not label:
            continue
        try:
            sort_order = int(row.get("sortOrder") or 0)
        except Exception:
            sort_order = 0
        out.append((dict_type, code, label, sort_order))
    return out


def _dict_description_defaults() -> dict[tuple[str, str], str]:
    seed = _load_dicts_seed()
    raw = seed.get("descriptions") or {}
    out: dict[tuple[str, str], str] = {}
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        key = str(k or "")
        if "|" not in key:
            continue
        typ, code = key.split("|", 1)
        typ, code = typ.strip(), code.strip()
        if typ and code:
            out[(typ, code)] = str(v or "")
    return out


# Compatibility aliases (loaded from JSON; prefer _dict_*_defaults() at runtime).
DICT_TYPE_DEFAULTS = _dict_type_defaults()
DICT_DEFAULTS = _dict_item_defaults()
DICT_DESCRIPTION_DEFAULTS = _dict_description_defaults()


def resolve_edge_condition(raw: str) -> str:
    """Normalize edge condition to dict ``code`` / predicate string.

    Identity strip only: never reverse-maps mutable display ``label`` → code,
    and never hits MySQL (Admin GET / normalize used to N+1 list_dicts per edge).
    """
    return str(raw or "").strip()


def edge_condition_label(code: str) -> str:
    """Display name for a flow_edge_condition code (empty if unknown)."""
    global _EDGE_COND_LABELS
    key = str(code or "").strip()
    if not key:
        return ""
    labels = _EDGE_COND_LABELS
    if labels is None:
        with _EDGE_COND_LABELS_LOCK:
            labels = _EDGE_COND_LABELS
            if labels is None:
                labels = {}
                try:
                    items = list_dicts(dict_type="flow_edge_condition", enabled=True)
                    for i in items:
                        c = str(i.get("code") or "").strip()
                        if c:
                            labels[c] = str(i.get("label") or "").strip()
                except Exception:
                    pass
                if not labels:
                    for typ, c, label, _ord in _dict_item_defaults():
                        if typ == "flow_edge_condition" and str(c).strip():
                            labels[str(c).strip()] = str(label).strip()
                _EDGE_COND_LABELS = labels
    return str(labels.get(key) or "")


def _norm_type_code(raw: str) -> str:
    return str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")


def _pub_dict(r: Any) -> dict[str, Any]:
    keys = r.keys() if hasattr(r, "keys") else ()
    desc = ""
    if "description" in keys:
        desc = str(r["description"] or "").strip()
    return {
        "id": int(r["id"]),
        "dictType": r["dict_type"],
        "code": r["code"],
        "label": r["label"],
        "description": desc,
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def _pub_type(r: Any) -> dict[str, Any]:
    return {
        "id": int(r["id"]),
        "code": r["code"],
        "label": r["label"],
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def _seed_dict_rows(conn: Any, *, now: float) -> None:
    """Insert missing default dict items / types (idempotent). Never overwrite labels.

    One SELECT of existing rows — avoid per-seed-item roundtrips on remote MySQL.
    """
    # Flow-designer / unused dict families — wipe types + items (seed keeps scene only).
    _retired_types = (
        "precheck_signal",
        "flow_ask_slot",
        "flow_ask_never",
        "flow_prompt_key",
        "flow_inject_substitute",
        "flow_edge_condition",
        "flow_phase",
        "flow_config_ref",
        "flow_capability",
        "flow_inject_mode",
        "flow_inject_source",
        "flow_inject_validate",
        "flow_action_rule",
        "flow_assign_rule",
        "flow_binding_field",
        "flow_node_kind",
        "flow_node_block",
        "skill_category",
        "output_format",
        "task_tier",
        "precheck_block",
        "library_kind",
        "button_type",
    )
    for retired in _retired_types:
        conn.execute("DELETE FROM design_dict WHERE dict_type = ?", (retired,))
        conn.execute(
            "DELETE FROM design_dict WHERE dict_type = ? AND code = ?",
            (TYPE_CATALOG, retired),
        )
    # Drop retired scene codes (product scenes are website/mobile/image/poster/drawing).
    for code in ("ui", "illustration", "ecommerce", "detail_page", "banner", "social"):
        conn.execute(
            "DELETE FROM design_dict WHERE dict_type = ? AND code = ?",
            ("scene", code),
        )
    # Heal live scenes wrongly marked「已废弃」/ disabled in Admin.
    for code, label in (
        ("all", "All scenes"),
        ("website", "Website"),
        ("mobile", "Mobile"),
        ("image", "Image"),
        ("poster", "Poster"),
        ("drawing", "Drawing"),
    ):
        conn.execute(
            """
            UPDATE design_dict
            SET label = ?, enabled = 1, updated_at = ?
            WHERE dict_type = 'scene' AND code = ?
              AND (
                enabled = 0
                OR label LIKE '%废弃%'
                OR label LIKE '%deprecated%'
              )
            """,
            (label, now, code),
        )

    # Prefer live seed load so rev bumps apply without process restart races.
    type_defaults = _dict_type_defaults()
    item_defaults = _dict_item_defaults()
    descs = _dict_description_defaults()

    # On seed rev bump: re-sync labels/sort for product enums (Admin display may have
    # been garbled by encoding; seed is source of truth for these type codes).
    try:
        seed_rev = int((_load_dicts_seed().get("rev") or 0))
    except Exception:
        seed_rev = 0
    force_label_sync = seed_rev > _seeded_rev

    existing_rows = conn.execute(
        "SELECT id, dict_type, code, label, description, sort_order FROM design_dict"
    ).fetchall()
    by_key: dict[tuple[str, str], Any] = {}
    for row in existing_rows:
        by_key[(str(row["dict_type"]), str(row["code"]))] = row

    for dict_type, code, label, sort_order in item_defaults:
        desc = descs.get((dict_type, code), "")
        row = by_key.get((dict_type, code))
        if row:
            old_label = str(row["label"] or "")
            try:
                old_sort = int(row["sort_order"] or 0)
            except Exception:
                old_sort = 0
            # Rev bump: restore seed labels (fixes encoding garble / drift).
            if force_label_sync and (old_label != label or old_sort != sort_order):
                conn.execute(
                    """
                    UPDATE design_dict
                    SET label = ?, sort_order = ?, enabled = 1, updated_at = ?
                    WHERE id = ?
                    """,
                    (label, sort_order, now, int(row["id"])),
                )
            # Fill empty description from seed once; never overwrite Admin edits.
            if desc and not str(row["description"] or "").strip():
                conn.execute(
                    "UPDATE design_dict SET description = ?, updated_at = ? WHERE id = ?",
                    (desc, now, int(row["id"])),
                )
            continue
        conn.execute(
            "INSERT INTO design_dict (dict_type, code, label, description, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (dict_type, code, label, desc or None, sort_order, now, now),
        )
    for code, label, sort_order in type_defaults:
        row = by_key.get((TYPE_CATALOG, code))
        if row:
            # Keep type catalog names aligned with product UI (seed is source for type labels).
            old_label = str(row["label"] or "")
            try:
                old_sort = int(row["sort_order"] or 0)
            except Exception:
                old_sort = 0
            if old_label != label or old_sort != sort_order:
                conn.execute(
                    "UPDATE design_dict SET label = ?, sort_order = ?, updated_at = ? WHERE id = ?",
                    (label, sort_order, now, int(row["id"])),
                )
            continue
        conn.execute(
            "INSERT INTO design_dict (dict_type, code, label, description, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (TYPE_CATALOG, code, label, None, sort_order, now, now),
        )

    # Rev bump: drop obsolete enum codes (e.g. retired prompt_pack_kind need packs).
    # Include every product type from seed even when its item list is empty.
    if force_label_sync:
        allowed_by_type: dict[str, set[str]] = {
            str(code): set() for code, _label, _sort in type_defaults if str(code) != TYPE_CATALOG
        }
        for dict_type, code, _label, _sort in item_defaults:
            allowed_by_type.setdefault(str(dict_type), set()).add(str(code))
        for dict_type, allowed in allowed_by_type.items():
            if not allowed:
                conn.execute(
                    "DELETE FROM design_dict WHERE dict_type = ?",
                    (dict_type,),
                )
                continue
            placeholders = ",".join("?" for _ in allowed)
            conn.execute(
                f"""
                DELETE FROM design_dict
                WHERE dict_type = ? AND code NOT IN ({placeholders})
                """,
                (dict_type, *sorted(allowed)),
            )

    # Drop orphan type-catalog rows not in seed.
    allowed_types = {str(code) for code, _label, _sort in type_defaults}
    if allowed_types:
        placeholders = ",".join("?" for _ in allowed_types)
        conn.execute(
            f"DELETE FROM design_dict WHERE dict_type = ? AND code NOT IN ({placeholders})",
            (TYPE_CATALOG, *sorted(allowed_types)),
        )
        # Drop any leftover item rows outside allowed types (manual orphans).
        conn.execute(
            f"DELETE FROM design_dict WHERE dict_type <> ? AND dict_type NOT IN ({placeholders})",
            (TYPE_CATALOG, *sorted(allowed_types)),
        )
    else:
        conn.execute(
            "DELETE FROM design_dict WHERE dict_type <> ?",
            (TYPE_CATALOG,),
        )


def ensure_design_dicts() -> None:
    """Seed dict rows only — avoid init_schema()/full catalog (slow on remote MySQL)."""
    global _DICTS_READY, _seeded_rev
    if _DICTS_READY and _seeded_rev >= _DICT_SEED_REV:
        return
    with _DICTS_LOCK:
        if _DICTS_READY and _seeded_rev >= _DICT_SEED_REV:
            return
        mysql = dialect() == "mysql"
        now = time.time()
        with connect() as conn:
            ensure_design_tables(conn, mysql=mysql)
            _seed_dict_rows(conn, now=now)
            conn.commit()
        try:
            rev = int((_load_dicts_seed().get("rev") or _DICT_SEED_REV))
        except Exception:
            rev = _DICT_SEED_REV
        _seeded_rev = max(_DICT_SEED_REV, rev)
        _DICTS_READY = True
        _invalidate_edge_condition_label_cache()


def list_dicts(*, dict_type: str | None = None, enabled: bool | None = True) -> list[dict[str, Any]]:
    ensure_design_dicts()
    where: list[str] = ["dict_type <> ?"]
    params: list[Any] = [TYPE_CATALOG]
    if dict_type:
        where.append("dict_type = ?")
        params.append(dict_type.strip())
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    sql = "SELECT * FROM design_dict WHERE " + " AND ".join(where) + " ORDER BY dict_type ASC, sort_order ASC, id ASC"
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_pub_dict(r) for r in rows]


def list_dict_types(*, enabled: bool | None = None) -> list[dict[str, Any]]:
    """Dictionary categories for the left tree."""
    ensure_design_dicts()
    where = ["dict_type = ?"]
    params: list[Any] = [TYPE_CATALOG]
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    sql = "SELECT * FROM design_dict WHERE " + " AND ".join(where) + " ORDER BY sort_order ASC, id ASC"
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_pub_type(r) for r in rows]


def upsert_dict_type(payload: dict[str, Any]) -> dict[str, Any]:
    """Create/update a dict type. Renaming `code` migrates all item rows."""
    ensure_design_dicts()
    code = _norm_type_code(str(payload.get("code") or ""))
    label = str(payload.get("label") or "").strip()
    if not code or not label:
        raise ValueError("code, label required")
    if code == TYPE_CATALOG or code.startswith("__"):
        raise ValueError("reserved type code")
    sort_order = int(payload.get("sortOrder") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    item_id = payload.get("id")
    now = time.time()
    with connect() as conn:
        if item_id:
            prev = conn.execute(
                "SELECT * FROM design_dict WHERE id = ? AND dict_type = ?",
                (int(item_id), TYPE_CATALOG),
            ).fetchone()
            if not prev:
                raise ValueError("type not found")
            old_code = str(prev["code"])
            if code != old_code:
                clash = conn.execute(
                    "SELECT id FROM design_dict WHERE dict_type = ? AND code = ? AND id <> ?",
                    (TYPE_CATALOG, code, int(item_id)),
                ).fetchone()
                if clash:
                    raise ValueError("type code already exists")
                # Migrate item rows to the new type key.
                conn.execute(
                    "UPDATE design_dict SET dict_type = ?, updated_at = ? WHERE dict_type = ?",
                    (code, now, old_code),
                )
            conn.execute(
                "UPDATE design_dict SET code=?, label=?, sort_order=?, enabled=?, updated_at=? WHERE id=?",
                (code, label, sort_order, enabled, now, int(item_id)),
            )
            row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        else:
            existing = conn.execute(
                "SELECT id FROM design_dict WHERE dict_type = ? AND code = ?",
                (TYPE_CATALOG, code),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE design_dict SET label=?, sort_order=?, enabled=?, updated_at=? WHERE dict_type=? AND code=?",
                    (label, sort_order, enabled, now, TYPE_CATALOG, code),
                )
                row = conn.execute(
                    "SELECT * FROM design_dict WHERE dict_type = ? AND code = ?",
                    (TYPE_CATALOG, code),
                ).fetchone()
            else:
                cur = conn.execute(
                    "INSERT INTO design_dict (dict_type, code, label, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (TYPE_CATALOG, code, label, sort_order, enabled, now, now),
                )
                row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(cur.lastrowid),)).fetchone()
        conn.commit()
    return _pub_type(row)


def delete_dict_type(type_id: int) -> bool:
    """Remove a type catalog row and soft-disable all its items."""
    ensure_design_dicts()
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT code FROM design_dict WHERE id = ? AND dict_type = ?",
            (int(type_id), TYPE_CATALOG),
        ).fetchone()
        if not row:
            return False
        code = str(row["code"])
        conn.execute(
            "UPDATE design_dict SET enabled = 0, updated_at = ? WHERE dict_type = ?",
            (now, code),
        )
        conn.execute("DELETE FROM design_dict WHERE id = ?", (int(type_id),))
        conn.commit()
    return True


def upsert_dict(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_dicts()
    dict_type = _norm_type_code(str(payload.get("dictType") or ""))
    # Keep condition keys like intent=chat / mode=ask&has_ops intact.
    code = str(payload.get("code") or "").strip()
    label = str(payload.get("label") or "").strip()
    description = str(payload.get("description") or "").strip()
    if not dict_type or not code or not label:
        raise ValueError("dictType, code, label required")
    if dict_type == TYPE_CATALOG or dict_type.startswith("__"):
        raise ValueError("reserved dictType")
    sort_order = int(payload.get("sortOrder") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    item_id = payload.get("id")
    now = time.time()
    with connect() as conn:
        if item_id:
            conn.execute(
                "UPDATE design_dict SET dict_type=?, code=?, label=?, description=?, sort_order=?, enabled=?, updated_at=? WHERE id=?",
                (dict_type, code, label, description or None, sort_order, enabled, now, int(item_id)),
            )
            row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        else:
            existing = conn.execute(
                "SELECT id FROM design_dict WHERE dict_type = ? AND code = ?",
                (dict_type, code),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE design_dict SET label=?, description=?, sort_order=?, enabled=?, updated_at=? WHERE dict_type=? AND code=?",
                    (label, description or None, sort_order, enabled, now, dict_type, code),
                )
                row = conn.execute(
                    "SELECT * FROM design_dict WHERE dict_type = ? AND code = ?",
                    (dict_type, code),
                ).fetchone()
            else:
                cur = conn.execute(
                    "INSERT INTO design_dict (dict_type, code, label, description, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (dict_type, code, label, description or None, sort_order, enabled, now, now),
                )
                row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(cur.lastrowid),)).fetchone()
        conn.commit()
    _invalidate_edge_condition_label_cache()
    return _pub_dict(row)


def soft_delete_dict(item_id: int) -> bool:
    ensure_design_dicts()
    with connect() as conn:
        row = conn.execute("SELECT dict_type FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        if not row or str(row["dict_type"]) == TYPE_CATALOG:
            return False
        cur = conn.execute(
            "UPDATE design_dict SET enabled = 0, updated_at = ? WHERE id = ?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        ok = (cur.rowcount or 0) > 0
    if ok:
        _invalidate_edge_condition_label_cache()
    return ok


def hard_delete_dict(item_id: int) -> bool:
    ensure_design_dicts()
    with connect() as conn:
        row = conn.execute("SELECT dict_type FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        if not row or str(row["dict_type"]) == TYPE_CATALOG:
            return False
        cur = conn.execute("DELETE FROM design_dict WHERE id = ?", (int(item_id),))
        conn.commit()
        ok = (cur.rowcount or 0) > 0
    if ok:
        _invalidate_edge_condition_label_cache()
    return ok
