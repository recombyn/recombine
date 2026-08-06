"""Helpers for design orchestrator golden-path / eval tests."""

from __future__ import annotations

from typing import Any

from app.services.design.runtime.orchestrator import run_design_job


async def collect_design_events(**kwargs: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    async for ev in run_design_job(**kwargs):
        events.append(ev)
    return events


def events_by_type(events: list[dict[str, Any]], typ: str) -> list[dict[str, Any]]:
    return [e for e in events if e.get("type") == typ]


def last_execution_log(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    rows = events_by_type(events, "execution_log")
    return rows[-1] if rows else None


def resilience_signals(exec_log: dict[str, Any] | None) -> dict[str, bool]:
    """Booleans derived from execution_log errors (for failure-path asserts)."""
    if not exec_log:
        return {
            "paint_timeout": False,
            "retries_exhausted": False,
            "scene_timeout": False,
            "op_apply_failed": False,
            "has_reflect": False,
        }
    errors = [str(e or "").lower() for e in (exec_log.get("errors") or [])]
    joined = "\n".join(errors)
    path = [str(p or "").lower() for p in (exec_log.get("path") or [])]
    return {
        "paint_timeout": any("timed out" in e and "paint" in e for e in errors),
        "retries_exhausted": "retries_exhausted" in joined,
        "scene_timeout": "scene_feedback_timeout" in joined,
        "op_apply_failed": "op_apply_failed" in joined,
        "has_reflect": "reflect" in path
        or any(
            isinstance(s, dict) and str(s.get("phase") or "").lower() == "reflect"
            for s in (exec_log.get("steps") or [])
        ),
    }


def event_types(events: list[dict[str, Any]]) -> list[str]:
    return [str(e.get("type") or "") for e in events if e.get("type")]


def assert_has_types(events: list[dict[str, Any]], *required: str) -> None:
    got = set(event_types(events))
    missing = [t for t in required if t not in got]
    assert not missing, f"missing event types {missing}; got={sorted(got)}"


def last_decision(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    decs = events_by_type(events, "decision")
    return decs[-1] if decs else None


def first_decision(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    decs = events_by_type(events, "decision")
    return decs[0] if decs else None


def critique_ok(events: list[dict[str, Any]]) -> bool | None:
    """Last critique_done.ok, or None if never emitted."""
    dones = events_by_type(events, "critique_done")
    if not dones:
        return None
    return bool(dones[-1].get("ok"))


def last_result(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    rows = events_by_type(events, "result")
    return rows[-1] if rows else None


def proposed_ops(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    res = last_result(events)
    if not res:
        return []
    ops = res.get("proposed_ops")
    return [o for o in ops if isinstance(o, dict)] if isinstance(ops, list) else []


def eval_checkpoint(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Compact eval summary for paint → apply → critique → ask propose."""
    return {
        "types": event_types(events),
        "has_tool_ops": bool(events_by_type(events, "tool_ops")),
        "has_critique": critique_ok(events) is not None,
        "critique_ok": critique_ok(events),
        "proposed_ops_n": len(proposed_ops(events)),
        "proposal_id": (last_result(events) or {}).get("proposal_id"),
        "result_status": (last_result(events) or {}).get("status"),
        "paused": bool(events_by_type(events, "paused")),
        "errors": [
            str(e.get("message") or "")[:120] for e in events_by_type(events, "error")
        ],
    }
