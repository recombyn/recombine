"""LLM model catalog - DB-backed with seed fallback."""
from __future__ import annotations

import json
import time
from typing import Any

from services.db import connect, init_schema

# Where a model may appear in Agent route slots / admin model routes.
# - text: simple / medium / complex
# - vision: multimodal slot; also allowed in text slots ("usable anywhere" except image)
# - image: image-gen slot only
REFERENCE_TYPES = ('text', 'vision', 'image')

# Official Ark Image Gen API size contracts (docs/82379/1541523).
# IMAGE_LIMIT_PRESETS = seed / admin fill templates only.
# Runtime reads each model's own catalog image_limits (full JSON).
_SEEDREAM_2K_LITE = {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2848x1600',
    '9:16': '1600x2848',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
}
_SEEDREAM_4K = {
    '1:1': '4096x4096',
    '4:3': '4704x3520',
    '3:4': '3520x4704',
    '16:9': '5504x3040',
    '9:16': '3040x5504',
    '3:2': '4992x3328',
    '2:3': '3328x4992',
    '21:9': '6240x2656',
}

IMAGE_LIMIT_PRESETS: dict[str, dict[str, Any]] = {
    # Seedream 5.0 pro — 1K/2K; WxH max ≈ 2048²×1.1025
    'seedream_5_pro': {
        'transport': 'doubao',
        'min_pixels': 1280 * 720,
        'max_pixels': int(2048 * 2048 * 1.1025),
        'resolutions': ['1K', '2K'],
        'default_resolution': '2K',
        'supports_output_format': True,
        'size_tables': {
            '1K': {
                '1:1': '1024x1024',
                '4:3': '1152x864',
                '3:4': '864x1152',
                '16:9': '1424x800',
                '9:16': '800x1424',
                '3:2': '1248x832',
                '2:3': '832x1248',
                '21:9': '1568x672',
            },
            '2K': {
                '1:1': '2048x2048',
                '4:3': '2368x1776',
                '3:4': '1776x2368',
                '16:9': '2816x1584',
                '9:16': '1584x2816',
                '3:2': '2496x1664',
                '2:3': '1664x2496',
                '21:9': '3136x1344',
            },
        },
    },
    # Seedream 5.0 lite — 2K/3K/4K; min 2560×1440
    'seedream_5_lite': {
        'transport': 'doubao',
        'min_pixels': 2560 * 1440,
        'max_pixels': 4096 * 4096,
        'resolutions': ['2K', '3K', '4K'],
        'default_resolution': '2K',
        'supports_output_format': True,
        'size_tables': {
            '2K': dict(_SEEDREAM_2K_LITE),
            '3K': {
                '1:1': '3072x3072',
                '4:3': '3456x2592',
                '3:4': '2592x3456',
                '16:9': '4096x2304',
                '9:16': '2304x4096',
                '3:2': '3744x2496',
                '2:3': '2496x3744',
                '21:9': '4704x2016',
            },
            '4K': dict(_SEEDREAM_4K),
        },
    },
    # Seedream 4.5 — 2K/4K; same pixel floor as lite
    'seedream_4_5': {
        'transport': 'doubao',
        'min_pixels': 2560 * 1440,
        'max_pixels': 4096 * 4096,
        'resolutions': ['2K', '4K'],
        'default_resolution': '2K',
        'supports_output_format': False,
        'size_tables': {
            '2K': dict(_SEEDREAM_2K_LITE),
            '4K': dict(_SEEDREAM_4K),
        },
    },
    # Seedream 4.0 — 1K/2K/4K; min 1280×720
    'seedream_4_0': {
        'transport': 'doubao',
        'min_pixels': 1280 * 720,
        'max_pixels': 4096 * 4096,
        'resolutions': ['1K', '2K', '4K'],
        'default_resolution': '2K',
        'supports_output_format': False,
        'size_tables': {
            '1K': {
                '1:1': '1024x1024',
                '4:3': '1152x864',
                '3:4': '864x1152',
                '16:9': '1280x720',
                '9:16': '720x1280',
                '3:2': '1248x832',
                '2:3': '832x1248',
                '21:9': '1512x648',
            },
            '2K': dict(_SEEDREAM_2K_LITE),
            '4K': dict(_SEEDREAM_4K),
        },
    },
    # OpenRouter Images API — resolution + aspect_ratio (no WxH pixel floor).
    # Docs: https://openrouter.ai/docs (Image Generation / supported_parameters).
    'openrouter_image': {
        'transport': 'openrouter',
        'resolutions': ['512', '1K', '2K', '4K'],
        'default_resolution': '2K',
        'aspect_ratios': [
            '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3',
            '4:5', '5:4', '1:2', '2:1', '21:9', '9:21', 'auto',
        ],
        'supports_quality': True,
        'supports_output_format': True,
    },
    # Gemini Nano Banana via OpenRouter chat/completions + modalities.
    'openrouter_gemini_image': {
        'transport': 'openrouter_chat',
        'resolutions': ['1K', '2K', '4K'],
        'default_resolution': '2K',
        'aspect_ratios': [
            '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'auto',
        ],
        'supports_quality': False,
        'supports_output_format': False,
    },
    # OpenAI GPT Image family via OpenRouter /images.
    'openrouter_gpt_image': {
        'transport': 'openrouter',
        'resolutions': ['1K', '2K', '4K'],
        'default_resolution': '2K',
        'aspect_ratios': [
            '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', 'auto',
        ],
        'supports_quality': True,
        'supports_output_format': True,
    },
}

