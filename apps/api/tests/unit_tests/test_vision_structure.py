"""Unit tests for vision structure schema validate / prompt build."""

from __future__ import annotations

from services.design.aesthetics.structure_extract import (
    build_vision_structure_system,
    format_schema_for_prompt,
    parse_structure_schema,
    validate_vision_structure,
)


def test_parse_structure_schema_optional_suffix():
    raw = '{"page.theme":"light|dark","page.pattern":"string?","elements":"object"}'
    schema = parse_structure_schema(raw)
    assert schema["page.theme"] == "light|dark"
    assert schema["page.pattern"] == "string?"
    assert schema["elements"] == "object"


def test_validate_requires_elements_and_theme():
    schema = parse_structure_schema(
        '{"page.theme":"light|dark","elements":"object",'
        '"elements[].id":"string","palette":"object","summary":"string"}'
    )
    errors = validate_vision_structure(
        {
            "schemaVersion": 1,
            "page": {"theme": "light"},
            "elements": [{"id": "cta", "layout": {"xPct": 10}}],
            "palette": {"bg.page": "#fff"},
            "summary": "ok",
        },
        schema,
    )
    # elements[].layout.xPct not in this slim schema — should pass
    assert errors == []


def test_validate_missing_required():
    schema = parse_structure_schema(
        '{"page.theme":"light|dark","elements":"object","palette":"object"}'
    )
    errors = validate_vision_structure({"page": {}}, schema)
    assert any("page.theme" in e for e in errors)
    assert any("elements" in e for e in errors)


def test_build_system_includes_field_contract():
    rules = {
        "aesthetics.prompt.vision_structure": "看图测试说明",
        "aesthetics.vision.structure_schema": '{"page.theme":"light|dark","elements":"object"}',
    }
    text = build_vision_structure_system(rules)
    assert "看图测试说明" in text
    assert "FIELD CONTRACT" in text
    assert "page.theme" in text
    assert "REQUIRED" in format_schema_for_prompt(parse_structure_schema(rules["aesthetics.vision.structure_schema"]))
