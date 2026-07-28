/**
 * User projects API — metadata + document sync (camera/selection stay local).
 */

import { request } from '@/utils/request';

export type ProjectSummaryDto = {
  id: string;
  name: string;
  /** Up to 4 cover tiles for 最近打开 / 我的项目 collage. */
  thumbnailUrl?: string | string[] | null;
  /** User-uploaded cover — auto-save must not overwrite. */
  thumbnailCustom?: boolean;
  /** Optimistic concurrency token — send as baseRevision / If-Match on PUT. */
  revision?: number;
  updatedAt: number;
  createdAt: number;
  hasDocument?: boolean;
};

export type ProjectDto = ProjectSummaryDto & {
  document?: unknown;
};

export type PaginatedProjects = {
  projects: ProjectSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type UpsertProjectBody = {
  id?: string;
  name: string;
  document?: unknown;
  thumbnailDataUrl?: string | null;
  thumbnailDataUrls?: string[] | null;
  thumbnailUrls?: string[] | null;
  thumbnailCustom?: boolean;
  baseRevision?: number;
};

export type PatchProjectBody = {
  baseRevision: number;
  name?: string;
  thumbnailDataUrl?: string | null;
  thumbnailDataUrls?: string[] | null;
  thumbnailUrls?: string[] | null;
  thumbnailCustom?: boolean;
  upsertNodes?: Record<string, unknown>;
  removeNodeIds?: string[];
  pageChildren?: string[];
  frames?: unknown[];
  activeFrameId?: string | null;
  canvas?: Record<string, unknown>;
};

export const fetchProjects = (params: { page: number; pageSize: number }) =>
  request<PaginatedProjects>({
    url: '/api/v1/projects',
    method: 'get',
    params,
  });

export const fetchProject = (id: string) =>
  request<{ project: ProjectDto }>({
    url: `/api/v1/projects/${encodeURIComponent(id)}`,
    method: 'get',
  });

export const upsertProjectApi = (
  data: UpsertProjectBody,
  headers?: Record<string, string>
) =>
  request<{ project: ProjectSummaryDto }>({
    url: '/api/v1/projects',
    method: 'put',
    headers,
    data,
  });

/** Node-level incremental sync — server merges under the same revision lock. */
export const patchProjectApi = (
  id: string,
  data: PatchProjectBody,
  headers?: Record<string, string>
) =>
  request<{ project: ProjectSummaryDto }>({
    url: `/api/v1/projects/${encodeURIComponent(id)}`,
    method: 'patch',
    headers,
    data,
  });

export const deleteProjectApi = (id: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/projects/${encodeURIComponent(id)}`,
    method: 'delete',
  });

/** Batch delete — one request for many project ids. */
export const deleteProjectsApi = (ids: string[]) =>
  request<{ ok: boolean; deleted: number }>({
    url: '/api/v1/projects/batch-delete',
    method: 'post',
    data: { ids },
  });
