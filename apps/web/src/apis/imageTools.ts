/**
 * Image toolbar AI tools — POST /api/v1/image/process
 * (Seedream i2i, or vision decompose for editText / editElements).
 */

import { request } from '@/utils/request';

export type ImageProcessKindApi =
  | 'upscale'
  | 'removeBg'
  | 'multiAngle'
  | 'expand'
  | 'editText'
  | 'editElements'
  | 'vector'
  | 'adjust';

export type ImageProcessBody = {
  kind: ImageProcessKindApi | string;
  image: string;
  meta?: Record<string, unknown>;
  aspect_ratio?: string;
  quality?: string;
  resolution?: string;
  model?: string;
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
  /** editText / editElements: split layers in source-pixel coords */
  layers?: ImageDecomposeLayer[];
  width?: number;
  height?: number;
  warnings?: string[];
  engines?: string[];
  /** Credits charged for this tool call (server-side). */
  credits?: number;
};

/** Run an image toolbar tool on the API (Seedream i2i or local rembg / OCR). */
export const processImageTool = (
  data: ImageProcessBody,
  opts?: { signal?: AbortSignal }
) =>
  request<ImageProcessResult>({
    url: '/api/v1/image/process',
    method: 'post',
    data,
    signal: opts?.signal,
    // Local rembg may download weights on first run; Seedream i2i can also be slow.
    timeout: 180000,
  });