_SEED = [
    {
        'id': 'deepseek-v4-flash',
        'label': 'DeepSeek V4 Flash',
        'description': '对话与画布 Agent，可用工具直接改画布',
        'provider': 'doubao',
        'kind': 'text',
        'reference_types': ['text'],
        'api_model': 'deepseek-v4-flash-260425',
        'icon_key': 'deepseek',
        # Ark docs 1544106：输入 1 / 输出 2 元/百万token
        'price': '1',
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 10,
    },
    {
        'id': 'deepseek-v4-pro',
        'label': 'DeepSeek V4 Pro',
        'description': '更强推理与复杂 Agent 任务（方舟 DeepSeek V4 Pro）',
        'provider': 'doubao',
        'kind': 'text',
        'reference_types': ['text'],
        'api_model': 'deepseek-v4-pro-260425',
        'icon_key': 'deepseek',
        # Ark：输入 12 / 输出 24
        'price': '12',
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 11,
    },
    {
        'id': 'doubao-seed-2-0-mini',
        'label': 'Seed 2.0 Mini',
        'description': '对话模型，适合文案、排版与创意协作（不支持看图）',
        'provider': 'doubao',
        'kind': 'text',
        'reference_types': ['text'],
        'api_model': 'doubao-seed-2-0-mini-260428',
        'icon_key': 'doubao',
        # Ark：输入 [0,32] 档 0.2 / 输出 2.0
        'price': '0.2',
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 20,
    },
    {
        'id': 'doubao-seed-2-1-pro',
        'label': 'Seed 2.1 Pro',
        'description': '多模态对话（支持看图）；美学参考 / 用户附图时优先',
        'provider': 'doubao',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'doubao-seed-2-1-pro-260628',
        'icon_key': 'doubao',
        # Ark：输入 6 / 输出 30
        'price': '6',
        'max_attachments': 16,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 15,
    },
    {
        'id': 'doubao-seed-2-1-turbo',
        'label': 'Seed 2.1 Turbo',
        'description': '多模态对话（支持看图）；更快更省，适合附图轻量步骤',
        'provider': 'doubao',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'doubao-seed-2-1-turbo-260628',
        'icon_key': 'doubao',
        # Ark：输入 3 / 输出 15
        'price': '3',
        'max_attachments': 16,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 16,
    },
    {
        'id': 'doubao-seedream-5-0-pro',
        'label': 'Seedream 5.0 Pro',
        'description': (
            '旗舰画质与细节：成片级配图、精细编辑；'
            '≤236万像素 ¥0.30/张，更高像素 ¥0.60/张'
        ),
        'provider': 'doubao',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'doubao-seedream-5-0-pro-260628',
        'icon_key': 'doubao',
        # Ark：输出 ≤236万像素 0.30；>236万 0.60（目录取常用档）
        'price': '0.30',
        # Docs: Seedream 5.0 pro ≤ 10 refs
        'max_attachments': 10,
        'image_limit_preset': 'seedream_5_pro',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 110,
    },
    {
        'id': 'doubao-seedream-5-0-lite',
        'label': 'Seedream 5.0 Lite',
        'description': '更快更省的 5.0 轻量版：草稿、快速试错与日常配图（¥0.22/张）',
        'provider': 'doubao',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'doubao-seedream-5-0-260128',
        'icon_key': 'doubao',
        'price': '0.22',
        'max_attachments': 14,
        'image_limit_preset': 'seedream_5_lite',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 120,
    },
    {
        'id': 'doubao-seedream-4-5',
        'label': 'Seedream 4.5',
        'description': '画质与速度均衡：通用文生图 / 图生图，适合多数创作场景（¥0.25/张）',
        'provider': 'doubao',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'doubao-seedream-4-5-251128',
        'icon_key': 'doubao',
        'price': '0.25',
        'max_attachments': 14,
        'image_limit_preset': 'seedream_4_5',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 130,
    },
    {
        'id': 'doubao-seedream-4-0',
        'label': 'Seedream 4.0',
        'description': '低成本稳定出图：批量生成与日常配图首选（¥0.20/张）',
        'provider': 'doubao',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'doubao-seedream-4-0-250828',
        'icon_key': 'doubao',
        'price': '0.20',
        'max_attachments': 14,
        'image_limit_preset': 'seedream_4_0',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 140,
    },
    # —— OpenRouter (chat / vision / image) ——
    {
        'id': 'or-nano-banana-pro',
        'label': 'Nano Banana Pro',
        'description': (
            'Google Gemini 3 Pro Image：专业级生图与编辑，强文字渲染、多图融合、'
            '身份一致与 2K/4K 输出（OpenRouter）'
        ),
        'provider': 'openrouter',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'google/gemini-3-pro-image',
        'icon_key': 'gemini',
        'price': '0.50',
        'max_attachments': 14,
        'image_limit_preset': 'openrouter_gemini_image',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 200,
    },
    {
        'id': 'or-nano-banana-2',
        'label': 'Nano Banana 2',
        'description': (
            'Google Gemini 3.1 Flash Image：Pro 级画质、Flash 速度，'
            '适合快速迭代生图与编辑（OpenRouter）'
        ),
        'provider': 'openrouter',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'google/gemini-3.1-flash-image',
        'icon_key': 'gemini',
        'price': '0.30',
        'max_attachments': 14,
        'image_limit_preset': 'openrouter_gemini_image',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 205,
    },
    {
        'id': 'or-gpt-image-2',
        'label': 'GPT Image 2',
        'description': 'OpenAI 最新生图模型，高保真生成与编辑（OpenRouter Images API）',
        'provider': 'openrouter',
        'kind': 'image',
        'reference_types': ['image'],
        'api_model': 'openai/gpt-image-2',
        'icon_key': 'openai',
        'price': '0.50',
        'max_attachments': 16,
        'image_limit_preset': 'openrouter_gpt_image',
        'thinking': 0,
        'enabled': 1,
        'sort_order': 210,
    },
    {
        'id': 'or-gemini-3-flash-preview',
        'label': 'Gemini 3 Flash Preview',
        'description': '高速多模态 Agent / 多轮对话；近 Pro 推理，更低延迟（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'google/gemini-3-flash-preview',
        'icon_key': 'gemini',
        'price': '3.6',
        'max_attachments': 16,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 240,
    },
    {
        'id': 'or-gemini-3-5-flash',
        'label': 'Gemini 3.5 Flash',
        'description': '高效多模态：编程与并行 Agent，Flash 级成本（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'google/gemini-3.5-flash',
        'icon_key': 'gemini',
        'price': '10.8',
        'max_attachments': 16,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 250,
    },
    {
        'id': 'or-claude-sonnet-5',
        'label': 'Claude Sonnet 5',
        'description': 'Anthropic Sonnet 旗舰：编码、Agent、专业工作流（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'anthropic/claude-sonnet-5',
        'icon_key': 'claude',
        'price': '14.4',
        'max_attachments': 16,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 260,
    },
    {
        'id': 'or-claude-opus-4-7',
        'label': 'Claude Opus 4.7',
        'description': '长程异步 Agent / 复杂多步任务与知识工作（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'anthropic/claude-opus-4.7',
        'icon_key': 'claude',
        'price': '36',
        'max_attachments': 16,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 270,
    },
    {
        'id': 'or-claude-sonnet-4-6',
        'label': 'Claude Sonnet 4.6',
        'description': '强力 Sonnet：迭代开发、代码库导航与文档创作（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'anthropic/claude-sonnet-4.6',
        'icon_key': 'claude',
        'price': '21.6',
        'max_attachments': 16,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 280,
    },
    {
        'id': 'or-gpt-5-6-sol',
        'label': 'GPT-5.6 Sol',
        'description': 'OpenAI GPT-5.6 旗舰：复杂推理、编码与长程 Agent（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text', 'vision'],
        'api_model': 'openai/gpt-5.6-sol',
        'icon_key': 'openai',
        'price': '36',
        'max_attachments': 16,
        'thinking': 1,
        'enabled': 1,
        'sort_order': 290,
    },
    {
        'id': 'or-gpt-5-6-luna',
        'label': 'GPT-5.6 Luna',
        'description': 'GPT-5.6 高速高性价比：聊天、分类与轻量 Agent（OpenRouter）',
        'provider': 'openrouter',
        'kind': 'text',
        'reference_types': ['text'],
        'api_model': 'openai/gpt-5.6-luna',
        'icon_key': 'openai',
        'price': '7.2',
        'max_attachments': 8,
        'thinking': 0,
        'enabled': 1,
        'sort_order': 300,
    },
]


