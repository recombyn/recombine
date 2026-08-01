"""Image toolbar AI tools API — frontend calls these instead of local CV."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services.llm.image_tools import IMAGE_PROCESS_KINDS, process_image_tool
from services.wallet.billing import DEFAULT_IMAGE_CREDITS, image_model_credit_cost
from services.wallet.db import spend_image_credits

router = APIRouter()

# Wallet 积分 charged per image tool when not tied to a Seedream catalog price.
# Scale: Standard ¥29 ≈ 200 积分 → tools cost a few 积分 each.
_KIND_CREDIT_COST: dict[str, int] = {
    "upscale": 20,
    "removeBg": 10,
    "multiAngle": 30,
    "expand": 30,
    "editText": 20,
    "editElements": 30,
    "vector": 20,
    "adjust": 20,
}


class ImageProcessIn(BaseModel):
    kind: str = Field(..., min_length=1, description="removeBg | upscale | multiAngle | ...")
    image: str = Field(..., min_length=1, description="Source image data URL or https URL")
    meta: dict[str, Any] | None = None
    aspect_ratio: str | None = None
    quality: str | None = None
    resolution: str | None = None
    model: str | None = None


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
        spend_image_credits(user_id, amount, detail)
    except ValueError as err:
        if str(err) == "insufficient_image_credits":
            raise HTTPException(status_code=402, detail="Insufficient tokens") from err
        raise HTTPException(status_code=400, detail=str(err)) from err


def token_cost_for_kind(kind: str, model: str | None = None) -> int:
    """Wallet credits for an image tool. Prefer catalog 元/张 when model is set."""
    mid = (model or "").strip()
    if mid:
        return image_model_credit_cost(mid)
    return int(_KIND_CREDIT_COST.get((kind or "").strip(), DEFAULT_IMAGE_CREDITS))


# Back-compat alias for older callers.
credit_cost_for_kind = token_cost_for_kind


@router.get("/tools")
def list_image_tools() -> dict[str, Any]:
    kinds = sorted(IMAGE_PROCESS_KINDS)
    costs = {k: token_cost_for_kind(k) for k in kinds}
    return {
        "kinds": kinds,
        "tokens": costs,
        # Legacy key — same map as tokens.
        "credits": costs,
    }


@router.post("/process")
async def post_image_process(
    body: ImageProcessIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    kind = body.kind.strip()
    cost = token_cost_for_kind(kind, body.model)
    # Charge before the model call so insufficient balance fails fast.
    _charge(user.id, cost, f"AI image tool: {kind}")

    try:
        result = await process_image_tool(
            kind=kind,
            image=body.image.strip(),
            meta=body.meta,
            aspect_ratio=body.aspect_ratio,
            quality=body.quality,
            resolution=body.resolution,
            model=body.model,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except RuntimeError as err:
        msg = str(err)
        if "No Doubao API key" in msg or "No LLM API key" in msg:
            raise HTTPException(status_code=503, detail=msg) from err
        raise HTTPException(status_code=502, detail=msg) from err

    if isinstance(result, dict):
        result = {**result, "tokens": cost, "credits": cost}
    return result
