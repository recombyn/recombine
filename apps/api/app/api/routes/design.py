"""Design run API — table-driven agent / single_model / partial."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from app.api.deps import CurrentUser
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.agent_memory.long_term import insert_long_memory
from app.services.design.readpath.catalog import ensure_design_catalog, get_catalog_payload
from app.services.design.runtime.orchestrator import run_design_job
from app.services.design.readpath.library_store import list_library_items
from app.services.design.readpath.library_seed import list_public_brushes
from app.services.design.prompts.rules_text import _safe_print

router = APIRouter(prefix="/design", tags=["design"])
_log = logging.getLogger("design.run_api")

# Keep proxies (Vite/nginx) from idle-closing long LLM steps.
# Also drives user-visible Thought-row heartbeats while the model is silent.
_SSE_HEARTBEAT_SEC = 8.0

_DESIGN_ARM_STAGES = frozenset(
    {
        "lookup",
        "validate",
        "ops",
        "scene_check",
        "critic",
        "refine",
        "scene",
        "failed",
    }
)
_EARLY_EXPLORE_STAGES = frozenset(
    {"prompt", "prepare", "model_wait", "model_stream"}
)
_PAINT_EVENT_TYPES = frozenset({"tool_ops", "svg_delta", "drawing"})
_PAINT_ACTIVITY_KINDS = frozenset({"tool", "added", "updated", "deleted"})
_TERMINAL_STAGES = frozenset({"done", "failed"})






def _sse_data(obj: dict[str, Any]) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@dataclass
class _PipelineSseState:
    """Mutable Explored-pipeline bookkeeping for one /run SSE stream."""

    current_stage: str | None = None
    pipeline_armed: bool = False
    saw_paint: bool = False
    chat_divert: bool = False
    result_failed: bool = False
    out_n: int = 0
    t0: float = field(default_factory=time.time)

    def arm(self, stage: str | None = "prepare") -> None:
        if self.chat_divert or self.pipeline_armed:
            return
        self.pipeline_armed = True
        self.current_stage = stage or "prepare"

    def mark_chat_divert(self) -> None:
        self.chat_divert = True
        self.current_stage = "done"

    def terminal_stage_event(self) -> dict[str, Any] | None:
        from app.services.design.runtime.progress_stages import thought_stage_event

        if not self.pipeline_armed or self.chat_divert:
            return None
        if self.current_stage in _TERMINAL_STAGES:
            return None
        if self.result_failed:
            return thought_stage_event("failed", status="error")
        return thought_stage_event("done", status="done")

    def heartbeat_stage_event(self) -> dict[str, Any] | None:
        from app.services.design.runtime.progress_stages import thought_stage_event

        if not self.pipeline_armed or self.chat_divert or self.saw_paint:
            return None
        if not self.current_stage or self.current_stage in _TERMINAL_STAGES:
            return None
        elapsed = int(time.time() - self.t0)
        return thought_stage_event(self.current_stage, elapsed_s=elapsed)


def _should_chat_divert(payload: dict[str, Any]) -> bool:
    et = str(payload.get("type") or "")
    if et == "chat_done":
        return True
    if et == "result":
        if str(payload.get("status") or "") == "error":
            return False
        return str(payload.get("intent") or "") == "chat"
    if et != "decision":
        return False
    return (
        payload.get("is_chitchat") is True
        or str(payload.get("route") or "") == "chitchat"
        or str(payload.get("intent") or "") == "chat"
    )


def _arm_stage_from_activity(payload: dict[str, Any]) -> str | None:
    kind = str(payload.get("kind") or "")
    stage = str(payload.get("stage") or "").strip()
    if kind in _PAINT_ACTIVITY_KINDS:
        return "ops"
    if stage in _DESIGN_ARM_STAGES:
        return stage
    if kind == "explored" and stage and stage not in _EARLY_EXPLORE_STAGES:
        return stage
    return None


def _maybe_arm_pipeline(state: _PipelineSseState, payload: dict[str, Any]) -> None:
    if state.chat_divert:
        return
    et = str(payload.get("type") or "")
    if et in _PAINT_EVENT_TYPES:
        state.arm("ops")
        return
    if et != "activity":
        return
    stage = _arm_stage_from_activity(payload)
    if stage:
        state.arm(stage)


def _is_paint_signal(payload: dict[str, Any]) -> bool:
    et = str(payload.get("type") or "")
    if et in _PAINT_EVENT_TYPES or et == "result":
        return True
    if et != "activity":
        return False
    return str(payload.get("kind") or "") in _PAINT_ACTIVITY_KINDS


def _stage_advance_events(
    state: _PipelineSseState, payload: dict[str, Any]
) -> list[dict[str, Any]]:
    """Advance Explored stage and return any stage SSE frames to emit."""
    from app.services.design.runtime.progress_stages import (
        maybe_advance_stage,
        stage_for_event,
        thought_stage_event,
    )

    if not state.pipeline_armed or state.chat_divert:
        return []
    nxt = stage_for_event(payload)
    advanced = maybe_advance_stage(state.current_stage, nxt)
    if not advanced or advanced == state.current_stage:
        return []
    state.current_stage = advanced
    elapsed = int(time.time() - state.t0)
    if advanced == "done":
        if state.result_failed:
            state.current_stage = "failed"
            return [thought_stage_event("failed", status="error")]
        return [thought_stage_event("done", status="done")]
    if not state.saw_paint or advanced in ("ops", "refine"):
        return [thought_stage_event(advanced, elapsed_s=elapsed)]
    return []


def _result_terminal_event(
    state: _PipelineSseState,
) -> dict[str, Any] | None:
    from app.services.design.runtime.progress_stages import thought_stage_event

    if not state.pipeline_armed or state.current_stage in _TERMINAL_STAGES:
        return None
    if state.result_failed:
        state.current_stage = "failed"
        return thought_stage_event("failed", status="error")
    state.current_stage = "done"
    return None


def _pipeline_side_effects(
    state: _PipelineSseState, payload: dict[str, Any]
) -> list[dict[str, Any]]:
    """Update pipeline state for one agent event; return extra stage frames."""
    extra: list[dict[str, Any]] = []
    if _should_chat_divert(payload):
        state.mark_chat_divert()
    if str(payload.get("type") or "") == "result" and str(
        payload.get("status") or ""
    ) == "error":
        state.result_failed = True
    _maybe_arm_pipeline(state, payload)
    extra.extend(_stage_advance_events(state, payload))
    if _is_paint_signal(payload):
        state.saw_paint = True
    if str(payload.get("type") or "") == "result":
        term = _result_terminal_event(state)
        if term:
            extra.append(term)
    return extra


def _should_log_sse(et: str | None, out_n: int) -> bool:
    return out_n <= 12 or et in (
        "thinking",
        "analysis_delta",
        "skill_start",
        "error",
    )


def _sse_log_line(
    *, t0: float, out_n: int, et: str | None, payload: Any
) -> str:
    preview = ""
    if isinstance(payload, dict) and et in ("thinking", "analysis_delta"):
        preview = repr(str(payload.get("text") or "")[:60])
    return f"[sse_out] +{time.time() - t0:6.2f}s  n={out_n} type={et} {preview}"


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
    skill_refs: list[str] | None = Field(
        default=None,
        description="User-pinned skill keys/ids from / picker chips (hard-load)",
    )


class UserSkillIn(BaseModel):
    id: int | None = None
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    whenToUse: str | None = Field(default=None, max_length=2000)
    promptPositive: str = Field(..., min_length=1, max_length=120_000)
    promptNegative: str | None = Field(default=None, max_length=40_000)
    skillKey: str | None = Field(default=None, max_length=64)
    logo: str | None = Field(default=None, max_length=512)
    category: str | None = Field(default=None, max_length=64)
    enabled: bool = True


class UserSkillEnabledIn(BaseModel):
    enabled: bool


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
    from app.services.design.ops.tool_ops_contract import list_canvas_tools

    return {"items": list_canvas_tools(enabled_only=True)}


@router.get("/skills")
def design_skills_picker(
    current_user: CurrentUser,
    scene: str | None = None,
    mine: bool = Query(default=False),
    manage: bool = Query(default=False),
) -> dict[str, Any]:
    """Skills for `/` picker, mine list, or toolbox (`manage=true`, includes disabled)."""
    from app.services.design.prompts.skill_store import (
        list_my_skills,
        list_skills_for_manage,
        list_skills_for_picker,
    )

    scene_l = (scene or "website").strip() or "website"
    if manage:
        return {"items": list_skills_for_manage(user_id=current_user.id, scene=scene_l)}
    if mine:
        return {"items": list_my_skills(user_id=current_user.id)}
    return {"items": list_skills_for_picker(user_id=current_user.id, scene=scene_l)}


@router.post("/skills")
def design_skills_upsert(
    current_user: CurrentUser,
    body: UserSkillIn,
) -> dict[str, Any]:
    from app.services.design.prompts.skill_store import upsert_end_user_skill

    try:
        item = upsert_end_user_skill(user_id=current_user.id, payload=body.model_dump())
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"item": item}


@router.post("/skills/import")
async def design_skills_import_zip(
    current_user: CurrentUser,
    file: UploadFile = File(..., description="Skill pack .zip (_meta.json + SKILL.md)"),
    overwrite: bool = Form(default=False),
) -> dict[str, Any]:
    """Upload a skill pack zip — scan, optional overwrite, then save as user skill."""
    from app.services.design.prompts.skill_store import import_end_user_skill_zip

    raw = await file.read()
    try:
        result = import_end_user_skill_zip(
            user_id=current_user.id,
            filename=file.filename or "skill.zip",
            raw=raw,
            overwrite=bool(overwrite),
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return result


@router.patch("/skills/{skill_id}/enabled")
def design_skills_set_enabled(
    current_user: CurrentUser,
    skill_id: int,
    body: UserSkillEnabledIn,
) -> dict[str, Any]:
    """Per-user on/off for toolbox switches (official via prefs; mine via row+pref)."""
    from app.services.design.prompts.skill_store import set_user_skill_enabled

    try:
        item = set_user_skill_enabled(
            user_id=current_user.id, skill_id=skill_id, enabled=bool(body.enabled)
        )
    except ValueError as err:
        detail = str(err)
        code = 404 if detail == "skill not found" else 400
        raise HTTPException(status_code=code, detail=detail) from err
    return {"item": item}


@router.delete("/skills/{skill_id}")
def design_skills_delete(
    current_user: CurrentUser,
    skill_id: int,
) -> dict[str, Any]:
    from app.services.design.prompts.skill_store import delete_end_user_skill

    try:
        ok = delete_end_user_skill(user_id=current_user.id, skill_id=skill_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if not ok:
        raise HTTPException(status_code=404, detail="skill not found")
    return {"ok": True}


@router.post("/run")
async def design_run(
    current_user: CurrentUser,
    body: DesignRunIn,
    request: Request,
) -> StreamingResponse:
    from app.services.geoip import resolve_client_country

    client_country = resolve_client_country(request)

    async def gen():
        # Flush headers / proxy buffers immediately so FE can leave "Thinking…".
        yield ": connected\n\n"

        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        state = _PipelineSseState()

        async def produce() -> None:
            try:
                async for ev in run_design_job(
                    user_id=current_user.id,
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
                    skill_refs=body.skill_refs,
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
                    hb = state.heartbeat_stage_event()
                    if hb:
                        yield _sse_data(hb)
                    yield ": ping\n\n"
                    continue

                if kind == "done":
                    term = state.terminal_stage_event()
                    if term:
                        yield _sse_data(term)
                    break

                if kind == "err":
                    msg = str(payload)[:800] or "design_run_failed"
                    yield _sse_data({"type": "error", "message": msg})
                    break

                state.out_n += 1
                et = payload.get("type") if isinstance(payload, dict) else None
                if isinstance(payload, dict):
                    for frame in _pipeline_side_effects(state, payload):
                        yield _sse_data(frame)

                if _should_log_sse(et if isinstance(et, str) else None, state.out_n):
                    line = _sse_log_line(
                        t0=state.t0,
                        out_n=state.out_n,
                        et=et if isinstance(et, str) else None,
                        payload=payload,
                    )
                    _log.info(line)
                    _safe_print(line)

                if isinstance(payload, dict):
                    yield _sse_data(payload)
                else:
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
    current_user: CurrentUser,
    task_id: str,
    body: SceneFeedbackIn,
) -> dict[str, Any]:
    """FE posts real canvas inventory after applying tool_ops (between agent rounds)."""
    from app.services.design.runtime.scene_feedback import publish_scene

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


class DesignResumeIn(BaseModel):
    resume_token: str | None = None


@router.get("/run/{task_id}")
def design_run_status(
    current_user: CurrentUser,
    task_id: str,
) -> dict[str, Any]:
    from app.services.design.runtime.graph.build import get_design_run_status

    st = get_design_run_status(task_id)
    if not st:
        raise HTTPException(status_code=404, detail="task_not_found")
    if str(st.get("user_id") or "") != str(current_user.id):
        raise HTTPException(status_code=403, detail="forbidden")
    st.pop("user_id", None)
    return st


@router.post("/run/{task_id}/pause")
def design_run_pause(
    current_user: CurrentUser,
    task_id: str,
) -> dict[str, Any]:
    from app.services.design.admin.task_store import get_design_task
    from app.services.design.runtime.graph.build import request_design_pause

    row = get_design_task(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="task_not_found")
    if str(row.get("user_id") or "") != str(current_user.id):
        raise HTTPException(status_code=403, detail="forbidden")
    return request_design_pause(task_id)


@router.post("/run/{task_id}/cancel")
async def design_run_cancel(
    current_user: CurrentUser,
    task_id: str,
) -> dict[str, Any]:
    from app.services.design.admin.task_store import get_design_task
    from app.services.design.runtime.graph.build import (
        cleanup_design_checkpoint,
        request_design_cancel,
    )
    from app.services.design.runtime.orchestrator import _refund_hold

    row = get_design_task(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="task_not_found")
    if str(row.get("user_id") or "") != str(current_user.id):
        raise HTTPException(status_code=403, detail="forbidden")
    out = request_design_cancel(task_id, refund_hold_fn=_refund_hold)
    if out.get("cleanup_checkpoint"):
        await cleanup_design_checkpoint(task_id)
    return out


@router.post("/run/{task_id}/resume")
async def design_run_resume(
    current_user: CurrentUser,
    task_id: str,
    request: Request,
    body: DesignResumeIn | None = None,
) -> StreamingResponse:
    """Resume a paused / waiting_client / resumable-error design run (SSE)."""
    token = (body.resume_token if body else None) or None
    from app.services.design.runtime.orchestrator import resume_design_job

    async def gen():
        yield ": connected\n\n"
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        state = _PipelineSseState()

        async def produce() -> None:
            try:
                async for ev in resume_design_job(
                    user_id=current_user.id,
                    task_id=task_id,
                    resume_token=token,
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
                    hb = state.heartbeat_stage_event()
                    if hb:
                        yield _sse_data(hb)
                    yield ": ping\n\n"
                    continue

                if kind == "done":
                    term = state.terminal_stage_event()
                    if term:
                        yield _sse_data(term)
                    break

                if kind == "err":
                    # Cooperative pause re-raises CancelledError after emitting paused.
                    if isinstance(payload, asyncio.CancelledError):
                        break
                    msg = str(payload)[:800] or "design_resume_failed"
                    yield _sse_data({"type": "error", "message": msg})
                    break

                state.out_n += 1
                if isinstance(payload, dict):
                    for frame in _pipeline_side_effects(state, payload):
                        yield _sse_data(frame)
                    yield _sse_data(payload)
                else:
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
    current_user: CurrentUser,
    body: LongMemoryIn,
) -> dict[str, Any]:
    """Persist user-confirmed long-term preference (M4 entry point)."""
    mid = insert_long_memory(
        current_user.id,
        kind=body.kind,
        text=body.text.strip(),
        pinned=body.pinned,
    )
    return {"id": mid, "ok": True}

