from __future__ import annotations

"""Paint-stage tool kit, artboard helpers, and ops logging."""

import logging
import re
from typing import Any
from app.services.design.ops.tool_ops_contract import format_canvas_tools_details
from app.services.design.runtime.host import (
    assemble_stage_system,
    interaction_mode_rules_pack,
    require_prompt_pack,
)
from app.services.design.runtime.host.ops_gate import _op_name
from app.services.design.runtime.host.placement import (
    _focus_frame_from_rt,
    _format_spatial_placement,
)
from app.services.design.runtime.models_route import normalize_user_intent
from app.services.design.runtime.graph.state import (
    _DEFAULT_PAINT_CREATE_TOOLS,
    _DEFAULT_PAINT_EDIT_TOOLS,
    _LEAN_PAINT_PROMPT_CHARS,
)

_log = logging.getLogger(__name__)



def _ops_patch_too_broad(
    ops: list[dict[str, Any]],
    scene_nodes: list[dict[str, Any]],
    *,
    intent: str,
) -> tuple[bool, str]:
    """Heuristic: edit rounds should not wipe / flood the canvas in one batch."""
    if (intent or "").strip().lower() == "create":
        return False, ""
    batch = [o for o in (ops or []) if isinstance(o, dict)]
    if not batch:
        return False, ""
    names = [_op_name(o) for o in batch]
    wipe = {"clear_canvas", "reset_scene", "delete_all", "clear_artboard"}
    if any(n in wipe for n in names):
        return True, "single-round canvas wipe op"
    deletes = [
        n for n in names if n.startswith("delete") or n in ("remove_node", "remove_nodes")
    ]
    creates = [
        n
        for n in names
        if n.startswith("create_") or n in ("add_node", "add_text", "add_image", "add_shape")
    ]
    n_scene = len([n for n in (scene_nodes or []) if isinstance(n, dict) and n.get("id")])
    if n_scene >= 4 and len(deletes) >= max(6, int(0.55 * n_scene)):
        return True, f"too many deletes ({len(deletes)}/{n_scene})"
    if n_scene >= 1 and len(creates) > 40:
        return True, f"too many creates on edit ({len(creates)})"
    if len(batch) > 60:
        return True, f"too many ops ({len(batch)})"
    return False, ""

def _structure_verify_issues(
    *,
    nodes: list[dict[str, Any]],
    frames: list[dict[str, Any]],
    painted: bool,
    intent: str,
) -> list[str]:
    """Deterministic canvas sanity checks ? fact flags only, no routing."""
    if not painted:
        return []
    issues: list[str] = []
    clean_nodes = [n for n in (nodes or []) if isinstance(n, dict) and n.get("id")]
    clean_frames = [f for f in (frames or []) if isinstance(f, dict) and f.get("id")]
    intent_l = (intent or "").strip().lower()
    if intent_l in ("edit", "create") and not clean_nodes and not clean_frames:
        issues.append("canvas empty after apply (no nodes/frames)")
        return issues
    if (
        intent_l in ("edit", "create")
        and clean_frames
        and not clean_nodes
        and all(bool(f.get("is_empty")) for f in clean_frames)
    ):
        issues.append("artboard still empty after apply")
    zero_box = 0
    for n in clean_nodes[:80]:
        try:
            w = float(n.get("w") or n.get("width") or 0)
            h = float(n.get("h") or n.get("height") or 0)
        except (TypeError, ValueError):
            w, h = 0.0, 0.0
        if w <= 0 or h <= 0:
            zero_box += 1
    if clean_nodes and zero_box >= max(3, int(0.7 * len(clean_nodes))):
        issues.append(f"most nodes have invalid size ({zero_box}/{len(clean_nodes)})")
    return issues

def _ops_have_create_frame(ops: list[dict[str, Any]]) -> bool:
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("op_key") or "").strip()
        if name == "create_frame":
            return True
    return False

def _wh_from_create_frame_ops(ops: list[dict[str, Any]]) -> tuple[int, int]:
    """First create_frame width/height in a validated op batch."""
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("op_key") or "").strip()
        if name != "create_frame":
            continue
        args = o.get("args") if isinstance(o.get("args"), dict) else {}
        try:
            fw = int(args.get("width") or args.get("w") or 0)
            fh = int(args.get("height") or args.get("h") or 0)
        except (TypeError, ValueError):
            continue
        if fw > 0 and fh > 0:
            return fw, fh
    return 0, 0