def _normalize_reference_types(raw: Any, *, kind: str = 'text') -> list[str]:
    """Normalize admin/API payload into ordered unique reference types."""
    items: list[str] = []
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith('['):
            try:
                raw = json.loads(s)
            except Exception:
                raw = [p.strip() for p in s.split(',') if p.strip()]
        else:
            raw = [p.strip() for p in s.replace('|', ',').split(',') if p.strip()]
    if isinstance(raw, (list, tuple, set)):
        for x in raw:
            t = str(x or '').strip().lower()
            if t in ('multimodal', 'multi'):
                t = 'vision'
            if t in REFERENCE_TYPES and t not in items:
                items.append(t)
    if items:
        return items
    # Defaults when unset
    if (kind or 'text').strip().lower() == 'image':
        return ['image']
    return ['text']


IMAGE_LIMIT_PRESET_LABELS: dict[str, str] = {
    'seedream_5_pro': 'Seedream 5.0 Pro（方舟官方）',
    'seedream_5_lite': 'Seedream 5.0 Lite（方舟官方）',
    'seedream_4_5': 'Seedream 4.5（方舟官方）',
    'seedream_4_0': 'Seedream 4.0（方舟官方）',
    'openrouter_image': 'OpenRouter 通用生图（Images API）',
    'openrouter_gemini_image': 'OpenRouter Gemini 生图（chat modalities）',
    'openrouter_gpt_image': 'OpenRouter GPT Image（Images API）',
}


def infer_image_limit_preset(
    model_id: str | None = None,
    api_model: str | None = None,
    *,
    provider: str | None = None,
) -> str | None:
    """Map catalog / Ark model ids → IMAGE_LIMIT_PRESETS key (Ark docs 1541523)."""
    blob = f'{model_id or ""} {api_model or ""}'.lower()
    prov = (provider or '').strip().lower()
    if 'seedream-5-0-pro' in blob or 'seedream_5_0_pro' in blob:
        return 'seedream_5_pro'
    if 'seedream-5-0-lite' in blob or 'seedream_5_0_lite' in blob:
        return 'seedream_5_lite'
    # Lite api_model is often `doubao-seedream-5-0-260128` (no "lite" token).
    if (
        ('seedream-5-0' in blob or 'seedream_5_0' in blob)
        and 'pro' not in blob
    ):
        return 'seedream_5_lite'
    if 'seedream-4-5' in blob or 'seedream_4_5' in blob:
        return 'seedream_4_5'
    if 'seedream-4-0' in blob or 'seedream_4_0' in blob:
        return 'seedream_4_0'
    if prov == 'openrouter' or 'openrouter' in blob or blob.strip().startswith('or-'):
        if 'gpt-image' in blob or 'gpt_image' in blob:
            return 'openrouter_gpt_image'
        if 'gemini' in blob or 'banana' in blob:
            return 'openrouter_gemini_image'
        if 'image' in blob:
            return 'openrouter_image'
    return None


