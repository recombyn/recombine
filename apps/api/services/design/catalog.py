"""Read design catalog from DB."""

from __future__ import annotations

import json
import threading
from typing import Any

from services.db import connect, init_schema
from services.design.schema import ensure_design_tables
from services.design.seed import seed_design_catalog_if_empty
from services.design.content_pack import resync_design_content
from services.db import dialect

_ENSURE_LOCK = threading.RLock()
_CATALOG_READY = False


def catalog_ready() -> bool:
    return bool(_CATALOG_READY)


def ensure_design_catalog(*, force: bool = False) -> None:
    """Process bootstrap only (startup / admin /catalog). Design-run must only SELECT."""
    global _CATALOG_READY
    if _CATALOG_READY and not force:
        return
    with _ENSURE_LOCK:
        if _CATALOG_READY and not force:
            return
        init_schema()
        mysql = dialect() == "mysql"
        with connect() as conn:
            ensure_design_tables(conn, mysql=mysql)
        seed_design_catalog_if_empty()
        resync_design_content(force=False)
        # Library brush cover refresh is slow on remote MySQL — only run from
        # brush/library endpoints via ensure_library_seed(), not on every catalog boot.
        from services.design.knowledge_store import ensure_design_knowledge
        from services.design.prompt_pack_store import ensure_design_prompt_packs
        from services.design.action_registry import ensure_action_registry

        ensure_design_knowledge()
        ensure_design_prompt_packs()
        ensure_action_registry()
        _CATALOG_READY = True

def _parse_json_list(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if not raw:
        return []
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else []
    except Exception:
        return []


def list_skills() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM design_skill WHERE enabled = 1 ORDER BY sort_weight DESC, id ASC"
        ).fetchall()
    return [dict(r) for r in rows]


def list_skill_groups(scene: str | None = None) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM design_skill_group WHERE enabled = 1 ORDER BY priority DESC, id ASC"
        ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        item["skill_ids"] = _parse_json_list(item.get("skill_ids"))
        scenes = str(item.get("scenes") or "all")
        if scene and scene not in scenes.split(",") and scenes != "all":
            continue
        out.append(item)
    return out


def get_flow(scene: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM design_execute_flow WHERE scene = ? AND enabled = 1",
            (scene,),
        ).fetchone()
    if not row:
        return None
    item = dict(row)
    item["skill_ids"] = _parse_json_list(item.get("skill_ids"))
    item["force_validate_flags"] = _parse_json_list(item.get("force_validate_flags"))
    item["step_token_caps"] = _parse_json_list(item.get("step_token_caps"))
    return item


