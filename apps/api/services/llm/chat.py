"""OpenAI-compatible chat streaming via httpx SSE (domestic providers)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal

import httpx

from services.llm import get_llm_endpoint

StreamKind = Literal["thinking", "token"]


def _model_supports_thinking(model_id: str | None) -> bool:
    mid = (model_id or "").strip().lower()
    return bool(mid) and ("reasoner" in mid or mid.endswith("-r1"))


async def stream_chat(
    *,
    message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
    thinking: bool | None = None,
    images: list[str] | None = None,
) -> AsyncIterator[tuple[StreamKind, str]]:
    """
    Stream assistant tokens from `{base}/chat/completions`.

    Yields ``("thinking", text)`` for DeepSeek reasoning deltas, then
    ``("token", text)`` for final answer content.
    Optional ``images`` (data URLs / https) enable multimodal vision input.
    """
    from services.design.llm_step import build_user_message_content

    endpoint = get_llm_endpoint(model)
    messages: list[dict[str, Any]] = []
    for item in history or []:
        role = (item.get("role") or "").strip()
        content = (item.get("content") or "").strip()
        if role in ("user", "assistant", "system") and content:
            # Never replay reasoning_content into history (DeepSeek 400 risk).
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": build_user_message_content(message, images)})

    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    use_thinking = (
        thinking if thinking is not None else _model_supports_thinking(endpoint.model_id)
    )

    payload: dict[str, Any] = {
        "model": endpoint.model_id,
        "messages": messages,
        "stream": True,
    }

    # deepseek-reasoner already thinks; newer DeepSeek models use thinking.enabled.
    mid = endpoint.model_id.lower()
    if use_thinking and endpoint.provider == "deepseek" and "reasoner" not in mid:
        payload["thinking"] = {"type": "enabled"}

    url = f"{endpoint.base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                detail = body.decode("utf-8", errors="replace")[:800]
                if resp.status_code == 404 or "InvalidEndpointOrModel" in detail:
                    raise RuntimeError(
                        "Doubao model not found or not activated. "
                        "In Volcengine Ark, create an inference endpoint and set "
                        "DOUBAO_SEED_MODEL=ep-xxxx (or DOUBAO_PRO_MODEL) in apps/api/.env. "
                        f"Detail: {detail}"
                    )
                raise RuntimeError(f"LLM HTTP {resp.status_code}: {detail}")

            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                while True:
                    line_end = buffer.find("\n")
                    if line_end == -1:
                        break
                    line = buffer[:line_end].strip()
                    buffer = buffer[line_end + 1 :]

                    if not line or line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        return
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        err = obj.get("error")
                        if err:
                            raise RuntimeError(
                                err.get("message") if isinstance(err, dict) else str(err)
                            )
                        continue
                    delta = choices[0].get("delta") or {}
                    reasoning = delta.get("reasoning_content")
                    if isinstance(reasoning, str) and reasoning:
                        yield ("thinking", reasoning)
                    text = delta.get("content")
                    if isinstance(text, str) and text:
                        yield ("token", text)
