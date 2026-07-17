import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteChatSessionApi,
  fetchChatSessions,
  upsertChatSessionApi,
} from '@/apis/chatSessions';
import {
  formatChatTime,
  loadActiveChatId,
  loadChatSessions,
  saveActiveChatId,
  saveChatSessions,
  titleFromMessages,
  upsertChatSession,
  type ChatSession,
  type ChatSessionMessage,
} from '@/components/editor/panels/chatSessions';
import { getToken } from '@/utils/token';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** DeepSeek reasoning stream (optional). */
  thinking?: string;
  streaming?: boolean;
  /** Cursor-like tool execution steps. */
  steps?: Array<{
    id: string;
    name: string;
    status: 'running' | 'done' | 'error';
    summary?: string;
  }>;
  /** Canvas was mutated by the reply to this user turn; restore available while editing (in-memory). */
  canRestore?: boolean;
  /** Epoch ms when this assistant turn started streaming. */
  startedAt?: number;
  /** Wall time for completed turn (ms). */
  durationMs?: number;
  /** Quick-reply chips from ask_user (e.g. create canvas). */
  choices?: string[];
};

function toUiMessages(session: ChatSession): ChatUiMessage[] {
  return session.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    thinking: m.thinking,
  }));
}

function dtoToSession(dto: {
  id: string;
  title: string;
  updatedAt: number;
  messages?: Array<{
    id?: string;
    role: string;
    content: string;
    thinking?: string | null;
  }>;
}): ChatSession {
  return {
    id: dto.id,
    title: dto.title || '新对话',
    updatedAt: dto.updatedAt || Date.now(),
    messages: (dto.messages || []).map((m, i) => ({
      id: m.id || `msg_${i}`,
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content || '',
      ...(m.thinking ? { thinking: m.thinking } : {}),
    })),
  };
}

/**
 * Agent chat session persistence — localStorage cache + API sync when logged in.
 */
export function useChatSessions(documentId: string | null | undefined) {
  const scope = (documentId || '').trim() || '__none__';
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState(() => uid());
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedJson = useRef<string>('');

  // Load this document's chats when switching templates (local first, then API).
  useEffect(() => {
    let cancelled = false;
    const saved = loadChatSessions(scope);
    setSessions(saved);
    const activeId = loadActiveChatId(scope);
    const active = activeId ? saved.find((s) => s.id === activeId) : saved[0];
    if (active) {
      setSessionId(active.id);
      setMessages(toUiMessages(active));
    } else {
      setSessionId(uid());
      setMessages([]);
    }
    setReadyScope(scope);

    if (!isLoggedIn()) return;

    (async () => {
      try {
        const res = await fetchChatSessions(scope);
        if (cancelled) return;
        const remote = (res.sessions || []).map(dtoToSession);
        if (remote.length === 0) return;
        saveChatSessions(remote, scope);
        setSessions(remote);
        const aid = loadActiveChatId(scope);
        const next = (aid && remote.find((s) => s.id === aid)) || remote[0];
        if (next) {
          setSessionId(next.id);
          setMessages(toUiMessages(next));
          saveActiveChatId(next.id, scope);
        }
      } catch {
        /* offline / unauthenticated — keep local cache */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Persist only after hydrate for the current scope (avoid cross-doc writes).
  useEffect(() => {
    if (readyScope !== scope) return;
    if (messages.some((m) => m.streaming)) return;
    if (messages.length === 0) {
      saveActiveChatId(sessionId, scope);
      return;
    }
    const persisted: ChatSession = {
      id: sessionId,
      title: titleFromMessages(messages as ChatSessionMessage[]),
      updatedAt: Date.now(),
      messages: messages
        .filter((m) => m.content || m.thinking)
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          ...(m.thinking ? { thinking: m.thinking } : {}),
        })),
    };
    setSessions((prev) => {
      const next = upsertChatSession(prev, persisted);
      saveChatSessions(next, scope);
      return next;
    });
    saveActiveChatId(sessionId, scope);

    // Debounced API sync when logged in
    if (!isLoggedIn()) return;
    const payloadJson = JSON.stringify({
      id: persisted.id,
      title: persisted.title,
      messages: persisted.messages,
    });
    if (payloadJson === lastSyncedJson.current) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      upsertChatSessionApi({
        projectId: scope,
        id: persisted.id,
        title: persisted.title,
        messages: persisted.messages,
      })
        .then(() => {
          lastSyncedJson.current = payloadJson;
        })
        .catch(() => {
          /* keep local; retry on next change */
        });
    }, 600);

    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [messages, sessionId, scope, readyScope]);

  const startNewChat = useCallback(() => {
    const id = uid();
    setSessionId(id);
    setMessages([]);
    saveActiveChatId(id, scope);
    lastSyncedJson.current = '';
  }, [scope]);

  const openSession = useCallback(
    (id: string) => {
      const list = loadChatSessions(scope);
      const found = list.find((s) => s.id === id);
      if (!found) return;
      setSessions(list);
      setSessionId(found.id);
      setMessages(toUiMessages(found));
      saveActiveChatId(found.id, scope);
      lastSyncedJson.current = '';
    },
    [scope]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        saveChatSessions(next, scope);
        return next;
      });
      if (isLoggedIn()) {
        deleteChatSessionApi(id).catch(() => {
          /* ignore */
        });
      }
      if (id === sessionId) {
        const nid = uid();
        setSessionId(nid);
        setMessages([]);
        saveActiveChatId(nid, scope);
        lastSyncedJson.current = '';
      }
    },
    [sessionId, scope]
  );

  const chatTitle =
    messages.length === 0 ? '新对话' : titleFromMessages(messages as ChatSessionMessage[]);

  return {
    sessions,
    sessionId,
    messages,
    setMessages,
    chatTitle,
    startNewChat,
    openSession,
    deleteSession,
    formatChatTime,
    newMessageId: uid,
  };
}
