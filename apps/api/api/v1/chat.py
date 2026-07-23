"""Chat LLM API —  SSE message streaming."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.auth import get_session
from services.llm import get_llm_endpoint, list_all_models, list_image_models
from services.llm.agent import stream_agent_turn
from services.llm.chat import stream_chat
from services.llm.design_tools import design_tool_definitions
from services.llm.image import generate_image
from services.wallet.db import spend_tokens

router = APIRouter()

_AGENT_TOKEN_COST = 1
_MESSAGE_TOKEN_COST = 1
_IMAGE_TOKEN_COST = 2


class ChatMessageIn(BaseModel):
    message: str = Field(..., min_length=1)
    model: str | None = None
    history: list[dict[str, str]] = Field(default_factory=list)
    # Enable DeepSeek thinking when the model supports it (default: auto).
    thinking: bool | None = None


class AgentTurnIn(BaseModel):
    """One Cursor-like agent LLM turn (may return tool_calls)."""

    messages: list[dict] = Field(default_factory=list)
    model: str | None = None
    tools: list[dict] | None = None


class ImageGenerateIn(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str | None = None
    aspect_ratio: str | None = None
    quality: str | None = None
    resolution: str | None = None
    images: list[str] | None = None


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def _require_user(authorization: str | None):
    user = get_session(_bearer(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def _charge(user_id: str, amount: int, detail: str) -> None:
    try:
        spend_tokens(user_id, amount, detail)
    except ValueError as err:
        if str(err) == "insufficient_tokens":
            raise HTTPException(status_code=402, detail="Insufficient credits") from err
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get("/models")
def get_models() -> dict[str, Any]:
    items = list_all_models()
    available = True
    try:
        get_llm_endpoint()
    except Exception:
        available = False
    return {
        "models": items,
        "available": available,
        "imageModels": list_image_models(),
    }


@router.post("/message")
async def post_message(
    body: ChatMessageIn,
    authorization: str | None = Header(default=None),
):
    user = _require_user(authorization)
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="empty message")

    # Image models should use /image, not text stream.
    image_ids = {m["id"] for m in list_image_models()}
    if body.model and body.model in image_ids:
        raise HTTPException(
            status_code=400,
            detail="Selected model is an image model. Use POST /api/v1/chat/image instead.",
        )

    _charge(user.id, _MESSAGE_TOKEN_COST, "AI chat message")

    async def event_gen():
        try:
            get_llm_endpoint(body.model)
            yield f"data: {json.dumps({'type': 'start', 'model': body.model}, ensure_ascii=False)}\n\n"
            async for kind, text in stream_chat(
                message=body.message.strip(),
                history=body.history,
                model=body.model,
                thinking=body.thinking,
            ):
                event_type = "thinking" if kind == "thinking" else "token"
                yield f"data: {json.dumps({'type': event_type, 'text': text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as err:
            yield f"data: {json.dumps({'type': 'error', 'message': str(err)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/agent/tools")
def get_agent_tools() -> dict[str, Any]:
    return {"tools": design_tool_definitions()}


@router.post("/agent")
async def post_agent_turn(
    body: AgentTurnIn,
    authorization: str | None = Header(default=None),
):
    """Stream one agent turn with tool-calling (frontend executes tools on canvas)."""
    user = _require_user(authorization)
    if not body.messages:
        raise HTTPException(status_code=400, detail="empty messages")

    # Charge before starting the stream so 402 is a real HTTP status.
    _charge(user.id, _AGENT_TOKEN_COST, "AI agent turn")

    async def event_gen():
        try:
            get_llm_endpoint(body.model)
            yield f"data: {json.dumps({'type': 'start', 'model': body.model}, ensure_ascii=False)}\n\n"
            async for kind, payload in stream_agent_turn(
                messages=body.messages,
                model=body.model,
                tools=body.tools,
            ):
                if kind == "thinking":
                    yield f"data: {json.dumps({'type': 'thinking', 'text': payload}, ensure_ascii=False)}\n\n"
                elif kind == "token":
                    yield f"data: {json.dumps({'type': 'token', 'text': payload}, ensure_ascii=False)}\n\n"
                elif kind == "tool_call":
                    yield f"data: {json.dumps({'type': 'tool_call', 'toolCall': payload}, ensure_ascii=False)}\n\n"
                elif kind == "message":
                    yield f"data: {json.dumps({'type': 'message', 'message': payload}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as err:
            yield f"data: {json.dumps({'type': 'error', 'message': str(err)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/image")
async def post_image(
    body: ImageGenerateIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="empty prompt")

    _charge(user.id, _IMAGE_TOKEN_COST, "AI image generation")

    try:
        result = await generate_image(
            prompt=body.prompt.strip(),
            model=body.model,
            aspect_ratio=body.aspect_ratio,
            quality=body.quality,
            resolution=body.resolution,
            images=body.images,
        )
    except RuntimeError as err:
        msg = str(err)
        if "No LLM API key" in msg:
            raise HTTPException(status_code=503, detail=msg) from err
        raise HTTPException(status_code=502, detail=msg) from err

    from services.assets import create_asset_from_url

    assets_out: list[dict[str, Any]] = []
    for img_url in result.get("images") or []:
        if not isinstance(img_url, str) or not img_url.strip():
            continue
        try:
            asset = create_asset_from_url(
                user.id,
                img_url.strip(),
                kind="image",
                source="ai_image",
                prompt=body.prompt.strip(),
            )
            assets_out.append(asset)
        except Exception:
            continue
    if assets_out:
        result = {**result, "assets": assets_out}
    return result
