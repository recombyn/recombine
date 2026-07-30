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
  kind?: 'text' | 'image' | 'svg' | 'video';
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

export type ChatModelsResponse = {
  models: LlmModel[];
  available: boolean;
  imageModels?: LlmModel[];
  videoModels?: LlmModel[];
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
  const run = request<ChatModelsResponse>({
    url: '/api/v1/chat/models',
    method: 'get',
  })
    .then((data) => {
      _chatModels = data;
      return data;
    })
    .finally(() => {
      if (_chatModelsInflight === run) _chatModelsInflight = null;
    });
  _chatModelsInflight = run;
  return run;
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
