# -*- coding: utf-8 -*-
"""Smoke: graph-first routing — P0 edges, no fake parallel, fact flags."""
from __future__ import annotations

from unittest.mock import MagicMock

from langgraph.types import Command

from services.design.admin_store import _load_default_agent_flow_graph, _normalize_agent_flow_graph
from services.design.agent_controller import (
    _build_agent_graph_from_published,
    _commit,
    invalidate_agent_graph_cache,
)
from services.design.flow_runtime import choose_outgoing_edges, eval_edge_condition


def test_and_edge_condition():
    assert eval_edge_condition("mode=ask&op_failed", {"mode": "ask", "op_failed": True})
    assert not eval_edge_condition("mode=ask&op_failed", {"mode": "ask", "ok": True})


def test_resource_lanes_split_parallel_join():
    graph, _ = _normalize_agent_flow_graph(_load_default_agent_flow_graph())
    ids = {n["id"] for n in graph["nodes"]}
    assert "resource_fork" not in ids
    assert "prompt_bank" not in ids
    assert {"parallel", "aesthetics_details", "tool_details", "resource_join"} <= ids
    assert "knowledge_details" not in ids
    assert "prompt_website" not in ids
    assert "prompt_design_spec" in ids
    assert any(
        e.get("source") == "parallel" and e.get("target") == "prompt_design_spec"
        for e in graph["edges"]
    )
    assert any(
        e.get("source") == "prompt_design_spec" and e.get("target") == "resource_join"
        for e in graph["edges"]
    )
    join = next(n for n in graph["nodes"] if n["id"] == "resource_join")
    outs = [e for e in graph["edges"] if e.get("source") == "resource_join"]
    chosen, _ = choose_outgoing_edges(
        node=join, edges=outs, ctx={"mode": "agent", "ready": True}
    )
    assert chosen and chosen[0]["target"] == "thought"
    chosen_ask, _ = choose_outgoing_edges(
        node=join, edges=outs, ctx={"mode": "ask", "ready": True}
    )
    assert chosen_ask and chosen_ask[0]["target"] == "ask_thought"
    thought = next(n for n in graph["nodes"] if n["id"] == "thought")
    assert not str(thought.get("promptKey") or "").strip()
    assert not str(thought.get("promptText") or "").strip()


def test_observe_p0_edges():
    graph, _ = _normalize_agent_flow_graph(_load_default_agent_flow_graph())
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
    graph, _ = _normalize_agent_flow_graph(_load_default_agent_flow_graph())
    compiled = _build_agent_graph_from_published(
        {"id": "default", "version": 1, "graph": graph}
    )
    nodes = set(compiled.nodes)
    assert {"bootstrap", "thought", "parallel", "resource_join", "__settle__"} <= nodes
    assert "resource_fork" not in nodes
    assert "hydrate" not in nodes or "hydrate" not in {n["id"] for n in graph["nodes"]}


def test_commit_has_no_goto():
    rt = MagicMock()
    rt.run.round = 0
    rt.run.log = []
    cmd = _commit(rt)
    assert isinstance(cmd, Command)
    goto = getattr(cmd, "goto", None)
    assert goto in (None, (), [])

def test_label_is_not_edge_condition():
    """Display labels must not become when-predicates (else forks settle)."""
    from services.design.flow_runtime import _edge_condition, choose_outgoing_edges

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


def test_edge_condition_is_code_not_label():
    """Wire condition is code; mutable display labels must not resolve or match."""
    from services.design.admin_store import _normalize_agent_flow_graph
    from services.design.dict_store import resolve_edge_condition
    from services.design.flow_runtime import choose_outgoing_edges

    assert resolve_edge_condition("intent=chat") == "intent=chat"
    # Display label must NOT map to code (labels are editable).
    assert resolve_edge_condition("意图=闲聊") == "意图=闲聊"

    dirty = {
        "version": 1,
        "nodes": [
            {"id": "thought", "kind": "llm", "phaseKey": "thought", "x": 0, "y": 0},
            {"id": "end", "kind": "end", "phaseKey": "end", "x": 100, "y": 0},
            {"id": "start", "kind": "start", "phaseKey": "start", "x": -100, "y": 0},
            {"id": "route", "kind": "route", "phaseKey": "route", "x": -50, "y": 0},
            {"id": "memory", "kind": "llm", "phaseKey": "memory", "x": 0, "y": 50},
            {"id": "model_route", "kind": "classifier", "phaseKey": "model_route", "x": 50, "y": 50},
        ],
        "edges": [
            {
                "id": "e19b",
                "source": "thought",
                "target": "end",
                "label": "意图=闲聊",
                "condition": "意图=闲聊",
                "priority": 42,
                "isDefault": False,
            },
            {
                "id": "e_start",
                "source": "start",
                "target": "route",
                "condition": "",
                "priority": 10,
                "isDefault": True,
            },
        ],
    }
    graph, changed = _normalize_agent_flow_graph(dirty)
    assert changed
    # Repair by fixed edge id → canonical condition code.
    e19b = next(e for e in graph["edges"] if e.get("id") == "e19b")
    assert e19b["condition"] == "intent=chat"
    thought = next(n for n in graph["nodes"] if n["id"] == "thought")
    outs = [e for e in graph["edges"] if e.get("source") == "thought"]
    chosen, detail = choose_outgoing_edges(
        node=thought, edges=outs, ctx={"intent": "chat", "no_ops": True}
    )
    assert chosen and chosen[0]["target"] == "end"
    assert detail.get("via") == "match"

