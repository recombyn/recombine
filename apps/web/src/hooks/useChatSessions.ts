import { useCallback, useEffect, useRef, useState } from 'react';
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
};

/**
 * Agent chat session persistence (localStorage) —  colocated hook.
 */
export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadChatSessions());
  const [sessionId, setSessionId] = useState(() => loadActiveChatId() || uid());
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const saved = loadChatSessions();
    setSessions(saved);
    const activeId = loadActiveChatId();
    const active = activeId ? saved.find((s) => s.id === activeId) : saved[0];
    if (active) {
      setSessionId(active.id);
      setMessages(
        active.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      );
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (messages.some((m) => m.streaming)) return;
    if (messages.length === 0) {
      saveActiveChatId(sessionId);
      return;
    }
    const persisted: ChatSession = {
      id: sessionId,
      title: titleFromMessages(messages as ChatSessionMessage[]),
      updatedAt: Date.now(),
      messages: messages
        .filter((m) => m.content)
        .map((m) => ({ id: m.id, role: m.role, content: m.content })),
    };
    setSessions((prev) => {
      const next = upsertChatSession(prev, persisted);
      saveChatSessions(next);
      return next;
    });
    saveActiveChatId(sessionId);
  }, [messages, sessionId]);

  const startNewChat = useCallback(() => {
    const id = uid();
    setSessionId(id);
    setMessages([]);
    saveActiveChatId(id);
  }, []);

  const openSession = useCallback((id: string) => {
    const list = loadChatSessions();
    const found = list.find((s) => s.id === id);
    if (!found) return;
    setSessions(list);
    setSessionId(found.id);
    setMessages(
      found.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))
    );
    saveActiveChatId(found.id);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        saveChatSessions(next);
        return next;
      });
      if (id === sessionId) {
        const nid = uid();
        setSessionId(nid);
        setMessages([]);
        saveActiveChatId(nid);
      }
    },
    [sessionId]
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
