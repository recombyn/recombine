"""Design dictionary CRUD."""
from __future__ import annotations
import threading
import time
from typing import Any
from services.db import connect, dialect
from services.design.schema import ensure_design_tables

# Catalog of dict types lives as rows under this reserved dict_type.
TYPE_CATALOG = "__types__"

_DICTS_READY = False
_DICTS_LOCK = threading.RLock()
# Bump when DICT_TYPE_DEFAULTS / DICT_DEFAULTS gain new rows so warm processes re-seed.
_DICT_SEED_REV = 2
_seeded_rev = 0

DICT_TYPE_DEFAULTS = [
    ("scene", "场景", 10),
    ("skill_category", "技能分类", 20),
    ("output_format", "输出格式", 30),
    ("task_tier", "任务难度", 40),
    ("precheck_block", "预检拦截", 50),
    ("library_kind", "素材类型", 60),
    ("flow_ask_slot", "流程追问槽位", 70),
    ("flow_ask_never", "流程不问项", 80),
    ("flow_edge_condition", "流程边条件", 90),
    ("flow_phase", "流程运行角色", 100),
]

DICT_DEFAULTS = [
    ("scene", "all", '全部场景', 0),
    ("scene", "website", "网站 Website", 10),
    ("scene", "mobile", "移动应用 Mobile", 20),
    ("scene", "image", "图像 Image", 30),
    ("scene", "poster", "海报 Poster", 40),
    ("skill_category", "plan", '需求规划', 10),
    ("skill_category", "layout", '版式', 20),
    ("skill_category", "validate", '校验', 30),
    ("skill_category", "refine", '精修', 40),
    ("skill_category", "summary", '总结', 50),
    ("skill_category", "other", '其他', 100),
    ("precheck_block", "empty_prompt", '空提示词', 10),
    ("precheck_block", "oversized_canvas", '画布过大', 20),
    ("precheck_block", "banned_words", '违禁词', 30),
    ("task_tier", "simple", '简单', 10),
    ("task_tier", "medium", '中等', 20),
    ("task_tier", "complex", '复杂', 30),
    ("library_kind", "style", '风格系统 (System)', 10),
    ("library_kind", "template", '构图模板 (Template)', 20),
    ("library_kind", "icon", '图标', 30),
    ("library_kind", "font", '字体', 40),
    ("library_kind", "other", '其他', 50),
    ("library_kind", "brush", '\u7b14\u5237\u8f6e', 55),
    ("library_kind", "prompt", '\u63d0\u793a\u8bcd\u6a21\u5f0f (Prompt)', 60),
    ("output_format", "json", "JSON", 10),
    ("output_format", "text", '文本', 20),
    # —— 流程设计：Ask 追问清单（Admin 可增删；设计器从字典拉取）——
    ("flow_ask_slot", "goal", "要做什么", 10),
    ("flow_ask_slot", "brand", "品牌/产品名", 20),
    ("flow_ask_slot", "copy", "核心文案", 30),
    ("flow_ask_slot", "audience", "受众", 40),
    ("flow_ask_slot", "layout", "版式类型", 50),
    ("flow_ask_slot", "constraints", "硬约束", 60),
    ("flow_ask_slot", "style", "风格偏好", 70),
    ("flow_ask_never", "canvas_size", "画布尺寸", 10),
    ("flow_ask_never", "model_choice", "用哪个模型", 20),
    # —— 主线边条件（intent / flags；无 FE mode 分叉）——
    ("flow_edge_condition", "mode=ask", "Ask 模式", 5),
    ("flow_edge_condition", "mode=agent", "Agent 主线", 10),
    ("flow_edge_condition", "short_plan_on", "开启短计划", 50),
    ("flow_edge_condition", "plan_done", "计划完成", 60),
    ("flow_edge_condition", "llm_call", "调用主模型", 70),
    ("flow_edge_condition", "need_resources", "需要资源", 80),
    ("flow_edge_condition", "need_knowledge", "需要知识", 90),
    ("flow_edge_condition", "need_aesthetics", "需要美学", 100),
    ("flow_edge_condition", "need_tools", "需要工具", 110),
    ("flow_edge_condition", "fetched", "已拉取", 120),
    ("flow_edge_condition", "ready", "资源就绪", 130),
    ("flow_edge_condition", "next_round", "下一轮思考", 140),
    ("flow_edge_condition", "dual_on", "开启双采样", 150),
    ("flow_edge_condition", "ops_invalid", "操作非法", 160),
    ("flow_edge_condition", "ops_valid", "操作合法", 170),
    ("flow_edge_condition", "reflect_left", "仍可反思", 180),
    ("flow_edge_condition", "no_reflect", "不可再反思", 190),
    ("flow_edge_condition", "intent=ask", "意图=追问", 200),
    ("flow_edge_condition", "intent=chat", "意图=闲聊", 201),
    ("flow_edge_condition", "intent=done", "意图=完成", 202),
    ("flow_edge_condition", "info_insufficient", "信息不足", 210),
    ("flow_edge_condition", "info_enough", "信息足够", 220),
    ("flow_edge_condition", "ask_mode_ops", "提议案", 230),
    ("flow_edge_condition", "pick_best", "选最优采样", 240),
    ("flow_edge_condition", "tool_ops", "执行工具", 250),
    ("flow_edge_condition", "wait_scene", "等待场景", 260),
    ("flow_edge_condition", "ok", "成功结束", 270),
    ("flow_edge_condition", "op_failed", "操作失败", 280),
    ("flow_edge_condition", "retry", "重试思考", 290),
    ("flow_edge_condition", "await_user", "等待用户回答", 300),
    ("flow_edge_condition", "await_confirm", "等待用户确认", 310),
    ("flow_edge_condition", "reflect_exhausted", "反思耗尽", 320),
    ("flow_edge_condition", "fatal", "致命错误", 330),
    ("flow_edge_condition", "fail_end", "失败结束", 340),
    # —— 运行角色（phaseKey）——
    ("flow_phase", "start", "流程入口", 10),
    ("flow_phase", "route", "任务分流", 20),
    ("flow_phase", "mode_fork", "Ask / Agent 分线", 30),
    ("flow_phase", "memory", "注入会话记忆", 40),
    ("flow_phase", "plan", "短计划", 50),
    ("flow_phase", "model_route", "模型路由", 60),
    ("flow_phase", "thought", "Agent 主思考", 70),
    ("flow_phase", "ask_thought", "Ask 主思考", 80),
    ("flow_phase", "resource_fork", "资源并行网关", 90),
    ("flow_phase", "need_knowledge", "申请知识", 100),
    ("flow_phase", "need_aesthetics", "申请美学", 110),
    ("flow_phase", "need_tools", "申请工具", 120),
    ("flow_phase", "knowledge_details", "注入知识详情", 130),
    ("flow_phase", "aesthetics_details", "注入美学详情", 140),
    ("flow_phase", "tool_details", "注入工具详情", 150),
    ("flow_phase", "resource_join", "资源汇聚", 160),
    ("flow_phase", "dual_sample", "双采样", 170),
    ("flow_phase", "validate_fail", "校验失败分支", 180),
    ("flow_phase", "reflect", "反思重试", 190),
    ("flow_phase", "clarify", "追问用户", 200),
    ("flow_phase", "propose", "提议确认", 210),
    ("flow_phase", "hydrate", "生图水合", 220),
    ("flow_phase", "action", "执行画布操作", 230),
    ("flow_phase", "observe", "观察结果", 240),
    ("flow_phase", "error", "错误出口", 250),
    ("flow_phase", "end", "流程结束", 260),
]


