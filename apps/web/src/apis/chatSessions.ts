/**
 * Chat session CRUD — synced to API when authenticated.
 */

import { request } from '@/utils/request';

export type ChatSessionMessageDto = {
  id?: string;
  role: string;
  content: string;
  thinking?: string | null;
  durationMs?: number | null;
  intent?: string | null;
  steps?: Array<{
    id: string;
    name: string;
    status: 'running' | 'done' | 'error' | 'pending';
    summary?: string;
  }> | null;
  /** Seedream / image-mode gallery URLs (prefer durable asset URLs). */
  images?: string[] | null;
};

export type ChatSessionDto = {
  id: string;
  projectId?: string;
  title: string;
  updatedAt: number;
  createdAt?: number;
  taskState?: Record<string, unknown> | null;
  messages: ChatSessionMessageDto[];
};

export const fetchChatSessions = (projectId: string) =>
  request<{ sessions: ChatSessionDto[] }>({
    url: '/api/v1/chat-sessions/sessions',
    method: 'get',
    params: { projectId: projectId || '__none__' },
  });

export const upsertChatSessionApi = (payload: {
  projectId: string;
  id?: string;
  title: string;
  messages: ChatSessionMessageDto[];
  taskState?: Record<string, unknown> | null;
}) =>
  request<{ session: ChatSessionDto }>({
    url: '/api/v1/chat-sessions/sessions',
    method: 'put',
    data: {
      projectId: payload.projectId || '__none__',
      id: payload.id,
      title: payload.title,
      messages: payload.messages,
      taskState: payload.taskState ?? undefined,
    },
  });

export const deleteChatSessionApi = (id: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/chat-sessions/sessions/${encodeURIComponent(id)}`,
    method: 'delete',
  });
