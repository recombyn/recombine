"""Image toolbar AI tools API — frontend calls these instead of local CV."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.llm.image_tools import IMAGE_PROCESS_KINDS, process_image_tool

router = APIRouter()


class ImageProcessIn(BaseModel):
    kind: str = Field(..., min_length=1, description="removeBg | upscale | multiAngle | ...")
    image: str = Field(..., min_length=1, description="Source image data URL or https URL")
    meta: dict[str, Any] | None = None
    aspect_ratio: str | None = None
    quality: str | None = None
    resolution: str | None = None
    model: str | None = None


@router.get("/tools")
def list_image_tools() -> dict[str, Any]:
    return {"kinds": sorted(IMAGE_PROCESS_KINDS)}


@router.post("/process")
async def post_image_process(body: ImageProcessIn) -> dict[str, Any]:
    try:
        return await process_image_tool(
            kind=body.kind.strip(),
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
