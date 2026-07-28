# -*- coding: utf-8 -*-
"""Verify loop + patch scope + graph edges."""
from __future__ import annotations

from services.design.admin_store import _load_default_agent_flow_graph, _normalize_agent_flow_graph
from services.design.agent_controller import (
    _ops_patch_too_broad,
    _structure_verify_issues,
)
from services.design.flow_runtime import choose_outgoing_edges


def test_structure_verify_empty_canvas():
    issues = _structure_verify_issues(
        nodes=[], frames=[], painted=True, intent="create"
    )
    assert issues


def test_structure_verify_ok_nodes():
    issues = _structure_verify_issues(
        nodes=[{"id": "n1", "w": 100, "h": 40}],
        frames=[{"id": "f1", "is_empty": False}],
        painted=True,
        intent="create",
    )
    assert not issues


def test_patch_too_broad_wipe():
    broad, reason = _ops_patch_too_broad(
        [{"name": "clear_canvas"}],
        [{"id": "a"}, {"id": "b"}, {"id": "c"}, {"id": "d"}],
        intent="edit",
    )
    assert broad
    assert reason


def test_patch_create_not_broad():
    broad, _ = _ops_patch_too_broad(
        [{"name": "clear_canvas"}],
        [{"id": "a"}],
        intent="create",
    )
    assert not broad


def test_observe_goes_to_verify():
    graph, _ = _normalize_agent_flow_graph(_load_default_agent_flow_graph())
    ids = {n["id"] for n in graph["nodes"]}
    assert "verify" in ids
    obs = next(n for n in graph["nodes"] if n["id"] == "observe")
    outs = [e for e in graph["edges"] if e.get("source") == "observe"]
    chosen, d = choose_outgoing_edges(
        node=obs, edges=outs, ctx={"scene_ready": True, "mode": "agent"}
    )
    assert chosen[0]["target"] == "verify"
    assert d.get("condition") == "scene_ready"


def test_verify_edges():
    graph, _ = _normalize_agent_flow_graph(_load_default_agent_flow_graph())
    ver = next(n for n in graph["nodes"] if n["id"] == "verify")
    outs = [e for e in graph["edges"] if e.get("source") == "verify"]

    ok, _ = choose_outgoing_edges(node=ver, edges=outs, ctx={"ok": True})
    assert ok[0]["target"] == "end"

    fail_reflect, _ = choose_outgoing_edges(
        node=ver,
        edges=outs,
        ctx={"verify_fail": True, "reflect_left": True, "ok": False},
    )
    assert fail_reflect[0]["target"] == "reflect"

    retry, _ = choose_outgoing_edges(
        node=ver, edges=outs, ctx={"retry": True, "ok": False}
    )
    assert retry[0]["target"] == "thought"


def test_patch_broad_edge_from_thought():
    graph, _ = _normalize_agent_flow_graph(_load_default_agent_flow_graph())
    thought = next(n for n in graph["nodes"] if n["id"] == "thought")
    outs = [e for e in graph["edges"] if e.get("source") == "thought"]
    chosen, d = choose_outgoing_edges(
        node=thought,
        edges=outs,
        ctx={"patch_too_broad": True, "ops_valid": False, "ops_invalid": True},
    )
    assert chosen[0]["target"] == "validate_fail"
    assert "patch" in str(d.get("condition") or "")
