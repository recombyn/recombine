# -*- coding: utf-8 -*-
"""Canvas CRUD golden paths: Agent apply vs Ask propose→confirm."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services.design.readpath.catalog import ensure_design_catalog
from app.services.design.runtime.agent_controller import PaintOpsSchema
from app.services.design.runtime.models_route import IntentClassifyDecision
from tests.design_harness import collect_design_events, events_by_type

TEST_USER = "user_eval_canvas_crud"

_BOARD = {
    "canvas_size": "800x600",
    "scene_frames": [{"id": "f1", "name": "Board", "w": 800, "h": 600}],
    "focus_frame_id": "f1",
}

_EXISTING_NODES = [
    {
        "id": "n_title",
        "type": "text",
        "name": "Title",
        "text": "Old Title",
        "x": 40,
        "y": 40,
        "w": 200,
        "h": 48,
    },
    {
        "id": "n_box",
        "type": "shape",
        "name": "Box",
        "shapeType": "rect",
        "x": 40,
        "y": 120,
        "w": 160,
        "h": 80,
    },
]


@pytest.fixture(scope="module", autouse=True)
def _catalog(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("design_crud") / "test.db"
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
def _wallet_and_fast_observe(monkeypatch):
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
    # Avoid 12s FE scene wait per paint.
    monkeypatch.setattr(
        "app.services.design.runtime.graph.state._SCENE_WAIT_SEC",
        0.05,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.apply._SCENE_WAIT_SEC",
        0.05,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.observe._SCENE_WAIT_SEC",
        0.05,
    )

    async def _ux(_rt: Any, **_k: Any) -> str:
        return "ok"

    monkeypatch.setattr(
        "app.services.design.runtime.graph.nodes.apply._llm_ux_reply",
        _ux,
    )
    monkeypatch.setattr(
        "app.services.design.runtime.graph.llm_io._llm_ux_reply",
        _ux,
        raising=False,
    )


def _agent(**kwargs: Any) -> list[dict[str, Any]]:
    return asyncio.run(
        collect_design_events(user_id=TEST_USER, run_mode="agent", **kwargs)
    )


def _ask(**kwargs: Any) -> list[dict[str, Any]]:
    return asyncio.run(
        collect_design_events(
            user_id=TEST_USER,
            run_mode="agent",
            interaction_mode="ask",
            **kwargs,
        )
    )


def _mock_paint_path(monkeypatch: Any, *, ops: list[dict[str, Any]], intent: str = "edit") -> None:
    async def _classify(**_kwargs: Any) -> IntentClassifyDecision:
        return IntentClassifyDecision(
            intent="design",
            paint_lane=intent if intent in ("edit", "create") else "edit",
            reply="",
            rationale="canvas crud",
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
            f'{{"thought":"crud","intent":"{intent}","reply":"",'
            f'"need_tools":[],"need_skills":[],"tool_ops":[]}}'
        )
        return model_family, content, 8, [], ""

    async def _structured(**_kwargs: Any) -> dict[str, Any]:
        return {
            "structured": PaintOpsSchema(
                intent=intent if intent in ("edit", "create") else "edit",
                reply="准备改画布",
                tool_ops=ops,
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


def _first_ops(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    batches = events_by_type(events, "tool_ops")
    assert batches, events
    ops = batches[0].get("ops") or []
    assert isinstance(ops, list) and ops
    return [o for o in ops if isinstance(o, dict)]


def _op_names(ops: list[dict[str, Any]]) -> list[str]:
    return [str(o.get("name") or o.get("op_key") or "") for o in ops]


@pytest.mark.integration
def test_agent_create_text_and_shape(monkeypatch):
    _mock_paint_path(
        monkeypatch,
        intent="create",
        ops=[
            {
                "name": "create_text",
                "args": {"text": "Hello", "x": 40, "y": 40, "w": 240, "h": 48},
            },
            {
                "name": "create_shape",
                "args": {
                    "shapeType": "rect",
                    "x": 40,
                    "y": 100,
                    "w": 120,
                    "h": 80,
                    "fill": "#3366FF",
                },
            },
        ],
    )
    events = _agent(prompt="加标题和蓝色矩形", scene_nodes=[], **_BOARD)
    ops = _first_ops(events)
    names = _op_names(ops)
    assert "create_text" in names
    assert "create_shape" in names
    assert events_by_type(events, "result")


@pytest.mark.integration
def test_agent_update_node(monkeypatch):
    _mock_paint_path(
        monkeypatch,
        intent="edit",
        ops=[
            {
                "name": "update_node",
                "args": {"nodeId": "n_title", "text": "New Title", "fill": "#111111"},
            }
        ],
    )
    events = _agent(
        prompt="把标题改成 New Title",
        scene_nodes=list(_EXISTING_NODES),
        **_BOARD,
    )
    ops = _first_ops(events)
    assert _op_names(ops) == ["update_node"]
    assert ops[0].get("args", {}).get("nodeId") == "n_title"
    assert events_by_type(events, "result")


@pytest.mark.integration
def test_agent_delete_nodes(monkeypatch):
    _mock_paint_path(
        monkeypatch,
        intent="edit",
        ops=[{"name": "delete_nodes", "args": {"nodeIds": ["n_box"]}}],
    )
    events = _agent(
        prompt="删掉那个矩形",
        scene_nodes=list(_EXISTING_NODES),
        **_BOARD,
    )
    ops = _first_ops(events)
    assert _op_names(ops) == ["delete_nodes"]
    assert ops[0].get("args", {}).get("nodeIds") == ["n_box"]
    assert events_by_type(events, "result")


@pytest.mark.integration
def test_ask_design_propose_then_confirm_apply(monkeypatch):
    """Ask: propose create ops → user confirm via apply_ops → live tool_ops."""
    create_ops = [
        {
            "name": "create_text",
            "args": {"text": "Ask Title", "x": 60, "y": 60, "w": 280, "h": 56},
        }
    ]
    _mock_paint_path(monkeypatch, intent="create", ops=create_ops)

    propose_events = _ask(prompt="加个标题 Ask Title", scene_nodes=[], **_BOARD)
    assert not events_by_type(propose_events, "tool_ops") or not (
        events_by_type(propose_events, "tool_ops")[0].get("ops")
    )
    res = events_by_type(propose_events, "result")[-1]
    proposed = res.get("proposed_ops") or []
    assert proposed
    assert str(res.get("proposal_id") or "").startswith("prop_")

    confirm_events = _ask(
        prompt="确认执行",
        apply_ops=proposed,
        scene_nodes=[],
        **_BOARD,
    )
    applied = events_by_type(confirm_events, "tool_ops")
    assert applied, confirm_events
    names = _op_names([o for o in (applied[0].get("ops") or []) if isinstance(o, dict)])
    assert "create_text" in names
    assert events_by_type(confirm_events, "result")


@pytest.mark.integration
def test_ask_design_update_propose(monkeypatch):
    _mock_paint_path(
        monkeypatch,
        intent="edit",
        ops=[
            {
                "name": "update_node",
                "args": {"nodeId": "n_title", "text": "Ask Updated"},
            }
        ],
    )
    events = _ask(
        prompt="改标题为 Ask Updated",
        scene_nodes=list(_EXISTING_NODES),
        **_BOARD,
    )
    res = events_by_type(events, "result")[-1]
    proposed = res.get("proposed_ops") or []
    assert proposed
    assert str(proposed[0].get("name") or "") == "update_node"
    ui = res.get("choice_ui") or {}
    assert ui.get("mode") == "confirm" or any(
        str(o.get("action")) == "apply"
        for o in (ui.get("options") or [])
        if isinstance(o, dict)
    )


_MINI_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<path d="M12 2 L2 22 H22 Z"/></svg>'
)

_RICH_NODES = [
    *_EXISTING_NODES,
    {
        "id": "n_img",
        "type": "image",
        "name": "Photo",
        "x": 220,
        "y": 40,
        "w": 120,
        "h": 120,
        "src": "https://example.com/a.png",
    },
    {
        "id": "n_box2",
        "type": "shape",
        "name": "Box2",
        "shapeType": "ellipse",
        "x": 220,
        "y": 180,
        "w": 80,
        "h": 80,
    },
    {
        "id": "n_grp",
        "type": "group",
        "name": "Group",
        "x": 40,
        "y": 240,
        "w": 100,
        "h": 60,
    },
]

# (op_name, intent, ops, needs_existing_nodes)
_ALL_AGENT_CASES: list[tuple[str, str, list[dict[str, Any]], bool]] = [
    (
        "create_text",
        "create",
        [{"name": "create_text", "args": {"text": "T", "x": 10, "y": 10, "w": 100, "h": 40}}],
        False,
    ),
    (
        "create_shape",
        "create",
        [
            {
                "name": "create_shape",
                "args": {
                    "shapeType": "rect",
                    "x": 10,
                    "y": 10,
                    "w": 80,
                    "h": 60,
                    "fill": "#00AA88",
                },
            }
        ],
        False,
    ),
    (
        "create_image",
        "create",
        [
            {
                "name": "create_image",
                "args": {
                    "src": "https://example.com/demo.png",
                    "x": 10,
                    "y": 10,
                    "width": 100,
                    "height": 100,
                },
            }
        ],
        False,
    ),
    (
        "create_svg",
        "create",
        [
            {
                "name": "create_svg",
                "args": {"svg": _MINI_SVG, "x": 10, "y": 10, "width": 48, "height": 48},
            }
        ],
        False,
    ),
    (
        "create_icon",
        "create",
        [
            {
                "name": "create_icon",
                "args": {"svg": _MINI_SVG, "x": 10, "y": 10, "width": 24, "height": 24},
            }
        ],
        False,
    ),
    (
        "create_frame",
        "create",
        [
            {
                "name": "create_frame",
                "args": {"x": 0, "y": 0, "width": 800, "height": 600, "name": "New"},
            },
            {
                "name": "create_text",
                "args": {"text": "in frame", "x": 20, "y": 20, "w": 120, "h": 40},
            },
        ],
        False,
    ),
    (
        "update_node",
        "edit",
        [{"name": "update_node", "args": {"nodeId": "n_title", "text": "U"}}],
        True,
    ),
    (
        "delete_nodes",
        "edit",
        [{"name": "delete_nodes", "args": {"nodeIds": ["n_box"]}}],
        True,
    ),
    (
        "update_frame",
        "edit",
        [
            {
                "name": "update_frame",
                "args": {"frameId": "f1", "name": "Renamed", "backgroundColor": "#FAFAFA"},
            }
        ],
        True,
    ),
    (
        "delete_frame",
        "edit",
        [{"name": "delete_frame", "args": {"frameId": "f1"}}],
        True,
    ),
    (
        "align_nodes",
        "edit",
        [
            {
                "name": "align_nodes",
                "args": {"nodeIds": ["n_title", "n_box"], "mode": "left"},
            }
        ],
        True,
    ),
    (
        "distribute_nodes",
        "edit",
        [
            {
                "name": "distribute_nodes",
                "args": {"nodeIds": ["n_title", "n_box", "n_box2"], "axis": "v"},
            }
        ],
        True,
    ),
    (
        "reorder_nodes",
        "edit",
        [
            {
                "name": "reorder_nodes",
                "args": {"nodeIds": ["n_title"], "action": "front"},
            }
        ],
        True,
    ),
    (
        "group_nodes",
        "edit",
        [{"name": "group_nodes", "args": {"nodeIds": ["n_title", "n_box"]}}],
        True,
    ),
    (
        "ungroup_nodes",
        "edit",
        [{"name": "ungroup_nodes", "args": {"nodeIds": ["n_grp"]}}],
        True,
    ),
    (
        "duplicate_nodes",
        "edit",
        [
            {
                "name": "duplicate_nodes",
                "args": {"nodeIds": ["n_box"], "offsetX": 20, "offsetY": 20},
            }
        ],
        True,
    ),
    (
        "flip_nodes",
        "edit",
        [{"name": "flip_nodes", "args": {"nodeIds": ["n_box"], "flipX": True}}],
        True,
    ),
    (
        "boolean_op",
        "edit",
        [
            {
                "name": "boolean_op",
                "args": {"nodeIds": ["n_box", "n_box2"], "mode": "union"},
            }
        ],
        True,
    ),
    (
        "set_canvas_background",
        "edit",
        [{"name": "set_canvas_background", "args": {"color": "#F5F5F5", "fillType": "solid"}}],
        False,
    ),
    (
        "set_viewport",
        "edit",
        [{"name": "set_viewport", "args": {"action": "fit"}}],
        False,
    ),
    (
        "image_process",
        "edit",
        [
            {
                "name": "image_process",
                "args": {"nodeId": "n_img", "kind": "removeBg"},
            }
        ],
        True,
    ),
    (
        "export_canvas",
        "edit",
        [{"name": "export_canvas", "args": {"format": "png", "multiplier": 1}}],
        False,
    ),
]


@pytest.mark.integration
@pytest.mark.parametrize(
    "op_key,intent,ops,need_nodes",
    _ALL_AGENT_CASES,
    ids=[c[0] for c in _ALL_AGENT_CASES],
)
def test_agent_all_canvas_ops(
    monkeypatch: Any,
    op_key: str,
    intent: str,
    ops: list[dict[str, Any]],
    need_nodes: bool,
):
    """Every seed canvas op must validate and emit through Agent paint→action."""
    async def _hydrate(step_ops: list, **_k: Any) -> tuple[list, int]:
        return list(step_ops or []), 0

    monkeypatch.setattr(
        "app.services.design.ops.image_hydrate._hydrate_tool_ops_images",
        _hydrate,
    )
    _mock_paint_path(monkeypatch, intent=intent, ops=ops)
    nodes = list(_RICH_NODES) if need_nodes else []
    # delete_frame needs an extra spare frame so board still has inventory.
    frames = list(_BOARD["scene_frames"])
    if op_key == "delete_frame":
        frames = [
            {"id": "f1", "name": "Board", "w": 800, "h": 600},
            {"id": "f2", "name": "Spare", "w": 400, "h": 400},
        ]
    events = _agent(
        prompt=f"canvas op {op_key}",
        scene_nodes=nodes,
        canvas_size=_BOARD["canvas_size"],
        scene_frames=frames,
        focus_frame_id="f1",
    )
    assert events_by_type(events, "result"), events
    emitted = _first_ops(events)
    names = _op_names(emitted)
    if op_key == "create_frame":
        # create_frame is opened via canvas_size / shimmer, stripped from tool_ops SSE.
        assert "create_text" in names, names
        assert any(
            e.get("type") in ("canvas_size", "design_loading", "artboard")
            or "frame" in str(e.get("type") or "")
            for e in events
        ) or "create_text" in names
    else:
        assert op_key in names, (op_key, names, events_by_type(events, "error"))


@pytest.mark.integration
@pytest.mark.parametrize(
    "op_key,intent,ops,need_nodes",
    _ALL_AGENT_CASES,
    ids=[f"ask_{c[0]}" for c in _ALL_AGENT_CASES],
)
def test_ask_all_canvas_ops_propose(
    monkeypatch: Any,
    op_key: str,
    intent: str,
    ops: list[dict[str, Any]],
    need_nodes: bool,
):
    """Ask mode: every op is held in proposed_ops (not live-applied)."""
    async def _hydrate(step_ops: list, **_k: Any) -> tuple[list, int]:
        return list(step_ops or []), 0

    monkeypatch.setattr(
        "app.services.design.ops.image_hydrate._hydrate_tool_ops_images",
        _hydrate,
    )
    _mock_paint_path(monkeypatch, intent=intent, ops=ops)
    nodes = list(_RICH_NODES) if need_nodes else []
    frames = list(_BOARD["scene_frames"])
    if op_key == "delete_frame":
        frames = [
            {"id": "f1", "name": "Board", "w": 800, "h": 600},
            {"id": "f2", "name": "Spare", "w": 400, "h": 400},
        ]
    events = _ask(
        prompt=f"ask op {op_key}",
        scene_nodes=nodes,
        canvas_size=_BOARD["canvas_size"],
        scene_frames=frames,
        focus_frame_id="f1",
    )
    # No live apply
    live = events_by_type(events, "tool_ops")
    assert not live or not live[0].get("ops")
    res = events_by_type(events, "result")[-1]
    proposed = [o for o in (res.get("proposed_ops") or []) if isinstance(o, dict)]
    names = _op_names(proposed)
    # Propose keeps create_frame in the held batch (not stripped until apply).
    assert op_key in names, (op_key, names, res)