def resolve_image_limits(raw: Any = None, *, preset: str | None = None) -> dict[str, Any] | None:
    """Normalize image_limits from inline dict, JSON string, or named preset."""
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except Exception:
            raw = None
    if isinstance(raw, dict) and raw:
        nested = str(raw.get('preset') or '').strip()
        # Thin pointer `{ "preset": "seedream_5_lite" }` → expand full contract.
        if nested in IMAGE_LIMIT_PRESETS and not any(
            k in raw for k in ('min_pixels', 'max_pixels', 'resolutions', 'size_tables')
        ):
            out = dict(IMAGE_LIMIT_PRESETS[nested])
            out['preset'] = nested
            return out
        out: dict[str, Any] = {}
        if nested:
            out['preset'] = nested
        for key in ('min_pixels', 'max_pixels'):
            if raw.get(key) is not None:
                try:
                    out[key] = int(raw[key])
                except (TypeError, ValueError):
                    pass
        res = raw.get('resolutions')
        if isinstance(res, list):
            out['resolutions'] = [
                str(x).strip().upper() for x in res if str(x).strip()
            ]
        dr = raw.get('default_resolution') or raw.get('defaultResolution')
        if dr:
            out['default_resolution'] = str(dr).strip().upper()
        if 'supports_output_format' in raw:
            out['supports_output_format'] = bool(raw.get('supports_output_format'))
        if 'supports_quality' in raw:
            out['supports_quality'] = bool(raw.get('supports_quality'))
        transport = raw.get('transport')
        if transport:
            out['transport'] = str(transport).strip().lower()
        aspects = raw.get('aspect_ratios') or raw.get('aspectRatios')
        if isinstance(aspects, list):
            out['aspect_ratios'] = [
                str(x).strip() for x in aspects if str(x).strip()
            ]
        tables = raw.get('size_tables') or raw.get('sizeTables')
        if isinstance(tables, dict) and tables:
            cleaned: dict[str, dict[str, str]] = {}
            for rk, mapping in tables.items():
                if not isinstance(mapping, dict):
                    continue
                cleaned[str(rk).strip().upper()] = {
                    str(ak).strip(): str(av).strip()
                    for ak, av in mapping.items()
                    if str(ak).strip() and str(av).strip()
                }
            if cleaned:
                out['size_tables'] = cleaned
        # Expand from nested preset when row only stored a partial override.
        if nested in IMAGE_LIMIT_PRESETS:
            base = dict(IMAGE_LIMIT_PRESETS[nested])
            base.update(out)
            base['preset'] = nested
            return base
        return out or None
    key = (preset or '').strip()
    if key in IMAGE_LIMIT_PRESETS:
        out = dict(IMAGE_LIMIT_PRESETS[key])
        out['preset'] = key
        return out
    return None


def _image_limits_for_seed(m: dict[str, Any]) -> dict[str, Any] | None:
    preset = str(m.get('image_limit_preset') or '') or None
    if not preset:
        preset = infer_image_limit_preset(
            str(m.get('id') or ''),
            str(m.get('api_model') or ''),
            provider=str(m.get('provider') or ''),
        )
    return resolve_image_limits(m.get('image_limits'), preset=preset)


def _serialize_image_limits(limits: dict[str, Any] | None) -> str | None:
    if not limits:
        return None
    # Persist each model's full contract (not a shared preset pointer).
    out = {k: v for k, v in limits.items() if k != 'preset' and v is not None}
    if not out:
        return None
    return json.dumps(out, ensure_ascii=False, separators=(',', ':'))


def list_image_limit_presets() -> list[dict[str, Any]]:
    """Admin helper templates only — fill form once; each model stores its own limits."""
    items: list[dict[str, Any]] = []
    for key, label in IMAGE_LIMIT_PRESET_LABELS.items():
        limits = resolve_image_limits(preset=key)
        if not limits:
            continue
        # Strip preset id so templates don't re-bind models to a shared pointer.
        payload = {k: v for k, v in limits.items() if k != 'preset'}
        items.append({'id': key, 'label': label, 'imageLimits': payload})
    return items


def _serialize_reference_types(types: list[str]) -> str:
    return json.dumps(types, ensure_ascii=False)


def _parse_reference_types_cell(raw: Any, *, kind: str = 'text') -> list[str]:
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return _normalize_reference_types(None, kind=kind)
    return _normalize_reference_types(raw, kind=kind)


def _default_reference_types_for_seed(m: dict[str, Any]) -> list[str]:
    return _normalize_reference_types(m.get('reference_types'), kind=str(m.get('kind') or 'text'))


def _heuristic_vision_id(model_id: str) -> bool:
    ref = (model_id or '').strip().lower()
    if not ref or 'seedream' in ref:
        return False
    if 'mini' in ref or 'flash' in ref:
        return False
    if ref in ('doubao-seed-2-1-pro', 'doubao-seed-2-1-turbo'):
        return True
    return any(m in ref for m in ('vision', 'seed-2-1-pro', 'seed-2-1-turbo', 'seed-2.1-pro', 'seed-2.1-turbo'))


