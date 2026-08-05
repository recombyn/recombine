"""design_task / layer-lock persistence for agent runs."""
from __future__ import annotations

import json
import os
import secrets
import socket
import threading
import time
import uuid as _uuid
from typing import Any

# Terminal vs resumable run statuses (LangGraph checkpoint lifecycle).
STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_WAITING_CLIENT = "waiting_client"
STATUS_PAUSED = "paused"
STATUS_SUCCESS = "success"
STATUS_ERROR = "error"
STATUS_CANCELLED = "cancelled"

RESUMABLE_STATUSES = frozenset(
    {STATUS_PAUSED, STATUS_WAITING_CLIENT, STATUS_ERROR}
)
TERMINAL_STATUSES = frozenset({STATUS_SUCCESS, STATUS_CANCELLED})

_WORKER_ID = f"{socket.gethostname()}:{os.getpid()}:{_uuid.uuid4().hex[:8]}"


def _update_task(task_id: str, **fields: Any) -> None:
    if not fields:
        return
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    with Session(engine) as session:
        crud.update_design_task(session=session, task_id=task_id, fields=fields)


def _insert_task(row: dict[str, Any]) -> None:
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    with Session(engine) as session:
        crud.create_design_task(session=session, row=row)


def get_design_task(task_id: str) -> dict[str, Any] | None:
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    tid = str(task_id or "").strip()
    if not tid:
        return None
    with Session(engine) as session:
        row = crud.get_design_task(session=session, task_id=tid)
    if not row:
        return None
    return row.model_dump()


def parse_task_meta(meta_json: Any) -> dict[str, Any]:
    if isinstance(meta_json, dict):
        return dict(meta_json)
    raw = str(meta_json or "").strip()
    if not raw:
        return {}
    try:
        got = json.loads(raw)
        return got if isinstance(got, dict) else {}
    except Exception:
        return {}


def get_run_lifecycle(meta: dict[str, Any] | None) -> dict[str, Any]:
    lc = (meta or {}).get("run_lifecycle")
    return dict(lc) if isinstance(lc, dict) else {}


def new_resume_token() -> str:
    return secrets.token_urlsafe(16)


def build_run_lifecycle(
    *,
    thread_id: str,
    resumable: bool,
    interrupt_kind: str | None = None,
    resume_token: str | None = None,
    settled: bool = False,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "thread_id": str(thread_id or "").strip(),
        "resumable": bool(resumable),
        "interrupt_kind": (str(interrupt_kind or "").strip() or None),
        "checkpoint_at": time.time(),
        "resume_token": (resume_token or new_resume_token()) if resumable else None,
        "settled": bool(settled),
    }
    if extra:
        for k, v in extra.items():
            if v is not None:
                out[k] = v
    return out


