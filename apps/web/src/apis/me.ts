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

export const fetchMyLikedIds = () => {
  if (_likedIdsCache && Date.now() - _likedIdsCache.at < LIKED_IDS_TTL_MS) {
    return Promise.resolve(_likedIdsCache.data);
  }
  return request<{ ids: string[] }>({
    url: '/api/v1/me/liked/ids',
    method: 'get',
    skipInflightDedupe: true,
  }).then((data) => {
    _likedIdsCache = { at: Date.now(), data };
    return data;
  });
};

export const likePlazaItem = (submissionId: string) =>
  request<{ ok: boolean; liked: boolean; id: string; likeCount?: number }>({
    url: `/api/v1/me/liked/${encodeURIComponent(submissionId)}`,
    method: 'put',
  }).then((data) => {
    invalidateMyLikedIdsCache();
    return data;
  });

export const unlikePlazaItem = (submissionId: string) =>
  request<{ ok: boolean; liked: boolean; id: string; likeCount?: number }>({
    url: `/api/v1/me/liked/${encodeURIComponent(submissionId)}`,
    method: 'delete',
  }).then((data) => {
    invalidateMyLikedIdsCache();
    return data;
  });

/** Migrate legacy localStorage like ids → server. */
export const syncMyLiked = (ids: string[]) =>
  request<{ ok: boolean; ids: string[] }>({
    url: '/api/v1/me/liked/sync',
    method: 'post',
    data: { ids },
  }).then((data) => {
    invalidateMyLikedIdsCache();
    return data;
  });

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

export const fetchByokProviders = () =>
  request<{ items: ByokProviderDto[] }>({
    url: '/api/v1/me/byok/providers',
    method: 'get',
    skipInflightDedupe: true,
  }).then((data) => data.items || []);

export const upsertByokProvider = (body: {
  id?: string;
  name: string;
  website?: string;
  baseUrl: string;
  apiModel: string;
  modelKind?: string;
  apiKey?: string;
}) =>
  request<{ item: ByokProviderDto }>({
    url: '/api/v1/me/byok/providers',
    method: 'put',
    data: body,
  }).then((data) => data.item);

export const deleteByokProvider = (providerId: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/me/byok/providers/${encodeURIComponent(providerId)}`,
    method: 'delete',
  });
