"""Image toolbar AI tools — Seedream i2i + local rembg / OCR decompose."""

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
        "editText",
        "editElements",
        "vector",
        "adjust",
    }
)

# Vision split / cutout — not Seedream re-render.
DECOMPOSE_KINDS = frozenset({"editText", "editElements"})
CUTOUT_KINDS = frozenset({"removeBg"})


def _prompt_for(
    kind: str,
    *,
    meta: dict[str, Any] | None = None,
) -> str:
    m = meta or {}
    if kind == "removeBg":
        return "unused"
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
        pad_l = int(m.get("padLeft") or 0)
        pad_r = int(m.get("padRight") or 0)
        pad_t = int(m.get("padTop") or 0)
        pad_b = int(m.get("padBottom") or 0)
        tw = m.get("targetWidth")
        th = m.get("targetHeight")
        size_hint = (
            f" Target canvas about {int(tw)}×{int(th)}px."
            if tw and th
            else ""
        )
        pad_hint = ""
        if pad_l or pad_r or pad_t or pad_b:
            pad_hint = (
                f" Extend roughly left={pad_l}px, right={pad_r}px, "
                f"top={pad_t}px, bottom={pad_b}px beyond the original."
            )
        return (
            f"Outpaint / extend the image canvas ({scale}, direction: {direction})."
            f"{size_hint}{pad_hint} "
            f"Continue the scene naturally beyond the edges; match lighting, perspective, and style. "
            f"Do not distort the original subject."
        )
    if kind in ("editText", "editElements"):
        return "unused"
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
    Run a toolbar image tool.

    - ``removeBg`` → local rembg (GrabCut fallback) transparent PNG
    - ``editText`` → OCR text layers + inpainted background
    - ``editElements`` → subjects + text layers + inpainted background
    - other kinds → Seedream image-to-image

    Returns ``{ image, layers?, text?, kind, model?, width?, height?, warnings? }``.
    """
    k = (kind or "").strip()
    if k not in IMAGE_PROCESS_KINDS:
        raise ValueError(f"Unsupported kind: {kind}")
    src = (image or "").strip()
    if not src:
        raise ValueError("image is required")

    if k in CUTOUT_KINDS:
        from services.vision.remove_bg import remove_background

        return await remove_background(src, meta=meta)

    if k in DECOMPOSE_KINDS:
        from services.vision.image_edit import decompose_image

        return await decompose_image(kind=k, image=src)  # type: ignore[arg-type]

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


_LAYOUT_WIREFRAME_PROMPT = (
    "Convert the reference into a clean professional UX wireframe / layout diagram (ban shi tu). "
    "Use flat grayscale blocks for image, text, and button regions. "
    "Show clear hierarchy: header, sections, cards, CTAs as simple rectangles with light labels if needed. "
    "No photorealism, no colorful UI chrome, no photos, no shadows, no gradients. "
    "Preserve the approximate composition and proportions of the reference. "
    "Look like a Figma low-fidelity wireframe used for design planning."
)


async def generate_layout_wireframe(
    *,
    image_url: str | None = None,
    image_urls: list[str] | None = None,
    brief: str | None = None,
    model: str | None = None,
    aspect_ratio: str | None = "3:4",
    quality: str | None = "hd",
    resolution: str | None = "2K",
) -> dict[str, Any]:
    """One or more refs + brief -> wireframe. Brief may cite image1/image2."""
    extra = (brief or "").strip()
    prompt = _LAYOUT_WIREFRAME_PROMPT
    if extra:
        prompt = f"{prompt} Extra direction: {extra}"
    refs: list[str] = []
    for u in image_urls or []:
        s = str(u or "").strip()
        if s and s not in refs:
            refs.append(s)
    if image_url and str(image_url).strip():
        s = str(image_url).strip()
        if s not in refs:
            refs.insert(0, s)
    if refs:
        labels = ", ".join(f"image{i}(图{i})" for i in range(1, len(refs) + 1))
        prompt = (
            f"Reference images in order: {labels}. "
            "When the brief says 图1/图2 or image1/image2, map to these references by index. "
            "Use them as composition / content guides for the wireframe. "
            + prompt
        )
    elif not extra:
        prompt = (
            "Generate a clean professional UX wireframe layout diagram for a mobile or web product screen. "
            + prompt
        )
    result = await generate_image(
        prompt=prompt,
        model=model,
        aspect_ratio=aspect_ratio or "3:4",
        quality=quality or "hd",
        resolution=resolution or "2K",
        images=refs or None,
    )
    images = list(result.get("images") or [])
    if not images:
        raise RuntimeError("layout wireframe generation returned no image")
    # Keep remote CDN URL for library cover storage (data URLs are too large for DB).
    out_url = str(images[0])
    return {
        "url": out_url,
        "model": result.get("model"),
        "prompt": prompt,
    }

