from __future__ import annotations

"""SSE emit helpers and canvas chrome events for graph nodes."""

import logging
from typing import Any
from langgraph.config import get_stream_writer
from app.services.design.prompts.rules_text import _as_text
from app.services.design.readpath.canvas_scene import explicit_canvas_size
from app.services.design.runtime.host import (
    interaction_mode_rules_pack,
    require_prompt_pack,
)
from app.services.design.runtime.graph.state import AgentRunState

_log = logging.getLogger(__name__)



def _should_early_open_artboard(_rt: Any) -> bool:
    """Do not invent an artboard before paint.

    Infinite canvas: shapes/text need no plate. A plate opens only when paint
    emits ``create_frame`` (see ``_emit_canvas_size_from_ops``).
    """
    return False

def _resolve_loading_wh(rt: Any) -> tuple[int, int]:
    """Concrete WxH for early loading plate (client lock or scene stock default)."""
    from app.services.design.runtime.graph.scene_log import _resolve_wh
    try:
        ow, oh = int(rt.w or 0), int(rt.h or 0)
    except (TypeError, ValueError):
        ow, oh = 0, 0
    if ow > 0 and oh > 0:
        return ow, oh
    return _resolve_wh(
        canvas_size=rt.canvas_size,
        scene_key=str(rt.scene_key or ""),
        rules=rt.rules or {},
        scene_frames=list(rt.scene_frames or []),
        focus_id=str(rt.focus_id or ""),
    )

def _emit_canvas_size_step(
    rt: Any,
    *,
    ow: int,
    oh: int,
    design_loading: bool = True,
    reason: str = "size",
) -> bool:
    """SSE: open loading plate + process row「画布尺寸」so shimmer can start early."""
    if ow <= 0 or oh <= 0:
        return False
    if str(rt.flags.get("mode") or "") == "ask":
        return False
    st = rt.run
    size = f"{ow}x{oh}"
    prev = str(rt.flags.get("artboard_size") or "")
    already = bool(rt.flags.get("artboard_opened")) and prev == size
    if not already:
        _emit(
            {
                "type": "status",
                "task_id": st.task_id,
                "trace_id": st.trace_id,
                "open_artboard": True,
                "canvas_width": ow,
                "canvas_height": oh,
                "canvas_size": size,
                "design_loading": bool(design_loading)
            }
        )
        rt.flags["artboard_opened"] = True
        rt.flags["artboard_size"] = size
    if not explicit_canvas_size(rt.canvas_size):
        rt.canvas_size = size
        rt.w, rt.h = ow, oh
    elif rt.w <= 0 or rt.h <= 0:
        rt.w, rt.h = ow, oh
    # One timeline row per size (skip duplicate same WxH).
    if prev != size:
        # FE i18n: explored + canvas_size: → activityCanvasSizeDone
        _emit(
            {
                "type": "activity",
                "id": f"canvas-size-{st.task_id[:8]}-{size}",
                "kind": "explored",
                "status": "done",
                "stage": "scene",
                "detail": f"canvas_size:{size}",
                "summary": size,
                "index": int(getattr(st, "round", 0) or 0)
            }
        )
        st.push_log(
            phase="canvas_size",
            intent=str(rt.classified_intent or st.intent or ""),
            summary=f"canvas_size {size} ({reason})",
        )
    return True

def _emit_design_loading_artboard(rt: Any) -> bool:
    """Open artboard + shimmer as design loading (after intent, before paint/action)."""
    if str(rt.flags.get("mode") or "") == "ask":
        # Ask waits for user confirm — do not spawn a loading plate yet.
        return False
    if not _should_early_open_artboard(rt):
        return False
    ow, oh = _resolve_loading_wh(rt)
    return _emit_canvas_size_step(
        rt, ow=ow, oh=oh, design_loading=True, reason="intent"
    )

