/** Persist agent chat sessions in localStorage — scoped per template/document. */

export type ChatSessionMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** DeepSeek reasoning / chain-of-thought (optional). */
  thinking?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatSessionMessage[];
};

const SESSIONS_PREFIX = 'resume-chat-sessions-v2:';
const ACTIVE_PREFIX = 'resume-chat-active-v2:';
const MAX_SESSIONS = 40;

function scopeKey(scopeId: string | null | undefined): string {
  const id = (scopeId || '').trim();
  return id || '__none__';
}

function sessionsKey(scopeId: string | null | undefined): string {
  return `${SESSIONS_PREFIX}${scopeKey(scopeId)}`;
}

function activeKey(scopeId: string | null | undefined): string {
  return `${ACTIVE_PREFIX}${scopeKey(scopeId)}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadChatSessions(scopeId?: string | null): ChatSession[] {
  const list = safeParse<ChatSession[]>(localStorage.getItem(sessionsKey(scopeId)), []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.messages))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function saveChatSessions(sessions: ChatSession[], scopeId?: string | null) {
  const trimmed = sessions
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_SESSIONS);
  localStorage.setItem(sessionsKey(scopeId), JSON.stringify(trimmed));
}

export function loadActiveChatId(scopeId?: string | null): string | null {
  const id = localStorage.getItem(activeKey(scopeId));
  return id || null;
}

export function saveActiveChatId(id: string | null, scopeId?: string | null) {
  const key = activeKey(scopeId);
  if (!id) localStorage.removeItem(key);
  else localStorage.setItem(key, id);
}

export function titleFromMessages(messages: ChatSessionMessage[]): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!first) return '新对话';
  const t = first.content.trim().replace(/\s+/g, ' ');
  return t.length > 28 ? `${t.slice(0, 28)}…` : t;
}

export function upsertChatSession(
  sessions: ChatSession[],
  next: ChatSession
): ChatSession[] {
  const without = sessions.filter((s) => s.id !== next.id);
  return [next, ...without]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_SESSIONS);
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
