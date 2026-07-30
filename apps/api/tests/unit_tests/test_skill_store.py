"""Unit tests for design skill_store — pluggable source + triggers + files."""

from __future__ import annotations

from services.design.skill_store import (
    PROMPT_KIND_TO_SKILL,
    SOURCE_ADMIN,
    SOURCE_SEED,
    _apply_mutex,
    _load_file_skills,
    _rule_matches,
    bridge_need_prompts_to_skills,
    ensure_design_skills,
    filter_ops_by_skill_allowlist,
    format_skills_catalog,
    format_skills_details,
    normalize_need_skills,
    reset_skills_ready_for_tests,
    resolve_triggered_skill_keys,
)


def setup_function() -> None:
    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)


def test_normalize_need_skills_maps_legacy_prompt_kinds():
    assert normalize_need_skills(["design_spec", "vision"]) == [
        "design_methodology",
        "vision_extract",
    ]


def test_bridge_need_prompts_to_skills():
    prompts, skills = bridge_need_prompts_to_skills(
        ["design_spec", "custom_pack"],
        ["canvas_edit"],
    )
    assert "design_methodology" in skills
    assert "canvas_edit" in skills
    assert prompts == ["custom_pack"]


def test_prompt_kind_map_complete():
    assert PROMPT_KIND_TO_SKILL["aesthetics"] == "aesthetics_align"


def test_skills_catalog_and_details_roundtrip():
    catalog = format_skills_catalog(scene="website")
    assert "need_skills" in catalog
    assert "design_methodology" in catalog
    details = format_skills_details(
        keys=["design_methodology", "canvas_edit"],
        scene="website",
    )
    assert "skill: design_methodology" in details
    assert "preferred_tools" in details


def test_rule_matches_min_prompt_chars():
    assert _rule_matches(
        {"intent_in": ["create"], "min_prompt_chars": 24},
        empty_canvas=False,
        has_images=False,
        intent="create",
        prompt_chars=30,
    )
    assert not _rule_matches(
        {"intent_in": ["create"], "min_prompt_chars": 24},
        empty_canvas=False,
        has_images=False,
        intent="create",
        prompt_chars=10,
    )


def test_resolve_triggered_empty_canvas_create():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=True,
        has_images=False,
        intent="create",
    )
    assert "design_methodology" in keys


def test_resolve_triggered_long_create_prompt():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=False,
        has_images=False,
        intent="create",
        prompt_chars=40,
    )
    assert "design_methodology" in keys


def test_resolve_triggered_images_create():
    keys = resolve_triggered_skill_keys(
        scene="website",
        empty_canvas=False,
        has_images=True,
        intent="create",
    )
    assert "vision_extract" in keys


def test_resolve_triggered_skips_chat():
    assert (
        resolve_triggered_skill_keys(
            scene="website",
            empty_canvas=True,
            has_images=False,
            intent="chat",
        )
        == []
    )


def test_mutex_keeps_highest_weight():
    rows = [
        {"skillKey": "a", "mutexGroup": "g", "sortWeight": 10},
        {"skillKey": "b", "mutexGroup": "g", "sortWeight": 5},
        {"skillKey": "c", "mutexGroup": None, "sortWeight": 1},
    ]
    out = _apply_mutex(rows)
    assert [r["skillKey"] for r in out] == ["a", "c"]


def test_filter_ops_allowlist():
    ops = [
        {"name": "create_shape", "args": {}},
        {"name": "explode_canvas", "args": {}},
        {"name": "align_nodes", "args": {}},
    ]
    kept, errs = filter_ops_by_skill_allowlist(
        ops, skill_keys=["design_methodology"], scene="website"
    )
    names = [o["name"] for o in kept]
    assert "create_shape" in names
    assert "align_nodes" in names
    assert "explode_canvas" not in names
    assert any("explode_canvas" in e for e in errs)


def test_file_skill_example_brand_loaded():
    files = _load_file_skills()
    by_key = {str(x.get("skill_key")): x for x in files}
    assert "example_brand" in by_key
    pack = by_key["example_brand"]
    assert pack.get("name") == "示例品牌规范"
    assert pack.get("pack_version") == "1.0.0"
    assert pack.get("logo") == "example_brand/example_brand-logo.svg"
    assert (pack.get("locales") or {}).get("zh-CN", {}).get("displayName") == "示例品牌规范"
    assert "主色" in str(pack.get("prompt_positive") or "")
    catalog = format_skills_catalog(scene="website")
    assert "example_brand" in catalog


def test_parse_pack_version_semver():
    from services.design.skill_store import _parse_pack_version

    label, n = _parse_pack_version("1.0.0")
    assert label == "1.0.0"
    assert n == 1_000_000


def test_source_constants():
    assert SOURCE_SEED == "seed"
    assert SOURCE_ADMIN == "admin"
