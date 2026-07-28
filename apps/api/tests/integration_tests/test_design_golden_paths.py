"""Golden-path: agent permission gate + ReAct P0 (mocked LLM)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest

from services.design.catalog import ensure_design_catalog
from tests.design_harness import collect_design_events, events_by_type

TEST_USER = "user_eval_golden"


@pytest.fixture(scope="module", autouse=True)
def _catalog(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("design_golden") / "test.db"
    import os

    os.environ["SQLITE_DB_PATH"] = str(db_path)
    os.environ["DATABASE_URL"] = ""
    from config import settings as settings_mod

    settings_mod.settings.sqlite_db_path = str(db_path)
    settings_mod.settings.database_url = ""
    import services.db as db_mod
    import services.design.catalog as catalog_mod

    db_mod._SCHEMA_READY = False
    catalog_mod._CATALOG_READY = False
    ensure_design_catalog(force=True)


@pytest.fixture(autouse=True)
def _wallet(monkeypatch):
    monkeypatch.setattr(
        "services.design.orchestrator.get_user_tokens",
        lambda _uid: 200_000,
    )
    monkeypatch.setattr(
        "services.design.orchestrator.free_daily_remaining",
        lambda _uid: 0,
    )
    monkeypatch.setattr(
        "services.design.agent_controller.get_user_tokens",
        lambda _uid: 200_000,
    )
    monkeypatch.setattr(
        "services.design.orchestrator._reserve_design_hold",
        lambda *_a, **_k: (100, False),
    )
    monkeypatch.setattr(
        "services.design.orchestrator._settle_hold",
        lambda *_a, **_k: 10,
    )
    monkeypatch.setattr(
        "services.design.orchestrator._refund_hold",
        lambda *_a, **_k: None,
    )


def _mock_stream(content: str):
    async def _gen(**_kwargs: Any) -> AsyncIterator[tuple[str, Any]]:
        yield "token", content
        yield "usage", 42

    return _gen


def _run(**kwargs):
    return asyncio.run(
        collect_design_events(user_id=TEST_USER, run_mode="agent", **kwargs)
    )


@pytest.mark.integration
def test_permission_gate_denies_when_broke(monkeypatch):
    monkeypatch.setattr(
        "services.design.orchestrator.get_user_tokens",
        lambda _uid: 0,
    )
    monkeypatch.setattr(
        "services.design.orchestrator.free_daily_remaining",
        lambda _uid: 0,
    )
    events = _run(prompt="你好")
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
    monkeypatch.setattr(
        "services.design.agent_controller.stream_skill_step",
        _mock_stream(
            '{"thought":"greeting","intent":"chat","reply":"你好！有什么可以帮你的？","tool_ops":[],"done":true}'
        ),
    )
    events = _run(prompt="你好")
    perms = [e for e in events if e.get("type") == "permission"]
    assert perms and perms[0].get("can_call_llm") is True
    assert events_by_type(events, "skill_start")
    tokens = events_by_type(events, "token")
    assert tokens and "你好" in (tokens[0].get("text") or "")
    assert events_by_type(events, "chat_done")
    assert events_by_type(events, "result")
    assert not events_by_type(events, "tool_ops")


@pytest.mark.integration
def test_react_edit_emits_tool_ops(monkeypatch):
    monkeypatch.setattr(
        "services.design.agent_controller.stream_skill_step",
        _mock_stream(
            '{"thought":"add title","intent":"edit","reply":"已添加标题",'
            '"tool_ops":[{"op_key":"create_text","args":{"text":"标题","x":40,"y":40,"w":400,"h":80}}],'
            '"done":true}'
        ),
    )

    async def _wait(_tid: str, timeout_sec: float = 12.0):
        del timeout_sec
        return {
            "nodes": [
                {
                    "id": "n1",
                    "type": "text",
                    "text": "标题",
                    "frameId": "f1",
                }
            ],
            "frames": [{"id": "f1", "name": "Board", "w": 800, "h": 600}],
        }

    async def _begin(*_a, **_k):
        return None

    monkeypatch.setattr(
        "services.design.agent_controller.begin_wait",
        _begin,
    )
    monkeypatch.setattr(
        "services.design.agent_controller.wait_for_scene",
        _wait,
    )
    events = _run(
        prompt="加个标题",
        canvas_size="800x600",
        scene_frames=[{"id": "f1", "name": "Board", "w": 800, "h": 600}],
        scene_nodes=[],
        focus_frame_id="f1",
    )
    ops = events_by_type(events, "tool_ops")
    assert ops, events
    assert ops[0].get("ops")
    assert events_by_type(events, "scene_feedback_request")
    assert events_by_type(events, "result")
