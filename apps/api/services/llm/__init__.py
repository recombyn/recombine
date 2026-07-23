"""Domestic OpenAI-compatible LLM router (Doubao Ark / DeepSeek)."""

from __future__ import annotations

from dataclasses import dataclass

from config.settings import settings


@dataclass(frozen=True)
class LlmEndpoint:
    base_url: str
    api_key: str
    model_id: str
    provider: str


# Default OpenAI-compatible bases for CN providers.
PROVIDER_BASE_URLS: dict[str, str] = {
    "doubao": "https://ark.cn-beijing.volces.com/api/v3",
    "deepseek": "https://api.deepseek.com",
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
        "id": "glm-5-2",
        "label": "GLM-5.2",
        "provider": "doubao",
        "kind": "text",
        "api_model": "glm-5-2-260617",
        "max_attachments": 8,
        "thinking": False,
    },
    {
        "id": "kimi-k2-thinking",
        "label": "Kimi K2 Thinking",
        "provider": "doubao",
        "kind": "text",
        "api_model": "kimi-k2-thinking-251104",
        "max_attachments": 8,
        "thinking": True,
    },
    {
        "id": "doubao-seed-2-0-mini",
        "label": "豆包 Seed 2.0 Mini",
        "provider": "doubao",
        "kind": "text",
        "api_model": "doubao-seed-2-0-mini-260428",
        "max_attachments": 8,
        "thinking": False,
    },
    {
        "id": "doubao-seed-2-1-pro",
        "label": "豆包 Seed 2.1 Pro",
        "provider": "doubao",
        "kind": "text",
        "api_model": "doubao-seed-2-1-pro-260628",
        "max_attachments": 16,
        "thinking": False,
    },
    {
        "id": "doubao-seed-2-1-turbo",
        "label": "豆包 Seed 2.1 Turbo",
        "provider": "doubao",
        "kind": "text",
        "api_model": "doubao-seed-2-1-turbo-260628",
        "max_attachments": 16,
        "thinking": False,
    },
]

_ARK_IMAGE_MODELS: list[dict] = [
    {
        "id": "doubao-seedream-5-0-pro",
        "label": "豆包 Seedream 5.0 Pro",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-5-0-pro-260628",
        "max_attachments": 14,
    },
    {
        "id": "doubao-seedream-5-0-lite",
        "label": "豆包 Seedream 5.0 Lite",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-5-0-260128",
        "max_attachments": 14,
    },
    {
        "id": "doubao-seedream-4-5",
        "label": "豆包 Seedream 4.5",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-4-5-251128",
        "max_attachments": 14,
    },
    {
        "id": "doubao-seedream-4-0",
        "label": "豆包 Seedream 4.0",
        "provider": "doubao",
        "kind": "image",
        "api_model": "doubao-seedream-4-0-250828",
        "max_attachments": 14,
    },
]


def _api_key_for(provider: str) -> str:
    """Unified LLM_API_KEY first; optional per-provider fallbacks."""
    unified = (settings.llm_api_key or "").strip()
    if unified:
        return unified
    per = {
        "doubao": settings.doubao_api_key,
        "deepseek": settings.deepseek_api_key,
    }
    return (per.get(provider) or "").strip()


def _has_doubao_key() -> bool:
    if (settings.doubao_api_key or "").strip():
        return True
    unified = (settings.llm_api_key or "").strip()
    if not unified:
        return False
    provider = (settings.llm_provider or "doubao").strip().lower()
    return provider != "deepseek"


def _has_deepseek_key() -> bool:
    if (settings.deepseek_api_key or "").strip():
        return True
    unified = (settings.llm_api_key or "").strip()
    if not unified:
        return False
    return (settings.llm_provider or "").strip().lower() == "deepseek"


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
        models = [
            {
                "id": m["id"],
                "label": m["label"],
                "description": m.get("description"),
                "provider": m.get("provider") or "doubao",
                "kind": "image",
                "api_model": m.get("api_model") or m.get("apiModel") or m["id"],
                "iconKey": m.get("iconKey"),
                "iconUrl": m.get("iconUrl"),
                "price": m.get("price"),
                "max_attachments": int(m.get("max_attachments") or m.get("maxAttachments") or 14),
            }
            for m in catalog
        ]
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
    override = (settings.llm_base_url or "").strip()
    if override:
        return override.rstrip("/")
    return (PROVIDER_BASE_URLS.get(provider) or PROVIDER_BASE_URLS["doubao"]).rstrip("/")


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

    # provider/model form, e.g. doubao/ep-xxxx
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
    Resolve an OpenAI-compatible chat endpoint for domestic providers.

    Configure via apps/api/.env:
      DOUBAO_API_KEY=...
      # or LLM_API_KEY=...
      LLM_DEFAULT_MODEL=doubao-seed-2-0-mini
    """
    provider, model_id = resolve_provider(model_string)
    api_key = _api_key_for(provider)
    if not api_key:
        raise RuntimeError(
            "No LLM API key configured. Set DOUBAO_API_KEY or LLM_API_KEY "
            "(or DEEPSEEK_API_KEY for direct DeepSeek) in apps/api/.env"
        )

    return LlmEndpoint(
        base_url=_base_url_for(provider),
        api_key=api_key,
        model_id=model_id,
        provider=provider,
    )
