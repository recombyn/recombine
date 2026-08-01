"""Design content pack — version stamp only (no skill / flow / prompt copy in repo).

Runtime skills, flows, and global rules live in the DB (Admin).
This module must never upsert skill prompts or overwrite Admin flow skill_ids.
"""
from __future__ import annotations

import time
from typing import Any

from services.db import connect, dialect
from services.design.schema import ensure_design_tables

CONTENT_VERSION = "2026-07-23-v103"
CONTENT_VERSION_KEY = "content_pack_version"


def _now() -> float:
    return time.time()


def resync_design_content(*, force: bool = True) -> dict[str, Any]:
    """Stamp content_pack_version only. Never rewrites skills, flows, or groups."""
    mysql = dialect() == "mysql"
    with connect() as conn:
        ensure_design_tables(conn, mysql=mysql)

    with connect() as conn:
        cur_ver = conn.execute(
            "SELECT rule_value FROM design_global_rule WHERE rule_key=?",
            (CONTENT_VERSION_KEY,),
        ).fetchone()
        current = (cur_ver["rule_value"] if cur_ver else "") or ""
        if not force and current == CONTENT_VERSION:
            return {"ok": True, "skipped": True, "version": CONTENT_VERSION}

        now = _now()
        row_ver = conn.execute(
            "SELECT id FROM design_global_rule WHERE rule_key=?",
            (CONTENT_VERSION_KEY,),
        ).fetchone()
        if row_ver:
            conn.execute(
                "UPDATE design_global_rule SET rule_value=?, updated_at=? WHERE rule_key=?",
                (CONTENT_VERSION, now, CONTENT_VERSION_KEY),
            )
        else:
            conn.execute(
                "INSERT INTO design_global_rule (rule_key, rule_value, updated_at) VALUES (?,?,?)",
                (CONTENT_VERSION_KEY, CONTENT_VERSION, now),
            )

        n_skills_row = conn.execute("SELECT COUNT(*) AS c FROM design_skill").fetchone()
        n_flows_row = conn.execute(
            "SELECT COUNT(*) AS c FROM design_execute_flow"
        ).fetchone()
        conn.commit()

    def _count(row: Any) -> int:
        if row is None:
            return 0
        try:
            return int(row["c"])
        except Exception:
            return int(row[0])

    return {
        "ok": True,
        "skipped": False,
        "version": CONTENT_VERSION,
        "skills": _count(n_skills_row),
        "flows": _count(n_flows_row),
        "note": "DB-owned skills/flows/rules; pack does not seed or overwrite them",
    }
