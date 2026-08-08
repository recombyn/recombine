import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteChatSessionApi,
  fetchChatSessions,
  upsertChatSessionApi,
  type ChatSessionMessageDto,
} from '@/apis/chatSessions';
import type { TaskState } from '@/components/editor/panels/agent/agentMemory';
import type { ChatUiMessage } from '@/components/editor/panels/agent/ChatTurnList';
import { getToken } from '@/utils/token';

export type ChatSessionMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contexts?: ChatUiMessage['contexts'];
  contentMarked?: string;
  thinking?: string;
  durationMs?: number;
  intent?: string;
  steps?: ChatUiMessage['steps'];
  images?: string[];
  videos?: string[];
  imageModelId?: string;
  imageModelLabel?: string;
  imageAspectRatio?: string;
  designTaskId?: string;
  canResume?: boolean;
  proposedOps?: ChatUiMessage['proposedOps'];
  proposalId?: string;
  choices?: string[];
  applyChoice?: string;
  choiceUi?: ChatUiMessage['choiceUi'];
};

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
};

const MAX_CHAT_SESSIONS = 40;

function titleFromMessages(messages: ChatSessionMessage[]): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!first) return '新对话';
  const t = first.content.trim().replace(/\s+/g, ' ');
  return t.length > 28 ? `${t.slice(0, 28)}…` : t;
}

function upsertChatSession(sessions: ChatSession[], next: ChatSession): ChatSession[] {
  const without = sessions.filter((s) => s.id !== next.id);
  return [next, ...without]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_CHAT_SESSIONS);
}

export function formatChatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function chatUid() {
  return Math.random().toString(36).slice(2, 10);
}

function isChatLoggedIn(): boolean {
  return Boolean(getToken());
}

type PendingChatSync = {
  projectId: string;
  id: string;
  title: string;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
  payloadJson: string;
};

function pickAskPersistFields(m: {
  designTaskId?: string | null;
  canResume?: boolean | null;
  proposedOps?: ChatUiMessage['proposedOps'] | null;
  proposalId?: string | null;
  choices?: string[] | null;
  applyChoice?: string | null;
  choiceUi?: ChatUiMessage['choiceUi'] | null;
}): Partial<ChatSessionMessage> {
  return {
    ...(m.designTaskId ? { designTaskId: m.designTaskId } : {}),
    ...(m.canResume ? { canResume: true } : {}),
    ...(m.proposedOps?.length ? { proposedOps: m.proposedOps } : {}),
    ...(m.proposalId ? { proposalId: m.proposalId } : {}),
    ...(m.choices?.length ? { choices: m.choices } : {}),
    ...(m.applyChoice ? { applyChoice: m.applyChoice } : {}),
    ...(m.choiceUi ? { choiceUi: m.choiceUi } : {}),
  };
}

function toUiMessages(session: ChatSession): ChatUiMessage[] {
  return session.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    ...(m.contexts?.length ? { contexts: m.contexts } : {}),
    ...(m.contentMarked ? { contentMarked: m.contentMarked } : {}),
    thinking: m.thinking,
    ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
    ...(m.intent ? { intent: m.intent } : {}),
    ...(m.steps?.length ? { steps: m.steps } : {}),
    ...(m.images?.length ? { images: m.images } : {}),
    ...(m.videos?.length ? { videos: m.videos } : {}),
    ...(m.imageModelId ? { imageModelId: m.imageModelId } : {}),
    ...(m.imageModelLabel ? { imageModelLabel: m.imageModelLabel } : {}),
    ...(m.imageAspectRatio ? { imageAspectRatio: m.imageAspectRatio } : {}),
    ...pickAskPersistFields(m),
  }));
}

