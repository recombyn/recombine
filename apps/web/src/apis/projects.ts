/**
 * User projects API — metadata + document sync.
 */

import { request } from '@/utils/request';

export type ProjectSummaryDto = {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
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

export const fetchProjects = (page = 1, pageSize = 24) =>
  request<PaginatedProjects>({
    url: '/api/v1/projects',
    method: 'get',
    params: { page, pageSize },
  });

/** Paginate through all project summaries (list metadata only). */
export async function fetchAllProjectSummaries(
  pageSize = 50,
  maxPages = 20
): Promise<ProjectSummaryDto[]> {
  const all: ProjectSummaryDto[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    const res = await fetchProjects(page, pageSize);
    all.push(...(res.projects || []));
    hasMore = Boolean(res.hasMore);
    page += 1;
  }
  return all;
}

export const fetchProject = (id: string) =>
  request<{ project: ProjectDto }>({
    url: `/api/v1/projects/${encodeURIComponent(id)}`,
    method: 'get',
  });

export const upsertProjectApi = (payload: {
  id?: string;
  name: string;
  document?: unknown;
  thumbnailDataUrl?: string | null;
}) =>
  request<{ project: ProjectSummaryDto }>({
    url: '/api/v1/projects',
    method: 'put',
    data: payload,
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
