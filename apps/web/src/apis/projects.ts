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

export const fetchProjects = () =>
  request<{ projects: ProjectSummaryDto[] }>({
    url: '/api/v1/projects',
    method: 'get',
  });

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
