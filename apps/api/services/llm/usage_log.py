"""Per-call model usage ledger — every LLM / image provider hit is recorded.

Stores the full provider ``usage`` blob plus normalized token/cost fields so Admin
can aggregate by model. Never raises into the request path.
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field, replace
from typing import Any, Iterator

from services.db import connect, dialect

_log = logging.getLogger("llm.usage_log")

_TABLE_READY = False
_USAGE_WRITE_LOCK = threading.Lock()

# OpenRouter ``usage.cost`` is USD; convert for Admin CNY P&L.
_USD_CNY = 7.2


def _credits_to_revenue_cny(credits: Any) -> float | None:
    """Wallet 积分 face value → CNY (Plus ¥29 / 200 积分)."""
    try:
        n = float(credits)
    except Exception:
        return None
    if not math.isfinite(n) or n < 0:
        return None
    try:
        from services.wallet.billing import credits_per_cny

        rate = float(credits_per_cny())
        if rate <= 0:
            return None
        return round(n / rate, 6)
    except Exception:
        return round(n * 29.0 / 200.0, 6)


def _actual_cost_cny(
    cost_raw: Any,
    *,
    provider: str | None = None,
    meta: dict[str, Any] | None = None,
) -> float | None:
    """Normalize stored cost to CNY (OpenRouter USD → CNY)."""
    try:
        if cost_raw is None or cost_raw == "":
            return None
        n = float(cost_raw)
    except Exception:
        return None
    if not math.isfinite(n) or n < 0:
        return None
    prov = (provider or "").strip().lower()
    meta = meta or {}
    currency = str(meta.get("cost_currency") or "").lower()
    # Only FX when explicitly USD / OpenRouter. Domestic providers keep CNY as-is.
    if currency == "cny":
        return round(n, 6)
    if currency == "usd" or prov == "openrouter":
        n = n * _USD_CNY
    return round(n, 6)


def _profit_cny(revenue: float | None, actual_cost: float | None) -> float | None:
    if revenue is None or actual_cost is None:
        return None
    return round(float(revenue) - float(actual_cost), 6)


def _money_fields(
    *,
    credits: Any,
    cost_raw: Any,
    provider: str | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, float | None]:
    revenue = _credits_to_revenue_cny(credits)
    actual = _actual_cost_cny(cost_raw, provider=provider, meta=meta)
    return {
        "revenueCny": revenue,
        "actualCostCny": actual,
        "profitCny": _profit_cny(revenue, actual),
    }


@dataclass
class UsageContext:
    user_id: str | None = None
    task_id: str | None = None
    source: str = "unknown"
    credits_charged: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)


_CTX: ContextVar[UsageContext | None] = ContextVar("model_usage_ctx", default=None)


def get_usage_context() -> UsageContext | None:
    return _CTX.get()


def bind_usage_context(
    *,
    user_id: str | None = None,
    task_id: str | None = None,
    source: str | None = None,
    credits_charged: int | None = None,
    meta: dict[str, Any] | None = None,
) -> UsageContext:
    """Set request-scoped identity (asyncio Task-local; no exit needed)."""
    prev = _CTX.get()
    base = prev or UsageContext()
    nxt = replace(
        base,
        user_id=user_id if user_id is not None else base.user_id,
        task_id=task_id if task_id is not None else base.task_id,
        source=source if source is not None else base.source,
        credits_charged=(
            credits_charged if credits_charged is not None else base.credits_charged
        ),
        meta={**(base.meta or {}), **(meta or {})},
    )
    _CTX.set(nxt)
    return nxt


@contextmanager
def usage_context(
    *,
    user_id: str | None = None,
    task_id: str | None = None,
    source: str | None = None,
    credits_charged: int | None = None,
    meta: dict[str, Any] | None = None,
) -> Iterator[UsageContext]:
    """Bind caller identity for nested LLM / image calls."""
    prev = _CTX.get()
    base = prev or UsageContext()
    nxt = replace(
        base,
        user_id=user_id if user_id is not None else base.user_id,
        task_id=task_id if task_id is not None else base.task_id,
        source=source if source is not None else base.source,
        credits_charged=(
            credits_charged if credits_charged is not None else base.credits_charged
        ),
        meta={**(base.meta or {}), **(meta or {})},
    )
    token = _CTX.set(nxt)
    try:
        yield nxt
    finally:
        _CTX.reset(token)


def ensure_model_usage_table(conn: Any | None = None, *, mysql: bool | None = None) -> None:
    """Idempotent DDL for model_usage."""
    global _TABLE_READY
    if _TABLE_READY and conn is None:
        return
    own = conn is None
    if mysql is None:
        mysql = dialect() == "mysql"
    pk = "BIGINT AUTO_INCREMENT PRIMARY KEY" if mysql else "INTEGER PRIMARY KEY AUTOINCREMENT"
    text = "LONGTEXT" if mysql else "TEXT"

    def _run(c: Any) -> None:
        if mysql:
            c.execute(
                f"""
                CREATE TABLE IF NOT EXISTS model_usage (
                    id {pk},
                    created_at DOUBLE NOT NULL,
                    user_id VARCHAR(64) NULL,
                    task_id VARCHAR(64) NULL,
                    source VARCHAR(32) NOT NULL DEFAULT 'unknown',
                    provider VARCHAR(64) NULL,
                    catalog_model_id VARCHAR(128) NULL,
                    api_model VARCHAR(256) NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'ok',
                    latency_ms INTEGER NULL,
                    prompt_tokens INTEGER NULL,
                    completion_tokens INTEGER NULL,
                    total_tokens INTEGER NULL,
                    cached_tokens INTEGER NULL,
                    reasoning_tokens INTEGER NULL,
                    image_count INTEGER NULL,
                    credits_charged INTEGER NULL,
                    cost_cny DOUBLE NULL,
                    provider_request_id VARCHAR(128) NULL,
                    usage_json {text} NULL,
                    meta_json {text} NULL,
                    error {text} NULL,
                    KEY idx_model_usage_created (created_at),
                    KEY idx_model_usage_model (catalog_model_id, created_at),
                    KEY idx_model_usage_provider (provider, created_at),
                    KEY idx_model_usage_user (user_id, created_at),
                    KEY idx_model_usage_source (source, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
        else:
            c.execute(
                f"""
                CREATE TABLE IF NOT EXISTS model_usage (
                    id {pk},
                    created_at DOUBLE NOT NULL,
                    user_id TEXT,
                    task_id TEXT,
                    source TEXT NOT NULL DEFAULT 'unknown',
                    provider TEXT,
                    catalog_model_id TEXT,
                    api_model TEXT,
                    status TEXT NOT NULL DEFAULT 'ok',
                    latency_ms INTEGER,
                    prompt_tokens INTEGER,
                    completion_tokens INTEGER,
                    total_tokens INTEGER,
                    cached_tokens INTEGER,
                    reasoning_tokens INTEGER,
                    image_count INTEGER,
                    credits_charged INTEGER,
                    cost_cny REAL,
                    provider_request_id TEXT,
                    usage_json {text},
                    meta_json {text},
                    error {text}
                )
                """
            )
            for stmt in (
                "CREATE INDEX IF NOT EXISTS idx_model_usage_created ON model_usage(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_model_usage_model ON model_usage(catalog_model_id, created_at)",
                "CREATE INDEX IF NOT EXISTS idx_model_usage_provider ON model_usage(provider, created_at)",
                "CREATE INDEX IF NOT EXISTS idx_model_usage_user ON model_usage(user_id, created_at)",
                "CREATE INDEX IF NOT EXISTS idx_model_usage_source ON model_usage(source, created_at)",
            ):
                try:
                    c.execute(stmt)
                except Exception:
                    pass
        if own:
            c.commit()

    try:
        if own:
            with connect() as c:
                _run(c)
        else:
            _run(conn)
        _TABLE_READY = True
    except Exception:
        _log.exception("ensure_model_usage_table failed")


def _as_int(v: Any) -> int | None:
    try:
        if v is None or v == "":
            return None
        n = int(v)
        return n if n >= 0 else None
    except Exception:
        return None


def _as_float(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except Exception:
        return None


def parse_usage_fields(usage: Any) -> dict[str, Any]:
    """Normalize OpenAI/Ark/OpenRouter usage objects into flat columns."""
    out: dict[str, Any] = {
        "prompt_tokens": None,
        "completion_tokens": None,
        "total_tokens": None,
        "cached_tokens": None,
        "reasoning_tokens": None,
        "cost_cny": None,
        "image_count": None,
    }
    if not isinstance(usage, dict):
        return out

    out["prompt_tokens"] = _as_int(
        usage.get("prompt_tokens")
        if usage.get("prompt_tokens") is not None
        else usage.get("input_tokens")
    )
    out["completion_tokens"] = _as_int(
        usage.get("completion_tokens")
        if usage.get("completion_tokens") is not None
        else usage.get("output_tokens")
    )
    out["total_tokens"] = _as_int(
        usage.get("total_tokens")
        if usage.get("total_tokens") is not None
        else usage.get("total")
    )

    # Nested detail bags (OpenAI / Ark variants).
    for bag_key in (
        "prompt_tokens_details",
        "input_tokens_details",
        "prompt_token_details",
    ):
        bag = usage.get(bag_key)
        if isinstance(bag, dict):
            cached = _as_int(bag.get("cached_tokens") or bag.get("cache_tokens"))
            if cached is not None:
                out["cached_tokens"] = cached
            break
    for bag_key in (
        "completion_tokens_details",
        "output_tokens_details",
    ):
        bag = usage.get(bag_key)
        if isinstance(bag, dict):
            reason = _as_int(
                bag.get("reasoning_tokens")
                or bag.get("reasoning_token_count")
                or bag.get("reasoning")
            )
            if reason is not None:
                out["reasoning_tokens"] = reason
            break

    if out["cached_tokens"] is None:
        out["cached_tokens"] = _as_int(
            usage.get("cached_tokens") or usage.get("cache_tokens")
        )
    if out["reasoning_tokens"] is None:
        out["reasoning_tokens"] = _as_int(
            usage.get("reasoning_tokens") or usage.get("reasoning_token_count")
        )

    # Cost: OpenRouter `usage.cost` (USD) or Ark CNY fields when present.
    cost = None
    for key in ("cost", "total_cost", "cost_usd", "usd"):
        cost = _as_float(usage.get(key))
        if cost is not None:
            # OpenRouter documents cost in USD — store as CNY estimate ×7.2 if USD-ish
            # and no explicit currency. Prefer raw number in cost_cny when provider
            # already uses CNY (Ark). Tag currency in meta via caller if needed.
            out["cost_cny"] = cost
            out["_cost_raw"] = cost
            out["_cost_key"] = key
            break
    if cost is None:
        costs = usage.get("costs")
        if isinstance(costs, dict):
            for key in ("total", "total_cost", "cny", "usd"):
                cost = _as_float(costs.get(key))
                if cost is not None:
                    out["cost_cny"] = cost
                    out["_cost_raw"] = cost
                    out["_cost_key"] = f"costs.{key}"
                    break

    # Image-generation usage variants.
    gen = usage.get("generated_images") or usage.get("image_count") or usage.get("n")
    out["image_count"] = _as_int(gen)

    if out["total_tokens"] is None:
        p = out["prompt_tokens"] or 0
        c = out["completion_tokens"] or 0
        if p or c:
            out["total_tokens"] = p + c

    return out


def estimate_image_cost_cny(catalog_model_id: str | None, image_count: int = 1) -> float | None:
    """Catalog 元/张 × count when provider did not return a cost."""
    try:
        from services.wallet.billing import parse_price_amount
        from services.llm import list_llm_models

        mid = (catalog_model_id or "").strip()
        if not mid:
            return None
        for m in list_llm_models() or []:
            if str(m.get("id") or "") == mid:
                price = parse_price_amount(m.get("price"))
                if price is not None and price > 0:
                    return float(price) * max(1, int(image_count or 1))
                break
    except Exception:
        pass
    return None


def record_model_usage(
    *,
    source: str | None = None,
    provider: str | None = None,
    catalog_model_id: str | None = None,
    api_model: str | None = None,
    status: str = "ok",
    latency_ms: int | None = None,
    usage: Any = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    image_count: int | None = None,
    credits_charged: int | None = None,
    cost_cny: float | None = None,
    provider_request_id: str | None = None,
    user_id: str | None = None,
    task_id: str | None = None,
    meta: dict[str, Any] | None = None,
    error: str | None = None,
    response: Any = None,
) -> None:
    """Insert one usage row. Safe to call from any path (swallows errors).

    DB write runs off the caller thread so LangChain callbacks / Agent stream
    do not block the ASGI event loop (Admin list timeouts while chatting).
    """
    # ContextVar must be read on the request / callback thread.
    try:
        ctx = get_usage_context()
    except Exception:
        ctx = None

    def _write() -> None:
        try:
            ensure_model_usage_table()
            parsed = parse_usage_fields(usage if isinstance(usage, dict) else {})

            # Prefer explicit args, then usage blob, then context.
            p_tok = prompt_tokens if prompt_tokens is not None else parsed.get("prompt_tokens")
            c_tok = (
                completion_tokens
                if completion_tokens is not None
                else parsed.get("completion_tokens")
            )
            t_tok = total_tokens if total_tokens is not None else parsed.get("total_tokens")
            img_n = image_count if image_count is not None else parsed.get("image_count")

            cost = cost_cny
            if cost is None:
                cost = parsed.get("cost_cny")

            if cost is None and (img_n or 0) > 0:
                cost = estimate_image_cost_cny(catalog_model_id, int(img_n or 1))

            req_id = provider_request_id
            if not req_id and isinstance(response, dict):
                req_id = str(response.get("id") or response.get("request_id") or "") or None

            meta_out: dict[str, Any] = {}
            if ctx and ctx.meta:
                meta_out.update(ctx.meta)
            if meta:
                meta_out.update(meta)
            if parsed.get("_cost_key"):
                meta_out.setdefault("cost_field", parsed.get("_cost_key"))
                meta_out.setdefault("cost_raw", parsed.get("_cost_raw"))
            # Persist vendor cost as CNY; OpenRouter usage.cost is USD.
            prov_l = (provider or "").strip().lower()
            if (
                cost is not None
                and prov_l == "openrouter"
                and meta_out.get("cost_currency") != "cny"
            ):
                meta_out.setdefault("cost_currency", "usd")
                meta_out.setdefault("cost_usd", cost)
                cost = round(float(cost) * _USD_CNY, 6)
                meta_out["cost_currency"] = "cny"
                meta_out["usd_cny"] = _USD_CNY
            elif cost is not None:
                meta_out.setdefault("cost_currency", "cny")

            # Persist full usage + any leftover top-level response usage-like keys.
            usage_blob: Any = usage
            if usage_blob is None and isinstance(response, dict) and isinstance(
                response.get("usage"), dict
            ):
                usage_blob = response.get("usage")

            row = {
                "created_at": time.time(),
                "user_id": user_id or (ctx.user_id if ctx else None),
                "task_id": task_id or (ctx.task_id if ctx else None),
                "source": (source or (ctx.source if ctx else None) or "unknown")[:32],
                "provider": (provider or "")[:64] or None,
                "catalog_model_id": (catalog_model_id or "")[:128] or None,
                "api_model": (api_model or "")[:256] or None,
                "status": (status or "ok")[:32],
                "latency_ms": int(latency_ms) if latency_ms is not None else None,
                "prompt_tokens": p_tok,
                "completion_tokens": c_tok,
                "total_tokens": t_tok,
                "cached_tokens": parsed.get("cached_tokens"),
                "reasoning_tokens": parsed.get("reasoning_tokens"),
                "image_count": img_n,
                "credits_charged": (
                    credits_charged
                    if credits_charged is not None
                    else (ctx.credits_charged if ctx else None)
                ),
                "cost_cny": cost,
                "provider_request_id": (req_id or "")[:128] or None,
                "usage_json": (
                    json.dumps(usage_blob, ensure_ascii=False)
                    if usage_blob is not None
                    else None
                ),
                "meta_json": (
                    json.dumps(meta_out, ensure_ascii=False) if meta_out else None
                ),
                "error": (error or "")[:4000] or None,
            }

            with _USAGE_WRITE_LOCK:
                with connect() as conn:
                    conn.execute(
                        """
                        INSERT INTO model_usage (
                            created_at, user_id, task_id, source, provider,
                            catalog_model_id, api_model, status, latency_ms,
                            prompt_tokens, completion_tokens, total_tokens,
                            cached_tokens, reasoning_tokens, image_count,
                            credits_charged, cost_cny, provider_request_id,
                            usage_json, meta_json, error
                        ) VALUES (
                            ?, ?, ?, ?, ?,
                            ?, ?, ?, ?,
                            ?, ?, ?,
                            ?, ?, ?,
                            ?, ?, ?,
                            ?, ?, ?
                        )
                        """,
                        (
                            row["created_at"],
                            row["user_id"],
                            row["task_id"],
                            row["source"],
                            row["provider"],
                            row["catalog_model_id"],
                            row["api_model"],
                            row["status"],
                            row["latency_ms"],
                            row["prompt_tokens"],
                            row["completion_tokens"],
                            row["total_tokens"],
                            row["cached_tokens"],
                            row["reasoning_tokens"],
                            row["image_count"],
                            row["credits_charged"],
                            row["cost_cny"],
                            row["provider_request_id"],
                            row["usage_json"],
                            row["meta_json"],
                            row["error"],
                        ),
                    )
                    conn.commit()
        except Exception:
            _log.exception("record_model_usage failed")

    try:
        threading.Thread(target=_write, name="model-usage-write", daemon=True).start()
    except Exception:
        _write()


def _meta_json_path_sql(key: str) -> str:
    """SQL expression for a string field inside meta_json (MySQL / SQLite)."""
    safe = "".join(ch for ch in str(key or "") if ch.isalnum() or ch == "_")
    if not safe:
        safe = "via"
    path = f"$.{safe}"
    if dialect() == "mysql":
        return f"JSON_UNQUOTE(JSON_EXTRACT(meta_json, '{path}'))"
    return f"json_extract(meta_json, '{path}')"


def _meta_fields(meta: Any) -> tuple[str | None, str | None]:
    if not isinstance(meta, dict):
        return None, None
    via = meta.get("via")
    kind = meta.get("kind")
    via_s = str(via).strip() if via is not None and str(via).strip() else None
    kind_s = str(kind).strip() if kind is not None and str(kind).strip() else None
    return via_s, kind_s


def list_model_usage(
    *,
    page: int = 1,
    page_size: int = 50,
    source: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    user_id: str | None = None,
    status: str | None = None,
    via: str | None = None,
    kind: str | None = None,
    ts_from: float | None = None,
    ts_to: float | None = None,
) -> dict[str, Any]:
    ensure_model_usage_table()
    page = max(1, int(page or 1))
    page_size = max(1, min(200, int(page_size or 50)))
    where: list[str] = []
    args: list[Any] = []
    if source:
        where.append("source = ?")
        args.append(source)
    if provider:
        where.append("provider = ?")
        args.append(provider)
    if model:
        where.append("(catalog_model_id = ? OR api_model = ? OR api_model LIKE ?)")
        args.extend([model, model, f"%{model}%"])
    if user_id:
        where.append("user_id = ?")
        args.append(user_id)
    if status:
        where.append("status = ?")
        args.append(status)
    via_s = (via or "").strip()
    if via_s:
        via_expr = _meta_json_path_sql("via")
        where.append(f"COALESCE(NULLIF({via_expr}, ''), 'unknown') = ?")
        args.append(via_s)
    kind_s = (kind or "").strip()
    if kind_s:
        kind_expr = _meta_json_path_sql("kind")
        where.append(f"COALESCE(NULLIF({kind_expr}, ''), 'unknown') = ?")
        args.append(kind_s)
    if ts_from is not None:
        where.append("created_at >= ?")
        args.append(float(ts_from))
    if ts_to is not None:
        where.append("created_at <= ?")
        args.append(float(ts_to))
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    with connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM model_usage{clause}", args
        ).fetchone()
        total = int((total_row or {}).get("c") or 0)
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"""
            SELECT id, created_at, user_id, task_id, source, provider,
                   catalog_model_id, api_model, status, latency_ms,
                   prompt_tokens, completion_tokens, total_tokens,
                   cached_tokens, reasoning_tokens, image_count,
                   credits_charged, cost_cny, provider_request_id,
                   usage_json, meta_json, error
            FROM model_usage
            {clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            [*args, page_size, offset],
        ).fetchall()

    items = []
    for r in rows or []:
        d = dict(r)
        for k in ("usage_json", "meta_json"):
            raw = d.get(k)
            if isinstance(raw, str) and raw.strip():
                try:
                    d[k.replace("_json", "")] = json.loads(raw)
                except Exception:
                    d[k.replace("_json", "")] = raw
            d.pop(k, None)
        meta = d.get("meta") if isinstance(d.get("meta"), dict) else None
        via_v, kind_v = _meta_fields(meta)
        money = _money_fields(
            credits=d.get("credits_charged"),
            cost_raw=d.get("cost_cny"),
            provider=str(d.get("provider") or ""),
            meta=meta,
        )
        # camelCase for admin FE
        items.append(
            {
                "id": d.get("id"),
                "createdAt": d.get("created_at"),
                "userId": d.get("user_id"),
                "taskId": d.get("task_id"),
                "source": d.get("source"),
                "provider": d.get("provider"),
                "catalogModelId": d.get("catalog_model_id"),
                "apiModel": d.get("api_model"),
                "status": d.get("status"),
                "latencyMs": d.get("latency_ms"),
                "promptTokens": d.get("prompt_tokens"),
                "completionTokens": d.get("completion_tokens"),
                "totalTokens": d.get("total_tokens"),
                "cachedTokens": d.get("cached_tokens"),
                "reasoningTokens": d.get("reasoning_tokens"),
                "imageCount": d.get("image_count"),
                "creditsCharged": d.get("credits_charged"),
                "costCny": money["actualCostCny"],
                "revenueCny": money["revenueCny"],
                "actualCostCny": money["actualCostCny"],
                "profitCny": money["profitCny"],
                "providerRequestId": d.get("provider_request_id"),
                "usage": d.get("usage"),
                "meta": meta,
                "via": via_v,
                "kind": kind_v,
                "error": d.get("error"),
            }
        )
    return {
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def list_model_usage_for_task(task_id: str, *, limit: int = 40) -> list[dict[str, Any]]:
    """Model calls for one design task (Admin 运行监测 drawer)."""
    tid = str(task_id or "").strip()
    if not tid:
        return []
    ensure_model_usage_table()
    lim = max(1, min(100, int(limit or 40)))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, source, provider, catalog_model_id, api_model,
                   status, latency_ms, prompt_tokens, completion_tokens, total_tokens,
                   image_count, cost_cny, error, meta_json
            FROM model_usage
            WHERE task_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (tid, lim),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows or []:
        d = dict(r)
        meta = None
        raw_meta = d.get("meta_json")
        if isinstance(raw_meta, str) and raw_meta.strip():
            try:
                parsed = json.loads(raw_meta)
                if isinstance(parsed, dict):
                    meta = parsed
            except Exception:
                meta = None
        via_v, kind_v = _meta_fields(meta)
        out.append(
            {
                "id": d.get("id"),
                "createdAt": d.get("created_at"),
                "source": d.get("source"),
                "provider": d.get("provider"),
                "catalogModelId": d.get("catalog_model_id"),
                "apiModel": d.get("api_model"),
                "status": d.get("status"),
                "latencyMs": d.get("latency_ms"),
                "promptTokens": d.get("prompt_tokens"),
                "completionTokens": d.get("completion_tokens"),
                "totalTokens": d.get("total_tokens"),
                "imageCount": d.get("image_count"),
                "costCny": d.get("cost_cny"),
                "via": via_v,
                "kind": kind_v,
                "error": d.get("error"),
            }
        )
    return out


def summarize_model_usage(
    *,
    ts_from: float | None = None,
    ts_to: float | None = None,
) -> dict[str, Any]:
    """Aggregate by model / provider / source for Admin dashboard."""
    ensure_model_usage_table()
    where: list[str] = []
    args: list[Any] = []
    if ts_from is not None:
        where.append("created_at >= ?")
        args.append(float(ts_from))
    if ts_to is not None:
        where.append("created_at <= ?")
        args.append(float(ts_to))
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    with connect() as conn:
        totals = conn.execute(
            f"""
            SELECT
              COUNT(*) AS calls,
              COALESCE(SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END), 0) AS ok,
              COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS failed,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(image_count), 0) AS images,
              COALESCE(SUM(credits_charged), 0) AS credits,
              COALESCE(SUM(cost_cny), 0) AS cost_cny,
              COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
            FROM model_usage
            {clause}
            """,
            args,
        ).fetchone()

        by_model = conn.execute(
            f"""
            SELECT
              COALESCE(NULLIF(catalog_model_id, ''), api_model, 'unknown') AS model,
              COALESCE(provider, '') AS provider,
              COUNT(*) AS calls,
              COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS failed,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(image_count), 0) AS images,
              COALESCE(SUM(credits_charged), 0) AS credits,
              COALESCE(SUM(cost_cny), 0) AS cost_cny,
              COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
            FROM model_usage
            {clause}
            GROUP BY model, provider
            ORDER BY total_tokens DESC, calls DESC
            LIMIT 100
            """,
            args,
        ).fetchall()

        by_source = conn.execute(
            f"""
            SELECT
              COALESCE(source, 'unknown') AS source,
              COUNT(*) AS calls,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(image_count), 0) AS images,
              COALESCE(SUM(credits_charged), 0) AS credits,
              COALESCE(SUM(cost_cny), 0) AS cost_cny
            FROM model_usage
            {clause}
            GROUP BY source
            ORDER BY calls DESC
            """,
            args,
        ).fetchall()

        by_provider = conn.execute(
            f"""
            SELECT
              COALESCE(NULLIF(provider, ''), 'unknown') AS provider,
              COUNT(*) AS calls,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(cost_cny), 0) AS cost_cny,
              COALESCE(SUM(credits_charged), 0) AS credits
            FROM model_usage
            {clause}
            GROUP BY provider
            ORDER BY calls DESC
            """,
            args,
        ).fetchall()

        via_expr = _meta_json_path_sql("via")
        kind_expr = _meta_json_path_sql("kind")
        via_group = f"COALESCE(NULLIF({via_expr}, ''), 'unknown')"
        kind_group = f"COALESCE(NULLIF({kind_expr}, ''), 'unknown')"
        by_via = conn.execute(
            f"""
            SELECT
              {via_group} AS via,
              COUNT(*) AS calls,
              COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS failed,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(credits_charged), 0) AS credits,
              COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
            FROM model_usage
            {clause}
            GROUP BY {via_group}
            ORDER BY calls DESC
            """,
            args,
        ).fetchall()
        by_kind = conn.execute(
            f"""
            SELECT
              {kind_group} AS kind,
              COUNT(*) AS calls,
              COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS failed,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(credits_charged), 0) AS credits,
              COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
            FROM model_usage
            {clause}
            GROUP BY {kind_group}
            ORDER BY calls DESC
            """,
            args,
        ).fetchall()

    def _num(row: Any, key: str) -> float:
        try:
            return float((row or {}).get(key) or 0)
        except Exception:
            return 0.0

    def _row_money(credits: float, cost: float, provider: str = "") -> dict[str, float | None]:
        revenue = _credits_to_revenue_cny(credits)
        actual = (
            _actual_cost_cny(cost, provider=provider) if cost else None
        )
        return {
            "revenueCny": revenue,
            "actualCostCny": actual,
            "profitCny": _profit_cny(revenue, actual),
        }

    t = totals or {}
    t_credits = _num(t, "credits")
    t_cost = _num(t, "cost_cny")
    t_money = _row_money(t_credits, t_cost)
    return {
        "totals": {
            "calls": int(_num(t, "calls")),
            "ok": int(_num(t, "ok")),
            "failed": int(_num(t, "failed")),
            "promptTokens": int(_num(t, "prompt_tokens")),
            "completionTokens": int(_num(t, "completion_tokens")),
            "totalTokens": int(_num(t, "total_tokens")),
            "images": int(_num(t, "images")),
            "credits": int(t_credits),
            "costCny": round(t_cost, 6),
            "revenueCny": t_money["revenueCny"],
            "actualCostCny": t_money["actualCostCny"],
            "profitCny": t_money["profitCny"],
            "avgLatencyMs": int(_num(t, "avg_latency_ms")),
        },
        "byModel": [
            {
                "model": r.get("model"),
                "provider": r.get("provider"),
                "calls": int(_num(r, "calls")),
                "failed": int(_num(r, "failed")),
                "promptTokens": int(_num(r, "prompt_tokens")),
                "completionTokens": int(_num(r, "completion_tokens")),
                "totalTokens": int(_num(r, "total_tokens")),
                "images": int(_num(r, "images")),
                "credits": int(_num(r, "credits")),
                "costCny": round(_num(r, "cost_cny"), 6),
                "avgLatencyMs": int(_num(r, "avg_latency_ms")),
                **_row_money(
                    _num(r, "credits"),
                    _num(r, "cost_cny"),
                    str(r.get("provider") or ""),
                ),
            }
            for r in (by_model or [])
        ],
        "bySource": [
            {
                "source": r.get("source"),
                "calls": int(_num(r, "calls")),
                "totalTokens": int(_num(r, "total_tokens")),
                "images": int(_num(r, "images")),
                "credits": int(_num(r, "credits")),
                "costCny": round(_num(r, "cost_cny"), 6),
                **_row_money(_num(r, "credits"), _num(r, "cost_cny")),
            }
            for r in (by_source or [])
        ],
        "byProvider": [
            {
                "provider": r.get("provider"),
                "calls": int(_num(r, "calls")),
                "totalTokens": int(_num(r, "total_tokens")),
                "credits": int(_num(r, "credits")),
                "costCny": round(_num(r, "cost_cny"), 6),
                **_row_money(
                    _num(r, "credits"),
                    _num(r, "cost_cny"),
                    str(r.get("provider") or ""),
                ),
            }
            for r in (by_provider or [])
        ],
        "byVia": [
            {
                "via": r.get("via"),
                "calls": int(_num(r, "calls")),
                "failed": int(_num(r, "failed")),
                "totalTokens": int(_num(r, "total_tokens")),
                "credits": int(_num(r, "credits")),
                "avgLatencyMs": int(_num(r, "avg_latency_ms")),
            }
            for r in (by_via or [])
        ],
        "byKind": [
            {
                "kind": r.get("kind"),
                "calls": int(_num(r, "calls")),
                "failed": int(_num(r, "failed")),
                "totalTokens": int(_num(r, "total_tokens")),
                "credits": int(_num(r, "credits")),
                "avgLatencyMs": int(_num(r, "avg_latency_ms")),
            }
            for r in (by_kind or [])
        ],
    }
