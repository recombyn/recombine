"""Short-term memory from chat_messages or client-provided turns."""

from __future__ import annotations

from typing import Any

from services.db import connect, init_schema
from services.agent_memory.schema import trim_short_turn


def _limits(rules: dict[str, str]) -> tuple[int, int]:
    try:
        max_turns = int(str(rules.get("memory.short.max_turns") or "10").strip())
    except ValueError:
        max_turns = 10
    try:
        max_chars = int(str(rules.get("memory.short.max_chars") or "6000").strip())
    except ValueError:
        max_chars = 6000
    return max(2, min(30, max_turns)), max(500, min(20000, max_chars))


def build_short_term_from_messages(messages: list[dict[str, Any]], *, rules: dict[str, str]) -> list[dict[str, Any]]:
    max_turns, max_chars = _limits(rules)
    max_msgs = max_turns * 2
    slice_msgs = messages[-max_msgs:] if len(messages) > max_msgs else messages
    out: list[dict[str, Any]] = []
    total = 0
    for m in slice_msgs:
        role = str(m.get("role") or "").strip().lower()
        content = str(m.get("content") or "").strip()
        if not content or role not in ("user", "assistant"):
            continue
        turn = trim_short_turn({"role": role, "text": content})
        if not turn:
            continue
        tlen = len(turn["text"])
        if total + tlen > max_chars:
            remain = max_chars - total
            if remain < 80:
                break
            turn["text"] = turn["text"][:remain]
            out.append(turn)
            break
        out.append(turn)
        total += tlen
    return out


def load_short_term_from_session(session_id: str, *, rules: dict[str, str]) -> list[dict[str, Any]]:
    sid = (session_id or "").strip()
    if not sid:
        return []
    init_schema()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT role, content FROM chat_messages
            WHERE session_id = ?
            ORDER BY sort_order ASC, created_at ASC
            """,
            (sid,),
        ).fetchall()
    msgs = [{"role": r["role"], "content": r["content"]} for r in rows]
    return build_short_term_from_messages(msgs, rules=rules)
