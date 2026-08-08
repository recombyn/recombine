/**
 * Me API — liked Plaza items for the current user.
 */

import { request } from '@/utils/request';
import type { PlazaFeedItemDto } from '@/apis/plaza';

export type MeLikedItemDto = PlazaFeedItemDto & {
  likedAt?: number;
  coverDocument?: unknown | null;
};

export type PaginatedMeLiked = {
  items: MeLikedItemDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export const fetchMyLiked = (params: { page: number; pageSize: number }) =>
  request<PaginatedMeLiked>({
    url: '/api/v1/me/liked',
    method: 'get',
    params,
    // Always fresh after like/unlike — do not reuse StrictMode GET cache.
    skipInflightDedupe: true,
  });

let _likedIdsCache: { at: number; data: { ids: string[] } } | null = null;
const LIKED_IDS_TTL_MS = 60_000;

export function invalidateMyLikedIdsCache() {
  _likedIdsCache = null;
}

export async function fetchMyLikedIds(): Promise<{ ids: string[] }> {
  if (_likedIdsCache && Date.now() - _likedIdsCache.at < LIKED_IDS_TTL_MS) {
    return _likedIdsCache.data;
  }
  const data = await request<{ ids: string[] }>({
    url: '/api/v1/me/liked/ids',
    method: 'get',
    skipInflightDedupe: true,
  });
  _likedIdsCache = { at: Date.now(), data };
  return data;
}

export async function likePlazaItem(submissionId: string) {
  const data = await request<{ ok: boolean; liked: boolean; id: string; likeCount?: number }>({
    url: `/api/v1/me/liked/${encodeURIComponent(submissionId)}`,
    method: 'put',
  });
  invalidateMyLikedIdsCache();
  return data;
}

export async function unlikePlazaItem(submissionId: string) {
  const data = await request<{ ok: boolean; liked: boolean; id: string; likeCount?: number }>({
    url: `/api/v1/me/liked/${encodeURIComponent(submissionId)}`,
    method: 'delete',
  });
  invalidateMyLikedIdsCache();
  return data;
}

/** Migrate legacy localStorage like ids → server. */
export async function syncMyLiked(ids: string[]) {
  const data = await request<{ ok: boolean; ids: string[] }>({
    url: '/api/v1/me/liked/sync',
    method: 'post',
    data: { ids },
  });
  invalidateMyLikedIdsCache();
  return data;
}

/** BYOK provider vault — list never includes plaintext apiKey. */
export type ByokProviderDto = {
  id: string;
  name: string;
  website?: string;
  baseUrl: string;
  apiModel?: string;
  modelKind: string;
  apiKeyHint?: string;
  hasApiKey?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export async function fetchByokProviders(): Promise<ByokProviderDto[]> {
  const data = await request<{ items: ByokProviderDto[] }>({
    url: '/api/v1/me/byok/providers',
    method: 'get',
    skipInflightDedupe: true,
  });
  return data.items || [];
}

export async function upsertByokProvider(body: {
  id?: string;
  name: string;
  website?: string;
  baseUrl: string;
  apiModel: string;
  modelKind?: string;
  apiKey?: string;
}): Promise<ByokProviderDto> {
  const data = await request<{ item: ByokProviderDto }>({
    url: '/api/v1/me/byok/providers',
    method: 'put',
    data: body,
  });
  return data.item;
}

export const deleteByokProvider = (providerId: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/me/byok/providers/${encodeURIComponent(providerId)}`,
    method: 'delete',
  });