def get_skill(skill_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM design_skill WHERE id = ?", (int(skill_id),)).fetchone()
    return dict(row) if row else None


def get_global_rules() -> dict[str, str]:
    """Runtime rules map — disabled rows are omitted (callers fall back to code defaults)."""
    with connect() as conn:
        try:
            rows = conn.execute(
                """
                SELECT rule_key, rule_value FROM design_global_rule
                WHERE COALESCE(enabled, 1) = 1
                """
            ).fetchall()
        except Exception:
            rows = conn.execute(
                "SELECT rule_key, rule_value FROM design_global_rule"
            ).fetchall()
    return {str(r["rule_key"]): str(r["rule_value"]) for r in rows}


def get_refine_skill(
    *,
    scene: str | None = None,
    prefer_layer_partial: bool = False,
) -> dict[str, Any] | None:
    """Pick an enabled refine skill.

    Default: full-canvas refine for a scene (never layer_partial).
    prefer_layer_partial=True: target-layer skill for partial mode.
    """
    scene_l = (scene or "").strip().lower()
    with connect() as conn:
        if prefer_layer_partial:
            row = conn.execute(
                "SELECT * FROM design_skill WHERE enabled = 1 AND category = 'refine' "
                "AND (skill_key = 'layer_partial' OR scenes = 'all' OR name LIKE ?) "
                "ORDER BY CASE WHEN skill_key = 'layer_partial' THEN 0 ELSE 1 END, id DESC LIMIT 1",
                ("%图层%",),
            ).fetchone()
            return dict(row) if row else None

        rows = conn.execute(
            "SELECT * FROM design_skill WHERE category = 'refine' AND enabled = 1 "
            "ORDER BY "
            "CASE WHEN skill_key = 'design_execute' THEN 0 ELSE 1 END, "
            "sort_weight DESC, id DESC"
        ).fetchall()
    best: dict[str, Any] | None = None
    for r in rows:
        d = dict(r)
        key = str(d.get("skill_key") or "").strip()
        if key == "layer_partial":
            continue
        scenes = str(d.get("scenes") or "").lower()
        if scene_l and scene_l not in scenes.replace(" ", "").split(",") and scenes != "all":
            if best is None:
                best = d  # weak fallback if no scene match later
            continue
        return d
    return best


def list_scene_codes() -> list[str]:
    try:
        from services.design.dict_store import list_dicts
        items = list_dicts(dict_type="scene", enabled=True)
        codes = [i["code"] for i in items if i.get("code") and i["code"] != "all"]
        if codes:
            return codes
    except Exception:
        pass
    return ["website", "mobile", "image", "poster", "drawing"]


def get_catalog_payload() -> dict[str, Any]:
    from services.design.library_store import list_library_items
    from services.design.tool_ops_contract import list_canvas_tools

    # Bootstrap belongs at process startup / admin — not on every skill SELECT.
    ensure_design_catalog()

    skills = list_skills()
    groups = list_skill_groups()
    scene_codes = list_scene_codes()
    flows = {}
    for scene in scene_codes:
        f = get_flow(scene)
        if f:
            flows[scene] = f

    def _lib_kind(kind: str, page_size: int = 48) -> list[dict[str, Any]]:
        try:
            data = list_library_items(kind=kind, enabled=True, page=1, page_size=page_size)
            return list(data.get("items") or [])
        except Exception:
            return []

    style_packs = _lib_kind("style")
    templates = _lib_kind("template")
    prompt_patterns = _lib_kind("prompt")

    return {
        "scenes": scene_codes,
        "sceneLabels": {i["code"]: i["label"] for i in __import__("services.design.dict_store", fromlist=["list_dicts"]).list_dicts(dict_type="scene", enabled=True)},
        "categoryLabels": {i["code"]: i["label"] for i in __import__("services.design.dict_store", fromlist=["list_dicts"]).list_dicts(dict_type="skill_category", enabled=True)},
        "models": [
            {"id": "auto", "label": "Auto"},
            {"id": "doubao", "label": "Doubao"},
            {"id": "deepseek", "label": "DeepSeek"},
        ],
        "skills": [
            {
                "id": s["id"],
                "name": s["name"],
                "category": s["category"],
                "scenes": s["scenes"],
                "default_model": s["default_model"],
                "allow_user_model_override": bool(s.get("allow_user_model_override")),
            }
            for s in skills
        ],
        "style_groups": [
            {
                "id": g["id"],
                "name": g["name"],
                "scenes": g["scenes"],
                "skill_ids": g["skill_ids"],
                "priority": g["priority"],
            }
            for g in groups
        ],
        # OD mapping: System = style pack, Template = composition, Prompt = pattern
        "style_packs": style_packs,
        "templates": templates,
        "prompt_patterns": prompt_patterns,
        "flows": {
            k: {
                "id": v["id"],
                "scene": v["scene"],
                "skill_ids": v["skill_ids"],
                "fail_strategy": v["fail_strategy"],
            }
            for k, v in flows.items()
        },
        "global_rules": get_global_rules(),
        "canvas_tools": list_canvas_tools(enabled_only=True),
        "prompt_stack": [
            "global_rules",
            "scene_rules",
            "design_system",
            "template",
            "skill",
        ],
    }