function dtoToSession(dto: {
  id: string;
  title: string;
  updatedAt: number;
  taskState?: TaskState | null;
  messages?: ChatSessionMessageDto[];
}): ChatSession {
  return {
    id: dto.id,
    title: dto.title || '新对话',
    updatedAt: dto.updatedAt || Date.now(),
    taskState: dto.taskState || null,
    messages: (dto.messages || []).map((m, i) => ({
      id: m.id || `msg_${i}`,
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content || '',
      ...(m.contexts?.length ? { contexts: m.contexts } : {}),
      ...(m.contentMarked ? { contentMarked: m.contentMarked } : {}),
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
      ...(m.intent ? { intent: m.intent } : {}),
      ...(m.steps?.length ? { steps: m.steps } : {}),
      ...(m.images?.length ? { images: m.images } : {}),
      ...(m.videos?.length ? { videos: m.videos } : {}),
      ...(m.imageModelId ? { imageModelId: m.imageModelId } : {}),
      ...(m.imageModelLabel ? { imageModelLabel: m.imageModelLabel } : {}),
      ...(m.imageAspectRatio ? { imageAspectRatio: m.imageAspectRatio } : {}),
      ...pickAskPersistFields(m),
    })),
  };
}

function messagesToPersisted(messages: ChatUiMessage[]): ChatSessionMessage[] {
  return messages
    .filter(
      (m) =>
        m.content ||
        m.thinking ||
        m.intent ||
        m.canResume ||
        m.designTaskId ||
        (m.proposedOps && m.proposedOps.length) ||
        m.proposalId ||
        m.choiceUi ||
        (m.contexts && m.contexts.length) ||
        (m.steps && m.steps.length) ||
        (m.images && m.images.length) ||
        (m.videos && m.videos.length)
    )
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ...(m.contexts?.length ? { contexts: m.contexts } : {}),
      ...(m.contentMarked ? { contentMarked: m.contentMarked } : {}),
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
      ...(m.intent ? { intent: m.intent } : {}),
      ...(m.steps?.length
        ? {
            steps: m.steps.map((s) => ({
              ...s,
              status: s.status === 'running' ? ('done' as const) : s.status,
            })),
          }
        : {}),
      ...(m.images?.length ? { images: m.images } : {}),
      ...(m.videos?.length ? { videos: m.videos } : {}),
      ...(m.imageModelId ? { imageModelId: m.imageModelId } : {}),
      ...(m.imageModelLabel ? { imageModelLabel: m.imageModelLabel } : {}),
      ...(m.imageAspectRatio ? { imageAspectRatio: m.imageAspectRatio } : {}),
      ...pickAskPersistFields(m),
    }));
}

