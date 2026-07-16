"""Domestic OpenAI-compatible LLM router (Doubao / DeepSeek / Qwen / Moonshot)."""

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
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "moonshot": "https://api.moonshot.cn/v1",
}


def list_llm_models() -> list[dict]:
    """Static text catalog for the agent model picker."""
    return [
        {
            "id": "doubao-seed-1-6-251015",
            "label": "豆包 Seed 1.6",
            "provider": "doubao",
            "kind": "text",
        },
        {
            "id": "doubao-1-5-pro-32k-250115",
            "label": "豆包 1.5 Pro",
            "provider": "doubao",
            "kind": "text",
        },
        {
            "id": "deepseek-chat",
            "label": "DeepSeek Chat",
            "provider": "deepseek",
            "kind": "text",
        },
        {
            "id": "deepseek-reasoner",
            "label": "DeepSeek Reasoner",
            "provider": "deepseek",
            "kind": "text",
        },
        {
            "id": "qwen-plus",
            "label": "通义千问 Plus",
            "provider": "qwen",
            "kind": "text",
        },
        {
            "id": "qwen-turbo",
            "label": "通义千问 Turbo",
            "provider": "qwen",
            "kind": "text",
        },
        {
            "id": "moonshot-v1-auto",
            "label": "Kimi (Moonshot)",
            "provider": "moonshot",
            "kind": "text",
        },
    ]


def list_image_models() -> list[dict]:
    """Image models — wire domestic image APIs later; keep catalog empty for now."""
    return []


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
        "qwen": settings.qwen_api_key,
        "moonshot": settings.moonshot_api_key,
    }
    return (per.get(provider) or "").strip()


def _base_url_for(provider: str) -> str:
    override = (settings.llm_base_url or "").strip()
    if override:
        return override.rstrip("/")
    return (PROVIDER_BASE_URLS.get(provider) or PROVIDER_BASE_URLS["doubao"]).rstrip("/")


def resolve_provider(model_string: str | None) -> tuple[str, str]:
    """Return (provider, model_id) for a catalog id or raw model string."""
    model = (model_string or settings.llm_default_model or "doubao-seed-1-6-251015").strip()
    catalog = {m["id"]: m for m in list_all_models()}
    meta = catalog.get(model)
    if meta:
        return str(meta.get("provider") or settings.llm_provider or "doubao"), model

    # provider/model form, e.g. doubao/ep-xxxx
    if "/" in model:
        prefix, rest = model.split("/", 1)
        if prefix in PROVIDER_BASE_URLS and rest:
            return prefix, rest

    provider = (settings.llm_provider or "doubao").strip().lower()
    if provider not in PROVIDER_BASE_URLS:
        provider = "doubao"
    return provider, model


def get_llm_endpoint(model_string: str | None = None) -> LlmEndpoint:
    """
    Resolve an OpenAI-compatible chat endpoint for domestic providers.

    Configure via apps/api/.env:
      LLM_API_KEY=...
      LLM_PROVIDER=doubao
      LLM_DEFAULT_MODEL=doubao-seed-1-6-251015
      # optional: LLM_BASE_URL=...  DOUBAO_API_KEY=... etc.
    """
    provider, model_id = resolve_provider(model_string)
    api_key = _api_key_for(provider)
    if not api_key:
        raise RuntimeError(
            "No LLM API key configured. Set LLM_API_KEY (or DOUBAO_API_KEY / "
            "DEEPSEEK_API_KEY / QWEN_API_KEY / MOONSHOT_API_KEY) in apps/api/.env"
        )

    return LlmEndpoint(
        base_url=_base_url_for(provider),
        api_key=api_key,
        model_id=model_id,
        provider=provider,
    )
