/**
 * User AI assets API (image/video).
 */

import { request } from '@/utils/request';

export type AssetDto = {
  id: string;
  kind: 'image' | 'video' | string;
  url: string;
  objectKey?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  source?: string | null;
  prompt?: string | null;
  meta?: unknown;
  createdAt: number;
};

export type PaginatedAssets = {
  items: AssetDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export const fetchAssets = (page = 1, pageSize = 24, kind?: 'image' | 'video' | 'font') =>
  request<PaginatedAssets>({
    url: '/api/v1/assets',
    method: 'get',
    params: { page, pageSize, ...(kind ? { kind } : {}) },
  });

export const deleteAsset = (id: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/assets/${encodeURIComponent(id)}`,
    method: 'delete',
  });
