from app.services.design.prompts.prompt_pack_store import (
    format_prompt_pack_block,
    format_prompt_packs_catalog,
    list_prompt_nodes_from_flow,
    seed_prompt_overlay_nodes,
)
from app.services.design.prompts.skill_store import format_skills_details


def test_seed_prompt_overlay_nodes_migrated_to_skills():
    """Methodology packs moved to design_skills_seed — overlay nodes empty."""
    nodes = seed_prompt_overlay_nodes()
    assert nodes == []


def test_prompt_packs_catalog_points_to_skills():
    """Scene methodology packs retired — catalog is a stub; skills own playbooks."""
    from app.services.design.prompts.prompt_pack_store import ensure_design_prompt_packs

    ensure_design_prompt_packs()
    block = format_prompt_packs_catalog(scene="website")
    assert (
        "retired" in block.lower()
        or "need_skills" in block
        or "Skill" in block
    )


def test_methodology_lives_in_skills():
    from app.services.design.prompts.skill_store import (
        _SEED as _SKILL_SEED,
        ensure_design_skills,
        reset_skills_ready_for_tests,
    )

    reset_skills_ready_for_tests()
    ensure_design_skills(force=True)
    details = format_skills_details(keys=["design_methodology"], scene="website")
    assert "create_shape" in details and "create_text" in details
    assert "need_aesthetics" in details or "skill: design_methodology" in details
    seed_pos = next(
        (
            str(it.get("prompt_positive") or "")
            for it in _SKILL_SEED
            if it.get("skill_key") == "design_methodology"
        ),
        "",
    )
    assert (
        "brief → 结构" in seed_pos
        or "brief → structure" in seed_pos
        or "自检" in seed_pos
        or "self-check" in seed_pos
    )


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


def test_ensure_prompt_packs_preserves_admin_body(tmp_path, monkeypatch):
    """Re-running seed must not overwrite Admin-edited pack body."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine, reset_engine
    from app.services.design.prompts import prompt_pack_store as pps
    from tests.conftest import restore_default_sqlite_engine

    db_path = tmp_path / "packs.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    monkeypatch.setenv("DATABASE_URL", "")
    from app.core.config import settings as settings_mod

    settings_mod.sqlite_db_path = str(db_path)
    settings_mod.database_url = ""
    reset_engine()
    pps._PACKS_READY = False
    try:
        pps.ensure_design_prompt_packs()
        with Session(engine) as session:
            rows = crud.list_all_design_prompt_packs(session=session)
            assert rows
            target = rows[0]
            kind = target.kind
            target.body = "ADMIN_EDITED_BODY_DO_NOT_CLOBBER"
            session.add(target)
            session.commit()

        pps._PACKS_READY = False
        pps.ensure_design_prompt_packs()
        with Session(engine) as session:
            again = crud.list_design_prompt_packs_by_kind(session=session, kind=kind)
            assert again
            assert again[0].body == "ADMIN_EDITED_BODY_DO_NOT_CLOBBER"
    finally:
        pps._PACKS_READY = False
        restore_default_sqlite_engine()


def test_oss_ask_system_seed_documents_choice_ui():
    from app.services.design.prompts.prompt_pack_store import _SEED_BY_KIND

    body = str((_SEED_BY_KIND.get("agent.prompt.ask_system") or {}).get("body") or "")
    assert "choice_ui" in body
    assert "apply" in body and "dismiss" in body
    assert "提案确认" in body or "Propose / confirm" in body
    assert "问法策略" in body or "Ask strategy" in body
    assert "每轮只问" in body or "One blocking question" in body
