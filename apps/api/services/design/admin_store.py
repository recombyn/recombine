"""Admin CRUD for design pipeline catalog (skills / rules / flows).

Private to admin — open-source builds omit this module + recombyn-admin.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import uuid
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


def _rule_row_out(r: Any) -> dict[str, Any]:
    desc = ""
    try:
        desc = str(r["description"] or "") if "description" in r.keys() else ""
    except Exception:
        desc = ""
    enabled = 1
    try:
        if "enabled" in r.keys() and r["enabled"] is not None:
            enabled = 1 if int(r["enabled"]) else 0
    except Exception:
        enabled = 1
    return {
        "id": int(r["id"]),
        "ruleKey": r["rule_key"],
        "ruleValue": r["rule_value"],
        "description": desc,
        "enabled": bool(enabled),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def list_global_rules() -> list[dict[str, Any]]:
    ensure_design_catalog()
    ensure_stage_rules()
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM design_global_rule ORDER BY rule_key ASC"
        ).fetchall()
    # Hide internal/ops markers from Admin table (still in DB when needed).
    hide_prefixes = ("legacy.agent_zero_",)
    hide_exact = frozenset(
        {
            "content_pack_version",
            "optimize.last_auto_at",
        }
    )
    return [
        _rule_row_out(r)
        for r in rows
        if not str(r["rule_key"] or "").startswith(hide_prefixes)
        and str(r["rule_key"] or "") not in hide_exact
    ]


def upsert_global_rule(
    *,
    rule_key: str,
    rule_value: str,
    description: str | None = None,
    enabled: bool | None = None,
) -> dict[str, Any]:
    ensure_design_catalog()
    key = (rule_key or "").strip()
    if not key:
        raise ValueError("ruleKey required")
    val = rule_value if rule_value is not None else ""
    now = time.time()
    with connect() as conn:
        existing = conn.execute(
            "SELECT id, description, enabled FROM design_global_rule WHERE rule_key = ?",
            (key,),
        ).fetchone()
        if existing:
            next_desc = (
                str(description)
                if description is not None
                else str((existing["description"] if "description" in existing.keys() else "") or "")
            )
            if enabled is None:
                try:
                    next_en = 1 if int(existing["enabled"]) else 0
                except Exception:
                    next_en = 1
            else:
                next_en = 1 if enabled else 0
            conn.execute(
                """
                UPDATE design_global_rule
                SET rule_value = ?, description = ?, enabled = ?, updated_at = ?
                WHERE rule_key = ?
                """,
                (val, next_desc, next_en, now, key),
            )
        else:
            next_desc = str(description or "")
            next_en = 1 if (enabled is None or enabled) else 0
            conn.execute(
                """
                INSERT INTO design_global_rule
                    (rule_key, rule_value, description, enabled, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (key, val, next_desc, next_en, now),
            )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM design_global_rule WHERE rule_key = ?",
            (key,),
        ).fetchone()
    return _rule_row_out(row)


_AGENT_FLOW_RULE_KEY = "agent.flow.default_graph_json"
_AGENT_FLOW_PHASE_MAP_KEY = "agent.flow.phase_map_json"

_DEFAULT_ASK_CONFIG: dict[str, Any] = {
    "slots": ["goal", "brand", "copy", "constraints"],
    "neverAsk": ["canvas_size", "model_choice"],
    "maxQuestionsPerTurn": 1,
    "provideChoices": True,
    "allowInvent": False,
}


def _fresh_ask_config() -> dict[str, Any]:
    return {
        "slots": list(_DEFAULT_ASK_CONFIG["slots"]),
        "neverAsk": list(_DEFAULT_ASK_CONFIG["neverAsk"]),
        "maxQuestionsPerTurn": int(_DEFAULT_ASK_CONFIG["maxQuestionsPerTurn"]),
        "provideChoices": bool(_DEFAULT_ASK_CONFIG["provideChoices"]),
        "allowInvent": bool(_DEFAULT_ASK_CONFIG["allowInvent"]),
    }

_DEFAULT_AGENT_FLOW_GRAPH: dict[str, Any] = {
    "version": 1,
    "nodes": [
        {"id": "start", "label": "开始", "description": "", "kind": "start", "capability": "io", "phaseKey": "start", "x": 40, "y": 400},
        {"id": "route", "label": "任务分流", "description": "", "kind": "router", "capability": "control", "phaseKey": "route", "x": 320, "y": 400},
        {
            "id": "memory",
            "label": "注入会话记忆",
            "description": "",
            "kind": "resource",
            "capability": "knowledge",
            "phaseKey": "memory",
            "configRef": "design_knowledge",
            "inject": {"mode": "details", "source": "memory"},
            "x": 600,
            "y": 400,
        },
        {
            "id": "mode_fork",
            "label": "条件分支",
            "description": "",
            "kind": "if_else",
            "capability": "control",
            "phaseKey": "mode_fork",
            "x": 880,
            "y": 400,
        },
        # Ask 只是主线上多一步追问；够了再回到 Agent 主循环
        {
            "id": "ask_thought",
            "label": "人工介入",
            "description": "",
            "kind": "ask",
            "capability": "prompt",
            "phaseKey": "ask_thought",
            "promptKey": "agent.prompt.ask_system",
            "inject": {"mode": "none", "specs": ["agent.prompt.ask_system"], "validate": ["json_contract"]},
            "askConfig": _fresh_ask_config(),
            "x": 1160,
            "y": 640,
        },
        {
            "id": "clarify",
            "label": "人工介入",
            "description": "",
            "kind": "ask",
            "capability": "prompt",
            "phaseKey": "clarify",
            "promptKey": "agent.prompt.ask_system",
            "inject": {"mode": "none", "specs": ["agent.prompt.ask_system"]},
            "askConfig": _fresh_ask_config(),
            "x": 1440,
            "y": 640,
        },
        {
            "id": "propose",
            "label": "人工介入",
            "description": "",
            "kind": "ask",
            "capability": "prompt",
            "phaseKey": "propose",
            "promptKey": "agent.prompt.ask_system",
            "inject": {"mode": "none", "specs": ["agent.prompt.ask_system"]},
            "askConfig": _fresh_ask_config(),
            "x": 1440,
            "y": 800,
        },
        # —— Agent 主循环（Ask / Agent 共用）——
        {"id": "plan", "label": "LLM", "description": "", "kind": "llm", "capability": "prompt", "phaseKey": "plan", "promptKey": "agent.prompt.plan_system", "inject": {"mode": "none", "specs": ["agent.prompt.plan_system"]}, "x": 1160, "y": 200},
        {"id": "model_route", "label": "模型路由", "description": "", "kind": "classifier", "capability": "model_route", "phaseKey": "model_route", "configRef": "precheck.model_threshold", "x": 1440, "y": 400},
        {"id": "thought", "label": "LLM", "description": "", "kind": "llm", "capability": "prompt", "phaseKey": "thought", "promptKey": "agent.prompt.react_system", "configRef": "models+routes", "inject": {"mode": "catalog", "catalogs": ["canvas_tools", "knowledge", "aesthetics"], "deferDetails": True, "specs": ["agent.prompt.react_system"], "validate": ["json_contract"]}, "x": 1720, "y": 400},
        {"id": "resource_fork", "label": "并行网关", "description": "", "kind": "parallel", "capability": "control", "phaseKey": "resource_fork", "x": 2000, "y": 400},
        {"id": "need_knowledge", "label": "知识检索", "description": "", "kind": "resource", "capability": "knowledge", "phaseKey": "need_knowledge", "configRef": "design_knowledge", "inject": {"mode": "catalog", "source": "knowledge"}, "x": 2000, "y": 160},
        {"id": "need_aesthetics", "label": "知识检索", "description": "", "kind": "resource", "capability": "aesthetics", "phaseKey": "need_aesthetics", "configRef": "quality_samples", "inject": {"mode": "catalog", "source": "aesthetics"}, "x": 2000, "y": 280},
        {"id": "need_tools", "label": "Agent", "description": "", "kind": "resource", "capability": "canvas_tools", "phaseKey": "need_tools", "configRef": "canvas_tools", "inject": {"mode": "catalog", "source": "canvas_tools"}, "x": 2000, "y": 520},
        {"id": "knowledge_details", "label": "知识检索", "description": "", "kind": "resource", "capability": "knowledge", "phaseKey": "knowledge_details", "configRef": "design_knowledge", "inject": {"mode": "details", "source": "knowledge"}, "x": 2280, "y": 160},
        {"id": "aesthetics_details", "label": "知识检索", "description": "", "kind": "resource", "capability": "aesthetics", "phaseKey": "aesthetics_details", "configRef": "quality_samples", "inject": {"mode": "details", "source": "aesthetics", "specs": ["aesthetics.prompt.vision_structure", "aesthetics.vision.structure_schema"]}, "x": 2280, "y": 280},
        {"id": "tool_details", "label": "Agent", "description": "", "kind": "resource", "capability": "canvas_tools", "phaseKey": "tool_details", "configRef": "canvas_tools", "inject": {"mode": "details", "source": "canvas_tools", "validate": ["tool_args_schema"]}, "x": 2280, "y": 520},
        {"id": "resource_join", "label": "汇聚", "description": "", "kind": "join", "capability": "control", "phaseKey": "resource_join", "joinMode": "and", "x": 2560, "y": 400},
        {"id": "dual_sample", "label": "LLM", "description": "", "kind": "llm", "capability": "prompt", "phaseKey": "dual_sample", "promptKey": "agent.prompt.react_system", "inject": {"mode": "catalog", "catalogs": ["canvas_tools", "knowledge", "aesthetics"], "deferDetails": True}, "x": 1720, "y": 640},
        {"id": "validate_fail", "label": "条件分支", "description": "", "kind": "guard", "capability": "control", "phaseKey": "validate_fail", "inject": {"mode": "none", "validate": ["validate.checklist", "svg_markup"]}, "x": 1720, "y": 800},
        {"id": "reflect", "label": "循环", "description": "", "kind": "loop", "capability": "control", "phaseKey": "reflect", "x": 2000, "y": 800},
        {"id": "hydrate", "label": "代码执行", "description": "", "kind": "tool", "capability": "canvas_tools", "phaseKey": "hydrate", "configRef": "assets.image_default_model", "inject": {"mode": "none", "validate": ["create_image.genPrompt"]}, "x": 1720, "y": 960},
        {"id": "action", "label": "代码执行", "description": "", "kind": "tool", "capability": "canvas_tools", "phaseKey": "action", "configRef": "canvas_tools", "inject": {"mode": "details", "source": "canvas_tools", "validate": ["svg_markup", "tool_args_schema", "validate.checklist"]}, "x": 2000, "y": 960},
        {"id": "observe", "label": "输出", "description": "", "kind": "observe", "capability": "io", "phaseKey": "observe", "x": 2280, "y": 960},
        {"id": "error", "label": "错误结束", "description": "", "kind": "error", "capability": "control", "phaseKey": "error", "x": 2280, "y": 800},
        {"id": "end", "label": "结束", "description": "", "kind": "end", "capability": "control", "phaseKey": "end", "x": 2560, "y": 960},
    ],
    "edges": [
        {"id": "e0", "source": "start", "target": "route", "label": "", "condition": "", "priority": 100, "isDefault": True},
        {"id": "e0a", "source": "route", "target": "memory", "label": "", "condition": "", "priority": 10, "isDefault": True},
        {"id": "e0b", "source": "memory", "target": "mode_fork", "label": "", "condition": "", "priority": 10, "isDefault": True},
        # Ask 模式优先于短计划（FE interaction_mode=ask → flags.mode=ask）
        {"id": "e_mode_ask", "source": "mode_fork", "target": "ask_thought", "label": "Ask 模式", "condition": "mode=ask", "priority": 5, "isDefault": False},
        {"id": "e_mode_agent_plan", "source": "mode_fork", "target": "plan", "label": "开启短计划", "condition": "short_plan_on", "priority": 10, "isDefault": False},
        # Agent 主线默认
        {"id": "e_mode_agent", "source": "mode_fork", "target": "model_route", "label": "Agent 主线", "condition": "mode=agent", "priority": 20, "isDefault": True},
        {"id": "e_ask_insuff", "source": "ask_thought", "target": "clarify", "label": "信息不足", "condition": "info_insufficient", "priority": 10, "isDefault": False},
        {"id": "e_ask_intent", "source": "ask_thought", "target": "clarify", "label": "意图=追问", "condition": "intent=ask", "priority": 15, "isDefault": False},
        {"id": "e_ask_propose", "source": "ask_thought", "target": "propose", "label": "Ask 提议案", "condition": "ask_mode_ops", "priority": 8, "isDefault": False},
        {"id": "e_ask_enough", "source": "ask_thought", "target": "model_route", "label": "信息足够", "condition": "info_enough", "priority": 20, "isDefault": True},
        {"id": "e_clarify_wait", "source": "clarify", "target": "end", "label": "等待用户回答", "condition": "await_user", "priority": 10, "isDefault": True},
        {"id": "e_propose_wait", "source": "propose", "target": "end", "label": "等待用户确认", "condition": "await_confirm", "priority": 10, "isDefault": True},
        # Agent 主循环
        {"id": "e4", "source": "plan", "target": "model_route", "label": "计划完成", "condition": "plan_done", "priority": 10, "isDefault": True},
        # 分档/看图/多模态都在 model_route 节点内配置，不拆成多个 LLM 节点
        {"id": "e5", "source": "model_route", "target": "thought", "label": "调用主模型", "condition": "llm_call", "priority": 10, "isDefault": True},
        {"id": "e6", "source": "thought", "target": "resource_fork", "label": "需要资源", "condition": "need_resources", "priority": 10, "isDefault": False},
        {"id": "e6a", "source": "resource_fork", "target": "need_knowledge", "label": "需要知识", "condition": "need_knowledge", "priority": 10, "isDefault": False},
        {"id": "e6b", "source": "resource_fork", "target": "need_aesthetics", "label": "需要美学", "condition": "need_aesthetics", "priority": 20, "isDefault": False},
        {"id": "e6c", "source": "resource_fork", "target": "need_tools", "label": "需要工具", "condition": "need_tools", "priority": 30, "isDefault": False},
        {"id": "e9", "source": "need_knowledge", "target": "knowledge_details", "label": "已拉取", "condition": "fetched", "priority": 10, "isDefault": True},
        {"id": "e10", "source": "need_aesthetics", "target": "aesthetics_details", "label": "已拉取", "condition": "fetched", "priority": 10, "isDefault": True},
        {"id": "e11", "source": "need_tools", "target": "tool_details", "label": "已拉取", "condition": "fetched", "priority": 10, "isDefault": True},
        {"id": "e12", "source": "knowledge_details", "target": "resource_join", "label": "资源就绪", "condition": "ready", "priority": 10, "isDefault": True},
        {"id": "e13", "source": "aesthetics_details", "target": "resource_join", "label": "资源就绪", "condition": "ready", "priority": 10, "isDefault": True},
        {"id": "e14", "source": "tool_details", "target": "resource_join", "label": "资源就绪", "condition": "ready", "priority": 10, "isDefault": True},
        {"id": "e14b", "source": "resource_join", "target": "thought", "label": "下一轮思考", "condition": "next_round", "priority": 10, "isDefault": True},
        {"id": "e15", "source": "thought", "target": "dual_sample", "label": "开启双采样", "condition": "dual_on", "priority": 20, "isDefault": False},
        {"id": "e16", "source": "thought", "target": "validate_fail", "label": "操作非法", "condition": "ops_invalid", "priority": 30, "isDefault": False},
        {"id": "e17", "source": "validate_fail", "target": "reflect", "label": "仍可反思", "condition": "reflect_left", "priority": 10, "isDefault": False},
        {"id": "e18", "source": "validate_fail", "target": "clarify", "label": "不可再反思", "condition": "no_reflect", "priority": 100, "isDefault": True},
        {"id": "e19", "source": "thought", "target": "clarify", "label": "意图=追问", "condition": "intent=ask", "priority": 40, "isDefault": False},
        {"id": "e19b", "source": "thought", "target": "end", "label": "闲聊结束", "condition": "intent=chat", "priority": 42, "isDefault": False},
        {"id": "e19c", "source": "thought", "target": "end", "label": "完成结束", "condition": "intent=done", "priority": 43, "isDefault": False},
        {"id": "e20", "source": "thought", "target": "propose", "label": "Ask 提议案", "condition": "ask_mode_ops", "priority": 50, "isDefault": False},
        {"id": "e21", "source": "thought", "target": "hydrate", "label": "操作合法", "condition": "ops_valid", "priority": 60, "isDefault": False},
        {"id": "e22", "source": "dual_sample", "target": "hydrate", "label": "选最优采样", "condition": "pick_best", "priority": 10, "isDefault": True},
        {"id": "e23", "source": "hydrate", "target": "action", "label": "执行工具", "condition": "tool_ops", "priority": 10, "isDefault": True},
        {"id": "e24", "source": "action", "target": "observe", "label": "等待场景", "condition": "wait_scene", "priority": 10, "isDefault": True},
        {"id": "e25", "source": "observe", "target": "end", "label": "成功结束", "condition": "ok", "priority": 10, "isDefault": True},
        {"id": "e26", "source": "observe", "target": "reflect", "label": "操作失败", "condition": "op_failed", "priority": 20, "isDefault": False},
        {"id": "e27", "source": "reflect", "target": "thought", "label": "重试思考", "condition": "retry", "priority": 10, "isDefault": True},
        {"id": "e30", "source": "reflect", "target": "error", "label": "反思耗尽", "condition": "reflect_exhausted", "priority": 20, "isDefault": False},
        {"id": "e31", "source": "thought", "target": "error", "label": "致命错误", "condition": "fatal", "priority": 90, "isDefault": False},
        {"id": "e32", "source": "error", "target": "end", "label": "失败结束", "condition": "fail_end", "priority": 10, "isDefault": True},
    ],
}

