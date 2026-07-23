"""Skill-queue helpers, refs, tool-ops runtime, precheck."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from services.design.canvas_scene import (
    canvas_dim_locks as _canvas_dim_locks,
    extract_size_hint_from_prompt as _extract_size_hint_from_prompt,
    infer_scene_from_canvas as _infer_scene_from_canvas,
    scene_key as _scene_key,
)
from services.design.rules_text import _as_text, _rule_text
from services.design.stream_face import _is_analysis_skill, _is_summary_skill
from services.design.svg_patch import diff_svg_layers, svg_content_digest
from services.design.tool_ops_contract import extract_and_validate_tool_ops
from services.design.validate import extract_json

def _svg_patch_payload(prev_svg: str, next_svg: str) -> dict[str, Any] | None:
    """Incremental layer diff for live-draw. None when next SVG is empty."""
    nxt = (next_svg or "").strip()
    if not nxt:
        return None
    return diff_svg_layers(prev_svg or "", nxt)

def _normalize_ref_images(images: list[str] | None, *, limit: int = 4) -> list[str]:
    """Keep valid data-URL / https reference images; drop oversized payloads."""
    out: list[str] = []
    for raw in images or []:
        if not isinstance(raw, str):
            continue
        s = raw.strip()
        if not s:
            continue
        if not (
            s.startswith("data:image/")
            or s.startswith("https://")
            or s.startswith("http://")
        ):
            continue
        # ~6MB binary as base64 is ~8M chars — reject heavier blobs.
        if s.startswith("data:") and len(s) > 8_000_000:
            continue
        out.append(s)
        if len(out) >= limit:
            break
    return out

def _attached_images_prompt_note(images: list[str]) -> str:
    n = len(images)
    if n <= 0:
        return ""
    return (
        f"USER_ATTACHED_IMAGES: {n} image(s) are provided as multimodal vision input "
        f"(indexes 0..{n - 1}). Look at them. "
        "To place an attachment on the canvas use create_image with attachmentIndex. "
        "Do not invent unrelated stock photos when the user wants these references."
    )

def _skill_key(skill: dict[str, Any]) -> str:
    return str(skill.get("skill_key") or skill.get("key") or "").strip()

def _data_url_image_size(data_url: str) -> tuple[int, int] | None:
    """Best-effort width/height from a data-URL image header (PNG / JPEG)."""
    import base64
    import struct

    s = (data_url or "").strip()
    m = re.match(r"^data:image/(png|jpeg|jpg);base64,(.+)$", s, flags=re.I | re.S)
    if not m:
        return None
    kind = m.group(1).lower()
    b64 = re.sub(r"\s+", "", m.group(2))
    # Need enough bytes for PNG IHDR / JPEG SOF.
    take = min(len(b64), 8192)
    pad = (-take) % 4
    try:
        raw = base64.b64decode(b64[:take] + ("=" * pad), validate=False)
    except Exception:
        return None
    if kind == "png" and len(raw) >= 24 and raw.startswith(b"\x89PNG\r\n\x1a\n"):
        w, h = struct.unpack(">II", raw[16:24])
        if 1 <= w <= 20000 and 1 <= h <= 20000:
            return int(w), int(h)
    if kind in ("jpeg", "jpg") and raw.startswith(b"\xff\xd8"):
        i = 2
        while i + 9 < len(raw):
            if raw[i] != 0xFF:
                break
            marker = raw[i + 1]
            if marker in (0xC0, 0xC1, 0xC2) and i + 9 < len(raw):
                h, w = struct.unpack(">HH", raw[i + 5 : i + 9])
                if 1 <= w <= 20000 and 1 <= h <= 20000:
                    return int(w), int(h)
                break
            if marker in (0xD8, 0xD9):
                i += 2
                continue
            if i + 3 >= len(raw):
                break
            seg_len = struct.unpack(">H", raw[i + 2 : i + 4])[0]
            i += 2 + seg_len
    return None

def _ref_scale_context_block(
    rules: dict[str, str],
    *,
    w: int,
    h: int,
    ref_images: list[str],
) -> str:
    """Tell the model how to map reference-relative layout onto the artboard."""
    lines = [f"TARGET_CANVAS: {int(w)}x{int(h)}"]
    for i, img in enumerate(ref_images[:4]):
        wh = _data_url_image_size(img) if img.startswith("data:") else None
        if wh:
            rw, rh = wh
            sx = (float(w) / float(rw)) if rw else 1.0
            sy = (float(h) / float(rh)) if rh else 1.0
            lines.append(
                f"REF_IMAGE_{i}: {rw}x{rh}  scale_to_canvas≈({sx:.4f},{sy:.4f})  "
                f"(or use normalized nx*W / ny*H)"
            )
        else:
            lines.append(f"REF_IMAGE_{i}: size unknown — use normalized 0..1 zones")
    hint = (rules.get("ref.scale_hint") or "").strip()
    if hint:
        lines.append(hint)
    return "\n".join(lines) + "\n"

def _filter_layout_skills_for_refs(
    skills: list[dict[str, Any]],
    *,
    has_ref_images: bool,
) -> list[dict[str, Any]]:
    """With refs prefer ref_layout; without refs drop ref_layout."""
    keys = {_skill_key(s) for s in skills}
    if has_ref_images and "ref_layout" in keys:
        return [s for s in skills if _skill_key(s) != "ui_layout"]
    return [s for s in skills if _skill_key(s) != "ref_layout"]

def _design_contract_from_req_parse(
    content: str,
    *,
    prompt: str,
    w: int,
    h: int,
    lock_size: bool = False,
    client_canvas_size: str | None = None,
    allow_scene_override: bool = False,
) -> tuple[int, int, str, str | None, list[str], list[str], str | None]:
    """
    Apply req_parse JSON → canvas size + DESIGN_CONTRACT + optional intent/scene.
    Returns (w, h, contract, intent, skip_skills, subgoals, scene_or_none).
    """
    data = extract_json(content)
    new_w, new_h = w, h
    prompt_w, prompt_h = _extract_size_hint_from_prompt(prompt)
    lock_w, lock_h = _canvas_dim_locks(client_canvas_size)
    # Edit-in-place / fully locked client: never rewrite WxH.
    if not lock_size:
        if prompt_w is not None and prompt_h is not None:
            new_w, new_h = prompt_w, prompt_h
        else:
            if isinstance(data, dict):
                canvas = data.get("canvas")
                if isinstance(canvas, dict):
                    try:
                        cw = int(canvas.get("w") or canvas.get("width") or 0)
                        ch = int(canvas.get("h") or canvas.get("height") or 0)
                        if 64 <= cw <= 8000 and 64 <= ch <= 8000:
                            new_w, new_h = cw, ch
                    except (TypeError, ValueError):
                        pass
            if prompt_w is not None:
                new_w = prompt_w
            if prompt_h is not None:
                new_h = prompt_h
        if lock_w is not None:
            new_w = lock_w
        if lock_h is not None:
            new_h = lock_h

    intent: str | None = None
    parsed_scene: str | None = None
    skip_skills: list[str] = []
    subgoals: list[str] = []
    parts: list[str] = []
    if isinstance(data, dict):
        raw_intent = str(data.get("intent") or "").strip().lower()
        if raw_intent in ("edit", "create", "sibling", "blank"):
            intent = raw_intent

        if allow_scene_override:
            raw_scene = _scene_key(
                str(data.get("scene") or data.get("design_scene") or "")
            )
            if raw_scene in ("website", "mobile", "image", "poster"):
                parsed_scene = raw_scene
            elif not parsed_scene:
                # Model omitted scene — recover only from the canvas it proposed.
                parsed_scene = _infer_scene_from_canvas(f"{new_w}x{new_h}")

        palette = _normalize_palette(data.get("palette"))
        if palette:
            accents = ", ".join(palette["accents"]) or "(none)"
            primary = palette["primary"] or "unspecified"
            parts.append(
                "PALETTE (mandatory): "
                f"primary={primary}; accents=[{accents}]. "
                "Use exactly this palette; do not invent a conflicting brand palette."
            )
            if palette["notes"]:
                parts.append(f"PALETTE_NOTES: {palette['notes']}")

        must_have = data.get("must_have") or []
        must_avoid = data.get("must_avoid") or []
        if isinstance(must_have, list) and must_have:
            parts.append("MUST_HAVE: " + "; ".join(str(x) for x in must_have[:12] if str(x).strip()))
        if isinstance(must_avoid, list) and must_avoid:
            parts.append("MUST_AVOID: " + "; ".join(str(x) for x in must_avoid[:12] if str(x).strip()))

        for key in ("goal", "tone", "primary_cta", "page_type", "layout", "audience"):
            val = data.get(key)
            if val is not None and str(val).strip():
                parts.append(f"{key.upper()}: {str(val).strip()}")

        elements = data.get("elements") or data.get("must_have")
        if isinstance(elements, list) and elements:
            parts.append(
                "ELEMENTS: " + "; ".join(str(x) for x in elements[:16] if str(x).strip())
            )
        hierarchy = data.get("hierarchy")
        if isinstance(hierarchy, list) and hierarchy:
            parts.append(
                "HIERARCHY: " + " > ".join(str(x) for x in hierarchy[:12] if str(x).strip())
            )

        copy_hints = data.get("copy_hints")
        if isinstance(copy_hints, dict):
            title = str(copy_hints.get("title") or "").strip()
            subtitle = str(copy_hints.get("subtitle") or "").strip()
            body = str(copy_hints.get("body") or "").strip()
            if title or subtitle or body:
                parts.append(
                    "COPY_HINTS (on-canvas copy — use verbatim unless empty):\n"
                    f"- title: {title or '(none)'}\n"
                    f"- subtitle: {subtitle or '(none)'}\n"
                    f"- body: {body or '(none)'}\n"
                    "Never replace these with style meta-text "
                    "(e.g. 现代简洁/主视觉/竖版优化)."
                )

        cta = str(data.get("primary_cta") or "").strip()
        if not cta:
            parts.append(
                "PRIMARY_CTA: (none) — do not draw a CTA button or invent 了解更多."
            )
        if intent:
            parts.append(f"INTENT: {intent}")
        if parsed_scene:
            parts.append(f"SCENE: {parsed_scene}")

        raw_skip = data.get("skip_skills")
        if isinstance(raw_skip, list):
            skip_skills = [str(s).strip() for s in raw_skip if str(s).strip()][:8]

        raw_subgoals = data.get("subgoals")
        if isinstance(raw_subgoals, list):
            subgoals = [str(s).strip() for s in raw_subgoals if str(s).strip()][:6]

    return new_w, new_h, "\n".join(parts), intent, skip_skills, subgoals, parsed_scene

def _remaining_edit_skills(
    skills: list[dict[str, Any]],
    *,
    after_index: int,
) -> list[dict[str, Any]]:
    """After 设计思考 decides edit: keep Admin flow as-is (no local skill drop).

    Only skip re-running plan/analysis skills already finished.
    """
    head = list(skills[: after_index + 1])
    rest = [
        s
        for s in skills[after_index + 1 :]
        if not _is_analysis_skill(s)
        and str(s.get("category") or "").lower() != "plan"
    ]
    return head + rest

_CREATE_DRAW_CATS = frozenset(
    {"element", "color", "typography", "render", "refine", "layout"}
)

def _remaining_create_skills(
    skills: list[dict[str, Any]],
    *,
    after_index: int,
    has_ref_images: bool = False,
) -> list[dict[str, Any]]:
    """After 设计思考 decides create/sibling: honor Admin flow (no local slim)."""
    del has_ref_images
    head = list(skills[: after_index + 1])
    rest = [
        s
        for s in skills[after_index + 1 :]
        if not _is_analysis_skill(s)
        and str(s.get("category") or "").lower() != "plan"
    ]
    return head + rest

def _parse_agent_rounds(rules: dict[str, str], *, lean_edit: bool) -> int:
    """How many think→tool_ops rounds for one execute skill (Cursor-style)."""
    key = "execute.agent_rounds.lean" if lean_edit else "execute.agent_rounds"
    raw = (rules.get(key) or rules.get("execute.agent_rounds") or "").strip()
    default = 2 if lean_edit else 3
    if not raw:
        return default
    try:
        return max(1, min(6, int(raw)))
    except ValueError:
        return default

def _agent_should_continue(
    content: str,
    ops: list[dict[str, Any]] | None,
    *,
    round_index: int = 1,
    lean_edit: bool = False,
    rules: dict[str, str] | None = None,
) -> bool:
    """Decide whether to paint→feedback→think again.

    - No ops → stop.
    - Explicit ``continue: false`` → stop.
    - ``done: true`` honored on lean edits and after the first continue check;
      create/full edit ignores ``done`` on the first pass so canvas feedback can land.
    - Admin may set ``execute.force_continue=1`` to ignore ``done`` until max rounds.
    """
    if not ops:
        return False
    data = extract_json(content or "")
    force = False
    if rules:
        force = (rules.get("execute.force_continue") or "").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
    if isinstance(data, dict) and data.get("continue") is False:
        return False
    if isinstance(data, dict) and data.get("done") is True:
        if force:
            return True
        # First continue gate (round_index==1 → about to start round 2): keep going
        # so FE scene feedback can refine — unless lean @node one-shot.
        if lean_edit:
            return False
        if round_index <= 1:
            return True
        return False
    return True

def _apply_ops_to_scene_nodes(
    nodes: list[dict[str, Any]] | None,
    ops: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Best-effort inventory update so the next agent round sees applied work."""
    by_id: dict[str, dict[str, Any]] = {}
    for n in nodes or []:
        if not isinstance(n, dict):
            continue
        nid = str(n.get("id") or "").strip()
        if nid:
            by_id[nid] = dict(n)
    gen = 0
    for op in ops or []:
        if not isinstance(op, dict):
            continue
        name = str(op.get("name") or "").strip()
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        if name == "update_node":
            nid = str(args.get("nodeId") or "").strip()
            if not nid or nid not in by_id:
                continue
            row = dict(by_id[nid])
            for k, v in args.items():
                if k == "nodeId":
                    continue
                row[k] = v
                if k == "fill":
                    row["fill"] = v
            by_id[nid] = row
        elif name in ("create_shape", "create_text", "create_image", "create_svg"):
            nid = str(args.get("id") or args.get("nodeId") or "").strip()
            if not nid:
                gen += 1
                nid = f"gen_{gen}_{len(by_id)}"
            row = {"id": nid, **{k: v for k, v in args.items() if k not in ("id",)}}
            if name == "create_shape":
                row.setdefault("type", str(args.get("shapeType") or "rect"))
            elif name == "create_text":
                row["type"] = "text"
            elif name == "create_image":
                row["type"] = "image"
            elif name == "create_svg":
                row["type"] = "svg"
            by_id[nid] = row
        elif name == "delete_nodes":
            for raw in args.get("nodeIds") or []:
                by_id.pop(str(raw).strip(), None)
        elif name == "delete_frame":
            fid = str(args.get("frameId") or args.get("id") or "").strip()
            if fid:
                by_id = {
                    k: v
                    for k, v in by_id.items()
                    if str(v.get("frameId") or "") != fid
                }
    return list(by_id.values())


