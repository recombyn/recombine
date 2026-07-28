"""Chat LLM API —  SSE message streaming."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.auth import get_session
from services.llm import get_llm_endpoint, list_image_models, list_llm_models
from services.llm.agent import stream_agent_turn, stream_official_agent
from services.llm.chat import stream_chat
from services.llm.design_tools import design_tool_definitions
from services.llm.image import generate_image
from services.llm.usage_log import bind_usage_context, usage_context
from services.wallet.db import (
    consume_free_daily_quota,
    get_user_image_credits,
    get_user_plan,
    get_user_tokens,
    spend_image_credits,
    spend_tokens,
)
from services.wallet.billing import DEFAULT_IMAGE_CREDITS, image_model_credit_cost

router = APIRouter()
logger = logging.getLogger(__name__)

# Unified 积分 (flat per call; 10× display scale).
_AGENT_TOKEN_COST = 10
_MESSAGE_TOKEN_COST = 10
# Free plan: image gen locked to Seedream 4.0 (shares daily free run with Auto design).
_FREE_IMAGE_MODEL = "doubao-seedream-4-0"


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
    # turn = bind_tools + client canvas (default); react = official create_agent loop
    mode: str | None = Field(
        default="turn",
        description="turn | react — react uses LangChain create_agent (server tools)",
    )


class ImageGenerateIn(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str | None = None
    aspect_ratio: str | None = None
    quality: str | None = None
    resolution: str | None = None
    n: int | None = None
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


def _charge_image_credits(user_id: str, amount: int, detail: str) -> None:
    try:
        spend_image_credits(user_id, amount, detail)
    except ValueError as err:
        if str(err) == "insufficient_image_credits":
            raise HTTPException(status_code=402, detail="Insufficient credits") from err
        raise HTTPException(status_code=400, detail=str(err)) from err


def _charge_image(
    user_id: str,
    requested_model: str | None,
    *,
    resolution: str | None = None,
    count: int = 1,
) -> tuple[str, int]:
    """
    Charge image gen from 积分 balance (厂商按张 / 按分辨率估算).
    Free plan: force Seedream 4.0; use 积分 or today's free daily run.
    Returns (model id to call, credits actually charged).
    """
    n = max(1, min(4, int(count or 1)))
    plan = get_user_plan(user_id)
    if plan == "free":
        mid = _FREE_IMAGE_MODEL
        cost = image_model_credit_cost(mid, count=n, resolution=resolution)
        bal = get_user_image_credits(user_id)
        if bal >= cost:
            _charge_image_credits(user_id, cost, "AI image generation")
            return mid, cost
        if consume_free_daily_quota(user_id):
            return mid, 0
        raise HTTPException(
            status_code=402,
            detail="free_daily_exhausted",
        )
    mid = (requested_model or "").strip() or None
    cost = (
        image_model_credit_cost(mid, count=n, resolution=resolution)
        if mid
        else DEFAULT_IMAGE_CREDITS * n
    )
    _charge_image_credits(user_id, cost, "AI image generation")
    return mid, cost


@router.get("/models")
def get_models() -> dict[str, Any]:
    # Keep text/chat and image catalogs separate — FE merges with dedupe.
    # Do not use list_all_models() here or image ids appear twice under models + imageModels.
    items = list_llm_models()
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
    bind_usage_context(
        user_id=user.id,
        source="chat",
        credits_charged=_MESSAGE_TOKEN_COST,
    )

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
    """
    Stream agent turn.

    - mode=turn (default): bind_tools; canvas tools for the frontend.
    - mode=react: official LangChain create_agent (server tools loop).
    """
    user = _require_user(authorization)
    if not body.messages:
        raise HTTPException(status_code=400, detail="empty messages")

    mode = (body.mode or "turn").strip().lower()
    if mode not in ("turn", "react"):
        raise HTTPException(status_code=400, detail="mode must be turn|react")

    _charge(user.id, _AGENT_TOKEN_COST, "AI agent turn")
    bind_usage_context(
        user_id=user.id,
        source="agent",
        credits_charged=_AGENT_TOKEN_COST,
    )

    async def event_gen():
        try:
            get_llm_endpoint(body.model)
            yield f"data: {json.dumps({'type': 'start', 'model': body.model, 'mode': mode}, ensure_ascii=False)}\n\n"
            stream = (
                stream_official_agent(
                    messages=body.messages,
                    model=body.model,
                )
                if mode == "react"
                else stream_agent_turn(
                    messages=body.messages,
                    model=body.model,
                    tools=body.tools,
                )
            )
            async for kind, payload in stream:
                if kind == "thinking":
                    yield f"data: {json.dumps({'type': 'thinking', 'text': payload}, ensure_ascii=False)}\n\n"
                elif kind == "token":
                    yield f"data: {json.dumps({'type': 'token', 'text': payload}, ensure_ascii=False)}\n\n"
                elif kind == "tool_call":
                    yield f"data: {json.dumps({'type': 'tool_call', 'toolCall': payload}, ensure_ascii=False)}\n\n"
                elif kind == "tool_result":
                    yield f"data: {json.dumps({'type': 'tool_result', 'toolResult': payload}, ensure_ascii=False)}\n\n"
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

    model_id, credits_charged = _charge_image(
        user.id,
        body.model,
        resolution=body.resolution,
        count=int(body.n or 1),
    )

    try:
        with usage_context(
            user_id=user.id,
            source="image",
            credits_charged=credits_charged,
        ):
            result = await generate_image(
                prompt=body.prompt.strip(),
                model=model_id,
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
        except Exception as err:  # noqa: BLE001 — keep raw CDN url when rehost fails
            logger.warning("image rehost failed (%s): %s", type(err).__name__, err)
            continue
    if assets_out:
        result = {**result, "assets": assets_out}
    return result