def _norm_type_code(raw: str) -> str:
    return str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")


def _pub_dict(r: Any) -> dict[str, Any]:
    return {
        "id": int(r["id"]),
        "dictType": r["dict_type"],
        "code": r["code"],
        "label": r["label"],
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def _pub_type(r: Any) -> dict[str, Any]:
    return {
        "id": int(r["id"]),
        "code": r["code"],
        "label": r["label"],
        "sortOrder": int(r["sort_order"] or 0),
        "enabled": bool(int(r["enabled"] or 0)),
        "updatedAt": int(float(r["updated_at"]) * 1000) if r["updated_at"] else None,
    }


def _seed_dict_rows(conn: Any, *, now: float) -> None:
    """Insert missing default dict items / types (idempotent)."""
    conn.execute("DELETE FROM design_dict WHERE dict_type = ?", ("precheck_signal",))
    for dict_type, code, label, sort_order in DICT_DEFAULTS:
        row = conn.execute(
            "SELECT id, label FROM design_dict WHERE dict_type = ? AND code = ?",
            (dict_type, code),
        ).fetchone()
        if row:
            if dict_type == "library_kind" and code in ("style", "template", "prompt"):
                if str(row["label"] or "") != label:
                    conn.execute(
                        "UPDATE design_dict SET label=?, sort_order=?, updated_at=? WHERE id=?",
                        (label, sort_order, now, int(row["id"])),
                    )
            continue
        conn.execute(
            "INSERT INTO design_dict (dict_type, code, label, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
            (dict_type, code, label, sort_order, now, now),
        )
    for code, label, sort_order in DICT_TYPE_DEFAULTS:
        row = conn.execute(
            "SELECT id FROM design_dict WHERE dict_type = ? AND code = ?",
            (TYPE_CATALOG, code),
        ).fetchone()
        if row:
            continue
        conn.execute(
            "INSERT INTO design_dict (dict_type, code, label, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
            (TYPE_CATALOG, code, label, sort_order, now, now),
        )


def ensure_design_dicts() -> None:
    """Seed dict rows only — avoid init_schema()/full catalog (slow on remote MySQL)."""
    global _DICTS_READY, _seeded_rev
    if _DICTS_READY and _seeded_rev >= _DICT_SEED_REV:
        return
    with _DICTS_LOCK:
        if _DICTS_READY and _seeded_rev >= _DICT_SEED_REV:
            return
        mysql = dialect() == "mysql"
        now = time.time()
        with connect() as conn:
            ensure_design_tables(conn, mysql=mysql)
            _seed_dict_rows(conn, now=now)
            conn.commit()
        _seeded_rev = _DICT_SEED_REV
        _DICTS_READY = True


def list_dicts(*, dict_type: str | None = None, enabled: bool | None = True) -> list[dict[str, Any]]:
    ensure_design_dicts()
    where: list[str] = ["dict_type <> ?"]
    params: list[Any] = [TYPE_CATALOG]
    if dict_type:
        where.append("dict_type = ?")
        params.append(dict_type.strip())
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    sql = "SELECT * FROM design_dict WHERE " + " AND ".join(where) + " ORDER BY dict_type ASC, sort_order ASC, id ASC"
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_pub_dict(r) for r in rows]