def merge_task_meta(task_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    """Deep-merge top-level meta keys; ``run_lifecycle`` is replaced when provided."""
    tid = str(task_id or "").strip()
    row = get_design_task(tid) if tid else None
    meta = parse_task_meta(row.get("meta_json") if row else None)
    for k, v in (patch or {}).items():
        if k == "run_lifecycle" and isinstance(v, dict):
            prev = get_run_lifecycle(meta)
            merged = {**prev, **v}
            meta["run_lifecycle"] = merged
        else:
            meta[k] = v
    _update_task(tid, meta_json=json.dumps(meta, ensure_ascii=False))
    return meta


def task_is_resumable(row: dict[str, Any] | None) -> bool:
    if not row:
        return False
    status = str(row.get("status") or "").strip()
    if status not in RESUMABLE_STATUSES:
        return False
    if status == STATUS_ERROR:
        meta = parse_task_meta(row.get("meta_json"))
        lc = get_run_lifecycle(meta)
        if lc.get("resumable") is False:
            return False
    return True


def list_stale_resumable_task_ids(*, ttl_hours: float, limit: int = 100) -> list[str]:
    """Paused / waiting / resumable-error tasks older than TTL (by updated_at)."""
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    hours = float(ttl_hours or 0.0)
    if hours <= 0:
        return []
    lim = max(1, min(int(limit or 100), 500))
    cutoff = time.time() - hours * 3600.0
    with Session(engine) as session:
        rows = crud.list_stale_design_tasks(
            session=session,
            statuses=[STATUS_PAUSED, STATUS_WAITING_CLIENT, STATUS_ERROR],
            cutoff=cutoff,
            limit=lim,
        )
    out: list[str] = []
    for row in rows:
        d = row.model_dump()
        if not task_is_resumable(d):
            continue
        tid = str(d.get("id") or "").strip()
        if tid:
            out.append(tid)
    return out


def expire_stale_design_task(
    task_id: str,
    *,
    reason: str = "checkpoint_ttl_expired",
) -> bool:
    """Mark a resumable orphan as cancelled + non-resumable. Caller deletes checkpoint."""
    tid = str(task_id or "").strip()
    if not tid:
        return False
    row = get_design_task(tid)
    if not row or not task_is_resumable(row):
        return False
    merge_task_meta(
        tid,
        {
            "run_lifecycle": build_run_lifecycle(
                thread_id=str(
                    get_run_lifecycle(parse_task_meta(row.get("meta_json"))).get("thread_id")
                    or f"design:{tid}"
                ),
                resumable=False,
                interrupt_kind="expired",
                resume_token=None,
                settled=True,
                extra={"expire_reason": reason},
            )
        },
    )
    _update_task(tid, status=STATUS_CANCELLED, error_message=reason)
    return True


# --- Cross-worker run lease + durable pause/cancel intent --------------------

_LEASE_LOCK = threading.Lock()
_LEASE_REDIS_PREFIX = "design:run_lease:"


def design_worker_id() -> str:
    return _WORKER_ID


def get_run_lease(meta: dict[str, Any] | None) -> dict[str, Any]:
    raw = (meta or {}).get("run_lease")
    return dict(raw) if isinstance(raw, dict) else {}


def lease_is_active(lease: dict[str, Any] | None, *, now: float | None = None) -> bool:
    if not lease:
        return False
    owner = str(lease.get("owner_id") or "").strip()
    if not owner:
        return False
    exp = float(lease.get("expires_at") or 0)
    return exp > float(now if now is not None else time.time())


def _lease_ttl_sec(ttl_sec: float | None) -> float:
    try:
        from app.core.config import settings

        ttl = float(
            ttl_sec
            if ttl_sec is not None
            else getattr(settings, "design_run_lease_ttl_sec", 90.0) or 90.0
        )
    except Exception:
        ttl = float(ttl_sec or 90.0)
    return max(15.0, ttl)


def _lease_redis() -> Any | None:
    try:
        from app.core.config import settings

        url = str(getattr(settings, "redis_url", "") or "").strip()
        if not url:
            return None
        import redis

        return redis.Redis.from_url(
            url, decode_responses=True, socket_connect_timeout=0.4, socket_timeout=0.4
        )
    except Exception:
        return None


def _persist_run_lease_meta(task_id: str, lease: dict[str, Any] | None) -> None:
    merge_task_meta(
        task_id,
        {"run_lease": lease, **({"run_intent": None} if lease else {})},
    )


def _claim_lease_redis(
    tid: str,
    owner: str,
    *,
    ttl: float,
) -> dict[str, Any] | None:
    """Redis SET NX lease. Returns result dict or None if Redis unavailable."""
    r = _lease_redis()
    if r is None:
        return None
    key = f"{_LEASE_REDIS_PREFIX}{tid}"
    try:
        cur = r.get(key)
        if cur == owner:
            r.set(key, owner, ex=int(ttl))
            return {"ok": True, "via": "redis", "owner_id": owner}
        if cur and cur != owner:
            return {
                "ok": False,
                "error": "lease_held",
                "owner_id": cur,
                "via": "redis",
            }
        if r.set(key, owner, nx=True, ex=int(ttl)):
            return {"ok": True, "via": "redis", "owner_id": owner}
        # Lost race — re-read.
        cur2 = r.get(key)
        if cur2 == owner:
            return {"ok": True, "via": "redis", "owner_id": owner}
        return {
            "ok": False,
            "error": "lease_held",
            "owner_id": cur2,
            "via": "redis",
        }
    except Exception:
        return None


def _heartbeat_lease_redis(tid: str, owner: str, *, ttl: float) -> bool | None:
    r = _lease_redis()
    if r is None:
        return None
    key = f"{_LEASE_REDIS_PREFIX}{tid}"
    try:
        cur = r.get(key)
        if cur != owner:
            return False
        r.set(key, owner, ex=int(ttl))
        return True
    except Exception:
        return None


def _release_lease_redis(tid: str, owner: str) -> None:
    r = _lease_redis()
    if r is None:
        return
    key = f"{_LEASE_REDIS_PREFIX}{tid}"
    try:
        cur = r.get(key)
        if cur in (None, owner):
            r.delete(key)
    except Exception:
        pass


def _new_lease(owner: str, ttl: float, *, now: float | None = None) -> dict[str, Any]:
    t = float(now if now is not None else time.time())
    return {
        "owner_id": owner,
        "claimed_at": t,
        "heartbeat_at": t,
        "expires_at": t + ttl,
        "ttl_sec": ttl,
    }


def _claim_conflict(
    prev: dict[str, Any],
    owner: str,
    *,
    now: float,
    steal_if_expired: bool,
    via: str,
) -> dict[str, Any] | None:
    """Return an error payload if claim must fail; None if claim may proceed."""
    if lease_is_active(prev, now=now):
        prev_owner = str(prev.get("owner_id") or "")
        if prev_owner and prev_owner != owner:
            return {
                "ok": False,
                "error": "lease_held",
                "owner_id": prev_owner,
                "expires_at": prev.get("expires_at"),
                "via": via,
            }
        return None
    if prev and not steal_if_expired:
        return {
            "ok": False,
            "error": "lease_expired",
            "owner_id": prev.get("owner_id"),
            "via": via,
        }
    return None


def _claim_lease_meta(
    tid: str,
    owner: str,
    *,
    ttl: float,
    steal_if_expired: bool,
) -> dict[str, Any]:
    """Claim via get+merge (process lock held by caller). Used by tests / DB fallback."""
    now = time.time()
    row = get_design_task(tid)
    if not row:
        return {"ok": False, "error": "not_found"}
    meta = parse_task_meta(row.get("meta_json"))
    prev = get_run_lease(meta)
    conflict = _claim_conflict(
        prev, owner, now=now, steal_if_expired=steal_if_expired, via="meta"
    )
    if conflict:
        return conflict
    lease = _new_lease(owner, ttl, now=now)
    _persist_run_lease_meta(tid, lease)
    return {"ok": True, "lease": lease, "via": "meta"}


def _claim_lease_db_cas(
    tid: str,
    owner: str,
    *,
    ttl: float,
    steal_if_expired: bool,
) -> dict[str, Any]:
    """Transactional claim: Session + ``FOR UPDATE`` (SQLite: BEGIN IMMEDIATE)."""
    from sqlalchemy import text
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine
    from app.services.db import dialect

    now = time.time()
    lease = _new_lease(owner, ttl, now=now)
    try:
        with Session(engine) as session:
            if dialect() == "sqlite":
                try:
                    session.connection().execute(text("BEGIN IMMEDIATE"))
                except Exception:
                    pass
            row = crud.get_design_task_for_update(session=session, task_id=tid)
            if not row:
                return {"ok": False, "error": "not_found"}
            meta = parse_task_meta(row.meta_json)
            prev = get_run_lease(meta)
            conflict = _claim_conflict(
                prev, owner, now=now, steal_if_expired=steal_if_expired, via="db"
            )
            if conflict:
                return conflict
            meta["run_lease"] = lease
            meta["run_intent"] = None
            row.meta_json = json.dumps(meta, ensure_ascii=False)
            row.updated_at = time.time()
            session.add(row)
            session.commit()
        return {"ok": True, "lease": lease, "via": "db"}
    except Exception:
        # Unit tests / missing table: fall back to merge under process lock.
        return _claim_lease_meta(
            tid, owner, ttl=ttl, steal_if_expired=steal_if_expired
        )


def claim_run_lease(
    task_id: str,
    *,
    owner_id: str | None = None,
    ttl_sec: float | None = None,
    steal_if_expired: bool = True,
) -> dict[str, Any]:
    """Acquire exclusive ownership of a design run (Redis NX → DB CAS → meta)."""
    tid = str(task_id or "").strip()
    if not tid:
        return {"ok": False, "error": "missing_task_id"}
    owner = str(owner_id or _WORKER_ID).strip()
    ttl = _lease_ttl_sec(ttl_sec)
    with _LEASE_LOCK:
        redis_res = _claim_lease_redis(tid, owner, ttl=ttl)
        if redis_res is not None:
            if not redis_res.get("ok"):
                return redis_res
            lease = _new_lease(owner, ttl)
            try:
                _persist_run_lease_meta(tid, lease)
            except Exception:
                pass
            return {"ok": True, "lease": lease, "via": redis_res.get("via") or "redis"}
        return _claim_lease_db_cas(
            tid, owner, ttl=ttl, steal_if_expired=steal_if_expired
        )


def heartbeat_run_lease(
    task_id: str,
    *,
    owner_id: str | None = None,
    ttl_sec: float | None = None,
) -> bool:
    tid = str(task_id or "").strip()
    if not tid:
        return False
    owner = str(owner_id or _WORKER_ID).strip()
    ttl = _lease_ttl_sec(ttl_sec)
    with _LEASE_LOCK:
        redis_hb = _heartbeat_lease_redis(tid, owner, ttl=ttl)
        if redis_hb is False:
            return False
        row = get_design_task(tid)
        if not row:
            return False
        meta = parse_task_meta(row.get("meta_json"))
        prev = get_run_lease(meta)
        prev_owner = str(prev.get("owner_id") or "")
        if prev_owner and prev_owner != owner:
            return False
        now = time.time()
        lease = {
            **(prev or {}),
            "owner_id": owner,
            "heartbeat_at": now,
            "expires_at": now + ttl,
            "ttl_sec": ttl,
        }
        merge_task_meta(tid, {"run_lease": lease})
        return True


def release_run_lease(task_id: str, *, owner_id: str | None = None) -> None:
    tid = str(task_id or "").strip()
    if not tid:
        return
    owner = str(owner_id or _WORKER_ID).strip()
    with _LEASE_LOCK:
        _release_lease_redis(tid, owner)
        row = get_design_task(tid)
        if not row:
            return
        meta = parse_task_meta(row.get("meta_json"))
        prev = get_run_lease(meta)
        if prev and str(prev.get("owner_id") or "") not in ("", owner):
            return
        merge_task_meta(tid, {"run_lease": None})


def set_run_intent(task_id: str, intent: str | None) -> None:
    """Durable pause/cancel signal visible to every worker."""
    tid = str(task_id or "").strip()
    if not tid:
        return
    val = str(intent or "").strip() or None
    if val not in (None, "pause", "cancel"):
        return
    merge_task_meta(tid, {"run_intent": val})


def peek_run_intent(task_id: str) -> str | None:
    tid = str(task_id or "").strip()
    if not tid:
        return None
    row = get_design_task(tid)
    if not row:
        return None
    raw = parse_task_meta(row.get("meta_json")).get("run_intent")
    val = str(raw or "").strip()
    return val if val in ("pause", "cancel") else None


def resolve_ask_proposal_ops(
    proposal_task_id: str | None,
    proposal_id: str | None,
) -> list[dict[str, Any]] | None:
    """Return server-stored Ask ops when proposal id matches and is unexpired."""
    tid = str(proposal_task_id or "").strip()
    pid = str(proposal_id or "").strip()
    if not tid or not pid:
        return None
    row = get_design_task(tid)
    if not row:
        return None
    meta = parse_task_meta(row.get("meta_json"))
    prop = meta.get("ask_proposal")
    if not isinstance(prop, dict):
        return None
    if str(prop.get("id") or "").strip() != pid:
        return None
    try:
        exp = float(prop.get("expires_at") or 0)
    except (TypeError, ValueError):
        exp = 0.0
    if exp and exp < time.time():
        return None
    ops = prop.get("ops")
    if not isinstance(ops, list) or not ops:
        return None
    return [o for o in ops if isinstance(o, dict)][:48]


def _lock_layers(canvas_id: str, target_layer_id: str, all_layer_ids: list[str]) -> None:
    from sqlmodel import Session

    from app import crud
    from app.core.db import engine

    with Session(engine) as session:
        crud.insert_design_layer_locks(
            session=session,
            canvas_id=canvas_id,
            target_layer_id=target_layer_id,
            all_layer_ids=all_layer_ids,
        )
