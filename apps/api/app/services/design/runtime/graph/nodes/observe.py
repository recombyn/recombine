"""Observe node — scene feedback HITL + critique."""
from __future__ import annotations

import asyncio
import re
from typing import Any

from langgraph.types import Command, interrupt

from app.services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
    GraphState,
    _SCENE_WAIT_SEC,
)
from app.services.design.runtime.graph.support import (
    _bump,
    _emit,
    _llm_ux_reply,
    _placement_errors_for_free_creates,
    _structure_verify_issues,
)

# Emoji / symbol ranges that often become tofu without a covering font.
_EMOJI_GLYPH_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]"
)
_LONG_CANVAS_MIN_H = 1400
_LONG_CANVAS_MIN_ASPECT = 2.2
_LONG_CANVAS_COVERAGE_MIN = 0.72


def _scene_interrupt_payload(st: AgentRunState, *, round_i: int) -> dict[str, Any]:
    return {
        "kind": "scene_feedback",
        "task_id": st.task_id,
        "trace_id": st.trace_id,
        "round": int(round_i),
        "timeout_ms": int(_SCENE_WAIT_SEC * 1000),
    }


def _normalize_resume_snap(raw: Any) -> dict[str, Any] | None:
    """Command(resume=…) value → scene snapshot, or None for timeout/empty."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        if raw.get("timeout") or raw.get("kind") == "timeout":
            return None
        if raw.get("cancelled") or raw.get("paused"):
            return None
        if any(k in raw for k in ("nodes", "frames", "op_results", "spatial", "preview_image")):
            out = {
                "nodes": list(raw.get("nodes") or [])
                if isinstance(raw.get("nodes"), list)
                else [],
                "frames": list(raw.get("frames") or [])
                if isinstance(raw.get("frames"), list)
                else [],
                "spatial": raw.get("spatial")
                if isinstance(raw.get("spatial"), dict)
                else None,
                "op_results": list(raw.get("op_results") or [])
                if isinstance(raw.get("op_results"), list)
                else [],
            }
            prev = str(raw.get("preview_image") or "").strip()
            if prev.startswith("data:image/") or prev.startswith("http"):
                out["preview_image"] = prev
            return out
    return None


def _critique_enabled() -> bool:
    try:
        from app.core.config import settings

        return bool(getattr(settings, "design_critique_enabled", True))
    except Exception:
        return True


def _aesthetics_critique_enabled() -> bool:
    try:
        from app.core.config import settings

        return bool(getattr(settings, "design_critique_aesthetics", True))
    except Exception:
        return True


def _aesthetic_critique_issues(
    *,
    preview_image: str | None,
    scene_key: str,
) -> list[str]:
    """CLIP score vs grade=good corpus; fail-open when unavailable."""
    if not _aesthetics_critique_enabled():
        return []
    url = str(preview_image or "").strip()
    if not url:
        return []
    try:
        from app.services.design.aesthetics.scorer import score_design_image

        result = score_design_image(
            image_url=url,
            scene=str(scene_key or "website").strip() or "website",
        )
    except Exception:
        return []
    if not isinstance(result, dict):
        return []
    # unavailable / skipped / thin_corpus / error all set pass=True (fail-open).
    if result.get("pass") is not False:
        return []
    issues: list[str] = []
    score = result.get("score")
    thr = result.get("threshold")
    if score is not None and thr is not None:
        issues.append(f"aesthetics score {float(score):.2f} < {float(thr):.2f}")
    for gap in result.get("gaps") or []:
        if not isinstance(gap, dict):
            continue
        kind = str(gap.get("kind") or "gap").strip()
        detail = str(gap.get("detail") or gap.get("hint") or "").strip()
        bit = f"aesthetics:{kind}"
        if detail:
            bit = f"{bit}: {detail[:160]}"
        if bit not in issues:
            issues.append(bit)
        if len(issues) >= 5:
            break
    return issues[:5]


def _create_op_xy(op: dict[str, Any]) -> tuple[float, float] | None:
    """World x/y for a create op, or None if missing / frame-scoped."""
    args = op.get("args") if isinstance(op.get("args"), dict) else op
    if not isinstance(args, dict):
        return None
    frame_id = str(args.get("frameId") or args.get("frame_id") or "").strip()
    if frame_id:
        return None
    try:
        return float(args["x"]), float(args["y"])
    except (KeyError, TypeError, ValueError):
        return None


def _spatial_grounding_issues(rt: AgentRuntime) -> list[str]:
    """Flags when FE spatial map conflicts with last paint batch."""
    spatial = rt.spatial_summary if isinstance(rt.spatial_summary, dict) else {}
    issues: list[str] = []
    empties = spatial.get("empty_rects")
    empty_n = len(empties) if isinstance(empties, list) else 0
    creates = [
        op
        for op in (rt.paint_ops or [])
        if isinstance(op, dict)
        and str(op.get("name") or op.get("op_key") or "").startswith("create_")
    ]
    create_n = len(creates)
    pts = [xy for op in creates if (xy := _create_op_xy(op)) is not None]

    # Unused empty pockets after paint → likely ignored placement map.
    if empty_n >= 3 and create_n >= 1:
        issues.append(
            f"layout may be cramped: {empty_n} empty regions remain after "
            f"{create_n} creates — prefer empty_rects / suggested_place"
        )

    suggest = spatial.get("suggested_place")
    if not isinstance(suggest, dict):
        suggest = spatial.get("suggested_place_world")
    if isinstance(suggest, dict) and create_n >= 2 and pts:
        try:
            sx_f, sy_f = float(suggest["x"]), float(suggest["y"])
        except (KeyError, TypeError, ValueError):
            sx_f = sy_f = None
        if sx_f is not None and sy_f is not None:
            near = sum(
                1 for ox, oy in pts if abs(ox - sx_f) <= 120 and abs(oy - sy_f) <= 120
            )
            if near == 0:
                issues.append(
                    "creates ignored suggested_place — place at least one create "
                    f"near suggested_place ({int(sx_f)},{int(sy_f)})"
                )

    if len(pts) >= 2:
        stacked = sum(
            1
            for i, (x0, y0) in enumerate(pts)
            for x1, y1 in pts[i + 1 :]
            if abs(x0 - x1) < 48 and abs(y0 - y1) < 48
        )
        if stacked:
            issues.append(
                f"creates stacked ({stacked} near-duplicate positions) — "
                "offset using empty_rects / gap≥24"
            )

    for err in _placement_errors_for_free_creates(rt, list(rt.paint_ops or [])):
        s = str(err or "").strip()
        if s and s not in issues:
            issues.append(s[:240])
    return issues[:6]


def _run_post_paint_critique(
    rt: AgentRuntime,
    st: AgentRunState,
    *,
    round_i: int,
    preview_image: str | None = None,
) -> list[str]:
    """Deterministic critique after FE scene lands. Emits critique_* SSE."""
    if not _critique_enabled() or not st.painted:
        return []
    _emit(
        {
            "type": "critique_start",
            "round": round_i,
            "reason": "post_paint",
        }
    )
    issues = _structure_verify_issues(
        nodes=list(rt.scene_nodes or []),
        frames=list(rt.scene_frames or []),
        painted=bool(st.painted),
        intent=str(st.intent or ""),
    )
    for issue in _spatial_grounding_issues(rt):
        if issue not in issues:
            issues.append(issue)
    for issue in _poster_hero_issues(rt):
        if issue not in issues:
            issues.append(issue)
    for issue in _layout_craft_issues(rt):
        if issue not in issues:
            issues.append(issue)
    for issue in _long_canvas_coverage_issues(rt):
        if issue not in issues:
            issues.append(issue)
    for issue in _aesthetic_critique_issues(
        preview_image=preview_image,
        scene_key=str(rt.scene_key or ""),
    ):
        if issue not in issues:
            issues.append(issue)
    issues = [str(x).strip() for x in issues if str(x).strip()][:10]
    ok = not issues
    reason = "; ".join(issues)[:400] if issues else "ok"
    _emit(
        {
            "type": "critique_done",
            "round": round_i,
            "ok": ok,
            "reason": reason,
            **({"has_preview": True} if preview_image else {}),
        }
    )
    st.push_log(
        phase="critique",
        ok=ok,
        issues=issues or None,
        has_preview=bool(preview_image) or None,
        summary=("画布审阅通过" if ok else f"画布审阅：{reason}")[:160],
    )
    return issues


def _node_xywh(n: dict[str, Any]) -> tuple[float, float, float, float] | None:
    try:
        x = float(n.get("x") if n.get("x") is not None else 0)
        y = float(n.get("y") if n.get("y") is not None else 0)
        w = float(n.get("w") if n.get("w") is not None else n.get("width") or 0)
        h = float(n.get("h") if n.get("h") is not None else n.get("height") or 0)
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    return x, y, w, h


def _frame_wh(f: dict[str, Any]) -> tuple[float, float] | None:
    try:
        w = float(f.get("w") if f.get("w") is not None else f.get("width") or 0)
        h = float(f.get("h") if f.get("h") is not None else f.get("height") or 0)
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    return w, h


def _hex_luminance(fill: str) -> float | None:
    s = str(fill or "").strip()
    if not s.startswith("#") or len(s) < 7:
        return None
    try:
        r = int(s[1:3], 16)
        g = int(s[3:5], 16)
        b = int(s[5:7], 16)
    except ValueError:
        return None
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


def _primary_frame(rt: AgentRuntime) -> dict[str, Any] | None:
    frames = [f for f in (rt.scene_frames or []) if isinstance(f, dict) and f.get("id")]
    if not frames:
        return None
    focus = str(rt.focus_id or "").strip()
    if focus:
        for f in frames:
            if str(f.get("id") or "") == focus:
                return f
    best = None
    best_area = -1.0
    for f in frames:
        wh = _frame_wh(f)
        if not wh:
            continue
        area = wh[0] * wh[1]
        if area > best_area:
            best_area = area
            best = f
    return best


def _layout_craft_issues(rt: AgentRuntime) -> list[str]:
    """Deterministic type/overflow/contrast flags from FE scene inventory."""
    nodes = [n for n in (rt.scene_nodes or []) if isinstance(n, dict) and n.get("id")]
    if not nodes:
        return []
    frame = _primary_frame(rt)
    fw = fh = None
    if frame:
        wh = _frame_wh(frame)
        if wh:
            fw, fh = wh

    issues: list[str] = []
    clipped = 0
    oversized_type = 0
    emoji_n = 0
    low_contrast = 0

    shape_fills: list[tuple[float, float, float, float, float]] = []
    for n in nodes:
        ntype = str(n.get("type") or "").strip().lower()
        box = _node_xywh(n)
        if not box:
            continue
        x, y, w, h = box
        if ntype in ("text", "textbox", "label"):
            continue
        lum = _hex_luminance(str(n.get("fill") or ""))
        if lum is not None:
            shape_fills.append((x, y, w, h, lum))

    for n in nodes:
        ntype = str(n.get("type") or "").strip().lower()
        if ntype not in ("text", "textbox", "label"):
            continue
        box = _node_xywh(n)
        if not box:
            continue
        x, y, w, h = box
        if fw is not None and fh is not None:
            if x + w > fw + 8 or y + h > fh + 8 or x < -8 or y < -8:
                clipped += 1
        try:
            fs = float(n.get("fontSize") or 0)
        except (TypeError, ValueError):
            fs = 0.0
        text = str(n.get("text") or "")
        if fs > 0 and h > 0 and fs > h * 1.25:
            oversized_type += 1
        if fs > 0 and w > 0 and text and fs * max(len(text), 1) * 0.55 > w * 1.35:
            oversized_type += 1
        if "\ufffd" in text or _EMOJI_GLYPH_RE.search(text):
            emoji_n += 1
        t_lum = _hex_luminance(str(n.get("fill") or n.get("color") or ""))
        if t_lum is not None and shape_fills:
            behind = [
                lum
                for sx, sy, sw, sh, lum in shape_fills
                if abs((sx + sw / 2) - (x + w / 2)) <= max(sw, w) * 0.75
                and abs((sy + sh / 2) - (y + h / 2)) <= max(sh, h) * 0.75
            ]
            if behind:
                bg = sum(behind) / len(behind)
                if abs(t_lum - bg) < 0.22:
                    low_contrast += 1

    if clipped:
        issues.append(
            f"text clipped/overflow: {clipped} text node(s) extend past artboard — "
            "shrink fontSize or width, keep glyphs inside frame"
        )
    if oversized_type:
        issues.append(
            f"type overflow: {oversized_type} text node(s) fontSize too large for box — "
            "reduce fontSize or widen text box"
        )
    if emoji_n:
        issues.append(
            f"emoji/tofu risk: {emoji_n} text node(s) use emoji/symbol glyphs — "
            "replace with create_text catalog fonts or create_image lettering"
        )
    if low_contrast:
        issues.append(
            f"low contrast: {low_contrast} text node(s) too close to background fill — "
            "raise contrast (darker/lighter fill) or add solid panel behind type"
        )
    return issues[:4]


def _long_canvas_coverage_issues(rt: AgentRuntime) -> list[str]:
    """Tall create boards must fill most of the height; else continue paint below."""
    intent = str(getattr(rt.run, "intent", "") or rt.classified_paint_lane or "").lower()
    if intent and intent not in ("create", "design", ""):
        # edit rounds should not force vertical fill
        if intent == "edit":
            return []
    frame = _primary_frame(rt)
    if not frame:
        return []
    wh = _frame_wh(frame)
    if not wh:
        return []
    fw, fh = wh
    if fh < _LONG_CANVAS_MIN_H and (fw <= 0 or fh / fw < _LONG_CANVAS_MIN_ASPECT):
        return []

    nodes = [n for n in (rt.scene_nodes or []) if isinstance(n, dict) and n.get("id")]
    bottoms: list[float] = []
    for n in nodes:
        box = _node_xywh(n)
        if not box:
            continue
        _x, y, _w, h = box
        bottoms.append(y + h)
    # Fallback: last paint batch y extents when scene thin
    if len(bottoms) < 2:
        for op in rt.paint_ops or []:
            if not isinstance(op, dict):
                continue
            name = str(op.get("name") or op.get("op_key") or "")
            if not name.startswith("create_"):
                continue
            args = op.get("args") if isinstance(op.get("args"), dict) else {}
            if not isinstance(args, dict):
                continue
            try:
                y = float(args.get("y") or 0)
                h = float(args.get("h") or args.get("height") or 0)
            except (TypeError, ValueError):
                continue
            if h > 0:
                bottoms.append(y + h)
    if not bottoms:
        return [
            f"long canvas incomplete: tall artboard {int(fw)}x{int(fh)} has no "
            "content coverage — continue paint modules top→bottom"
        ]
    content_bottom = max(bottoms)
    coverage = content_bottom / fh if fh > 0 else 1.0
    if coverage >= _LONG_CANVAS_COVERAGE_MIN:
        return []
    next_y = int(min(fh - 80, max(0, content_bottom + 24)))
    return [
        f"long canvas incomplete: content ends near y={int(content_bottom)} of "
        f"{int(fh)} ({coverage:.0%} coverage) — APPEND modules below y={next_y} "
        "(specs/CTA/sections); do not clear_canvas or rebuild the top"
    ]


def _poster_hero_issues(rt: AgentRuntime) -> list[str]:
    """Poster/festive create must include create_image hero — not shape-only piles."""
    scene = str(rt.scene_key or "").strip().lower()
    prompt_l = str(rt.prompt or "").strip().lower()
    wants_poster = scene in ("poster", "roll-up", "rollup", "banner") or any(
        k in prompt_l
        for k in (
            "海报",
            "易拉宝",
            "halloween",
            "万圣",
            "poster",
            "flyer",
            "宣传",
        )
    )
    if not wants_poster:
        return []
    ops = [o for o in (rt.paint_ops or []) if isinstance(o, dict)]
    if not ops:
        return []
    names = [str(o.get("name") or o.get("op_key") or "") for o in ops]
    has_image = "create_image" in names
    shape_n = sum(1 for n in names if n == "create_shape")
    if has_image:
        return []
    if shape_n >= 4:
        return [
            "poster missing create_image hero: replace shape-pile with "
            "create_image genPrompt full-bleed (or near) main visual, then text"
        ]
    if any(n.startswith("create_") for n in names):
        return [
            "poster/festive create needs create_image genPrompt hero visual "
            "before settling"
        ]
    return []


def _format_critique_reflect_note(issues: list[str]) -> str:
    """Paint-retry brief: structured CRITIQUE block for LAST_ERROR prompt."""
    lines = ["CRITIQUE (fix paint — fix these before settling):"]
    for i, issue in enumerate(issues[:6], 1):
        lines.append(f"{i}. {str(issue).strip()[:200]}")
    joined = " ".join(str(x).lower() for x in issues)
    if "create_image" in joined or "hero" in joined or "shape-pile" in joined:
        lines.append(
            "Hero: emit create_image with genPrompt for the full poster background/"
            "main illustration; keep create_text for copy; do not rebuild with shapes only."
        )
    if "long canvas incomplete" in joined or "append modules" in joined:
        lines.append(
            "Continue long page: ONLY add create_* below the current content bottom; "
            "no clear_canvas / no recreate top hero; fill remaining height."
        )
    if any("aesthetics" in str(x).lower() for x in issues):
        lines.append(
            "Aesthetic gaps: improve layout rhythm, contrast, and whitespace; "
            "avoid stacking everything in one corner; no clipped titles."
        )
    if any(
        "empty" in str(x).lower() or "cramped" in str(x).lower() or "place" in str(x).lower()
        for x in issues
    ):
        lines.append(
            "Placement: use PLACEMENT empty_rects / suggested_place_world from the host."
        )
    if any(
        k in joined
        for k in ("contrast", "clip", "overflow", "emoji", "tofu", "type overflow")
    ):
        lines.append(
            "Type: raise contrast vs background; shrink fontSize/width so glyphs stay "
            "on board; replace emoji with catalog fonts or lettering images."
        )
    return "\n".join(lines)[:720]


async def _retry_paint_from_critique(
    rt: AgentRuntime,
    st: AgentRunState,
    *,
    round_i: int,
    issues: list[str],
) -> Command:
    note = _format_critique_reflect_note(issues)
    st.note_error(note)
    st.push_log(
        phase="reflect",
        error=st.reflect_note,
        reason="critique_failed",
        reflect_left=st.reflect_left,
        issues=issues[:6],
        summary=f"审阅未通过，重试绘制：{'; '.join(issues)[:120]}"[:160],
    )
    st.reflect_left -= 1
    _emit(
        {
            "type": "skill_done",
            "index": round_i,
            "skill_key": "react",
            "skill_name": "Design Agent",
            "tokens": rt.last_used,
        }
    )
    st.round = round_i + 1
    rt.flags["op_failed"] = False
    rt.flags["critique_failed"] = True
    rt.flags["retry"] = True
    rt.flags["ok"] = False
    return Command(update=_bump(rt), goto="paint_ops")


async def _node_observe(
    state: GraphState,
) -> Command:
    rt = state["rt"]
    st = rt.run
    round_i = st.round
    from app.services.design.runtime.graph.build import (
        mark_design_running,
        mark_design_waiting_client,
    )
    from app.services.design.admin.task_store import peek_run_intent

    await asyncio.to_thread(mark_design_waiting_client, st.task_id)

    # Formal HITL: pause graph until driver resumes with FE scene (or timeout).
    # Node restarts from the top on resume — mark_waiting is idempotent.
    resume_raw = interrupt(_scene_interrupt_payload(st, round_i=round_i))

    intent = await asyncio.to_thread(peek_run_intent, st.task_id)
    if intent in ("pause", "cancel"):
        raise asyncio.CancelledError()

    if intent not in ("pause", "cancel"):
        await asyncio.to_thread(mark_design_running, st.task_id)

    snap = _normalize_resume_snap(resume_raw)
    preview_image: str | None = None
    op_failures: list[dict[str, Any]] = []
    if snap:
        nodes = [
            n for n in (snap.get("nodes") or []) if isinstance(n, dict) and n.get("id")
        ][:120]
        frames = [
            f for f in (snap.get("frames") or []) if isinstance(f, dict) and f.get("id")
        ][:32]
        rt.scene_nodes = nodes
        rt.scene_frames = frames
        spatial = snap.get("spatial")
        if isinstance(spatial, dict):
            rt.spatial_summary = spatial
        prev = str(snap.get("preview_image") or "").strip()
        if prev:
            preview_image = prev
            rt.flags["preview_image"] = True
        op_failures = [
            r
            for r in (snap.get("op_results") or [])
            if isinstance(r, dict) and not r.get("ok", True)
        ]
        fail_bits = [
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:8]
            if isinstance(r, dict)
        ]
        st.push_log(
            phase="observe",
            nodes=len(nodes),
            frames=len(frames),
            ok=not op_failures,
            op_failed=len(op_failures) or None,
            op_errors=fail_bits or None,
            summary=(
                f"观察画布 nodes={len(nodes)} frames={len(frames)}"
                + (f" · 失败×{len(op_failures)}" if op_failures else " · ok")
            ),
        )
    else:
        st.note_error("scene_feedback_timeout: FE did not post scene; assume ops applied")
        st.push_log(
            phase="observe",
            ok=False,
            error="timeout",
            summary="观察超时：前端未回传 scene",
        )

    if rt.skip_loop:
        if st.reply:
            _emit({"type": "token", "text": st.reply})
        rt.terminal = True
        rt.flags["ok"] = True
        rt.flags["scene_ready"] = bool(snap)
        rt.flags["op_failed"] = False
        return Command(update=_bump(rt), goto="__settle__")

    if op_failures:
        fail_notes = "; ".join(
            f"{r.get('name') or 'op'}: {r.get('error') or 'failed'}"
            for r in op_failures[:3]
        )
        all_failed = len(rt.paint_ops) > 0 and len(op_failures) >= len(rt.paint_ops)
        if all_failed:
            st.painted = False
        st.note_error(f"op_apply_failed: {fail_notes}")
        st.push_log(
            phase="reflect",
            error=st.reflect_note,
            reason="op_apply_failed",
            op_failed=len(op_failures),
            reflect_left=st.reflect_left,
            summary=f"操作未生效×{len(op_failures)}：{fail_notes}"[:160],
        )
        _emit(
            {
                "type": "activity",
                "id": f"opfail-{round_i}",
                "kind": "skipped",
                "status": "done",
                "count": len(op_failures),
                "detail": f"ops_failed×{len(op_failures)}: {fail_notes}"[:200],
                "index": round_i,
            }
        )
        if st.reflect_left > 0 and not rt.turn.get("done"):
            st.reflect_left -= 1
            _emit(
                {
                    "type": "skill_done",
                    "index": round_i,
                    "skill_key": "react",
                    "skill_name": "Design Agent",
                    "tokens": rt.last_used,
                }
            )
            st.round = round_i + 1
            rt.flags["op_failed"] = True
            rt.flags["retry"] = True
            rt.flags["ok"] = False
            return Command(update=_bump(rt), goto="paint_ops")
        corrected = await _llm_ux_reply(
            rt,
            situation=(
                "Some canvas ops failed to apply (targets may be gone). "
                "Explain briefly and invite the user to retry on a specific element."
            ),
            facts=f"failed={len(op_failures)}; notes={fail_notes[:240]}",
        )
        if corrected:
            st.reply = corrected
            _emit({"type": "token", "text": corrected})
        _emit(
            {
                "type": "skill_done",
                "index": round_i,
                "skill_key": "react",
                "tokens": rt.last_used,
            }
        )
        rt.terminal = True
        rt.flags["ok"] = False
        return Command(update=_bump(rt), goto="__settle__")

    critique_issues = _run_post_paint_critique(
        rt, st, round_i=round_i, preview_image=preview_image
    )
    if (
        critique_issues
        and st.reflect_left > 0
        and not rt.turn.get("done")
        and st.painted
    ):
        return await _retry_paint_from_critique(
            rt, st, round_i=round_i, issues=critique_issues
        )
    if critique_issues:
        tip = await _llm_ux_reply(
            rt,
            situation=(
                "Canvas critique found layout issues after paint. "
                "Mention one concrete fix the user can try; keep it short."
            ),
            facts=f"issues={'; '.join(critique_issues)[:240]}",
        )
        if tip:
            st.reply = tip
            _emit({"type": "token", "text": tip})

    rt.flags["scene_ready"] = True
    rt.flags["op_failed"] = False
    rt.flags["ok"] = not bool(critique_issues)
    rt.flags["retry"] = False
    rt.terminal = True
    return Command(update=_bump(rt), goto="__settle__")
