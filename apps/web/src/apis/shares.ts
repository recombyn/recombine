/**
 * Document share links — server-backed preview / edit with collaborator ACL.
 */

import { request } from '@/utils/request';

export type SharePermission = 'preview' | 'edit';

export type ShareDto = {
  id: string;
  ownerId?: string;
  name: string;
  permission: SharePermission;
  document?: unknown;
  editorUserIds?: string[];
  viewerUserIds?: string[];
  linkEnabled?: boolean;
  linkPublic?: boolean;
  viewerCanView?: boolean;
  viewerCanEdit?: boolean;
  sourceProjectId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
};

export type CreateShareBody = {
  name: string;
  permission: SharePermission;
  document: unknown;
  sourceProjectId?: string;
  editorUserIds?: string[];
  viewerUserIds?: string[];
  linkPublic?: boolean;
};

export const createShareApi = (data: CreateShareBody) =>
  request<{ share: ShareDto }>({
    url: '/api/v1/shares',
    method: 'put',
    data,
  });

export const fetchShareApi = (shareId: string) =>
  request<{ share: ShareDto }>({
    url: `/api/v1/shares/${encodeURIComponent(shareId)}`,
    method: 'get',
  });

export const updateShareMetaApi = (
  shareId: string,
  data: {
    permission?: SharePermission;
    editorUserIds?: string[];
    viewerUserIds?: string[];
    name?: string;
    linkEnabled?: boolean;
    linkPublic?: boolean;
  }
) =>
  request<{ share: ShareDto }>({
    url: `/api/v1/shares/${encodeURIComponent(shareId)}`,
    method: 'patch',
    data,
  });

export const updateShareDocumentApi = (shareId: string, document: unknown) =>
  request<{ share: ShareDto }>({
    url: `/api/v1/shares/${encodeURIComponent(shareId)}/document`,
    method: 'put',
    data: { document },
  });

export const searchUsersApi = (params: { q: string; limit: number }) =>
  request<{ items: DirectoryUser[] }>({
    url: '/api/v1/users/search',
    method: 'get',
    params,
  });

export const lookupUsersApi = (params: { ids: string }) =>
  request<{ items: DirectoryUser[] }>({
    url: '/api/v1/users/lookup',
    method: 'get',
    params,
  });
