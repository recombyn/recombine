from services.design.agent_controller import (
    _extract_identity_from_system,
    _format_thought_tool_messages,
    _identity_system_block,
    _resolve_agent_persona,
)


def test_identity_block_auto():
    rules = {
        "agent.persona.auto": "我是测试助手",
        "agent.persona.locked": "我是测试助手，模型{model_label}",
    }
    assert _identity_system_block(rules, "auto") == "IDENTITY: 我是测试助手"
    assert "模型" in _resolve_agent_persona(rules, "deepseek-chat")


def test_extract_identity_from_composed_system():
    raw = "你是 Agent\n\nIDENTITY: 我是 Recombyn\n\n其它规则"
    assert _extract_identity_from_system(raw) == "IDENTITY: 我是 Recombyn"


def test_format_thought_tool_keeps_identity(monkeypatch):
    class _RT:
        rules = {
            "agent.persona.auto": "我是人设A",
            "agent.prompt.chat_agent_system": "行为规则B",
            "agent.prompt.lc_tools_overlay": (
                "你使用 LangChain tool calling；禁止在正文里写 tool_ops"
            ),
        }
        user_selected_model = "auto"
        system = '旧JSON\nIDENTITY: 我是人设A\n"tool_ops": []'
        prompt = "做个按钮"
        canvas_size = "375x812"
        scene_key = "app"
        scene_nodes = []
        scene_frames = []
        focus_id = ""
        pending_tool_details = ""
        pending_knowledge_details = ""
        pending_aesthetics_details = ""
        size_auto_hint = ""
        mem_blocks = ""
        w = 375
        h = 812
        memory_in = None
        run = type(
            "R",
            (),
            {
                "plan": [],
                "reflect_note": "",
                "vision_used": False,
                "errors": [],
            },
        )()

    monkeypatch.setattr(
        "services.design.tool_ops_contract.format_canvas_tools_for_model",
        lambda _rules: "TOOLS_CATALOG",
    )
    system, user = _format_thought_tool_messages(_RT())
    assert "IDENTITY: 我是人设A" in system
    assert "行为规则B" in system
    assert "禁止在正文里写 tool_ops" in system or "LangChain tool calling" in system
    assert "做个按钮" in user