def list_dict_types(*, enabled: bool | None = None) -> list[dict[str, Any]]:
    """Dictionary categories for the left tree."""
    ensure_design_dicts()
    where = ["dict_type = ?"]
    params: list[Any] = [TYPE_CATALOG]
    if enabled is True:
        where.append("enabled = 1")
    elif enabled is False:
        where.append("enabled = 0")
    sql = "SELECT * FROM design_dict WHERE " + " AND ".join(where) + " ORDER BY sort_order ASC, id ASC"
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_pub_type(r) for r in rows]


def upsert_dict_type(payload: dict[str, Any]) -> dict[str, Any]:
    """Create/update a dict type. Renaming `code` migrates all item rows."""
    ensure_design_dicts()
    code = _norm_type_code(str(payload.get("code") or ""))
    label = str(payload.get("label") or "").strip()
    if not code or not label:
        raise ValueError("code, label required")
    if code == TYPE_CATALOG or code.startswith("__"):
        raise ValueError("reserved type code")
    sort_order = int(payload.get("sortOrder") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    item_id = payload.get("id")
    now = time.time()
    with connect() as conn:
        if item_id:
            prev = conn.execute(
                "SELECT * FROM design_dict WHERE id = ? AND dict_type = ?",
                (int(item_id), TYPE_CATALOG),
            ).fetchone()
            if not prev:
                raise ValueError("type not found")
            old_code = str(prev["code"])
            if code != old_code:
                clash = conn.execute(
                    "SELECT id FROM design_dict WHERE dict_type = ? AND code = ? AND id <> ?",
                    (TYPE_CATALOG, code, int(item_id)),
                ).fetchone()
                if clash:
                    raise ValueError("type code already exists")
                # Migrate item rows to the new type key.
                conn.execute(
                    "UPDATE design_dict SET dict_type = ?, updated_at = ? WHERE dict_type = ?",
                    (code, now, old_code),
                )
            conn.execute(
                "UPDATE design_dict SET code=?, label=?, sort_order=?, enabled=?, updated_at=? WHERE id=?",
                (code, label, sort_order, enabled, now, int(item_id)),
            )
            row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        else:
            existing = conn.execute(
                "SELECT id FROM design_dict WHERE dict_type = ? AND code = ?",
                (TYPE_CATALOG, code),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE design_dict SET label=?, sort_order=?, enabled=?, updated_at=? WHERE dict_type=? AND code=?",
                    (label, sort_order, enabled, now, TYPE_CATALOG, code),
                )
                row = conn.execute(
                    "SELECT * FROM design_dict WHERE dict_type = ? AND code = ?",
                    (TYPE_CATALOG, code),
                ).fetchone()
            else:
                cur = conn.execute(
                    "INSERT INTO design_dict (dict_type, code, label, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (TYPE_CATALOG, code, label, sort_order, enabled, now, now),
                )
                row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(cur.lastrowid),)).fetchone()
        conn.commit()
    return _pub_type(row)


