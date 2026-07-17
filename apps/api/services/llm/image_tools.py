"""Image toolbar AI tools — Seedream i2i via Ark generations API."""

from __future__ import annotations

import base64
from typing import Any

import httpx

from services.llm.image import generate_image

# Kinds that return a new raster image for the canvas clone.
IMAGE_PROCESS_KINDS = frozenset(
    {
        "upscale",
        "removeBg",
        "multiAngle",
        "expand",
        "editElements",
        "editText",
        "vector",
        "adjust",
    }
)


def _prompt_for(
    kind: str,
    *,
    meta: dict[str, Any] | None = None,
) -> str:
    m = meta or {}
    if kind == "removeBg":
        return (
            "Remove the background completely. Keep only the main subject with clean edges. "
            "Output a clean cutout on a transparent or pure white background. "
            "Do not alter the subject's appearance, clothing, or colors."
        )
    if kind == "upscale":
        return (
            "Upscale this image to high resolution. Enhance sharpness and fine detail, "
            "reduce noise, keep the exact composition, identity, and colors unchanged. "
            "No cropping, no restyling."
        )
    if kind == "multiAngle":
        rotate = m.get("rotate", 0)
        tilt = m.get("tilt", 0)
        mode = str(m.get("mode") or "camera")
        if mode == "skybox":
            return (
                f"Based on the reference image, generate an environment / skybox view of the same subject. "
                f"Horizontal yaw about {rotate}°, pitch about {tilt}°. "
                f"Keep subject identity, materials, and lighting style consistent."
            )
        return (
            f"Based on the reference photo, regenerate the same subject from a new camera angle: "
            f"horizontal rotation about {rotate}°, tilt/pitch about {tilt}°. "
            f"Keep face/body/clothing identity and background style; photorealistic."
        )
    if kind == "expand":
        direction = str(m.get("direction") or "all")
        scale = str(m.get("scale") or "1.5x")
        return (
            f"Outpaint / extend the image canvas ({scale}, direction: {direction}). "
            f"Continue the scene naturally beyond the edges; match lighting, perspective, and style. "
            f"Do not distort the original subject."
        )
    if kind == "editElements":
        hint = str(m.get("hint") or "").strip()
        base = (
            "Analyze and cleanly re-render the main visual elements in this image "
            "(subject, props, decorations) so each element is clearer and easier to isolate. "
            "Keep the overall layout; improve edge clarity; do not invent unrelated objects."
        )
        return f"{base} Extra instruction: {hint}" if hint else base
    if kind == "editText":
        hint = str(m.get("hint") or "").strip()
        base = (
            "Enhance and clarify any text visible in this image. "
            "Make lettering sharp and readable while preserving the original wording and layout. "
            "Do not change non-text content unnecessarily."
        )
        return f"{base} Extra instruction: {hint}" if hint else base
    if kind == "vector":
        return (
            "Convert this image into a clean flat vector-illustration style: "
            "crisp outlines, solid fills, minimal gradients, no photographic noise. "
            "Preserve the main subject and composition."
        )
    if kind == "adjust":
        hint = str(m.get("hint") or "balanced exposure, natural contrast and color").strip()
        return (
            f"Apply photographic color/tone adjustment: {hint}. "
            f"Keep composition and subject identity identical; no restyling."
        )
    raise ValueError(f"Unsupported image process kind: {kind}")


def _resolution_for(kind: str, resolution: str | None) -> str | None:
    if kind == "upscale":
        return (resolution or "4K").strip() or "4K"
    return resolution


async def _as_data_url(image_ref: str) -> str:
    """Prefer embeddable data URLs so the canvas does not depend on remote CDN CORS."""
    ref = (image_ref or "").strip()
    if not ref:
        raise ValueError("empty image")
    if ref.startswith("data:"):
        return ref
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        resp = await client.get(ref)
        if resp.status_code >= 400:
            # Fall back to the remote URL if download fails.
            return ref
        ctype = (resp.headers.get("content-type") or "image/png").split(";")[0].strip()
        if not ctype.startswith("image/"):
            ctype = "image/png"
        b64 = base64.b64encode(resp.content).decode("ascii")
        return f"data:{ctype};base64,{b64}"


async def process_image_tool(
    *,
    kind: str,
    image: str,
    meta: dict[str, Any] | None = None,
    aspect_ratio: str | None = None,
    quality: str | None = None,
    resolution: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """
    Run a toolbar image tool via Seedream image-to-image.

    Returns ``{ image, text?, kind, model }``.
    """
    k = (kind or "").strip()
    if k not in IMAGE_PROCESS_KINDS:
        raise ValueError(f"Unsupported kind: {kind}")
    src = (image or "").strip()
    if not src:
        raise ValueError("image is required")

    prompt = _prompt_for(k, meta=meta)
    result = await generate_image(
        prompt=prompt,
        model=model,
        aspect_ratio=aspect_ratio,
        quality=quality or "high",
        resolution=_resolution_for(k, resolution),
        images=[src],
    )
    images = result.get("images") or []
    if not images:
        raise RuntimeError("Image tool returned no images")
    out = await _as_data_url(str(images[0]))
    return {
        "image": out,
        "text": result.get("text"),
        "kind": k,
        "model": result.get("model"),
    }
