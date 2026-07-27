"""P2 helpers + eval-set metrics (mocked, no live LLM)."""

from __future__ import annotations

from services.design.agent_controller import (
    _parse_agent_turn,
    _parse_plan,
    _score_ops_candidate,
    _wants_short_plan,
)
from services.design.tool_ops_contract import (
    format_canvas_tools_catalog,
    format_canvas_tools_details,
    normalize_need_tools,
)
from services.design.knowledge_store import (
    format_knowledge_catalog,
    normalize_need_knowledge,
)
from services.design.aesthetics.scorer import normalize_need_aesthetics


def test_short_plan_trigger():
    rules_on = {"agent.react.short_plan": "1"}
    assert _wants_short_plan("做一张完整海报主视觉", rules=rules_on) is True
    assert _wants_short_plan("你好", rules=rules_on) is False
    assert _wants_short_plan("加标题", rules={"agent.react.short_plan": "0"}) is False


def test_parse_plan():
    steps = _parse_plan('{"plan":["建画板","写标题","配色","收尾"]}')
    assert steps == ["建画板", "写标题", "配色", "收尾"]
    assert _parse_plan('{"plan":["只有一步"]}') == ["只有一步"]


def test_parse_need_tools_in_turn():
    turn = _parse_agent_turn(
        '{"thought":"加字","intent":"edit","need_tools":["create_text","update_node"],'
        '"tool_ops":[],"done":false}'
    )
    assert turn["intent"] == "edit"
    assert turn["need_tools"] == ["create_text", "update_node"]
    assert turn["done"] is False


def test_parse_need_knowledge_and_aesthetics():
    turn = _parse_agent_turn(
        '{"thought":"配色","intent":"create","need_knowledge":["palette","layout"],'
        '"need_aesthetics":true,"tool_ops":[],"done":false}'
    )
    assert turn["need_knowledge"] == ["palette", "layout"]
    assert turn["need_aesthetics"] is True
    assert normalize_need_knowledge(True) == ["*"]
    assert normalize_need_aesthetics("yes") is True
    assert normalize_need_aesthetics(False) is False


def test_normalize_need_tools_dedupe():
    got = normalize_need_tools(["create_text", "create_text", "create_text"])
    assert got == ["create_text"]


def test_tools_catalog_nonempty_shape():
    text = format_canvas_tools_catalog({})
    assert "catalog" in text.lower() or "`" in text
    details = format_canvas_tools_details(["create_text"])
    assert isinstance(details, str)


def test_knowledge_catalog_shape():
    text = format_knowledge_catalog(scene="website")
    assert "knowledge" in text.lower() or "`" in text


def test_dual_sample_score():
    good = _score_ops_candidate([{"name": "create_text"}], [])
    bad = _score_ops_candidate([], ["missing_tool_ops"])
    assert good > bad


def test_eval_set_metrics_rollup():
    """P2.3: toy eval rollup — SR / tokens / validate fail / reflect save."""
    cases = [
        {"ok": True, "tokens": 40, "validate_fail": False, "reflect_saved": False},
        {"ok": True, "tokens": 120, "validate_fail": True, "reflect_saved": True},
        {"ok": False, "tokens": 80, "validate_fail": True, "reflect_saved": False},
        {"ok": True, "tokens": 30, "validate_fail": False, "reflect_saved": False},
    ]
    n = len(cases)
    sr = sum(1 for c in cases if c["ok"]) / n
    avg_tokens = sum(c["tokens"] for c in cases) / n
    validate_fail_rate = sum(1 for c in cases if c["validate_fail"]) / n
    reflect_save_rate = (
        sum(1 for c in cases if c["reflect_saved"])
        / max(1, sum(1 for c in cases if c["validate_fail"]))
    )
    assert sr == 0.75
    assert avg_tokens == 67.5
    assert validate_fail_rate == 0.5
    assert reflect_save_rate == 0.5
