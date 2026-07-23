/**
 * Plaza API — publish / feed / item (admin review lives elsewhere).
 */

import { request } from '@/utils/request';

export type PlazaStatus = 'pending' | 'approved' | 'rejected';

export type PlazaFeedTab = 'recommended' | 'latest' | 'following';

export type PlazaCategoryFilter = 'all' | 'website' | 'mobile' | 'image' | 'poster';

export type PlazaSubmissionDto = {
  id: string;
  projectId: string;
  userId: string;
  authorName: string;
  authorAvatar?: string | null;
  title: string;
  category: string;
  status: PlazaStatus;
  rejectReason?: string | null;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number | null;
  source?: 'plaza';
  /** Plaza list cover (artboard preview). Full canvas only on item detail. */
  coverDocument?: unknown | null;
  document?: unknown;
  likeCount?: number;
  useCount?: number;
};

export type PlazaFeedItemDto = {
  id: string;
  projectId?: string;
  userId?: string;
  authorName: string;
  authorAvatar?: string | null;
  title: string;
  category: string;
  status?: PlazaStatus;
  createdAt: number;
  updatedAt?: number;
  reviewedAt?: number | null;
  source: 'plaza';
  /** Plaza list cover snapshot — render with PlazaCoverThumb. */
  coverDocument?: unknown | null;
  likeCount?: number;
  useCount?: number;
};

export const recordPlazaUse = (submissionId: string) =>
  request<{ ok: boolean; useCount: number }>({
    url: `/api/v1/plaza/items/${encodeURIComponent(submissionId)}/use`,
    method: 'post',
  });

export const submitToPlaza = (payload: {
  projectId: string;
  title: string;
  category?: string;
  document: unknown;
}) =>
  request<{ item: PlazaSubmissionDto }>({
    url: '/api/v1/plaza/submit',
    method: 'post',
    data: payload,
  });

export const fetchMyPlazaSubmissions = () =>
  request<{ items: PlazaSubmissionDto[] }>({
    url: '/api/v1/plaza/mine',
    method: 'get',
  });

export type PaginatedPlazaFeed = {
  items: PlazaFeedItemDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  tab?: PlazaFeedTab;
};

export const fetchPlazaFeed = (opts: {
  page?: number;
  pageSize?: number;
  tab?: PlazaFeedTab;
  /** Filter by plaza category; omit / all = no filter. */
  category?: PlazaCategoryFilter | string | null;
  /** Filter by creator user id(s). */
  authorIds?: string[];
} = {}) =>
  request<PaginatedPlazaFeed>({
    url: '/api/v1/plaza/feed',
    method: 'get',
    params: {
      page: opts.page ?? 1,
      pageSize: opts.pageSize ?? 12,
      tab: opts.tab ?? 'recommended',
      ...(opts.category && opts.category !== 'all' ? { category: opts.category } : {}),
      ...(opts.authorIds?.length ? { authorIds: opts.authorIds.join(',') } : {}),
    },
  });

export const fetchPlazaItem = (id: string) =>
  request<{ item: PlazaSubmissionDto }>({
    url: `/api/v1/plaza/items/${encodeURIComponent(id)}`,
    method: 'get',
  });
