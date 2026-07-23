"""Admin CRUD for design pipeline catalog (skills / rules / flows).

Private to admin — open-source builds omit this module + recombyn-admin.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from typing import Any

from services.design.catalog import ensure_design_catalog, get_skill
from services.db import connect

_STAGE_RULES_LOCK = threading.Lock()
_STAGE_RULES_READY = False


def _pub_skill(r: Any) -> dict[str, Any]:
    return {
        "id": int(r["id"]),
        "skillKey": (r["skill_key"] if "skill_key" in r.keys() else None) or None,
        "name": r["name"],
        "category": r["category"],
        "promptPositive": r["prompt_positive"],
        "promptNegative": r["prompt_negative"],
        "sortWeight": int(r["sort_weight"] or 0),
        "scenes": r["scenes"] or "all",
        "defaultModel": r["default_model"] or "doubao",
        "maxRetries": int(r["max_retries"] or 2),
        "enabled": bool(int(r["enabled"] or 0)),
        "outputFormat": r["output_format"] or "json",
        "allowUserModelOverride": bool(int(r["allow_user_model_override"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def list_admin_skills(*, q: str | None = None, enabled: bool | None = None) -> list[dict[str, Any]]:
    ensure_design_catalog()
    where = ["1=1"]
    params: list[Any] = []
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    if q and q.strip():
        like = f"%{q.strip()}%"
        where.append("(name LIKE ? OR category LIKE ? OR scenes LIKE ?)")
        params.extend([like, like, like])
    sql = (
        "SELECT * FROM design_skill WHERE "
        + " AND ".join(where)
        + " ORDER BY sort_weight DESC, id ASC"
    )
    with connect() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_pub_skill(r) for r in rows]


def upsert_skill(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_catalog()
    now = time.time()
    sid = payload.get("id")
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("name required")
    skill_key = payload.get("skillKey") or payload.get("skill_key")
    skill_key = str(skill_key).strip() if skill_key else None
    category = str(payload.get("category") or "layout").strip() or "layout"
    prompt_positive = str(payload.get("promptPositive") or payload.get("prompt_positive") or "")
    prompt_negative = payload.get("promptNegative") or payload.get("prompt_negative")
    sort_weight = int(payload.get("sortWeight") or payload.get("sort_weight") or 0)
    scenes = str(payload.get("scenes") or "all").strip() or "all"
    default_model = str(payload.get("defaultModel") or payload.get("default_model") or "doubao")
    max_retries = int(payload.get("maxRetries") or payload.get("max_retries") or 2)
    enabled = 1 if payload.get("enabled", True) else 0
    output_format = str(payload.get("outputFormat") or payload.get("output_format") or "json")
    allow_override = 1 if payload.get("allowUserModelOverride") or payload.get("allow_user_model_override") else 0

    with connect() as conn:
        if sid:
            conn.execute(
                """
                UPDATE design_skill SET
                  skill_key=COALESCE(?, skill_key), name=?, category=?, prompt_positive=?, prompt_negative=?,
                  sort_weight=?, scenes=?, default_model=?, max_retries=?,
                  enabled=?, output_format=?, allow_user_model_override=?, updated_at=?
                WHERE id=?
                """,
                (
                    skill_key, name, category, prompt_positive, prompt_negative,
                    sort_weight, scenes, default_model, max_retries,
                    enabled, output_format, allow_override, now, int(sid),
                ),
            )
            conn.commit()
            item = get_skill(int(sid))
        else:
            cur = conn.execute(
                """
                INSERT INTO design_skill (
                    skill_key, name, category, prompt_positive, prompt_negative,
                    sort_weight, scenes, default_model, max_retries,
                    enabled, output_format, allow_user_model_override,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    skill_key, name, category, prompt_positive, prompt_negative,
                    sort_weight, scenes, default_model, max_retries,
                    enabled, output_format, allow_override, now, now,
                ),
            )
            conn.commit()
            item = get_skill(int(cur.lastrowid))
    if not item:
        raise RuntimeError("upsert skill failed")
    return _pub_skill(item)


def soft_delete_skill(skill_id: int) -> bool:
    """Remove skill row from Admin list (hard delete)."""
    ensure_design_catalog()
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM design_skill WHERE id = ?",
            (int(skill_id),),
        )
        conn.commit()
        return int(getattr(cur, "rowcount", 0) or 0) > 0


def list_global_rules() -> list[dict[str, Any]]:
    ensure_design_catalog()
    ensure_stage_rules()
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM design_global_rule ORDER BY rule_key ASC"
        ).fetchall()
    return [
        {
            "id": int(r["id"]),
            "ruleKey": r["rule_key"],
            "ruleValue": r["rule_value"],
            "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
        }
        for r in rows
    ]