def delete_dict_type(type_id: int) -> bool:
    """Remove a type catalog row and soft-disable all its items."""
    ensure_design_dicts()
    now = time.time()
    with connect() as conn:
        row = conn.execute(
            "SELECT code FROM design_dict WHERE id = ? AND dict_type = ?",
            (int(type_id), TYPE_CATALOG),
        ).fetchone()
        if not row:
            return False
        code = str(row["code"])
        conn.execute(
            "UPDATE design_dict SET enabled = 0, updated_at = ? WHERE dict_type = ?",
            (now, code),
        )
        conn.execute("DELETE FROM design_dict WHERE id = ?", (int(type_id),))
        conn.commit()
    return True


def upsert_dict(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_dicts()
    dict_type = _norm_type_code(str(payload.get("dictType") or ""))
    code = str(payload.get("code") or "").strip().lower().replace(" ", "_")
    label = str(payload.get("label") or "").strip()
    if not dict_type or not code or not label:
        raise ValueError("dictType, code, label required")
    if dict_type == TYPE_CATALOG or dict_type.startswith("__"):
        raise ValueError("reserved dictType")
    sort_order = int(payload.get("sortOrder") or 0)
    enabled = 1 if payload.get("enabled", True) else 0
    item_id = payload.get("id")
    now = time.time()
    with connect() as conn:
        if item_id:
            conn.execute(
                "UPDATE design_dict SET dict_type=?, code=?, label=?, sort_order=?, enabled=?, updated_at=? WHERE id=?",
                (dict_type, code, label, sort_order, enabled, now, int(item_id)),
            )
            row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        else:
            existing = conn.execute(
                "SELECT id FROM design_dict WHERE dict_type = ? AND code = ?",
                (dict_type, code),
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE design_dict SET label=?, sort_order=?, enabled=?, updated_at=? WHERE dict_type=? AND code=?",
                    (label, sort_order, enabled, now, dict_type, code),
                )
                row = conn.execute(
                    "SELECT * FROM design_dict WHERE dict_type = ? AND code = ?",
                    (dict_type, code),
                ).fetchone()
            else:
                cur = conn.execute(
                    "INSERT INTO design_dict (dict_type, code, label, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (dict_type, code, label, sort_order, enabled, now, now),
                )
                row = conn.execute("SELECT * FROM design_dict WHERE id = ?", (int(cur.lastrowid),)).fetchone()
        conn.commit()
    return _pub_dict(row)


def soft_delete_dict(item_id: int) -> bool:
    ensure_design_dicts()
    with connect() as conn:
        row = conn.execute("SELECT dict_type FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        if not row or str(row["dict_type"]) == TYPE_CATALOG:
            return False
        cur = conn.execute(
            "UPDATE design_dict SET enabled = 0, updated_at = ? WHERE id = ?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0


def hard_delete_dict(item_id: int) -> bool:
    ensure_design_dicts()
    with connect() as conn:
        row = conn.execute("SELECT dict_type FROM design_dict WHERE id = ?", (int(item_id),)).fetchone()
        if not row or str(row["dict_type"]) == TYPE_CATALOG:
            return False
        cur = conn.execute("DELETE FROM design_dict WHERE id = ?", (int(item_id),))
        conn.commit()
        return (cur.rowcount or 0) > 0
