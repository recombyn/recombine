"""Long-term user memory — SQL recent hits (pgvector-ready later)."""

from __future__ import annotations

import time
import uuid
from typing import Any

from services.db import connect, init_schema


def _top_k(rules: dict[str, str]) -> int:
    try:
        return max(0, min(10, int(str(rules.get("memory.long.top_k") or "3").strip())))
    except ValueError:
        return 3


def list_long_hits(user_id: str, *, rules: dict[str, str]) -> list[dict[str, Any]]:
    if not _rule_on(rules, "memory.long.enabled", "1"):
        return []
    k = _top_k(rules)
    if k <= 0:
        return []
    init_schema()
    uid = (user_id or "").strip()
    if not uid:
        return []
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT kind, text, score, updated_at
            FROM agent_long_memory
            WHERE user_id = ? AND status = 'active'
            ORDER BY pinned DESC, updated_at DESC
            LIMIT ?
            """,
            (uid, k),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        text = str(r["text"] or "").strip()
        if not text:
            continue
        out.append(
            {
                "kind": str(r["kind"] or "preference"),
                "text": text[:500],
                "score": float(r["score"]) if r["score"] is not None else None,
            }
        )
    return out


def insert_long_memory(
    user_id: str,
    *,
    kind: str,
    text: str,
    pinned: bool = False,
) -> str:
    init_schema()
    mid = f"alm_{uuid.uuid4().hex[:16]}"
    now = time.time()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO agent_long_memory (
                id, user_id, kind, text, status, pinned, score, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active', ?, 1.0, ?, ?)
            """,
            (mid, user_id, kind[:32], text[:2000], 1 if pinned else 0, now, now),
        )
        conn.commit()
    return mid


def _rule_on(rules: dict[str, str], key: str, default: str) -> bool:
    val = str(rules.get(key) if rules.get(key) is not None else default).strip().lower()
    return val in ("1", "true", "yes", "on")
