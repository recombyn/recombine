"""Canvas Action registry — schema (Admin/DB) + FE execute by the same op_key.

Each action has type + hint/schema for the model; apply runs on the client.
This module seeds missing rows into design_canvas_tool (never overwrites non-empty Admin hints).

Seed source: apps/api/data/canvas_actions_seed.json
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from services.db import connect

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_SEED_PATH = _DATA_DIR / "canvas_actions_seed.json"

_actions_cache: list[dict[str, Any]] | None = None
_stale_checks_cache: dict[str, dict[str, Any]] | None = None


def _load_seed() -> dict[str, Any]:
    try:
        parsed = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def default_canvas_actions() -> list[dict[str, Any]]:
    """Seed actions from data/canvas_actions_seed.json (cold-start / fallback)."""
    global _actions_cache
    if _actions_cache is not None:
        return _actions_cache
    seed = _load_seed()
    raw = seed.get("actions")
    out: list[dict[str, Any]] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            key = str(item.get("op_key") or "").strip()
            if not key:
                continue
            out.append(item)
    _actions_cache = out
    return out


def _stale_schema_checks() -> dict[str, dict[str, Any]]:
    global _stale_checks_cache
    if _stale_checks_cache is not None:
        return _stale_checks_cache
    seed = _load_seed()
    raw = seed.get("staleSchemaChecks")
    out: dict[str, dict[str, Any]] = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            if not isinstance(v, dict):
                continue
            out[str(k)] = {
                "must_contain": tuple(v.get("must_contain") or ()),
                "stale_if_contains": tuple(v.get("stale_if_contains") or ()),
            }
    _stale_checks_cache = out
    return out


def _schema_is_stale(op_key: str, existing_schema: str, seed_schema: str) -> bool:
    existing = (existing_schema or "").strip()
    if not existing:
        return True
    if existing == seed_schema:
        return False
    check = _stale_schema_checks().get(op_key)
    if not check:
        return False
    for needle in check.get("stale_if_contains") or ():
        if needle in existing:
            return True
    for needle in check.get("must_contain") or ():
        if needle not in existing:
            return True
    return False


def ensure_action_registry(*, force_hints: bool = False) -> int:
    """Insert missing design_canvas_tool rows. Returns number of inserts/updates.

    Never overwrites a non-empty model_hint / label unless force_hints=True.
    """
    now = time.time()
    changed = 0
    with connect() as conn:
        for item in default_canvas_actions():
            key = item["op_key"]
            schema_s = json.dumps(item.get("args_schema") or {}, ensure_ascii=False)
            row = conn.execute(
                "SELECT id, model_hint, args_schema FROM design_canvas_tool WHERE op_key = ?",
                (key,),
            ).fetchone()
            if not row:
                try:
                    conn.execute(
                        """
                        INSERT INTO design_canvas_tool
                        (op_key, kind, label, model_hint, args_schema, enabled,
                         sort_order, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
                        """,
                        (
                            key,
                            item["kind"],
                            item["label"],
                            item["model_hint"],
                            schema_s,
                            int(item["sort_order"]),
                            now,
                            now,
                        ),
                    )
                except Exception:
                    # Older schema without args_schema — insert without it.
                    conn.execute(
                        """
                        INSERT INTO design_canvas_tool
                        (op_key, kind, label, model_hint, enabled, sort_order,
                         created_at, updated_at)
                        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
                        """,
                        (
                            key,
                            item["kind"],
                            item["label"],
                            item["model_hint"],
                            int(item["sort_order"]),
                            now,
                            now,
                        ),
                    )
                changed += 1
                continue
            hint = ""
            try:
                hint = str(row["model_hint"] or "").strip()
            except Exception:
                hint = ""
            try:
                existing_schema = str(row["args_schema"] or "").strip()
            except Exception:
                existing_schema = ""
            # Existing row is Admin-owned: only fill empty columns. Never rewrite
            # kind/label/hint/sort_order when already set (unless force_hints).
            if force_hints:
                try:
                    conn.execute(
                        """
                        UPDATE design_canvas_tool
                        SET kind=?, label=?, model_hint=?, args_schema=?,
                            sort_order=?, updated_at=?
                        WHERE op_key=?
                        """,
                        (
                            item["kind"],
                            item["label"],
                            item["model_hint"],
                            schema_s,
                            int(item["sort_order"]),
                            now,
                            key,
                        ),
                    )
                    changed += 1
                except Exception:
                    conn.execute(
                        """
                        UPDATE design_canvas_tool
                        SET kind=?, label=?, model_hint=?, sort_order=?, updated_at=?
                        WHERE op_key=?
                        """,
                        (
                            item["kind"],
                            item["label"],
                            item["model_hint"],
                            int(item["sort_order"]),
                            now,
                            key,
                        ),
                    )
                    changed += 1
                continue
            if not hint and item.get("model_hint"):
                try:
                    conn.execute(
                        """
                        UPDATE design_canvas_tool
                        SET model_hint=?, updated_at=?
                        WHERE op_key=? AND (model_hint IS NULL OR model_hint = '')
                        """,
                        (item["model_hint"], now, key),
                    )
                    changed += 1
                except Exception:
                    pass
            if not existing_schema:
                try:
                    conn.execute(
                        """
                        UPDATE design_canvas_tool
                        SET args_schema=?, updated_at=?
                        WHERE op_key=?
                        """,
                        (schema_s, now, key),
                    )
                    changed += 1
                except Exception:
                    pass
        conn.commit()
    return changed
