"""Unit: ReAct agent output contract parsing."""

from __future__ import annotations

from services.design.agent_controller import (
    _normalize_ops_payload,
    _parse_agent_turn,
)


def test_parse_chat_turn():
    t = _parse_agent_turn(
        '{"thought":"hi","intent":"chat","reply":"你好","tool_ops":[],"done":true}'
    )
    assert t["intent"] == "chat"
    assert t["reply"] == "你好"
    assert t["done"] is True


def test_normalize_op_key():
    ops = _normalize_ops_payload(
        [{"op_key": "create_text", "args": {"text": "Hi"}}]
    )
    assert ops[0]["name"] == "create_text"


def test_parse_fenced_json():
    t = _parse_agent_turn(
        'Sure.\n```json\n{"intent":"ask","reply":"尺寸？","tool_ops":[],"done":true}\n```'
    )
    assert t["intent"] == "ask"
    assert "尺寸" in t["reply"]
