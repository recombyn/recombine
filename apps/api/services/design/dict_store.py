"""Design dictionary CRUD."""
from __future__ import annotations
import time
from typing import Any
from services.db import connect
from services.design.catalog import ensure_design_catalog

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
    ("precheck_signal", "long_prompt", "长提示词", 10),
    ("precheck_signal", "multi_board", "多画板", 20),
    ("precheck_signal", "brand_system", "品牌系统", 30),
    ("precheck_signal", "data_heavy", "数据看板", 40),
    ("precheck_signal", "full_page", "整页产出", 50),
    ("precheck_signal", "print_spec", "印刷规范", 60),
    ("library_kind", "style", '风格系统 (System)', 10),
    ("library_kind", "template", '构图模板 (Template)', 20),
    ("library_kind", "icon", '图标', 30),
    ("library_kind", "font", '字体', 40),
    ("library_kind", "other", '其他', 50),
    ("library_kind", "brush", '\u7b14\u5237\u8f6e', 55),
    ("library_kind", "prompt", '\u63d0\u793a\u8bcd\u6a21\u5f0f (Prompt)', 60),
    ("output_format", "json", "JSON", 10),
    ("output_format", "text", '文本', 20),
]


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

def ensure_design_dicts() -> None:
    ensure_design_catalog()
    now = time.time()
    with connect() as conn:
        for dict_type, code, label, sort_order in DICT_DEFAULTS:
            row = conn.execute(
                "SELECT id, label FROM design_dict WHERE dict_type = ? AND code = ?",
                (dict_type, code),
            ).fetchone()
            if row:
                # Refresh canonical labels for OD role naming (style/template/prompt).
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
        conn.commit()

def list_dicts(*, dict_type: str | None = None, enabled: bool | None = True) -> list[dict[str, Any]]:
    ensure_design_dicts()
    where: list[str] = ["1=1"]
    params: list[Any] = []
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

def upsert_dict(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_design_dicts()
    dict_type = str(payload.get("dictType") or "").strip()
    code = str(payload.get("code") or "").strip().lower().replace(" ", "_")
    label = str(payload.get("label") or "").strip()
    if not dict_type or not code or not label:
        raise ValueError("dictType, code, label required")
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
        cur = conn.execute(
            "UPDATE design_dict SET enabled = 0, updated_at = ? WHERE id = ?",
            (time.time(), int(item_id)),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0