_DEFAULT_AGENT_PHASE_MAP: dict[str, str] = {
    "start": "start",
    "route": "route",
    "mode_fork": "mode_fork",
    "memory": "memory",
    "plan": "plan",
    "model_route": "model_route",
    "model_switch": "model_route",
    "thought": "thought",
    "ask_thought": "ask_thought",
    "resource_fork": "resource_fork",
    "need_knowledge": "need_knowledge",
    "knowledge_details": "knowledge_details",
    "need_aesthetics": "need_aesthetics",
    "aesthetics_details": "aesthetics_details",
    "need_tools": "need_tools",
    "tool_details": "tool_details",
    "resource_join": "resource_join",
    "dual_sample": "dual_sample",
    "validate_fail": "validate_fail",
    "reflect": "reflect",
    "clarify": "clarify",
    "chat": "clarify",
    "propose": "propose",
    "hydrate": "hydrate",
    "action": "action",
    "observe": "observe",
    "error": "error",
    "end": "end",
}


def get_agent_flow_config() -> dict[str, Any]:
    """Fetch Admin editable agent flow graph + phase map from global rules."""
    ensure_stage_rules()
    rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    graph_raw = str(rules.get(_AGENT_FLOW_RULE_KEY) or "").strip()
    phase_raw = str(rules.get(_AGENT_FLOW_PHASE_MAP_KEY) or "").strip()
    graph: dict[str, Any]
    phase_map: dict[str, str]
    try:
        parsed = json.loads(graph_raw) if graph_raw else {}
        graph = parsed if isinstance(parsed, dict) else {}
    except Exception:
        graph = {}
    try:
        parsed = json.loads(phase_raw) if phase_raw else {}
        phase_map = (
            {str(k): str(v) for k, v in parsed.items()}
            if isinstance(parsed, dict)
            else {}
        )
    except Exception:
        phase_map = {}
    if not graph:
        graph = json.loads(json.dumps(_DEFAULT_AGENT_FLOW_GRAPH, ensure_ascii=False))
    if not phase_map:
        phase_map = dict(_DEFAULT_AGENT_PHASE_MAP)
    graph, _changed = _normalize_agent_flow_graph(graph)
    if "start" not in phase_map:
        phase_map = {**phase_map, "start": "start"}
    if "end" not in phase_map:
        phase_map = {**phase_map, "end": "end"}
    return {"graph": graph, "phaseMap": phase_map}


def upsert_agent_flow_config(*, graph: dict[str, Any], phase_map: dict[str, str]) -> dict[str, Any]:
    """Persist Admin flow definition into design_global_rule."""
    ensure_stage_rules()
    if not isinstance(graph, dict):
        raise ValueError("graph must be object")
    if not isinstance(phase_map, dict):
        raise ValueError("phaseMap must be object")
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("graph must include nodes[] and edges[]")
    cleaned_phase_map = {
        str(k).strip(): str(v).strip()
        for k, v in phase_map.items()
        if str(k).strip() and str(v).strip()
    }
    upsert_global_rule(
        rule_key=_AGENT_FLOW_RULE_KEY,
        rule_value=json.dumps(graph, ensure_ascii=False),
        description="Agent 默认流程图（Admin 流程设计）",
    )
    upsert_global_rule(
        rule_key=_AGENT_FLOW_PHASE_MAP_KEY,
        rule_value=json.dumps(cleaned_phase_map, ensure_ascii=False),
        description="execution_log.phase 到流程节点映射",
    )
    # Keep catalog default flow in sync.
    try:
        item = get_agent_flow("default")
        if item:
            update_agent_flow(
                "default",
                name=str(item.get("name") or "默认 Agent 流程"),
                description=str(item.get("description") or ""),
                graph=graph,
                phase_map=cleaned_phase_map,
            )
    except Exception:
        pass
    return {"graph": graph, "phaseMap": cleaned_phase_map}


_AGENT_FLOWS_CATALOG_KEY = "agent.flows.catalog_json"


def _new_flow_id() -> str:
    return f"flow_{uuid.uuid4().hex[:12]}"


def _empty_graph() -> dict[str, Any]:
    return {"version": 1, "nodes": [], "edges": []}


