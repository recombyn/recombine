"""Redis-backed import job status store."""

from __future__ import annotations

import json
from typing import Any

import redis

from app.core.config import settings

_PREFIX = "import_job:"


def _client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def job_key(job_id: str) -> str:
    return f"{_PREFIX}{job_id}"


def save_job(job_id: str, payload: dict[str, Any]) -> None:
    client = _client()
    client.set(job_key(job_id), json.dumps(payload, ensure_ascii=False), ex=settings.job_ttl_seconds)


def get_job(job_id: str) -> dict[str, Any] | None:
    raw = _client().get(job_key(job_id))
    if not raw:
        return None
    return json.loads(raw)


def update_job(job_id: str, **fields: Any) -> dict[str, Any] | None:
    current = get_job(job_id)
    if current is None:
        return None
    current.update(fields)
    save_job(job_id, current)
    return current
