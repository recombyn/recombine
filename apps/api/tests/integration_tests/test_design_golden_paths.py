"""Golden-path design runs — agent_loop with mocked wallet / LLM turns."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

import pytest

from services.design.catalog import ensure_design_catalog
from tests.design_harness import collect_design_events, events_by_type, last_decision

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
        lambda _uid: 10_000,
    )
    monkeypatch.setattr(
        "services.design.orchestrator.spend_tokens",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "services.design.orchestrator.credit_tokens",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "services.design.orchestrator.settle_token_hold",
        lambda *_a, **_k: 1,
    )


def _run(**kwargs):
    return asyncio.run(collect_design_events(user_id=TEST_USER, run_mode="agent", **kwargs))


async def _fake_chat_turns(**_k) -> AsyncIterator[dict[str, Any]]:
    yield {
        "type": "skill_start",
        "index": 0,
        "skill_key": "agent_loop",
        "skill_name": "agent",
        "category": "agent",
    }
    yield {"type": "analysis", "text": "你好呀", "skill_name": "agent", "index": 0}
    yield {
        "type": "skill_done",
        "index": 0,
        "skill_key": "agent_loop",
        "skill_name": "agent",
        "tokens": 12,
    }
    yield {
        "type": "_agent_loop_meta",
        "total_tokens": 12,
        "actual_models": [],
        "applied_ops": [],
        "tool_ops_applied": False,
        "summary": "你好呀",
        "chat_only": True,
        "scene_nodes": [],
    }


async def _fake_ops_turns(**_k) -> AsyncIterator[dict[str, Any]]:
    yield {
        "type": "skill_start",
        "index": 0,
        "skill_key": "agent_loop",
        "skill_name": "agent",
        "category": "agent",
    }
    yield {
        "type": "tool_ops",
        "index": 0,
        "skill_key": "agent_loop",
        "skill_name": "agent",
        "ops": [
            {
                "name": "update_node",
                "args": {"id": "node-1", "cornerRadius": 8},
            }
        ],
    }
    yield {
        "type": "skill_done",
        "index": 0,
        "skill_key": "agent_loop",
        "skill_name": "agent",
        "tokens": 40,
    }
    yield {
        "type": "_agent_loop_meta",
        "total_tokens": 40,
        "actual_models": [],
        "applied_ops": [{"name": "update_node"}],
        "tool_ops_applied": True,
        "summary": "已更新圆角",
        "chat_only": False,
        "scene_nodes": [{"id": "node-1"}],
    }


@pytest.mark.integration
def test_golden_agent_loop_chat():
    with patch(
        "services.design.orchestrator.run_agent_turns",
        side_effect=_fake_chat_turns,
    ):
        events = _run(prompt="你好", scene="poster")

    dec = last_decision(events)
    assert dec is not None
    assert dec.get("route") in ("agent_loop", "agent_loop_chat")
    assert events_by_type(events, "chat_done")
    results = events_by_type(events, "result")
    assert results
    assert results[0].get("intent") == "chat"
    assert results[0].get("tool_ops_applied") is False
    log = results[0].get("decision_log") or {}
    assert log.get("route") == "agent_loop_chat"


@pytest.mark.integration
def test_golden_agent_loop_tool_ops_with_target():
    with patch(
        "services.design.orchestrator.run_agent_turns",
        side_effect=_fake_ops_turns,
    ):
        events = _run(
            prompt="[Target element: node-1]\n修改圆角为8px",
            scene="poster",
            scene_nodes=[{"id": "node-1", "kind": "rect", "cornerRadius": 0}],
            current_svg='<svg width="100" height="100"><rect id="node-1"/></svg>',
        )

    dec = last_decision(events)
    assert dec is not None
    assert dec.get("route") == "agent_loop"
    assert dec.get("has_target_chip") is True
    assert dec.get("has_scene_nodes") is True
    assert events_by_type(events, "tool_ops")
    statuses = events_by_type(events, "status")
    assert statuses
    assert statuses[0].get("status") == "running"
    results = events_by_type(events, "result")
    assert results
    assert results[0].get("tool_ops_applied") is True
    assert results[0].get("edit_in_place") is True


@pytest.mark.integration
def test_golden_memory_injection_flag():
    medium = {
        "v": 1,
        "canvas": {
            "focus_frame_id": "frame_a",
            "last_agent_frame_id": "frame_a",
            "frames": [{"id": "frame_a", "is_empty": True}],
        },
        "last_run": {"intent": "edit", "blank_artboard": False},
    }

    with patch(
        "services.design.orchestrator.run_agent_turns",
        side_effect=_fake_ops_turns,
    ):
        events = _run(
            prompt="在上一块空白画布上画一个实心圆，不要新建画板",
            scene="poster",
            session_id="sess_eval_1",
            project_id="proj_eval",
            memory={"medium": medium, "short": [{"role": "user", "text": "新建画布"}]},
            scene_nodes=[{"id": "n1", "kind": "rect"}],
            current_svg='<svg width="200" height="200"><rect id="n1"/></svg>',
        )
    dec = last_decision(events)
    assert dec is not None
    assert dec.get("route") == "agent_loop"
    assert dec.get("focus_frame_id") == "frame_a"
    assert dec.get("memory_injected") is True
    assert dec.get("memory_blocks_chars", 0) > 0
    assert dec.get("short_turns", 0) >= 1
