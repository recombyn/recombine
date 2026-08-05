from __future__ import annotations

"""Scene digest, admin-step logging, and graph control helpers."""

import asyncio
import json
import logging
import time
from typing import Any
from langgraph.types import Command
from app.services.design.admin.task_store import _update_task
from app.services.design.readpath.canvas_scene import parse_size as _parse_size
from app.services.design.runtime.decision_log import DesignRunDecision
from app.services.design.runtime.host import (
    interaction_mode_rules_pack,
    require_prompt_pack,
)
from app.services.design.runtime.graph.state import (
    AgentRunState,
    AgentRuntime,
)

_log = logging.getLogger(__name__)



def _clip_admin_step_io(value: Any, *, limit: int) -> Any:
    if not isinstance(value, str):
        return value
    t = value.strip()
    if not t:
        return None
    if len(t) <= limit:
        return t
    return t[:limit] + f"\n…[truncated {len(t) - limit} chars]"

def _slim_admin_steps(
    steps: list[dict[str, Any]],
    *,
    limit: int = 48,
    io_limit: int = 2500,
) -> list[dict[str, Any]]:
    """Compact Admin 运行监测 trail (path + timing + clipped I/O)."""
    keep_keys = (
        "phase",
        "node_id",
        "from_phase",
        "to_phase",
        "intent",
        "paint_lane",
        "summary",
        "reply",
        "error",
        "errors",
        "ops_count",
        "tokens",
        "model",
        "model_reason",
        "task_tier",
        "duration_ms",
        "t_ms",
        "attempt",
        "need_tools",
        "need_skills",
        "need_knowledge",
        "need_aesthetics",
        "dropped_intent",
        "thought",
        "thought_full",
        "llm_system",
        "llm_user",
        "llm_raw",
        "llm_thinking",
        "llm_image_urls",
        "llm_max_tokens",
        "stage",
        "images_hydrated",
        "image_model",
    )
    io_keys = frozenset(
        {
            "reply",
            "thought_full",
            "llm_system",
            "llm_user",
            "llm_raw",
            "llm_thinking",
        }
    )
    out: list[dict[str, Any]] = []
    for step in list(steps or [])[-limit:]:
        if not isinstance(step, dict):
            continue
        slim: dict[str, Any] = {}
        for k in keep_keys:
            if k not in step or step[k] in (None, "", [], {}):
                continue
            v = step[k]
            if k in io_keys:
                v = _clip_admin_step_io(v, limit=io_limit)
                if v is None:
                    continue
            slim[k] = v
        if slim:
            out.append(slim)
    return out

def _slim_failure_steps(steps: list[dict[str, Any]], *, limit: int = 12) -> list[dict[str, Any]]:
    """Compat alias — prefer ``_slim_admin_steps``."""
    return _slim_admin_steps(steps, limit=limit, io_limit=4000)

def _hydrate_srcs_for_log(ops: list[dict[str, Any]] | None) -> list[str] | None:
    urls: list[str] = []
    for op in list(ops or [])[:12]:
        if not isinstance(op, dict):
            continue
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        src = str((args or {}).get("src") or (args or {}).get("url") or "").strip()
        if src:
            urls.append(src[:500])
    return urls or None

def _hydrate_log_kwargs(
    ops: list[dict[str, Any]] | None,
    *,
    img_mid: str,
    n_img: int,
) -> dict[str, Any]:
    from app.services.design.runtime.graph.llm_io import _clip_llm_raw, _clip_urls
    prompts = _hydrate_prompts_for_log(ops)
    srcs = _hydrate_srcs_for_log(ops)
    return {
        "phase": "hydrate",
        "image_model": img_mid,
        "images_hydrated": int(n_img),
        "summary": f"Host 生图 hydrate ×{int(n_img)} · {img_mid}",
        "hydrate_prompts": prompts,
        "llm_image_urls": _clip_urls(srcs),
        "llm_user": _clip_llm_raw(
            "\n".join(prompts or []) or f"hydrate?{n_img}",
            limit=4000,
        ),
        "llm_raw": _clip_llm_raw(
            "\n".join(f"result_src={u}" for u in (srcs or []))
            or f"filled={n_img} (no src captured)",
            limit=4000,
        )
    }

