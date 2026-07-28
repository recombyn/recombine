# -*- coding: utf-8 -*-
"""Smoke: graph-first routing — P0 edges, no fake parallel, fact flags."""
from __future__ import annotations

from unittest.mock import MagicMock

from langgraph.types import Command

from services.design.admin_store import _DEFAULT_AGENT_FLOW_GRAPH, _normalize_agent_flow_graph
from services.design.agent_controller import (
    _build_agent_graph_from_published,
    _commit,
    invalidate_agent_graph_cache,
)
from services.design.flow_runtime import choose_outgoing_edges, eval_edge_condition


def test_and_edge_condition():
    assert eval_edge_condition("mode=ask&op_failed", {"mode": "ask", "op_failed": True})
    assert not eval_edge_condition("mode=ask&op_failed", {"mode": "ask", "ok": True})


def test_resource_fork_goes_to_thought_by_mode():
    graph, _ = _normalize_agent_flow_graph(_DEFAULT_AGENT_FLOW_GRAPH)
    ids = {n["id"] for n in graph["nodes"]}
    assert "need_knowledge" not in ids
    assert "resource_join" not in ids
    assert "hydrate" not in ids
    assert "dual_sample" not in ids
    fork = next(n for n in graph["nodes"] if n["id"] == "resource_fork")
    outs = [e for e in graph["edges"] if e.get("source") == "resource_fork"]
    chosen, _ = choose_outgoing_edges(
        node=fork, edges=outs, ctx={"mode": "agent", "ready": True}
    )
    assert chosen and chosen[0]["target"] == "thought"
    chosen_ask, _ = choose_outgoing_edges(
        node=fork, edges=outs, ctx={"mode": "ask", "ready": True}
    )
    assert chosen_ask and chosen_ask[0]["target"] == "ask_thought"


def test_observe_p0_edges():
    graph, _ = _normalize_agent_flow_graph(_DEFAULT_AGENT_FLOW_GRAPH)
    obs = next(n for n in graph["nodes"] if n["id"] == "observe")
    outs = [e for e in graph["edges"] if e.get("source") == "observe"]

    ready, d = choose_outgoing_edges(
        node=obs, edges=outs, ctx={"scene_ready": True, "mode": "ask"}
    )
    assert ready[0]["target"] == "verify"
    assert d.get("condition") == "scene_ready"

    ask_fail, _ = choose_outgoing_edges(
        node=obs, edges=outs, ctx={"mode": "ask", "op_failed": True, "ok": False}
    )
    assert ask_fail[0]["target"] == "clarify"

    op_fail, _ = choose_outgoing_edges(
        node=obs, edges=outs, ctx={"op_failed": True, "ok": False, "mode": "agent"}
    )
    assert op_fail[0]["target"] == "reflect"


def test_build_graph_wires_conditional_edges():
    invalidate_agent_graph_cache()
    graph, _ = _normalize_agent_flow_graph(_DEFAULT_AGENT_FLOW_GRAPH)
    compiled = _build_agent_graph_from_published(
        {"id": "default", "version": 1, "graph": graph}
    )
    nodes = set(compiled.nodes)
    assert {"bootstrap", "thought", "resource_fork", "__settle__"} <= nodes
    assert "hydrate" not in nodes or "hydrate" not in {n["id"] for n in graph["nodes"]}


def test_commit_has_no_goto():
    rt = MagicMock()
    rt.run.round = 0
    rt.run.log = []
    cmd = _commit(rt)
    assert isinstance(cmd, Command)
    goto = getattr(cmd, "goto", None)
    assert goto in (None, (), [])
