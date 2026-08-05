"""Hydrate create_image / gen_prompt placeholders into real image URLs."""
from __future__ import annotations

import re
from typing import Any


def _image_model_from_rules(rules: dict[str, str] | None) -> str:
    from app.services.llm.image import resolve_image_model

    mid = str((rules or {}).get("assets.image_default_model") or "").strip()
    return resolve_image_model(mid or None)


def _resolution_for_model(catalog_id: str) -> str:
    """Catalog default resolution (e.g. 2K) — never hardcode a tier the model rejects."""
    from app.services.llm.image import _catalog_image_limits, _pick_resolution

    limits = _catalog_image_limits(catalog_id)
    return _pick_resolution(None, limits)


def _aspect_or_size_from_args(args: dict[str, Any]) -> str:
    """
    Prefer concrete WxH when the agent set slot size (Seedream clamps via imageLimits).
    Otherwise ``auto`` / smart so the provider picks frame within its aspect list.
    """
    try:
        ww = float(args.get("width") or 0)
        hh = float(args.get("height") or 0)
    except (TypeError, ValueError):
        return "auto"
    if ww >= 40 and hh >= 40:
        return f"{int(round(ww))}x{int(round(hh))}"
    return "auto"


async def _hydrate_gen_prompt_images(
    svg: str,
    *,
    limit: int = 2,
    rules: dict[str, str] | None = None,
) -> tuple[str, int]:
    """Fill empty data-gen-prompt <image> slots via the routed image model."""
    if not svg or "data-gen-prompt" not in svg.lower():
        return svg, 0
    from app.services.llm.image import generate_image

    catalog_id = _image_model_from_rules(rules)
    resolution = _resolution_for_model(catalog_id)

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
                model=catalog_id,
                aspect_ratio="auto",
                quality="standard",
                resolution=resolution,
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
    limit: int = 6,
    policy: str = "auto",
    rules: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """
    Fill create_image ops that only have genPrompt/prompt via the routed image model.
    Uses catalog ``imageLimits`` (default resolution / aspect / pixel clamp).
    Returns (ops, successful_image_count) for wallet 积分结算.
    """
    if policy != "auto" or not ops or limit <= 0:
        return ops, 0
    import asyncio

    from app.services.llm.image import generate_image

    catalog_id = _image_model_from_rules(rules)
    resolution = _resolution_for_model(catalog_id)

    pending_idx: list[int] = []
    for i, op in enumerate(ops):
        if len(pending_idx) >= limit:
            break
        if _needs_image_hydrate(op):
            pending_idx.append(i)
    if not pending_idx:
        return ops, 0

    async def _one(op: dict[str, Any]) -> dict[str, Any]:
        args = dict(op.get("args") or {}) if isinstance(op.get("args"), dict) else {}
        prompt = str(args.get("genPrompt") or args.get("prompt") or "").strip()
        aspect = _aspect_or_size_from_args(args)
        try:
            result = await generate_image(
                prompt=prompt[:800],
                model=catalog_id,
                aspect_ratio=aspect,
                quality="standard",
                resolution=resolution,
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
    filled = 0
    for i, new_op in zip(pending_idx, hydrated):
        out[i] = new_op
        args = new_op.get("args") if isinstance(new_op.get("args"), dict) else {}
        if str((args or {}).get("src") or (args or {}).get("url") or "").strip():
            filled += 1
    return out, filled
