"""Paint ops validation gate (contract + skill allowlist + placement)."""
from __future__ import annotations

from typing import Any

from services.design.ops.tool_ops_contract import extract_and_validate_tool_ops
from services.design.prompts.skill_store import filter_ops_by_skill_allowlist

def _validate_ops_payload(
    raw: Any,
    *,
    nodes: list[dict[str, Any]],
    frames: list[dict[str, Any]],
    rules: dict[str, str],
    skill_keys: list[str] | None = None,
    scene: str = "website",
) -> tuple[list[dict[str, Any]], list[str]]:
    step_ops, op_errors = extract_and_validate_tool_ops(
        _normalize_ops_payload(raw),
        scene_nodes=nodes,
        scene_frames=frames,
        rules=rules,
    )
    if not step_ops and isinstance(raw, str):
        step_ops, op_errors = extract_and_validate_tool_ops(
            raw,
            scene_nodes=nodes,
            scene_frames=frames,
            rules=rules,
        )
    if skill_keys:
        step_ops, allow_errs = filter_ops_by_skill_allowlist(
            step_ops, skill_keys=skill_keys, scene=scene
        )
        op_errors = list(op_errors or []) + list(allow_errs or [])
    return step_ops, op_errors


def _op_name(op: dict[str, Any]) -> str:
    return str(op.get("name") or op.get("op_key") or "").strip()


def _normalize_ops_payload(raw: Any) -> Any:
    """Accept op_key / ops aliases before schema validate."""
    if isinstance(raw, list):
        out = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            d = dict(item)
            if not (d.get("name") or d.get("type") or d.get("op") or d.get("tool")):
                ok = str(d.get("op_key") or d.get("opKey") or "").strip()
                if ok:
                    d["name"] = ok
            out.append(d)
        return out
    if isinstance(raw, dict):
        inner = raw.get("ops") or raw.get("tool_ops")
        if isinstance(inner, list):
            return {"ops": _normalize_ops_payload(inner)}
        return raw
    return raw



def validate_paint_ops(
    raw_ops: Any,
    *,
    scene_nodes: list[dict[str, Any]],
    scene_frames: list[dict[str, Any]],
    rules: dict[str, str],
    skill_keys: list[str] | None = None,
    scene: str = "website",
    runtime: Any = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Validate paint ops (allowlist / fields / ids / dedupe + optional placement)."""
    from services.design.runtime.host.placement import placement_errors_for_free_creates

    step_ops, op_errors = _validate_ops_payload(
        raw_ops,
        nodes=scene_nodes,
        frames=scene_frames,
        rules=rules,
        skill_keys=skill_keys,
        scene=scene,
    )
    if step_ops and runtime is not None:
        place_errs = placement_errors_for_free_creates(runtime, step_ops)
        if place_errs:
            return [], list(op_errors or []) + list(place_errs)
    return step_ops, list(op_errors or [])
