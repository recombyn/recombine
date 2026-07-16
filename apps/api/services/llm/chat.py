"""OpenAI-compatible chat streaming via httpx SSE (domestic providers)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from services.llm import get_llm_endpoint


async def stream_chat(
    *,
    message: str,
    history: list[dict[str, str]] | None = None,
    model: str | None = None,
) -> AsyncIterator[str]:
    """
    Stream assistant tokens from `{base}/chat/completions`.

    Yields plain text chunks (delta content). Raises on HTTP / config errors.
    """
    endpoint = get_llm_endpoint(model)
    messages: list[dict[str, str]] = []
    for item in history or []:
        role = (item.get("role") or "").strip()
        content = (item.get("content") or "").strip()
        if role in ("user", "assistant", "system") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    payload: dict[str, Any] = {
        "model": endpoint.model_id,
        "messages": messages,
        "stream": True,
    }

    url = f"{endpoint.base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                detail = body.decode("utf-8", errors="replace")[:800]
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
                    text = delta.get("content")
                    if text:
                        yield text