def _strip_create_frame_ops(ops: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Host opens the artboard; drop model create_frame to avoid a second plate."""
    out: list[dict[str, Any]] = []
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or o.get("op_key") or "").strip()
        if name == "create_frame":
            continue
        out.append(o)
    return out

def _prompt_compact_len(prompt: str | None) -> int:
    return len(re.sub(r"\s+", "", str(prompt or "")))

def _is_lean_paint_turn(rt: Any) -> bool:
    """canvas_op (or short no-vision) turns — slim paint prompt."""
    if bool(getattr(rt, "images", None)):
        return False
    if normalize_user_intent(getattr(rt, "classified_intent", None)) == "canvas_op":
        return True
    return _prompt_compact_len(getattr(rt, "prompt", None)) <= _LEAN_PAINT_PROMPT_CHARS

def _paint_tool_keys_for_turn(rt: Any) -> list[str]:
    """Structural paint tool kit — not hard-coded to one shape type.

    - Always: create_shape + create_text.
    - create_frame: design-grade create on empty / no artboard — not canvas_op adds.
    - create_image when attachments.
    - update/delete when paint_lane=edit and scene has nodes.
    - Plus any tools already requested via need_tools.
    """
    from app.services.design.runtime.graph.turns import _resolve_paint_want
    st = rt.run
    classified = normalize_user_intent(
        getattr(rt, "classified_intent", None) or st.intent or ""
    )
    want = _resolve_paint_want(rt)
    has_images = bool(getattr(rt, "images", None))
    nodes = [
        n for n in (getattr(rt, "scene_nodes", None) or [])
        if isinstance(n, dict) and n.get("id")
    ]

    keys: list[str] = ["create_shape", "create_text"]
    # design/create: expose create_frame; paint_system decides when to use it (user intent).
    # Ambient FOCUS / existing frames must not hide the tool.
    allow_frame = classified == "design" and want == "create"
    if allow_frame:
        keys.insert(0, "create_frame")
    if has_images:
        keys.append("create_image")
    if want == "edit" and nodes:
        for k in ("update_node", "delete_nodes"):
            if k not in keys:
                keys.append(k)

    for raw in st.tools_loaded or []:
        k = str(raw or "").strip()
        if k and k not in keys:
            keys.append(k)
    return keys[:8]

def _ensure_paint_tool_details(rt: Any) -> None:
    """Guarantee TOOL_DETAILS before the paint stage (no narrate-only escape)."""
    from app.services.design.runtime.graph.turns import _resolve_paint_want
    st = rt.run
    keys = _paint_tool_keys_for_turn(rt)
    if not keys:
        want = _resolve_paint_want(rt, st.intent)
        keys = list(
            _DEFAULT_PAINT_EDIT_TOOLS if want == "edit" else _DEFAULT_PAINT_CREATE_TOOLS
        )
    details = format_canvas_tools_details(keys, rules=rt.rules)
    if not details:
        return
    rt.pending_tool_details = "TOOL_DETAILS:\n" + details
    for k in keys:
        if k not in st.tools_loaded:
            st.tools_loaded.append(k)

def _paint_ops_system(rt: Any) -> str:
    """Paint stage system via assemble_stage_system (pack-only)."""
    flags = getattr(rt, "flags", None)
    if not isinstance(flags, dict):
        flags = {}
    ask_mode = str(flags.get("mode") or "").strip().lower() == "ask"
    return assemble_stage_system(
        rt.rules,
        stage="paint",
        ask_mode=ask_mode,
        persona=str(getattr(rt, "persona", "") or ""),
    )

def _paint_ops_user(rt: Any) -> str:
    from app.services.design.runtime.graph.turns import _thought_prompt_variables
    vars_ = _thought_prompt_variables(rt)
    spatial = (
        getattr(rt, "spatial_summary", None)
        if isinstance(getattr(rt, "spatial_summary", None), dict)
        else {}
    )
    focus_frame = _focus_frame_from_rt(rt)
    spatial_hint = _format_spatial_placement(spatial, focus_frame=focus_frame)
    lean = _is_lean_paint_turn(rt)
    # Lean: tools + scene only — drop skill/knowledge/aesthetics essays for short adds.
    if lean:
        pending = str(getattr(rt, "pending_tool_details", "") or "").strip()
    else:
        pending = vars_["pending_blocks"]
    parts = [
        f"USER_PROMPT:\n{vars_['prompt']}",
        f"CANVAS_SIZE: {vars_['canvas_size']}",
        f"SCENE: {vars_['scene']}",
        vars_["scene_digest"],
        spatial_hint,
        pending,
    ]
    if not lean:
        parts.append(vars_["plan_block"])
        parts.append(vars_["edit_context"])
    parts.append(vars_["error_block"])
    parts.append("Emit PaintOpsSchema now: non-empty tool_ops first.")
    return "\n\n".join(p for p in parts if str(p or "").strip())

def _op_errors_for_log(errors: list[Any] | None, *, limit: int = 20) -> list[str] | None:
    out: list[str] = []
    for e in list(errors or [])[:limit]:
        s = str(e or "").strip()
        if s:
            out.append(s[:400])
    return out or None

def _op_error_codes(errors: list[Any] | None, *, limit: int = 4) -> list[str]:
    codes: list[str] = []
    for e in list(errors or []):
        s = str(e or "").strip()
        if not s:
            continue
        code = s
        if "code=" in s:
            code = s.split("code=", 1)[1].split(";", 1)[0].strip()
        if code and code not in codes:
            codes.append(code)
        if len(codes) >= limit:
            break
    return codes

def _ops_for_log(ops: list[dict[str, Any]] | None, *, limit: int = 30) -> list[dict[str, Any]]:
    """Compact tool ops for execution_log (name + truncated args)."""
    out: list[dict[str, Any]] = []
    for op in list(ops or [])[:limit]:
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or op.get("op") or op.get("tool") or "").strip()
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        slim: dict[str, Any] = {}
        for k, v in list(args.items())[:12]:
            key = str(k)[:48]
            if isinstance(v, (int, float, bool)) or v is None:
                slim[key] = v
            elif isinstance(v, str):
                slim[key] = v[:160]
            elif isinstance(v, (list, dict)):
                slim[key] = str(v)[:160]
            else:
                slim[key] = str(v)[:80]
        row: dict[str, Any] = {"name": name or "op"}
        if slim:
            row["args"] = slim
        out.append(row)
    return out

__all__ = [
    '_ops_patch_too_broad',
    '_structure_verify_issues',
    '_ops_have_create_frame',
    '_wh_from_create_frame_ops',
    '_strip_create_frame_ops',
    '_prompt_compact_len',
    '_is_lean_paint_turn',
    '_paint_tool_keys_for_turn',
    '_ensure_paint_tool_details',
    '_paint_ops_system',
    '_paint_ops_user',
    '_op_errors_for_log',
    '_op_error_codes',
    '_ops_for_log',
]