/** Agent chat — in-memory + API when logged in. No localStorage session dumps. */
export function useChatSessions(documentId: string | null | undefined) {
  const scope = (documentId || '').trim() || '__none__';
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState(() => chatUid());
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const [pendingLongSuggestions, setPendingLongSuggestions] = useState<
    Array<{ kind: string; text: string }>
  >([]);
  const sessionsRef = useRef<ChatSession[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncRef = useRef<PendingChatSync | null>(null);
  const lastSyncedJson = useRef<string>('');
  const apiDisabledRef = useRef(false);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const flushPendingSync = useCallback(() => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    const pending = pendingSyncRef.current;
    if (!pending || !isChatLoggedIn() || apiDisabledRef.current) return;
    if (pending.payloadJson === lastSyncedJson.current) return;
    pendingSyncRef.current = null;
    void (async () => {
      try {
        await upsertChatSessionApi({
          projectId: pending.projectId || '__none__',
          id: pending.id,
          title: pending.title,
          messages: pending.messages,
          ...(pending.taskState != null ? { taskState: pending.taskState } : {}),
        });
        lastSyncedJson.current = pending.payloadJson;
      } catch (err: any) {
        if (err?.response?.status === 401) apiDisabledRef.current = true;
        if (!pendingSyncRef.current) pendingSyncRef.current = pending;
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    flushPendingSync();
    setReadyScope(null);
    setSessions([]);
    setSessionId(chatUid());
    setMessages([]);
    setTaskState(null);
    lastSyncedJson.current = '';

    if (!isChatLoggedIn() || apiDisabledRef.current) {
      setReadyScope(scope);
      return;
    }

    async function loadRemoteSessions() {
      try {
        const res = await fetchChatSessions({
          projectId: scope || '__none__',
        });
        if (cancelled) return;
        const remote = (res.sessions || []).map((s) =>
          dtoToSession({ ...s, taskState: s.taskState as TaskState | undefined })
        );
        setSessions(remote);
        if (remote[0]) {
          setSessionId(remote[0].id);
          setMessages(toUiMessages(remote[0]));
          setTaskState(remote[0].taskState || null);
          lastSyncedJson.current = JSON.stringify({
            id: remote[0].id,
            title: remote[0].title,
            messages: remote[0].messages,
            taskState: remote[0].taskState || null,
          });
        } else {
          setSessionId(chatUid());
          setMessages([]);
        }
      } catch (err: any) {
        if (err?.response?.status === 401) apiDisabledRef.current = true;
        if (!cancelled) {
          setSessionId(chatUid());
          setMessages([]);
        }
      } finally {
        if (!cancelled) setReadyScope(scope);
      }
    }
    void loadRemoteSessions();

    return () => {
      cancelled = true;
      flushPendingSync();
    };
  }, [scope, flushPendingSync]);

  useEffect(() => {
    const onUnauthorized = () => {
      apiDisabledRef.current = true;
    };
    window.addEventListener('recombine:auth-unauthorized', onUnauthorized);
    return () => window.removeEventListener('recombine:auth-unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    const onHide = () => flushPendingSync();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingSync();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flushPendingSync();
    };
  }, [flushPendingSync]);

  useEffect(() => {
    if (readyScope !== scope) return;
    if (messages.some((m) => m.streaming)) return;

    const persistedMsgs = messagesToPersisted(messages);
    if (persistedMsgs.length === 0 && !taskState) return;

    const persisted: ChatSession = {
      id: sessionId,
      title: titleFromMessages(persistedMsgs),
      updatedAt: Date.now(),
      messages: persistedMsgs,
      taskState,
    };
    setSessions((prev) => upsertChatSession(prev, persisted));

    if (!isChatLoggedIn() || apiDisabledRef.current) return;

    const payloadJson = JSON.stringify({
      id: persisted.id,
      title: persisted.title,
      messages: persisted.messages,
      taskState: taskState || null,
    });
    if (payloadJson === lastSyncedJson.current) return;
    pendingSyncRef.current = {
      projectId: scope,
      id: persisted.id,
      title: persisted.title,
      messages: persisted.messages,
      taskState,
      payloadJson,
    };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      flushPendingSync();
    }, 600);

    return () => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
        syncTimer.current = null;
      }
    };
  }, [messages, sessionId, scope, readyScope, flushPendingSync, taskState]);

  const startNewChat = useCallback(() => {
    flushPendingSync();
    const id = chatUid();
    setSessionId(id);
    setMessages([]);
    setTaskState(null);
    lastSyncedJson.current = '';
  }, [flushPendingSync]);

  const openSession = useCallback(
    (id: string) => {
      flushPendingSync();
      const found = sessionsRef.current.find((sess) => sess.id === id);
      if (!found) return;
      setSessionId(found.id);
      setMessages(toUiMessages(found));
      setTaskState(found.taskState || null);
      lastSyncedJson.current = JSON.stringify({
        id: found.id,
        title: found.title,
        messages: found.messages,
        taskState: found.taskState || null,
      });
    },
    [flushPendingSync]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((sess) => sess.id !== id));
      if (isChatLoggedIn()) {
        void (async () => {
          try {
            await deleteChatSessionApi(id);
          } catch {
            /* ignore */
          }
        })();
      }
      if (id === sessionId) {
        const nid = chatUid();
        setSessionId(nid);
        setMessages([]);
        setTaskState(null);
        lastSyncedJson.current = '';
      }
    },
    [sessionId]
  );

  /** Re-fetch session list (history panel open). Keeps the active turn in place. */
  const refreshSessions = useCallback(async () => {
    flushPendingSync();
    if (!isChatLoggedIn() || apiDisabledRef.current) return;
    try {
      const res = await fetchChatSessions({
        projectId: scope || '__none__',
      });
      const remote = (res.sessions || []).map((s) =>
        dtoToSession({ ...s, taskState: s.taskState as TaskState | undefined })
      );
      setSessions(remote);
    } catch (err: any) {
      if (err?.response?.status === 401) apiDisabledRef.current = true;
    }
  }, [flushPendingSync, scope]);

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
    refreshSessions,
    formatChatTime,
    newMessageId: chatUid,
    taskState,
    setTaskState,
    pendingLongSuggestions,
    setPendingLongSuggestions,
  };
}
