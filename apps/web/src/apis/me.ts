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

export const fetchMyLiked = (page = 1, pageSize = 24) =>
  request<PaginatedMeLiked>({
    url: '/api/v1/me/liked',
    method: 'get',
    params: { page, pageSize },
    // Always fresh after like/unlike — do not reuse StrictMode GET cache.
    skipInflightDedupe: true,
  });

export const fetchMyLikedIds = () =>
  request<{ ids: string[] }>({
    url: '/api/v1/me/liked/ids',
    method: 'get',
    skipInflightDedupe: true,
  });

export const likePlazaItem = (submissionId: string) =>
  request<{ ok: boolean; liked: boolean; id: string; likeCount?: number }>({
    url: `/api/v1/me/liked/${encodeURIComponent(submissionId)}`,
    method: 'put',
  });

export const unlikePlazaItem = (submissionId: string) =>
  request<{ ok: boolean; liked: boolean; id: string; likeCount?: number }>({
    url: `/api/v1/me/liked/${encodeURIComponent(submissionId)}`,
    method: 'delete',
  });

/** Migrate legacy localStorage like ids → server. */
export const syncMyLiked = (ids: string[]) =>
  request<{ ok: boolean; ids: string[] }>({
    url: '/api/v1/me/liked/sync',
    method: 'post',
    data: { ids },
  });
