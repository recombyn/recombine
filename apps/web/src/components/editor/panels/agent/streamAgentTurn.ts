/**
 * Stream one /api/v1/chat/agent turn (thinking + tokens + tool_calls).
 */

import { getToken } from '@/utils/token';

export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export type StreamAgentTurnParams = {
  messages: AgentMessage[];
  model?: string | null;
  onThinking?: (text: string) => void;
  onToken?: (text: string) => void;
  onToolCall?: (tc: { id: string; name: string; arguments: string }) => void;
  onAssistantMessage?: (msg: AgentMessage & { role: 'assistant' }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

export async function streamAgentTurn({
  messages,
  model,
  onThinking,
  onToken,
  onToolCall,
  onAssistantMessage,
  onError,
  signal,
}: StreamAgentTurnParams): Promise<void> {
  let response: Response;
  try {
    const token = getToken();
    response = await fetch('/api/v1/chat/agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages,
        model: model || undefined,
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
    onError?.('Streaming not supported');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;

  const handleEvent = (raw: string) => {
    const data = raw.trim();
    if (!data) return;
    if (data === '[DONE]') {
      sawDone = true;
      return;
    }
    let obj: any;
    try {
      obj = JSON.parse(data);
    } catch {
      return;
    }
    if (obj.type === 'thinking' && obj.text) onThinking?.(obj.text);
    else if (obj.type === 'token' && obj.text) onToken?.(obj.text);
    else if (obj.type === 'tool_call' && obj.toolCall) {
      onToolCall?.({
        id: String(obj.toolCall.id || ''),
        name: String(obj.toolCall.name || ''),
        arguments: String(obj.toolCall.arguments || '{}'),
      });
    } else if (obj.type === 'message' && obj.message) {
      onAssistantMessage?.(obj.message);
    } else if (obj.type === 'error') {
      onError?.(obj.message || 'Agent error');
    } else if (obj.type === 'done') {
      sawDone = true;
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
        if (line.startsWith('data:')) handleEvent(line.slice(5));
      }
    }
    if (buffer.trim().startsWith('data:')) handleEvent(buffer.trim().slice(5));
    void sawDone;
  } catch (err: any) {
    if (signal?.aborted) return;
    onError?.(err?.message || 'Stream interrupted');
  }
}
