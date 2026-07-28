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
  /** Up to 4 cover image URLs for list collage (admin custom overrides to one). */
  thumbnailUrl?: string | string[] | null;
  /** Admin-uploaded list cover raster. */
  customCoverImageUrl?: string | null;
  /** HD PNG panels written on admin approve. */
  panelUrls?: Array<{ id: string; name?: string; url: string }> | null;
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
  /** Plaza list cover snapshot — render with PlazaCoverThumb / TemplateThumbnail. */
  coverDocument?: unknown | null;
  thumbnailUrl?: string | string[] | null;
  customCoverImageUrl?: string | null;
  /** HD PNG panels written on admin approve. */
  panelUrls?: Array<{ id: string; name?: string; url: string }> | null;
  likeCount?: number;
  useCount?: number;
};

/** Display cover URLs: admin custom wins as a one-tile collage, else submit array. */
export function plazaDisplayCoverUrls(item: {
  customCoverImageUrl?: string | null;
  thumbnailUrl?: string | string[] | null;
}): string[] {
  const custom = String(item.customCoverImageUrl || '').trim();
  if (custom) return [custom];
  if (Array.isArray(item.thumbnailUrl)) {
    return item.thumbnailUrl.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 4);
  }
  const one = String(item.thumbnailUrl || '').trim();
  return one ? [one] : [];
}

/** @deprecated use plazaDisplayCoverUrls */
export function plazaDisplayCoverUrl(item: {
  customCoverImageUrl?: string | null;
  thumbnailUrl?: string | string[] | null;
}): string | null {
  return plazaDisplayCoverUrls(item)[0] || null;
}

export const recordPlazaUse = (submissionId: string) =>
  request<{ ok: boolean; useCount: number }>({
    url: `/api/v1/plaza/items/${encodeURIComponent(submissionId)}/use`,
    method: 'post',
  });

export const submitToPlaza = (data: {
  projectId: string;
  title: string;
  category?: string;
  document: unknown;
  /** Project's saved cover URL (webp/png) — used when admin has no custom cover. */
  thumbnailUrl?: string | null;
}) => {
  // Freeze a plain snapshot so later editor edits never mutate the payload in flight
  // or share object identity with the live project document.
  let document: unknown = data.document;
  try {
    document = JSON.parse(JSON.stringify(data.document));
  } catch {
    document = data.document;
  }
  const thumbnailUrl = String(data.thumbnailUrl || '').trim();
  return request<{ item: PlazaSubmissionDto }>({
    url: '/api/v1/plaza/submit',
    method: 'post',
    data: {
      projectId: data.projectId,
      title: data.title,
      category: data.category,
      document,
      ...(thumbnailUrl && !thumbnailUrl.startsWith('data:')
        ? { thumbnailUrl }
        : {}),
    },
  });
};

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

const PLAZA_FEED_TTL_MS = 90_000;
const _plazaFeedCache = new Map<string, { at: number; data: PaginatedPlazaFeed }>();

export const fetchPlazaFeed = (params: {
  page: number;
  pageSize: number;
  tab: PlazaFeedTab;
  category?: string;
  authorIds?: string;
}) => {
  const key = JSON.stringify(params);
  const hit = _plazaFeedCache.get(key);
  if (hit && Date.now() - hit.at < PLAZA_FEED_TTL_MS) {
    return Promise.resolve(hit.data);
  }
  return request<PaginatedPlazaFeed>({
    url: '/api/v1/plaza/feed',
    method: 'get',
    params,
  }).then((data) => {
    _plazaFeedCache.set(key, { at: Date.now(), data });
    return data;
  });
};

export function invalidatePlazaFeedCache() {
  _plazaFeedCache.clear();
}

export const fetchPlazaItem = (id: string) =>
  request<{ item: PlazaSubmissionDto }>({
    url: `/api/v1/plaza/items/${encodeURIComponent(id)}`,
    method: 'get',
  });