def ensure_llm_models_table(conn: Any, *, mysql: bool) -> None:
    text = 'LONGTEXT' if mysql else 'TEXT'
    if mysql:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS llm_models (
                id VARCHAR(128) PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                description {text},
                provider VARCHAR(64) NOT NULL DEFAULT 'doubao',
                kind VARCHAR(16) NOT NULL DEFAULT 'text',
                api_model VARCHAR(255) NOT NULL,
                icon_key VARCHAR(64),
                icon_url {text},
                price VARCHAR(255),
                max_attachments INTEGER NOT NULL DEFAULT 8,
                thinking TINYINT NOT NULL DEFAULT 0,
                enabled TINYINT NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 100,
                created_at DOUBLE NOT NULL,
                updated_at DOUBLE NOT NULL,
                KEY idx_llm_models_kind_sort (kind, sort_order, enabled)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
    else:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS llm_models (
                id VARCHAR(128) PRIMARY KEY,
                label VARCHAR(255) NOT NULL,
                description {text},
                provider VARCHAR(64) NOT NULL DEFAULT 'doubao',
                kind VARCHAR(16) NOT NULL DEFAULT 'text',
                api_model VARCHAR(255) NOT NULL,
                icon_key VARCHAR(64),
                icon_url {text},
                price VARCHAR(255),
                max_attachments INTEGER NOT NULL DEFAULT 8,
                thinking INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 100,
                created_at DOUBLE NOT NULL,
                updated_at DOUBLE NOT NULL
            )
            """
        )
        conn.execute(
            'CREATE INDEX IF NOT EXISTS idx_llm_models_kind_sort '
            'ON llm_models(kind, sort_order, enabled)'
        )
    _ensure_price_column(conn, mysql=mysql)
    _ensure_reference_types_column(conn, mysql=mysql)
    _ensure_image_limits_column(conn, mysql=mysql)
    _ensure_price_meta_column(conn, mysql=mysql)
    _ensure_removed_models_table(conn, mysql=mysql)
    conn.commit()
    _ensure_seed_models(conn)
    try:
        apply_ark_reference_prices(conn)
        conn.commit()
    except Exception:
        pass
    _retire_direct_deepseek_models(conn)
    _drop_retired_seed_models(conn)


def _ensure_removed_models_table(conn: Any, *, mysql: bool) -> None:
    """Tombstones for seed models deleted in admin — prevents auto re-insert."""
    if mysql:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_models_removed (
                id VARCHAR(128) PRIMARY KEY,
                removed_at DOUBLE NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
    else:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_models_removed (
                id VARCHAR(128) PRIMARY KEY,
                removed_at DOUBLE NOT NULL
            )
            """
        )


def _ensure_price_column(conn: Any, *, mysql: bool) -> None:
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'llm_models'
              AND COLUMN_NAME = 'price'
            """
        ).fetchone()
        if int((row or {}).get('c') or 0) == 0:
            conn.execute('ALTER TABLE llm_models ADD COLUMN price VARCHAR(255) NULL')
    else:
        cols = {str(r['name']) for r in conn.execute('PRAGMA table_info(llm_models)').fetchall()}
        if 'price' not in cols:
            conn.execute('ALTER TABLE llm_models ADD COLUMN price VARCHAR(255)')


def apply_ark_reference_prices(
    conn: Any | None = None,
    *,
    only_empty: bool = True,
) -> dict[str, Any]:
    """Write curated Ark docs prices into catalog rows (docs 82379/1544106).

    By default only fills empty ``price`` (boot-safe). Pass ``only_empty=False``
    for an explicit Admin sync that may overwrite.
    """
    from services.llm.ark_prices import ARK_REFERENCE_PRICES

    now = time.time()
    updated: list[str] = []
    skipped: list[str] = []

    def _run(c: Any) -> None:
        has_meta = True
        try:
            cols = {str(r['name']) for r in c.execute('PRAGMA table_info(llm_models)').fetchall()}
            has_meta = 'price_meta' in cols
        except Exception:
            # MySQL / drivers without PRAGMA — assume column exists after migrate.
            has_meta = True
        for mid, spec in ARK_REFERENCE_PRICES.items():
            row = c.execute(
                'SELECT id, price FROM llm_models WHERE id = ?',
                (mid,),
            ).fetchone()
            if not row:
                skipped.append(mid)
                continue
            try:
                cur_price = str(row['price'] or '').strip()
            except Exception:
                cur_price = ''
            if only_empty and cur_price:
                skipped.append(mid)
                continue
            price = str(spec.get('price') or '').strip()
            meta = spec.get('price_meta') if isinstance(spec.get('price_meta'), dict) else {}
            meta_json = json.dumps(
                {**meta, 'synced_at': int(now)},
                ensure_ascii=False,
                separators=(',', ':'),
            )
            if has_meta:
                c.execute(
                    """
                    UPDATE llm_models
                    SET price = ?, price_meta = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (price, meta_json, now, mid),
                )
            else:
                c.execute(
                    """
                    UPDATE llm_models
                    SET price = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (price, now, mid),
                )
            updated.append(mid)

    if conn is not None:
        _run(conn)
        return {
            'ok': True,
            'updated': updated,
            'skipped': skipped,
            'updated_count': len(updated),
            'only_empty': only_empty,
        }

    init_schema()
    with connect() as c:
        _run(c)
        c.commit()
    return {
        'ok': True,
        'updated': updated,
        'skipped': skipped,
        'updated_count': len(updated),
        'source': 'ark_docs',
        'only_empty': only_empty,
    }


def _ensure_image_limits_column(conn: Any, *, mysql: bool) -> None:
    text = 'LONGTEXT' if mysql else 'TEXT'
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'llm_models'
              AND COLUMN_NAME = 'image_limits'
            """
        ).fetchone()
        if int((row or {}).get('c') or 0) == 0:
            conn.execute(f'ALTER TABLE llm_models ADD COLUMN image_limits {text} NULL')
    else:
        cols = {str(r['name']) for r in conn.execute('PRAGMA table_info(llm_models)').fetchall()}
        if 'image_limits' not in cols:
            conn.execute('ALTER TABLE llm_models ADD COLUMN image_limits TEXT')


