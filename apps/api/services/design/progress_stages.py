"""Hardcoded Cursor-style design-run stages (every runtime phase).

Emits `explored` parent + nested `item` lines for:
prepare → scene → prompt → model → lookup → validate → ops →
scene_check → critic → refine → done
"""

from __future__ import annotations

from typing import Any

# Fixed pipeline — every runtime phase the user should see.
STAGE_ITEMS: dict[str, str] = {
    "prepare": "准备任务与上下文",
    "scene": "确定场景与画布",
    "prompt": "组装设计提示",
    "model_wait": "等待模型规划",
    "model_stream": "模型输出方案",
    "lookup": "检索 skill / 规则 / 知识 / 美学",
    "validate": "校验工具操作",
    "ops": "画到画布上",
    "scene_check": "回读画布状态",
    "critic": "目标检查",
    "refine": "根据检查结果调整",
    "done": "完成",
}

_EVENT_STAGE: dict[str, str] = {
    "decision": "prepare",
    "skill_start": "model_wait",
    "skill_progress": "model_stream",
    "thinking": "model_stream",
    "token": "model_stream",
    "tool_ops": "ops",
    "svg_delta": "ops",
    "drawing": "ops",
    "scene_feedback_request": "scene_check",
    "result": "done",
    "chat_done": "done",
}

_STAGE_ORDER = list(STAGE_ITEMS.keys())
EXPLORE_ID = "explore-pipeline"


def stage_index(key: str) -> int:
    try:
        return _STAGE_ORDER.index(key)
    except ValueError:
        return -1


def stage_for_event(ev: dict[str, Any]) -> str | None:
    et = str(ev.get("type") or "")
    if et == "status":
        st = str(ev.get("status") or "").strip().lower()
        # routing / chat divert — not design pipeline stages
        if st in ("routing", "chat"):
            return None
        return "scene"
    if et == "activity":
        aid = str(ev.get("id") or "")
        kind = str(ev.get("kind") or "")
        detail = str(ev.get("detail") or "").lower()
        stage = str(ev.get("stage") or "").strip()
        if stage in STAGE_ITEMS:
            return stage
        if aid.startswith("lookup") or "lookup" in detail:
            return "lookup"
        if aid.startswith("critic") or "goal_critic" in detail or "critic" in detail:
            return "critic"
        if aid.startswith("validate") or "validate" in detail:
            return "validate"
        if aid.startswith("scene") or "scene_check" in detail:
            return "scene_check"
        if kind in ("tool", "added", "updated", "deleted"):
            return "ops"
        if kind == "explored" and aid == EXPLORE_ID:
            return None
        return None
    return _EVENT_STAGE.get(et)


def maybe_advance_stage(current: str | None, incoming: str | None) -> str | None:
    if not incoming:
        return current
    if not current:
        return incoming
    if stage_index(incoming) >= stage_index(current):
        return incoming
    return current


def _item_label(
    stage: str,
    *,
    elapsed_s: int | None = None,
    extra: str | None = None,
) -> str:
    base = STAGE_ITEMS.get(stage) or STAGE_ITEMS["prepare"]
    if extra:
        base = f"{base}（{extra}）"
    if elapsed_s is None or stage in ("ops", "done"):
        return base
    return f"{base}… {max(0, int(elapsed_s))}s"


def explored_stage_event(
    stage: str,
    *,
    elapsed_s: int | None = None,
    status: str = "running",
    item_count: int | None = None,
    extra: str | None = None,
    item_id: str | None = None,
) -> dict[str, Any]:
    """
    Cursor-style Explored row: parent `explore-pipeline` + one nested item.

    FE upserts the parent and merges `item` into `items[]`.
    """
    done = status == "done"
    key = "done" if done else stage
    label = _item_label(
        key,
        elapsed_s=None if done else elapsed_s,
        extra=None if done else extra,
    )
    count = item_count
    if count is None and not done:
        count = max(1, stage_index(stage) + 1)
    return {
        "type": "activity",
        "id": EXPLORE_ID,
        "kind": "explored",
        "status": "done" if done else "running",
        "count": count,
        "detail": "design pipeline",
        "stage": key,
        "item": {
            "id": item_id or f"stage-{stage}",
            "name": label,
        },
        "skill_name": "agent",
        "index": 0,
    }


def thought_stage_event(
    stage: str,
    *,
    elapsed_s: int | None = None,
    status: str = "running",
    extra: str | None = None,
) -> dict[str, Any]:
    return explored_stage_event(
        stage, elapsed_s=elapsed_s, status=status, extra=extra
    )
