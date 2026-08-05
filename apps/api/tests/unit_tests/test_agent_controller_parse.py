"""Unit: ReAct agent output contract parsing."""

from __future__ import annotations

from app.services.design.runtime.agent_controller import (
    AgentRunState,
    AgentTurnSchema,
    PaintOpsSchema,
    PaintToolOp,
    _ask_propose_user_text,
    _chat_fallback_text,
    _ensure_propose_choice_ui,
    _lc_design_needs_canvas_ops,
    _normalize_choice_ui,
    _normalize_ops_payload,
    _parse_agent_turn,
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


def test_paint_tool_op_coalesces_flat_and_ops_alias():
    op = PaintToolOp.model_validate(
        {"name": "create_shape", "type": "rect", "x": 10, "y": 20, "width": 40, "height": 30}
    )
    assert op.name == "create_shape"
    assert op.args.get("shapeType") == "rect"
    assert op.args.get("x") == 10
    painted = PaintOpsSchema.model_validate(
        {
            "ops": [{"name": "create_text", "args": {"text": "Hi", "x": 1, "y": 2}}],
            "intent": "create",
        }
    )
    assert len(painted.tool_ops) == 1
    assert painted.tool_ops[0].name == "create_text"
    assert painted.tool_ops[0].args["text"] == "Hi"


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
    # Clarify chips settle only in Ask mode; Agent still paints.
    assert not _lc_design_needs_canvas_ops(
        classified="create",
        turn_intent="ask",
        has_ops=False,
        has_clarify=True,
        ask_mode=True,
    )
    assert _lc_design_needs_canvas_ops(
        classified="create",
        turn_intent="ask",
        has_ops=False,
        has_clarify=True,
        ask_mode=False,
    )
    assert not _lc_design_needs_canvas_ops(
        classified="create", turn_intent="chat", has_ops=True
    )
    assert not _lc_design_needs_canvas_ops(
        classified="chat", turn_intent="chat", has_ops=False
    )


def test_should_route_to_paint():
    from app.services.design.runtime.agent_controller import _should_route_to_paint

    assert _should_route_to_paint(
        classified="create", turn_intent="chat", has_clarify=False
    )
    assert not _should_route_to_paint(
        classified="create",
        turn_intent="ask",
        has_clarify=True,
        ask_mode=True,
    )
    assert _should_route_to_paint(
        classified="create",
        turn_intent="ask",
        has_clarify=True,
        ask_mode=False,
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


def test_prefer_canvas_op_demote_disabled_for_short_chinese_design():
    """Short Chinese page asks must keep LLM design — no char-length demote."""
    from app.services.design.runtime.models_route import (
        IntentClassifyDecision,
        _prefer_canvas_op_when_overpromoted,
    )

    fb = IntentClassifyDecision(
        intent="canvas_op", paint_lane="create", rationale="heuristic_task"
    )
    intent, lane, rat = _prefer_canvas_op_when_overpromoted(
        "design",
        "create",
        rationale="mobile login page layout",
        fallback=fb,
        has_images=False,
        prompt="User request:\n帮我设计一个移动端的登录页",
    )
    assert intent == "design"
    assert lane == "create"
    assert "demote_canvas_op" not in rat


def test_heuristic_user_intent_gate():
    from app.services.design.runtime.models_route import (
        allows_skill_preload,
        heuristic_user_intent,
        normalize_intent_decision,
        normalize_user_intent,
        paint_ops_intent,
    )

    # Fallback is structural only — normal path uses intent LLM + tools catalog.
    assert heuristic_user_intent("hi", has_images=False).intent == "chat"
    assert (
        heuristic_user_intent("User request:\nhi", has_images=False).intent == "chat"
    )
    img = heuristic_user_intent(
        "[Attached image 1]\nname: canvas.png\n\nUser request:\nhi",
        has_images=True,
    )
    assert img.intent == "design"
    assert img.paint_lane == "create"
    op = heuristic_user_intent("short canvas task text", has_images=False)
    assert op.intent == "canvas_op"
    assert op.paint_lane == "create"
    target = heuristic_user_intent(
        "[Target element — full node]\n{\"id\":\"x\"}\n\nUser request:\nx",
        has_images=False,
    )
    assert target.intent == "canvas_op"
    assert target.paint_lane == "edit"
    assert normalize_user_intent("edit") == "canvas_op"
    assert normalize_user_intent("create") == "canvas_op"
    assert normalize_intent_decision("create", "", raw_grade="basic") == (
        "canvas_op",
        "create",
    )
    assert normalize_intent_decision("create", "", raw_grade="design") == (
        "design",
        "create",
    )
    assert paint_ops_intent("canvas_op", "edit") == "edit"
    # Skill bodies are never preloaded; catalogs + need_skills only.
    assert not allows_skill_preload(intent="canvas_op")
    assert not allows_skill_preload(intent="design")


def test_agent_model_id_prefers_api_model():
    from app.services.llm.agent import _agent_model_id

    assert (
        _agent_model_id("deepseek-v4-flash", "deepseek-v4-flash-260425")
        == "deepseek-v4-flash-260425"
    )
    assert (
        _agent_model_id("doubao-seed-2-1-turbo", "doubao-seed-2-1-turbo-260628")
        == "doubao-seed-2-1-turbo-260628"
    )
    assert _agent_model_id("deepseek-reasoner", "deepseek-reasoner") == "deepseek-chat"


def test_paint_tool_keys_structural_not_shape_specific():
    """canvas_op create: shape+text only — no create_frame / update."""
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import (
        AgentRunState,
        _is_lean_paint_turn,
        _paint_tool_keys_for_turn,
    )

    st = AgentRunState(trace_id="t", task_id="task", goal="add")
    rt = SimpleNamespace(
        prompt="short add",
        images=[],
        classified_intent="canvas_op",
        classified_paint_lane="create",
        scene_nodes=[{"id": "n1", "type": "text"}],
        scene_frames=[{"id": "f1", "w": 1280, "h": 720, "is_empty": False}],
        focus_id="f1",
        run=st,
    )
    assert _is_lean_paint_turn(rt) is True
    keys = _paint_tool_keys_for_turn(rt)
    assert keys == ["create_shape", "create_text"]
    assert "create_frame" not in keys
    assert "update_node" not in keys


def test_paint_tool_keys_basic_edit_has_update():
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import (
        AgentRunState,
        _is_lean_paint_turn,
        _paint_tool_keys_for_turn,
    )

    st = AgentRunState(trace_id="t", task_id="task", goal="edit")
    rt = SimpleNamespace(
        prompt="[Target element]\n{}\n\nUser request:\nx",
        images=[],
        classified_intent="canvas_op",
        classified_paint_lane="edit",
        scene_nodes=[{"id": "n1", "type": "rect"}],
        scene_frames=[{"id": "f1", "w": 1280, "h": 720, "is_empty": False}],
        focus_id="f1",
        run=st,
    )
    assert _is_lean_paint_turn(rt) is True
    keys = _paint_tool_keys_for_turn(rt)
    assert "update_node" in keys
    assert "delete_nodes" in keys
    assert "create_frame" not in keys


def test_paint_tool_keys_empty_canvas_includes_frame():
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import AgentRunState, _paint_tool_keys_for_turn
    from app.services.design.runtime.decision_log import DesignRunDecision

    st = AgentRunState(trace_id="t", task_id="task", goal="new")
    rt = SimpleNamespace(
        prompt="design task",
        images=[],
        classified_intent="design",
        classified_paint_lane="create",
        scene_nodes=[],
        scene_frames=[],
        focus_id="",
        decision=DesignRunDecision(has_target_chip=False),
        run=st,
    )
    keys = _paint_tool_keys_for_turn(rt)
    assert keys[0] == "create_frame"
    assert "create_shape" in keys
    assert "create_text" in keys


def test_paint_tool_keys_design_create_includes_frame_when_focus_exists():
    """Ambient FOCUS must not block a new plate for design/create."""
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import AgentRunState, _paint_tool_keys_for_turn
    from app.services.design.runtime.decision_log import DesignRunDecision

    st = AgentRunState(trace_id="t", task_id="task", goal="login")
    rt = SimpleNamespace(
        prompt="帮我设计一个移动端的登录页",
        images=[],
        classified_intent="design",
        classified_paint_lane="create",
        scene_nodes=[{"id": "n1", "type": "text"}],
        scene_frames=[{"id": "f1", "w": 409, "h": 728, "is_empty": False}],
        focus_id="f1",
        decision=DesignRunDecision(has_target_chip=False),
        run=st,
    )
    keys = _paint_tool_keys_for_turn(rt)
    assert keys[0] == "create_frame"


def test_lc_design_needs_canvas_ops_fine_intents():
    from app.services.design.runtime.agent_controller import (
        _is_canvas_work_intent,
        _lc_design_needs_canvas_ops,
    )

    assert _is_canvas_work_intent("canvas_op")
    assert _is_canvas_work_intent("design")
    assert not _is_canvas_work_intent("chat")
    assert _lc_design_needs_canvas_ops(
        classified="canvas_op", turn_intent="chat", has_ops=False
    )
    assert _lc_design_needs_canvas_ops(
        classified="design", turn_intent="create", has_ops=False
    )
    assert not _lc_design_needs_canvas_ops(
        classified="chat", turn_intent="chat", has_ops=False
    )


def test_paint_tool_keys_with_images_includes_create_image():
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import (
        AgentRunState,
        _is_lean_paint_turn,
        _paint_tool_keys_for_turn,
    )

    st = AgentRunState(trace_id="t", task_id="task", goal="img")
    rt = SimpleNamespace(
        prompt="用这张图",
        images=["data:image/png;base64,xx"],
        classified_intent="create",
        scene_nodes=[],
        scene_frames=[{"id": "f1", "is_empty": False}],
        focus_id="f1",
        run=st,
    )
    assert _is_lean_paint_turn(rt) is False
    keys = _paint_tool_keys_for_turn(rt)
    assert "create_image" in keys


def test_derive_suggested_place_world_empty_viewport_centers():
    from app.services.design.runtime.agent_controller import _derive_suggested_place_world

    spw = _derive_suggested_place_world(
        {"viewport": {"x": 5000, "y": 2000, "w": 1200, "h": 800}},
        focus_frame=None,
    )
    assert spw is not None
    # Roughly camera center.
    assert 5200 <= spw["x"] <= 5900
    assert 2100 <= spw["y"] <= 2600


def test_derive_suggested_place_world_aligns_beside_content():
    from app.services.design.runtime.agent_controller import _derive_suggested_place_world

    # One free-canvas node in the left of the viewport → prefer slot to its right.
    spw = _derive_suggested_place_world(
        {
            "viewport": {"x": 0, "y": 0, "w": 2000, "h": 1200},
            "focused": [{"id": "a", "x": 100, "y": 200, "w": 400, "h": 300}],
        },
        focus_frame=None,
    )
    assert spw is not None
    assert spw["x"] >= 100 + 400  # to the right of existing
    assert abs(spw["y"] - 200) <= 1  # top-aligned


def test_format_spatial_placement_from_focus_frame_alone():
    from app.services.design.runtime.agent_controller import _format_spatial_placement

    text = _format_spatial_placement(
        None,
        focus_frame={"id": "f1", "x": 4800, "y": 1200, "w": 410, "h": 729},
    )
    assert "PLACEMENT" in text
    assert "suggested_place_world" in text
    # Centered inside focus frame world box (4800 + inset).
    assert "x=4954" in text
    assert "y=1473" in text


def test_placement_errors_for_offscreen_free_creates():
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import (
        _derive_suggested_place_world,
        _placement_errors_for_free_creates,
    )

    spatial = {"viewport": {"x": 4800, "y": 1200, "w": 1400, "h": 900}}
    focus = {"id": "f1", "x": 5000, "y": 1400, "w": 410, "h": 729}
    rt = SimpleNamespace(
        spatial_summary=spatial,
        focus_id="f1",
        scene_frames=[focus],
    )
    # Normalized post-validate shape ({name, args}).
    ops = [
        {
            "name": "create_shape",
            "args": {
                "shapeType": "rect",
                "x": 120,
                "y": 440,
                "width": 170,
                "height": 120,
            },
            "op_id": "t1",
        }
    ]
    errs = _placement_errors_for_free_creates(rt, ops)
    spw = _derive_suggested_place_world(spatial, focus_frame=focus)
    assert errs
    assert "code=placement_outside_viewport" in errs[0]
    assert "fix=" in errs[0] and "suggested_place_world" in errs[0]
    assert spw is not None
    assert f"x={spw['x']}" in errs[0]
    assert f"y={spw['y']}" in errs[0]
    # Ops must not be mutated — teach via error, model re-emits.
    assert ops[0]["args"]["x"] == 120


def test_placement_errors_skip_framed_creates():
    from types import SimpleNamespace

    from app.services.design.runtime.agent_controller import _placement_errors_for_free_creates

    rt = SimpleNamespace(
        spatial_summary={"viewport": {"x": 4800, "y": 1200, "w": 1400, "h": 900}},
        focus_id="f1",
        scene_frames=[{"id": "f1", "x": 5000, "y": 1400, "w": 410, "h": 729}],
    )
    ops = [
        {
            "name": "create_shape",
            "args": {"shapeType": "rect", "x": 120, "y": 440, "frameId": "f1"},
            "op_id": "t1",
        }
    ]
    assert _placement_errors_for_free_creates(rt, ops) == []


def test_scene_digest_includes_frame_world_xy():
    from app.services.design.runtime.agent_controller import _scene_digest

    text = _scene_digest(
        [],
        [{"id": "f1", "name": "Design", "x": 5120, "y": 880, "w": 410, "h": 729, "is_empty": False}],
        focus_id="f1",
    )
    assert "x=5120" in text
    assert "y=880" in text


def test_assemble_stage_system_decide_and_paint():
    from app.services.design.prompts.prompt_pack_store import ensure_design_prompt_packs, render_prompt_body
    from app.services.design.runtime.design_run import assemble_stage_system

    ensure_design_prompt_packs()
    decide = assemble_stage_system(
        None, stage="decide", ask_mode=False, persona="我是测试助手"
    )
    assert "IDENTITY: 我是测试助手" in decide
    # OSS English packs or product Chinese.
    assert "need_tools" in decide or "按需资源" in decide or "resource" in decide.lower()
    assert "Agent" in decide or "Decide" in decide or "禁止" in decide
    paint = assemble_stage_system(None, stage="paint", ask_mode=True, persona="P")
    assert "IDENTITY: P" in paint
    assert "tool_ops" in paint or "PAINT" in paint.upper()
    ask_body = render_prompt_body("agent.prompt.ask_system")
    assert (ask_body[:20] in paint) if ask_body else True
    assert "Ask" in paint or "ask" in paint.lower() or ask_body[:20] in paint


def test_validate_paint_ops_rejects_unknown_and_keeps_valid():
    from app.services.design.runtime.design_run import validate_paint_ops

    ops, errs = validate_paint_ops(
        [
            {
                "name": "create_shape",
                "args": {
                    "shapeType": "rect",
                    "x": 10,
                    "y": 20,
                    "width": 100,
                    "height": 80,
                },
            },
            {"name": "not_a_real_tool", "args": {}},
        ],
        scene_nodes=[],
        scene_frames=[],
        rules={},
    )
    assert any(o.get("name") == "create_shape" for o in ops)
    assert errs  # unknown tool rejected
