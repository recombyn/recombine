"""Helpers for design orchestrator golden-path tests."""

from __future__ import annotations

from typing import Any

from services.design.orchestrator import run_design_job


async def collect_design_events(**kwargs: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    async for ev in run_design_job(**kwargs):
        events.append(ev)
    return events


def events_by_type(events: list[dict[str, Any]], typ: str) -> list[dict[str, Any]]:
    return [e for e in events if e.get("type") == typ]


def last_decision(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    decs = events_by_type(events, "decision")
    return decs[-1] if decs else None


def first_decision(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    decs = events_by_type(events, "decision")
    return decs[0] if decs else None
