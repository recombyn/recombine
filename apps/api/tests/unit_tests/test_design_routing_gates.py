"""Layer ② — intent routing helpers (parse LLM JSON; no code invent of intent)."""

from __future__ import annotations

import pytest

from services.design.catalog import ensure_design_catalog
from services.design.decision_log import probe_has_target_chip
from services.design.intent_route import (
    coerce_route_intent,
    coerce_task_kind,
    fallback_route_intent,
    parse_route_intent,
    parse_task_kind,
)
from services.design.canvas_scene import resolve_agent_scene


@pytest.fixture(scope="module", autouse=True)
def _catalog(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("design_eval") / "test.db"
    import os

    os.environ["SQLITE_DB_PATH"] = str(db_path)
    os.environ["DATABASE_URL"] = ""
    from config import settings as settings_mod

    settings_mod.settings.sqlite_db_path = str(db_path)
    settings_mod.settings.database_url = ""
    ensure_design_catalog(force=True)


def test_fallback_is_always_chat():
    # LLM down → chat only. Code must not invent create/edit from flags.
    assert fallback_route_intent() == "chat"
    assert fallback_route_intent(has_canvas=True) == "chat"
    assert fallback_route_intent(has_focus_frame=True) == "chat"
    assert fallback_route_intent(has_canvas=True, has_target_chip=True) == "chat"
    assert (
        fallback_route_intent(has_ref_images=True, has_focus_frame=True) == "chat"
    )


def test_probe_target_chip_detects_payload_only():
    # Probe is a param fact for the classifier, not a route decision.
    prompt = "[Target element: rect-1]\n修改圆角为8px"
    assert probe_has_target_chip(prompt)
    assert not probe_has_target_chip("你好")


def test_parse_route_intent_json():
    assert parse_route_intent('{"intent":"chat"}') == "chat"
    assert parse_route_intent('{"intent":"edit","reason":"x"}') == "edit"
    assert parse_route_intent("not json") is None


def test_parse_task_kind_json():
    assert parse_task_kind('{"intent":"edit","task_kind":"direct"}') == "direct"
    assert parse_task_kind('{"intent":"edit","task_kind":"modify"}') == "direct"
    assert parse_task_kind('{"intent":"edit","task_kind":"design"}') == "design"
    assert parse_task_kind('{"edit_scope":"patch"}') == "direct"
    assert parse_task_kind('{"edit_scope":"redesign"}') == "design"
    assert coerce_task_kind(None, intent="edit") == "design"
    assert coerce_task_kind("direct", intent="chat") == ""
    assert coerce_task_kind("direct", intent="edit") == "direct"


def test_coerce_keeps_llm_intent():
    assert (
        coerce_route_intent(
            "chat",
            has_canvas=True,
            has_target_chip=True,
            has_ref_images=False,
        )
        == "chat"
    )
    assert (
        coerce_route_intent(
            "edit",
            has_canvas=False,
            has_target_chip=False,
            has_ref_images=False,
            has_focus_frame=False,
        )
        == "edit"
    )
    for intent in ("create", "sibling", "blank"):
        assert (
            coerce_route_intent(
                intent,
                has_canvas=True,
                has_target_chip=True,
                has_ref_images=False,
            )
            == intent
        )
    assert coerce_route_intent("nope") == "chat"


def test_scene_follows_ui_tab_not_prompt_keywords():
    # Prompt must not override the UI scene tab.
    key, overridden = resolve_agent_scene("website", "做一张竖版海报")
    assert key == "website"
    assert overridden is False
    key2, _ = resolve_agent_scene("mobile", "设计一个网站首页")
    assert key2 == "mobile"
    key3, _ = resolve_agent_scene(None, "随便")
    assert key3 == "website"
