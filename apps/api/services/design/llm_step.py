"""One skill step LLM call (collect or stream)."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from services.llm import get_llm_endpoint
from services.design.models_route import to_endpoint_model_id

# Caller "unlimited" — we still send max_tokens (never omit); providers that
# reject oversize values are handled by parsing their ceiling and retrying once.
_UNLIMITED_MAX_TOKENS = 10**9


def _resolve_max_tokens(requested: int | None) -> int:
    """Pass-through: None / <=0 means unlimited; otherwise use the caller's value as-is."""
    if requested is None:
        return _UNLIMITED_MAX_TOKENS
    try:
        n = int(requested)
    except (TypeError, ValueError):
        return _UNLIMITED_MAX_TOKENS
    if n <= 0:
        return _UNLIMITED_MAX_TOKENS
    return n


def _parse_max_tokens_ceiling(detail: str) -> int | None:
    """Extract provider max from errors like: expected a value <= 4096, but got 12000."""
    text = detail or ""
    m = re.search(
        r"(?:<=|at most|maximum(?: value)?(?: of)?)\s*(\d{2,7})",
        text,
        flags=re.I,
    )
    if m:
        return max(1, int(m.group(1)))
    m = re.search(r"max(?:imum)?[_\s-]*tokens[^\d]{0,40}(\d{2,7})", text, flags=re.I)
    if m:
        return max(1, int(m.group(1)))
    return None


def build_user_message_content(
    text: str,
    images: list[str] | None = None,
) -> str | list[dict[str, Any]]:
    """
    OpenAI/Ark multimodal user content.
    With images → [{type:text},{type:image_url},…]; otherwise plain string.
    """
    refs = [u.strip() for u in (images or []) if isinstance(u, str) and u.strip()]
    if not refs:
        return text
    parts: list[dict[str, Any]] = [{"type": "text", "text": text or ""}]
    for url in refs:
        parts.append({"type": "image_url", "image_url": {"url": url}})
    return parts


