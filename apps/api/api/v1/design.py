"""Design run API — table-driven agent / single_model / partial."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.auth import get_session
from services.agent_memory.long_term import insert_long_memory
from services.design.catalog import ensure_design_catalog, get_catalog_payload
from services.design.orchestrator import run_design_job
from services.design.library_store import list_library_items
from services.design.library_seed import list_public_brushes

router = APIRouter()
_log = logging.getLogger("design.run_api")

# Keep proxies (Vite/nginx) from idle-closing long LLM steps.
_SSE_HEARTBEAT_SEC = 15.0


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


class DesignRunIn(BaseModel):
    run_mode: str = Field(..., description="agent | single_model | partial")
    prompt: str = Field(..., min_length=1)
    scene: str | None = None
    style_group_id: int | None = None
    style_pack_id: int | None = Field(
        default=None, description="design_library_item id (kind=style) — DESIGN.md tokens"
    )
    template_id: int | None = Field(
        default=None, description="design_library_item id (kind=template) — composition skeleton"
    )
    prompt_pattern_id: int | None = Field(
        default=None, description="design_library_item id (kind=prompt)"
    )
    user_selected_model: str | None = "auto"
    # End-user Auto routing prefs (tier models / vision / image). Server ignores cost levers.
    route_overrides: dict[str, str] | None = None
    canvas_id: str | None = None
    canvas_size: str | None = None
    target_layer_id: str | None = None
    layer_ids: list[str] | None = None
    current_svg: str | None = None
    # Editable scene inventory for edit-in-place tool ops (id / fill / text / bounds).
    scene_nodes: list[dict[str, Any]] | None = None
    # Artboard list (id / name / size) — delete_frame validation + SCENE_FRAMES prompt.
    scene_frames: list[dict[str, Any]] | None = None
    focus_frame_id: str | None = None
    # User-attached reference images (data URLs or https) — multimodal vision + create_image.
    images: list[str] | None = None
    session_id: str | None = Field(default=None, max_length=64)
    project_id: str | None = Field(default=None, max_length=128)
    memory: dict[str, Any] | None = Field(
        default=None,
        description="Agent memory bundle: medium task_state, optional short turns, retrieve_long flag",
    )


class SceneFeedbackIn(BaseModel):
    scene_nodes: list[dict[str, Any]] = Field(default_factory=list)
    scene_frames: list[dict[str, Any]] = Field(default_factory=list)
    round: int | None = None


@router.get("/catalog")
def design_catalog() -> dict[str, Any]:
    ensure_design_catalog()
    return get_catalog_payload()


@router.get("/canvas-tools")
def design_canvas_tools() -> dict[str, Any]:
    """Public capability table — FE executes ops by the same op_key."""
    ensure_design_catalog()
    from services.design.tool_ops_contract import list_canvas_tools

    return {"items": list_canvas_tools(enabled_only=True)}


@router.post("/run")
async def design_run(
    body: DesignRunIn,
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    user = _require_user(authorization)

    async def gen():
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        t0 = time.time()
        out_n = 0

        async def produce() -> None:
            try:
                async for ev in run_design_job(
                    user_id=user.id,
                    run_mode=body.run_mode,
                    prompt=body.prompt,
                    scene=body.scene,
                    style_group_id=body.style_group_id,
                    style_pack_id=body.style_pack_id,
                    template_id=body.template_id,
                    prompt_pattern_id=body.prompt_pattern_id,
                    user_selected_model=body.user_selected_model or "auto",
                    canvas_id=body.canvas_id,
                    canvas_size=body.canvas_size,
                    target_layer_id=body.target_layer_id,
                    layer_ids=body.layer_ids,
                    current_svg=body.current_svg,
                    scene_nodes=body.scene_nodes,
                    scene_frames=body.scene_frames,
                    focus_frame_id=body.focus_frame_id,
                    images=body.images,
                    is_premium=False,
                    session_id=body.session_id,
                    project_id=body.project_id or body.canvas_id,
                    memory=body.memory,
                    route_overrides=body.route_overrides,
                ):
                    await queue.put(("ev", ev))
            except Exception as err:  # noqa: BLE001
                await queue.put(("err", err))
            finally:
                await queue.put(("done", None))

        task = asyncio.create_task(produce())
        try:
            while True:
                try:
                    kind, payload = await asyncio.wait_for(
                        queue.get(), timeout=_SSE_HEARTBEAT_SEC
                    )
                except asyncio.TimeoutError:
                    # SSE comment — ignored by client, resets proxy idle timers.
                    yield ": ping\n\n"
                    continue
                if kind == "done":
                    break
                if kind == "err":
                    msg = str(payload)[:800] or "design_run_failed"
                    yield f"data: {json.dumps({'type': 'error', 'message': msg}, ensure_ascii=False)}\n\n"
                    break
                out_n += 1
                et = payload.get("type") if isinstance(payload, dict) else None
                if out_n <= 12 or et in ("thinking", "analysis_delta", "skill_start", "error"):
                    preview = ""
                    if isinstance(payload, dict) and et in ("thinking", "analysis_delta"):
                        preview = repr(str(payload.get("text") or "")[:60])
                    msg = f"[sse_out] +{time.time()-t0:6.2f}s  n={out_n} type={et} {preview}"
                    _log.info(msg)
                    print(msg, flush=True)
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/run/{task_id}/scene")
async def design_run_scene_feedback(
    task_id: str,
    body: SceneFeedbackIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """FE posts real canvas inventory after applying tool_ops (between agent rounds)."""
    _require_user(authorization)
    from services.design.scene_feedback import publish_scene

    n = len(body.scene_nodes or [])
    f = len(body.scene_frames or [])
    _log.info(
        "[design.scene_feedback] task=%s round=%s nodes=%s frames=%s",
        task_id,
        body.round,
        n,
        f,
    )
    ok = await publish_scene(
        task_id,
        body.scene_nodes,
        frames=body.scene_frames,
        round_n=body.round,
    )
    return {"ok": ok, "count": n, "frames": f}


@router.get("/library")
def design_library(
    kind: str | None = None,
    scene: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict[str, Any]:
    """Public official materials (enabled only)."""
    ensure_design_catalog()
    return list_library_items(
        kind=kind, scene=scene, q=q, enabled=True, page=page, page_size=page_size
    )


@router.get("/brushes")
def design_brushes() -> dict[str, Any]:
    """Brush wheel presets for the main-site pencil tool."""
    return {"items": list_public_brushes()}


class LongMemoryIn(BaseModel):
    kind: str = Field(default="preference", max_length=32)
    text: str = Field(..., min_length=1, max_length=2000)
    pinned: bool = False


@router.post("/memory/long")
def design_long_memory(
    body: LongMemoryIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Persist user-confirmed long-term preference (M4 entry point)."""
    user = _require_user(authorization)
    mid = insert_long_memory(
        user.id,
        kind=body.kind,
        text=body.text.strip(),
        pinned=body.pinned,
    )
    return {"id": mid, "ok": True}