def _normalize_agent_flow_graph(graph: dict[str, Any] | None) -> tuple[dict[str, Any], bool]:
    """Ensure start exists and orphan error exit is wired. Returns (graph, changed)."""
    raw = graph if isinstance(graph, dict) else _empty_graph()
    nodes = [n for n in (raw.get("nodes") or []) if isinstance(n, dict) and n.get("id")]
    edges = [e for e in (raw.get("edges") or []) if isinstance(e, dict)]
    if not nodes:
        return {"version": int(raw.get("version") or 1), "nodes": [], "edges": []}, False

    changed = False
    ids = {str(n.get("id")) for n in nodes}
    has_start = any(
        str(n.get("kind") or "").lower() == "start" or str(n.get("id")) == "start" for n in nodes
    )

    if not has_start:
        # Prefer linking into existing route entry; else first node without inbound.
        inbound = {str(e.get("target") or "") for e in edges}
        target = "route" if "route" in ids else next(
            (str(n.get("id")) for n in nodes if str(n.get("id")) not in inbound),
            str(nodes[0].get("id")),
        )
        anchor = next((n for n in nodes if str(n.get("id")) == target), nodes[0])
        start_node = {
            "id": "start",
            "label": "开始",
            "description": "流程入口",
            "kind": "start",
            "capability": "control",
            "phaseKey": "start",
            "x": float(anchor.get("x") or 0) - 320,
            "y": float(anchor.get("y") or 0),
        }
        # Avoid id clash if somehow present without kind=start.
        if "start" in ids:
            start_node["id"] = "flow_start"
        nodes = [start_node, *nodes]
        edges = [
            {
                "id": "e_start",
                "source": str(start_node["id"]),
                "target": target,
                "label": "",
            },
            *edges,
        ]
        changed = True
        ids.add(str(start_node["id"]))

    # Wire orphan error exit: needs inbound + outbound to end when possible.
    if "error" in ids:
        for n in nodes:
            if str(n.get("id")) != "error":
                continue
            if str(n.get("kind") or "").lower() == "error" and str(n.get("label") or "") in {
                "",
                "结束",
            }:
                n["label"] = "错误结束"
                n["description"] = str(n.get("description") or "错误出口")
                changed = True
            break
        has_in = any(str(e.get("target") or "") == "error" for e in edges)
        has_out = any(str(e.get("source") or "") == "error" for e in edges)
        edge_ids = {str(e.get("id") or "") for e in edges}
        if not has_in:
            src = "reflect" if "reflect" in ids else ("thought" if "thought" in ids else None)
            if src:
                eid = "e_to_error"
                n = 0
                while eid in edge_ids:
                    n += 1
                    eid = f"e_to_error_{n}"
                edges.append(
                    {"id": eid, "source": src, "target": "error", "label": "fatal"}
                )
                edge_ids.add(eid)
                changed = True
        if not has_out and "end" in ids:
            eid = "e_error_end"
            n = 0
            while eid in edge_ids:
                n += 1
                eid = f"e_error_end_{n}"
            edges.append({"id": eid, "source": "error", "target": "end", "label": "fail_end"})
            changed = True

    # Reflect runtime `_gather_deferred_resource_details`: fan-out need_* in parallel, then join.
    edge_ids = {str(e.get("id") or "") for e in edges}
    need_ids = [x for x in ("need_knowledge", "need_aesthetics", "need_tools") if x in ids]
    detail_ids = [
        x
        for x in ("knowledge_details", "aesthetics_details", "tool_details")
        if x in ids
    ]
    if (
        "thought" in ids
        and len(need_ids) >= 2
        and "resource_fork" not in ids
        and "resource_join" not in ids
    ):
        thought_n = next(n for n in nodes if str(n.get("id")) == "thought")
        tx = float(thought_n.get("x") or 1000)
        ty = float(thought_n.get("y") or 280)
        nodes.extend(
            [
                {
                    "id": "resource_fork",
                    "label": "并行网关",
                    "description": "并行拉取知识/美学/工具",
                    "kind": "parallel",
                    "capability": "control",
                    "phaseKey": "",
                    "x": tx + 240,
                    "y": ty,
                },
                {
                    "id": "resource_join",
                    "label": "汇聚",
                    "description": "资源就绪后回到思考",
                    "kind": "join",
                    "capability": "control",
                    "phaseKey": "",
                    "joinMode": "and",
                    "x": tx + 960,
                    "y": ty,
                },
            ]
        )
        # Park need_* / details in a clean parallel lane to the right of thought.
        lane = {
            "need_knowledge": (tx + 480, ty - 240),
            "need_aesthetics": (tx + 480, ty - 80),
            "need_tools": (tx + 480, ty + 80),
            "knowledge_details": (tx + 720, ty - 240),
            "aesthetics_details": (tx + 720, ty - 80),
            "tool_details": (tx + 720, ty + 80),
        }
        for n in nodes:
            pos = lane.get(str(n.get("id") or ""))
            if not pos:
                continue
            n["x"], n["y"] = pos
        ids.add("resource_fork")
        ids.add("resource_join")
        # Drop direct thought → need_* and details → thought; rewire via fork/join.
        edges = [
            e
            for e in edges
            if not (
                str(e.get("source") or "") == "thought"
                and str(e.get("target") or "") in set(need_ids)
            )
            and not (
                str(e.get("source") or "") in set(detail_ids)
                and str(e.get("target") or "") == "thought"
            )
        ]
        edge_ids = {str(e.get("id") or "") for e in edges}

        def _add_edge(eid: str, source: str, target: str, label: str, *, is_default: bool = False, priority: int = 10) -> None:
            nonlocal edges, edge_ids
            name = eid
            n = 0
            while name in edge_ids:
                n += 1
                name = f"{eid}_{n}"
            edges.append(
                {
                    "id": name,
                    "source": source,
                    "target": target,
                    "label": label,
                    "condition": label,
                    "priority": priority,
                    "isDefault": is_default,
                }
            )
            edge_ids.add(name)

        _add_edge("e_res_fork", "thought", "resource_fork", "need_resources")
        for nid in need_ids:
            _add_edge(f"e_fork_{nid}", "resource_fork", nid, nid)
        for did in detail_ids:
            _add_edge(f"e_join_{did}", did, "resource_join", "ready", is_default=True)
        _add_edge("e_res_join", "resource_join", "thought", "next_round", is_default=True)
        changed = True

    # Migrate legacy label-only edges → schedule fields; default joinMode on joins.
    for e in edges:
        cond = e.get("condition")
        label = str(e.get("label") or "").strip()
        if cond is None or str(cond).strip() == "":
            if label:
                e["condition"] = label
                changed = True
            elif "condition" not in e:
                e["condition"] = ""
                changed = True
        if "priority" not in e:
            e["priority"] = 100
            changed = True
        if "isDefault" not in e:
            cond_s = str(e.get("condition") or label).strip().lower()
            e["isDefault"] = cond_s in {"default", "else", "*"}
            changed = True
    for n in nodes:
        if str(n.get("kind") or "").lower() != "join":
            continue
        if str(n.get("joinMode") or "").lower() not in {"and", "or"}:
            n["joinMode"] = "and"
            changed = True

    # Seed inject bindings for known phases when missing.
    try:
        from services.design.flow_runtime import default_inject_for_node, normalize_inject

        for n in nodes:
            existing = n.get("inject")
            if isinstance(existing, dict) and existing:
                cleaned = normalize_inject(existing)
                if cleaned != existing:
                    n["inject"] = cleaned
                    changed = True
            else:
                seeded = default_inject_for_node(n)
                if seeded:
                    n["inject"] = seeded
                    changed = True
            # Ask 追问清单
            pk = str(n.get("phaseKey") or n.get("id") or "")
            kind = str(n.get("kind") or "").lower()
            needs_ask = pk in {"clarify", "propose", "ask_thought"} or kind in {"ask", "human"}
            if needs_ask and not (isinstance(n.get("askConfig"), dict) and n.get("askConfig")):
                n["askConfig"] = _fresh_ask_config()
                changed = True
    except Exception:
        pass

    # Ask is a skippable step on the shared agent pipeline (not a separate lane).
    ids = {str(n.get("id")) for n in nodes}
    if "memory" in ids and "model_route" in ids:
        mem_n = next(n for n in nodes if str(n.get("id")) == "memory")
        if "mode_fork" not in ids:
            nodes.append(
                {
                    "id": "mode_fork",
                    "label": "条件分支",
                    "description": "",
                    "kind": "if_else",
                    "capability": "control",
                    "phaseKey": "mode_fork",
                    "x": float(mem_n.get("x") or 520) + 240,
                    "y": float(mem_n.get("y") or 400),
                }
            )
            ids.add("mode_fork")
            changed = True
        if "ask_thought" not in ids:
            nodes.append(
                {
                    "id": "ask_thought",
                    "label": "人工介入",
                    "description": "",
                    "kind": "ask",
                    "capability": "prompt",
                    "phaseKey": "ask_thought",
                    "promptKey": "agent.prompt.ask_system",
                    "inject": {"mode": "none", "specs": ["agent.prompt.ask_system"]},
                    "askConfig": _fresh_ask_config(),
                    "x": float(mem_n.get("x") or 520) + 480,
                    "y": float(mem_n.get("y") or 400) + 240,
                }
            )
            ids.add("ask_thought")
            changed = True

        def _has_edge(src: str, tgt: str, cond: str = "") -> bool:
            for e in edges:
                if str(e.get("source") or "") != src or str(e.get("target") or "") != tgt:
                    continue
                if cond and str(e.get("condition") or "") != cond:
                    continue
                return True
            return False

        def _add_edge(
            eid: str,
            src: str,
            tgt: str,
            *,
            condition: str = "",
            priority: int = 10,
            is_default: bool = False,
        ) -> None:
            nonlocal changed
            if _has_edge(src, tgt, condition):
                return
            edges.append(
                {
                    "id": eid,
                    "source": src,
                    "target": tgt,
                    "label": "",
                    "condition": condition,
                    "priority": priority,
                    "isDefault": is_default,
                }
            )
            changed = True

        if "memory_ask" in ids:
            nodes[:] = [n for n in nodes if str(n.get("id")) != "memory_ask"]
            edges[:] = [
                e
                for e in edges
                if str(e.get("source") or "") != "memory_ask"
                and str(e.get("target") or "") != "memory_ask"
            ]
            ids.discard("memory_ask")
            changed = True

        before = len(edges)
        edges[:] = [
            e
            for e in edges
            if not (
                str(e.get("source") or "") == "mode_fork"
                and str(e.get("target") or "") == "memory"
            )
        ]
        if len(edges) != before:
            changed = True

        _add_edge("e_mem_fork", "memory", "mode_fork", is_default=True)
        # Migrate / ensure FE Ask mode edge (mode=ask), not intent=ask at fork time.
        migrated_mode_ask = False
        for e in edges:
            if str(e.get("source") or "") != "mode_fork":
                continue
            if str(e.get("target") or "") != "ask_thought":
                continue
            if str(e.get("condition") or "") != "mode=ask":
                e["condition"] = "mode=ask"
                e["label"] = "Ask 模式"
                e["priority"] = 5
                e["isDefault"] = False
                if not e.get("id"):
                    e["id"] = "e_mode_ask"
                changed = True
            migrated_mode_ask = True
            break
        if not migrated_mode_ask:
            _add_edge(
                "e_mode_ask",
                "mode_fork",
                "ask_thought",
                condition="mode=ask",
                priority=5,
            )
        _add_edge(
            "e_mode_agent",
            "mode_fork",
            "model_route",
            condition="mode=agent",
            priority=20,
            is_default=True,
        )
        _add_edge(
            "e_ask_enough",
            "ask_thought",
            "model_route",
            condition="info_enough",
            priority=20,
            is_default=True,
        )
        if "clarify" in ids:
            _add_edge(
                "e_ask_insuff",
                "ask_thought",
                "clarify",
                condition="info_insufficient",
                priority=10,
            )
        if "propose" in ids:
            for e in edges:
                if str(e.get("source") or "") != "ask_thought":
                    continue
                if str(e.get("target") or "") != "propose":
                    continue
                try:
                    pri = int(e.get("priority", 100))
                except (TypeError, ValueError):
                    pri = 100
                if str(e.get("condition") or "") != "ask_mode_ops" or pri >= 20:
                    e["condition"] = "ask_mode_ops"
                    e["label"] = "Ask 提议案"
                    e["priority"] = 8
                    e["isDefault"] = False
                    changed = True
                break
            else:
                _add_edge(
                    "e_ask_propose",
                    "ask_thought",
                    "propose",
                    condition="ask_mode_ops",
                    priority=8,
                )

    # Collapse legacy leaf model nodes (simple/medium/complex/vision/multimodal)
    # back into model_route → thought. Tier/vision models live in routeConfig.
    _LEAF_MODEL_IDS = {
        "model_simple",
        "model_medium",
        "model_complex",
        "model_vision",
        "model_multimodal",
    }

    def _is_leaf_model(n: dict[str, Any]) -> bool:
        nid = str(n.get("id") or "")
        pk = str(n.get("phaseKey") or "")
        return nid in _LEAF_MODEL_IDS or pk in _LEAF_MODEL_IDS

    ids = {str(n.get("id")) for n in nodes}
    leaf_nodes = [n for n in nodes if _is_leaf_model(n)]
    if leaf_nodes:
        leaf_ids = {str(n.get("id")) for n in leaf_nodes}
        nodes[:] = [n for n in nodes if str(n.get("id")) not in leaf_ids]
        edges[:] = [
            e
            for e in edges
            if str(e.get("source") or "") not in leaf_ids
            and str(e.get("target") or "") not in leaf_ids
        ]
        ids = {str(n.get("id")) for n in nodes}
        changed = True

    if "model_route" in ids and "thought" in ids:
        has_direct = any(
            str(e.get("source") or "") == "model_route"
            and str(e.get("target") or "") == "thought"
            for e in edges
        )
        if not has_direct:
            edges.append(
                {
                    "id": "e5",
                    "source": "model_route",
                    "target": "thought",
                    "label": "调用主模型",
                    "condition": "llm_call",
                    "priority": 10,
                    "isDefault": True,
                }
            )
            changed = True

    for n in nodes:
        if str(n.get("phaseKey") or n.get("id") or "") != "model_route":
            continue
        old = str(n.get("label") or "")
        if old in {"", "LLM", "问题分类器"}:
            n["label"] = "模型路由"
            changed = True

    if _refresh_builtin_node_copy(nodes):
        changed = True

    if not changed:
        return raw, False
    return {"version": int(raw.get("version") or 1), "nodes": nodes, "edges": edges}, True


