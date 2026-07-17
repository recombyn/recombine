"""Domestic OpenAI-compatible LLM router (Doubao / DeepSeek)."""

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


def list_llm_models() -> list[dict]:
    """
    Catalog: DeepSeek always; Doubao only when Ark endpoint/model is configured.

    Volcengine Ark often requires an inference endpoint id (ep-xxxx) or an
    activated model id. Set DOUBAO_SEED_MODEL / DOUBAO_PRO_MODEL in apps/api/.env.
    """
    models: list[dict] = []

    seed = (settings.doubao_seed_model or "").strip()
    if seed:
        models.append(
            {
                "id": "doubao-seed",
                "label": "豆包 Seed 1.6",
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
                "label": "豆包 1.5 Pro",
                "provider": "doubao",
                "kind": "text",
                "api_model": pro,
                "max_attachments": 8,
            }
        )

    models.extend(
        [
            {
                "id": "deepseek-chat",
                "label": "DeepSeek Chat",
                "provider": "deepseek",
                "kind": "text",
                "max_attachments": 4,
            },
            {
                "id": "deepseek-reasoner",
                "label": "DeepSeek Reasoner",
                "provider": "deepseek",
                "kind": "text",
                "max_attachments": 4,
            },
        ]
    )
    return models


def list_image_models() -> list[dict]:
    """Doubao Seedream (Ark images/generations)."""
    mid = (settings.image_default_model or "doubao-seedream-4-0-250828").strip()
    return [
        {
            "id": mid,
            "label": "豆包 Seedream 4.0",
            "provider": "doubao",
            "kind": "image",
            # Ark accepts model name or inference endpoint id.
            "api_model": mid,
            # Seedream 4.x: up to 14 reference images (input + output ≤ 15).
            "max_attachments": 14,
        },
    ]


def list_all_models() -> list[dict]:
    return [*list_llm_models(), *list_image_models()]


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


def _base_url_for(provider: str) -> str:
    override = (settings.llm_base_url or "").strip()
    if override:
        return override.rstrip("/")
    return (PROVIDER_BASE_URLS.get(provider) or PROVIDER_BASE_URLS["doubao"]).rstrip("/")


def resolve_provider(model_string: str | None) -> tuple[str, str]:
    """Return (provider, api_model_id) for a catalog id or raw model string."""
    default = (settings.llm_default_model or "deepseek-reasoner").strip()
    model = (model_string or default).strip()
    catalog = {m["id"]: m for m in list_all_models()}
    meta = catalog.get(model)
    if meta:
        provider = str(meta.get("provider") or settings.llm_provider or "doubao")
        return provider, str(meta.get("api_model") or meta["id"])

    # Legacy catalog ids from older clients
    legacy = {
        "doubao-seed-1-6-251015": (settings.doubao_seed_model or "").strip(),
        "doubao-1-5-pro-32k-250115": (settings.doubao_pro_model or "").strip(),
    }
    if model in legacy:
        api = legacy[model] or model
        return "doubao", api

    # provider/model form, e.g. doubao/ep-xxxx
    if "/" in model:
        prefix, rest = model.split("/", 1)
        if prefix in PROVIDER_BASE_URLS and rest:
            return prefix, rest

    provider = (settings.llm_provider or "deepseek").strip().lower()
    if provider not in PROVIDER_BASE_URLS:
        provider = "deepseek"
    return provider, model


def get_llm_endpoint(model_string: str | None = None) -> LlmEndpoint:
    """
    Resolve an OpenAI-compatible chat endpoint for domestic providers.

    Configure via apps/api/.env:
      LLM_API_KEY=...
      LLM_PROVIDER=deepseek
      LLM_DEFAULT_MODEL=deepseek-chat
      # Doubao Ark — use inference endpoint id (ep-xxxx) or activated model id:
      # DOUBAO_API_KEY=...
      # DOUBAO_SEED_MODEL=ep-xxxx
      # DOUBAO_PRO_MODEL=ep-yyyy
    """
    provider, model_id = resolve_provider(model_string)
    api_key = _api_key_for(provider)
    if not api_key:
        raise RuntimeError(
            "No LLM API key configured. Set LLM_API_KEY (or DOUBAO_API_KEY / "
            "DEEPSEEK_API_KEY) in apps/api/.env"
        )

    return LlmEndpoint(
        base_url=_base_url_for(provider),
        api_key=api_key,
        model_id=model_id,
        provider=provider,
    )
