/**
 * Plaza API — publish to square + admin review.
 */

import { request } from '@/utils/request';

export type PlazaStatus = 'pending' | 'approved' | 'rejected';

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
  document?: unknown;
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
};

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

export const fetchPlazaFeed = (limit = 100) =>
  request<{ items: PlazaFeedItemDto[] }>({
    url: '/api/v1/plaza/feed',
    method: 'get',
    params: { limit },
  });

export const fetchPlazaItem = (id: string) =>
  request<{ item: PlazaSubmissionDto }>({
    url: `/api/v1/plaza/items/${encodeURIComponent(id)}`,
    method: 'get',
  });

export const fetchAdminPlazaList = (status?: PlazaStatus | 'all') =>
  request<{ items: PlazaSubmissionDto[] }>({
    url: '/api/v1/plaza/admin/list',
    method: 'get',
    params: status && status !== 'all' ? { status } : undefined,
  });

export const approvePlazaSubmission = (id: string) =>
  request<{ item: PlazaSubmissionDto }>({
    url: `/api/v1/plaza/admin/${encodeURIComponent(id)}/approve`,
    method: 'post',
  });

export const rejectPlazaSubmission = (id: string, reason?: string) =>
  request<{ item: PlazaSubmissionDto }>({
    url: `/api/v1/plaza/admin/${encodeURIComponent(id)}/reject`,
    method: 'post',
    data: reason ? { reason } : {},
  });
