/**
 * Chat / LLM API — models + image gen.
 */

import { request } from '@/utils/request';

export type ModelReferenceType = 'text' | 'vision' | 'image';

/** From admin catalog `imageLimits` (Seedream WxH / OpenRouter resolution). */
export type ImageLimits = {
  preset?: string;
  transport?: string;
  min_pixels?: number;
  max_pixels?: number;
  resolutions?: string[];
  default_resolution?: string;
  aspect_ratios?: string[];
  size_tables?: Record<string, Record<string, string>>;
  supports_output_format?: boolean;
  supports_quality?: boolean;
};

/** Catalog price provenance (OpenRouter sync / Ark docs). */
export type ImagePriceMeta = {
  source?: string;
  billing?: string;
  unit?: string;
  usd_per_output_token?: number;
  fx_usd_cny?: number;
  base_resolution?: string;
  price_by_resolution_cny?: Record<string, number | string>;
  price_by_resolution?: Record<string, number | string>;
  output_image?: number;
  output_image_high?: number;
  high_pixels_threshold?: number;
  note?: string;
};

export type LlmModel = {
  id: string;
  label: string;
  provider: string;
  description?: string | null;
  kind?: 'text' | 'image' | 'svg' | 'video' | 'audio';
  referenceTypes?: ModelReferenceType[];
  reference_types?: ModelReferenceType[];
  thinking?: boolean;
  enabled?: boolean;
  iconUrl?: string | null;
  icon_url?: string | null;
  iconKey?: string | null;
  icon_key?: string | null;
  price?: string | null;
  priceMeta?: ImagePriceMeta | null;
  price_meta?: ImagePriceMeta | null;
  maxAttachments?: number;
  max_attachments?: number;
  imageLimits?: ImageLimits | null;
  image_limits?: ImageLimits | null;
};

/** Default generation params carried by image/video preset models. */
export type ByokPresetDefaults = {
  aspectRatios?: string[];
  resolutions?: string[];
  defaultResolution?: string;
  durations?: number[];
  defaultDuration?: number;
};

/** One selectable model under a legacy per-endpoint preset. */
export type ByokPresetModel = {
  apiModel: string;
  label: string;
  kind: 'text' | 'vision' | 'image' | 'video' | 'audio';
  thinking?: boolean;
  defaults?: ByokPresetDefaults;
};

/** Aggregator platform — one API key unlocks catalog models for that provider. */
export type ByokPlatform = {
  id: string;
  name: string;
  baseUrl: string;
  website?: string;
  iconKey?: string;
  kinds: Array<'text' | 'vision' | 'image' | 'video'>;
  /** Stable vault id, e.g. ``platform:openrouter``. */
  rowId: string;
  hint?: string;
};

/** @deprecated Prefer ByokPlatform — older ``byokPresets`` field. */
export type ByokPresetProvider = ByokPlatform & {
  models?: ByokPresetModel[];
};

export type ChatModelsResponse = {
  models: LlmModel[];
  available: boolean;
  imageModels?: LlmModel[];
  videoModels?: LlmModel[];
  audioModels?: LlmModel[];
  /** ISO country from GeoLite2 / edge headers when known. */
  clientRegion?: string | null;
  /** False on CN (and other blocked) networks — OpenRouter catalog hidden. */
  openrouterAvailable?: boolean;
  /** Aggregator platforms (OpenRouter / Volcengine) — one key unlocks catalog models. */
  byokPlatforms?: ByokPlatform[];
  /** Alias of byokPlatforms for older clients. */
  byokPresets?: ByokPresetProvider[];
};

export type GenerateImageInput = {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  quality?: string;
  resolution?: string;
  images?: string[];
};

export type GenerateImageResult = {
  images: string[];
  text?: string | null;
  model: string;
  assets?: Array<{ url?: string | null; id?: string | null }> | null;
};

/** GET /api/v1/chat/models — session-cached (single-flight). */
let _chatModels: ChatModelsResponse | null = null;
let _chatModelsInflight: Promise<ChatModelsResponse> | null = null;

export function invalidateChatModelsCache() {
  _chatModels = null;
  _chatModelsInflight = null;
}

export const listModels = (opts?: { force?: boolean }) => {
  if (!opts?.force && _chatModels) return Promise.resolve(_chatModels);
  if (!opts?.force && _chatModelsInflight) return _chatModelsInflight;
  const pending = (async () => {
    try {
      const data = await request<ChatModelsResponse>({
        url: '/api/v1/chat/models',
        method: 'get',
      });
      _chatModels = data;
      return data;
    } finally {
      if (_chatModelsInflight === pending) _chatModelsInflight = null;
    }
  })();
  _chatModelsInflight = pending;
  return pending;
};

/** POST /api/v1/chat/image */
export const generateImage = (
  data: GenerateImageInput,
  opts?: { signal?: AbortSignal }
) =>
  request<GenerateImageResult>({
    url: '/api/v1/chat/image',
    method: 'post',
    data,
    signal: opts?.signal,
  });

export type GenerateVideoInput = {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  /** First-frame / style reference images (data URLs or http URLs). */
  images?: string[];
};

export type GenerateVideoResult = {
  videos: string[];
  text?: string | null;
  model: string;
  assets?: Array<{ url?: string | null; id?: string | null }> | null;
};

/** POST /api/v1/chat/video — generation may take minutes (submit + poll on the API side). */
export const generateVideo = (
  data: GenerateVideoInput,
  opts?: { signal?: AbortSignal }
) =>
  request<GenerateVideoResult>({
    url: '/api/v1/chat/video',
    method: 'post',
    data,
    signal: opts?.signal,
    timeout: 600000,
  });

export type GenerateAudioInput = {
  prompt: string;
  model?: string;
  voice?: string;
  response_format?: string;
  speed?: number;
};

export type GenerateAudioResult = {
  audios: string[];
  model: string;
  voice?: string;
  mime?: string;
  assets?: Array<{ url?: string | null; id?: string | null }> | null;
};

/** POST /api/v1/chat/audio — OpenRouter TTS / speech. */
export const generateAudio = (
  data: GenerateAudioInput,
  opts?: { signal?: AbortSignal }
) =>
  request<GenerateAudioResult>({
    url: '/api/v1/chat/audio',
    method: 'post',
    data,
    signal: opts?.signal,
    timeout: 180000,
  });
