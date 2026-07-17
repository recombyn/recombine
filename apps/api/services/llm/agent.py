"""Streaming LLM completion with OpenAI-compatible tool calls (DeepSeek)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal

import httpx

from services.llm import get_llm_endpoint
from services.llm.design_tools import DESIGN_AGENT_SYSTEM, design_tool_definitions

AgentEvent = Literal["thinking", "token", "tool_call", "message"]


def _normalize_messages(raw: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if role not in ("system", "user", "assistant", "tool"):
            continue
        msg: dict[str, Any] = {"role": role}
        if role == "tool":
            msg["tool_call_id"] = str(item.get("tool_call_id") or "")
            msg["content"] = str(item.get("content") or "")
            out.append(msg)
            continue
        if item.get("content") is not None:
            msg["content"] = item.get("content")
        # Assistant tool_calls (do not include reasoning_content).
        tcs = item.get("tool_calls")
        if role == "assistant" and isinstance(tcs, list) and tcs:
            msg["tool_calls"] = tcs
            if "content" not in msg:
                msg["content"] = item.get("content")
        out.append(msg)
    return out


def _agent_model_id(requested: str | None, endpoint_model: str) -> str:
    """Prefer a tool-capable chat model; reasoner aliases often lack tool_calls."""
    mid = (requested or endpoint_model or "").strip()
    low = mid.lower()
    if "reasoner" in low:
        return "deepseek-chat"
    return mid or "deepseek-chat"


async def stream_agent_turn(
    *,
    messages: list[dict[str, Any]],
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    system: str | None = None,
) -> AsyncIterator[tuple[str, Any]]:
    """
    One agent LLM turn with tools.

    Yields:
      ("thinking", text)
      ("token", text)
      ("tool_call", {id, name, arguments})
      ("message", {role, content, tool_calls?})  # final assistant message snapshot
    """
    endpoint = get_llm_endpoint(model)
    model_id = _agent_model_id(model, endpoint.model_id)

    normalized = _normalize_messages(messages)
    has_system = any(m.get("role") == "system" for m in normalized)
    final_messages: list[dict[str, Any]] = []
    base_system = system or DESIGN_AGENT_SYSTEM
    if not has_system:
        final_messages.append({"role": "system", "content": base_system})
        final_messages.extend(normalized)
    else:
        # Frontend often sends a short system + canvas context; always keep hard rules.
        for m in normalized:
            if m.get("role") == "system":
                existing = str(m.get("content") or "").strip()
                if existing and base_system not in existing:
                    final_messages.append(
                        {"role": "system", "content": f"{base_system}\n\n{existing}"}
                    )
                else:
                    final_messages.append(
                        {"role": "system", "content": existing or base_system}
                    )
            else:
                final_messages.append(m)

    tool_defs = tools if tools is not None else design_tool_definitions()

    headers = {
        "Authorization": f"Bearer {endpoint.api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload: dict[str, Any] = {
        "model": model_id,
        "messages": final_messages,
        "stream": True,
        "tools": tool_defs,
        "tool_choice": "auto",
    }

    url = f"{endpoint.base_url}/chat/completions"
    content_acc = ""
    # index -> {id, name, arguments}
    tool_acc: dict[int, dict[str, str]] = {}

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
                        break
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
                        content_acc += text
                        yield ("token", text)

                    for tc in delta.get("tool_calls") or []:
                        if not isinstance(tc, dict):
                            continue
                        idx = int(tc.get("index") or 0)
                        slot = tool_acc.setdefault(
                            idx, {"id": "", "name": "", "arguments": ""}
                        )
                        if tc.get("id"):
                            slot["id"] = str(tc["id"])
                        fn = tc.get("function") or {}
                        if isinstance(fn, dict):
                            if fn.get("name"):
                                slot["name"] = str(fn["name"])
                            if fn.get("arguments"):
                                slot["arguments"] += str(fn["arguments"])

    tool_calls_out: list[dict[str, Any]] = []
    for idx in sorted(tool_acc.keys()):
        slot = tool_acc[idx]
        name = slot.get("name") or ""
        if not name:
            continue
        tc_id = slot.get("id") or f"call_{idx}"
        args = slot.get("arguments") or "{}"
        tool_calls_out.append(
            {
                "id": tc_id,
                "type": "function",
                "function": {"name": name, "arguments": args},
            }
        )
        yield (
            "tool_call",
            {"id": tc_id, "name": name, "arguments": args},
        )

    assistant: dict[str, Any] = {
        "role": "assistant",
        "content": content_acc or None,
    }
    if tool_calls_out:
        assistant["tool_calls"] = tool_calls_out
    yield ("message", assistant)
