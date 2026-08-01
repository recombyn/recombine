"""Design run API — table-driven agent / single_model / partial."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.auth import get_session
from services.agent_memory.long_term import insert_long_memory
from services.design.readpath.catalog import ensure_design_catalog, get_catalog_payload
from services.design.runtime.orchestrator import run_design_job
from services.design.readpath.library_store import list_library_items
from services.design.readpath.library_seed import list_public_brushes
from services.design.prompts.rules_text import _safe_print

router = APIRouter()
_log = logging.getLogger("design.run_api")

# Keep proxies (Vite/nginx) from idle-closing long LLM steps.
# Also drives user-visible Thought-row heartbeats while the model is silent.
_SSE_HEARTBEAT_SEC = 8.0


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
    # Client-measured reference image WxH hints (e.g. ["750x1624"]) for auto canvas.
    ref_image_sizes: list[str] | None = None
    target_layer_id: str | None = None
    layer_ids: list[str] | None = None
    current_svg: str | None = None
    # Editable scene inventory for edit-in-place tool ops (id / fill / text / bounds).
    scene_nodes: list[dict[str, Any]] | None = None
    # Artboard list (id / name / size) — delete_frame validation + SCENE_FRAMES prompt.
    scene_frames: list[dict[str, Any]] | None = None
    # Client dual-context map (focused / peripheral / empty_rects / suggested_place).
    spatial_summary: dict[str, Any] | None = None
    focus_frame_id: str | None = None
    # User-attached reference images (data URLs or https) — multimodal vision + create_image.
    images: list[str] | None = None
    session_id: str | None = Field(default=None, max_length=64)
    project_id: str | None = Field(default=None, max_length=128)
    memory: dict[str, Any] | None = Field(
        default=None,
        description="Agent memory bundle: medium task_state, optional short turns, retrieve_long flag",
    )
    apply_ops: list[dict[str, Any]] | None = Field(
        default=None,
        description="Ask confirm: apply previously proposed tool_ops without a new LLM plan",
    )
    interaction_mode: str | None = Field(
        default=None,
        description="agent | ask — Ask proposes / clarifies before painting",
    )


class SceneFeedbackIn(BaseModel):
    scene_nodes: list[dict[str, Any]] = Field(default_factory=list)
    scene_frames: list[dict[str, Any]] = Field(default_factory=list)
    spatial_summary: dict[str, Any] | None = None
    # Per-op execution outcome from FE ({op_id, name, ok, error}) — truth for "did it apply".
    op_results: list[dict[str, Any]] | None = None
    round: int | None = None


@router.get("/catalog")
def design_catalog() -> dict[str, Any]:
    ensure_design_catalog()
    return get_catalog_payload()


@router.get("/canvas-tools")
def design_canvas_tools() -> dict[str, Any]:
    """Public capability table — FE executes ops by the same op_key."""
    ensure_design_catalog()
    from services.design.ops.tool_ops_contract import list_canvas_tools

    return {"items": list_canvas_tools(enabled_only=True)}


@router.post("/run")
async def design_run(
    body: DesignRunIn,
    request: Request,
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    user = _require_user(authorization)
    from services.geoip import resolve_client_country

    client_country = resolve_client_country(request)

    async def gen():
        from services.design.runtime.progress_stages import (
            maybe_advance_stage,
            stage_for_event,
            thought_stage_event,
        )

        # Flush headers / proxy buffers immediately so FE can leave "Thinking…".
        yield ": connected\n\n"

        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        t0 = time.time()
        out_n = 0
        # Explored pipeline only after model return codes show design (lookups/ops).
        current_stage: str | None = None
        pipeline_armed = False
        saw_paint = False
        chat_divert = False

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
                    ref_image_sizes=body.ref_image_sizes,
                    target_layer_id=body.target_layer_id,
                    layer_ids=body.layer_ids,
                    current_svg=body.current_svg,
                    scene_nodes=body.scene_nodes,
                    scene_frames=body.scene_frames,
                    spatial_summary=body.spatial_summary,
                    focus_frame_id=body.focus_frame_id,
                    images=body.images,
                    is_premium=False,
                    session_id=body.session_id,
                    project_id=body.project_id or body.canvas_id,
                    memory=body.memory,
                    route_overrides=body.route_overrides,
                    apply_ops=body.apply_ops,
                    interaction_mode=body.interaction_mode,
                    client_country=client_country,
                ):
                    await queue.put(("ev", ev))
            except Exception as err:  # noqa: BLE001
                await queue.put(("err", err))
            finally:
                await queue.put(("done", None))

        def _emit(obj: dict[str, Any]) -> str:
            return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

        def _arm_pipeline(stage: str | None = "prepare") -> None:
            nonlocal pipeline_armed, current_stage
            if chat_divert:
                return
            if not pipeline_armed:
                pipeline_armed = True
                current_stage = stage or "prepare"

        task = asyncio.create_task(produce())
        try:
            # Do NOT seed Explored here — wait for lookups/ops (design return codes).

            while True:
                try:
                    kind, payload = await asyncio.wait_for(
                        queue.get(), timeout=_SSE_HEARTBEAT_SEC
                    )
                except asyncio.TimeoutError:
                    elapsed = int(time.time() - t0)
                    if (
                        pipeline_armed
                        and not chat_divert
                        and not saw_paint
                        and current_stage
                        and current_stage != "done"
                    ):
                        yield _emit(
                            thought_stage_event(current_stage, elapsed_s=elapsed)
                        )
                    yield ": ping\n\n"
                    continue
                if kind == "done":
                    if (
                        pipeline_armed
                        and not chat_divert
                        and current_stage != "done"
                    ):
                        yield _emit(thought_stage_event("done", status="done"))
                    break
                if kind == "err":
                    msg = str(payload)[:800] or "design_run_failed"
                    yield _emit({"type": "error", "message": msg})
                    break

                out_n += 1
                et = payload.get("type") if isinstance(payload, dict) else None
                if isinstance(payload, dict):
                    if et == "chat_done" or (
                        et == "result"
                        and str(payload.get("intent") or "") == "chat"
                    ):
                        chat_divert = True
                        current_stage = "done"
                    elif et == "decision" and (
                        payload.get("is_chitchat") is True
                        or str(payload.get("route") or "") == "chitchat"
                        or str(payload.get("intent") or "") == "chat"
                    ):
                        chat_divert = True
                        current_stage = "done"

                    # Arm Explored only on design signals — never on early
                    # prompt/model_wait alone (those used to fire for 「你好」).
                    if not chat_divert:
                        if et in ("tool_ops", "svg_delta", "drawing"):
                            _arm_pipeline("ops")
                        elif et == "activity":
                            kind_a = str(payload.get("kind") or "")
                            stage_a = str(payload.get("stage") or "")
                            if kind_a in ("tool", "added", "updated", "deleted"):
                                _arm_pipeline("ops")
                            elif stage_a in (
                                "lookup",
                                "validate",
                                "ops",
                                "scene_check",
                                "critic",
                                "refine",
                                "scene",
                            ):
                                _arm_pipeline(stage_a)
                            elif (
                                kind_a == "explored"
                                and stage_a
                                and stage_a
                                not in (
                                    "prompt",
                                    "prepare",
                                    "model_wait",
                                    "model_stream",
                                )
                            ):
                                _arm_pipeline(stage_a)

                    if pipeline_armed and not chat_divert:
                        nxt = stage_for_event(payload)
                        advanced = maybe_advance_stage(current_stage, nxt)
                        if advanced and advanced != current_stage:
                            current_stage = advanced
                            elapsed = int(time.time() - t0)
                            if advanced == "done":
                                yield _emit(thought_stage_event("done", status="done"))
                            elif not saw_paint or advanced in ("ops", "refine"):
                                yield _emit(
                                    thought_stage_event(advanced, elapsed_s=elapsed)
                                )
                    if et in ("tool_ops", "svg_delta", "drawing") or (
                        et == "activity"
                        and str(payload.get("kind") or "")
                        in ("tool", "added", "updated", "deleted")
                    ):
                        saw_paint = True
                    elif et == "result":
                        saw_paint = True
                        if pipeline_armed:
                            current_stage = "done"

                if out_n <= 12 or et in ("thinking", "analysis_delta", "skill_start", "error"):
                    preview = ""
                    if isinstance(payload, dict) and et in ("thinking", "analysis_delta"):
                        preview = repr(str(payload.get("text") or "")[:60])
                    msg = f"[sse_out] +{time.time()-t0:6.2f}s  n={out_n} type={et} {preview}"
                    _log.info(msg)
                    _safe_print(msg)
                yield _emit(payload) if isinstance(payload, dict) else (
                    f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                )
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
    from services.design.runtime.scene_feedback import publish_scene

    n = len(body.scene_nodes or [])
    f = len(body.scene_frames or [])
    failed = [
        r
        for r in (body.op_results or [])
        if isinstance(r, dict) and not r.get("ok", True)
    ]
    _log.info(
        "[design.scene_feedback] task=%s round=%s nodes=%s frames=%s op_failed=%s",
        task_id,
        body.round,
        n,
        f,
        len(failed),
    )
    ok = await publish_scene(
        task_id,
        body.scene_nodes,
        frames=body.scene_frames,
        spatial=body.spatial_summary,
        op_results=body.op_results,
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

