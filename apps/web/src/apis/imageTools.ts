/**
 * Image toolbar AI tools — POST /api/v1/image/process
 * (Seedream i2i, or vision decompose for editElements / editText).
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

export type ImageDecomposeLayer = {
  type: 'image' | 'text' | string;
  src?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fill?: string;
  lineHeight?: number;
};

export type ImageProcessResult = {
  image: string;
  text?: string | null;
  kind: string;
  model?: string;
  /** editElements / editText: split layers in source-pixel coords */
  layers?: ImageDecomposeLayer[];
  width?: number;
  height?: number;
  warnings?: string[];
  engines?: string[];
  /** Credits charged for this tool call (server-side). */
  credits?: number;
};

/** Run an image toolbar tool on the API (AI / Seedream / vision). */
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
    // Seedream / OCR can be slow
    timeout: 180000,
  });