def _ensure_price_meta_column(conn: Any, *, mysql: bool) -> None:
    text = 'LONGTEXT' if mysql else 'TEXT'
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'llm_models'
              AND COLUMN_NAME = 'price_meta'
            """
        ).fetchone()
        if int((row or {}).get('c') or 0) == 0:
            conn.execute(f'ALTER TABLE llm_models ADD COLUMN price_meta {text} NULL')
    else:
        cols = {str(r['name']) for r in conn.execute('PRAGMA table_info(llm_models)').fetchall()}
        if 'price_meta' not in cols:
            conn.execute('ALTER TABLE llm_models ADD COLUMN price_meta TEXT')


def _parse_price_meta(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except Exception:
            return None
        return data if isinstance(data, dict) else None
    return None


def _ensure_reference_types_column(conn: Any, *, mysql: bool) -> None:
    if mysql:
        row = conn.execute(
            """
            SELECT COUNT(*) AS c FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'llm_models'
              AND COLUMN_NAME = 'reference_types'
            """
        ).fetchone()
        if int((row or {}).get('c') or 0) == 0:
            conn.execute('ALTER TABLE llm_models ADD COLUMN reference_types TEXT NULL')
    else:
        cols = {str(r['name']) for r in conn.execute('PRAGMA table_info(llm_models)').fetchall()}
        if 'reference_types' not in cols:
            conn.execute('ALTER TABLE llm_models ADD COLUMN reference_types TEXT')

    # Backfill empty cells only (admin edits stick).
    rows = conn.execute('SELECT id, kind, reference_types FROM llm_models').fetchall()
    for r in rows:
        raw = r['reference_types'] if 'reference_types' in r.keys() else None
        if raw is not None and str(raw).strip():
            continue
        mid = str(r['id'] or '')
        kind = str(r['kind'] or 'text')
        seed = next((m for m in _SEED if m['id'] == mid), None)
        if seed:
            types = _default_reference_types_for_seed(seed)
        elif kind == 'image':
            types = ['image']
        elif _heuristic_vision_id(mid):
            types = ['text', 'vision']
        else:
            types = ['text']
        conn.execute(
            'UPDATE llm_models SET reference_types = ? WHERE id = ?',
            (_serialize_reference_types(types), mid),
        )


_RETIRED_DIRECT_DEEPSEEK_IDS = ('deepseek-chat', 'deepseek-reasoner')

# Dropped from catalog permanently (admin delete kept getting re-seeded).
_DROPPED_SEED_MODEL_IDS = (
    'or-gpt-image-1',
    'or-gpt-image-1-mini',
    'kimi-k2-thinking',
    'glm-5-2',
)


def _retire_direct_deepseek_models(conn: Any) -> None:
    """Disable models that call DeepSeek API directly; routing uses Volcengine Ark only."""
    now = time.time()
    placeholders = ','.join('?' for _ in _RETIRED_DIRECT_DEEPSEEK_IDS)
    conn.execute(
        f"""
        UPDATE llm_models SET enabled = 0, updated_at = ?
        WHERE provider = 'deepseek' OR id IN ({placeholders})
        """,
        (now, *_RETIRED_DIRECT_DEEPSEEK_IDS),
    )
    conn.commit()


def _tombstone_removed_model(conn: Any, model_id: str, removed_at: float) -> None:
    """Record id in llm_models_removed (SQLite / MySQL / fallback)."""
    mid = (model_id or '').strip()
    if not mid:
        return
    try:
        conn.execute(
            """
            INSERT INTO llm_models_removed (id, removed_at) VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET removed_at = excluded.removed_at
            """,
            (mid, removed_at),
        )
    except Exception:
        try:
            conn.execute(
                """
                INSERT INTO llm_models_removed (id, removed_at) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE removed_at = VALUES(removed_at)
                """,
                (mid, removed_at),
            )
        except Exception:
            conn.execute('DELETE FROM llm_models_removed WHERE id = ?', (mid,))
            conn.execute(
                'INSERT INTO llm_models_removed (id, removed_at) VALUES (?, ?)',
                (mid, removed_at),
            )


def _drop_retired_seed_models(conn: Any) -> None:
    """Hard-remove dropped seed ids and tombstone so they cannot come back."""
    if not _DROPPED_SEED_MODEL_IDS:
        return
    now = time.time()
    placeholders = ','.join('?' for _ in _DROPPED_SEED_MODEL_IDS)
    conn.execute(
        f'DELETE FROM llm_models WHERE id IN ({placeholders})',
        _DROPPED_SEED_MODEL_IDS,
    )
    for mid in _DROPPED_SEED_MODEL_IDS:
        _tombstone_removed_model(conn, mid, now)
    conn.commit()


# Legacy seed blurbs that were kind-generic; refresh from current _SEED when still present.
_STALE_SEED_DESCRIPTIONS = frozenset({
    '高质量文生图 / 图生图（厂商按张计费）',
    '轻量文生图 / 图生图（厂商按张计费）',
    '文生图 / 图生图（厂商按张计费）',
    '高质量文生图 / 图生图',
    '轻量文生图 / 图生图',
    '文生图 / 图生图',
    'Seedream 旗舰：更高画质与细节，适合成片级配图与精细编辑',
    'Seedream 5.0 轻量版：更快更省，适合草稿与快速试错',
    'Seedream 4.5：画质与速度均衡，通用文生图 / 图生图',
    'Seedream 4.0：低成本稳定出图，适合批量与日常配图',
})


def _removed_seed_ids(conn: Any) -> set[str]:
    try:
        rows = conn.execute('SELECT id FROM llm_models_removed').fetchall()
    except Exception:
        return set()
    return {str(r['id']) for r in rows if r and r['id']}


def _ensure_seed_models(conn: Any) -> None:
    """Insert any missing official seed rows (does not overwrite admin edits).

    Skips ids tombstoned via admin delete (``llm_models_removed``).
    """
    now = time.time()
    removed = _removed_seed_ids(conn)
    for m in _SEED:
        if m['id'] in removed:
            continue
        row = conn.execute(
            'SELECT * FROM llm_models WHERE id = ?',
            (m['id'],),
        ).fetchone()
        seed_limits = _image_limits_for_seed(m)
        limits_json = _serialize_image_limits(seed_limits)
        if row:
            # Existing row is Admin-owned: only fill empty icon / description / limits.
            # Never overwrite non-empty label, description, or image_limits.
            try:
                cur_icon = (row['icon_key'] or '').strip() if 'icon_key' in row.keys() else ''
            except Exception:
                cur_icon = ''
            if not cur_icon and m.get('icon_key'):
                conn.execute(
                    'UPDATE llm_models SET icon_key = ?, updated_at = ? WHERE id = ?',
                    (m['icon_key'], now, m['id']),
                )
            cur_desc = (row['description'] or '').strip() if 'description' in row.keys() else ''
            if not cur_desc and m.get('description'):
                conn.execute(
                    'UPDATE llm_models SET description = ?, updated_at = ? WHERE id = ?',
                    (m['description'], now, m['id']),
                )
            if limits_json and 'image_limits' in row.keys():
                cur_lim = row['image_limits']
                empty = cur_lim is None or (
                    isinstance(cur_lim, str) and not str(cur_lim).strip()
                )
                if empty:
                    conn.execute(
                        """
                        UPDATE llm_models
                        SET image_limits = ?, max_attachments = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (limits_json, int(m.get('max_attachments') or 14), now, m['id']),
                    )
            continue
        ref_types = _serialize_reference_types(_default_reference_types_for_seed(m))
        conn.execute(
            """
            INSERT INTO llm_models (
                id, label, description, provider, kind, api_model,
                icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                reference_types, image_limits, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                m['id'], m['label'], m['description'], m['provider'], m['kind'],
                m['api_model'], m['icon_key'], m.get('price'), m['max_attachments'], m['thinking'],
                m['enabled'], m['sort_order'], ref_types, limits_json, now, now,
            ),
        )
    conn.commit()


def _pub(r: Any) -> dict[str, Any]:
    price_raw = r['price'] if 'price' in r.keys() else None
    kind = r['kind'] or 'text'
    ref_raw = r['reference_types'] if 'reference_types' in r.keys() else None
    ref_types = _parse_reference_types_cell(ref_raw, kind=kind)
    lim_raw = r['image_limits'] if 'image_limits' in r.keys() else None
    image_limits = resolve_image_limits(lim_raw)
    if not image_limits:
        inferred = infer_image_limit_preset(
            str(r['id'] or ''),
            str(r['api_model'] or '') if 'api_model' in r.keys() else '',
            provider=str(r['provider'] or '') if 'provider' in r.keys() else '',
        )
        image_limits = resolve_image_limits(preset=inferred)
    meta_raw = r['price_meta'] if 'price_meta' in r.keys() else None
    price_meta = _parse_price_meta(meta_raw)
    return {
        'id': r['id'],
        'label': r['label'],
        'description': r['description'] or None,
        'provider': r['provider'] or 'doubao',
        'kind': kind,
        'reference_types': ref_types,
        'referenceTypes': ref_types,
        'api_model': r['api_model'],
        'apiModel': r['api_model'],
        'iconKey': r['icon_key'] or None,
        'iconUrl': r['icon_url'] or None,
        'price': (str(price_raw).strip() if price_raw else None),
        'price_meta': price_meta,
        'priceMeta': price_meta,
        'max_attachments': int(r['max_attachments'] or 8),
        'maxAttachments': int(r['max_attachments'] or 8),
        'thinking': bool(int(r['thinking'] or 0)),
        'enabled': bool(int(r['enabled'] or 0)),
        'sortOrder': int(r['sort_order'] or 100),
        'image_limits': image_limits,
        'imageLimits': image_limits,
        'createdAt': int(float(r['created_at']) * 1000) if r['created_at'] else None,
        'updatedAt': int(float(r['updated_at']) * 1000) if r['updated_at'] else None,
    }


def list_catalog(*, kind: str | None = None, enabled_only: bool = True) -> list[dict[str, Any]]:
    init_schema()
    where = ['1=1']
    params: list[Any] = []
    k = (kind or '').strip().lower()
    if k in ('text', 'image'):
        where.append('kind = ?')
        params.append(k)
    if enabled_only:
        where.append('enabled = 1')
    sql = (
        'SELECT * FROM llm_models WHERE '
        + ' AND '.join(where)
        + ' ORDER BY sort_order ASC, updated_at DESC'
    )
    with connect() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_pub(r) for r in rows]


def list_admin_models(*, kind: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
    init_schema()
    where = ['1=1']
    params: list[Any] = []
    k = (kind or '').strip().lower()
    if k in ('text', 'image'):
        where.append('kind = ?')
        params.append(k)
    if q and q.strip():
        like = f'%{q.strip()}%'
        where.append('(id LIKE ? OR label LIKE ? OR api_model LIKE ? OR provider LIKE ?)')
        params.extend([like, like, like, like])
    sql = (
        'SELECT * FROM llm_models WHERE '
        + ' AND '.join(where)
        + ' ORDER BY sort_order ASC, updated_at DESC'
    )
    with connect() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_pub(r) for r in rows]


def get_model(model_id: str) -> dict[str, Any] | None:
    init_schema()
    mid = (model_id or '').strip()
    if not mid:
        return None
    with connect() as conn:
        row = conn.execute('SELECT * FROM llm_models WHERE id = ?', (mid,)).fetchone()
    return _pub(row) if row else None


def upsert_model(payload: dict[str, Any]) -> dict[str, Any]:
    init_schema()
    mid = str(payload.get('id') or '').strip()
    if not mid:
        raise ValueError('id required')
    label = str(payload.get('label') or mid).strip()
    kind = str(payload.get('kind') or 'text').strip().lower()
    if kind not in ('text', 'image'):
        raise ValueError('kind must be text|image')
    ref_types = _normalize_reference_types(
        payload.get('referenceTypes')
        if payload.get('referenceTypes') is not None
        else payload.get('reference_types'),
        kind=kind,
    )
    if kind == 'image' and 'image' not in ref_types:
        # Image-catalog models must be selectable for the image slot.
        ref_types = ['image', *[t for t in ref_types if t != 'image']]
    if kind == 'text' and ref_types == ['image']:
        raise ValueError('text models cannot be image-only; add text and/or vision')
    ref_types_json = _serialize_reference_types(ref_types)
    provider = str(payload.get('provider') or 'doubao').strip() or 'doubao'
    api_model = str(payload.get('apiModel') or payload.get('api_model') or mid).strip()
    description = payload.get('description')
    icon_key = payload.get('iconKey') or payload.get('icon_key')
    icon_url = payload.get('iconUrl') or payload.get('icon_url')
    price_raw = payload.get('price')
    price = (str(price_raw).strip() if price_raw is not None else '') or None
    max_attachments = int(payload.get('maxAttachments') or payload.get('max_attachments') or 8)
    thinking = 1 if payload.get('thinking') else 0
    enabled = 1 if payload.get('enabled', True) else 0
    sort_order = int(payload.get('sortOrder') or payload.get('sort_order') or 100)
    limits_payload = payload.get('imageLimits')
    if limits_payload is None:
        limits_payload = payload.get('image_limits')
    preset = payload.get('imageLimitPreset') or payload.get('image_limit_preset')
    if kind == 'image':
        image_limits = resolve_image_limits(limits_payload, preset=str(preset or '') or None)
    else:
        image_limits = None
    limits_json = _serialize_image_limits(image_limits)
    meta_in_payload = 'priceMeta' in payload or 'price_meta' in payload
    meta_payload = payload.get('priceMeta')
    if meta_payload is None:
        meta_payload = payload.get('price_meta')
    now = time.time()
    with connect() as conn:
        # Admin re-adding a previously deleted seed clears the tombstone.
        try:
            conn.execute('DELETE FROM llm_models_removed WHERE id = ?', (mid,))
        except Exception:
            pass
        existing = conn.execute('SELECT * FROM llm_models WHERE id = ?', (mid,)).fetchone()
        if meta_in_payload:
            price_meta = _parse_price_meta(meta_payload)
        elif existing:
            old_price = existing['price'] if 'price' in existing.keys() else None
            old_meta = (
                existing['price_meta'] if 'price_meta' in existing.keys() else None
            )
            if (str(old_price or '').strip() or None) == price:
                price_meta = _parse_price_meta(old_meta)
            else:
                price_meta = {'source': 'manual', 'synced_at': int(now)}
        elif 'price' in payload:
            price_meta = {'source': 'manual', 'synced_at': int(now)}
        else:
            price_meta = None
        price_meta_json = (
            json.dumps(price_meta, ensure_ascii=False, separators=(',', ':'))
            if price_meta
            else None
        )
        if existing:
            conn.execute(
                """
                UPDATE llm_models SET
                  label=?, description=?, provider=?, kind=?, api_model=?,
                  icon_key=?, icon_url=?, price=?, max_attachments=?, thinking=?,
                  enabled=?, sort_order=?, reference_types=?, image_limits=?,
                  price_meta=?, updated_at=?
                WHERE id=?
                """,
                (
                    label, description, provider, kind, api_model,
                    icon_key, icon_url, price, max_attachments, thinking,
                    enabled, sort_order, ref_types_json, limits_json,
                    price_meta_json, now, mid,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO llm_models (
                    id, label, description, provider, kind, api_model,
                    icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                    reference_types, image_limits, price_meta, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mid, label, description, provider, kind, api_model,
                    icon_key, icon_url, price, max_attachments, thinking, enabled, sort_order,
                    ref_types_json, limits_json, price_meta_json, now, now,
                ),
            )
        conn.commit()
    item = get_model(mid)
    if not item:
        raise RuntimeError('upsert failed')
    return item


def delete_model(model_id: str) -> bool:
    init_schema()
    mid = (model_id or '').strip()
    if not mid:
        return False
    now = time.time()
    with connect() as conn:
        cur = conn.execute('DELETE FROM llm_models WHERE id = ?', (mid,))
        deleted = int(getattr(cur, 'rowcount', 0) or 0) > 0
        # Always tombstone so seed catalog cannot resurrect this id.
        _tombstone_removed_model(conn, mid, now)
        conn.commit()
        return deleted