def upsert_global_rule(*, rule_key: str, rule_value: str) -> dict[str, Any]:
    ensure_design_catalog()
    key = (rule_key or "").strip()
    if not key:
        raise ValueError("ruleKey required")
    val = rule_value if rule_value is not None else ""
    now = time.time()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id FROM design_global_rule WHERE rule_key = ?",
            (key,),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE design_global_rule SET rule_value = ?, updated_at = ? WHERE rule_key = ?",
                (val, now, key),
            )
        else:
            conn.execute(
                "INSERT INTO design_global_rule (rule_key, rule_value, updated_at) VALUES (?, ?, ?)",
                (key, val, now),
            )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM design_global_rule WHERE rule_key = ?",
            (key,),
        ).fetchone()
    return {
        "id": int(row["id"]),
        "ruleKey": row["rule_key"],
        "ruleValue": row["rule_value"],
        "updatedAt": int(float(row["updated_at"]) * 1000),
    }


def list_canvas_tools_admin() -> list[dict[str, Any]]:
    """All canvas tool rows (including disabled) for Admin."""
    ensure_design_catalog()
    from services.design.tool_ops_contract import list_canvas_tools

    return list_canvas_tools(enabled_only=False)


def upsert_canvas_tool(
    *,
    op_key: str,
    label: str = "",
    model_hint: str = "",
    kind: str = "node",
    enabled: bool = True,
    sort_order: int = 0,
    args_schema: str = "",
) -> dict[str, Any]:
    ensure_design_catalog()
    key = (op_key or "").strip()
    if not key:
        raise ValueError("opKey required")
    if not re.match(r"^[a-z][a-z0-9_]*$", key):
        raise ValueError("opKey must be snake_case letters/digits")
    kind_s = (kind or "node").strip()[:32] or "node"
    schema_s = (args_schema or "").strip()
    if schema_s:
        try:
            parsed = json.loads(schema_s)
            if not isinstance(parsed, (dict, list)):
                raise ValueError("argsSchema must be JSON object/array")
            schema_s = json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError as e:
            raise ValueError(f"argsSchema invalid JSON: {e}") from e
    now = time.time()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id FROM design_canvas_tool WHERE op_key = ?",
            (key,),
        ).fetchone()
        if existing:
            try:
                conn.execute(
                    """
                    UPDATE design_canvas_tool
                    SET kind = ?, label = ?, model_hint = ?, args_schema = ?,
                        enabled = ?, sort_order = ?, updated_at = ?
                    WHERE op_key = ?
                    """,
                    (
                        kind_s,
                        (label or "").strip()[:128],
                        model_hint or "",
                        schema_s,
                        1 if enabled else 0,
                        int(sort_order),
                        now,
                        key,
                    ),
                )
            except Exception:
                conn.execute(
                    """
                    UPDATE design_canvas_tool
                    SET kind = ?, label = ?, model_hint = ?, enabled = ?,
                        sort_order = ?, updated_at = ?
                    WHERE op_key = ?
                    """,
                    (
                        kind_s,
                        (label or "").strip()[:128],
                        model_hint or "",
                        1 if enabled else 0,
                        int(sort_order),
                        now,
                        key,
                    ),
                )
        else:
            try:
                conn.execute(
                    """
                    INSERT INTO design_canvas_tool
                    (op_key, kind, label, model_hint, args_schema, enabled,
                     sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key,
                        kind_s,
                        (label or "").strip()[:128],
                        model_hint or "",
                        schema_s,
                        1 if enabled else 0,
                        int(sort_order),
                        now,
                        now,
                    ),
                )
            except Exception:
                conn.execute(
                    """
                    INSERT INTO design_canvas_tool
                    (op_key, kind, label, model_hint, enabled, sort_order,
                     created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key,
                        kind_s,
                        (label or "").strip()[:128],
                        model_hint or "",
                        1 if enabled else 0,
                        int(sort_order),
                        now,
                        now,
                    ),
                )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM design_canvas_tool WHERE op_key = ?",
            (key,),
        ).fetchone()
    kind_out = "node"
    try:
        kind_out = str(row["kind"] or "node")
    except Exception:
        pass
    args_out = ""
    try:
        args_out = str(row["args_schema"] or "")
    except Exception:
        pass
    return {
        "opKey": row["op_key"],
        "kind": kind_out,
        "label": row["label"] or "",
        "modelHint": row["model_hint"] or "",
        "argsSchema": args_out,
        "enabled": int(row["enabled"] or 0) == 1,
        "sortOrder": int(row["sort_order"] or 0),
        "updatedAt": int(float(row["updated_at"]) * 1000) if row["updated_at"] else None,
    }


def list_flows() -> list[dict[str, Any]]:
    ensure_design_catalog()
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM design_execute_flow ORDER BY scene ASC"
        ).fetchall()
    out = []
    for r in rows:
        caps = r["step_token_caps"]
        flags = r["force_validate_flags"]
        try:
            skill_ids = json.loads(r["skill_ids"] or "[]")
        except Exception:
            skill_ids = []
        try:
            force_flags = json.loads(flags) if flags else []
        except Exception:
            force_flags = []
        try:
            token_caps = json.loads(caps) if caps else []
        except Exception:
            token_caps = []
        out.append(
            {
                "id": int(r["id"]),
                "scene": r["scene"],
                "skillIds": skill_ids,
                "forceValidateFlags": force_flags,
                "stepTokenCaps": token_caps,
                "failStrategy": r["fail_strategy"] or "retry_step",
                "enabled": bool(int(r["enabled"] or 0)),
            }
        )
    return out


