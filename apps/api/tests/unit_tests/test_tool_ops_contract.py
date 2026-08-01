"""Unit tests for tool_ops_contract."""

from __future__ import annotations

from services.design.ops.tool_ops_contract import (
    TOOL_OPS_SCHEMA_VERSION,
    extract_and_validate_tool_ops,
    normalize_agent_tool_ops,
    validation_failure_reason,
)


def test_schema_version():
    assert TOOL_OPS_SCHEMA_VERSION.startswith("2026-")


def test_valid_update_node():
    raw = '{"ops":[{"name":"update_node","args":{"nodeId":"n1","cornerRadius":8}}]}'
    ops, errs = extract_and_validate_tool_ops(
        raw,
        scene_nodes=[{"id": "n1", "type": "rect", "w": 100, "h": 100}],
    )
    assert not errs
    assert len(ops) == 1
    assert ops[0]["name"] == "update_node"
    assert ops[0]["args"]["nodeId"] == "n1"
    assert ops[0].get("op_id")


def test_rejects_unknown_tool():
    raw = '{"ops":[{"name":"explode_canvas","args":{}}]}'
    ops, errs = extract_and_validate_tool_ops(raw)
    assert not ops
    assert any("tool_not_allowed" in e for e in errs)


def test_rejects_unknown_node_id():
    raw = '{"ops":[{"name":"update_node","args":{"nodeId":"ghost","fill":"#f00"}}]}'
    ops, errs = extract_and_validate_tool_ops(
        raw,
        scene_nodes=[{"id": "n1"}],
    )
    assert not ops
    assert any("code=update_node_unknown_id" in e for e in errs)


def test_dedupe_by_op_id():
    raw_ops = [
        {"name": "update_node", "args": {"nodeId": "n1", "fill": "#111", "op_id": "same-id"}},
        {"name": "update_node", "args": {"nodeId": "n1", "fill": "#222", "op_id": "same-id"}},
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[{"id": "n1"}],
    )
    assert not errs
    assert len(ops) == 1


def test_delete_accepts_node_ids_alias():
    raw_ops = [
        {"name": "delete_nodes", "args": {"node_ids": ["n1"]}},
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[{"id": "n1", "type": "rect"}],
    )
    assert not errs
    assert len(ops) == 1
    assert ops[0]["name"] == "delete_nodes"
    assert ops[0]["args"]["nodeIds"] == ["n1"]


def test_delete_plus_create_rejected_prefer_update_shape():
    """Morph via delete+create is invalid — tell model to use update_node (no silent rewrite)."""
    raw_ops = [
        {"name": "delete_nodes", "args": {"node_ids": ["green1"]}},
        {
            "name": "create_shape",
            "args": {
                "type": "ellipse",
                "x": 10,
                "y": 20,
                "width": 100,
                "height": 100,
                "fill": "#00FF00",
            },
        },
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[{"id": "green1", "type": "rect", "w": 120, "h": 100}],
    )
    assert not ops
    assert any("code=prefer_update_node_shapeType" in e for e in errs)
    assert any("fix=" in e and "green1" in e for e in errs)
    assert any("ellipse" in e for e in errs)


def test_create_text_matching_scene_rejected_prefer_update():
    raw_ops = [
        {
            "name": "create_text",
            "args": {"text": "Hello", "x": 10, "y": 20, "fontSize": 24},
        },
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[{"id": "t1", "type": "text", "text": "Hello"}],
    )
    assert not ops
    assert any("code=prefer_update_node" in e for e in errs)
    assert any("t1" in e for e in errs)


def test_update_node_missing_nodeId_not_invented():
    """Do not bind fill-only update_node onto the largest plate."""
    raw_ops = [
        {"name": "update_node", "args": {"fill": "#ff0000"}},
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[{"id": "bg", "type": "rect", "w": 400, "h": 400}],
    )
    assert not ops
    assert any("code=update_node_missing_nodeId" in e for e in errs)


def test_format_op_error_shape():
    from services.design.ops.tool_ops_contract import format_op_error

    s = format_op_error("demo", fix="do X", detail="why")
    assert s == "code=demo; fix=do X; detail=why"


def test_rejects_unknown_tool_uses_code_format():
    raw = '{"ops":[{"name":"explode_canvas","args":{}}]}'
    ops, errs = extract_and_validate_tool_ops(raw)
    assert not ops
    assert any("code=tool_not_allowed" in e for e in errs)


def test_update_node_accepts_shape_type():
    raw = '{"ops":[{"name":"update_node","args":{"nodeId":"n1","shapeType":"circle"}}]}'
    ops, errs = extract_and_validate_tool_ops(
        raw,
        scene_nodes=[{"id": "n1", "type": "rect", "w": 100, "h": 100}],
    )
    assert not errs
    assert ops[0]["args"]["shapeType"] == "circle"


def test_create_shape_next_to_images_is_not_rewritten_to_update():
    """Large create_shape must not rewrite onto image nodes (looks like no-op)."""
    raw_ops = [
        {
            "name": "create_shape",
            "args": {
                "shapeType": "rect",
                "x": 0,
                "y": 164,
                "width": 312,
                "height": 200,
                "fill": "#e0e0e0",
            },
        },
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[
            {"id": "img1", "type": "image", "w": 148, "h": 148},
            {"id": "img2", "type": "image", "w": 148, "h": 148},
        ],
    )
    assert not errs
    assert len(ops) == 1
    assert ops[0]["name"] == "create_shape"
    assert ops[0]["args"]["fill"] == "#e0e0e0"


def test_create_shape_stays_create_even_if_similar_to_existing_plate():
    """Add-rect must not be rewritten into update_node on the largest shape."""
    raw_ops = [
        {
            "name": "create_shape",
            "args": {
                "shapeType": "rect",
                "width": 400,
                "height": 400,
                "fill": "#ff0000",
            },
        },
    ]
    ops, errs = normalize_agent_tool_ops(
        raw_ops,
        scene_nodes=[{"id": "bg", "type": "rect", "w": 400, "h": 400}],
    )
    assert not errs
    assert len(ops) == 1
    assert ops[0]["name"] == "create_shape"
    assert ops[0]["args"]["fill"] == "#ff0000"
