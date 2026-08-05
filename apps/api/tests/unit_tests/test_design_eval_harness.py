# -*- coding: utf-8 -*-
"""Eval harness regressions: critique / spatial / ask proposal / lease / chat persist."""
from __future__ import annotations

import json

from app.services import chat_store
from app.services.design.admin import task_store as ts
from app.services.design.runtime.graph.nodes import observe as observe_mod
from app.services.design.runtime.graph.state import AgentRunState, AgentRuntime
from app.services.design.runtime.decision_log import DesignRunDecision
from tests.design_harness import (
    critique_ok,
    eval_checkpoint,
    event_types,
    proposed_ops,
)


def _rt(**kwargs) -> AgentRuntime:
    run = AgentRunState(trace_id="tr", task_id="t", goal="g", painted=True, intent="create")
    rt = AgentRuntime(
        user_id="u",
        mode="agent",
        prompt="p",
        rules={},
        user_selected_model="auto",
        canvas_id=None,
        canvas_size="800x600",
        scene_key="website",
        scene_nodes=[],
        scene_frames=[],
        focus_id=None,
        images=[],
        memory_in={},
        session_id="s",
        project_id="p",
        hold=0,
        free_daily=False,
        t0=0.0,
        settle_hold_fn=None,
        refund_hold_fn=None,
        apply_ops=[],
        w=800,
        h=600,
        run=run,
        decision=DesignRunDecision(),
        system="",
        size_auto_hint="",
        chat_fallback_tmpl="",
        persona="",
        defer_tools=False,
        max_rounds=4,
        spatial_summary=None,
    )
    for k, v in kwargs.items():
        setattr(rt, k, v)
    return rt


def test_eval_checkpoint_shape():
    events = [
        {"type": "tool_ops", "ops": [{"name": "create_text"}]},
        {"type": "critique_done", "ok": False, "reason": "empty"},
        {
            "type": "result",
            "status": "success",
            "proposed_ops": [{"name": "create_text"}],
            "proposal_id": "prop_abc",
        },
    ]
    cp = eval_checkpoint(events)
    assert cp["has_tool_ops"] is True
    assert cp["critique_ok"] is False
    assert cp["proposed_ops_n"] == 1
    assert cp["proposal_id"] == "prop_abc"
    assert critique_ok(events) is False
    assert len(proposed_ops(events)) == 1
    assert "tool_ops" in event_types(events)


def test_spatial_stacked_and_ignored_suggest(monkeypatch):
    monkeypatch.setattr(observe_mod, "_critique_enabled", lambda: True)
    rt = _rt(
        spatial_summary={
            "empty_rects": [
                {"x": 0, "y": 0, "w": 40, "h": 40},
                {"x": 80, "y": 0, "w": 40, "h": 40},
                {"x": 160, "y": 0, "w": 40, "h": 40},
                {"x": 240, "y": 0, "w": 40, "h": 40},
            ],
            "suggested_place": {"x": 200, "y": 200},
            "viewport": {"x": 0, "y": 0, "w": 800, "h": 600},
        },
        paint_ops=[
            {"name": "create_text", "args": {"x": 10, "y": 10}},
            {"name": "create_rect", "args": {"x": 12, "y": 12}},
        ],
    )
    issues = observe_mod._spatial_grounding_issues(rt)
    assert any("stacked" in x or "cramped" in x or "suggested_place" in x for x in issues)


def test_ask_proposal_resolve_roundtrip(monkeypatch):
    store = {
        "P1": {
            "id": "P1",
            "meta_json": json.dumps(
                {
                    "ask_proposal": {
                        "id": "prop_1",
                        "ops": [{"name": "create_text", "args": {"x": 1}}],
                        "expires_at": 9e12,
                    }
                }
            ),
        }
    }
    monkeypatch.setattr(ts, "get_design_task", lambda tid: store.get(tid))
    ops = ts.resolve_ask_proposal_ops("P1", "prop_1")
    assert ops and ops[0]["name"] == "create_text"
    assert ts.resolve_ask_proposal_ops("P1", "wrong") is None
    assert ts.resolve_ask_proposal_ops("missing", "prop_1") is None


def test_chat_persists_ask_fields(tmp_path, monkeypatch):
    db_path = tmp_path / "chat_ask.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    monkeypatch.setenv("DATABASE_URL", "")
    from app.core.config import settings as settings_mod
    from app.core.db import reset_engine
    import app.services.db as db_mod

    settings_mod.sqlite_db_path = str(db_path)
    settings_mod.database_url = ""
    db_mod._SCHEMA_READY = False
    reset_engine()

    session = chat_store.upsert_session(
        "u_ask",
        "proj_1",
        title="ask",
        messages=[
            {
                "id": "a1",
                "role": "assistant",
                "content": "?????",
                "proposedOps": [{"name": "create_text", "args": {"x": 1}}],
                "proposalId": "prop_z",
                "designTaskId": "task_z",
                "choiceUi": {
                    "mode": "confirm",
                    "options": [
                        {"label": "??", "action": "apply"},
                        {"label": "??", "action": "dismiss"},
                    ],
                },
            }
        ],
    )
    msgs = session.get("messages") or []
    assert msgs
    m = msgs[0]
    assert m.get("proposalId") == "prop_z"
    assert m.get("designTaskId") == "task_z"
    assert m.get("proposedOps")
    assert m.get("choiceUi", {}).get("mode") == "confirm"


def test_thin_corpus_fail_open(monkeypatch):
    from app.services.design.aesthetics import scorer as scorer_mod

    monkeypatch.setattr(scorer_mod, "clip_available", lambda: True)
    monkeypatch.setattr(scorer_mod, "_min_corpus_size", lambda: 3)
    monkeypatch.setattr(
        scorer_mod,
        "list_ready_embeddings",
        lambda **_k: [{"id": 1, "scene": "website"}],
    )
    out = scorer_mod.score_design_image(image_url="data:image/jpeg;base64,xx", scene="website")
    assert out["status"] == "thin_corpus"
    assert out["pass"] is True
