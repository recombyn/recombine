# -*- coding: utf-8 -*-
"""Smoke: fixed LC design graph + edge-condition helpers."""
from __future__ import annotations

from unittest.mock import MagicMock

from langgraph.types import Command

from services.design.agent_controller import (
    _build_lc_design_graph,
    _commit,
    invalidate_agent_graph_cache,
)
from services.design.flow_runtime import choose_outgoing_edges, eval_edge_condition


def test_and_edge_condition():
    assert eval_edge_condition("mode=ask&op_failed", {"mode": "ask", "op_failed": True})
    assert not eval_edge_condition("mode=ask&op_failed", {"mode": "ask", "ok": True})


def test_build_lc_design_graph_nodes():
    invalidate_agent_graph_cache()
    compiled = _build_lc_design_graph()
    nodes = set(compiled.nodes)
    assert {
        "bootstrap",
        "memory",
        "intent_classify",
        "design_agent",
        "action",
        "propose",
        "__settle__",
    } <= nodes
    assert "thought" not in nodes


def test_commit_has_no_goto():
    rt = MagicMock()
    rt.run.round = 0
    rt.run.log = []
    cmd = _commit(rt)
    assert isinstance(cmd, Command)
    goto = getattr(cmd, "goto", None)
    assert goto in (None, (), [])


def test_label_is_not_edge_condition():
    from services.design.flow_runtime import _edge_condition

    edge = {
        "id": "e_mode_agent",
        "source": "mode_fork",
        "target": "model_route",
        "label": "Agent 主线",
        "condition": "",
        "priority": 20,
        "isDefault": True,
    }
    assert _edge_condition(edge) == ""
    outs, detail = choose_outgoing_edges(
        node={"id": "mode_fork"},
        edges=[
            {
                "id": "e_mode_ask",
                "source": "mode_fork",
                "target": "ask_thought",
                "label": "Ask 模式",
                "condition": "",
                "priority": 5,
                "isDefault": False,
            },
            edge,
        ],
        ctx={"mode": "agent"},
    )
    assert outs and outs[0]["target"] == "model_route"
    assert detail["via"] == "default"