def _refresh_builtin_node_copy(nodes: list[dict[str, Any]]) -> bool:
    """Upgrade legacy ambiguous copy for built-in route/memory nodes."""
    targets = {
        "route": {
            "label": "任务分流",
            "description": (
                "根据用户输入估算任务难度（简单/中等/复杂），"
                "随后进入 Ask / Agent 模式分线（mode_fork）。"
            ),
            "legacy_labels": {"", "条件分支", "任务路由"},
            "legacy_descs": {
                "",
                "任务路由",
                "根据用户输入估算任务难度（简单/中等/复杂）与运行模式，"
                "然后固定进入 Agent 主循环（连线 agent_loop）。几乎无可配参数。",
            },
        },
        "memory": {
            "label": "注入会话记忆",
            "description": (
                "把本会话短记 + 相关记忆块拼进后续 LLM 上下文。"
                "运行时由 memory 服务自动加载；configRef 仅作来源标记。"
            ),
            "legacy_labels": {"", "知识检索", "注入记忆"},
            "legacy_descs": {"", "注入记忆"},
        },
    }
    changed = False
    for n in nodes:
        spec = targets.get(str(n.get("id") or ""))
        if not spec:
            continue
        old_label = str(n.get("label") or "")
        old_desc = str(n.get("description") or "")
        if old_label not in spec["legacy_labels"] and old_desc not in spec["legacy_descs"]:
            continue
        if n.get("label") != spec["label"] or n.get("description") != spec["description"]:
            n["label"] = spec["label"]
            n["description"] = spec["description"]
            changed = True
    return changed


def _load_flows_catalog() -> list[dict[str, Any]]:
    ensure_stage_rules()
    rules = {r["ruleKey"]: r["ruleValue"] for r in list_global_rules()}
    raw = str(rules.get(_AGENT_FLOWS_CATALOG_KEY) or "").strip()
    items: list[dict[str, Any]] = []
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                items = [x for x in parsed if isinstance(x, dict) and x.get("id")]
        except Exception:
            items = []
    if items:
        return items
    # Migrate legacy single graph into catalog.
    legacy = get_agent_flow_config()
    seed = {
        "id": "default",
        "name": "默认 Agent 流程",
        "description": "当前线上 ReAct Host 默认执行图",
        "updatedAt": int(time.time() * 1000),
        "createdAt": int(time.time() * 1000),
        "graph": legacy.get("graph") or _empty_graph(),
        "phaseMap": legacy.get("phaseMap") or dict(_DEFAULT_AGENT_PHASE_MAP),
    }
    _save_flows_catalog([seed])
    return [seed]


def _save_flows_catalog(items: list[dict[str, Any]]) -> None:
    upsert_global_rule(
        rule_key=_AGENT_FLOWS_CATALOG_KEY,
        rule_value=json.dumps(items, ensure_ascii=False),
        description="Agent 流程目录（多流程）",
    )


def list_agent_flows() -> list[dict[str, Any]]:
    items = _load_flows_catalog()
    out: list[dict[str, Any]] = []
    for it in items:
        graph = it.get("graph") if isinstance(it.get("graph"), dict) else {}
        nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
        edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
        out.append(
            {
                "id": str(it.get("id")),
                "name": str(it.get("name") or "未命名流程"),
                "description": str(it.get("description") or ""),
                "nodeCount": len(nodes),
                "edgeCount": len(edges),
                "updatedAt": it.get("updatedAt"),
                "createdAt": it.get("createdAt"),
                "publishedVersion": int(it.get("publishedVersion") or 0) or None,
                "publishedAt": it.get("publishedAt"),
            }
        )
    out.sort(key=lambda x: int(x.get("updatedAt") or 0), reverse=True)
    return out


def _flow_public_view(it: dict[str, Any], *, graph: dict[str, Any], phase_map: dict[str, Any]) -> dict[str, Any]:
    versions = it.get("versions") if isinstance(it.get("versions"), list) else []
    return {
        "id": str(it.get("id")),
        "name": str(it.get("name") or "未命名流程"),
        "description": str(it.get("description") or ""),
        "updatedAt": it.get("updatedAt"),
        "createdAt": it.get("createdAt"),
        "graph": graph,
        "phaseMap": {str(k): str(v) for k, v in phase_map.items()},
        "publishedVersion": int(it.get("publishedVersion") or 0) or None,
        "publishedAt": it.get("publishedAt"),
        "publishedGraph": it.get("publishedGraph")
        if isinstance(it.get("publishedGraph"), dict)
        else None,
        "publishedPhaseMap": {
            str(k): str(v)
            for k, v in (it.get("publishedPhaseMap") or {}).items()
        }
        if isinstance(it.get("publishedPhaseMap"), dict)
        else None,
        "versions": [
            {
                "version": int(v.get("version") or 0),
                "publishedAt": v.get("publishedAt"),
                "name": str(v.get("name") or ""),
                "nodeCount": len((v.get("graph") or {}).get("nodes") or [])
                if isinstance(v.get("graph"), dict)
                else 0,
            }
            for v in versions
            if isinstance(v, dict)
        ][-20:],
    }


def get_agent_flow(flow_id: str) -> dict[str, Any] | None:
    fid = (flow_id or "").strip()
    if not fid:
        return None
    items = _load_flows_catalog()
    for idx, it in enumerate(items):
        if str(it.get("id")) != fid:
            continue
        graph = it.get("graph") if isinstance(it.get("graph"), dict) else _empty_graph()
        phase_map = it.get("phaseMap") if isinstance(it.get("phaseMap"), dict) else {}
        graph, changed = _normalize_agent_flow_graph(graph)
        if changed:
            items[idx] = {
                **it,
                "graph": graph,
                "phaseMap": {
                    **{str(k): str(v) for k, v in phase_map.items()},
                    "start": "start",
                    "end": str(phase_map.get("end") or "end"),
                },
                "updatedAt": int(time.time() * 1000),
            }
            _save_flows_catalog(items)
            it = items[idx]
            phase_map = it.get("phaseMap") if isinstance(it.get("phaseMap"), dict) else phase_map
        # First-time: seed published from draft so runtime has a version.
        if not int(it.get("publishedVersion") or 0):
            it = publish_agent_flow(fid, note="auto-seed") or it
            refreshed = None
            for x in _load_flows_catalog():
                if str(x.get("id")) == fid:
                    refreshed = x
                    break
            if refreshed:
                it = refreshed
                graph = it.get("graph") if isinstance(it.get("graph"), dict) else graph
                phase_map = it.get("phaseMap") if isinstance(it.get("phaseMap"), dict) else phase_map
        return _flow_public_view(it, graph=graph, phase_map=phase_map)
    return None


def get_published_agent_flow(flow_id: str = "default") -> dict[str, Any] | None:
    """Runtime source of truth: last published snapshot (not draft)."""
    fid = (flow_id or "default").strip() or "default"
    item = get_agent_flow(fid)
    if not item:
        return None
    pub_graph = item.get("publishedGraph")
    if not isinstance(pub_graph, dict):
        # get_agent_flow auto-seeds; re-read
        items = _load_flows_catalog()
        raw = next((x for x in items if str(x.get("id")) == fid), None)
        if not raw:
            return None
        pub_graph = raw.get("publishedGraph")
        if not isinstance(pub_graph, dict):
            return None
        return {
            "id": fid,
            "name": str(raw.get("name") or ""),
            "version": int(raw.get("publishedVersion") or 0),
            "publishedAt": raw.get("publishedAt"),
            "graph": pub_graph,
            "phaseMap": {
                str(k): str(v)
                for k, v in (raw.get("publishedPhaseMap") or {}).items()
            },
        }
    return {
        "id": fid,
        "name": str(item.get("name") or ""),
        "version": int(item.get("publishedVersion") or 0),
        "publishedAt": item.get("publishedAt"),
        "graph": pub_graph,
        "phaseMap": dict(item.get("publishedPhaseMap") or {}),
    }