def _hydrate_prompts_for_log(ops: list[dict[str, Any]] | None) -> list[str] | None:
    """genPrompt / prompt strings used by Host image hydrate."""
    prompts: list[str] = []
    for op in list(ops or [])[:12]:
        if not isinstance(op, dict):
            continue
        args = op.get("args") if isinstance(op.get("args"), dict) else {}
        for key in ("genPrompt", "prompt", "src"):
            val = args.get(key)
            if isinstance(val, str) and val.strip():
                prompts.append(f"{key}: {val.strip()[:400]}")
                break
    return prompts or None

def _scene_digest(
    nodes: list[dict[str, Any]],
    frames: list[dict[str, Any]],
    *,
    focus_id: str,
    limit: int = 40,
) -> str:
    lines: list[str] = []
    if focus_id:
        lines.append(f"FOCUS_FRAME_ID: {focus_id}")
    if frames:
        lines.append("SCENE_FRAMES (world x/y):")
        for f in frames[:16]:
            lines.append(
                f"- id={f.get('id')} name={f.get('name') or ''} "
                f"x={f.get('x')} y={f.get('y')} "
                f"w={f.get('w')} h={f.get('h')} empty={f.get('is_empty')}"
            )
    if nodes:
        lines.append("SCENE_NODES:")
        for n in nodes[:limit]:
            lines.append(
                f"- id={n.get('id')} type={n.get('type') or n.get('key')} "
                f"frameId={n.get('frameId') or ''} "
                f"text={(str(n.get('text') or '')[:40])}"
            )
    return "\n".join(lines) if lines else "SCENE: empty"

def _resolve_wh(
    *,
    canvas_size: str | None,
    scene_key: str,
    rules: dict[str, str],
    scene_frames: list[dict[str, Any]],
    focus_id: str,
) -> tuple[int, int]:
    w, h = _parse_size(canvas_size, scene_key, rules)
    if w > 0 and h > 0:
        return w, h
    for f in scene_frames:
        if focus_id and str(f.get("id") or "") != focus_id:
            continue
        try:
            fw, fh = int(f.get("w") or 0), int(f.get("h") or 0)
        except (TypeError, ValueError):
            continue
        if fw > 0 and fh > 0:
            return fw, fh
    for f in scene_frames:
        try:
            fw, fh = int(f.get("w") or 0), int(f.get("h") or 0)
        except (TypeError, ValueError):
            continue
        if fw > 0 and fh > 0:
            return fw, fh
    return 0, 0

def _existing_run_lifecycle(task_id: str) -> dict[str, Any] | None:
    try:
        from app.services.design.admin.task_store import (
            get_design_task,
            get_run_lifecycle,
            parse_task_meta,
        )

        row = get_design_task(task_id)
        lc = get_run_lifecycle(parse_task_meta((row or {}).get("meta_json")))
        return lc or None
    except Exception:
        return None


