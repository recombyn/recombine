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
    spec = next(n for n in nodes if n["id"] == "prompt_design_spec")
    assert "## 1. 任务" in spec["promptText"]
    assert "矢量" in spec["promptText"] and "生图" in spec["promptText"]
    vision = next(n for n in nodes if n["id"] == "prompt_vision")
    assert "空间分区" in vision["promptText"]
    assert "顶栏" not in vision["promptText"]
    assert "不要依赖「网站" not in spec["promptText"]
    assert "分类永远盖不全" not in spec["promptText"]


def test_list_prompt_nodes_from_graph():
    graph = {"nodes": seed_prompt_overlay_nodes(), "edges": []}
    rows = list_prompt_nodes_from_flow(graph=graph)
    assert {r["kind"] for r in rows} >= {"design_spec", "vision", "aesthetics"}
    block = format_prompt_pack_block([r for r in rows if r["kind"] == "design_spec"])
    assert "成稿自检" in block
    assert "#4EA8DE" not in block and "雏菊" not in block
    assert "分类永远盖不全" not in block
