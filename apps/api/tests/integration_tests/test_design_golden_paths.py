"""Golden-path: agent permission gate + LangGraph agent (mocked LLM)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from app.services.design.runtime.agent_controller import PaintOpsSchema
from app.services.design.readpath.catalog import ensure_design_catalog
from app.services.design.runtime.models_route import IntentClassifyDecision
from tests.design_harness import collect_design_events, events_by_type

TEST_USER = "user_eval_golden"


@pytest.fixture(scope="module", autouse=True)
def _catalog(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("design_golden") / "test.db"
    import os

    os.environ["SQLITE_DB_PATH"] = str(db_path)
    os.environ["DATABASE_URL"] = ""
    from app.core.config import settings as settings_mod
    from app.core.db import reset_engine
    from tests.conftest import restore_default_sqlite_engine

    settings_mod.sqlite_db_path = str(db_path)
    settings_mod.database_url = ""
    reset_engine()
    ensure_design_catalog(force=True)
    yield
    restore_default_sqlite_engine()

@pytest.fixture(autouse=True)
def _wallet(monkeypatch):
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator.get_user_tokens",
        lambda _uid: 200_000,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator.free_daily_remaining",
        lambda _uid: 0,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator._reserve_design_hold",
        lambda *_a, **_k: (100, False),
    )
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator._settle_hold",
        lambda *_a, **_k: 10,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator._refund_hold",
        lambda *_a, **_k: None,
    )


def _run(**kwargs):
    return asyncio.run(
        collect_design_events(user_id=TEST_USER, run_mode="agent", **kwargs)
    )


@pytest.mark.integration
def test_permission_gate_denies_when_broke(monkeypatch):
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator.get_user_tokens",
        lambda _uid: 0,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.orchestrator.free_daily_remaining",
        lambda _uid: 0,
    )
    events = _run(prompt="??")
    perms = [e for e in events if e.get("type") == "permission"]
    assert perms
    assert perms[0].get("can_call_llm") is False
    errs = events_by_type(events, "error")
    assert errs
    assert errs[0].get("message") in (
        "insufficient_credits",
        "free_daily_exhausted",
    )
    assert not events_by_type(events, "skill_start")


@pytest.mark.integration
def test_react_chat_hello(monkeypatch):
    """Chat short-circuits at intent_classify (no create_agent turn)."""

    async def _classify(**_kwargs: Any) -> IntentClassifyDecision:
        return IntentClassifyDecision(
            intent="chat",
            reply="????????????",
            rationale="greeting",
        )

    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.intent.classify_user_intent",
        _classify,
    )
    events = _run(prompt="??")
    perms = [e for e in events if e.get("type") == "permission"]
    assert perms and perms[0].get("can_call_llm") is True
    tokens = events_by_type(events, "token")
    assert tokens and "??" in (tokens[0].get("text") or "")
    assert events_by_type(events, "chat_done")
    assert events_by_type(events, "result")
    assert not events_by_type(events, "tool_ops")
    assert not events_by_type(events, "skill_start")


@pytest.mark.integration
def test_react_edit_emits_tool_ops(monkeypatch):
    """design/edit ? decide ? paint_ops structured tool_ops ? action SSE."""

    async def _classify(**_kwargs: Any) -> IntentClassifyDecision:
        return IntentClassifyDecision(
            intent="design",
            paint_lane="edit",
            reply="",
            rationale="edit title",
        )

    async def _stream(
        *,
        model_family: str,
        system: str,
        user: str,
        rules: dict[str, str],
        images: list[str] | None = None,
        max_tokens: int = 1024,
        enable_thinking: bool = False,
        live_emit: bool = False,
    ) -> tuple[str, str, int, list[dict[str, Any]], str]:
        del system, user, rules, images, max_tokens, enable_thinking, live_emit
        content = (
            '{"thought":"???","intent":"edit","reply":"?",'
            '"need_tools":[],"need_skills":[],"tool_ops":[]}'
        )
        return model_family, content, 12, [], ""

    async def _structured(**_kwargs: Any) -> dict[str, Any]:
        return {
            "structured": PaintOpsSchema(
                intent="edit",
                reply="?????",
                tool_ops=[
                    {
                        "name": "create_text",
                        "args": {
                            "text": "??",
                            "x": 40,
                            "y": 40,
                            "w": 400,
                            "h": 80,
                        },
                    }
                ],
            )
        }

    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.intent.classify_user_intent",
        _classify,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.decide._stream_llm_text",
        _stream,
    )
    monkeypatch.setattr(
        "app.services.llm.agent.ainvoke_structured",
        _structured,
    )

    events = _run(
        prompt="????",
        canvas_size="800x600",
        scene_frames=[{"id": "f1", "name": "Board", "w": 800, "h": 600}],
        scene_nodes=[],
        focus_frame_id="f1",
    )
    assert events_by_type(events, "skill_start")
    ops = events_by_type(events, "tool_ops")
    assert ops, events
    assert ops[0].get("ops")
    assert events_by_type(events, "result")


@pytest.mark.integration
def test_paint_retries_exhausted_emits_execution_errors(monkeypatch):
    """Paint LLM always fails → retries_exhausted lands in execution_log."""
    from tests.design_harness import last_execution_log, resilience_signals

    async def _classify(**_kwargs: Any) -> IntentClassifyDecision:
        return IntentClassifyDecision(
            intent="design",
            paint_lane="edit",
            reply="",
            rationale="edit",
        )

    async def _stream(
        *,
        model_family: str,
        system: str,
        user: str,
        rules: dict[str, str],
        images: list[str] | None = None,
        max_tokens: int = 1024,
        enable_thinking: bool = False,
        live_emit: bool = False,
    ) -> tuple[str, str, int, list[dict[str, Any]], str]:
        del system, user, rules, images, max_tokens, enable_thinking, live_emit
        content = (
            '{"thought":"x","intent":"edit","reply":"",'
            '"need_tools":[],"need_skills":[],"tool_ops":[]}'
        )
        return model_family, content, 8, [], ""

    async def _structured(**_kwargs: Any) -> dict[str, Any]:
        raise TimeoutError("paint_ops:t:a0 timed out after 1s")

    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.intent.classify_user_intent",
        _classify,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.decide._stream_llm_text",
        _stream,
    )
    monkeypatch.setattr(
        "app.services.llm.agent.ainvoke_structured",
        _structured,
    )
    # Keep paint attempt budget tiny so the suite stays fast.
    monkeypatch.setattr(
        "app.core.config.settings.design_paint_attempt_timeout_sec",
        0.2,
        raising=False,
    )

    events = _run(
        prompt="make a title",
        canvas_size="800x600",
        scene_frames=[{"id": "f1", "name": "Board", "w": 800, "h": 600}],
        scene_nodes=[],
        focus_frame_id="f1",
    )
    assert events_by_type(events, "result")
    assert not events_by_type(events, "tool_ops")
    sig = resilience_signals(last_execution_log(events))
    assert sig["retries_exhausted"] or sig["paint_timeout"], (
        last_execution_log(events),
        events_by_type(events, "error"),
    )


def _ask_run(**kwargs):
    return asyncio.run(
        collect_design_events(
            user_id=TEST_USER, run_mode="agent", interaction_mode="ask", **kwargs
        )
    )


@pytest.mark.integration
def test_ask_clarify_emits_choice_ui(monkeypatch):
    """Ask mode: intent=ask + choice_ui → settle without tool_ops."""

    async def _classify(**_kwargs: Any) -> IntentClassifyDecision:
        return IntentClassifyDecision(
            intent="design",
            paint_lane="create",
            reply="",
            rationale="need size",
        )

    async def _stream(
        *,
        model_family: str,
        system: str,
        user: str,
        rules: dict[str, str],
        images: list[str] | None = None,
        max_tokens: int = 1024,
        enable_thinking: bool = False,
        live_emit: bool = False,
    ) -> tuple[str, str, int, list[dict[str, Any]], str]:
        del system, user, rules, images, max_tokens, enable_thinking, live_emit
        content = json.dumps(
            {
                "thought": "缺尺寸",
                "intent": "ask",
                "reply": "要哪种画布尺寸？",
                "need_tools": [],
                "need_skills": [],
                "tool_ops": [],
                "choice_ui": {
                    "mode": "buttons",
                    "options": [
                        {"label": "1920x1080", "action": "reply"},
                        {"label": "1080x1920", "action": "reply"},
                        {"label": "自定义", "action": "reply"},
                    ],
                },
                "done": True,
            },
            ensure_ascii=False,
        )
        return model_family, content, 10, [], ""

    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.intent.classify_user_intent",
        _classify,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.decide._stream_llm_text",
        _stream,
    )

    events = _ask_run(prompt="帮我做一张海报")
    assert not events_by_type(events, "tool_ops"), events
    results = events_by_type(events, "result")
    assert results
    res = results[-1]
    ui = res.get("choice_ui") or {}
    opts = ui.get("options") or []
    assert ui.get("mode") in ("buttons", "single", "confirm")
    assert any(str(o.get("action")) == "reply" for o in opts if isinstance(o, dict))


@pytest.mark.integration
def test_ask_propose_holds_ops_until_confirm(monkeypatch):
    """Ask mode: paint ops → propose (proposed_ops + confirm chips), not immediate apply."""

    async def _classify(**_kwargs: Any) -> IntentClassifyDecision:
        return IntentClassifyDecision(
            intent="design",
            paint_lane="edit",
            reply="",
            rationale="edit title",
        )

    async def _stream(
        *,
        model_family: str,
        system: str,
        user: str,
        rules: dict[str, str],
        images: list[str] | None = None,
        max_tokens: int = 1024,
        enable_thinking: bool = False,
        live_emit: bool = False,
    ) -> tuple[str, str, int, list[dict[str, Any]], str]:
        del system, user, rules, images, max_tokens, enable_thinking, live_emit
        content = (
            '{"thought":"改标题","intent":"edit","reply":"准备改标题",'
            '"need_tools":[],"need_skills":[],"tool_ops":[]}'
        )
        return model_family, content, 12, [], ""

    async def _structured(**_kwargs: Any) -> dict[str, Any]:
        return {
            "structured": PaintOpsSchema(
                intent="edit",
                reply="将添加标题文字",
                tool_ops=[
                    {
                        "name": "create_text",
                        "args": {
                            "text": "Hello",
                            "x": 40,
                            "y": 40,
                            "w": 400,
                            "h": 80,
                        },
                    }
                ],
            )
        }

    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.intent.classify_user_intent",
        _classify,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.decide._stream_llm_text",
        _stream,
    )
    monkeypatch.setattr(
        "app.services.llm.agent.ainvoke_structured",
        _structured,
    )

    events = _ask_run(
        prompt="加个标题 Hello",
        canvas_size="800x600",
        scene_frames=[{"id": "f1", "name": "Board", "w": 800, "h": 600}],
        scene_nodes=[],
        focus_frame_id="f1",
    )
    # Propose path: ops held — no live tool_ops apply SSE (or empty).
    tool = events_by_type(events, "tool_ops")
    results = events_by_type(events, "result")
    assert results, events
    res = results[-1]
    proposed = res.get("proposed_ops") or []
    assert proposed, res
    ui = res.get("choice_ui") or {}
    assert ui.get("mode") == "confirm" or any(
        str(o.get("action")) == "apply"
        for o in (ui.get("options") or [])
        if isinstance(o, dict)
    )
    # Ask propose must not have already applied as live paint (tool_ops may be absent).
    assert not tool or not tool[0].get("ops")