async def complete_skill_step(
    *,
    model_family: str,
    system: str,
    user: str,
    max_tokens: int | None = None,
    images: list[str] | None = None,
) -> tuple[str, int]:
    """
    Returns (content, approx_tokens).
    model_family: doubao | deepseek | concrete catalog model id.
    Optional ``images`` (data URLs / https) are sent as multimodal vision input.
    ``max_tokens`` None / <=0 = unlimited (still sent; auto-retries if provider caps lower).
    """
    model_id = to_endpoint_model_id(model_family)
    endpoint = get_llm_endpoint(model_id)
    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
    }
    tokens = _resolve_max_tokens(max_tokens)
    payload: dict[str, Any] = {
        "model": endpoint.model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": build_user_message_content(user, images)},
        ],
        "stream": False,
        "max_tokens": tokens,
    }
    url = f"{endpoint.base_url}/chat/completions"
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            detail = resp.text[:800]
            ceiling = _parse_max_tokens_ceiling(detail)
            if (
                resp.status_code == 400
                and ceiling is not None
                and ceiling < tokens
            ):
                payload["max_tokens"] = ceiling
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code >= 400:
                    raise RuntimeError(f"LLM HTTP {resp.status_code}: {resp.text[:800]}")
            else:
                raise RuntimeError(f"LLM HTTP {resp.status_code}: {detail}")
        data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("LLM empty choices")
    msg = choices[0].get("message") or {}
    content = str(msg.get("content") or "")
    usage = data.get("usage") or {}
    total = int(usage.get("total_tokens") or 0)
    if total <= 0:
        total = max(1, len(content) // 3)
    return content, total


def _enable_thinking_payload(endpoint: Any, model_family: str) -> dict[str, Any] | None:
    """Provider-specific body knobs so reasoning_content actually streams."""
    mid = str(getattr(endpoint, "model_id", "") or "").lower()
    family = str(model_family or "").lower()
    provider = str(getattr(endpoint, "provider", "") or "").lower()
    wants = (
        "think" in mid
        or "think" in family
        or "reasoner" in mid
        or mid.endswith("-r1")
        or "reason" in family
    )
    if not wants:
        try:
            from services.llm import list_llm_models

            for m in list_llm_models() or []:
                mid_id = str(m.get("id") or "").lower()
                if mid_id in (mid, family) and m.get("thinking"):
                    wants = True
                    break
        except Exception:
            pass
    if not wants:
        return None
    # deepseek-reasoner already thinks; newer DeepSeek models need thinking.enabled.
    if provider == "deepseek" and "reasoner" not in mid:
        return {"thinking": {"type": "enabled"}}
    # Ark / Doubao / Kimi thinking endpoints often accept the same knob.
    if provider in ("doubao", "ark", "volcengine", "moonshot", "kimi"):
        if "reasoner" in mid or "kimi-k2-thinking" in mid:
            return None
        return {"thinking": {"type": "enabled"}}
    return None


async def stream_skill_step(
    *,
    model_family: str,
    system: str,
    user: str,
    max_tokens: int | None = None,
    images: list[str] | None = None,
    enable_thinking: bool = True,
) -> AsyncIterator[tuple[str, str | int]]:
    """
    Stream one skill step.
    Yields ("thinking", text) for reasoner CoT, ("token", text) for answer tokens,
    then ("usage", approx_tokens).
    ``max_tokens`` None / <=0 = unlimited (still sent; retries once if provider caps lower).
    ``enable_thinking`` False skips provider CoT knobs (Admin: execute.thinking=0).
    """
    model_id = to_endpoint_model_id(model_family)
    endpoint = get_llm_endpoint(model_id)
    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    tokens = _resolve_max_tokens(max_tokens)
    payload: dict[str, Any] = {
        "model": endpoint.model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": build_user_message_content(user, images)},
        ],
        "stream": True,
        "max_tokens": tokens,
        # Ask providers for a final usage chunk (OpenAI-compatible).
        "stream_options": {"include_usage": True},
    }
    extra = _enable_thinking_payload(endpoint, model_family) if enable_thinking else None
    if extra:
        payload.update(extra)
    url = f"{endpoint.base_url}/chat/completions"
    content_len = 0
    usage_total = 0
    import logging as _logging
    import time as _time

    _lg = _logging.getLogger("design.llm_step")
    t0 = _time.time()
    first = True
    open_msg = (
        f"[llm_step] +0.00s  open model={model_family!r} "
        f"api_model={endpoint.model_id!r} max_tokens={tokens} thinking_extra={bool(extra)}"
    )
    _lg.info(open_msg)
    print(open_msg, flush=True)

    async def _consume(resp: httpx.Response) -> AsyncIterator[tuple[str, str | int]]:
        nonlocal content_len, usage_total, first
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
                    approx = max(1, content_len // 3) if content_len else 1
                    yield ("usage", int(usage_total) if usage_total > 0 else approx)
                    return
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                usage = obj.get("usage") or {}
                if isinstance(usage, dict):
                    tot = int(usage.get("total_tokens") or 0)
                    if tot > 0:
                        usage_total = tot
                choices = obj.get("choices") or []
                if not choices:
                    err = obj.get("error")
                    if err:
                        raise RuntimeError(
                            err.get("message") if isinstance(err, dict) else str(err)
                        )
                    continue
                delta = choices[0].get("delta") or {}
                # Reasoner CoT (DeepSeek / Kimi / Doubao thinking, etc.)
                for key in ("reasoning_content", "reasoning"):
                    thought = delta.get(key)
                    if isinstance(thought, str) and thought:
                        content_len += len(thought)
                        if first:
                            first = False
                            dmsg = (
                                f"[llm_step] +{_time.time()-t0:6.2f}s  "
                                f"first_delta thinking preview={thought[:80]!r}"
                            )
                            _lg.info(dmsg)
                            print(dmsg, flush=True)
                        yield ("thinking", thought)
                        break
                text = delta.get("content")
                if isinstance(text, str) and text:
                    content_len += len(text)
                    if first:
                        first = False
                        dmsg = (
                            f"[llm_step] +{_time.time()-t0:6.2f}s  "
                            f"first_delta token preview={text[:80]!r}"
                        )
                        _lg.info(dmsg)
                        print(dmsg, flush=True)
                    yield ("token", text)

    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                detail = body.decode("utf-8", errors="replace")[:800]
                ceiling = _parse_max_tokens_ceiling(detail)
                if (
                    resp.status_code == 400
                    and ceiling is not None
                    and ceiling < tokens
                ):
                    payload["max_tokens"] = ceiling
                    retry_msg = (
                        f"[llm_step] +{_time.time()-t0:6.2f}s  "
                        f"max_tokens retry {tokens}→{ceiling}"
                    )
                    _lg.info(retry_msg)
                    print(retry_msg, flush=True)
                else:
                    raise RuntimeError(f"LLM HTTP {resp.status_code}: {detail}")
            else:
                http_msg = (
                    f"[llm_step] +{_time.time()-t0:6.2f}s  http_ok status={resp.status_code}"
                )
                _lg.info(http_msg)
                print(http_msg, flush=True)
                async for item in _consume(resp):
                    yield item
                return

        # Retry path after oversize max_tokens rejection.
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                detail = body.decode("utf-8", errors="replace")[:800]
                raise RuntimeError(f"LLM HTTP {resp.status_code}: {detail}")
            http_msg = (
                f"[llm_step] +{_time.time()-t0:6.2f}s  http_ok status={resp.status_code} "
                f"max_tokens={payload.get('max_tokens')}"
            )
            _lg.info(http_msg)
            print(http_msg, flush=True)
            async for item in _consume(resp):
                yield item
