"""Image toolbar AI tools API — frontend calls these instead of local CV."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from services.auth import get_session
from services.llm.image_tools import IMAGE_PROCESS_KINDS, process_image_tool
from services.wallet.db import spend_tokens

router = APIRouter()

# Credits per tool (bolt amounts shown on confirm buttons).
_KIND_CREDIT_COST: dict[str, int] = {
    "upscale": 2,
    "removeBg": 1,
    "multiAngle": 2,
    "expand": 8,
    "editElements": 2,
    "editText": 2,
    "vector": 2,
    "adjust": 2,
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
        spend_tokens(user_id, amount, detail)
    except ValueError as err:
        if str(err) == "insufficient_tokens":
            raise HTTPException(status_code=402, detail="Insufficient credits") from err
        raise HTTPException(status_code=400, detail=str(err)) from err


def credit_cost_for_kind(kind: str) -> int:
    return int(_KIND_CREDIT_COST.get((kind or "").strip(), 2))


@router.get("/tools")
def list_image_tools() -> dict[str, Any]:
    return {
        "kinds": sorted(IMAGE_PROCESS_KINDS),
        "credits": {k: credit_cost_for_kind(k) for k in sorted(IMAGE_PROCESS_KINDS)},
    }


@router.post("/process")
async def post_image_process(
    body: ImageProcessIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_user(authorization)
    kind = body.kind.strip()
    cost = credit_cost_for_kind(kind)
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
        result = {**result, "credits": cost}
    return result
