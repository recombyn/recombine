"""Unit tests for LangChain-style model route lanes."""

from __future__ import annotations

from app.services.design.runtime.models_route import (
    apply_user_route_overrides,
    clamp_lane,
    heuristic_route_lane,
    model_for_lane,
    normalize_lane,
    parse_model_lanes,
    pin_user_locked_model_routes,
)


def test_normalize_legacy_aliases():
    assert normalize_lane("simple") == "fast"
    assert normalize_lane("medium") == "standard"
    assert normalize_lane("complex") == "reasoning"
    assert normalize_lane("vision") == "vision"


def test_parse_legacy_threshold_map():
    lanes = parse_model_lanes(
        {
            "precheck.model_threshold": (
                "simple->a;medium->b;complex->c;else->b"
            )
        }
    )
    assert lanes["fast"] == "a"
    assert lanes["standard"] == "b"
    assert lanes["reasoning"] == "c"


def test_heuristic_short_edit_is_fast():
    d = heuristic_route_lane("改标题颜色", canvas_node_count=12)
    assert d.lane == "fast"


def test_heuristic_empty_create_is_reasoning():
    # Structural: empty canvas + long prompt (no content keyword lists).
    d = heuristic_route_lane(
        "x" * 60,
        canvas_node_count=0,
    )
    assert d.lane == "reasoning"


def test_heuristic_images_vision():
    d = heuristic_route_lane(
        "按附件风格重做版式",
        has_images=True,
        canvas_node_count=5,
    )
    assert d.lane == "vision"


def test_pin_lock_writes_new_lane_keys():
    rules = pin_user_locked_model_routes({}, "deepseek-v4-pro")
    assert "fast->deepseek-v4-pro" in rules["precheck.model_threshold"]
    assert rules["precheck.vision_model"] == "deepseek-v4-pro"


def test_user_overrides_accept_legacy_and_new():
    rules = apply_user_route_overrides(
        {},
        {"simple": "m1", "standard": "m2", "vision": "m3"},
    )
    lanes = parse_model_lanes(rules)
    assert lanes["fast"] == "m1"
    assert lanes["standard"] == "m2"
    assert rules["precheck.vision_model"] == "m3"


def test_model_for_lane_and_clamp():
    rules = {
        "precheck.model_threshold": "fast->f;standard->s;reasoning->r;vision->v"
    }
    assert model_for_lane("fast", rules) == "f"
    assert clamp_lane("reasoning", ["fast", "standard"]) == "standard"