def _apply_frames_after_ops(
    frames: list[dict[str, Any]] | None,
    ops: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Drop deleted frames from the artboard list for the next agent round."""
    out = [dict(f) for f in (frames or []) if isinstance(f, dict) and f.get("id")]
    for op in ops or []:
        if not isinstance(op, dict):
            continue
        if str(op.get("name") or "").strip() != "delete_frame":
            continue
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        fid = str(args.get("frameId") or args.get("id") or "").strip()
        if fid:
            out = [f for f in out if str(f.get("id") or "") != fid]
    return out

def _tool_ops_content_digest(
    ops: list[dict[str, Any]] | None, *, max_chars: int = 2400
) -> str:
    """Inventory from tool_ops when backend has no final SVG (FE paints ops live)."""
    copies: list[str] = []
    shapes = 0
    texts = 0
    images = 0
    svgs = 0
    for o in ops or []:
        if not isinstance(o, dict):
            continue
        name = str(o.get("name") or "").strip()
        args = o.get("args") if isinstance(o.get("args"), dict) else {}
        if name == "create_text":
            texts += 1
            t = str(args.get("text") or args.get("content") or "").strip()
            if t and t not in copies:
                copies.append(t[:80])
        elif name in ("create_shape", "create_path", "create_frame", "create_group"):
            shapes += 1
        elif name == "create_image":
            images += 1
        elif name in ("create_svg", "create_icon"):
            svgs += 1
    parts: list[str] = []
    if copies:
        parts.append("VISIBLE_COPY:\n- " + "\n- ".join(copies[:36]))
    bits: list[str] = []
    if shapes:
        bits.append(f"shapes={shapes}")
    if texts:
        bits.append(f"texts={texts}")
    if images:
        bits.append(f"images={images}")
    if svgs:
        bits.append(f"svgs={svgs}")
    if bits:
        parts.append("OPS: " + ", ".join(bits))
    return "\n".join(parts).strip()[:max_chars]

def _assess_tool_ops_density(
    ops: list[dict[str, Any]],
    *,
    intent: str | None,
    scene: str | None,
    nodes: list[dict[str, Any]] | None = None,
    rules: dict[str, str] | None = None,
) -> tuple[bool, str]:
    """Post-validate tool_ops (density + structure). Delegates to contract helper."""
    return assess_tool_ops_result(
        ops,
        intent=intent,
        scene=scene,
        nodes=nodes,
        rules=rules,
    )

def _parse_validate_report(content: str) -> tuple[bool, list[Any]]:
    """Parse validate-skill JSON: ok + issues. Unreadable → treat as ok (no loop)."""
    data = extract_json(content or "")
    if not isinstance(data, dict):
        return True, []
    raw_issues = data.get("issues")
    clean: list[Any] = []
    if isinstance(raw_issues, list):
        for it in raw_issues[:24]:
            if isinstance(it, dict):
                clean.append(it)
            elif isinstance(it, str) and it.strip():
                clean.append({"severity": "other", "detail": it.strip()[:400]})
    ok_raw = data.get("ok")
    if ok_raw is False:
        return False, clean or [{"severity": "quality", "detail": "ok=false"}]
    if clean:
        return False, clean
    return True, []

def _pick_validate_fix_refine(
    skill_queue: list[dict[str, Any]],
    *,
    after_index: int,
) -> dict[str, Any] | None:
    """Return a refine skill to insert after validate, or None if one is already next."""
    for s in skill_queue[after_index + 1 :]:
        cat = str(s.get("category") or "").lower()
        if cat == "refine" and _skill_key(s) != "layer_partial":
            return None
        if cat == "validate" or _is_summary_skill(s):
            continue
        # Stop at the next non-summary work skill that isn't refine.
        break
    for s in reversed(skill_queue[: after_index + 1]):
        if str(s.get("category") or "").lower() == "refine" and _skill_key(s) != "layer_partial":
            return dict(s)
    return get_refine_skill()

def _bg_candidate_from_nodes(nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Largest non-text plate — usual background fill target."""
    plates = [
        n
        for n in nodes
        if isinstance(n, dict)
        and n.get("id")
        and str(n.get("type") or "").lower() not in ("text",)
    ]
    if not plates:
        return None
    return max(
        plates,
        key=lambda n: int(n.get("w") or 0) * int(n.get("h") or 0),
    )

def _extract_tool_ops(content: str | dict[str, Any] | list[Any] | None) -> list[dict[str, Any]]:
    """Parse + validate tool ops (see tool_ops_contract)."""
    ops, _errs = extract_and_validate_tool_ops(content, scene_nodes=None, rules=None)
    return ops

def _is_tool_ops_skill(skill: dict[str, Any], *, edit_in_place: bool) -> bool:
    """
    Wire protocol: canvas tool_ops JSON (frontend draws), never SVG.
    - analysis / summary / validate: not tool_ops
    - create/edit draw skills (incl. layout): tool_ops when Admin puts them in the flow
    """
    if _is_analysis_skill(skill) or _is_summary_skill(skill):
        return False
    cat = str(skill.get("category") or "").lower()
    if cat == "validate":
        return False
    key = _skill_key(skill)
    if cat in _CREATE_DRAW_CATS or key == "design_execute":
        return True
    if edit_in_place and cat == "refine":
        return True
    return False

def _skill_wants_pre_aesthetic_refs(
    skill: dict[str, Any],
    *,
    tool_ops_mode: bool,
    lean_edit: bool = False,
) -> bool:
    """Layout / draw steps should see good samples before generating."""
    # Targeted @node edits stay fast — no RAG. Whole-page edit still wants samples.
    if lean_edit:
        return False
    if _is_summary_skill(skill) or _is_analysis_skill(skill):
        return False
    cat = str(skill.get("category") or "").lower()
    if tool_ops_mode:
        return True
    return cat in ("layout", "element", "color", "typography", "render", "refine")

def _parse_retry_max(rules: dict[str, str], skill_retries: int) -> int:
    pol = _rule_text(rules, "precheck.retry_policy")
    m = re.search(r"max\s*=\s*(\d+)", pol, re.I)
    if m:
        return max(0, min(int(m.group(1)), int(skill_retries)))
    return int(skill_retries)

def _user_facing_run_error(
    err: BaseException | str,
    *,
    rules: dict[str, str] | None = None,
) -> str:
    """
    SSE / chat-facing error text from content-pack rules.
    Keep raw codes in task.error_message for admin logs.
    """
    raw = _as_text(err).strip()
    reason = raw
    if raw.lower().startswith("skill_failed:"):
        parts = raw.split(":", 2)
        reason = parts[2].strip() if len(parts) >= 3 else raw
    low = reason.lower()

    def msg(key: str, fallback: str) -> str:
        return _rule_text(rules, key, fallback).strip() or fallback

    if "missing_tool_ops" in low:
        return msg(
            "error.missing_tool_ops",
            "这次没能执行画布操作。请把要修改或删除的对象说清楚后重试。",
        )
    if "tool_ops_invalid" in low:
        return msg("error.tool_ops_invalid", "画布操作未通过校验，请重试一次。")
    if "insufficient" in low or "credit" in low:
        return msg("error.insufficient_credits", "Token 不足，请充值后重试。")
    if "validate_failed" in low or "final_validate" in low or "sparse_svg" in low:
        return msg("error.validate_failed", "结果校验未通过，请换一种描述重试。")
    if low.startswith("blocked:") or raw.lower().startswith("blocked:"):
        return msg("error.blocked", "请求被安全策略拦截。")
    generic = msg("error.generic", "执行失败，请重试或把需求说得更清楚一些。")
    if raw.lower().startswith("skill_failed:") or re.match(
        r"^[a-z][a-z0-9_]*(:|$)", low
    ):
        return generic
    return raw[:300] if raw else generic

def _precheck_block(prompt: str, canvas_size: str | None, rules: dict[str, str]) -> str | None:
    blocks = (rules.get("precheck.block_rules") or "").lower()
    if "empty_prompt" in blocks and not (prompt or "").strip():
        return "blocked:empty_prompt"
    if "oversized_canvas" in blocks and canvas_size:
        raw = canvas_size.lower().replace("*", "x")
        if "x" in raw:
            try:
                a, b = raw.split("x", 1)
                if int(a) * int(b) > 8000 * 8000:
                    return "blocked:oversized_canvas"
            except ValueError:
                pass
    banned = ("banned_words" in blocks)
    if banned and re.search(r"\b(nsfw|porn)\b", prompt or "", re.I):
        return "blocked:banned_words"
    return None

def _illustration_policy(user_selected_model: str | None, mode: str) -> str:
    """auto = may call Seedream for SVG data-gen-prompt slots; locked = vector/placeholder only."""
    if mode != "agent":
        return "locked"
    u = _as_text(user_selected_model or "auto").strip().lower()
    return "auto" if u in ("", "auto") else "locked"

def _illustration_system_note(policy: str) -> str:
    if policy == "auto":
        return (
            "\n\nBITMAP_ILLUSTRATION (Auto): "
            "create_shape is ONLY for UI chrome (page bg, card shells, buttons, dividers) — "
            "NEVER use solid color blocks / blobs as fake photos, destinations, products, or covers. "
            "Icons: prefer create_svg (viewBox 0 0 24 24); if too complex/realistic for SVG, "
            "use create_image + genPrompt. "
            "Photos / hero / destination / attraction / product imagery: MUST use "
            "create_image + genPrompt (PNG). "
            "Never use empty circles or color discs as icons. "
            "Never emit both create_image and a junk path for the same icon. "
            "Never fake art with piles of tiny rects/lines. "
            "Hydrate up to 6 AI images per step when the layout needs them."
        )
    return (
        "\n\nBITMAP_ILLUSTRATION: User locked a single chat model — no AI photo generation. "
        "Still: do NOT fake photos with solid color blocks. "
        "Icons: create_svg; UI chrome: create_shape + create_text. "
        "If a photo slot is required, leave a create_image+genPrompt op for later hydrate, "
        "or a clearly labeled muted placeholder — never bright blue/green fake scenery. "
        "Do not tell the user the design must be pure vector."
    )

