from services.design.prompt_pack_store import (
    format_prompt_pack_block,
    format_prompt_packs_catalog,
    list_prompt_nodes_from_flow,
    normalize_need_prompts,
    seed_prompt_overlay_nodes,
)
from services.design.skill_store import format_skills_details


def test_normalize_need_prompts():
    assert normalize_need_prompts(None) == []
    assert normalize_need_prompts(True) == ["*"]
    assert normalize_need_prompts(["website", "vision", "website"]) == [
        "website",
        "vision",
    ]
    assert normalize_need_prompts(["scene.poster"]) == ["poster"]
    assert normalize_need_prompts(["prompt_mobile"]) == ["mobile"]


def test_seed_prompt_overlay_nodes_migrated_to_skills():
    """Methodology packs moved to design_skills_seed — overlay nodes empty."""
    nodes = seed_prompt_overlay_nodes()
    assert nodes == []


def test_prompt_packs_catalog_points_to_skills():
    block = format_prompt_packs_catalog(scene="website")
    assert "need_skills" in block or "Skill" in block


def test_methodology_lives_in_skills():
    details = format_skills_details(keys=["design_methodology"], scene="website")
    assert "create_shape" in details and "create_text" in details
    assert "need_aesthetics" in details


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
