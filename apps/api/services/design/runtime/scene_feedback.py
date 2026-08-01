"""In-memory FE→BE scene snapshots between Cursor-style agent rounds.

SSE is one-way; the frontend POSTs the real canvas inventory after applying
tool_ops so the next LLM round sees truth, not a simulated apply.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

_lock = asyncio.Lock()
# task_id -> { event, nodes, frames, round, updated_at }
_pending: dict[str, dict[str, Any]] = {}
_TTL_SEC = 600.0


async def begin_wait(task_id: str, *, round_n: int) -> None:
    """Reset latch so the next POST satisfies this round."""
    tid = str(task_id or "").strip()
    if not tid:
        return
    async with _lock:
        _pending[tid] = {
            "event": asyncio.Event(),
            "nodes": None,
            "frames": None,
            "spatial": None,
            "op_results": None,
            "round": int(round_n),
            "updated_at": time.time(),
        }


def _clean_op_results(op_results: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in op_results or []:
        if not isinstance(r, dict):
            continue
        out.append(
            {
                "op_id": str(r.get("op_id") or ""),
                "name": str(r.get("name") or ""),
                "ok": bool(r.get("ok", True)),
                "error": str(r.get("error") or "")[:200],
            }
        )
    return out[:64]


async def publish_scene(
    task_id: str,
    nodes: list[dict[str, Any]] | None,
    *,
    frames: list[dict[str, Any]] | None = None,
    spatial: dict[str, Any] | None = None,
    op_results: list[dict[str, Any]] | None = None,
    round_n: int | None = None,
) -> bool:
    tid = str(task_id or "").strip()
    if not tid:
        return False
    clean = [n for n in (nodes or []) if isinstance(n, dict) and n.get("id")]
    clean_frames = [f for f in (frames or []) if isinstance(f, dict) and f.get("id")]
    spatial_clean = spatial if isinstance(spatial, dict) else None
    results_clean = _clean_op_results(op_results)
    async with _lock:
        slot = _pending.get(tid)
        if slot is None:
            slot = {
                "event": asyncio.Event(),
                "nodes": clean,
                "frames": clean_frames,
                "spatial": spatial_clean,
                "op_results": results_clean,
                "round": int(round_n or 0),
                "updated_at": time.time(),
            }
            _pending[tid] = slot
        else:
            slot["nodes"] = clean
            slot["frames"] = clean_frames
            slot["spatial"] = spatial_clean
            slot["op_results"] = results_clean
            if round_n is not None:
                slot["round"] = int(round_n)
            slot["updated_at"] = time.time()
        slot["event"].set()
    return True


async def wait_for_scene(
    task_id: str,
    *,
    timeout_sec: float = 8.0,
) -> dict[str, Any] | None:
    """Block until FE posts a snapshot, or timeout → None (caller keeps simulated)."""
    tid = str(task_id or "").strip()
    if not tid:
        return None
    async with _lock:
        slot = _pending.get(tid)
        if slot is None:
            return None
        ev: asyncio.Event = slot["event"]
        if ev.is_set() and isinstance(slot.get("nodes"), list):
            nodes = list(slot["nodes"] or [])
            frames = list(slot.get("frames") or [])
            spatial = slot.get("spatial")
            op_results = slot.get("op_results")
            ev.clear()
            slot["nodes"] = None
            slot["frames"] = None
            slot["spatial"] = None
            slot["op_results"] = None
            return {
                "nodes": [n for n in nodes if isinstance(n, dict) and n.get("id")],
                "frames": [f for f in frames if isinstance(f, dict) and f.get("id")],
                "spatial": spatial if isinstance(spatial, dict) else None,
                "op_results": op_results if isinstance(op_results, list) else [],
            }
    try:
        await asyncio.wait_for(ev.wait(), timeout=max(0.5, float(timeout_sec)))
    except asyncio.TimeoutError:
        return None
    async with _lock:
        slot = _pending.get(tid) or {}
        nodes = slot.get("nodes")
        frames = slot.get("frames")
        spatial = slot.get("spatial")
        op_results = slot.get("op_results")
        ev2 = slot.get("event")
        if isinstance(ev2, asyncio.Event):
            ev2.clear()
        slot["nodes"] = None
        slot["frames"] = None
        slot["spatial"] = None
        slot["op_results"] = None
        out_nodes: list[dict[str, Any]] = []
        out_frames: list[dict[str, Any]] = []
        if isinstance(nodes, list):
            out_nodes = [n for n in nodes if isinstance(n, dict) and n.get("id")]
        if isinstance(frames, list):
            out_frames = [f for f in frames if isinstance(f, dict) and f.get("id")]
        if out_nodes or out_frames or isinstance(spatial, dict):
            return {
                "nodes": out_nodes,
                "frames": out_frames,
                "spatial": spatial if isinstance(spatial, dict) else None,
                "op_results": op_results if isinstance(op_results, list) else [],
            }
    return None


async def clear_task(task_id: str) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    async with _lock:
        _pending.pop(tid, None)
        # Opportunistic TTL sweep
        now = time.time()
        dead = [
            k
            for k, v in _pending.items()
            if now - float(v.get("updated_at") or 0) > _TTL_SEC
        ]
        for k in dead:
            _pending.pop(k, None)
