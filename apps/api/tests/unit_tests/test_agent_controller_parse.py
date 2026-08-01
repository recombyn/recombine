"""Unit: ReAct agent output contract parsing."""

from __future__ import annotations

from services.design.agent_controller import (
    AgentRunState,
    AgentTurnSchema,
    _ask_propose_user_text,
    _chat_fallback_text,
    _ensure_propose_choice_ui,
    _has_pending_resource_details,
    _lc_design_needs_canvas_ops,
    _normalize_choice_ui,
    _normalize_ops_payload,
    _parse_agent_turn,
    _should_recover_edit_after_resources,
    _turn_from_structured,
)


def test_parse_chat_turn():
    t = _parse_agent_turn(
        '{"thought":"hi","intent":"chat","reply":"你好","tool_ops":[],"done":true}'
    )
    assert t["intent"] == "chat"
    assert t["reply"] == "你好"
    assert t["done"] is True


def test_normalize_op_key():
    ops = _normalize_ops_payload(
        [{"op_key": "create_text", "args": {"text": "Hi"}}]
    )
    assert ops[0]["name"] == "create_text"


def test_parse_fenced_json():
    t = _parse_agent_turn(
        'Sure.\n```json\n{"intent":"ask","reply":"尺寸？","tool_ops":[],"done":true}\n```'
    )
    assert t["intent"] == "ask"
    assert "尺寸" in t["reply"]


def test_parse_choice_ui_actions():
    t = _parse_agent_turn(
        """
        {"intent":"create","reply":"将添加浅灰矩形",
         "tool_ops":[{"op_key":"create_shape","args":{"shapeType":"rect"}}],
         "choice_ui":{"mode":"buttons","options":[
           {"label":"就这样添加","action":"apply"},
           {"label":"我想改颜色","action":"reply"},
           {"label":"取消","action":"dismiss"}
         ]},"done":true}
        """
    )
    ui = t["choice_ui"]
    assert ui["mode"] == "buttons"
    assert ui["options"][0]["action"] == "apply"
    assert ui["options"][1]["action"] == "reply"
    assert t["apply_choice"] == "就这样添加"


def test_legacy_choices_map_apply_choice():
    ui = _normalize_choice_ui(
        None,
        legacy_choices=["改颜色", "确认添加", "取消"],
        legacy_apply="确认添加",
    )
    assert ui is not None
    by_label = {o["label"]: o["action"] for o in ui["options"]}
    assert by_label["确认添加"] == "apply"
    assert by_label["改颜色"] == "reply"


def test_propose_adds_apply_slot_without_inventing_copy():
    st = AgentRunState(trace_id="t", task_id="k", goal="g")
    st.choices = ["改颜色", "改大小"]
    ui = _ensure_propose_choice_ui(st)
    assert any(o["action"] == "apply" for o in ui["options"])
    # Model labels preserved — not scrubbed by keywords.
    labels = [o["label"] for o in ui["options"] if o["label"]]
    assert "改颜色" in labels
    assert "改大小" in labels


def test_choice_ui_text_mode_without_options():
    ui = _normalize_choice_ui(
        {"mode": "text", "placeholder": "品牌、主色、文案…"},
        legacy_choices=[],
        legacy_apply="",
    )
    assert ui is not None
    assert ui["mode"] == "text"
    assert ui["options"] == []
    assert ui["placeholder"] == "品牌、主色、文案…"


def test_ask_propose_keeps_model_reply():
    text = _ask_propose_user_text(
        model_reply="准备加一个浅灰矩形，你看行吗？",
        detail="添加rect (#E0E0E0)",
    )
    assert "准备加一个浅灰矩形" in text
    assert "添加rect" not in text


def test_ask_propose_ignores_ops_detail_when_reply_empty():
    assert _ask_propose_user_text(model_reply="", detail="添加rect") == ""


def test_should_recover_edit_after_tools_drop_to_chat():
    assert _should_recover_edit_after_resources(
        prior_intent="edit",
        intent="chat",
        has_ops=False,
        has_pending_resources=True,
    )
    assert not _should_recover_edit_after_resources(
        prior_intent="edit",
        intent="edit",
        has_ops=True,
        has_pending_resources=True,
    )
    assert not _should_recover_edit_after_resources(
        prior_intent="chat",
        intent="chat",
        has_ops=False,
        has_pending_resources=True,
    )


