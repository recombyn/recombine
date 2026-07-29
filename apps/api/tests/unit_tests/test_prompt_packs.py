from services.design.prompt_pack_store import (
    format_prompt_pack_block,
    list_prompt_nodes_from_flow,
    normalize_need_prompts,
    seed_prompt_overlay_nodes,
)


def test_normalize_need_prompts():
    assert normalize_need_prompts(None) == []
    assert normalize_need_prompts(True) == ["*"]
    assert normalize_need_prompts(["website", "vision", "website"]) == [
        "website",
        "vision",
    ]
    assert normalize_need_prompts(["scene.poster"]) == ["poster"]
    assert normalize_need_prompts(["prompt_mobile"]) == ["mobile"]


def test_seed_prompt_overlay_nodes_core_only():
    nodes = seed_prompt_overlay_nodes()
    ids = {n["id"] for n in nodes}
    assert ids == {"prompt_design_spec", "prompt_vision", "prompt_aesthetics"}
    assert all(n["kind"] == "prompt" for n in nodes)
    assert all(str(n.get("promptText") or "").strip() for n in nodes)

    spec = next(n for n in nodes if n["id"] == "prompt_design_spec")
    text = spec["promptText"]
    assert "create_shape" in text and "create_text" in text
    assert "create_frame" in text
    assert "need_aesthetics" in text

    vision = next(n for n in nodes if n["id"] == "prompt_vision")
    assert "xPct" in vision["promptText"] or "layout" in vision["promptText"].lower()


def test_list_prompt_nodes_from_graph():
    graph = {"nodes": seed_prompt_overlay_nodes(), "edges": []}
    rows = list_prompt_nodes_from_flow(graph=graph)
    assert {r["kind"] for r in rows} >= {"design_spec", "vision", "aesthetics"}
    block = format_prompt_pack_block([r for r in rows if r["kind"] == "design_spec"])
    assert "create_shape" in block or "create_text" in block
    assert "need_prompts" in block or "need_aesthetics" in block