def publish_agent_flow(flow_id: str, *, note: str = "") -> dict[str, Any] | None:
    """Copy draft graph → published snapshot and append version history."""
    fid = (flow_id or "").strip()
    if not fid:
        raise ValueError("flow_id required")
    items = _load_flows_catalog()
    for it in items:
        if str(it.get("id")) != fid:
            continue
        graph = it.get("graph") if isinstance(it.get("graph"), dict) else _empty_graph()
        phase_map = it.get("phaseMap") if isinstance(it.get("phaseMap"), dict) else {}
        graph, _ = _normalize_agent_flow_graph(graph)
        ver = int(it.get("publishedVersion") or 0) + 1
        now = int(time.time() * 1000)
        snap = {
            "version": ver,
            "publishedAt": now,
            "name": (note or "").strip() or f"v{ver}",
            "graph": graph,
            "phaseMap": {str(k): str(v) for k, v in phase_map.items()},
        }
        history = it.get("versions") if isinstance(it.get("versions"), list) else []
        history = [x for x in history if isinstance(x, dict)]
        history.append(snap)
        it["versions"] = history[-30:]
        it["publishedVersion"] = ver
        it["publishedAt"] = now
        it["publishedGraph"] = graph
        it["publishedPhaseMap"] = snap["phaseMap"]
        it["updatedAt"] = now
        if fid == "default":
            upsert_global_rule(
                rule_key=_AGENT_FLOW_RULE_KEY,
                rule_value=json.dumps(graph, ensure_ascii=False),
                description="Agent 默认流程图（已发布）",
            )
            upsert_global_rule(
                rule_key=_AGENT_FLOW_PHASE_MAP_KEY,
                rule_value=json.dumps(snap["phaseMap"], ensure_ascii=False),
                description="execution_log.phase 到流程节点映射（已发布）",
            )
        _save_flows_catalog(items)
        # Invalidate LangGraph cache if present
        try:
            from services.design.agent_controller import invalidate_agent_graph_cache

            invalidate_agent_graph_cache(fid)
        except Exception:
            pass
        return _flow_public_view(it, graph=graph, phase_map=phase_map)
    raise ValueError("flow not found")


