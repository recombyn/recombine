"""Runtime gates that remain in the live path (no soft prompt→scene invent)."""

from __future__ import annotations

import pytest

from services.design.admin_store import STAGE_RULE_DEFAULTS, ensure_stage_rules
from services.design.catalog import ensure_design_catalog, get_global_rules
from services.design.decision_log import probe_has_target_chip
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
    ensure_stage_rules()


def test_probe_target_chip_detects_payload_only():
    prompt = "[Target element: rect-1]\n修改圆角为8px"
    assert probe_has_target_chip(prompt)
    assert not probe_has_target_chip("你好")


def test_scene_follows_ui_tab_only():
    rules = get_global_rules() or dict(STAGE_RULE_DEFAULTS)
    if "canvas.scene_keys" not in rules:
        rules = dict(STAGE_RULE_DEFAULTS)
    key, overridden = resolve_agent_scene("website", "做一张竖版海报", rules=rules)
    assert key == "website"
    assert overridden is False
    key2, _ = resolve_agent_scene("mobile", "设计一个网站首页", rules=rules)
    assert key2 == "mobile"
    # Empty tab → Admin default only (no prompt soft invent).
    key3, _ = resolve_agent_scene(None, "设计一个 app 登录页", rules=rules)
    assert key3 == "website"
