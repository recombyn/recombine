"""MemoryService — load bundle, build patches, persist."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from services.agent_memory.compose import compose_memory_blocks
from services.agent_memory.long_term import list_long_hits
from services.agent_memory.medium_term import load_task_state_from_session, persist_medium_term
from services.agent_memory.schema import deep_merge, empty_task_state, normalize_task_state
from services.agent_memory.short_term import (
    build_short_term_from_messages,
    load_short_term_from_session,
)


@dataclass
class MemoryBundle:
    medium: dict[str, Any]
    short: list[dict[str, Any]]
    long_hits: list[dict[str, Any]]
    blocks: str


def _rule_on(rules: dict[str, str], key: str, default: str) -> bool:
    val = str(rules.get(key) if rules.get(key) is not None else default).strip().lower()
    return val in ("1", "true", "yes", "on")


class MemoryService:
    def load(
        self,
        *,
        user_id: str,
        session_id: str,
        project_id: str,
        memory_in: dict[str, Any] | None,
        rules: dict[str, str],
    ) -> MemoryBundle:
        if not _rule_on(rules, "memory.enabled", "1"):
            medium = empty_task_state(session_id=session_id, project_id=project_id, user_id=user_id)
            return MemoryBundle(medium=medium, short=[], long_hits=[], blocks="")

        mem = memory_in if isinstance(memory_in, dict) else {}
        client_medium = mem.get("medium") if isinstance(mem.get("medium"), dict) else None
        server_medium = load_task_state_from_session(user_id, session_id, project_id=project_id)
        base = server_medium or empty_task_state(
            session_id=session_id, project_id=project_id, user_id=user_id
        )
        if client_medium:
            medium = normalize_task_state(
                deep_merge(base, client_medium),
                session_id=session_id,
                project_id=project_id,
                user_id=user_id,
            )
        else:
            medium = normalize_task_state(
                base, session_id=session_id, project_id=project_id, user_id=user_id
            )

        short_in = mem.get("short")
        if isinstance(short_in, list) and short_in:
            short = build_short_term_from_messages(
                [{"role": t.get("role"), "content": t.get("text")} for t in short_in if isinstance(t, dict)],
                rules=rules,
            )
        elif session_id:
            short = load_short_term_from_session(session_id, rules=rules)
        else:
            short = []

        retrieve = mem.get("retrieve_long")
        if retrieve is False:
            long_hits: list[dict[str, Any]] = []
        else:
            long_hits = list_long_hits(user_id, rules=rules)

        blocks = compose_memory_blocks(medium=medium, short=short, long_hits=long_hits, rules=rules)
        return MemoryBundle(medium=medium, short=short, long_hits=long_hits, blocks=blocks)

    def build_run_patch(
        self,
        medium: dict[str, Any],
        *,
        task_id: str,
        intent: str | None,
        edit_in_place: bool,
        blank_artboard: bool,
        summary: str,
        tool_ops_applied: bool,
        critique_notes: str | None,
        scene_key: str | None,
        canvas_size: str | None,
        design_patch: dict[str, Any] | None = None,
        subgoals: list[str] | None = None,
        completed_skill_keys: list[str] | None = None,
    ) -> dict[str, Any]:
        last_run = {
            "at": time.time(),
            "task_id": task_id,
            "intent": intent,
            "edit_in_place": edit_in_place,
            "blank_artboard": blank_artboard,
            "summary": str(summary or "")[:900],
            "tool_ops_applied": tool_ops_applied,
            "scene": scene_key,
            "canvas_size": canvas_size,
        }
        if critique_notes:
            last_run["critique_notes"] = str(critique_notes)[:600]
        if subgoals:
            last_run["subgoals"] = subgoals[:6]
        if completed_skill_keys:
            last_run["completed_skills"] = completed_skill_keys[:24]
        patch: dict[str, Any] = {"last_run": last_run}
        if design_patch:
            patch["design"] = design_patch
        merged = deep_merge(medium, patch)
        return {"medium": merged}

    def persist_after_run(
        self,
        user_id: str,
        session_id: str,
        project_id: str,
        merged_medium: dict[str, Any],
    ) -> None:
        if not session_id:
            return
        persist_medium_term(user_id, session_id, project_id, merged_medium)


memory_service = MemoryService()
