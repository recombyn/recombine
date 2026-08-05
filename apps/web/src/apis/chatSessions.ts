/**
 * Chat session CRUD — synced to API when authenticated.
 */

import { request } from '@/utils/request';

export type ChatSessionMessageDto = {
  id?: string;
  role: string;
  content: string;
  /** Display chips for @ mentions (persisted with the turn). */
  contexts?: Array<{
    key: string;
    label: string;
    kind: string;
    thumbUrl?: string;
  }> | null;
  /** `content` with U+FFFC where each chip sat (inline bubble layout). */
  contentMarked?: string | null;
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
  videos?: string[] | null;
  imageModelId?: string | null;
  imageModelLabel?: string | null;
  imageAspectRatio?: string | null;
  /** Paused LangGraph run — Resume button. */
  designTaskId?: string | null;
  canResume?: boolean | null;
  /** Ask mode propose → Confirm applies these ops. */
  proposedOps?: Array<{
    name?: string;
    args?: Record<string, unknown>;
    op_id?: string;
  }> | null;
  choices?: string[] | null;
  applyChoice?: string | null;
  choiceUi?: {
    mode?: string;
    placeholder?: string;
    options?: Array<{ label: string; action: string }>;
  } | null;
  proposalId?: string | null;
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

export type UpsertChatSessionBody = {
  projectId: string;
  id?: string;
  title: string;
  messages: ChatSessionMessageDto[];
  taskState?: Record<string, unknown>;
};

export const fetchChatSessions = (params: { projectId: string }) =>
  request<{ sessions: ChatSessionDto[] }>({
    url: '/api/v1/chat-sessions/sessions',
    method: 'get',
    params,
  });

export const upsertChatSessionApi = (data: UpsertChatSessionBody) =>
  request<{ session: ChatSessionDto }>({
    url: '/api/v1/chat-sessions/sessions',
    method: 'put',
    data,
  });

export const deleteChatSessionApi = (id: string) =>
  request<{ ok: boolean }>({
    url: `/api/v1/chat-sessions/sessions/${encodeURIComponent(id)}`,
    method: 'delete',
  });
