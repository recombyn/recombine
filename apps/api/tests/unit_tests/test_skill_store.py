"""Unit tests for design skill_store — pluggable source + triggers + files."""

from __future__ import annotations

from app.services.design.prompts.skill_store import (
    NS_CORE,
    NS_EXT,
    NS_USER,
    SOURCE_ADMIN,
    SOURCE_SEED,
    _apply_mutex,
    _load_file_skills,
    _rule_matches,
    ensure_design_skills,
    filter_need_resources_by_skill_acl,
    filter_ops_by_skill_allowlist,
    format_skills_catalog,
    format_skills_details,
    normalize_need_skills,
    parse_need_skills_with_pins,
    parse_skill_pin,
    qualify_skill_key,
    reload_skills_if_disk_changed,
    reset_skills_ready_for_tests,
    resolve_storage_skill_key,
    resolve_triggered_skill_keys,
    skill_resource_allowlist,
    split_namespace_key,
    validate_against_schema,
    validate_skill_meta,
)


def setup_function() -> None:
    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)





def test_skills_catalog_and_details_roundtrip():
    catalog = format_skills_catalog(scene="website")
    assert "need_skills" in catalog
    assert "design_methodology" in catalog
    assert "core" in catalog
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


def test_file_skill_loader_returns_list():
    """Loader scans public + private ``design_skills`` packs."""
    files = _load_file_skills()
    assert isinstance(files, list)


def test_parse_pack_version_semver():
    from app.services.design.prompts.skill_store import _parse_pack_version

    label, n = _parse_pack_version("1.0.0")
    assert label == "1.0.0"
    assert n == 1_000_000


def test_source_constants():
    assert SOURCE_SEED == "seed"
    assert SOURCE_ADMIN == "admin"


def test_namespace_split_and_qualify(monkeypatch):
    assert split_namespace_key("core.design_methodology") == (NS_CORE, "design_methodology")
    assert split_namespace_key("user:my_brand") == (NS_USER, "my_brand")
    assert qualify_skill_key(NS_CORE, "design_methodology") == "design_methodology"
    assert qualify_skill_key(NS_USER, "my_brand") == "user.my_brand"
    assert resolve_storage_skill_key("core.design_methodology") == "design_methodology"
    # Patch the runtime module binding (resolve_storage_skill_key calls it in-file).
    from app.services.design.prompts.skill_store import runtime as skill_runtime

    monkeypatch.setattr(
        skill_runtime,
        "list_runtime_skills",
        lambda **_kwargs: [
            {
                "skillKey": "example_brand",
                "namespace": NS_EXT,
                "_localKey": "example_brand",
            }
        ],
    )
    assert resolve_storage_skill_key("ext.example_brand") == "example_brand"
    assert resolve_storage_skill_key("ext.missing_pack") is None


def test_skill_pin_and_parse_need_skills():
    assert parse_skill_pin("design_methodology@2") == ("design_methodology", 2, None)
    keys, pins, args, errs = parse_need_skills_with_pins(
        [
            "design_methodology@2",
            {"key": "canvas_edit", "version": 1, "args": {}},
        ]
    )
    assert "design_methodology" in keys
    assert "canvas_edit" in keys
    assert pins.get("design_methodology") == 2
    assert errs == []


def test_validate_skill_meta_rejects_core_collision_for_admin():
    errs = validate_skill_meta(
        {
            "skill_key": "design_methodology",
            "name": "x",
            "prompt_positive": "body",
        },
        source=SOURCE_ADMIN,
    )
    assert any("core_key_reserved" in e for e in errs)


def test_validate_against_schema_required():
    schema = {
        "type": "object",
        "required": ["theme"],
        "properties": {"theme": {"type": "string"}},
    }
    assert validate_against_schema(schema, {}) == ["missing_required:theme"]
    assert validate_against_schema(schema, {"theme": "dark"}) == []


def test_custom_skill_acl_platform_open():
    assert skill_resource_allowlist(["design_methodology"], scene="website") is None
    k, a, errs = filter_need_resources_by_skill_acl(
        skill_keys=["design_methodology"],
        scene="website",
        need_knowledge=["ui"],
        need_aesthetics=True,
    )
    assert k == ["ui"]
    assert a is True
    assert errs == []


def test_hot_reload_signature_stable():
    reload_skills_if_disk_changed()
    assert reload_skills_if_disk_changed() is False


def test_seed_sync_preserves_custom_body_when_markers_present():
    """Seed upsert is cold-start only; marker bump only replaces stale bodies."""
    from app.services.db import connect
    from app.services.design.prompts.skill_store.ensure import _SEED_SKILL_BODY_MARKERS

    markers = _SEED_SKILL_BODY_MARKERS.get("design_methodology") or ()
    assert markers, "expected design_methodology seed markers"

    with connect() as conn:
        row = conn.execute(
            "SELECT prompt_positive, source FROM design_skill WHERE skill_key = ?",
            ("design_methodology",),
        ).fetchone()
        assert row is not None
        before = str(row["prompt_positive"] or "")
        assert str(row["source"] or "") == SOURCE_SEED
        # Keep required markers so the body is treated as non-stale customization.
        custom = "OPS_CUSTOM_BODY\n" + "\n".join(markers)
        conn.execute(
            "UPDATE design_skill SET prompt_positive = ? WHERE skill_key = ?",
            (custom, "design_methodology"),
        )
        conn.commit()

    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)

    with connect() as conn:
        row = conn.execute(
            "SELECT prompt_positive, source FROM design_skill WHERE skill_key = ?",
            ("design_methodology",),
        ).fetchone()
        assert str(row["source"] or "") == SOURCE_SEED
        assert str(row["prompt_positive"] or "") == custom
        conn.execute(
            "UPDATE design_skill SET prompt_positive = ? WHERE skill_key = ?",
            (before, "design_methodology"),
        )
        conn.commit()


def test_agent_skills_frontmatter_split_and_meta():
    from app.services.design.prompts.skill_store import (
        _meta_from_agent_skill_frontmatter,
        _split_skill_md_frontmatter,
    )

    fm, body = _split_skill_md_frontmatter(
        """---
name: demo-skill
description: >-
  Hello world skill for canvas.
disable-model-invocation: true
---

# Demo
Do the thing.
"""
    )
    assert fm.get("name") == "demo-skill"
    assert "Hello world" in str(fm.get("description") or "")
    assert body.startswith("# Demo")
    assert "disable-model-invocation" not in body
    meta = _meta_from_agent_skill_frontmatter(fm, folder="demo-skill")
    assert meta is not None
    assert meta["skill_key"] == "demo-skill"
    assert "Hello world" in meta["when_to_use"]


def test_load_pack_dir_agent_skills_only(tmp_path):
    from app.services.design.prompts.skill_store import _load_pack_dir

    pack = tmp_path / "demo-skill"
    pack.mkdir()
    (pack / "SKILL.md").write_text(
        """---
name: demo-skill
description: Agent skills only pack
---

# Body
Keep this prompt.
""",
        encoding="utf-8",
    )
    item = _load_pack_dir(pack)
    assert item is not None
    assert item["skill_key"] == "demo-skill"
    assert item["prompt_positive"].startswith("# Body")
    assert "---" not in item["prompt_positive"]


def test_oss_ext_packs_present():
    keys = {str(x.get("skill_key") or "") for x in _load_file_skills()}
    assert "example_ext" in keys
    for key in ("ui_ux_pro_max", "garden_style", "awesome_design_md", "shadcn_ui"):
        assert key in keys