def test_lc_design_needs_canvas_ops_blocks_narrate_only():
    assert _lc_design_needs_canvas_ops(
        classified="create", turn_intent="chat", has_ops=False
    )
    assert _lc_design_needs_canvas_ops(
        classified="edit", turn_intent="done", has_ops=False
    )
    # Agent: bare ask without chips still paints when classified create.
    assert _lc_design_needs_canvas_ops(
        classified="create", turn_intent="ask", has_ops=False, has_clarify=False
    )
    # Ask mode: intent=ask waits on user even without chips.
    assert not _lc_design_needs_canvas_ops(
        classified="create",
        turn_intent="ask",
        has_ops=False,
        has_clarify=False,
        ask_mode=True,
    )
    # Real clarify may settle without paint.
    assert not _lc_design_needs_canvas_ops(
        classified="create", turn_intent="ask", has_ops=False, has_clarify=True
    )
    assert not _lc_design_needs_canvas_ops(
        classified="create", turn_intent="chat", has_ops=True
    )
    assert not _lc_design_needs_canvas_ops(
        classified="chat", turn_intent="chat", has_ops=False
    )


def test_should_route_to_paint():
    from services.design.agent_controller import _should_route_to_paint

    assert _should_route_to_paint(
        classified="create", turn_intent="chat", has_clarify=False
    )
    assert not _should_route_to_paint(
        classified="create", turn_intent="ask", has_clarify=True
    )
    assert not _should_route_to_paint(
        classified="create",
        turn_intent="ask",
        has_clarify=False,
        ask_mode=True,
    )
    assert not _should_route_to_paint(
        classified="chat", turn_intent="chat", has_clarify=False
    )


def test_turn_from_structured_keeps_reply_and_ops():
    turn = _turn_from_structured(
        AgentTurnSchema(
            thought="加矩形",
            intent="create",
            reply="好的，我在狗旁边加一个矩形。",
            tool_ops=[
                {
                    "op_key": "create_shape",
                    "args": {"shapeType": "rect", "x": 100, "y": 250, "width": 200, "height": 150},
                }
            ],
            done=True,
        )
    )
    assert turn["intent"] == "create"
    assert "矩形" in turn["reply"]
    assert turn["tool_ops_raw"]
    assert turn["thought"] == "加矩形"


def test_chat_fallback_fills_persona():
    class _RT:
        chat_fallback_tmpl = "你好，{persona}。可以说说你想改画布的什么。"
        persona = "Recombyn Auto 设计助手"
        prompt = "你好"

    text = _chat_fallback_text(_RT())
    assert "{persona}" not in text
    assert "Recombyn Auto 设计助手" in text


def test_has_pending_resource_details():
    class _RT:
        pending_tool_details = "TOOL_DETAILS:\n..."
        pending_knowledge_details = ""
        pending_prompt_details = ""
        pending_skill_details = ""
        pending_aesthetics_details = ""

    assert _has_pending_resource_details(_RT())
    empty = _RT()
    empty.pending_tool_details = ""
    assert not _has_pending_resource_details(empty)
    skills = _RT()
    skills.pending_tool_details = ""
    skills.pending_skill_details = "SKILL_DETAILS:\n..."
    assert _has_pending_resource_details(skills)



def test_heuristic_user_intent_gate():
    from services.design.models_route import heuristic_user_intent

    assert heuristic_user_intent("你好", has_images=False).intent == "chat"
    assert (
        heuristic_user_intent("User request:\n你好", has_images=False).intent == "chat"
    )
    assert (
        heuristic_user_intent(
            "[Attached image 1]\nname: canvas.png\n\nUser request:\n你好",
            has_images=True,
        ).intent
        == "chat"
    )
    assert (
        heuristic_user_intent("参考帮我设计一张海报", has_images=True).intent
        == "create"
    )


def test_agent_model_id_prefers_api_model():
    from services.llm.agent import _agent_model_id

    assert (
        _agent_model_id("deepseek-v4-flash", "deepseek-v4-flash-260425")
        == "deepseek-v4-flash-260425"
    )
    assert (
        _agent_model_id("doubao-seed-2-1-turbo", "doubao-seed-2-1-turbo-260628")
        == "doubao-seed-2-1-turbo-260628"
    )
    assert _agent_model_id("deepseek-reasoner", "deepseek-reasoner") == "deepseek-chat"
