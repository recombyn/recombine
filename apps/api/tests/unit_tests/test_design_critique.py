# -*- coding: utf-8 -*-
"""Phase 3: post-paint critique + spatial grounding helpers."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

from app.services.design.runtime.graph.nodes import observe as observe_mod
from app.services.design.runtime.graph.state import AgentRunState, AgentRuntime
from app.services.design.runtime.decision_log import DesignRunDecision


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


def test_structure_critique_empty_artboard(monkeypatch):
    emitted: list[dict] = []
    monkeypatch.setattr(observe_mod, "_emit", lambda ev: emitted.append(ev))
    monkeypatch.setattr(observe_mod, "_critique_enabled", lambda: True)
    rt = _rt(
        scene_nodes=[],
        scene_frames=[{"id": "f1", "is_empty": True}],
        paint_ops=[{"name": "create_text", "args": {}}],
    )
    issues = observe_mod._run_post_paint_critique(rt, rt.run, round_i=0)
    assert any("empty" in x.lower() for x in issues)
    assert any(e.get("type") == "critique_start" for e in emitted)
    assert any(e.get("type") == "critique_done" and e.get("ok") is False for e in emitted)


def test_critique_pass_when_nodes_present(monkeypatch):
    emitted: list[dict] = []
    monkeypatch.setattr(observe_mod, "_emit", lambda ev: emitted.append(ev))
    monkeypatch.setattr(observe_mod, "_critique_enabled", lambda: True)
    monkeypatch.setattr(observe_mod, "_spatial_grounding_issues", lambda _rt: [])
    rt = _rt(
        scene_nodes=[{"id": "n1", "w": 100, "h": 40}],
        scene_frames=[{"id": "f1", "is_empty": False}],
        paint_ops=[{"name": "create_text", "args": {"x": 10, "y": 10}}],
    )
    issues = observe_mod._run_post_paint_critique(rt, rt.run, round_i=1)
    assert issues == []
    done = [e for e in emitted if e.get("type") == "critique_done"][-1]
    assert done.get("ok") is True


def test_spatial_cramped_heuristic():
    rt = _rt(
        spatial_summary={
            "empty_rects": [
                {"x": 0, "y": 0, "w": 10, "h": 10},
                {"x": 20, "y": 0, "w": 10, "h": 10},
                {"x": 40, "y": 0, "w": 10, "h": 10},
            ]
        },
        paint_ops=[
            {"name": "create_rect", "args": {}},
            {"name": "create_text", "args": {}},
        ],
    )
    issues = observe_mod._spatial_grounding_issues(rt)
    assert any("cramped" in x or "empty" in x for x in issues)


def test_critique_disabled(monkeypatch):
    monkeypatch.setattr(observe_mod, "_critique_enabled", lambda: False)
    rt = _rt(scene_nodes=[], scene_frames=[{"id": "f1", "is_empty": True}])
    assert observe_mod._run_post_paint_critique(rt, rt.run, round_i=0) == []


def test_aesthetic_critique_fail_open_unavailable(monkeypatch):
    monkeypatch.setattr(observe_mod, "_aesthetics_critique_enabled", lambda: True)

    def _score(**_k):
        return {"status": "unavailable", "pass": True}

    monkeypatch.setattr(
        "app.services.design.aesthetics.scorer.score_design_image",
        _score,
    )
    assert (
        observe_mod._aesthetic_critique_issues(
            preview_image="data:image/jpeg;base64,xxx",
            scene_key="website",
        )
        == []
    )


def test_aesthetic_critique_thin_corpus_no_issues(monkeypatch):
    monkeypatch.setattr(observe_mod, "_aesthetics_critique_enabled", lambda: True)

    def _score(**_k):
        return {"status": "thin_corpus", "pass": True, "reason": "thin"}

    monkeypatch.setattr(
        "app.services.design.aesthetics.scorer.score_design_image",
        _score,
    )
    assert (
        observe_mod._aesthetic_critique_issues(
            preview_image="data:image/jpeg;base64,xxx",
            scene_key="website",
        )
        == []
    )


def test_aesthetic_critique_collects_gaps(monkeypatch):
    monkeypatch.setattr(observe_mod, "_aesthetics_critique_enabled", lambda: True)

    def _score(**_k):
        return {
            "status": "scored",
            "pass": False,
            "score": 0.4,
            "threshold": 0.72,
            "gaps": [
                {"kind": "layout", "detail": "sparse"},
                {"kind": "color", "hint": "dull"},
            ],
        }

    monkeypatch.setattr(
        "app.services.design.aesthetics.scorer.score_design_image",
        _score,
    )
    issues = observe_mod._aesthetic_critique_issues(
        preview_image="data:image/jpeg;base64,xxx",
        scene_key="website",
    )
    assert any("0.40" in x or "score" in x for x in issues)
    assert any("layout" in x for x in issues)


def test_critique_includes_aesthetics(monkeypatch):
    emitted: list[dict] = []
    monkeypatch.setattr(observe_mod, "_emit", lambda ev: emitted.append(ev))
    monkeypatch.setattr(observe_mod, "_critique_enabled", lambda: True)
    monkeypatch.setattr(observe_mod, "_spatial_grounding_issues", lambda _rt: [])
    monkeypatch.setattr(
        observe_mod,
        "_aesthetic_critique_issues",
        lambda **_k: ["aesthetics score 0.40 < 0.72"],
    )
    rt = _rt(
        scene_nodes=[{"id": "n1", "w": 100, "h": 40}],
        scene_frames=[{"id": "f1", "is_empty": False}],
    )
    issues = observe_mod._run_post_paint_critique(
        rt, rt.run, round_i=0, preview_image="data:image/jpeg;base64,x"
    )
    assert any("aesthetics" in x for x in issues)
    done = [e for e in emitted if e.get("type") == "critique_done"][-1]
    assert done.get("has_preview") is True
    assert done.get("ok") is False


def test_format_critique_reflect_note_aesthetics_and_placement():
    note = observe_mod._format_critique_reflect_note(
        [
            "aesthetics score 0.40 < 0.72",
            "aesthetics:layout: sparse",
            "layout may be cramped: 3 empty regions remain",
        ]
    )
    assert "CRITIQUE" in note
    assert "Aesthetic gaps" in note
    assert "Placement" in note
    assert "empty_rects" in note
    assert "0.40" in note


def test_layout_craft_flags_clip_emoji_contrast():
    rt = _rt(
        scene_frames=[{"id": "f1", "w": 400, "h": 600, "is_empty": False}],
        scene_nodes=[
            {
                "id": "bg",
                "type": "rect",
                "x": 0,
                "y": 0,
                "w": 400,
                "h": 200,
                "fill": "#eeeeee",
            },
            {
                "id": "t1",
                "type": "text",
                "x": 350,
                "y": 10,
                "w": 120,
                "h": 40,
                "fontSize": 48,
                "text": "🎃 HALLOWEEN",
                "fill": "#f5f5f5",
            },
        ],
    )
    issues = observe_mod._layout_craft_issues(rt)
    joined = " ".join(issues).lower()
    assert "clip" in joined or "overflow" in joined
    assert "emoji" in joined or "tofu" in joined
    assert "contrast" in joined


def test_long_canvas_coverage_incomplete():
    rt = _rt(
        prompt="电商详情长图 750x2400",
        scene_frames=[{"id": "f1", "w": 750, "h": 2400, "is_empty": False}],
        scene_nodes=[
            {"id": "n1", "type": "image", "x": 0, "y": 0, "w": 750, "h": 600},
            {"id": "n2", "type": "text", "x": 40, "y": 640, "w": 600, "h": 40, "text": "title"},
            {"id": "n3", "type": "rect", "x": 0, "y": 700, "w": 750, "h": 200},
        ],
    )
    rt.run.intent = "create"
    issues = observe_mod._long_canvas_coverage_issues(rt)
    assert issues
    assert "long canvas incomplete" in issues[0]
    assert "APPEND" in issues[0]


def test_long_canvas_coverage_ok_when_filled():
    rt = _rt(
        scene_frames=[{"id": "f1", "w": 750, "h": 2400, "is_empty": False}],
        scene_nodes=[
            {"id": "n1", "type": "image", "x": 0, "y": 0, "w": 750, "h": 900},
            {"id": "n2", "type": "rect", "x": 0, "y": 900, "w": 750, "h": 900},
            {"id": "n3", "type": "text", "x": 40, "y": 1900, "w": 600, "h": 80, "text": "buy"},
        ],
    )
    rt.run.intent = "create"
    assert observe_mod._long_canvas_coverage_issues(rt) == []


def test_format_critique_reflect_note_long_canvas_and_type():
    note = observe_mod._format_critique_reflect_note(
        [
            "long canvas incomplete: content ends near y=1200 of 2400",
            "text clipped/overflow: 1 text node(s) extend past artboard",
            "low contrast: 1 text node(s) too close to background fill",
        ]
    )
    assert "Continue long page" in note
    assert "Type:" in note
    assert "APPEND" in note or "below" in note.lower()


def test_critique_includes_layout_craft(monkeypatch):
    emitted: list[dict] = []
    monkeypatch.setattr(observe_mod, "_emit", lambda ev: emitted.append(ev))
    monkeypatch.setattr(observe_mod, "_critique_enabled", lambda: True)
    monkeypatch.setattr(observe_mod, "_spatial_grounding_issues", lambda _rt: [])
    monkeypatch.setattr(observe_mod, "_aesthetic_critique_issues", lambda **_k: [])
    monkeypatch.setattr(observe_mod, "_poster_hero_issues", lambda _rt: [])
    rt = _rt(
        scene_frames=[{"id": "f1", "w": 300, "h": 400, "is_empty": False}],
        scene_nodes=[
            {
                "id": "t1",
                "type": "text",
                "x": 280,
                "y": 10,
                "w": 80,
                "h": 30,
                "fontSize": 20,
                "text": "TITLE",
                "fill": "#111111",
            }
        ],
    )
    issues = observe_mod._run_post_paint_critique(rt, rt.run, round_i=0)
    assert any("clip" in x.lower() or "overflow" in x.lower() for x in issues)


def test_retry_paint_from_critique_sets_reflect_note(monkeypatch):
    emitted: list[dict] = []
    monkeypatch.setattr(observe_mod, "_emit", lambda ev: emitted.append(ev))
    rt = _rt()
    rt.run.reflect_left = 2
    rt.run.painted = True

    async def _run():
        return await observe_mod._retry_paint_from_critique(
            rt,
            rt.run,
            round_i=1,
            issues=["aesthetics score 0.35 < 0.72", "artboard looks empty"],
        )

    cmd = asyncio.run(_run())
    assert getattr(cmd, "goto", None) == "paint_ops"
    assert "CRITIQUE" in (rt.run.reflect_note or "")
    assert "Aesthetic gaps" in (rt.run.reflect_note or "")
    assert rt.flags.get("critique_failed") is True
    assert rt.run.reflect_left == 1
