from services.design.prompt_pack_store import (
    format_prompt_pack_block,
    format_prompt_packs_catalog,
    list_prompt_nodes_from_flow,
    seed_prompt_overlay_nodes,
)
from services.design.skill_store import format_skills_details


def test_seed_prompt_overlay_nodes_migrated_to_skills():
    """Methodology packs moved to design_skills_seed — overlay nodes empty."""
    nodes = seed_prompt_overlay_nodes()
    assert nodes == []


def test_prompt_packs_catalog_points_to_skills():
    block = format_prompt_packs_catalog(scene="website")
    assert "need_skills" in block or "Skill" in block


def test_methodology_lives_in_skills():
    from services.design.skill_store import ensure_design_skills, reset_skills_ready_for_tests

    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)
    details = format_skills_details(keys=["design_methodology"], scene="website")
    assert "create_shape" in details and "create_text" in details
    assert "need_aesthetics" in details or "skill: design_methodology" in details


def test_list_prompt_nodes_from_explicit_graph():
    graph = {
        "nodes": [
            {
                "id": "prompt_custom",
                "kind": "prompt",
                "phaseKey": "prompt_custom",
                "promptText": "custom body with create_shape",
                "inject": {"scenes": "all"},
            }
        ],
        "edges": [],
    }
    rows = list_prompt_nodes_from_flow(graph=graph)
    assert any(r["kind"] == "custom" for r in rows)
    block = format_prompt_pack_block(rows)
    assert "create_shape" in block
