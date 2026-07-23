/**
 * Document share links — server-backed preview / edit.
 */

import { request } from '@/utils/request';

export type SharePermission = 'preview' | 'edit';

export type ShareDto = {
  id: string;
  ownerId?: string;
  name: string;
  permission: SharePermission;
  document?: unknown;
  sourceProjectId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export const createShareApi = (payload: {
  name: string;
  permission: SharePermission;
  document: unknown;
  sourceProjectId?: string;
}) =>
  request<{ share: ShareDto }>({
    url: '/api/v1/shares',
    method: 'put',
    data: {
      name: payload.name,
      permission: payload.permission,
      document: payload.document,
      sourceProjectId: payload.sourceProjectId,
    },
  });

export const fetchShareApi = (shareId: string) =>
  request<{ share: ShareDto }>({
    url: `/api/v1/shares/${encodeURIComponent(shareId)}`,
    method: 'get',
  });

export const updateShareDocumentApi = (shareId: string, document: unknown) =>
  request<{ share: ShareDto }>({
    url: `/api/v1/shares/${encodeURIComponent(shareId)}/document`,
    method: 'put',
    data: { document },
  });
