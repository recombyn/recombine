"""Design Agent runtime facade (public entry)."""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from services.design.runtime.host import (
    assemble_stage_system,
    interaction_mode_rules_pack,
    require_prompt_pack,
    validate_paint_ops,
)

__all__ = [
    "design_stream",
    "assemble_stage_system",
    "require_prompt_pack",
    "interaction_mode_rules_pack",
    "validate_paint_ops",
]


async def design_stream(
    *,
    user_id: str,
    mode: str,
    prompt: str,
    rules: dict[str, str],
    user_selected_model: str | None,
    canvas_id: str | None,
    canvas_size: str | None,
    scene: str | None,
    scene_nodes: list[dict[str, Any]],
    scene_frames: list[dict[str, Any]],
    spatial_summary: dict[str, Any] | None,
    focus_frame_id: str | None,
    images: list[str] | None,
    memory_in: dict[str, Any] | None,
    session_id: str,
    project_id: str,
    hold: int,
    free_daily: bool,
    t0: float,
    reserve_hold_fn: Any,
    settle_hold_fn: Any,
    refund_hold_fn: Any,
    apply_ops: list[dict[str, Any]] | None = None,
    interaction_mode: str | None = None,
    skill_refs: list[str] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    from services.design.runtime.graph.build import run_agent_graph

    async for ev in run_agent_graph(
        user_id=user_id,
        mode=mode,
        prompt=prompt,
        rules=rules,
        user_selected_model=user_selected_model,
        canvas_id=canvas_id,
        canvas_size=canvas_size,
        scene=scene,
        scene_nodes=scene_nodes,
        scene_frames=scene_frames,
        spatial_summary=spatial_summary,
        focus_frame_id=focus_frame_id,
        images=images,
        memory_in=memory_in,
        session_id=session_id,
        project_id=project_id,
        hold=hold,
        free_daily=free_daily,
        t0=t0,
        reserve_hold_fn=reserve_hold_fn,
        settle_hold_fn=settle_hold_fn,
        refund_hold_fn=refund_hold_fn,
        apply_ops=apply_ops,
        interaction_mode=interaction_mode,
        skill_refs=skill_refs,
    ):
        yield ev
