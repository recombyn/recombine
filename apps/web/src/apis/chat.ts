/**
 * Chat / LLM API — models + image gen via axios; streaming stays on fetch/SSE.
 */

import { request } from '@/utils/request';
import { getToken } from '@/utils/token';

export type LlmModel = {
  id: string;
  label: string;
  provider: string;
  /** text=对话（含画布 Agent）· image=生图 */
  kind?: 'text' | 'image' | 'svg';
  thinking?: boolean;
  /** Max image attachments for this model (API: max_attachments). */
  maxAttachments?: number;
  max_attachments?: number;
};

/** Resolve per-model attachment cap (Seedream 14, Doubao chat 8, DeepSeek 4…). */
export function maxAttachmentsFor(model?: Pick<LlmModel, 'kind' | 'maxAttachments' | 'max_attachments'> | null): number {
  const raw = model?.maxAttachments ?? model?.max_attachments;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (model?.kind === 'image') return 14;
  return 5;
}

export type ChatModelsResponse = {
  models: LlmModel[];
  available: boolean;
  imageModels?: LlmModel[];
};

export type ChatHistoryItem = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type StreamChatParams = {
  message: string;
  model?: string | null;
  history?: ChatHistoryItem[];
  /** Force thinking on/off; omit for model default (reasoner = on). */
  thinking?: boolean | null;
  onThinking?: (text: string) => void;
  onToken?: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
};

export type GenerateImageParams = {
  prompt: string;
  model?: string | null;
  aspect_ratio?: string | null;
  quality?: string | null;
  resolution?: string | null;
  /** Reference images (data URLs or https) for Seedream i2i. */
  images?: string[] | null;
};

export type GenerateImageResult = {
  images: string[];
  text?: string | null;
  model: string;
};

/** List text + image models. */
export const fetchLlmModels = () =>
  request<ChatModelsResponse>({
    url: '/api/v1/chat/models',
    method: 'get',
  });

/** Generate an image via Doubao Seedream (non-stream). */
export const generateImage = (data: GenerateImageParams) =>
  request<GenerateImageResult>({
    url: '/api/v1/chat/image',
    method: 'post',
    data: {
      prompt: data.prompt,
      model: data.model || undefined,
      aspect_ratio: data.aspect_ratio || undefined,
      quality: data.quality || undefined,
      resolution: data.resolution || undefined,
      images: data.images?.length ? data.images : undefined,
    },
  });

/**
 * POST /message and parse SSE events (token + thinking).
 * Kept as raw fetch — axios is a poor fit for streaming bodies.
 */
export async function streamChatMessage({
  message,
  model,
  history = [],
  thinking,
  onThinking,
  onToken,
  onError,
  onDone,
  signal,
}: StreamChatParams): Promise<void> {
  let response: Response;
  try {
    const token = getToken();
    response = await fetch('/api/v1/chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        model: model || undefined,
        history,
        ...(thinking == null ? {} : { thinking }),
      }),
      signal,
    });
  } catch (err: any) {
    if (signal?.aborted) return;
    onError?.(err?.message || 'Network error');
    return;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.detail || detail;
    } catch {
      /* ignore */
    }
    onError?.(typeof detail === 'string' ? detail : JSON.stringify(detail));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError?.('Streaming not supported in this browser');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

  const handleEvent = (raw: string) => {
    const data = raw.trim();
    if (!data || data === '[DONE]') {
      if (data === '[DONE]') {
        sawDone = true;
        onDone?.();
      }
      return;
    }
    let obj: { type?: string; text?: string; message?: string };
    try {
      obj = JSON.parse(data);
    } catch {
      return;
    }
    if (obj.type === 'thinking' && obj.text) {
      onThinking?.(obj.text);
    } else if (obj.type === 'token' && obj.text) {
      onToken?.(obj.text);
    } else if (obj.type === 'error') {
      onError?.(obj.message || 'LLM error');
    } else if (obj.type === 'done') {
      sawDone = true;
      onDone?.();
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const sep = buffer.indexOf('\n');
        if (sep === -1) break;
        const line = buffer.slice(0, sep).replace(/\r$/, '');
        buffer = buffer.slice(sep + 1);
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('data:')) {
          handleEvent(line.slice(5));
        }
      }
    }
    if (buffer.trim().startsWith('data:')) {
      handleEvent(buffer.trim().slice(5));
    }
    if (!sawDone) onDone?.();
  } catch (err: any) {
    if (signal?.aborted) return;
    onError?.(err?.message || 'Stream interrupted');
  }
}
