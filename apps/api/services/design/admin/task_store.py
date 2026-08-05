"""design_task / layer-lock persistence for agent runs."""
from __future__ import annotations

import json
import secrets
import time
from typing import Any

from services.db import connect

# Terminal vs resumable run statuses (LangGraph checkpoint lifecycle).
STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_WAITING_CLIENT = "waiting_client"
STATUS_PAUSED = "paused"
STATUS_SUCCESS = "success"
STATUS_ERROR = "error"
STATUS_CANCELLED = "cancelled"

RESUMABLE_STATUSES = frozenset(
    {STATUS_PAUSED, STATUS_WAITING_CLIENT, STATUS_ERROR}
)
TERMINAL_STATUSES = frozenset({STATUS_SUCCESS, STATUS_CANCELLED})


def _update_task(task_id: str, **fields: Any) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values())
    vals.append(time.time())
    vals.append(task_id)
    with connect() as conn:
        conn.execute(
            f"UPDATE design_task SET {cols}, updated_at = ? WHERE id = ?",
            vals,
        )
        conn.commit()


def _insert_task(row: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO design_task (
                id, user_id, canvas_id, scene, skill_group_id, task_type,
                user_selected_model, actual_models, target_layer_id, current_skill_index,
                status, hold_credits, charged_credits, total_tokens, prompt, canvas_size,
                result_svg, error_message, meta_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["user_id"],
                row.get("canvas_id"),
                row.get("scene"),
                row.get("skill_group_id"),
                row["task_type"],
                row.get("user_selected_model"),
                row.get("actual_models"),
                row.get("target_layer_id"),
                row.get("current_skill_index", 0),
                row.get("status", "queued"),
                row.get("hold_credits", 0),
                row.get("charged_credits", 0),
                row.get("total_tokens", 0),
                row.get("prompt"),
                row.get("canvas_size"),
                row.get("result_svg"),
                row.get("error_message"),
                row.get("meta_json"),
                row["created_at"],
                row["updated_at"],
            ),
        )
        conn.commit()


def get_design_task(task_id: str) -> dict[str, Any] | None:
    tid = str(task_id or "").strip()
    if not tid:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, canvas_id, scene, skill_group_id, task_type,
                   user_selected_model, actual_models, target_layer_id,
                   current_skill_index, status, hold_credits, charged_credits,
                   total_tokens, prompt, canvas_size, result_svg, error_message,
                   meta_json, created_at, updated_at
            FROM design_task WHERE id = ?
            """,
            (tid,),
        ).fetchone()
    if not row:
        return None
    return dict(row)


def parse_task_meta(meta_json: Any) -> dict[str, Any]:
    if isinstance(meta_json, dict):
        return dict(meta_json)
    raw = str(meta_json or "").strip()
    if not raw:
        return {}
    try:
        got = json.loads(raw)
        return got if isinstance(got, dict) else {}
    except Exception:
        return {}


def get_run_lifecycle(meta: dict[str, Any] | None) -> dict[str, Any]:
    lc = (meta or {}).get("run_lifecycle")
    return dict(lc) if isinstance(lc, dict) else {}


def new_resume_token() -> str:
    return secrets.token_urlsafe(16)


def build_run_lifecycle(
    *,
    thread_id: str,
    resumable: bool,
    interrupt_kind: str | None = None,
    resume_token: str | None = None,
    settled: bool = False,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "thread_id": str(thread_id or "").strip(),
        "resumable": bool(resumable),
        "interrupt_kind": (str(interrupt_kind or "").strip() or None),
        "checkpoint_at": time.time(),
        "resume_token": resume_token or new_resume_token(),
        "settled": bool(settled),
    }
    if extra:
        for k, v in extra.items():
            if v is not None:
                out[k] = v
    return out


def merge_task_meta(task_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Deep-merge top-level meta keys; ``run_lifecycle`` is replaced when provided."""
    tid = str(task_id or "").strip()
    row = get_design_task(tid) if tid else None
    meta = parse_task_meta(row.get("meta_json") if row else None)
    for k, v in (patch or {}).items():
        if k == "run_lifecycle" and isinstance(v, dict):
            prev = get_run_lifecycle(meta)
            merged = {**prev, **v}
            meta["run_lifecycle"] = merged
        else:
            meta[k] = v
    _update_task(tid, meta_json=json.dumps(meta, ensure_ascii=False))
    return meta


def task_is_resumable(row: dict[str, Any] | None) -> bool:
    if not row:
        return False
    status = str(row.get("status") or "").strip()
    if status not in RESUMABLE_STATUSES:
        return False
    if status == STATUS_ERROR:
        meta = parse_task_meta(row.get("meta_json"))
        lc = get_run_lifecycle(meta)
        if lc.get("resumable") is False:
            return False
    return True


def _lock_layers(canvas_id: str, target_layer_id: str, all_layer_ids: list[str]) -> None:
    now = time.time()
    with connect() as conn:
        for lid in all_layer_ids:
            locked = 0 if lid == target_layer_id else 1
            allowed = json.dumps(["layer_partial"]) if lid == target_layer_id else json.dumps([])
            forbidden = (
                json.dumps([])
                if lid == target_layer_id
                else json.dumps(["position", "size", "structure", "color"])
            )
            conn.execute(
                """
                INSERT INTO design_layer_lock (
                    canvas_id, layer_id, locked, allowed_skills, forbidden_attrs, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (canvas_id, lid, locked, allowed, forbidden, now, now),
            )
        conn.commit()
