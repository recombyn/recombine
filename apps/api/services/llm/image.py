"""Doubao (Volcengine Ark) image generation via /images/generations."""

from __future__ import annotations

import math
from typing import Any

import httpx

from config.settings import settings
from services.llm import PROVIDER_BASE_URLS, _api_key_for, list_image_models

# 1K — base ~1024 area
_ASPECT_TO_SIZE_1K: dict[str, str] = {
    "1:1": "1024x1024",
    "1:2": "768x1536",
    "2:1": "1536x768",
    "9:16": "720x1280",
    "16:9": "1280x720",
    "3:4": "864x1152",
    "4:3": "1152x864",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "5:4": "1280x1024",
    "4:5": "1024x1280",
    "21:9": "1680x720",
    "9:21": "720x1680",
}

_ASPECT_TO_SIZE_2K: dict[str, str] = {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3024x1296",
    "9:21": "1296x3024",
    "5:4": "2304x1792",
    "4:5": "1792x2304",
    "1:2": "1440x2880",
    "2:1": "2880x1440",
}

_ASPECT_TO_SIZE_4K: dict[str, str] = {
    "1:1": "4096x4096",
    "4:3": "4704x3520",
    "3:4": "3520x4704",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6240x2656",
    "9:21": "2656x6240",
    "5:4": "4608x3584",
    "4:5": "3584x4608",
    "1:2": "2880x5760",
    "2:1": "5760x2880",
}

_RESOLUTION_TABLES: dict[str, dict[str, str]] = {
    "1K": _ASPECT_TO_SIZE_1K,
    "2K": _ASPECT_TO_SIZE_2K,
    "4K": _ASPECT_TO_SIZE_4K,
}

_RESOLUTION_BASE_AREA: dict[str, int] = {
    "1K": 1024 * 1024,
    "2K": 2048 * 2048,
    "4K": 4096 * 4096,
}

_DEFAULT_IMAGE_MODEL = "doubao-seedream-4-0-250828"


def resolve_image_model(model: str | None = None) -> str:
    mid = (model or settings.image_default_model or "").strip()
    known = {m["id"]: m for m in list_image_models()}
    if mid in known:
        return mid
    if mid:
        return mid
    if known:
        return next(iter(known))
    return _DEFAULT_IMAGE_MODEL


def _api_model_id(catalog_id: str) -> str:
    """Catalog id may differ from the Ark model / endpoint id."""
    for m in list_image_models():
        if m["id"] == catalog_id:
            return str(m.get("api_model") or m["id"])
    return catalog_id or (settings.image_default_model or _DEFAULT_IMAGE_MODEL).strip()


def _round_dim(n: float) -> int:
    """Round to nearest multiple of 16 (Seedream-friendly)."""
    v = int(round(n / 16)) * 16
    return max(16, v)


def _parse_aspect(aspect_ratio: str) -> tuple[float, float]:
    raw = aspect_ratio.strip()
    if ":" in raw:
        parts = raw.split(":", 1)
        try:
            w, h = float(parts[0]), float(parts[1])
            if w > 0 and h > 0:
                return w, h
        except ValueError:
            pass
    if "x" in raw.lower():
        parts = raw.lower().split("x", 1)
        try:
            w, h = float(parts[0]), float(parts[1])
            if w > 0 and h > 0:
                return w, h
        except ValueError:
            pass
    return 1.0, 1.0


def _size_from_area_and_aspect(area: int, aspect_ratio: str) -> str:
    w_r, h_r = _parse_aspect(aspect_ratio)
    ratio = w_r / h_r
    h = math.sqrt(area / ratio)
    w = h * ratio
    return f"{_round_dim(w)}x{_round_dim(h)}"


def _normalize_resolution(resolution: str | None) -> str:
    raw = (resolution or "2K").strip().upper()
    if raw in _RESOLUTION_TABLES:
        return raw
    if raw in ("1024", "1"):
        return "1K"
    if raw in ("2048", "2"):
        return "2K"
    if raw in ("4096", "4"):
        return "4K"
    return "2K"


def _size_for_aspect(
    aspect_ratio: str | None,
    resolution: str | None = None,
) -> str:
    raw = (aspect_ratio or "1:1").strip()
    if "x" in raw.lower() and ":" not in raw:
        return raw
    res_key = _normalize_resolution(resolution)
    table = _RESOLUTION_TABLES[res_key]
    if raw in table:
        return table[raw]
    area = _RESOLUTION_BASE_AREA.get(res_key, _RESOLUTION_BASE_AREA["2K"])
    return _size_from_area_and_aspect(area, raw)


def _optimize_prompt_options(quality: str | None) -> dict[str, str] | None:
    q = (quality or "standard").strip().lower()
    if q == "low":
        return {"mode": "fast"}
    if q in ("standard", "high"):
        return {"mode": "standard"}
    return {"mode": "standard"}


def _extract_images(payload: dict[str, Any]) -> list[str]:
    images: list[str] = []
    for item in payload.get("data") or []:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if isinstance(url, str) and url.strip():
            images.append(url.strip())
            continue
        b64 = item.get("b64_json")
        if isinstance(b64, str) and b64.strip():
            images.append(f"data:image/png;base64,{b64.strip()}")
    return images


async def generate_image(
    *,
    prompt: str,
    model: str | None = None,
    aspect_ratio: str | None = None,
    quality: str | None = None,
    resolution: str | None = None,
    images: list[str] | None = None,
) -> dict[str, Any]:
    """
    Generate images with Doubao Seedream on Volcengine Ark.

    POST {ARK}/images/generations
    Auth: DOUBAO_API_KEY or LLM_API_KEY (Bearer).
    Optional ``images`` enables image-to-image (Seedream 4).
    """
    catalog_id = resolve_image_model(model)
    api_model = _api_model_id(catalog_id)
    api_key = _api_key_for("doubao")
    if not api_key:
        raise RuntimeError(
            "No Doubao API key configured. Set DOUBAO_API_KEY (or LLM_API_KEY) in apps/api/.env"
        )

    base = PROVIDER_BASE_URLS["doubao"].rstrip("/")
    url = f"{base}/images/generations"
    size = _size_for_aspect(aspect_ratio, resolution)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": api_model,
        "prompt": prompt,
        "size": size,
        "response_format": "url",
        "watermark": False,
    }
    opt = _optimize_prompt_options(quality)
    if opt:
        body["optimize_prompt_options"] = opt
    refs = [u.strip() for u in (images or []) if isinstance(u, str) and u.strip()]
    if refs:
        # Seedream 4.x: up to 14 refs (input + output ≤ 15). Cap defensively.
        max_refs = 14
        for m in list_image_models():
            if m.get("id") == catalog_id:
                raw = m.get("max_attachments")
                if isinstance(raw, int) and raw > 0:
                    max_refs = raw
                break
        refs = refs[:max_refs]
        # Seedream 4: single string or list of image URLs / data URLs.
        body["image"] = refs[0] if len(refs) == 1 else refs

    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            detail = (resp.text or "")[:800]
            raise RuntimeError(f"Image HTTP {resp.status_code}: {detail}")
        try:
            data = resp.json()
        except Exception as err:
            raise RuntimeError(f"Image response is not JSON: {err}") from err

    out = _extract_images(data if isinstance(data, dict) else {})
    if not out:
        raise RuntimeError(f"Image generation returned no images: {str(data)[:400]}")

    return {
        "images": out,
        "text": None,
        "model": catalog_id,
    }