def _emit_canvas_size_from_ops(rt: Any, step_ops: list[dict[str, Any]]) -> bool:
    """Open an artboard only when ops include a single create_frame.

    Infinite canvas: create_shape / create_text / … do not need a frame plate.
    Multi create_frame (UI set / multi-poster): FE applies each plate — do not
    host-open one shimmer board that would collapse the set.
    """
    from app.services.design.runtime.graph.paint_kit import (
        _count_create_frame_ops,
        _is_multi_artboard_batch,
        _wh_from_create_frame_ops,
    )

    if _is_multi_artboard_batch(step_ops):
        st = rt.run
        n = _count_create_frame_ops(step_ops)
        _emit(
            {
                "type": "activity",
                "id": f"multi-artboard-{st.task_id[:8]}-{n}",
                "kind": "explored",
                "status": "done",
                "stage": "scene",
                "detail": f"multi_artboard:{n}",
                "summary": f"{n} artboards",
                "index": int(getattr(st, "round", 0) or 0),
            }
        )
        st.push_log(
            phase="canvas_size",
            intent=str(rt.classified_intent or st.intent or ""),
            summary=f"multi_artboard {n} (paint_ops)",
        )
        return False
    ow, oh = _wh_from_create_frame_ops(step_ops)
    if ow <= 0 or oh <= 0:
        return False
    return _emit_canvas_size_step(
        rt, ow=ow, oh=oh, design_loading=True, reason="paint_ops"
    )

def _emit_tool_ops_validation_ui(
    rt: Any,
    errors: list[Any] | None,
    *,
    kept: int = 0,
) -> None:
    """Surface tool_ops validation failures in chat (not Admin-only)."""
    from app.services.design.runtime.graph.paint_kit import _op_error_codes
    errs = [str(e).strip() for e in list(errors or []) if str(e or "").strip()]
    if not errs:
        return
    codes = _op_error_codes(errs)
    code_hint = "、".join(codes[:3]) if codes else "invalid_op"
    if kept > 0:
        detail = f"{len(errs)} 条操作校验失败（已应用 {kept}）：{code_hint}"
    else:
        detail = f"{len(errs)} 条操作校验失败：{code_hint}"
    st = rt.run
    _emit(
        {
            "type": "activity",
            "id": f"validate-ops-{st.task_id[:8]}",
            "kind": "skipped",
            "status": "error",
            "stage": "validate",
            "count": len(errs),
            "detail": detail[:240],
            "summary": "; ".join(errs[:6])[:800],
        }
    )

def _flush_host_events(state: AgentRunState, events: list[dict[str, Any]]) -> None:
    for ev in events or []:
        sk = _as_text(ev.get("switch_kind")).strip()
        reason = _as_text(ev.get("model_reason")).strip()
        if sk == "vision" or "vision" in reason:
            state.vision_used = True
        state.push_log(**ev)

def _emit(ev: dict[str, Any]) -> None:
    try:
        get_stream_writer()(ev)
    except Exception:
        pass

def _paint_user_reply(raw: str | None, *, limit: int = 40) -> str:
    """Short post-paint chat line — never re-emit the decide/thought essay."""
    text = " ".join(str(raw or "").split()).strip()
    if not text:
        return ""
    banned = (
        "tool_ops",
        "create_shape",
        "create_text",
        "create_frame",
        "need_skills",
        "PaintOps",
        "schema",
    )
    low = text.lower()
    if any(b.lower() in low for b in banned) or len(text) > limit:
        return ""
    return text[:limit]

def _emit_deferred_paint_reply(st: AgentRunState, *, ops_sent: bool) -> None:
    """Stream paint reply only after real tool_ops were pushed to the client."""
    if not ops_sent:
        st.reply = ""
        return
    text = _paint_user_reply(st.reply)
    st.reply = text
    if not text:
        return
    _emit({"type": "token", "text": text})

__all__ = [
    '_should_early_open_artboard',
    '_resolve_loading_wh',
    '_emit_canvas_size_step',
    '_emit_design_loading_artboard',
    '_emit_canvas_size_from_ops',
    '_emit_tool_ops_validation_ui',
    '_flush_host_events',
    '_emit',
    '_paint_user_reply',
    '_emit_deferred_paint_reply',
]
