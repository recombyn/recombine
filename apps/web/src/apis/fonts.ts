/**
 * Fonts catalog + AI font generator (async TTF pipeline).
 */

import { request } from '@/utils/request';

export type FontFaceDto = {
  family: string;
  displayName: string;
  weight?: number;
  url?: string;
  format?: string;
};

export type FontFamilyDto = {
  family: string;
  displayName: string;
  children?: FontFaceDto[];
};

export type PaginatedFonts = {
  items: FontFamilyDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type GeneratedFontAsset = {
  id: string;
  kind: string;
  url: string;
  prompt?: string | null;
  width?: number | null;
  height?: number | null;
  meta?: {
    ttfUrl?: string;
    familyName?: string;
    taskId?: string;
    format?: string;
  } | null;
  createdAt: number;
};

export type PaginatedGeneratedFonts = {
  items: GeneratedFontAsset[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type FontTaskDto = {
  id: string;
  userId: string;
  status: string;
  progress: number;
  description?: string | null;
  referenceUrl?: string | null;
  ttfUrl?: string | null;
  previewUrl?: string | null;
  assetId?: string | null;
  familyName?: string | null;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
};

export const FONT_GENERATE_CREDITS = 28;

export const fetchFonts = (page = 1, pageSize = 200) =>
  request<PaginatedFonts>({
    url: '/api/v1/fonts',
    method: 'get',
    params: { page, pageSize },
  });

export const fetchFontGenerateCost = () =>
  request<{ credits: number; latinOnly: boolean; producesTtf?: boolean }>({
    url: '/api/v1/fonts/generate/cost',
    method: 'get',
  });

export const fetchFontStyleSamples = () =>
  request<{ items: string[] }>({
    url: '/api/v1/fonts/style-samples',
    method: 'get',
  });

export const fetchMyGeneratedFonts = (page = 1, pageSize = 24) =>
  request<PaginatedGeneratedFonts>({
    url: '/api/v1/fonts/mine',
    method: 'get',
    params: { page, pageSize },
  });

export const generateFont = (data: {
  description?: string;
  reference_image?: string | null;
  charset?: string | null;
}) =>
  request<{
    task: FontTaskDto;
    taskId: string;
    status: string;
    credits: number;
    latinOnly: boolean;
    producesTtf?: boolean;
    queue?: string;
  }>({
    url: '/api/v1/fonts/generate',
    method: 'post',
    data,
    timeout: 60000,
  });

export const fetchFontTask = (taskId: string) =>
  request<{ task: FontTaskDto; credits: number }>({
    url: `/api/v1/fonts/tasks/${encodeURIComponent(taskId)}`,
    method: 'get',
  });

/** Poll until done/failed or timeout. */
export async function waitForFontTask(
  taskId: string,
  opts?: { intervalMs?: number; timeoutMs?: number; onProgress?: (task: FontTaskDto) => void }
): Promise<FontTaskDto> {
  const interval = opts?.intervalMs ?? 1500;
  const timeout = opts?.timeoutMs ?? 300000;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const res = await fetchFontTask(taskId);
    const task = res.task;
    opts?.onProgress?.(task);
    if (task.status === 'done' || task.status === 'failed') return task;
    await new Promise((r) => window.setTimeout(r, interval));
  }
  throw new Error('字体生成超时，请稍后在「我的字体」中查看');
}
