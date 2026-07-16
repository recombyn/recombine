"""Domestic image generation placeholder (OpenAI-compatible image APIs later)."""

from __future__ import annotations

from typing import Any

from config.settings import settings
from services.llm import list_image_models


def resolve_image_model(model: str | None = None) -> str:
    mid = (model or settings.image_default_model or "").strip()
    known = {m["id"] for m in list_image_models()}
    if mid in known:
        return mid
    return mid or settings.image_default_model


async def generate_image(
    *,
    prompt: str,
    model: str | None = None,
    aspect_ratio: str | None = None,
) -> dict[str, Any]:
    """
    Image generation is not wired for domestic providers yet.

    Chat uses Doubao / DeepSeek / Qwen / Moonshot via OpenAI-compatible APIs.
    Hook Seedream / DashScope image endpoints here when keys are ready.
    """
    _ = (prompt, model, aspect_ratio, resolve_image_model(model))
    raise RuntimeError(
        "Domestic image generation is not configured yet. "
        "Use a text model for chat, or wire image APIs when LLM keys are ready."
    )