def create_agent_flow(
    *,
    name: str,
    description: str = "",
    graph: dict[str, Any] | None = None,
    phase_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    title = (name or "").strip() or "未命名流程"
    now = int(time.time() * 1000)
    item = {
        "id": _new_flow_id(),
        "name": title,
        "description": (description or "").strip(),
        "createdAt": now,
        "updatedAt": now,
        "graph": graph if isinstance(graph, dict) else _empty_graph(),
        "phaseMap": phase_map if isinstance(phase_map, dict) else {},
    }
    items = _load_flows_catalog()
    items.append(item)
    _save_flows_catalog(items)
    return get_agent_flow(str(item["id"])) or item


def update_agent_flow(
    flow_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    graph: dict[str, Any] | None = None,
    phase_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    fid = (flow_id or "").strip()
    items = _load_flows_catalog()
    found = False
    for it in items:
        if str(it.get("id")) != fid:
            continue
        found = True
        if name is not None:
            it["name"] = (name or "").strip() or str(it.get("name") or "未命名流程")
        if description is not None:
            it["description"] = (description or "").strip()
        if graph is not None:
            if not isinstance(graph, dict):
                raise ValueError("graph must be object")
            if not isinstance(graph.get("nodes"), list) or not isinstance(graph.get("edges"), list):
                raise ValueError("graph must include nodes[] and edges[]")
            it["graph"] = graph
        if phase_map is not None:
            if not isinstance(phase_map, dict):
                raise ValueError("phaseMap must be object")
            it["phaseMap"] = {
                str(k).strip(): str(v).strip()
                for k, v in phase_map.items()
                if str(k).strip() and str(v).strip()
            }
        it["updatedAt"] = int(time.time() * 1000)
        # Sync legacy default keys when editing default flow.
        if fid == "default" and isinstance(it.get("graph"), dict):
            upsert_global_rule(
                rule_key=_AGENT_FLOW_RULE_KEY,
                rule_value=json.dumps(it["graph"], ensure_ascii=False),
                description="Agent 默认流程图（Admin 流程设计）",
            )
            upsert_global_rule(
                rule_key=_AGENT_FLOW_PHASE_MAP_KEY,
                rule_value=json.dumps(it.get("phaseMap") or {}, ensure_ascii=False),
                description="execution_log.phase 到流程节点映射",
            )
        break
    if not found:
        raise ValueError("flow not found")
    _save_flows_catalog(items)
    item = get_agent_flow(fid)
    if not item:
        raise ValueError("flow not found")
    return item


def delete_agent_flow(flow_id: str) -> bool:
    fid = (flow_id or "").strip()
    if fid == "default":
        raise ValueError("cannot delete default flow")
    items = _load_flows_catalog()
    next_items = [it for it in items if str(it.get("id")) != fid]
    if len(next_items) == len(items):
        return False
    _save_flows_catalog(next_items)
    return True


def _is_start_node(n: dict[str, Any]) -> bool:
    kind = str(n.get("kind") or "").lower()
    return kind in {"start", "input"} or str(n.get("id") or "") == "start"


def _is_end_node(n: dict[str, Any]) -> bool:
    kind = str(n.get("kind") or "").lower()
    return kind in {"end", "output", "error", "observe"}


def test_run_agent_flow(*, flow_id: str, prompt: str = "") -> dict[str, Any]:
    """Dry-run: validate graph connectivity + walk reachable nodes from start.

    Does not call LLMs or mutate canvas — used by Admin「测试运行」.
    Walk uses flow_runtime (parallel fan-out + AND/OR join). Without a schedule
    context, explore_all=True so exclusive branches still surface for validation.
    """
    from services.design.flow_runtime import walk_agent_flow

    item = get_agent_flow(flow_id)
    if not item:
        raise ValueError("flow not found")
    graph = item.get("graph") if isinstance(item.get("graph"), dict) else {}
    nodes = [n for n in (graph.get("nodes") or []) if isinstance(n, dict)]
    edges = [e for e in (graph.get("edges") or []) if isinstance(e, dict)]
    node_by_id = {str(n.get("id") or ""): n for n in nodes if n.get("id")}
    issues: list[dict[str, Any]] = []

    if not nodes:
        issues.append({"level": "error", "code": "empty", "message": "流程没有节点"})

    starts = [n for n in nodes if _is_start_node(n)]
    if nodes and not starts:
        incoming = {str(e.get("target") or "") for e in edges}
        starts = [n for n in nodes if str(n.get("id") or "") not in incoming]
    if nodes and not starts:
        issues.append({"level": "error", "code": "no_start", "message": "缺少开始 / 入口节点"})

    for e in edges:
        eid = str(e.get("id") or "")
        src = str(e.get("source") or "")
        tgt = str(e.get("target") or "")
        if src not in node_by_id or tgt not in node_by_id:
            issues.append(
                {
                    "level": "error",
                    "code": "bad_edge",
                    "message": f"连线 {eid or '(无 id)'} 的 source/target 不存在",
                    "edgeId": eid,
                }
            )

    for n in nodes:
        nid = str(n.get("id") or "")
        kind = str(n.get("kind") or "").lower()
        cap = str(n.get("capability") or "")
        if kind in {"llm", "agent", "ask", "human"} or cap == "prompt":
            has_prompt = bool(str(n.get("promptText") or "").strip() or str(n.get("promptKey") or "").strip())
            if not has_prompt:
                issues.append(
                    {
                        "level": "warning",
                        "code": "missing_prompt",
                        "message": f"节点 {nid} 未配置提示词",
                        "nodeId": nid,
                    }
                )
        if kind in {"classifier", "router"} or cap == "model_route":
            if not str(n.get("routeConfig") or "").strip():
                issues.append(
                    {
                        "level": "warning",
                        "code": "missing_route",
                        "message": f"节点 {nid} 未配置模型路由",
                        "nodeId": nid,
                    }
                )

    outgoing: dict[str, list[dict[str, Any]]] = {}
    incoming: dict[str, list[str]] = {}
    for e in edges:
        src = str(e.get("source") or "")
        tgt = str(e.get("target") or "")
        if src not in node_by_id:
            continue
        outgoing.setdefault(src, []).append(e)
        if tgt in node_by_id:
            incoming.setdefault(tgt, []).append(src)

    for n in nodes:
        nid = str(n.get("id") or "")
        kind = str(n.get("kind") or "").lower()
        if kind == "parallel" and len(outgoing.get(nid) or []) < 2:
            issues.append(
                {
                    "level": "warning",
                    "code": "parallel_outs",
                    "message": f"并行网关 {nid} 建议至少 2 条出边",
                    "nodeId": nid,
                }
            )
        if kind == "join":
            ins = incoming.get(nid) or []
            if len(ins) < 2:
                issues.append(
                    {
                        "level": "warning",
                        "code": "join_ins",
                        "message": f"汇聚 {nid} 建议至少 2 条入边（AND 等待全部到达）",
                        "nodeId": nid,
                    }
                )

    start_ids = [str(s.get("id")) for s in starts if s.get("id")]
    walked = walk_agent_flow(
        nodes=nodes,
        edges=edges,
        start_ids=start_ids,
        explore_all=True,
    )
    steps = walked.get("steps") or []
    visited = set(walked.get("visitedNodeIds") or [])
    for w in walked.get("warnings") or []:
        if isinstance(w, dict):
            issues.append(w)

    ends = [n for n in nodes if _is_end_node(n)]
    end_ids = {str(n.get("id")) for n in ends if n.get("id")}
    if end_ids and not (end_ids & visited):
        issues.append(
            {
                "level": "warning",
                "code": "end_unreachable",
                "message": "从入口无法到达结束 / 输出节点",
            }
        )

    orphan = [str(n.get("id")) for n in nodes if n.get("id") and str(n.get("id")) not in visited]
    if orphan:
        issues.append(
            {
                "level": "warning",
                "code": "orphans",
                "message": f"{len(orphan)} 个节点从入口不可达",
                "nodeIds": orphan[:40],
            }
        )

    has_error = any(i.get("level") == "error" for i in issues)
    return {
        "ok": not has_error and bool(steps),
        "flowId": str(item.get("id") or flow_id),
        "flowName": str(item.get("name") or ""),
        "prompt": (prompt or "").strip(),
        "issues": issues,
        "steps": steps,
        "visitedNodeIds": list(visited),
        "takenEdgeIds": list(walked.get("takenEdgeIds") or []),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "ranAt": int(time.time() * 1000),
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
    if scene_key not in ("website", "mobile", "image", "poster", "drawing"):
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


def _bucket_inc(
    buckets: dict[str, dict[str, int]],
    key: str,
    *,
    failed: bool,
    ok: bool,
    tokens: int,
) -> None:
    b = buckets.setdefault(key, {"tasks": 0, "failed": 0, "succeeded": 0, "tokens": 0})
    b["tasks"] += 1
    b["tokens"] += tokens
    if failed:
        b["failed"] += 1
    elif ok:
        b["succeeded"] += 1


def _bucket_rows(buckets: dict[str, dict[str, int]], *, key_name: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, s in sorted(buckets.items(), key=lambda x: -x[1]["tasks"]):
        n = max(1, s["tasks"])
        out.append(
            {
                key_name: key,
                "tasks": s["tasks"],
                "failed": s["failed"],
                "succeeded": s["succeeded"],
                "tokens": s["tokens"],
                "failRate": round(s["failed"] / n, 4),
            }
        )
    return out


def _parse_task_meta(raw: Any) -> dict[str, Any]:
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def skill_metrics_summary() -> dict[str, Any]:
    """Aggregate design_task for ReAct Host dashboard (last 500 + global totals)."""
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
        credits = conn.execute(
            "SELECT COALESCE(SUM(charged_credits), 0) AS s FROM design_task"
        ).fetchone()
        rows = conn.execute(
            """
            SELECT id, scene, status, total_tokens, charged_credits, created_at,
                   error_message, meta_json
            FROM design_task
            ORDER BY created_at DESC
            LIMIT 500
            """
        ).fetchall()

    scene_stats: dict[str, dict[str, int]] = {}
    route_stats: dict[str, dict[str, int]] = {}
    intent_stats: dict[str, dict[str, int]] = {}
    painted_n = 0
    rounds_sum = 0
    rounds_n = 0
    ops_sum = 0
    ops_n = 0
    dual_n = 0
    memory_n = 0
    with_meta_n = 0
    recent: list[dict[str, Any]] = []

    for r in rows:
        sc = str(r["scene"] or "unknown").strip().lower() or "unknown"
        st = str(r["status"] or "")
        tok = int(r["total_tokens"] or 0)
        failed_b = _is_fail_status(st)
        ok_b = _is_ok_status(st)
        _bucket_inc(scene_stats, sc, failed=failed_b, ok=ok_b, tokens=tok)

        meta = _parse_task_meta(r["meta_json"] if "meta_json" in r.keys() else None)
        decision = meta.get("decision_log") if isinstance(meta.get("decision_log"), dict) else {}
        exec_log = meta.get("execution_log") if isinstance(meta.get("execution_log"), dict) else {}

        route_raw = str(decision.get("route") or "").strip().lower() or (
            "error" if failed_b else "unknown"
        )
        route_m = re.match(r"^(agent_graph(?:_ask|_chat)?)(?::v\d+)?$", route_raw)
        route = route_m.group(1) if route_m else route_raw
        intent = str(
            decision.get("intent") or exec_log.get("intent") or ""
        ).strip().lower() or "unknown"
        _bucket_inc(route_stats, route, failed=failed_b, ok=ok_b, tokens=tok)
        _bucket_inc(intent_stats, intent, failed=failed_b, ok=ok_b, tokens=tok)

        painted = bool(exec_log.get("painted") or decision.get("tool_ops_applied"))
        ops_count = int(exec_log.get("ops_count") or 0)
        round_i = int(exec_log.get("round") or 0)
        if meta:
            with_meta_n += 1
        if painted:
            painted_n += 1
        if round_i > 0:
            rounds_sum += round_i
            rounds_n += 1
        if ops_count > 0 or painted:
            ops_sum += ops_count
            ops_n += 1
        if exec_log.get("dual_picked"):
            dual_n += 1
        if decision.get("memory_injected"):
            memory_n += 1

        if len(recent) < 50:
            recent.append(
                {
                    "id": r["id"],
                    "scene": r["scene"],
                    "status": r["status"],
                    "route": route if route != "unknown" else None,
                    "intent": intent if intent != "unknown" else None,
                    "painted": painted,
                    "opsCount": ops_count,
                    "tokens": tok,
                    "credits": int(r["charged_credits"] or 0),
                    "error": r["error_message"],
                    "createdAt": int(float(r["created_at"]) * 1000) if r["created_at"] else None,
                }
            )

    window_n = max(1, len(rows))
    meta_n = max(1, with_meta_n)
    return {
        "totals": {
            "tasks": int((total or {}).get("c") or 0),
            "failed": int((failed or {}).get("c") or 0),
            "succeeded": int((ok or {}).get("c") or 0),
            "tokens": int((tokens or {}).get("s") or 0),
            "credits": int((credits or {}).get("s") or 0),
            "painted": painted_n,
            "paintedRate": round(painted_n / window_n, 4),
        },
        "quality": {
            "window": len(rows),
            "avgRounds": round(rounds_sum / max(1, rounds_n), 2) if rounds_n else 0,
            "avgOps": round(ops_sum / max(1, ops_n), 2) if ops_n else 0,
            "avgTokens": round(
                sum(int(x["total_tokens"] or 0) for x in rows) / window_n, 1
            ),
            "dualPickedRate": round(dual_n / meta_n, 4) if with_meta_n else 0,
            "memoryInjectedRate": round(memory_n / meta_n, 4) if with_meta_n else 0,
        },
        "byRoute": _bucket_rows(route_stats, key_name="route"),
        "byIntent": _bucket_rows(intent_stats, key_name="intent"),
        "byScene": _bucket_rows(scene_stats, key_name="scene"),
        "bySkill": [],
        "recent": recent,
    }


def _parse_flow_version(*, route: Any, control: Any, exec_log: dict[str, Any], meta: dict[str, Any]) -> int | None:
    for raw in (meta.get("flow_version"), exec_log.get("flow_version")):
        try:
            n = int(raw)
            if n > 0:
                return n
        except (TypeError, ValueError):
            pass
    for raw in (route, control):
        s = str(raw or "")
        m = re.search(r":v(\d+)\s*$", s, re.I)
        if m:
            return int(m.group(1))
    return None


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
        where.append(
            "(id LIKE ? OR user_id LIKE ? OR prompt LIKE ? OR "
            "coalesce(json_extract(meta_json, '$.trace_id'), '') LIKE ? OR "
            "coalesce(json_extract(meta_json, '$.decision_log.trace_id'), '') LIKE ?)"
        )
        params.extend([like, like, like, like, like])
    route_filter = (route or "").strip().lower()
    if route_filter:
        # Exact or prefix (e.g. agent_graph matches agent_graph:v7 / agent_graph_chat)
        where.append(
            "("
            "lower(coalesce(json_extract(meta_json, '$.decision_log.route'), '')) = ? OR "
            "lower(coalesce(json_extract(meta_json, '$.decision_log.route'), '')) LIKE ?"
            ")"
        )
        params.append(route_filter)
        params.append(route_filter + "%")
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
        exec_log = meta.get("execution_log")
        if not isinstance(exec_log, dict):
            exec_log = {}
        items.append(
            {
                "taskId": r["id"],
                "traceId": meta.get("trace_id") or decision.get("trace_id") or exec_log.get("trace_id"),
                "userId": r["user_id"],
                "scene": r["scene"],
                "status": r["status"],
                "route": decision.get("route"),
                "intent": decision.get("intent") or exec_log.get("intent"),
                "prompt": r["prompt"],
                "decisionLog": decision,
                "executionLog": exec_log or None,
                "control": meta.get("control"),
                "flowId": meta.get("flow_id") or exec_log.get("flow_id"),
                "flowVersion": _parse_flow_version(
                    route=decision.get("route"),
                    control=meta.get("control"),
                    exec_log=exec_log,
                    meta=meta,
                ),
                "opsCount": exec_log.get("ops_count"),
                "totalTokens": exec_log.get("total_tokens"),
                "painted": exec_log.get("painted"),
                "taskTier": exec_log.get("task_tier"),
                "visionUsed": exec_log.get("vision_used"),
                "model": exec_log.get("model"),
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


def clear_decision_logs() -> dict[str, Any]:
    """Strip decision_log / execution_log from all design_task.meta_json (fresh 运行复盘)."""
    ensure_design_catalog()
    cleared = 0
    scanned = 0
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, meta_json FROM design_task
            WHERE meta_json IS NOT NULL AND TRIM(meta_json) != ''
            """
        ).fetchall()
        for r in rows:
            scanned += 1
            raw = r["meta_json"]
            if not isinstance(raw, str) or not raw.strip():
                continue
            try:
                meta = json.loads(raw)
            except Exception:
                continue
            if not isinstance(meta, dict):
                continue
            if "decision_log" not in meta and "execution_log" not in meta:
                continue
            meta.pop("decision_log", None)
            meta.pop("execution_log", None)
            conn.execute(
                "UPDATE design_task SET meta_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(meta, ensure_ascii=False), time.time(), r["id"]),
            )
            cleared += 1
        conn.commit()
    return {"ok": True, "scanned": scanned, "cleared": cleared}


STAGE_RULE_DEFAULTS: dict[str, str] = {
    # Runtime knobs seeded once into design_global_rule (Admin 可改；运行时只读表).
    "agent.persona.auto": "我是 Recombyn Auto 设计助手",
    "agent.persona.locked": "我是 Recombyn Auto 设计助手，使用的模型是{model_label}",
    # Off by default — short plan adds an extra LLM round before ReAct.
    "agent.react.short_plan": "0",
    "agent.react.dual_sample": "0",
    # On by default — catalog first; full tool/knowledge/aesthetics after need_*.
    "agent.react.defer_tools": "1",
    # Dialogue context: facts + rolling summary + recent verbatim (not full chat dump).
    "memory.dialogue.recent_turns": "4",
    "memory.dialogue.recent_chars": "1200",
    "memory.dialogue.summary_chars": "600",
    "memory.dialogue.facts_max": "12",
    "memory.dialogue.per_turn_chars": "400",
    "agent.prompt.react_system": (
        "你是画布编辑器的设计 Agent。\n"
        "快速决策并行动。不要复述 schema、ReAct 或 Host 内部实现。\n"
        "\n"
        "只输出一个 JSON 对象（不要 markdown 代码块）：\n"
        "{\n"
        '  "thought": "≤12 个汉字或 ≤8 个英文词；仅作界面进度",\n'
        '  "intent": "chat|ask|done|edit|create",\n'
        '  "reply": "对用户的自然语言（chat/ask/done 必填）",\n'
        '  "choices": ["可选快捷回复"],\n'
        '  "tool_ops": [{"op_key":"...","args":{...}}],\n'
        '  "done": true\n'
        "}\n"
        "\n"
        "规则：\n"
        '- thought 示例："打招呼" / "加标题" — 绝不提及 intent、tool_ops、done、JSON 或 ReAct。\n'
        "- chat / ask / done：必须写 reply；tool_ops 必须为 []。\n"
        "- edit / create：tool_ops 必须是非空数组，且仅含允许的画布操作；reply 可选。\n"
        "- 动手前先确认关键信息：产品/品牌名、核心文案、受众、必要版式类型、用户明确的硬约束。"
        "若关键槽位缺失且瞎编会歪曲用户（假品牌、假口号、假法务文案）：intent=ask，只问一个聚焦问题，"
        "可选 choices 为短答案芯片；tool_ops=[]。\n"
        "- 不要追问锦上添花的细节。用户未指定时，风格/配色/疏密用合理默认。\n"
        "- UI / 版式 / 海报 / App 界面：优先 create_shape / create_text / create_frame；"
        "create_image 仅用于照片位。\n"
        "- 纯出图需求（生成一张图 / illustration / photo / 配图且无 UI 框）："
        "intent=create，空白时用 create_frame + create_image（genPrompt，Host 经 Seedream 水合）。"
        "不要拒绝，也不要让用户切换模式。\n"
        "- 用户附件 → create_image 用 attachmentIndex；否则用 genPrompt 或 src。\n"
        "- 附件：根据 USER_PROMPT 判断是否为风格参考。"
        "申请 need_aesthetics 时，仅当用户要匹配附件风格才设 use_user_refs=true；"
        "若「不要参考/内容素材/仅作配图」则 false。\n"
        "- 若有 PLAN：按顺序执行；一步 ReAct 可覆盖多项计划。\n"
        "- 若有 LAST_ERROR / PRIOR_ERRORS：先修该错误；不要重复非法操作。\n"
        "- 不要发明 SCENE_NODES / FOCUS_FRAME_ID 中不存在的节点 id。\n"
        "- CANVAS_SIZE 为具体 WxH（如 375x812）：create_frame 必须用该尺寸。\n"
        "- CANVAS_SIZE 为 auto / unknown：由你自选 WxH（优先参考图比例；"
        "登录/移动约 375×812；网站约 1440×900）。在 create_frame 上写 width/height。"
        "不要向用户追问尺寸。\n"
        "- 不要输出调试转储、查找协议或 Host 内部细节。\n"
        "- 被问「你是谁 / 什么模型」时：用 IDENTITY 回答（可附一句简短愿帮），"
        "不要编造其他产品名。"
    ),
    "agent.prompt.plan_system": (
        "你为设计 Agent 规划画布工作。\n"
        '只输出一个 JSON 对象：{"plan":["...","..."]}\n'
        "规则：\n"
        "- 3～5 条短中文步骤（每条 ≤16 字）。\n"
        "- 只写具体画布动作（建板/标题/配色/配图/收尾…）。\n"
        "- 不要写 tool_ops、不要谈 schema、不要 markdown。"
    ),
    "agent.prompt.size_auto": (
        "SIZE_MODE: auto — 在 create_frame 上自行选择宽高；不要向用户追问尺寸。"
    ),
    "agent.prompt.ask_canvas_size": "请先选择画布尺寸（或告诉我宽×高），再继续创建。",
    "agent.prompt.chat_fallback": (
        "你好，{persona}。可以说说你想改画布的什么，或直接描述要生成的内容。"
    ),
    "agent.prompt.unsafe_ops_ask": (
        "这次改动我没法安全执行{error}。可以换个说法，或告诉我更具体的目标吗？"
    ),
    # Ask = clarify + optional confirm-before-paint (not silent invent).
    "agent.prompt.ask_system": (
        "ASK_MODE：JSON 契约与上文相同。本回合 Host 不会上屏改画布。\n"
        "你的职责：信息不足时先追问，够了再提议案。\n"
        "\n"
        "1）信息不足（缺关键槽位：要做什么、品牌/产品名、设计必须展示的核心文案、硬约束）：\n"
        "- intent=ask（或 chat）；tool_ops=[]；done=true。\n"
        "- reply = 一个清晰的中文问题（用户用英文则可用英文）。\n"
        "- choices = 2～4 个可点选的短答案芯片（具体选项，忌空泛）。\n"
        "- 不要编造品牌名、口号或法务/营销文案来填空。\n"
        "- 不要追问画布尺寸（尺寸由 Host/auto 处理）。\n"
        "\n"
        "2）信息足够可行动：\n"
        "- intent=edit|create，并用 tool_ops 提出改动。\n"
        "- reply 必须简要说明将改什么（绝不可空）。\n"
        "- 设置 choices + apply_choice = 表示「执行这些操作」的标签。\n"
        "- 不要声称画布已经改完——等用户确认（点芯片或输入 apply_choice）。\n"
        "\n"
        "拿不准时优先澄清提问，不要过早给 tool_ops。"
    ),
    "agent.prompt.ask_blocked_edit": "",
    "agent.prompt.partial_system": (
        "你用 tool_ops 对画布做局部图层编辑。\n"
        "输出：带 ops 数组的 JSON。"
    ),
    "agent.prompt.chat_agent_system": (
        "你是 recombyn 设计 Agent，面向 SVG 设计画布。\n"
        "\n"
        "使用工具调用循环：回复用户、查找素材，或输出画布 tool_ops。\n"
        "完整设计任务走 API /design/run（agent_loop）——玩法与这些工具一致。\n"
        "\n"
        "硬性规则：\n"
        "1. 局部改动优先 create_shape / create_text / create_image / create_frame。\n"
        "2. 界面框与图标只用矢量。用 align_nodes / distribute_nodes 做收尾对齐。\n"
        "3. 图片：用户附件 → create_image + attachmentIndex；"
        "否则 create_image + genPrompt（Host 水合）或 src。\n"
        "4. 除非用户明确要求删除，否则绝不 delete_nodes。\n"
        "5. 功能性文案一律用 create_text。\n"
        "6. 改完后用简短中文总结。\n"
        "7. 不要发明工具名。对用户可见文案用中文。"
    ),
    # Vision structure: Admin「提示词」页可编辑；样本入库 + 用户参考图共用。
    "aesthetics.prompt.vision_structure": (
        "你是设计结构抽取助手。对附图做统一看图：识别页面主题与分区，"
        "列出所有主要可见元素，给出每个元素相对画板的 layout（百分比）与 design tokens。\n"
        "只描述图中有的内容，不要按通用登录/注册模板脑补缺失模块。\n"
        "layout 用相对百分比（xPct/yPct/wPct/hPct）；色值用 #RRGGBB。\n"
        "只输出一个 JSON 对象（可含 comment/tags/name 与 structure），不要 markdown。"
    ),
    "aesthetics.vision.structure_schema": (
        '{"schemaVersion":"number","page.theme":"light|dark",'
        '"page.background.type":"solid|gradient|image",'
        '"page.background.fill":"string[]","page.gravity":"string",'
        '"page.pattern":"string","page.forbiddenPatterns":"string[]?",'
        '"page.summary":"string","elements":"object",'
        '"elements[].id":"string",'
        '"elements[].type":"text|button_primary|button_secondary|pill|card|input|'
        'logo_lockup|avatar|image|checkbox_legal|decoration|nav_chip",'
        '"elements[].role":"brand|primary_cta|secondary_cta|dismiss|field|'
        'account_preview|legal|title|subtitle|chrome",'
        '"elements[].layout.xPct":"number","elements[].layout.yPct":"number",'
        '"elements[].layout.wPct":"number","elements[].layout.hPct":"number?",'
        '"elements[].tokens.fill":"string?","elements[].tokens.text":"string?",'
        '"elements[].tokens.radius":"number?","palette":"object","summary":"string"}'
    ),
    "agent.flow.default_graph_json": json.dumps(_DEFAULT_AGENT_FLOW_GRAPH, ensure_ascii=False),
    "agent.flow.phase_map_json": json.dumps(_DEFAULT_AGENT_PHASE_MAP, ensure_ascii=False),
    # 标准版默认路由：纯国内（方舟 Seed / DeepSeek / Seedream）
    "precheck.model_threshold": (
        "simple->doubao-seed-2-1-turbo;"
        "medium->deepseek-v4-flash;"
        "complex->deepseek-v4-pro;"
        "else->deepseek-v4-flash"
    ),
    "precheck.vision_model": "doubao-seed-2-1-turbo",
    "precheck.fallback_chain": (
        "deepseek-v4-pro,deepseek-v4-flash,doubao-seed-2-1-turbo"
    ),
    "assets.image_default_model": "doubao-seedream-5-0-lite",
    # Pro / Max 用户偏好档（含海外模型）
    "precheck.user_preset.balanced": (
        "simple->doubao-seed-2-1-turbo;"
        "medium->or-gpt-5-6-luna;"
        "complex->or-gemini-3-flash-preview;"
        "vision->or-gemini-3-flash-preview;"
        "image->or-gpt-image-2"
    ),
    "precheck.user_preset.quality": (
        "simple->or-gemini-3-flash-preview;"
        "medium->or-gemini-3-5-flash;"
        "complex->or-gpt-5-6-sol;"
        "vision->or-gemini-3-5-flash;"
        "image->or-gpt-image-2"
    ),
}


# Chinese purpose labels for Admin「用途」column (fill empty only; never clobber edits).
STAGE_RULE_DESCRIPTIONS: dict[str, str] = {
    "legacy.agent_zero_v3": "全表清空标记 v3：rules/skills/flows 已删",
    "agent.persona.auto": "人设 · Auto",
    "agent.persona.locked": "人设 · 锁定模型",
    "agent.react.short_plan": "短计划（ReAct 前多一轮，默认关）",
    "agent.react.dual_sample": "双采样（默认关）",
    "agent.react.defer_tools": "按需加载工具/知识/美学（need_*，默认开）",
    "memory.dialogue.recent_turns": "对话近轮原文条数",
    "memory.dialogue.recent_chars": "近轮原文总字数上限",
    "memory.dialogue.summary_chars": "对话滚动摘要字数上限",
    "memory.dialogue.facts_max": "对话结构化事实条数上限",
    "memory.dialogue.per_turn_chars": "单轮对话注入字数上限",
    "agent.prompt.react_system": "设计模式 system（ReAct）",
    "agent.prompt.plan_system": "短 Plan 系统提示",
    "agent.prompt.size_auto": "Auto 尺寸说明",
    "agent.prompt.ask_canvas_size": "追问画布尺寸",
    "agent.prompt.chat_fallback": "闲聊空回复兜底",
    "agent.prompt.unsafe_ops_ask": "tool_ops 无法安全执行",
    "agent.prompt.ask_system": "Ask 叠层（缺信息先追问；够了再提议案确认）",
    "agent.prompt.ask_blocked_edit": "Ask 有方案但 reply 为空",
    "agent.prompt.partial_system": "局部改层 system",
    "agent.prompt.chat_agent_system": "工具调用聊天 system",
    "aesthetics.prompt.vision_structure": "看图说明（样本 / 用户参考图共用）",
    "aesthetics.vision.structure_schema": "看图契约参数（必填/可选，同画布能力）",
    "agent.flow.default_graph_json": "Agent 默认流程图（Admin 流程设计）",
    "agent.flow.phase_map_json": "流程 phase→节点 映射（复盘高亮）",
    "agent.flows.catalog_json": "Agent 流程目录（多流程表格）",
    "precheck.model_threshold": "标准版 Auto 分档模型（简单/中等/复杂）",
    "precheck.vision_model": "标准版看图模型",
    "precheck.fallback_chain": "标准版降级重试链",
    "assets.image_default_model": "标准版默认生图模型",
    "precheck.user_preset.balanced": "用户 Auto 偏好 · Pro",
    "precheck.user_preset.quality": "用户 Auto 偏好 · Max",
}


def ensure_stage_rules() -> None:
    """Idempotently insert stage rule keys if missing (no overwrite); drop obsolete keys."""
    global _STAGE_RULES_READY
    ensure_design_catalog()
    with _STAGE_RULES_LOCK:
        with connect() as conn:
            # Always fill missing keys from STAGE_RULE_DEFAULTS (never overwrite Admin values).
            merged_defaults = dict(STAGE_RULE_DEFAULTS)
            now = time.time()
            rows = conn.execute("SELECT rule_key FROM design_global_rule").fetchall()
            existing = {str(r["rule_key"]) for r in rows}
            for key, val in merged_defaults.items():
                if key not in existing:
                    desc = STAGE_RULE_DESCRIPTIONS.get(key, "")
                    try:
                        conn.execute(
                            """
                            INSERT INTO design_global_rule
                                (rule_key, rule_value, description, enabled, updated_at)
                            VALUES (?, ?, ?, 1, ?)
                            """,
                            (key, val, desc, now),
                        )
                    except Exception:
                        conn.execute(
                            "INSERT INTO design_global_rule (rule_key, rule_value, updated_at) VALUES (?, ?, ?)",
                            (key, val, now),
                        )
                    continue
                # Key exists but empty → fill from seed (never clobber Admin text).
                if not val:
                    continue
                try:
                    row = conn.execute(
                        "SELECT rule_value FROM design_global_rule WHERE rule_key = ?",
                        (key,),
                    ).fetchone()
                    cur = str((row["rule_value"] if row else "") or "").strip()
                    if not cur:
                        conn.execute(
                            """
                            UPDATE design_global_rule
                            SET rule_value = ?, updated_at = ?
                            WHERE rule_key = ?
                            """,
                            (val, now, key),
                        )
                except Exception:
                    pass
            _STAGE_RULES_READY = True
            # One-shot: migrate Ask / Design prompts when still on old contracts.
            # Does not clobber admin edits that already use the new fields.
            try:
                _PROMPT_MIGRATIONS = (
                    (
                        "agent.prompt.ask_system",
                        (
                            "NEVER touch the canvas",
                            "tool_ops MUST always be []",
                            'choices": ["确认执行"',
                            "propose → user confirms",
                            "Design Assistant in ASK mode",
                            'intent": "ask|chat|done"',
                            "ASK_MODE (confirm-before-paint)",
                            "wait for the click.",
                            "Host will NOT paint this turn. When intent=edit|create with tool_ops:",
                            "ASK_MODE: Same JSON contract and tool_ops as above.",
                            "ASK_MODE: Same JSON contract as above.",
                            "Your job is to ASK when information is insufficient",
                        ),
                        "拿不准时优先澄清提问",
                    ),
                    (
                        "agent.prompt.ask_blocked_edit",
                        (
                            "切到 Agent 模式",
                            "switch to Agent",
                            "确认执行",
                            "点下方选项",
                            "请点下方选项",
                            "我先给出方案",
                            "方案已准备好",
                        ),
                        "ask_blocked_cleared_v1",
                    ),
                    (
                        "agent.prompt.react_system",
                        (
                            "Do not invent another product name.",
                            "Decide quickly, then act. Do not narrate schema, ReAct, or Host internals.",
                            "Know what you need before painting",
                            "You are the Design Agent for a canvas editor.",
                            "Output ONE JSON object only",
                        ),
                        "你是画布编辑器的设计 Agent",
                    ),
                    (
                        "agent.prompt.plan_system",
                        (
                            "You plan canvas work for a design agent.",
                            "Output ONE JSON object only",
                        ),
                        "你为设计 Agent 规划画布工作",
                    ),
                    (
                        "agent.prompt.size_auto",
                        (
                            "pick width/height yourself on create_frame",
                            "do not ask the user for size",
                        ),
                        "自行选择宽高",
                    ),
                    (
                        "agent.prompt.partial_system",
                        (
                            "You operate the canvas with tool_ops",
                            "OUTPUT: JSON with an ops array",
                        ),
                        "你用 tool_ops 对画布做局部图层编辑",
                    ),
                    (
                        "agent.prompt.chat_agent_system",
                        (
                            "You are recombyn Design Agent for an SVG design canvas.",
                            "Use the tool-calling loop",
                            "Hard rules:",
                        ),
                        "你是 recombyn 设计 Agent",
                    ),
                )
                for key, old_marks, new_mark in _PROMPT_MIGRATIONS:
                    fresh = merged_defaults.get(key) or ""
                    if not fresh or new_mark.lower() in fresh.lower():
                        # still patch DB if DB is stale but defaults already new
                        pass
                    row = conn.execute(
                        "SELECT rule_value FROM design_global_rule WHERE rule_key = ?",
                        (key,),
                    ).fetchone()
                    if not row:
                        continue
                    cur = str(row["rule_value"] or "")
                    if not cur:
                        continue
                    if new_mark.lower() in cur.lower():
                        continue
                    if not any(m in cur for m in old_marks):
                        continue
                    if not fresh:
                        continue
                    conn.execute(
                        """
                        UPDATE design_global_rule
                        SET rule_value = ?, updated_at = ?
                        WHERE rule_key = ?
                        """,
                        (fresh, now, key),
                    )
                    desc = STAGE_RULE_DESCRIPTIONS.get(key, "")
                    if desc:
                        conn.execute(
                            """
                            UPDATE design_global_rule
                            SET description = ?
                            WHERE rule_key = ?
                              AND (description IS NULL OR description = '')
                            """,
                            (desc, key),
                        )
            except Exception:
                pass
            # One-shot: 标准版强制改为纯国内阶梯（并清掉已下线的 glm-5-2）
            try:
                marker_key = "precheck.platform_domestic_v1"
                mark_row = conn.execute(
                    "SELECT rule_value FROM design_global_rule WHERE rule_key = ?",
                    (marker_key,),
                ).fetchone()
                if not mark_row:
                    domestic_keys = (
                        "precheck.model_threshold",
                        "precheck.vision_model",
                        "precheck.fallback_chain",
                        "assets.image_default_model",
                    )
                    for key in domestic_keys:
                        val = merged_defaults.get(key) or ""
                        if not val:
                            continue
                        desc = STAGE_RULE_DESCRIPTIONS.get(key, "")
                        existing = conn.execute(
                            "SELECT rule_key FROM design_global_rule WHERE rule_key = ?",
                            (key,),
                        ).fetchone()
                        if existing:
                            conn.execute(
                                """
                                UPDATE design_global_rule
                                SET rule_value = ?, updated_at = ?
                                WHERE rule_key = ?
                                """,
                                (val, now, key),
                            )
                        else:
                            try:
                                conn.execute(
                                    """
                                    INSERT INTO design_global_rule
                                        (rule_key, rule_value, description, enabled, updated_at)
                                    VALUES (?, ?, ?, 1, ?)
                                    """,
                                    (key, val, desc, now),
                                )
                            except Exception:
                                conn.execute(
                                    """
                                    INSERT INTO design_global_rule
                                        (rule_key, rule_value, updated_at)
                                    VALUES (?, ?, ?)
                                    """,
                                    (key, val, now),
                                )
                    try:
                        conn.execute(
                            """
                            INSERT INTO design_global_rule
                                (rule_key, rule_value, description, enabled, updated_at)
                            VALUES (?, ?, ?, 1, ?)
                            """,
                            (
                                marker_key,
                                "1",
                                "标准版已切纯国内路由（一次性）",
                                now,
                            ),
                        )
                    except Exception:
                        conn.execute(
                            """
                            INSERT INTO design_global_rule (rule_key, rule_value, updated_at)
                            VALUES (?, ?, ?)
                            """,
                            (marker_key, "1", now),
                        )
                # Scrub retired GLM id from any rule text (even after marker).
                rows = conn.execute(
                    "SELECT rule_key, rule_value FROM design_global_rule"
                ).fetchall()
                for r in rows:
                    key = str(r["rule_key"] or "")
                    cur = str(r["rule_value"] or "")
                    if "glm-5-2" not in cur.lower():
                        continue
                    fixed = (
                        cur.replace("glm-5-2", "deepseek-v4-flash")
                        .replace("GLM-5-2", "deepseek-v4-flash")
                    )
                    if fixed != cur:
                        conn.execute(
                            """
                            UPDATE design_global_rule
                            SET rule_value = ?, updated_at = ?
                            WHERE rule_key = ?
                            """,
                            (fixed, now, key),
                        )
            except Exception:
                pass
            # Always fill empty「用途」from known map (never overwrite admin edits).
            try:
                for key, desc in STAGE_RULE_DESCRIPTIONS.items():
                    if not desc:
                        continue
                    conn.execute(
                        """
                        UPDATE design_global_rule
                        SET description = ?
                        WHERE rule_key = ?
                          AND (description IS NULL OR description = '')
                        """,
                        (desc, key),
                    )
            except Exception:
                pass
            # Patch frame-name map: append any scene=… pairs from defaults that are missing
            # (e.g. new scenes) without wiping admin edits to existing entries.
            default_names = STAGE_RULE_DEFAULTS.get("create.frame_name_by_scene") or ""
            row = conn.execute(
                "SELECT rule_value FROM design_global_rule WHERE rule_key = ?",
                ("create.frame_name_by_scene",),
            ).fetchone()
            if row and default_names:
                cur = str(row["rule_value"] or "")
                have = {
                    p.split("=", 1)[0].strip().lower()
                    for p in re.split(r"[;\n]+", cur)
                    if "=" in p
                }
                missing = [
                    p.strip()
                    for p in re.split(r"[;\n]+", default_names)
                    if "=" in p and p.split("=", 1)[0].strip().lower() not in have
                ]
                if missing:
                    patched = cur.rstrip(";") + (";" if cur.strip() else "") + ";".join(missing)
                    conn.execute(
                        "UPDATE design_global_rule SET rule_value = ?, updated_at = ? WHERE rule_key = ?",
                        (patched, time.time(), "create.frame_name_by_scene"),
                    )
            # One-time FULL wipe: rules + skill mega-prompts + execute flows.
            flag_row = conn.execute(
                "SELECT rule_value FROM design_global_rule WHERE rule_key = ?",
                ("legacy.agent_zero_v3",),
            ).fetchone()
            if not flag_row:
                now_z = time.time()
                conn.execute("DELETE FROM design_global_rule")
                try:
                    conn.execute("DELETE FROM design_skill")
                except Exception:
                    try:
                        conn.execute(
                            "UPDATE design_skill SET enabled = 0, updated_at = ?",
                            (now_z,),
                        )
                    except Exception:
                        pass
                try:
                    conn.execute("DELETE FROM design_execute_flow")
                except Exception:
                    try:
                        conn.execute(
                            "UPDATE design_execute_flow SET skill_ids = ?",
                            ("[]",),
                        )
                    except Exception:
                        pass
                try:
                    conn.execute(
                        """
                        INSERT INTO design_global_rule
                          (rule_key, rule_value, description, enabled, updated_at)
                        VALUES (?, ?, ?, 1, ?)
                        """,
                        (
                            "legacy.agent_zero_v3",
                            str(int(now_z)),
                            "全表清空 v3：rules/skills/flows 已删；Admin 仅留设计知识/美学/推理集群",
                            now_z,
                        ),
                    )
                except Exception:
                    conn.execute(
                        """
                        INSERT INTO design_global_rule (rule_key, rule_value, updated_at)
                        VALUES (?, ?, ?)
                        """,
                        ("legacy.agent_zero_v3", str(int(now_z)), now_z),
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

