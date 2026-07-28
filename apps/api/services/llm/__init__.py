"""OpenAI-compatible LLM router (Doubao Ark / DeepSeek / OpenRouter).

Text / chat models go through LangChain ``init_chat_model`` (openai provider).
Compat subclass keeps Ark/DeepSeek ``reasoning_content`` stream deltas.
Image generation and ordinary FastAPI routes stay on raw HTTP / httpx.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

from config.settings import settings


@dataclass(frozen=True)
class LlmEndpoint:
    base_url: str
    api_key: str
    model_id: str
    provider: str


# OpenAI-compatible chat bases (`POST {base}/chat/completions`).
PROVIDER_BASE_URLS: dict[str, str] = {
    "doubao": "https://ark.cn-beijing.volces.com/api/v3",
    "deepseek": "https://api.deepseek.com",
    "openrouter": "https://openrouter.ai/api/v1",
}

# Volcengine Ark chat models (catalog id → api_model).
_ARK_CHAT_MODELS: list[dict] = [
    {
        "id": "deepseek-v4-flash",
        "label": "DeepSeek V4 Flash",
        "provider": "doubao",
        "kind": "text",
        "api_model": "deepseek-v4-flash-260425",
        "max_attachments": 8,
        "thinking": False,
    },
    {
        "id": "deepseek-v4-pro",
        "label": "DeepSeek V4 Pro",
        "provider": "doubao",
        "kind": "text",
        "api_model": "deepseek-v4-pro-260425",
        "max_attachments": 8,
        "thinking": False,
    },
    {
        "id": "doubao-seed-2-0-mini",
        "label": "Seed 2.0 Mini",
        "provider": "doubao",
        "kind": "text",
        "api_model": "doubao-seed-2-0-mini-260428",
        "max_attachments": 8,
        "thinking": False,
    },
    {
        "id": "doubao-seed-2-1-pro",
        "label": "Seed 2.1 Pro",
        "provider": "doubao",
        "kind": "text",
        "api_model": "doubao-seed-2-1-pro-260628",
        "max_attachments": 16,
        "thinking": False,
    },
    {
        "id": "doubao-seed-2-1-turbo",
        "label": "Seed 2.1 Turbo",
        "provider": "doubao",
        "kind": "text",
        "api_model": "doubao-seed-2-1-turbo-260628",
        "max_attachments": 16,
        "thinking": False,
    },
]

def _fallback_image_limits(model_id: str, api_model: str = "") -> dict | None:
    try:
        from services.llm.catalog_store import infer_image_limit_preset, resolve_image_limits

        return resolve_image_limits(
            preset=infer_image_limit_preset(model_id, api_model, provider="doubao")
        )
    except Exception:
        return None


_ARK_IMAGE_MODELS: list[dict] = [
    {
        "id": "doubao-seedream-5-0-pro",
        "label": "Seedream 5.0 Pro",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-5-0-pro-260628",
        "max_attachments": 10,
        "imageLimits": _fallback_image_limits(
            "doubao-seedream-5-0-pro", "doubao-seedream-5-0-pro-260628"
        ),
    },
    {
        "id": "doubao-seedream-5-0-lite",
        "label": "Seedream 5.0 Lite",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-5-0-260128",
        "max_attachments": 14,
        "imageLimits": _fallback_image_limits(
            "doubao-seedream-5-0-lite", "doubao-seedream-5-0-260128"
        ),
    },
    {
        "id": "doubao-seedream-4-5",
        "label": "Seedream 4.5",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-4-5-251128",
        "max_attachments": 14,
        "imageLimits": _fallback_image_limits(
            "doubao-seedream-4-5", "doubao-seedream-4-5-251128"
        ),
    },
    {
        "id": "doubao-seedream-4-0",
        "label": "Seedream 4.0",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-4-0-250828",
        "max_attachments": 14,
        "imageLimits": _fallback_image_limits(
            "doubao-seedream-4-0", "doubao-seedream-4-0-250828"
        ),
    },
]


def _api_key_for(provider: str) -> str:
    """Per-provider key first; LLM_API_KEY as shared fallback."""
    per = {
        "doubao": settings.doubao_api_key,
        "deepseek": settings.deepseek_api_key,
        "openrouter": settings.openrouter_api_key,
    }
    specific = (per.get(provider) or "").strip()
    if specific:
        return specific
    return (settings.llm_api_key or "").strip()


def _has_doubao_key() -> bool:
    if (settings.doubao_api_key or "").strip():
        return True
    unified = (settings.llm_api_key or "").strip()
    if not unified:
        return False
    provider = (settings.llm_provider or "doubao").strip().lower()
    return provider not in ("deepseek", "openrouter")


def _has_deepseek_key() -> bool:
    if (settings.deepseek_api_key or "").strip():
        return True
    unified = (settings.llm_api_key or "").strip()
    if not unified:
        return False
    return (settings.llm_provider or "").strip().lower() == "deepseek"


def _has_openrouter_key() -> bool:
    if (settings.openrouter_api_key or "").strip():
        return True
    unified = (settings.llm_api_key or "").strip()
    if not unified:
        return False
    return (settings.llm_provider or "").strip().lower() == "openrouter"


def list_llm_models() -> list[dict]:
    """Catalog for the composer model picker (DB-backed with hardcoded fallback)."""
    models: list[dict] = []
    try:
        from services.llm.catalog_store import list_catalog
        catalog = list_catalog(kind="text", enabled_only=True)
    except Exception:
        catalog = []

    if catalog:
        for m in catalog:
            provider = str(m.get("provider") or "doubao")
            if provider == "doubao" and not (_has_doubao_key() or not _has_deepseek_key()):
                continue
            if provider == "deepseek" and not (_has_deepseek_key() or not _has_doubao_key()):
                continue
            if provider == "openrouter" and not _has_openrouter_key():
                continue
            models.append(
                {
                    "id": m["id"],
                    "label": m["label"],
                    "description": m.get("description"),
                    "provider": provider,
                    "kind": "text",
                    "api_model": m.get("api_model") or m.get("apiModel") or m["id"],
                    "iconKey": m.get("iconKey"),
                    "iconUrl": m.get("iconUrl"),
                    "price": m.get("price"),
                    "max_attachments": int(m.get("max_attachments") or m.get("maxAttachments") or 8),
                    "thinking": bool(m.get("thinking")),
                }
            )
    else:
        if _has_doubao_key() or not _has_deepseek_key():
            models.extend(dict(m) for m in _ARK_CHAT_MODELS)
        if _has_deepseek_key() or not _has_doubao_key():
            models.extend(
                [
                    {
                        "id": "deepseek-chat",
                        "label": "DeepSeek Chat",
                        "provider": "deepseek",
                        "kind": "text",
                        "api_model": "deepseek-chat",
                        "max_attachments": 4,
                    },
                    {
                        "id": "deepseek-reasoner",
                        "label": "DeepSeek Reasoner",
                        "provider": "deepseek",
                        "kind": "text",
                        "api_model": "deepseek-reasoner",
                        "max_attachments": 4,
                        "thinking": True,
                    },
                ]
            )

    seed = (settings.doubao_seed_model or "").strip()
    if seed:
        models.append(
            {
                "id": "doubao-seed",
                "label": "Doubao Seed (custom ep)",
                "provider": "doubao",
                "kind": "text",
                "api_model": seed,
                "max_attachments": 8,
            }
        )

    pro = (settings.doubao_pro_model or "").strip()
    if pro:
        models.append(
            {
                "id": "doubao-pro",
                "label": "Doubao Pro (custom ep)",
                "provider": "doubao",
                "kind": "text",
                "api_model": pro,
                "max_attachments": 8,
            }
        )

    by_id: dict[str, dict] = {}
    for m in models:
        by_id.setdefault(str(m["id"]), m)
    return list(by_id.values())


def list_image_models() -> list[dict]:
    """Doubao Seedream family via Ark /images/generations (DB-backed)."""
    try:
        from services.llm.catalog_store import list_catalog
        catalog = list_catalog(kind="image", enabled_only=True)
    except Exception:
        catalog = []

    if catalog:
        models = []
        for m in catalog:
            provider = str(m.get("provider") or "doubao")
            if provider == "openrouter" and not _has_openrouter_key():
                continue
            mid = m["id"]
            api_model = m.get("api_model") or m.get("apiModel") or mid
            limits = m.get("imageLimits") or m.get("image_limits")
            if not limits:
                limits = _fallback_image_limits(str(mid), str(api_model))
            price_meta = m.get("priceMeta") or m.get("price_meta")
            models.append(
                {
                    "id": mid,
                    "label": m["label"],
                    "description": m.get("description"),
                    "provider": provider,
                    "kind": "image",
                    "api_model": api_model,
                    "iconKey": m.get("iconKey"),
                    "iconUrl": m.get("iconUrl"),
                    "price": m.get("price"),
                    "priceMeta": price_meta,
                    "price_meta": price_meta,
                    "max_attachments": int(
                        m.get("max_attachments") or m.get("maxAttachments") or 14
                    ),
                    "imageLimits": limits,
                    "image_limits": limits,
                }
            )
    else:
        models = [dict(m) for m in _ARK_IMAGE_MODELS]

    override = (settings.image_default_model or "").strip()
    if (
        override
        and override not in {m["id"] for m in models}
        and override not in {m["api_model"] for m in models}
    ):
        models.insert(
            0,
            {
                "id": override,
                "label": f"custom image ? {override[:24]}",
                "provider": "doubao",
                "kind": "image",
                "api_model": override,
                "max_attachments": 14,
            },
        )
    return models


def list_all_models() -> list[dict]:
    return [*list_llm_models(), *list_image_models()]


def _base_url_for(provider: str) -> str:
    """Known providers use fixed bases; LLM_BASE_URL only for unknown names."""
    known = PROVIDER_BASE_URLS.get(provider)
    if known:
        return known.rstrip("/")
    override = (settings.llm_base_url or "").strip()
    if override:
        return override.rstrip("/")
    return PROVIDER_BASE_URLS["doubao"].rstrip("/")


def resolve_provider(model_string: str | None) -> tuple[str, str]:
    """Return (provider, api_model_id) for a catalog id or raw model string."""
    default = (settings.llm_default_model or "doubao-seed-2-0-mini").strip()
    model = (model_string or default).strip()
    catalog = {m["id"]: m for m in list_all_models()}
    meta = catalog.get(model)
    if meta:
        provider = str(meta.get("provider") or settings.llm_provider or "doubao")
        return provider, str(meta.get("api_model") or meta["id"])

    for m in list_all_models():
        if str(m.get("api_model") or "") == model:
            return str(m.get("provider") or "doubao"), model

    # Legacy catalog ids from older clients
    legacy = {
        "doubao-seed-1-6-251015": (settings.doubao_seed_model or "").strip(),
        "doubao-1-5-pro-32k-250115": (settings.doubao_pro_model or "").strip(),
        "doubao-seed": (settings.doubao_seed_model or "doubao-seed-2-0-mini-260428").strip(),
        "doubao-pro": (settings.doubao_pro_model or "doubao-seed-2-0-mini-260428").strip(),
    }
    if model in legacy:
        api = legacy[model] or model
        return "doubao", api

    # provider/model form, e.g. doubao/ep-xxxx or openrouter/anthropic/claude-sonnet-4
    if "/" in model:
        prefix, rest = model.split("/", 1)
        if prefix in PROVIDER_BASE_URLS and rest:
            return prefix, rest

    low = model.lower()
    if (
        low.startswith("ep-")
        or low.startswith("doubao")
        or low.startswith("deepseek-v")
        or "seedream" in low
    ):
        return "doubao", model

    provider = (settings.llm_provider or "doubao").strip().lower()
    if provider not in PROVIDER_BASE_URLS:
        provider = "doubao"
    return provider, model


def get_llm_endpoint(model_string: str | None = None) -> LlmEndpoint:
    """
    Resolve an OpenAI-compatible chat endpoint.

    Configure via apps/api/.env:
      DOUBAO_API_KEY=... / DEEPSEEK_API_KEY=... / OPENROUTER_API_KEY=...
      # or LLM_API_KEY=...
      LLM_DEFAULT_MODEL=doubao-seed-2-0-mini
    """
    provider, model_id = resolve_provider(model_string)
    api_key = _api_key_for(provider)
    if not api_key:
        raise RuntimeError(
            "No LLM API key configured. Set DOUBAO_API_KEY, DEEPSEEK_API_KEY, "
            "OPENROUTER_API_KEY, or LLM_API_KEY in apps/api/.env"
        )

    return LlmEndpoint(
        base_url=_base_url_for(provider),
        api_key=api_key,
        model_id=model_id,
        provider=provider,
    )


# ---------------------------------------------------------------------------
# LangChain chat model (text only — not image /images/generations)
# ---------------------------------------------------------------------------


def _default_headers_for(endpoint: LlmEndpoint) -> dict[str, str]:
    """OpenRouter attribution headers; other providers need none beyond Bearer."""
    if endpoint.provider != "openrouter":
        return {}
    headers: dict[str, str] = {}
    referer = (settings.openrouter_http_referer or "").strip()
    title = (settings.openrouter_app_title or "").strip() or "recombyn"
    if referer:
        headers["HTTP-Referer"] = referer
    headers["X-Title"] = title
    return headers


_CompatChatOpenAI: type | None = None
_compat_openai_factory_ready = False


def _compat_chat_openai_cls() -> type:
    """Lazy subclass so langchain-openai is only required at call time."""
    global _CompatChatOpenAI
    if _CompatChatOpenAI is not None:
        return _CompatChatOpenAI

    from langchain_openai import ChatOpenAI
    from langchain_core.outputs import ChatGenerationChunk
    from langchain_core.messages import AIMessageChunk

    class CompatChatOpenAI(ChatOpenAI):
        """Keep provider reasoning deltas that stock ChatOpenAI drops."""

        def _convert_chunk_to_generation_chunk(
            self,
            chunk: dict,
            default_chunk_class: type,
            base_generation_info: dict | None,
        ) -> ChatGenerationChunk | None:
            gen = super()._convert_chunk_to_generation_chunk(
                chunk, default_chunk_class, base_generation_info
            )
            if gen is None:
                return None
            choices = (
                chunk.get("choices")
                or chunk.get("chunk", {}).get("choices", [])
                or []
            )
            if choices:
                delta = choices[0].get("delta") or {}
                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if (
                    isinstance(reasoning, str)
                    and reasoning
                    and isinstance(gen.message, AIMessageChunk)
                ):
                    gen.message.additional_kwargs["reasoning_content"] = reasoning
            rid = chunk.get("id") or chunk.get("request_id")
            if rid and isinstance(gen.message, AIMessageChunk):
                gen.message.response_metadata.setdefault(
                    "provider_request_id", str(rid)
                )
            return gen

    _CompatChatOpenAI = CompatChatOpenAI
    return CompatChatOpenAI


def _ensure_compat_openai_for_factory() -> None:
    """
    Point LangChain's openai provider at CompatChatOpenAI so
    ``init_chat_model(..., model_provider='openai')`` keeps reasoning deltas.
    """
    global _compat_openai_factory_ready
    if _compat_openai_factory_ready:
        return

    import langchain_openai
    from langchain.chat_models.base import _get_chat_model_creator

    compat = _compat_chat_openai_cls()
    langchain_openai.ChatOpenAI = compat  # type: ignore[misc, assignment]
    _get_chat_model_creator.cache_clear()
    _compat_openai_factory_ready = True


def build_chat_model(
    model: str | None = None,
    *,
    endpoint: LlmEndpoint | None = None,
    max_tokens: int | None = None,
    streaming: bool = False,
    stream_usage: bool = True,
    extra_body: Mapping[str, Any] | None = None,
    timeout: float = 180.0,
    model_id_override: str | None = None,
    source: str | None = None,
    catalog_model_id: str | None = None,
    with_usage_callback: bool = True,
):
    """
    ``init_chat_model(..., model_provider='openai')`` for our catalog endpoints.

    Resolves base_url/api_key from ``get_llm_endpoint``, then calls the official
    factory. Optional usage callback writes our billing ledger.
    """
    from langchain.chat_models import init_chat_model

    ep = endpoint or get_llm_endpoint(model)
    api_model = (model_id_override or ep.model_id).strip()
    _ensure_compat_openai_for_factory()

    kwargs: dict[str, Any] = {
        "api_key": ep.api_key,
        "base_url": ep.base_url,
        "streaming": streaming,
        "stream_usage": stream_usage,
        "timeout": timeout,
        "max_retries": 0,
    }
    headers = _default_headers_for(ep)
    if headers:
        kwargs["default_headers"] = headers
    if max_tokens is not None:
        kwargs["max_tokens"] = int(max_tokens)
    if extra_body:
        kwargs["extra_body"] = dict(extra_body)

    llm = init_chat_model(
        api_model,
        model_provider="openai",
        **kwargs,
    )
    llm._recombyn_endpoint = ep  # type: ignore[attr-defined]
    cat = (catalog_model_id or model or api_model or "").strip() or None
    llm._recombyn_catalog_id = cat  # type: ignore[attr-defined]

    if not with_usage_callback:
        return llm

    src = (source or "").strip()
    if not src:
        try:
            from services.llm.usage_log import get_usage_context

            ctx = get_usage_context()
            src = (ctx.source if ctx and ctx.source else "") or "llm"
        except Exception:
            src = "llm"

    handler = usage_callback_handler(
        source=src,
        provider=ep.provider,
        catalog_model_id=cat,
        api_model=api_model,
    )
    return llm.with_config(callbacks=[handler])


def usage_callback_handler(
    *,
    source: str,
    provider: str | None = None,
    catalog_model_id: str | None = None,
    api_model: str | None = None,
    kind: str = "llm",
):
    """LangChain Callback — sole path for model/image usage ledger."""
    from langchain_core.callbacks import BaseCallbackHandler

    class _UsageHandler(BaseCallbackHandler):
        def __init__(self) -> None:
            self._started = 0.0
            self._tool_started = 0.0

        def on_llm_start(self, *args: Any, **kwargs: Any) -> None:
            import time as _t

            self._started = _t.time()

        def on_chat_model_start(self, *args: Any, **kwargs: Any) -> None:
            import time as _t

            self._started = _t.time()

        def _usage_from_response(self, response: Any) -> dict[str, Any] | None:
            try:
                gens = getattr(response, "generations", None) or []
                if gens and gens[0]:
                    msg = gens[0][0].message
                    um = getattr(msg, "usage_metadata", None)
                    if isinstance(um, dict):
                        return {
                            "prompt_tokens": um.get("input_tokens"),
                            "completion_tokens": um.get("output_tokens"),
                            "total_tokens": um.get("total_tokens"),
                        }
                    if um is not None:
                        return {
                            "prompt_tokens": getattr(um, "input_tokens", None),
                            "completion_tokens": getattr(um, "output_tokens", None),
                            "total_tokens": getattr(um, "total_tokens", None),
                        }
                # LLMResult.llm_output.token_usage
                out = getattr(response, "llm_output", None) or {}
                if isinstance(out, dict):
                    tu = out.get("token_usage") or out.get("usage")
                    if isinstance(tu, dict):
                        return tu
            except Exception:
                return None
            return None

        def on_llm_end(self, response: Any, **kwargs: Any) -> None:
            import time as _t

            from services.llm.usage_log import record_model_usage

            usage = self._usage_from_response(response)
            total = None
            if isinstance(usage, dict) and usage.get("total_tokens") is not None:
                try:
                    total = int(usage["total_tokens"])
                except Exception:
                    total = None
            rid = None
            try:
                gens = getattr(response, "generations", None) or []
                if gens and gens[0]:
                    meta = getattr(gens[0][0].message, "response_metadata", None) or {}
                    if isinstance(meta, dict):
                        rid = meta.get("provider_request_id") or meta.get("id")
            except Exception:
                rid = None
            record_model_usage(
                source=source,
                provider=provider,
                catalog_model_id=catalog_model_id,
                api_model=api_model,
                status="ok",
                latency_ms=int((_t.time() - (self._started or _t.time())) * 1000),
                usage=usage,
                total_tokens=total,
                provider_request_id=str(rid) if rid else None,
                meta={"via": "langchain_callback", "kind": kind},
            )

        def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
            import time as _t

            from services.llm.usage_log import record_model_usage

            record_model_usage(
                source=source,
                provider=provider,
                catalog_model_id=catalog_model_id,
                api_model=api_model,
                status="error",
                latency_ms=int((_t.time() - (self._started or _t.time())) * 1000),
                error=str(error)[:800],
                meta={"via": "langchain_callback", "kind": kind},
            )

        def on_tool_start(self, *args: Any, **kwargs: Any) -> None:
            import time as _t

            self._tool_started = _t.time()

        def on_tool_end(self, output: Any, **kwargs: Any) -> None:
            import time as _t

            from services.llm.usage_log import record_model_usage

            payload = output
            if isinstance(output, str):
                try:
                    import json as _json

                    payload = _json.loads(output)
                except Exception:
                    payload = output

            image_count = None
            usage = None
            rid = None
            cat = catalog_model_id
            api = api_model
            prov = provider
            if isinstance(payload, dict):
                imgs = payload.get("images")
                if isinstance(imgs, list):
                    image_count = len(imgs) or 1
                m = payload.get("model")
                if isinstance(m, str) and m.strip():
                    cat = m.strip()
                ap = payload.get("_api_model")
                if isinstance(ap, str) and ap.strip():
                    api = ap.strip()
                pr = payload.get("_provider")
                if isinstance(pr, str) and pr.strip():
                    prov = pr.strip()
                u = payload.get("_usage")
                if isinstance(u, dict):
                    usage = u
                r = payload.get("_response_id")
                if isinstance(r, str) and r.strip():
                    rid = r.strip()
            record_model_usage(
                source=source or "image",
                provider=prov,
                catalog_model_id=cat,
                api_model=api,
                status="ok",
                latency_ms=int(
                    (_t.time() - (self._tool_started or self._started or _t.time()))
                    * 1000
                ),
                usage=usage,
                image_count=image_count,
                provider_request_id=rid,
                meta={"via": "langchain_callback", "kind": "tool"},
            )

        def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
            import time as _t

            from services.llm.usage_log import record_model_usage

            record_model_usage(
                source=source or "image",
                provider=provider,
                catalog_model_id=catalog_model_id,
                api_model=api_model,
                status="error",
                latency_ms=int(
                    (_t.time() - (self._tool_started or self._started or _t.time()))
                    * 1000
                ),
                error=str(error)[:800],
                meta={"via": "langchain_callback", "kind": "tool"},
            )

    return _UsageHandler()


def build_async_openai_client(
    *,
    endpoint: LlmEndpoint | None = None,
    model: str | None = None,
    provider: str | None = None,
    api_model: str | None = None,
    timeout: float = 180.0,
):
    """
    Async OpenAI SDK client (same stack LangChain ChatOpenAI uses).

    Used for image generation (``/images/generations``, OpenRouter ``/images``,
    chat image modalities) where stock LangChain has no image-gen abstraction.
    Returns ``(client, endpoint)``.
    """
    from openai import AsyncOpenAI

    if endpoint is None:
        if provider and api_model:
            key = _api_key_for(provider)
            if not key:
                raise RuntimeError(
                    f"No API key for provider={provider!r}. "
                    "Set DOUBAO_API_KEY / OPENROUTER_API_KEY / LLM_API_KEY."
                )
            endpoint = LlmEndpoint(
                base_url=_base_url_for(provider),
                api_key=key,
                model_id=api_model,
                provider=provider,
            )
        else:
            endpoint = get_llm_endpoint(model)
    headers = _default_headers_for(endpoint)
    client = AsyncOpenAI(
        api_key=endpoint.api_key,
        base_url=endpoint.base_url,
        timeout=timeout,
        max_retries=0,
        default_headers=headers or None,
    )
    return client, endpoint


async def openai_json_post(
    client: Any,
    path: str,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """POST JSON via OpenAI SDK (custom paths like OpenRouter ``/images``)."""
    raw = await client.with_raw_response.post(
        path,
        body=dict(body),
        cast_to=object,
    )
    try:
        data = raw.parse()
    except Exception:
        data = None
    if isinstance(data, dict):
        return data
    http_resp = getattr(raw, "http_response", None)
    if http_resp is not None:
        try:
            parsed = http_resp.json()
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    raise RuntimeError(f"OpenAI POST {path} returned non-JSON payload")


def _image_content_block(url: str) -> Any:
    """LangChain ``ImageContentBlock`` from a data URL or https URL."""
    from langchain_core.messages.content import create_image_block

    u = (url or "").strip()
    if not u:
        raise ValueError("empty image url")
    # Prefer official base64+mime when FE already inlined bytes as data URL.
    if u.startswith("data:") and ";base64," in u:
        header, b64 = u.split(";base64,", 1)
        mime = header[5:].strip() if header.startswith("data:") else ""
        if not mime:
            mime = "image/png"
        if b64:
            return create_image_block(base64=b64, mime_type=mime)
    return create_image_block(url=u)


def build_user_message_content(
    text: str,
    images: list[str] | None = None,
) -> str | list[Any]:
    """
    Multimodal user content via LangChain content blocks.

    No images → plain string. With images →
    ``[TextContentBlock, ImageContentBlock, …]`` for ``HumanMessage``.
    Providers still receive OpenAI ``image_url`` after ChatOpenAI conversion.
    """
    from langchain_core.messages.content import create_text_block

    refs = [u.strip() for u in (images or []) if isinstance(u, str) and u.strip()]
    if not refs:
        return text
    parts: list[Any] = [create_text_block(text or "")]
    for url in refs:
        try:
            parts.append(_image_content_block(url))
        except ValueError:
            continue
    if len(parts) == 1:
        return text
    return parts


def openai_user_content(
    text: str,
    images: list[str] | None = None,
) -> str | list[dict[str, Any]]:
    """Assemble via LangChain blocks, then convert to OpenAI chat ``content`` wire form.

    For raw ``chat.completions.create`` paths that do not go through ChatOpenAI.
    """
    from langchain_core.messages import HumanMessage, convert_to_openai_messages

    content = build_user_message_content(text, images)
    if isinstance(content, str):
        return content
    converted = convert_to_openai_messages([HumanMessage(content=content)])
    if not converted:
        return text
    out = converted[0].get("content")
    if isinstance(out, (str, list)):
        return out  # type: ignore[return-value]
    return text


def to_lc_messages(raw: list[dict[str, Any]] | None) -> list[Any]:
    """OpenAI-style dicts → LangChain ``BaseMessage`` list (System/Human/AI/Tool).

    User ``content`` may already be LangChain multimodal blocks from
    ``build_user_message_content``.
    """
    from langchain_core.messages import (
        AIMessage,
        BaseMessage,
        HumanMessage,
        SystemMessage,
        ToolMessage,
    )

    out: list[BaseMessage] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        content = item.get("content")
        if role == "system":
            out.append(SystemMessage(content=content if content is not None else ""))
            continue
        if role == "user":
            out.append(HumanMessage(content=content if content is not None else ""))
            continue
        if role == "tool":
            out.append(
                ToolMessage(
                    content=str(content or ""),
                    tool_call_id=str(item.get("tool_call_id") or ""),
                )
            )
            continue
        if role == "assistant":
            tcs = item.get("tool_calls")
            if isinstance(tcs, list) and tcs:
                parsed: list[dict[str, Any]] = []
                for tc in tcs:
                    if not isinstance(tc, dict):
                        continue
                    fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
                    args_raw = fn.get("arguments") if fn else tc.get("args")
                    if isinstance(args_raw, dict):
                        args = args_raw
                    else:
                        try:
                            args = json.loads(args_raw or "{}")
                        except Exception:
                            args = {"_raw": str(args_raw or "")}
                    name = str((fn or {}).get("name") or tc.get("name") or "")
                    if not name:
                        continue
                    parsed.append(
                        {
                            "id": str(tc.get("id") or ""),
                            "name": name,
                            "args": args,
                        }
                    )
                out.append(
                    AIMessage(
                        content=content if content is not None else "",
                        tool_calls=parsed,
                    )
                )
            else:
                out.append(AIMessage(content=content if content is not None else ""))
            continue
    return out


def thinking_text_from_chunk(chunk: Any) -> str | None:
    """Extract streaming reasoning delta from an AIMessageChunk."""
    ak = getattr(chunk, "additional_kwargs", None) or {}
    if not isinstance(ak, dict):
        return None
    for key in ("reasoning_content", "reasoning"):
        val = ak.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def content_text_from_chunk(chunk: Any) -> str | None:
    """Plain string content from a stream chunk (ignore multimodal lists)."""
    content = getattr(chunk, "content", None)
    if isinstance(content, str) and content:
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str) and block:
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                t = block.get("text")
                if isinstance(t, str) and t:
                    parts.append(t)
        joined = "".join(parts)
        return joined or None
    return None


def usage_blob_from_chunk(chunk: Any) -> dict[str, Any] | None:
    """Normalize LangChain usage_metadata → OpenAI-shaped usage dict."""
    um = getattr(chunk, "usage_metadata", None)
    if not um:
        return None
    if isinstance(um, dict):
        inp = um.get("input_tokens")
        out = um.get("output_tokens")
        tot = um.get("total_tokens")
    else:
        inp = getattr(um, "input_tokens", None)
        out = getattr(um, "output_tokens", None)
        tot = getattr(um, "total_tokens", None)
    blob: dict[str, Any] = {}
    if inp is not None:
        blob["prompt_tokens"] = int(inp)
    if out is not None:
        blob["completion_tokens"] = int(out)
    if tot is not None:
        blob["total_tokens"] = int(tot)
    elif blob:
        blob["total_tokens"] = int(blob.get("prompt_tokens") or 0) + int(
            blob.get("completion_tokens") or 0
        )
    return blob or None


def llm_error_detail(exc: BaseException) -> str:
    """Best-effort provider error body for retry / vision heuristics."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        try:
            return json.dumps(body, ensure_ascii=False)[:800]
        except Exception:
            pass
    if isinstance(body, str) and body.strip():
        return body[:800]
    msg = getattr(exc, "message", None)
    if isinstance(msg, str) and msg.strip():
        return msg[:800]
    return str(exc)[:800]