def upsert_flow(
    *,
    scene: str,
    skill_ids: list[int],
    fail_strategy: str | None = None,
    enabled: bool | None = None,
    force_validate_flags: list[Any] | None = None,
    step_token_caps: list[Any] | None = None,
) -> dict[str, Any]:
    """Create/update execute flow for a scene. Skill prompts stay in design_skill rows."""
    ensure_design_catalog()
    scene_key = (scene or "").strip().lower()
    if scene_key not in ("website", "mobile", "image", "poster"):
        raise ValueError("invalid_scene")
    ids = [int(x) for x in (skill_ids or []) if int(x) > 0]
    now = time.time()
    with connect() as conn:
        # Drop unknown skill ids.
        if ids:
            existing = {
                int(r["id"])
                for r in conn.execute(
                    f"SELECT id FROM design_skill WHERE id IN ({','.join('?' * len(ids))})",
                    tuple(ids),
                ).fetchall()
            }
            ids = [i for i in ids if i in existing]
        row = conn.execute(
            "SELECT id FROM design_execute_flow WHERE scene=?",
            (scene_key,),
        ).fetchone()
        payload_ids = json.dumps(ids)
        flags_json = json.dumps(force_validate_flags if force_validate_flags is not None else [])
        caps_json = json.dumps(step_token_caps if step_token_caps is not None else [])
        strategy = (fail_strategy or "retry_step").strip() or "retry_step"
        en = 1 if (True if enabled is None else bool(enabled)) else 0
        if row:
            conn.execute(
                """
                UPDATE design_execute_flow
                SET skill_ids=?, force_validate_flags=?, step_token_caps=?,
                    fail_strategy=?, enabled=?, updated_at=?
                WHERE scene=?
                """,
                (payload_ids, flags_json, caps_json, strategy, en, now, scene_key),
            )
            fid = int(row["id"])
        else:
            cur = conn.execute(
                """
                INSERT INTO design_execute_flow (
                    scene, skill_ids, force_validate_flags, step_token_caps,
                    fail_strategy, enabled, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (scene_key, payload_ids, flags_json, caps_json, strategy, en, now, now),
            )
            fid = int(cur.lastrowid)
        conn.commit()
    for item in list_flows():
        if int(item["id"]) == fid or item["scene"] == scene_key:
            return item
    return {
        "id": fid,
        "scene": scene_key,
        "skillIds": ids,
        "forceValidateFlags": force_validate_flags or [],
        "stepTokenCaps": step_token_caps or [],
        "failStrategy": strategy,
        "enabled": bool(en),
    }


def _is_fail_status(status: str) -> bool:
    return (status or "").strip().lower() in ("failed", "error")


def _is_ok_status(status: str) -> bool:
    return (status or "").strip().lower() in ("done", "success", "completed", "succeeded")


def _parse_skill_ids_from_actual(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except Exception:
        return []
    out: list[int] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and item.get("skill_id") is not None:
                try:
                    out.append(int(item["skill_id"]))
                except Exception:
                    pass
    return out


def skill_metrics_summary() -> dict[str, Any]:
    """Aggregate from design_task for dashboard (best-effort)."""
    ensure_design_catalog()
    with connect() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM design_task").fetchone()
        failed = conn.execute(
            "SELECT COUNT(*) AS c FROM design_task WHERE status IN ('failed','error')"
        ).fetchone()
        ok = conn.execute(
            "SELECT COUNT(*) AS c FROM design_task WHERE status IN ('done','success','completed','succeeded')"
        ).fetchone()
        tokens = conn.execute(
            "SELECT COALESCE(SUM(total_tokens), 0) AS s FROM design_task"
        ).fetchone()
        recent = conn.execute(
            """
            SELECT id, scene, status, total_tokens, charged_credits, created_at, error_message
            FROM design_task
            ORDER BY created_at DESC
            LIMIT 50
            """
        ).fetchall()
        # Broader window for breakdowns
        rows = conn.execute(
            """
            SELECT scene, status, actual_models, total_tokens
            FROM design_task
            ORDER BY created_at DESC
            LIMIT 500
            """
        ).fetchall()
        # flow skill map by scene
        flow_rows = conn.execute(
            "SELECT scene, skill_ids FROM design_execute_flow WHERE enabled = 1"
        ).fetchall()

    flow_skills: dict[str, list[int]] = {}
    for fr in flow_rows:
        sc = str(fr["scene"] or "").strip().lower()
        try:
            ids = json.loads(fr["skill_ids"] or "[]")
        except Exception:
            ids = []
        flow_skills[sc] = [int(x) for x in ids if str(x).isdigit() or isinstance(x, int)]

    scene_stats: dict[str, dict[str, int]] = {}
    skill_stats: dict[int, dict[str, int]] = {}

    for r in rows:
        sc = str(r["scene"] or "unknown").strip().lower() or "unknown"
        st = str(r["status"] or "")
        ss = scene_stats.setdefault(sc, {"tasks": 0, "failed": 0, "succeeded": 0, "tokens": 0})
        ss["tasks"] += 1
        ss["tokens"] += int(r["total_tokens"] or 0)
        if _is_fail_status(st):
            ss["failed"] += 1
        elif _is_ok_status(st):
            ss["succeeded"] += 1

        sids = _parse_skill_ids_from_actual(r["actual_models"] if "actual_models" in r.keys() else None)
        if not sids:
            sids = flow_skills.get(sc) or []
        for sid in sids:
            sk = skill_stats.setdefault(sid, {"tasks": 0, "failed": 0, "succeeded": 0, "tokens": 0})
            sk["tasks"] += 1
            sk["tokens"] += int(r["total_tokens"] or 0)
            if _is_fail_status(st):
                sk["failed"] += 1
            elif _is_ok_status(st):
                sk["succeeded"] += 1

    skill_name = {int(s["id"]): str(s["name"]) for s in list_admin_skills()}
    by_scene = []
    for sc, s in sorted(scene_stats.items(), key=lambda x: -x[1]["failed"]):
        n = max(1, s["tasks"])
        by_scene.append(
            {
                "scene": sc,
                "tasks": s["tasks"],
                "failed": s["failed"],
                "succeeded": s["succeeded"],
                "tokens": s["tokens"],
                "failRate": round(s["failed"] / n, 4),
            }
        )
    by_skill = []
    for sid, s in sorted(skill_stats.items(), key=lambda x: -x[1]["failed"]):
        n = max(1, s["tasks"])
        by_skill.append(
            {
                "skillId": sid,
                "name": skill_name.get(sid) or str(sid),
                "tasks": s["tasks"],
                "failed": s["failed"],
                "succeeded": s["succeeded"],
                "tokens": s["tokens"],
                "failRate": round(s["failed"] / n, 4),
            }
        )

    try:
        rules_map = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    except Exception:
        rules_map = {}
    try:
        schedule_hours = float(rules_map.get("optimize.schedule_hours") or "24")
    except Exception:
        schedule_hours = 24.0
    try:
        last_auto = float(rules_map.get("optimize.last_auto_at") or "0")
    except Exception:
        last_auto = 0.0

    return {
        "totals": {
            "tasks": int((total or {}).get("c") or 0),
            "failed": int((failed or {}).get("c") or 0),
            "succeeded": int((ok or {}).get("c") or 0),
            "tokens": int((tokens or {}).get("s") or 0),
        },
        "byScene": by_scene,
        "bySkill": by_skill[:40],
        "optimize": {
            "scheduleHours": schedule_hours,
            "lastAutoAt": int(last_auto * 1000) if last_auto else None,
            "enabled": str(rules_map.get("optimize.schedule_enabled") or "1").strip() not in ("0", "false", "off"),
        },
        "recent": [
            {
                "id": r["id"],
                "scene": r["scene"],
                "status": r["status"],
                "tokens": int(r["total_tokens"] or 0),
                "credits": int(r["charged_credits"] or 0),
                "error": r["error_message"],
                "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
            }
            for r in recent
        ],
    }


def list_decision_logs(
    *,
    page: int = 1,
    page_size: int = 50,
    route: str | None = None,
    intent: str | None = None,
    status: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    """Admin query for persisted decision_log snapshots in design_task.meta_json."""
    ensure_design_catalog()
    page = max(1, int(page or 1))
    page_size = max(1, min(100, int(page_size or 50)))
    offset = (page - 1) * page_size

    where = [
        "meta_json IS NOT NULL",
        "TRIM(meta_json) != ''",
        "json_extract(meta_json, '$.decision_log') IS NOT NULL",
    ]
    params: list[Any] = []
    if status and status.strip():
        where.append("status = ?")
        params.append(status.strip())
    if q and q.strip():
        like = f"%{q.strip()}%"
        where.append("(id LIKE ? OR user_id LIKE ? OR prompt LIKE ?)")
        params.extend([like, like, like])
    route_filter = (route or "").strip().lower()
    if route_filter:
        where.append("lower(coalesce(json_extract(meta_json, '$.decision_log.route'), '')) = ?")
        params.append(route_filter)
    intent_filter = (intent or "").strip().lower()
    if intent_filter:
        where.append("lower(coalesce(json_extract(meta_json, '$.decision_log.intent'), '')) = ?")
        params.append(intent_filter)

    sql_where = " AND ".join(where)
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT id, user_id, scene, status, prompt, error_message, meta_json, created_at, updated_at
            FROM design_task
            WHERE {sql_where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, page_size, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM design_task WHERE {sql_where}",
            tuple(params),
        ).fetchone()

    items: list[dict[str, Any]] = []
    for r in rows:
        meta_raw = r["meta_json"] if "meta_json" in r.keys() else None
        meta: dict[str, Any] = {}
        if isinstance(meta_raw, str) and meta_raw.strip():
            try:
                parsed = json.loads(meta_raw)
                if isinstance(parsed, dict):
                    meta = parsed
            except Exception:
                meta = {}
        decision = meta.get("decision_log")
        if not isinstance(decision, dict):
            continue
        items.append(
            {
                "taskId": r["id"],
                "traceId": meta.get("trace_id") or decision.get("trace_id"),
                "userId": r["user_id"],
                "scene": r["scene"],
                "status": r["status"],
                "route": decision.get("route"),
                "intent": decision.get("intent"),
                "prompt": r["prompt"],
                "decisionLog": decision,
                "error": r["error_message"],
                "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
                "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
            }
        )

    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": int(total_row["c"]) if total_row is not None else 0,
    }

STAGE_RULE_DEFAULTS: dict[str, str] = {
    "precheck.task_tiers": "simple|medium|complex",
    # Tier → concrete catalog id (Admin 预检可改；Auto 按此路由，不写死单一模型)
    "precheck.model_threshold": (
        "simple->doubao-seed-2-1-turbo;"
        "medium->glm-5-2;"
        "complex->deepseek-v4-pro;"
        "else->doubao-seed-2-1-pro"
    ),
    "precheck.tier_thresholds": "medium_min=80;complex_min=280",
    "precheck.complex_keywords": "",
    "precheck.medium_keywords": "",
    "precheck.fallback_chain": (
        "deepseek-v4-pro|doubao-seed-2-1-pro|doubao-seed-2-1-turbo"
    ),
    # Multimodal image_url steps (美学参考 / 用户附图)
    "precheck.vision_model": "doubao-seed-2-1-pro",
    "precheck.block_rules": "empty_prompt;oversized_canvas;banned_words",
    "precheck.retry_policy": "max=2,backoff=1.5",
    "assets.catalog_note": "",
    "assets.image_default_model": "doubao-seedream-5-0-lite",
    "optimize.schedule_enabled": "1",
    "optimize.schedule_hours": "24",
    "optimize.last_auto_at": "0",
    "aesthetics.score_threshold": "0.72",
    # Wallet: LLM token → credits. User charge = ceil(tokens × markup / tokens_per_credit).
    "billing.token_markup": "1.2",
    "billing.tokens_per_credit": "1000",
    # Face copy for analysis skills (req_parse / 设计思考). Editable in Admin; not hardcoded scrub lists.
    "face.analysis": (
        "面向用户的需求分析只写正文：用户要什么、视觉/布局方向、要达成的效果。"
        "不要加「用户意图分析」「意图分析」等标题前缀。"
        "不要写用什么工具/协议/API/JSON/ops 实现，不要写怎么落笔画布的底层步骤。"
    ),
    # Tool-first agent loop (no fixed skill pipeline). Empty system → backend default.
    "execute.agent_rounds": "6",
    "execute.thinking": "0",
    "agent.loop.system": "",
    # Reply/thinking sanitize: one term per line (or comma). Empty → backend built-in list.
    "agent.reply.sanitize_terms": (
        "delete_frame\n"
        "delete_nodes\n"
        "create_svg\n"
        "create_icon\n"
        "create_shape\n"
        "create_text\n"
        "create_frame\n"
        "update_node\n"
        "update_frame\n"
        "ask_user\n"
        "get_scene_summary\n"
        "SCENE_NODES\n"
        "SCENE_FRAMES\n"
        "FOCUS_FRAME_ID\n"
        "focus_frame_id\n"
        "CANVAS_ID\n"
        "args.frameId\n"
        "args.nodeId\n"
        "op_key\n"
        "tool_ops"
    ),
    # Host-side: user phrases that mean destructive intent (confirm chips/ask are fixed in code).
    "agent.delete.danger_terms": (
        "删除\n"
        "删掉\n"
        "删了\n"
        "清空\n"
        "删画板\n"
        "删除画板\n"
        "delete\n"
        "remove"
    ),
    # Soft artboard policy for CREATE_MODE — edit under 全局规则 create.*. Placeholders: {scene} {suggested_name}
    "create.frame_name_by_scene": (
        "website=官网首页;mobile=App页面;poster=海报;image=插画;default=画板"
    ),
    "create.artboard_policy": (
        "ARTBOARD_POLICY (soft — follow USER_PROMPT, do not force):\n"
        "- scene={scene}. New full page / screen / website / App / poster → prefer create_frame first "
        "with a short name (suggested 「{suggested_name}」, or more specific like 「登录页」), "
        "then create_shape/create_text/create_icon inside that frame.\n"
        "- User clearly asks only to add one shape/rect/line/text/icon → do NOT create_frame; "
        "emit create_shape/create_text/… only.\n"
        "- Small chrome on an existing artboard → update/create children, no new frame."
    ),
}


# Dead keys removed from product (confirm chips/ask/patterns are host-fixed).
_OBSOLETE_GLOBAL_RULE_KEYS = frozenset(
    {
        "agent.delete.confirm_ask",
        "agent.delete.confirm_choices",
        "agent.delete.confirm_patterns",
    }
)


def ensure_stage_rules() -> None:
    """Idempotently insert stage rule keys if missing (no overwrite); drop obsolete keys."""
    global _STAGE_RULES_READY
    ensure_design_catalog()
    with _STAGE_RULES_LOCK:
        with connect() as conn:
            if not _STAGE_RULES_READY:
                merged_defaults = dict(STAGE_RULE_DEFAULTS)
                now = time.time()
                # One round-trip — never SELECT-per-key against remote MySQL.
                rows = conn.execute("SELECT rule_key FROM design_global_rule").fetchall()
                existing = {str(r["rule_key"]) for r in rows}
                for key, val in merged_defaults.items():
                    if key in existing:
                        continue
                    conn.execute(
                        "INSERT INTO design_global_rule (rule_key, rule_value, updated_at) VALUES (?, ?, ?)",
                        (key, val, now),
                    )
                _STAGE_RULES_READY = True
            # Always drop host-fixed leftovers (safe if already gone).
            for key in _OBSOLETE_GLOBAL_RULE_KEYS:
                conn.execute(
                    "DELETE FROM design_global_rule WHERE rule_key = ?",
                    (key,),
                )
            conn.commit()


def suggest_skill_optimize(skill_id: int) -> dict[str, Any]:
    """Heuristic suggestion from Skill + task metrics. Does not write config."""
    ensure_stage_rules()
    skill = get_skill(int(skill_id))
    if not skill:
        raise ValueError("skill not found")
    pub = _pub_skill(skill)
    flags: list[str] = []
    patch: dict[str, Any] = {}
    reasons: list[str] = []

    with connect() as conn:
        failed = conn.execute(
            "SELECT COUNT(*) AS c FROM design_task WHERE status IN ('failed','error')"
        ).fetchone()
        total = conn.execute("SELECT COUNT(*) AS c FROM design_task").fetchone()
        tokens = conn.execute(
            "SELECT COALESCE(SUM(total_tokens), 0) AS s FROM design_task"
        ).fetchone()

    fail_n = int((failed or {}).get("c") or 0)
    total_n = int((total or {}).get("c") or 0)
    token_n = int((tokens or {}).get("s") or 0)
    fail_rate = (fail_n / total_n) if total_n else 0.0

    if fail_rate > 0.2:
        flags.append("high_fail_rate")
        if pub["defaultModel"] != "deepseek":
            patch["defaultModel"] = "deepseek"
            reasons.append("switch model to deepseek for harder steps")
        if int(pub["maxRetries"]) < 3:
            patch["maxRetries"] = min(3, int(pub["maxRetries"]) + 1)
            reasons.append("bump maxRetries")
        if int(pub["sortWeight"]) > 10:
            patch["sortWeight"] = max(0, int(pub["sortWeight"]) - 10)
            reasons.append("lower priority while unstable")

    if token_n > 500000:
        flags.append("high_token_cost")
        if pub["defaultModel"] == "deepseek":
            patch["defaultModel"] = "doubao"
            reasons.append("prefer cheaper model when cost is high")
        if "all" in str(pub["scenes"]).split(","):
            patch["scenes"] = str(pub["category"] or "website")
            reasons.append("narrow scenes away from all")

    if not pub["enabled"]:
        flags.append("disabled")
        reasons.append("skill is disabled; enable only after review")

    if not patch:
        reasons.append("metrics look stable; optional tighten retries unchanged")
        patch["maxRetries"] = int(pub["maxRetries"])

    return {
        "skillId": int(skill_id),
        "rationale": "; ".join(reasons) if reasons else "no change",
        "patch": patch,
        "flags": flags,
    }


def _fp(kind: str, target_key: str, patch: dict[str, Any]) -> str:
    raw = json.dumps({"k": kind, "t": target_key, "p": patch}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _pub_optimize_patch(r: Any) -> dict[str, Any]:
    try:
        patch = json.loads(r["patch_json"] or "{}")
    except Exception:
        patch = {}
    try:
        flags = json.loads(r["flags_json"] or "[]")
    except Exception:
        flags = []
    return {
        "id": int(r["id"]),
        "kind": r["kind"],
        "targetKey": r["target_key"],
        "patch": patch if isinstance(patch, dict) else {},
        "rationale": r["rationale"] or "",
        "flags": flags if isinstance(flags, list) else [],
        "status": r["status"] or "pending",
        "fingerprint": r["fingerprint"],
        "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
        "appliedAt": int(float(r["applied_at"]) * 1000) if r["applied_at"] else None,
    }


def list_optimize_patches(*, status: str | None = "pending") -> list[dict[str, Any]]:
    ensure_design_catalog()
    with connect() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM design_optimize_patch WHERE status = ? ORDER BY id DESC LIMIT 100",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM design_optimize_patch ORDER BY id DESC LIMIT 100"
            ).fetchall()
    return [_pub_optimize_patch(r) for r in rows]


def _insert_pending_patch(
    *,
    kind: str,
    target_key: str,
    patch: dict[str, Any],
    rationale: str,
    flags: list[str],
) -> dict[str, Any] | None:
    if not patch:
        return None
    fp = _fp(kind, target_key, patch)
    now = time.time()
    with connect() as conn:
        exists = conn.execute(
            "SELECT id FROM design_optimize_patch WHERE fingerprint = ? AND status = 'pending'",
            (fp,),
        ).fetchone()
        if exists:
            return None
        cur = conn.execute(
            """
            INSERT INTO design_optimize_patch
              (kind, target_key, patch_json, rationale, flags_json, status, fingerprint, created_at, updated_at, applied_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
            """,
            (
                kind,
                target_key,
                json.dumps(patch, ensure_ascii=False),
                rationale,
                json.dumps(flags, ensure_ascii=False),
                fp,
                now,
                now,
            ),
        )
        conn.commit()
        rid = int(cur.lastrowid)
        row = conn.execute("SELECT * FROM design_optimize_patch WHERE id = ?", (rid,)).fetchone()
    return _pub_optimize_patch(row) if row else None


def generate_usage_optimize_patches(*, source: str = "manual") -> dict[str, Any]:
    """Mine design_task metrics -> pending patches (never auto-applies)."""
    ensure_stage_rules()
    metrics = skill_metrics_summary()
    totals = metrics.get("totals") or {}
    tasks = int(totals.get("tasks") or 0)
    failed = int(totals.get("failed") or 0)
    tokens = int(totals.get("tokens") or 0)
    fail_rate = (failed / tasks) if tasks else 0.0
    created: list[dict[str, Any]] = []
    skipped = 0
    by_scene = list(metrics.get("byScene") or [])
    by_skill = list(metrics.get("bySkill") or [])

    if tasks < 5:
        return {
            "created": [],
            "skipped": 0,
            "message": "not_enough_tasks",
            "source": source,
            "metrics": {
                "tasks": tasks,
                "failed": failed,
                "failRate": fail_rate,
                "tokens": tokens,
                "byScene": by_scene,
                "bySkill": by_skill,
            },
        }

    rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}

    # 1) Global high fail -> retry / fallback (still useful)
    if fail_rate >= 0.2:
        import re as _re

        retry_raw = rules.get("precheck.retry_policy") or "max=2,backoff=1.5"
        m = _re.search(r"max\s*=\s*(\d+)", retry_raw, _re.I)
        cur_max = int(m.group(1)) if m else 2
        if cur_max < 3:
            patch = {"ruleKey": "precheck.retry_policy", "ruleValue": f"max={cur_max + 1},backoff=1.5"}
            item = _insert_pending_patch(
                kind="rule",
                target_key="precheck.retry_policy",
                patch=patch,
                rationale=f"[{source}] global fail_rate={fail_rate:.0%} over {tasks} tasks; bump retry max {cur_max}->{cur_max+1}",
                flags=["high_fail_rate", "precheck", source],
            )
            if item:
                created.append(item)
            else:
                skipped += 1

        chain = [x.strip() for x in (rules.get("precheck.fallback_chain") or "").split("|") if x.strip()]
        strong = "deepseek-v4-flash"
        if chain and chain[0] != strong and strong in chain:
            new_chain = [strong] + [x for x in chain if x != strong]
            patch = {"ruleKey": "precheck.fallback_chain", "ruleValue": "|".join(new_chain)}
            item = _insert_pending_patch(
                kind="rule",
                target_key="precheck.fallback_chain",
                patch=patch,
                rationale=f"[{source}] global fail_rate={fail_rate:.0%}; put {strong} first in fallback chain",
                flags=["high_fail_rate", "fallback", source],
            )
            if item:
                created.append(item)
            else:
                skipped += 1

    # 2) Per-skill: only skills with enough samples AND elevated failRate
    skill_lookup = {int(s["id"]): s for s in list_admin_skills()}
    for row in by_skill:
        sid = int(row.get("skillId") or 0)
        sk = skill_lookup.get(sid)
        if not sk or not sk.get("enabled"):
            continue
        sk_tasks = int(row.get("tasks") or 0)
        sk_fail = float(row.get("failRate") or 0)
        if sk_tasks < 3 or sk_fail < 0.25:
            continue
        cat = str(sk.get("category") or "")
        sug = suggest_skill_optimize(sid)
        patch = {k: v for k, v in (sug.get("patch") or {}).items() if k in ("defaultModel", "maxRetries", "sortWeight", "scenes")}
        if not patch:
            # minimal safe bump for this skill alone
            retries = int(sk.get("maxRetries") or 2)
            if retries < 3:
                patch = {"maxRetries": retries + 1}
            else:
                continue
        item = _insert_pending_patch(
            kind="skill",
            target_key=str(sid),
            patch=patch,
            rationale=(
                f"[{source}] skill={sk.get('name')} fail_rate={sk_fail:.0%} "
                f"({int(row.get('failed') or 0)}/{sk_tasks}); {sug.get('rationale') or 'per-skill'}"
            ),
            flags=list(sug.get("flags") or []) + [f"skill:{cat}", "per_skill", source],
        )
        if item:
            created.append(item)
        else:
            skipped += 1

    # 3) Per-scene negative tighten
    for row in by_scene:
        sc = str(row.get("scene") or "")
        n = int(row.get("tasks") or 0)
        rate = float(row.get("failRate") or 0)
        if n < 5 or sc in ("unknown", "") or rate < 0.35:
            continue
        cur = (rules.get(key) or "").strip()
        addon = "Avoid overcrowded composition; keep hierarchy clear; respect safe margins."
        if addon in cur:
            skipped += 1
            continue
        new_val = (cur + " " + addon).strip() if cur else addon
        item = _insert_pending_patch(
            kind="rule",
            target_key=key,
            patch={"ruleKey": key, "ruleValue": new_val},
            rationale=f"[{source}] scene={sc} fail_rate={rate:.0%} ({int(row.get('failed') or 0)}/{n}); tighten negative_global",
            flags=["scene_fail", sc, "per_scene", source],
        )
        if item:
            created.append(item)
        else:
            skipped += 1

    if source == "schedule":
        upsert_global_rule(rule_key="optimize.last_auto_at", rule_value=str(time.time()))

    return {
        "created": created,
        "skipped": skipped,
        "message": "ok",
        "source": source,
        "metrics": {
            "tasks": tasks,
            "failed": failed,
            "failRate": fail_rate,
            "tokens": tokens,
            "byScene": by_scene,
            "bySkill": by_skill,
        },
    }


def start_usage_optimize_scheduler() -> None:
    """Daemon thread: periodically mine usage into pending patches."""
    import logging
    import threading

    log = logging.getLogger("usage-optimize")

    def _loop() -> None:
        # first check shortly after boot
        time.sleep(45)
        while True:
            try:
                ensure_stage_rules()
                rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
                enabled = str(rules.get("optimize.schedule_enabled") or "1").strip().lower() not in (
                    "0",
                    "false",
                    "off",
                    "no",
                )
                try:
                    hours = float(rules.get("optimize.schedule_hours") or "24")
                except Exception:
                    hours = 24.0
                hours = max(1.0, min(168.0, hours))
                try:
                    last = float(rules.get("optimize.last_auto_at") or "0")
                except Exception:
                    last = 0.0
                if enabled and (time.time() - last) >= hours * 3600:
                    result = generate_usage_optimize_patches(source="schedule")
                    log.info(
                        "usage optimize schedule: message=%s created=%s",
                        result.get("message"),
                        len(result.get("created") or []),
                    )
            except Exception:
                log.exception("usage optimize schedule failed")
            time.sleep(3600)

    threading.Thread(target=_loop, name="usage-optimize", daemon=True).start()



def apply_optimize_patch(patch_id: int) -> dict[str, Any]:
    ensure_design_catalog()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM design_optimize_patch WHERE id = ?",
            (int(patch_id),),
        ).fetchone()
    if not row:
        raise ValueError("patch not found")
    if (row["status"] or "") != "pending":
        raise ValueError("patch not pending")
    pub = _pub_optimize_patch(row)
    kind = pub["kind"]
    patch = pub["patch"]
    if kind == "skill":
        skill_id = int(pub["targetKey"])
        skill = get_skill(skill_id)
        if not skill:
            raise ValueError("skill not found")
        body = _pub_skill(skill)
        body.update(patch)
        body["id"] = skill_id
        upsert_skill(body)
    elif kind == "rule":
        rk = str(patch.get("ruleKey") or pub["targetKey"])
        rv = str(patch.get("ruleValue") or "")
        upsert_global_rule(rule_key=rk, rule_value=rv)
    else:
        raise ValueError("unknown patch kind")
    now = time.time()
    with connect() as conn:
        conn.execute(
            "UPDATE design_optimize_patch SET status = 'applied', updated_at = ?, applied_at = ? WHERE id = ?",
            (now, now, int(patch_id)),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM design_optimize_patch WHERE id = ?", (int(patch_id),)).fetchone()
    return _pub_optimize_patch(row)


def dismiss_optimize_patch(patch_id: int) -> dict[str, Any]:
    ensure_design_catalog()
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM design_optimize_patch WHERE id = ?",
            (int(patch_id),),
        ).fetchone()
        if not row:
            raise ValueError("patch not found")
        if (row["status"] or "") != "pending":
            raise ValueError("patch not pending")
        conn.execute(
            "UPDATE design_optimize_patch SET status = 'dismissed', updated_at = ? WHERE id = ?",
            (now, int(patch_id)),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM design_optimize_patch WHERE id = ?", (int(patch_id),)).fetchone()
    return _pub_optimize_patch(row)

