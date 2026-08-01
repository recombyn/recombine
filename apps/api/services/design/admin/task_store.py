"""design_task / layer-lock persistence for agent runs."""
from __future__ import annotations

import json
import time
from typing import Any

from services.db import connect

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

