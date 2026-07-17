/**
 * Image toolbar AI tools — POST /api/v1/image/process (Seedream i2i on backend).
 */

import { request } from '@/utils/request';

export type ImageProcessKindApi =
  | 'upscale'
  | 'removeBg'
  | 'multiAngle'
  | 'expand'
  | 'editElements'
  | 'editText'
  | 'vector'
  | 'adjust';

export type ImageProcessParams = {
  kind: ImageProcessKindApi | string;
  image: string;
  meta?: Record<string, unknown> | null;
  aspect_ratio?: string | null;
  quality?: string | null;
  resolution?: string | null;
  model?: string | null;
};

export type ImageProcessResult = {
  image: string;
  text?: string | null;
  kind: string;
  model?: string;
};

/** Run an image toolbar tool on the API (AI / Seedream). */
export const processImageTool = (data: ImageProcessParams) =>
  request<ImageProcessResult>({
    url: '/api/v1/image/process',
    method: 'post',
    data: {
      kind: data.kind,
      image: data.image,
      meta: data.meta || undefined,
      aspect_ratio: data.aspect_ratio || undefined,
      quality: data.quality || undefined,
      resolution: data.resolution || undefined,
      model: data.model || undefined,
    },
    // Seedream can be slow
    timeout: 180000,
  });
