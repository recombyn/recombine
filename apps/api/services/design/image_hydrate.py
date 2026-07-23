"""Hydrate create_image / gen_prompt placeholders into real image URLs."""
from __future__ import annotations

import asyncio
import re
from typing import Any

async def _hydrate_gen_prompt_images(svg: str, *, limit: int = 2) -> tuple[str, int]:
    """Fill empty data-gen-prompt <image> slots via Volcengine Seedream."""
    if not svg or "data-gen-prompt" not in svg.lower():
        return svg, 0
    from services.llm.image import generate_image

    pattern = re.compile(
        r"<image\b[^>]*\bdata-gen-prompt\s*=\s*\"([^\"]+)\"[^>]*/?>",
        re.I,
    )
    out = svg
    filled = 0
    for m in list(pattern.finditer(svg)):
        if filled >= limit:
            break
        tag = m.group(0)
        prompt = (m.group(1) or "").strip()
        if not prompt:
            continue
        if re.search(r"xlink:href\s*=\s*['\"]https?://", tag, re.I):
            continue
        try:
            result = await generate_image(
                prompt=prompt,
                aspect_ratio="1:1",
                quality="standard",
                resolution="1K",
            )
            url = (result.get("images") or [None])[0]
            if not url:
                continue
        except Exception:
            continue
        if re.search(r"xlink:href\s*=", tag, re.I):
            new_tag = re.sub(
                r"xlink:href\s*=\s*['\"][^'\"]*['\"]",
                f'xlink:href="{url}"',
                tag,
                count=1,
                flags=re.I,
            )
        else:
            new_tag = tag.replace("<image", f'<image xlink:href="{url}"', 1)
        out = out.replace(tag, new_tag, 1)
        filled += 1
    return out, filled

def _aspect_from_wh(w: Any, h: Any) -> str:
    try:
        ww, hh = float(w), float(h)
        if ww > 0 and hh > 0:
            return f"{ww:.4g}:{hh:.4g}"
    except (TypeError, ValueError):
        pass
    return "1:1"

def _needs_image_hydrate(op: dict[str, Any]) -> bool:
    if not isinstance(op, dict) or str(op.get("name") or "") != "create_image":
        return False
    args = op.get("args") if isinstance(op.get("args"), dict) else {}
    if args.get("attachmentIndex") is not None:
        return False
    if str(args.get("src") or args.get("url") or "").strip():
        return False
    return bool(str(args.get("genPrompt") or args.get("prompt") or "").strip())

async def _hydrate_tool_ops_images(
    ops: list[dict[str, Any]],
    *,
    limit: int = 2,
    policy: str = "auto",
) -> list[dict[str, Any]]:
    """
    Fill create_image ops that only have genPrompt/prompt via Seedream.
    tool_ops create path skips SVG hydrate — this restores AI imagery.
    Image gens run in parallel (capped by limit).
    """
    if policy != "auto" or not ops or limit <= 0:
        return ops
    import asyncio

    from services.llm.image import generate_image

    pending_idx: list[int] = []
    for i, op in enumerate(ops):
        if len(pending_idx) >= limit:
            break
        if _needs_image_hydrate(op):
            pending_idx.append(i)
    if not pending_idx:
        return ops

    async def _one(op: dict[str, Any]) -> dict[str, Any]:
        args = dict(op.get("args") or {}) if isinstance(op.get("args"), dict) else {}
        prompt = str(args.get("genPrompt") or args.get("prompt") or "").strip()
        aspect = _aspect_from_wh(args.get("width"), args.get("height"))
        try:
            result = await generate_image(
                prompt=prompt[:800],
                aspect_ratio=aspect,
                quality="standard",
                resolution="1K",
            )
            url = (result.get("images") or [None])[0]
        except Exception:
            url = None
        if url:
            args["src"] = str(url)
        next_op: dict[str, Any] = {"name": "create_image", "args": args}
        if op.get("op_id"):
            next_op["op_id"] = op["op_id"]
        return next_op

    hydrated = await asyncio.gather(*(_one(ops[i]) for i in pending_idx))
    out = list(ops)
    for i, new_op in zip(pending_idx, hydrated):
        out[i] = new_op
    return out