def _persist_task_meta(task_id: str, *, decision: DesignRunDecision, state: AgentRunState) -> None:
    """Persist decision + slim step path/timing for Admin; full I/O also in Langfuse."""
    try:
        from app.core.config import settings
        from app.services.llm.agent import langfuse_console_url, langfuse_enabled

        control = "langgraph"
        if state.flow_version:
            control = f"langgraph:v{state.flow_version}"
        exec_log = state.to_execution_log()
        # Always keep a clipped trail so Admin Timeline works on success too.
        # Success uses tighter I/O caps; failures keep more text for local replay.
        exec_log["steps"] = _slim_admin_steps(
            list(state.log or []),
            limit=48,
            io_limit=4000 if not state.painted else 2000,
        )
        if state.t0 > 0:
            exec_log["total_duration_ms"] = max(
                0, int((time.perf_counter() - state.t0) * 1000)
            )
        exec_log["observability"] = "langfuse"
        key_on = langfuse_enabled()
        host = (settings.langfuse_base_url or "https://cloud.langfuse.com").strip().rstrip("/")
        lf_trace = ""
        try:
            lf_trace = str((getattr(state, "langfuse_trace_id", None) or "")).strip()
        except Exception:
            lf_trace = ""
        langfuse = {
            "enabled": key_on,
            "host": host,
            "projectId": (settings.langfuse_project_id or "").strip() or None,
            "consoleUrl": langfuse_console_url(task_id=task_id, trace_id=lf_trace or None),
            "taskId": task_id,
            "traceId": lf_trace or None,
            "hint": "在 Langfuse 用 metadata.task_id 搜索本任务"
        }
        _update_task(
            task_id,
            meta_json=json.dumps(
                {
                    "control": control,
                    "flow_id": state.flow_id or None,
                    "flow_version": state.flow_version or None,
                    "trace_id": state.trace_id,
                    "decision_log": decision.to_log(),
                    "execution_log": exec_log,
                    "langfuse": langfuse,
                    # Preserve pause/resume fields across Admin meta rewrites.
                    **(
                        {"run_lifecycle": prev_lc}
                        if (prev_lc := _existing_run_lifecycle(task_id))
                        else {}
                    ),
                },
                ensure_ascii=False,
            ),
        )
    except Exception:
        _log.exception("persist execution_log failed task=%s", task_id)

def _log_graph_hop(
    st: AgentRunState,
    *,
    frm: str,
    to: str,
    **extra: Any,
) -> None:
    """Record graph hop in Admin step path (from → to)."""
    frm_phase = str(frm or "").strip() or "?"
    to_phase = str(to or "").strip() or "?"
    st.current_node_id = frm_phase
    hop: dict[str, Any] = {
        "phase": "graph",
        "from_phase": frm_phase,
        "to_phase": to_phase,
        "summary": f"{frm_phase} → {to_phase}",
    }
    for k, v in extra.items():
        if v is not None:
            hop[k] = v
    st.push_log(**hop)

def _bump(rt: AgentRuntime) -> dict[str, Any]:
    # Never let callables ride into LangGraph checkpoints.
    rt.settle_hold_fn = None
    rt.refund_hold_fn = None
    return {"rt": rt, "tick": int(rt.run.round) + len(rt.run.log)}

def _goto_cmd(rt: AgentRuntime, *, frm: str, to: str, **extra: Any) -> Command:
    """Log graph_hop then jump — so mid-run 复盘 shows path even before settle."""
    _log_graph_hop(rt.run, frm=frm, to=to, **extra)
    return Command(update=_bump(rt), goto=to)

def _commit(rt: AgentRuntime) -> Command:
    """Compat: update-only (no goto) for tests."""
    return Command(update=_bump(rt))

async def _persist_progress(rt: AgentRuntime) -> None:
    """Flush execution_log while status=running so Admin 复盘 is not empty mid-flight."""
    try:
        await asyncio.to_thread(
            _persist_task_meta,
            rt.run.task_id,
            decision=rt.decision,
            state=rt.run,
        )
    except Exception:
        _log.exception("persist progress failed task=%s", rt.run.task_id)

__all__ = [
    '_clip_admin_step_io',
    '_slim_admin_steps',
    '_slim_failure_steps',
    '_hydrate_srcs_for_log',
    '_hydrate_log_kwargs',
    '_hydrate_prompts_for_log',
    '_scene_digest',
    '_resolve_wh',
    '_persist_task_meta',
    '_log_graph_hop',
    '_bump',
    '_goto_cmd',
    '_commit',
    '_persist_progress',
]
