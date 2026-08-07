"""Hydrate create_lottie genPrompt → Bodymovin animationData (like image hydrate)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

_log = logging.getLogger(__name__)

_LOTTIE_SYS = """You generate compact Bodymovin / Lottie JSON for UI motion graphics.
Return ONLY a JSON object (no markdown) with keys:
v, fr, ip, op, w, h, nm, ddd, assets (array), layers (array).
Rules:
- 1–3 shape layers max (ty=4); prefer ellipse or rect.
- Animate with ks.o (opacity) and/or ks.s (scale) keyframes; keep paths simple.
- Match the user's brief (loading spinner, success check pulse, bounce, soft loop).
- If reference image(s) are attached, match colors / motif / silhouette in vector shapes (no raster embeds).
- Use requested pixel size w/h when given; default fr=30.
- No images/assets embeds; assets must be [].
"""


def _normalize_lottie_ref_images(images: list[str] | None, *, limit: int = 4) -> list[str]:
    """Keep data-URL / http(s) refs for multimodal lottie gen (cap count + payload)."""
    out: list[str] = []
    max_chars = 8_000_000
    for img in images or []:
        if not isinstance(img, str):
            continue
        s = img.strip()
        if not s:
            continue
        if s.startswith("data:image/"):
            if len(s) > max_chars:
                continue
            out.append(s)
        elif s.startswith("https://") or s.startswith("http://"):
            out.append(s)
        if len(out) >= max(1, int(limit)):
            break
    return out


def _parse_json_object(text: str) -> dict[str, Any] | None:
    raw = str(text or "").strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        got = json.loads(raw)
        return got if isinstance(got, dict) else None
    except Exception:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return None
        try:
            got = json.loads(m.group(0))
            return got if isinstance(got, dict) else None
        except Exception:
            return None


def validate_lottie_animation(data: Any) -> dict[str, Any] | None:
    """Require minimal Bodymovin fields used by the FE Lottie plate."""
    if not isinstance(data, dict):
        return None
    layers = data.get("layers")
    if not isinstance(layers, list) or not layers:
        return None
    try:
        w = int(data.get("w") or 0)
        h = int(data.get("h") or 0)
    except (TypeError, ValueError):
        return None
    if w < 8 or h < 8:
        return None
    out = dict(data)
    out.setdefault("v", "5.7.4")
    out.setdefault("fr", 30)
    out.setdefault("ip", 0)
    if out.get("op") is None:
        out["op"] = max(2, int(out.get("fr") or 30) * 3)
    out.setdefault("ddd", 0)
    out.setdefault("assets", [])
    out.setdefault("nm", "Lottie")
    return out


def build_fallback_lottie(
    *,
    prompt: str,
    width: int = 200,
    height: int = 200,
    duration_sec: float = 3.0,
) -> dict[str, Any]:
    """Deterministic pulse ellipse — always valid if LLM hydrate fails."""
    w = max(32, int(width or 200))
    h = max(32, int(height or 200))
    fr = 30
    sec = max(0.5, float(duration_sec or 3.0))
    op = max(2, int(round(sec * fr)))
    mid = max(1, op // 2)
    cx = w / 2
    cy = h / 2
    diam = max(24.0, min(w, h) * 0.44)
    nm = (str(prompt or "Lottie").strip()[:80] or "Lottie")
    rgb = [0.2, 0.45, 1.0]
    return {
        "v": "5.7.4",
        "fr": fr,
        "ip": 0,
        "op": op,
        "w": w,
        "h": h,
        "nm": nm,
        "ddd": 0,
        "assets": [],
        "layers": [
            {
                "ddd": 0,
                "ind": 1,
                "ty": 4,
                "nm": "pulse",
                "sr": 1,
                "ks": {
                    "o": {
                        "a": 1,
                        "k": [
                            {"t": 0, "s": [40], "e": [100]},
                            {"t": mid, "s": [100], "e": [40]},
                            {"t": op, "s": [40]},
                        ],
                    },
                    "r": {"a": 0, "k": 0},
                    "p": {"a": 0, "k": [cx, cy, 0]},
                    "a": {"a": 0, "k": [0, 0, 0]},
                    "s": {
                        "a": 1,
                        "k": [
                            {"t": 0, "s": [85, 85, 100], "e": [110, 110, 100]},
                            {"t": mid, "s": [110, 110, 100], "e": [85, 85, 100]},
                            {"t": op, "s": [85, 85, 100]},
                        ],
                    },
                },
                "ao": 0,
                "shapes": [
                    {
                        "ty": "el",
                        "p": {"a": 0, "k": [0, 0]},
                        "s": {"a": 0, "k": [diam, diam]},
                    },
                    {
                        "ty": "fl",
                        "c": {"a": 0, "k": [*rgb, 1]},
                        "o": {"a": 0, "k": 100},
                        "r": 1,
                    },
                ],
                "ip": 0,
                "op": op,
                "st": 0,
                "bm": 0,
            }
        ],
    }


async def generate_lottie_animation(
    *,
    prompt: str,
    width: int = 200,
    height: int = 200,
    duration_sec: float = 3.0,
    model: str | None = None,
    images: list[str] | None = None,
) -> dict[str, Any]:
    """LLM Bodymovin when possible; always returns a valid animation dict."""
    text = str(prompt or "").strip()
    w = max(32, int(width or 200))
    h = max(32, int(height or 200))
    sec = max(0.5, float(duration_sec or 3.0))
    refs = _normalize_lottie_ref_images(images)
    fallback = build_fallback_lottie(
        prompt=text or "Lottie", width=w, height=h, duration_sec=sec
    )
    if not text:
        return fallback

    brief = (
        f"Brief: {text}\n"
        f"Canvas size: {w}x{h} px\n"
        f"Duration about {sec:.1f}s (fr=30).\n"
        + (
            "Reference image(s) attached — match style/colors in vector shapes.\n"
            if refs
            else ""
        )
        + "Return animation as a Bodymovin object."
    )

    try:
        from app.services.llm import build_user_message_content
        from app.services.llm.agent import ainvoke_structured
        from pydantic import BaseModel, Field

        class LottieOut(BaseModel):
            animation: dict[str, Any] = Field(
                description="Full Bodymovin JSON object (v/fr/ip/op/w/h/nm/assets/layers)"
            )

        out = await ainvoke_structured(
            schema=LottieOut,
            messages=[
                {
                    "role": "user",
                    "content": build_user_message_content(brief, refs or None),
                }
            ],
            system=_LOTTIE_SYS,
            model=model,
            source="lottie_gen",
            run_name="lottie_gen",
            timeout=20.0,
        )
        structured = out.get("structured") if isinstance(out, dict) else out
        anim = None
        if isinstance(structured, LottieOut):
            anim = structured.animation
        elif isinstance(structured, dict):
            raw = structured.get("animation")
            anim = raw if isinstance(raw, dict) else structured
        validated = validate_lottie_animation(anim)
        if validated:
            validated["w"] = w
            validated["h"] = h
            validated["nm"] = validated.get("nm") or text[:80]
            return validated
    except Exception:
        _log.exception("lottie LLM hydrate failed; using fallback")

    try:
        from app.services.llm import build_user_message_content
        from app.services.llm.agent import build_chat_model, get_llm_endpoint
        from langchain_core.messages import HumanMessage, SystemMessage

        endpoint = get_llm_endpoint(model)
        llm = build_chat_model(endpoint=endpoint, streaming=False, timeout=45.0)
        freeform = (
            f"Brief: {text}\nSize: {w}x{h}\nDuration ~{sec:.1f}s.\n"
            + (
                "Reference image(s) attached — match style in vector shapes.\n"
                if refs
                else ""
            )
            + "Return ONLY the Bodymovin JSON object."
        )
        resp = await llm.ainvoke(
            [
                SystemMessage(content=_LOTTIE_SYS),
                HumanMessage(content=build_user_message_content(freeform, refs or None)),
            ]
        )
        content = getattr(resp, "content", None) or str(resp)
        if isinstance(content, list):
            content = "".join(
                str(p.get("text") if isinstance(p, dict) else p) for p in content
            )
        validated = validate_lottie_animation(_parse_json_object(str(content)))
        if validated:
            validated["w"] = w
            validated["h"] = h
            return validated
    except Exception:
        _log.exception("lottie freeform hydrate failed; using fallback")

    return fallback


def _needs_lottie_hydrate(op: dict[str, Any]) -> bool:
    if not isinstance(op, dict) or str(op.get("name") or "") != "create_lottie":
        return False
    args = op.get("args") if isinstance(op.get("args"), dict) else {}
    has_data = (
        args.get("animationData") is not None
        or args.get("lottie") is not None
        or args.get("json") is not None
        or args.get("animation") is not None
    )
    if has_data:
        raw = args.get("animationData")
        if raw is None:
            raw = args.get("lottie") or args.get("json") or args.get("animation")
        if isinstance(raw, dict) and raw.get("layers"):
            return False
        if isinstance(raw, str) and raw.strip().startswith("{"):
            return False
    gen = str(args.get("genPrompt") or args.get("prompt") or "").strip()
    return bool(gen)


async def hydrate_tool_ops_lottie(
    ops: list[dict[str, Any]],
    *,
    limit: int = 4,
) -> tuple[list[dict[str, Any]], int]:
    """Fill create_lottie genPrompt ops with animationData. Returns (ops, count)."""
    if not ops:
        return ops, 0
    out: list[dict[str, Any]] = []
    filled = 0
    for op in ops:
        if filled >= limit or not _needs_lottie_hydrate(op):
            out.append(op)
            continue
        args = dict(op.get("args") or {})
        prompt = str(args.get("genPrompt") or args.get("prompt") or "").strip()
        try:
            w = int(float(args.get("width") or 200))
        except (TypeError, ValueError):
            w = 200
        try:
            h = int(float(args.get("height") or 200))
        except (TypeError, ValueError):
            h = 200
        try:
            dur = float(args.get("durationSec") or args.get("duration") or 3)
        except (TypeError, ValueError):
            dur = 3.0
        try:
            anim = await generate_lottie_animation(
                prompt=prompt, width=w, height=h, duration_sec=dur
            )
        except BaseException:
            _log.exception("lottie hydrate generate raised; using fallback")
            anim = build_fallback_lottie(
                prompt=prompt or "Lottie", width=w, height=h, duration_sec=dur
            )
        if not validate_lottie_animation(anim):
            anim = build_fallback_lottie(
                prompt=prompt or "Lottie", width=w, height=h, duration_sec=dur
            )
        args["animationData"] = anim
        args.setdefault("genPrompt", prompt)
        next_op = dict(op)
        next_op["args"] = args
        out.append(next_op)
        filled += 1
    if filled:
        _log.info("lottie hydrate filled=%s / ops=%s", filled, len(ops))
    return out, filled
