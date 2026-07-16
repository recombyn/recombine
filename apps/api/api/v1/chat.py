"""Chat LLM API —  SSE message streaming."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.llm import get_llm_endpoint, list_all_models, list_image_models
from services.llm.chat import stream_chat
from services.llm.image import generate_image

router = APIRouter()


class ChatMessageIn(BaseModel):
    message: str = Field(..., min_length=1)
    model: str | None = None
    history: list[dict[str, str]] = Field(default_factory=list)


class ImageGenerateIn(BaseModel):
    prompt: str = Field(..., min_length=1)
    model: str | None = None
    aspect_ratio: str | None = None


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
async def post_message(body: ChatMessageIn):
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="empty message")

    # Image models should use /image, not text stream.
    image_ids = {m["id"] for m in list_image_models()}
    if body.model and body.model in image_ids:
        raise HTTPException(
            status_code=400,
            detail="Selected model is an image model. Use POST /api/v1/chat/image instead.",
        )

    async def event_gen():
        try:
            get_llm_endpoint(body.model)
            yield f"data: {json.dumps({'type': 'start', 'model': body.model}, ensure_ascii=False)}\n\n"
            async for token in stream_chat(
                message=body.message.strip(),
                history=body.history,
                model=body.model,
            ):
                yield f"data: {json.dumps({'type': 'token', 'text': token}, ensure_ascii=False)}\n\n"
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
async def post_image(body: ImageGenerateIn) -> dict[str, Any]:
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="empty prompt")
    try:
        result = await generate_image(
            prompt=body.prompt.strip(),
            model=body.model,
            aspect_ratio=body.aspect_ratio,
        )
    except RuntimeError as err:
        msg = str(err)
        if "No LLM API key" in msg:
            raise HTTPException(status_code=503, detail=msg) from err
        raise HTTPException(status_code=502, detail=msg) from err
    return result
