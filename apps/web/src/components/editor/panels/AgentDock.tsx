import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import { BiMessageSquareAdd, BiTimeFive } from 'react-icons/bi';
import { LuPanelRight } from 'react-icons/lu';
import {
  HiOutlineChevronRight,
  HiOutlineTrash,
} from 'react-icons/hi2';
import { Icon } from '@/components/base/icon';
import {
  fetchLlmModels,
  generateImage,
  isVolcanoCatalogModel,
  maxAttachmentsFor,
  type LlmModel,
} from '@/apis/chat';
import {
  peekHomeAgentBoot,
  clearHomeAgentBoot,
  attachmentsFromBoot,
} from '@/utils/homeAgentBoot';
import { setAgentBusy, setDocument, patchDocumentNode, pushEditorHistory, setSelectedNodeId } from '@/store/modules/editor';
import {
  addNodeToDocument,
  createImageNode,
} from '@/components/rcb/scene/sceneDocument';
import {
  deleteChatSessionApi,
  fetchChatSessions,
  upsertChatSessionApi,
} from '@/apis/chatSessions';
import { getToken } from '@/utils/token';
import { deleteUploadedFile, uploadComposerAttachment } from '@/apis/upload';
import { parseNodeText } from '@/components/rcb/scene/sceneText';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import { message } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import {
  chipBaseKey,
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import {
  runDesignAgent,
  resolveDesignTargetFrame,
  nodeIdsInsideFrame,
  frameIdContainingNode,
  buildEditContextSvg,
  buildSceneNodesForEdit,
  buildSceneNodesForIds,
  buildSceneNodesForCanvas,
  buildSceneFramesSnapshot,
} from '@/components/editor/panels/agent/runDesignAgent';
import {
  applyClientFrameHints,
  applyMemoryPatch,
  buildShortTermFromMessages,
  buildTaskStateFromDocument,
  emptyTaskState,
  type MemoryPatch,
  type TaskState,
} from '@/components/editor/panels/agent/agentMemory';
import ChatTurnList, { type ChatUiMessage } from '@/components/editor/panels/agent/ChatTurnList';
import AgentComposerShell, {
  type ComposerRunMode,
} from '@/components/editor/panels/agent/AgentComposerShell';
import { normalizeCanvasSizeChip } from '@/components/editor/chrome/SizePresetPanel';
import {
  customProvidersAsModels,
  isCustomModelId,
} from '@/components/editor/panels/agent/customLlmProviders';
import { routeOverridesForApi } from '@/components/editor/panels/agent/AgentModelsPanel';
import {
  fetchDesignCatalog,
  type DesignCatalog,
  type DesignScene,
} from '@/apis/design';
import { setAllowedCanvasToolKeys } from '@/components/editor/panels/agent/toolOpsContract';
import { type CanvasUiBridge } from '@/components/editor/panels/agent/designTools';
import {
  DEFAULT_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import ModelPickerPanel, {
  AUTO_MODEL,
  isImageKind,
  modelDescription,
  type ModelPickerTab,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { cn } from '@/utils/classnames';


type ChatSessionMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  durationMs?: number;
  intent?: string;
  steps?: ChatUiMessage['steps'];
  images?: string[];
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
};

const MAX_CHAT_SESSIONS = 40;

type ActivityStepEvent = {
  kind: 'thought' | 'added' | 'updated' | 'explored' | 'skipped' | 'deleted' | 'tool';
  status: 'running' | 'done';
  durationSec?: number;
  count?: number;
  skillName?: string;
  detail?: string;
};

function humanizeDesignError(
  t: (key: string, opts?: Record<string, unknown>) => string,
  raw: string | undefined | null
): string {
  const msg = String(raw || '').trim();
  if (!msg) return t('agent.requestFailed');
  // Never surface Python NameErrors / internal helper names to the chat face.
  if (
    /name\s+['`]_?\w+['`]\s+is not defined/i.test(msg) ||
    /^NameError:/i.test(msg) ||
    /_is_(analysis|summary)_skill/i.test(msg)
  ) {
    return t('agent.designExecFailed');
  }
  const low = msg.toLowerCase();
  if (low.includes('missing_tool_ops')) return t('agent.designOpsMissing');
  if (
    low.startsWith('skill_failed:') ||
    low.startsWith('tool_ops_invalid') ||
    low.startsWith('validate_failed') ||
    low.startsWith('final_validate')
  ) {
    return t('agent.designExecFailed');
  }
  // Hide other internal code-ish payloads.
  if (/^[a-z][a-z0-9_]+:/i.test(msg) && !/\s/.test(msg.slice(0, 40))) {
    return t('agent.designExecFailed');
  }
  return msg;
}

function formatActivityLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  ev: ActivityStepEvent
): string | null {
  // Classic Cursor-style verbs — op details go under the label (step.summary).
  if (ev.kind === 'thought') {
    if (ev.status === 'running') return t('agent.activityThoughtRunning');
    if (ev.status === 'done' && ev.durationSec != null) {
      return t('agent.activityThought', { seconds: ev.durationSec });
    }
    return null;
  }
  if (ev.kind === 'added') {
    return ev.count != null && ev.count > 0
      ? t('agent.activityAddedCount', { count: ev.count })
      : t('agent.activityAdded');
  }
  if (ev.kind === 'updated') {
    return ev.count != null && ev.count > 0
      ? t('agent.activityUpdatedCount', { count: ev.count })
      : t('agent.activityUpdated');
  }
  if (ev.kind === 'explored') {
    return ev.status === 'running'
      ? t('agent.activityExploredRunning')
      : t('agent.activityExplored');
  }
  if (ev.kind === 'skipped') return t('agent.activitySkipped');
  if (ev.kind === 'deleted') {
    return ev.count != null && ev.count > 0
      ? t('agent.activityDeletedCount', { count: ev.count, defaultValue: `Deleted ${ev.count}` })
      : t('agent.activityDeleted', { defaultValue: 'Deleted' });
  }
  // Tool call label stays short; op details go in step.summary.
  return ev.status === 'running' ? t('agent.activityToolRunning') : t('agent.activityTool');
}

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

function formatChatTime(ts: number): string {
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

function toUiMessages(session: ChatSession): ChatUiMessage[] {
  return session.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    thinking: m.thinking,
    ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
    ...(m.intent ? { intent: m.intent } : {}),
    ...(m.steps?.length ? { steps: m.steps } : {}),
    ...(m.images?.length ? { images: m.images } : {}),
  }));
}

function dtoToSession(dto: {
  id: string;
  title: string;
  updatedAt: number;
  taskState?: TaskState | null;
  messages?: Array<{
    id?: string;
    role: string;
    content: string;
    thinking?: string | null;
    durationMs?: number | null;
    intent?: string | null;
    steps?: ChatUiMessage['steps'] | null;
    images?: string[] | null;
  }>;
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
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(typeof m.durationMs === 'number' ? { durationMs: m.durationMs } : {}),
      ...(m.intent ? { intent: m.intent } : {}),
      ...(m.steps?.length ? { steps: m.steps } : {}),
      ...(m.images?.length ? { images: m.images } : {}),
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
        (m.steps && m.steps.length) ||
        (m.images && m.images.length)
    )
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
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
    }));
}

/** Agent chat — in-memory + API when logged in. No localStorage session dumps. */
function useChatSessions(documentId: string | null | undefined) {
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
    void upsertChatSessionApi({
      projectId: pending.projectId,
      id: pending.id,
      title: pending.title,
      messages: pending.messages,
      taskState: pending.taskState ?? undefined,
    })
      .then(() => {
        lastSyncedJson.current = pending.payloadJson;
      })
      .catch((err: any) => {
        if (err?.response?.status === 401) apiDisabledRef.current = true;
        if (!pendingSyncRef.current) pendingSyncRef.current = pending;
      });
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

    (async () => {
      try {
        const res = await fetchChatSessions(scope);
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
    })();

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
        deleteChatSessionApi(id).catch(() => {
          /* ignore */
        });
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
    newMessageId: chatUid,
    taskState,
    setTaskState,
    pendingLongSuggestions,
    setPendingLongSuggestions,
  };
}

type AgentDockProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  draftPrompt?: string | null;
  /** When true with draftPrompt, auto-send after models are ready (home → editor). */
  autoSubmitDraft?: boolean;
  onDraftConsumed?: () => void;
  draftAttachments?: ComposerContext[];
  /** Home → editor: preferred model + Seedream settings. */
  draftModelId?: string | null;
  draftImageAspectRatio?: string | null;
  draftImageQuality?: string | null;
  draftImageResolution?: string | null;
  /** Home → editor: product category scene (website / mobile / image / poster). */
  draftScene?: DesignScene | null;
  /** Right-click 「添加到 Chat」— node id, `frame:id`, or multiple ids as one 组N chip. */
  attachToChat?: string | string[] | null;
  onAttachConsumed?: () => void;
  /** Onboarding spotlight target id (`data-tour`). */
  dataTour?: string;
  /** Editor chrome bridge for zoom / panels / agent mode tools. */
  canvasUi?: CanvasUiBridge | null;
};

/** Merge catalog + imageModels; normalize kind so Seedream is always image. */
function normalizeModelList(
  models: LlmModel[] | undefined,
  imageModels?: LlmModel[] | null
): LlmModel[] {
  const byId = new Map<string, LlmModel>();
  for (const m of models || []) {
    if (!m?.id) continue;
    byId.set(m.id, m);
  }
  for (const m of imageModels || []) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m, kind: 'image' });
  }
  // Pro custom providers (local list) — selectable in design / Agent tab.
  for (const m of customProvidersAsModels()) {
    byId.set(m.id, m);
  }
  return [...byId.values()]
    .filter((m) => m.provider === 'custom' || isVolcanoCatalogModel(m))
    .map((m) => {
    const maxAttachments = maxAttachmentsFor(m);
    const base = { ...m, maxAttachments };
    if (isImageKind(m)) {
      return { ...base, kind: 'image' as const };
    }
    // Former "画布" svg bucket → show under Agent text models
    if (m.kind === 'svg') return { ...base, kind: 'text' as const };
    return { ...base, kind: (m.kind || 'text') as LlmModel['kind'] };
  });
}

function nodeKindLabel(node: any): string {
  const shape = String(node?.attrs?.shapeType || '');
  const key = String(node?.key || '');
  const map: Record<string, string> = {
    text: '文字',
    image: '图片',
    rect: '矩形',
    line: '线条',
    arrow: '箭头',
    ellipse: '椭圆',
    circle: '椭圆',
    triangle: '多边形',
    polygon: '多边形',
    star: '星形',
    pen: '钢笔',
    pencil: '画笔',
    path: '路径',
  };
  return map[shape] || map[key] || key || '元素';
}

/** Unique chip label: 矩形1 / 矩形2 / 多边形1 … (stable by position). */
function numberedNodeLabel(document: any, nodeId: string): string {
  const node = document?.deltaSetLike?.[nodeId];
  if (!node) return '元素';
  const base = nodeKindLabel(node);
  const delta = document?.deltaSetLike || {};
  const peers = Object.keys(delta)
    .filter((id) => {
      const n = delta[id];
      return Boolean(n) && nodeKindLabel(n) === base;
    })
    .sort((a, b) => {
      const na = delta[a];
      const nb = delta[b];
      const ya = Number(na?.y) || 0;
      const yb = Number(nb?.y) || 0;
      if (ya !== yb) return ya - yb;
      const xa = Number(na?.x) || 0;
      const xb = Number(nb?.x) || 0;
      if (xa !== xb) return xa - xb;
      return a.localeCompare(b);
    });
  const idx = Math.max(1, peers.indexOf(nodeId) + 1);
  return `${base}${idx}`;
}

function nextGroupChipLabel(chips: ComposerContext[]): string {
  let max = 0;
  for (const c of chips) {
    if (c.kind !== 'group' && c.kind !== 'multi') continue;
    const m = /^组(\d+)$/.exec(String(c.label || '').trim());
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `组${max + 1}`;
}

function buildComposerContext(
  document: any,
  selectedNodeIds: string[],
  activeFrameId: string | null,
  /** Existing chips — used to name multi-select as 组1 / 组2 … */
  existingChips: ComposerContext[] = []
): ComposerContext | null {
  const ids = selectedNodeIds.filter(Boolean);
  if (ids.length === 1) {
    const id = ids[0];
    const node = document?.deltaSetLike?.[id];
    if (!node) return null;
    const label = numberedNodeLabel(document, id);
    // Full snapshot (same shape as SCENE_NODES); artboard-local when inside a frame.
    const containingFrameId = frameIdContainingNode(document, id);
    const inventory = containingFrameId
      ? buildSceneNodesForEdit(document, containingFrameId, [id]).find((n) => n.id === id) ||
        buildSceneNodesForIds(document, [id])[0]
      : buildSceneNodesForIds(document, [id])[0];
    const lines = [
      '[Target element — full node; update_node may change any field]',
      containingFrameId ? `artboard_id: ${containingFrameId}` : null,
      inventory ? JSON.stringify(inventory) : `id: ${id}`,
    ].filter(Boolean) as string[];
    return {
      key: `node:${id}`,
      label,
      kind: String(node.key || 'shape'),
      payload: lines.join('\n'),
      ...(node.key === 'image' && String(node.attrs?.src || '').trim()
        ? { thumbUrl: String(node.attrs.src).trim() }
        : {}),
    };
  }
  if (ids.length > 1) {
    const key = `group:${[...ids].sort().join(',')}`;
    const reused = existingChips.find((c) => chipBaseKey(c.key) === key);
    const label = reused?.label || nextGroupChipLabel(existingChips);
    const frameIds = [
      ...new Set(ids.map((id) => frameIdContainingNode(document, id)).filter(Boolean)),
    ] as string[];
    const inventory =
      frameIds.length === 1
        ? buildSceneNodesForEdit(document, frameIds[0], ids).filter((n) => ids.includes(n.id))
        : buildSceneNodesForIds(document, ids);
    return {
      key,
      label,
      kind: 'group',
      payload: [
        '[Target group — full node snapshots; update_node may change any field]',
        `group: ${label}`,
        `count: ${ids.length}`,
        `ids: ${ids.join(', ')}`,
        JSON.stringify(inventory.slice(0, 40)),
      ].join('\n'),
    };
  }

  if (!activeFrameId || !document) return null;
  const frames = Array.isArray(document.frames) ? document.frames : [];
  const frame = frames.find((f: any) => f?.id === activeFrameId);
  if (!frame) return null;
  const name = String(frame.name || 'Frame');
  const w = Math.round(Number(frame.width) || 0);
  const h = Math.round(Number(frame.height) || 0);
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const fw = Math.max(1, Number(frame.width) || 1);
  const fh = Math.max(1, Number(frame.height) || 1);
  const bg = String(frame.backgroundColor || 'transparent');

  const childLines: string[] = [];
  const rootChildren: string[] = document?.deltaSetLike?.ROOT?.children || [];
  for (const id of rootChildren) {
    const node = document?.deltaSetLike?.[id];
    if (!node || !id) continue;
    const { left, top } = nodeLeftTop(document, node);
    const nw = Math.max(1, Number(node.width) || 1);
    const nh = Math.max(1, Number(node.height) || 1);
    // Treat as inside if the box mostly overlaps the artboard.
    const ow = Math.max(0, Math.min(left + nw, fx + fw) - Math.max(left, fx));
    const oh = Math.max(0, Math.min(top + nh, fy + fh) - Math.max(top, fy));
    if (ow * oh < nw * nh * 0.4) continue;
    const kind = nodeKindLabel(node);
    const label = numberedNodeLabel(document, id);
    const fill = String(node.attrs?.['fill-color'] ?? node.attrs?.fill ?? '');
    let line = `- id=${id} name="${label}" kind=${kind} box=${Math.round(nw)}×${Math.round(nh)} at (${Math.round(left)},${Math.round(top)})`;
    if (fill) line += ` fill=${fill}`;
    if (node.key === 'text') {
      const preview = parseNodeText(node.attrs || {}).slice(0, 120);
      if (preview) line += ` text="${preview.replace(/\n/g, ' ')}"`;
    }
    childLines.push(line);
    if (childLines.length >= 80) break;
  }

  return {
    key: `frame:${activeFrameId}`,
    label: name,
    kind: 'frame',
    payload: [
      '[Target artboard]',
      `id: ${activeFrameId}`,
      `name: ${name}`,
      `size: ${w}×${h} at (${Math.round(fx)}, ${Math.round(fy)})`,
      `background: ${bg}`,
      `elements (${childLines.length}):`,
      ...(childLines.length
        ? childLines
        : ['(empty artboard — no scene nodes inside yet)']),
    ].join('\n'),
  };
}

const AGENT_DOCK_WIDTH_KEY = 'agent-dock-width';
const AGENT_DOCK_MIN_W = 340;
const AGENT_DOCK_MAX_W = 560;
const AGENT_DOCK_DEFAULT_W = 360;

function clampAgentDockWidth(width: number): number {
  const viewportCap =
    typeof window !== 'undefined'
      ? Math.max(AGENT_DOCK_MIN_W, window.innerWidth - 360)
      : AGENT_DOCK_MAX_W;
  return Math.min(
    AGENT_DOCK_MAX_W,
    viewportCap,
    Math.max(AGENT_DOCK_MIN_W, Math.round(width))
  );
}

function readStoredAgentDockWidth(): number {
  try {
    const raw = localStorage.getItem(AGENT_DOCK_WIDTH_KEY);
    if (!raw) return AGENT_DOCK_DEFAULT_W;
    const n = Number(raw);
    if (!Number.isFinite(n)) return AGENT_DOCK_DEFAULT_W;
    return clampAgentDockWidth(n);
  } catch {
    return AGENT_DOCK_DEFAULT_W;
  }
}

/** Agent panel: chat + model picker + Agent input. */
export default function AgentDock({
  open,
  onClose,
  className,
  draftPrompt,
  autoSubmitDraft = false,
  onDraftConsumed,
  draftAttachments,
  draftModelId,
  draftImageAspectRatio,
  draftImageQuality,
  draftImageResolution,
  draftScene,
  attachToChat,
  onAttachConsumed,
  dataTour,
  canvasUi: canvasUiProp,
}: AgentDockProps): ReactNode {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const store = useStore();
  const document = useSelector((s: any) => s.editor.document);
  const activeFrameId = useSelector(
    (s: any) => (s.editor.document?.activeFrameId as string | null) ?? null
  );

  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState('auto');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('auto');
  const [imageQuality, setImageQuality] = useState<string>(DEFAULT_IMAGE_QUALITY);
  const [imageResolution, setImageResolution] = useState<string>(DEFAULT_IMAGE_RESOLUTION);
  const [imageCount, setImageCount] = useState<number>(DEFAULT_IMAGE_COUNT);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  /** @ / cube → model panel */
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  /** Left tab in model panel: design | image */
  const [modelPanelTab, setModelPanelTab] = useState<ModelPickerTab>('design');
  /** Context chips in the composer (right-click 添加到 Chat + file attachments). */
  const [contextChips, setContextChips] = useState<ComposerContext[]>([]);
  const contextChipsRef = useRef<ComposerContext[]>([]);
  contextChipsRef.current = contextChips;
  const pinnedContextKeysRef = useRef<Set<string>>(new Set());
  const contextDismissedKeyRef = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerRunMode>('agent');
  const [styleGroupId, setStyleGroupId] = useState<number | null>(null);
  const [designScene, setDesignScene] = useState<DesignScene | null>(null);
  const designSceneRef = useRef<DesignScene | null>(null);
  /** Last design SVG per artboard — sent back on edit-in-place follow-ups. */
  const lastAgentSvgByFrameRef = useRef<Map<string, string>>(new Map());
  const lastAgentFrameIdRef = useRef<string | null>(null);
  const [designCatalog, setDesignCatalog] = useState<DesignCatalog | null>(null);
  const canvasUi = canvasUiProp || null;
  const [newChatTip, setNewChatTip] = useState(false);
  /** Cursor-like: edit a past user message in-place. */
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [dockWidth, setDockWidth] = useState(AGENT_DOCK_DEFAULT_W);
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const currentId = useSelector((s: any) => s.editor.currentId as string | null);
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const location = useLocation();
  // Prefer Redux; fall back to /editor/:projectId so we don't hit projectId=__none__ while hydrating.
  const chatScopeId =
    (currentId || '').trim() || decodeURIComponent((routeProjectId || '').trim()) || null;
  const {
    sessions,
    sessionId,
    messages,
    setMessages,
    chatTitle,
    startNewChat: resetChatSession,
    openSession: loadChatSession,
    deleteSession: removeChatSession,
    formatChatTime,
    newMessageId,
    taskState,
    setTaskState,
    pendingLongSuggestions,
    setPendingLongSuggestions,
  } = useChatSessions(chatScopeId);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<AgentComposerHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Home → editor auto-send; flushed when modelsStatus leaves idle/loading. */
  const pendingAutoSubmitRef = useRef<string | null>(null);
  /** Pre-command document snapshots keyed by user message id. In-memory only. */
  const checkpointsRef = useRef<Map<string, any>>(new Map());
  /** After agent mutates canvas: show Undo / Keep / Review above composer. */
  const [pendingReview, setPendingReview] = useState<{
    userMessageId: string;
    assistantId: string;
  } | null>(null);
  const newChatTipTimer = useRef<number | null>(null);

  useEffect(() => {
    const fid = taskState?.canvas?.last_agent_frame_id;
    if (fid) lastAgentFrameIdRef.current = String(fid);
  }, [sessionId, taskState?.canvas?.last_agent_frame_id]);

  useEffect(() => {
    setDockWidth(readStoredAgentDockWidth());
  }, []);


  useEffect(() => {
    void fetchDesignCatalog()
      .then((cat) => {
        setDesignCatalog(cat);
        const keys = (cat.canvas_tools || []).map((t) => t.op_key).filter(Boolean);
        if (keys.length) setAllowedCanvasToolKeys(keys);
        if (styleGroupId == null && cat.style_groups?.[0]) {
          setStyleGroupId(cat.style_groups[0].id);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    const onWinResize = () => setDockWidth((w) => clampAgentDockWidth(w));
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, []);

  useEffect(
    () => () => {
      // `document` is shadowed by the scene document from Redux.
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    },
    []
  );

  const persistDockWidth = (width: number) => {
    const next = clampAgentDockWidth(width);
    setDockWidth(next);
    try {
      localStorage.setItem(AGENT_DOCK_WIDTH_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const onDockResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeDragRef.current = { startX: e.clientX, startW: dockWidth };
    window.document.body.style.cursor = 'col-resize';
    window.document.body.style.userSelect = 'none';
  };

  const onDockResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag) return;
    // Left edge: drag left → wider
    setDockWidth(clampAgentDockWidth(drag.startW + (drag.startX - e.clientX)));
  };

  const endDockResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    resizeDragRef.current = null;
    window.document.body.style.cursor = '';
    window.document.body.style.userSelect = '';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDockWidth((w) => {
      try {
        localStorage.setItem(AGENT_DOCK_WIDTH_KEY, String(w));
      } catch {
        /* ignore */
      }
      return w;
    });
  };

  useEffect(() => {
    if (!open) return;
    setModelPanelOpen(false);
    let cancelled = false;
    setModelsStatus('loading');
    fetchLlmModels()
      .then((res) => {
        if (cancelled) return;
        const list = normalizeModelList(res?.models, res?.imageModels);
        setModels(list);
        setModelsStatus('ready');
        setAvailable(Boolean(res?.available));
        setModel((prev) => {
          if (prev === 'auto') return prev;
          if (prev && list.some((m) => m.id === prev)) return prev;
          return 'auto';
        });
        if (!res?.available) {
          message.warning(
            '未配置 API Key。请在 apps/api/.env 中设置 DEEPSEEK_API_KEY 或 LLM_API_KEY。'
          );
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setModels([]);
        setModelsStatus('error');
        setAvailable(false);
        message.error(
          err?.message ||
            '无法加载模型列表。请先启动后端：npm run dev:api（端口 8000）'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || draftPrompt == null || draftPrompt === '') return;
    const text = draftPrompt;
    const shouldAuto = autoSubmitDraft;
    if (draftAttachments?.length) {
      setContextChips((prev) => {
        const keys = new Set(prev.map((c) => c.key));
        const merged = [...prev];
        for (const a of draftAttachments) {
          if (!keys.has(a.key)) merged.push(a);
        }
        return merged;
      });
    }
    if (draftModelId) {
      setModel(draftModelId);
      setComposerMode(isImageKind({ id: draftModelId }) ? 'image' : 'agent');
    }
    if (draftImageAspectRatio) setImageAspectRatio(draftImageAspectRatio);
    if (draftImageQuality) setImageQuality(draftImageQuality);
    if (draftImageResolution) setImageResolution(draftImageResolution);
    if (draftScene) {
      setDesignScene(draftScene);
      designSceneRef.current = draftScene;
    }
    onDraftConsumed?.();
    if (shouldAuto) {
      // Queue only — do not close over modelsStatus/send (stale interval never fires).
      pendingAutoSubmitRef.current = text;
      // Show in composer immediately so a failed/late send still leaves the prompt visible.
      setInput(text);
    } else {
      setInput(text);
      queueMicrotask(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot draft consume
  }, [open, draftPrompt, autoSubmitDraft, onDraftConsumed]);

  /** Fallback: home boot still in sessionStorage but parent never passed draftPrompt (route remount). */
  useEffect(() => {
    if (!open) return;
    // Wait until createNew finished — otherwise chat lands on the previous project scope.
    if (new URLSearchParams(location.search).get('createNew') === '1') return;
    if (draftPrompt) return;
    if (pendingAutoSubmitRef.current) return;
    const boot = peekHomeAgentBoot();
    if (!boot?.prompt?.trim() || !boot.autoSubmit) return;
    const text = boot.prompt.trim();
    if (boot.attachments?.length) {
      const extra = attachmentsFromBoot(boot);
      setContextChips((prev) => {
        const keys = new Set(prev.map((c) => c.key));
        return [...prev, ...extra.filter((a) => !keys.has(a.key))];
      });
    }
    if (boot.modelId) {
      setModel(boot.modelId);
      setComposerMode(isImageKind({ id: boot.modelId }) ? 'image' : 'agent');
    }
    if (boot.imageAspectRatio) setImageAspectRatio(boot.imageAspectRatio);
    if (boot.imageQuality) setImageQuality(boot.imageQuality);
    if (boot.imageResolution) setImageResolution(boot.imageResolution);
    if (boot.scene) {
      setDesignScene(boot.scene);
      designSceneRef.current = boot.scene;
    }
    pendingAutoSubmitRef.current = text;
    setInput(text);
    clearHomeAgentBoot();
  }, [open, draftPrompt, location.search]);

  /** Right-click 「添加到 Chat」— insert at last caret (do not setState first — that rewrites chips to the front). */
  useEffect(() => {
    if (!open || attachToChat == null || !document) return;
    const chips = contextChipsRef.current;
    let ctx: ComposerContext | null = null;
    if (Array.isArray(attachToChat)) {
      const ids = attachToChat.map(String).filter(Boolean);
      ctx = ids.length ? buildComposerContext(document, ids, null, chips) : null;
    } else {
      const token = String(attachToChat);
      const isFrame = token.startsWith('frame:');
      ctx = isFrame
        ? buildComposerContext(document, [], token.slice('frame:'.length), chips)
        : buildComposerContext(document, [token], null, chips);
    }
    onAttachConsumed?.();
    if (!ctx) return;
    pinnedContextKeysRef.current.add(ctx.key);
    contextDismissedKeyRef.current = null;
    // Defer so blur caret snapshot is already stored on the composer.
    queueMicrotask(() => {
      inputRef.current?.insertContextAtCaret(ctx!);
    });
  }, [open, attachToChat, document, onAttachConsumed]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, historyOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const showAlreadyNewTip = () => {
    setNewChatTip(true);
    if (newChatTipTimer.current) window.clearTimeout(newChatTipTimer.current);
    newChatTipTimer.current = window.setTimeout(() => {
      setNewChatTip(false);
      newChatTipTimer.current = null;
    }, 1800);
  };

  const startNewChat = () => {
    if (messages.length === 0 && !historyOpen) {
      showAlreadyNewTip();
      return;
    }
    abortRef.current?.abort();
    setSending(false);
    dispatch(setAgentBusy(false));
    resetChatSession();
    setInput('');
    setEditDraft('');
    setEditingUserId(null);
    setContextChips([]);
    pinnedContextKeysRef.current.clear();
    setPendingReview(null);
    contextDismissedKeyRef.current = null;
    setHistoryOpen(false);
    setModelPanelOpen(false);
  };

  useEffect(
    () => () => {
      if (newChatTipTimer.current) window.clearTimeout(newChatTipTimer.current);
    },
    []
  );

  const openSession = (s: ChatSession) => {
    abortRef.current?.abort();
    dispatch(setAgentBusy(false));
    setSending(false);
    loadChatSession(s.id);
    setHistoryOpen(false);
    setInput('');
    setEditDraft('');
    setEditingUserId(null);
    setPendingReview(null);
  };

  const deleteSession = (id: string) => {
    removeChatSession(id);
    if (id === sessionId) {
      abortRef.current?.abort();
      setSending(false);
      setInput('');
      setEditDraft('');
      setEditingUserId(null);
      setPendingReview(null);
      setHistoryOpen(false);
    }
  };


  const formatAgentDuration = useCallback(
    (totalSeconds: number) => {
      const s = Math.max(1, totalSeconds);
      const lang = i18n.language || 'en';
      if (s < 60) {
        return lang.startsWith('zh') ? `${s} 秒` : lang.startsWith('ja') ? `${s}秒` : `${s}s`;
      }
      const m = Math.floor(s / 60);
      const r = s % 60;
      if (lang.startsWith('zh')) return r ? `${m} 分 ${r} 秒` : `${m} 分`;
      if (lang.startsWith('ja')) return r ? `${m} 分 ${r} 秒` : `${m} 分`;
      return r ? `${m}m ${r}s` : `${m}m`;
    },
    [i18n.language]
  );

  const [processTick, setProcessTick] = useState(0);
  useEffect(() => {
    if (!messages.some((m) => m.streaming)) return;
    const id = window.setInterval(() => setProcessTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [messages]);

  const formatWorked = useCallback(
    (assistant?: ChatUiMessage) => {
      if (!assistant) return null;
      if (assistant.streaming) {
        if (assistant.drawing) return t('agent.liveDrawing');
        if (assistant.startedAt) {
          const s = Math.max(1, Math.round((Date.now() - assistant.startedAt) / 1000));
          return t('agent.workedFor', { duration: formatAgentDuration(s) });
        }
        if (assistant.intent?.trim() || (assistant.steps && assistant.steps.length > 0)) {
          return t('agent.workedFor', { duration: formatAgentDuration(1) });
        }
        return t('agent.working');
      }
      if (assistant.durationMs != null) {
        const s = Math.max(1, Math.round(assistant.durationMs / 1000));
        return t('agent.workedFor', { duration: formatAgentDuration(s) });
      }
      if (assistant.intent?.trim() || (assistant.steps && assistant.steps.length > 0)) {
        return t('agent.workLog');
      }
      return null;
    },
    [formatAgentDuration, processTick, t]
  );

  const chatTurns = useMemo(() => {
    const turns: Array<{ user: ChatUiMessage | null; assistant?: ChatUiMessage }> = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        const next = messages[i + 1];
        if (next?.role === 'assistant') {
          turns.push({ user: m, assistant: next });
          i += 1;
        } else {
          turns.push({ user: m });
        }
      } else {
        turns.push({ user: null, assistant: m });
      }
    }
    return turns;
  }, [messages]);

  const clearContextChips = (opts?: { purgeUploads?: boolean }) => {
    if (opts?.purgeUploads) {
      for (const c of contextChips) {
        if (c.kind === 'attachment' && c.uploadKey) {
          void deleteUploadedFile(c.uploadKey).catch(() => {});
        }
      }
    }
    const keys = contextChips.map((c) => c.key);
    if (keys.length) contextDismissedKeyRef.current = keys[keys.length - 1];
    keys.forEach((k) => pinnedContextKeysRef.current.delete(k));
    setContextChips([]);
  };

  const onContextsChange = (next: ComposerContext[]) => {
    const removed = contextChips.filter((c) => !next.some((n) => n.key === c.key));
    for (const c of removed) {
      pinnedContextKeysRef.current.delete(c.key);
      contextDismissedKeyRef.current = c.key;
      if (c.kind === 'attachment' && c.uploadKey) {
        void deleteUploadedFile(c.uploadKey).catch(() => {});
      }
    }
    setContextChips(next);
  };

  const handleAttachFiles = async (files: File[]) => {
    const MAX = 10 * 1024 * 1024;
    const selected = models.find((m) => m.id === model);
    const limit = maxAttachmentsFor(selected);
    let remaining = Math.max(
      0,
      limit - contextChips.filter((c) => c.kind === 'attachment').length
    );
    if (remaining <= 0) {
      message.warning(t('agent.attachMaxReached', { count: limit }));
      return;
    }
    for (const file of files) {
      if (remaining <= 0) {
        message.warning(t('agent.attachMaxReached', { count: limit }));
        break;
      }
      if (!file.type.startsWith('image/')) {
        message.warning(t('agent.attachImageOnly', { name: file.name }));
        continue;
      }
      if (file.size > MAX) {
        message.warning(t('agent.attachTooLarge', { name: file.name }));
        continue;
      }
      try {
        const uploaded = await uploadComposerAttachment(file);
        const key = `attachment:${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`;
        const ctx: ComposerContext = {
          key,
          label: file.name,
          kind: 'attachment',
          payload: `[Attached image]\nname: ${file.name}\nmime: ${file.type}`,
          dataUrl: uploaded.imageRef,
          thumbUrl: uploaded.previewDataUrl,
          uploadKey: uploaded.uploadKey || undefined,
        };
        pinnedContextKeysRef.current.add(key);
        // Attachments render above the input (not as inline chips).
        setContextChips((prev) => [...prev.filter((c) => c.key !== key), ctx]);
        remaining -= 1;
      } catch {
        message.error(t('agent.uploadFailed', { name: file.name }));
      }
    }
  };

  const selectedModelLabel =
    model === 'auto'
      ? 'Auto'
      : models.find((m) => m.id === model)?.label || (models[0]?.label ?? 'Agent');
  const selectedModel =
    model === 'auto' ? AUTO_MODEL : models.find((m) => m.id === model);
  const isImageModelSelected = composerMode === 'image' || isImageKind(selectedModel);
  const attachmentLimit = maxAttachmentsFor(selectedModel);
  const attachmentCount = contextChips.filter((c) => c.kind === 'attachment').length;
  const attachFull = attachmentCount >= attachmentLimit;
  const imageAspectProps = {
    aspectPickerVariant: (composerMode === 'image' ? 'image' : 'design') as 'design' | 'image',
    imageAspectRatio,
    onImageAspectRatioChange: setImageAspectRatio,
    onDesignSceneChange: (scene: DesignScene | null) => {
      setDesignScene(scene);
      designSceneRef.current = scene;
      if (scene === 'image') {
        setComposerMode('image');
        setModelPanelTab('image');
        const images = models.filter((m) => isImageKind(m));
        const preferred =
          images.find((m) => /seedream/i.test(m.id)) || images[0];
        if (preferred) setModel(preferred.id);
      } else {
        // Poster / Mobile / Website / Auto → Design + Auto
        setComposerMode('agent');
        setModelPanelTab('design');
        setModel('auto');
      }
    },
    imageQuality,
    onImageQualityChange: setImageQuality,
    imageResolution,
    onImageResolutionChange: setImageResolution,
    imageCount,
    onImageCountChange: setImageCount,
    // Dock sits at the bottom of the panel — open the size menu upward.
    aspectMenuPlacement: 'top-start' as const,
  };
  const attachProps = {
    onAttachFiles: attachFull ? undefined : handleAttachFiles,
    attachTooltip: attachFull
      ? t('agent.attachMaxReached', { count: attachmentLimit })
      : t('agent.uploadImage'),
  };

  const buildUserMessage = (text: string) => {
    // Pass-through only: explicit composer chips + user text. No FE intent routing.
    const parts: string[] = [];
    if (contextChips.length) {
      parts.push(
        ...contextChips.map((c) =>
          c.kind === 'attachment'
            ? `[Attached image]\nname: ${c.label}`
            : c.payload
        )
      );
    }
    parts.push(`User request:\n${text}`);
    return parts.join('\n\n');
  };

  const finishAssistantPatch = (
    m: ChatUiMessage,
    patch: Partial<ChatUiMessage> = {}
  ): ChatUiMessage => ({
    ...m,
    ...patch,
    streaming: false,
    durationMs:
      typeof patch.durationMs === 'number'
        ? patch.durationMs
        : m.startedAt
          ? Date.now() - m.startedAt
          : m.durationMs,
  });

  /** Fill a shape node with an image (rect / ellipse / …). Returns false if not fillable. */
  const fillNodeWithImage = useCallback(
    (nodeId: string, src: string, skipHistory = false): boolean => {
      const url = String(src || '').trim();
      const id = String(nodeId || '').trim();
      if (!url || !id) return false;
      const doc = (store.getState() as any).editor?.document;
      const node = doc?.deltaSetLike?.[id];
      if (!node) return false;
      const key = String(node.key || '').toLowerCase();
      if (['text', 'frame', 'artboard', 'group'].includes(key)) return false;
      if (key === 'image') {
        if (!skipHistory) dispatch(pushEditorHistory());
        dispatch(
          patchDocumentNode({
            nodeId: id,
            skipHistory: true,
            patch: { attrs: { src: url } },
          })
        );
        return true;
      }
      const shape = String(node.attrs?.shapeType || key || '').toLowerCase();
      if (['line', 'arrow', 'pen', 'pencil'].includes(shape)) return false;
      if (!skipHistory) dispatch(pushEditorHistory());
      dispatch(
        patchDocumentNode({
          nodeId: id,
          skipHistory: true,
          patch: {
            attrs: {
              'fill-type': 'image',
              'fill-enabled': 'true',
              'fill-visible': 'true',
              'fill-image-src': url,
              'fill-image-fit': 'fill',
            },
          },
        })
      );
      return true;
    },
    [dispatch, store]
  );

  const addGeneratedImageToCanvas = useCallback(
    (src: string, preferNodeIds?: string[]) => {
      const url = String(src || '').trim();
      if (!url) return;
      const ed = (store.getState() as any).editor;
      const doc = ed?.document;
      if (!doc) {
        message.warning(t('agent.noCanvas', { defaultValue: 'No canvas open' }));
        return;
      }
      const candidates = [
        ...(preferNodeIds || []),
        ...((Array.isArray(ed.selectedNodeIds) ? ed.selectedNodeIds : []) as string[]),
        ed.selectedNodeId,
      ].filter(Boolean) as string[];
      for (const id of candidates) {
        if (fillNodeWithImage(id, url)) {
          message.success(
            t('agent.imageFilledOnCanvas', { defaultValue: 'Filled selection with image' })
          );
          return;
        }
      }

      const place = () => {
        let x = 80;
        let y = 80;
        const frames = Array.isArray(doc.frames) ? doc.frames : [];
        const active =
          frames.find((f: { id?: string }) => f.id === doc.activeFrameId) || frames[0];
        if (active) {
          x = Number(active.x || 0) + 40;
          y = Number(active.y || 0) + 40;
        }
        const maxEdge = 480;
        const img = new Image();
        img.onload = () => {
          let w = Math.max(8, img.naturalWidth || 320);
          let h = Math.max(8, img.naturalHeight || 320);
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const { id, node } = createImageNode({
            x,
            y,
            width: w,
            height: h,
            src: url,
            name: 'Image',
            assetKind: 'image',
          });
          dispatch(setDocument(addNodeToDocument(doc, id, node)));
          dispatch(setSelectedNodeId(id));
          message.success(
            t('agent.imageAddedToCanvas', { defaultValue: 'Added image to canvas' })
          );
        };
        img.onerror = () => {
          const { id, node } = createImageNode({
            x,
            y,
            width: 320,
            height: 320,
            src: url,
            name: 'Image',
            assetKind: 'image',
          });
          dispatch(setDocument(addNodeToDocument(doc, id, node)));
          dispatch(setSelectedNodeId(id));
          message.success(
            t('agent.imageAddedToCanvas', { defaultValue: 'Added image to canvas' })
          );
        };
        img.src = url;
      };
      place();
    },
    [dispatch, fillNodeWithImage, store, t]
  );

  const stopGeneration = () => {
    abortRef.current?.abort();
    dispatch(setAgentBusy(false));
    setSending(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming
          ? finishAssistantPatch(m, {
              content: m.content?.trim() ? m.content : t('agent.stopped'),
            })
          : m
      )
    );
  };

  const send = async (
    opts?:
      | string
      | {
          text?: string;
          priorMessages?: ChatUiMessage[];
          displayContent?: string;
          raw?: boolean;
        }
  ) => {
    const options = typeof opts === 'string' ? { text: opts } : opts || {};
    const extra = (options.text ?? input).trim();
    const text = options.raw ? extra : extra;
    if (!text || sending) return;
    if (available === false) {
      message.warning(
        '未配置 API Key。请在 apps/api/.env 中设置 DEEPSEEK_API_KEY 或 LLM_API_KEY。'
      );
      setInput(text);
      queueMicrotask(() => inputRef.current?.focus());
      return;
    }

    const baseMessages = options.priorMessages ?? messages;
    const contextLabel =
      contextChips.length === 1
        ? `@${contextChips[0].label}`
        : contextChips.length > 1
          ? `@${contextChips.length} refs`
          : null;
    const userFacing =
      options.displayContent ??
      [!options.raw && contextLabel, text].filter(Boolean).join('\n');
    const userMsg: ChatUiMessage = { id: newMessageId(), role: 'user', content: userFacing };
    const assistantId = newMessageId();

    setInput('');
    setModelPanelOpen(false);
    setEditingUserId(null);
    setEditDraft('');
    setPendingReview(null);
    const attachedImages = contextChips
      .filter((c) => c.kind === 'attachment' && c.dataUrl)
      .map((c) => String(c.dataUrl))
      .filter((u) => u.startsWith('data:image/') || u.startsWith('http'));
    const frameChip = contextChips.find((c) => c.kind === 'frame');
    let chipFrameId = frameChip
      ? chipBaseKey(frameChip.key).replace(/^frame:/, '')
      : null;
    const nodeChipIds = [
      ...new Set(
        contextChips
          .map((c) => chipBaseKey(c.key))
          .filter((k) => k.startsWith('node:'))
          .map((k) => k.replace(/^node:/, ''))
          .filter(Boolean)
      ),
    ];
    const groupChip = contextChips.find((c) => c.kind === 'group' || c.kind === 'multi');
    const groupMemberIds =
      groupChip
        ? chipBaseKey(groupChip.key)
            .replace(/^group:/, '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const mentionNodeIds = nodeChipIds.length ? nodeChipIds : groupMemberIds;
    // Build API prompt while chips still exist — clearing first drops [Target element]
    // so the backend never sees @ and may create a new artboard instead of edit/delete.
    const userMessageForApi = options.raw ? text : buildUserMessage(text);
    const imageGenCount = isImageModelSelected
      ? Math.min(4, Math.max(1, Number(imageCount) || 1))
      : 0;
    // Resolve image aspect before first paint so shimmer cards match the picker (e.g. 9:16).
    let imageGenAspect = '1:1';
    let imageFillTargets: string[] = [];
    if (imageGenCount) {
      const docForFill = (store.getState() as any).editor?.document;
      imageFillTargets = mentionNodeIds.filter((id) => {
        const n = docForFill?.deltaSetLike?.[id];
        if (!n) return false;
        const key = String(n.key || '').toLowerCase();
        if (['text', 'frame', 'artboard', 'group'].includes(key)) return false;
        const shape = String(n.attrs?.shapeType || key || '').toLowerCase();
        return !['line', 'arrow', 'pen', 'pencil'].includes(shape);
      });
      imageGenAspect =
        imageAspectRatio && imageAspectRatio !== 'auto' && imageAspectRatio !== 'smart'
          ? imageAspectRatio
          : '1:1';
      if (imageFillTargets[0] && docForFill) {
        const n = docForFill.deltaSetLike[imageFillTargets[0]];
        const tw = Math.max(1, Number(n?.width) || 0);
        const th = Math.max(1, Number(n?.height) || 0);
        if (tw > 0 && th > 0) {
          imageGenAspect = `${Math.round(tw)}:${Math.round(th)}`;
        }
      }
    }
    clearContextChips();
    setSending(true);
    setMessages([
      ...baseMessages,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        // Design agent: Thought row. Image tab: shimmer cards only (no Thinking / Generating text).
        ...(imageGenCount
          ? {
              imagePendingCount: imageGenCount,
              imageAspectRatio: imageGenAspect,
              steps: [],
            }
          : {
              steps: [
                {
                  id: 'skill-0',
                  name: t('agent.activityThoughtRunning'),
                  status: 'running' as const,
                },
              ],
            }),
        streaming: true,
        startedAt: Date.now(),
      },
    ]);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Image tab → Seedream rasters (gallery), not design SVG/JSON tool_ops.
    // If user @mentioned a shape, generate to its aspect and auto-fill it.
    if (isImageModelSelected) {
      dispatch(setAgentBusy(true));
      const count = imageGenCount;
      const fillTargets = imageFillTargets;
      const aspect = imageGenAspect;
      try {
        // Parallel per-slot gens (Seedream `n` is unreliable). Each ready card unlocks
        // immediately — no more 「第 2 张一直扫光」while waiting on a serial queue.
        const slotUrls = Array.from({ length: count }, () => '');
        const publishSlots = () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    images: [...slotUrls],
                    imagePendingCount: count,
                    imageAspectRatio: aspect,
                  }
                : m
            )
          );
        };
        await Promise.all(
          Array.from({ length: count }, async (_, i) => {
            if (ac.signal.aborted) return;
            try {
              const res = await generateImage({
                prompt: text,
                model: model || undefined,
                aspect_ratio: aspect,
                quality: imageQuality || undefined,
                resolution: imageResolution || undefined,
                images: attachedImages.length ? attachedImages : undefined,
                signal: ac.signal,
              });
              let url = '';
              for (const u of res.images || []) {
                if (typeof u === 'string' && u.trim()) {
                  url = u.trim();
                  break;
                }
              }
              const assetUrl = (res.assets || [])
                .map((a) => (typeof a?.url === 'string' ? a.url.trim() : ''))
                .find(Boolean);
              if (assetUrl) url = assetUrl;
              if (url) {
                slotUrls[i] = url;
                publishSlots();
              }
            } catch {
              // Leave this slot as shimmer until the batch settles.
            }
          })
        );
        const urls = slotUrls.filter(Boolean);
        if (ac.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.streaming
                ? finishAssistantPatch(m, {
                    content: m.content?.trim() ? m.content : t('agent.stopped'),
                    images: urls.length ? urls : m.images?.filter(Boolean),
                    imagePendingCount: undefined,
                    imageAspectRatio: aspect,
                    steps: [],
                  })
                : m
            )
          );
        } else if (!urls.length) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? finishAssistantPatch(m, {
                    content: t('agent.requestFailed'),
                    imagePendingCount: undefined,
                    imageAspectRatio: aspect,
                    steps: [],
                  })
                : m
            )
          );
        } else {
          let filled = 0;
          if (fillTargets.length) {
            dispatch(pushEditorHistory());
            const n = Math.min(fillTargets.length, urls.length);
            for (let i = 0; i < n; i += 1) {
              if (fillNodeWithImage(fillTargets[i], urls[i], true)) filled += 1;
            }
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? finishAssistantPatch(m, {
                    content: filled
                      ? t('agent.imageFilledOnCanvas', {
                          defaultValue: 'Filled selection with image',
                        })
                      : '',
                    images: urls,
                    imagePendingCount: undefined,
                    imageAspectRatio: aspect,
                    steps: [],
                  })
                : m
            )
          );
        }
      } catch (err) {
        if (!ac.signal.aborted) {
          const msg =
            err instanceof Error && err.message
              ? err.message
              : t('agent.requestFailed');
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? finishAssistantPatch(m, {
                    content: humanizeDesignError(t, msg),
                    imagePendingCount: undefined,
                    steps: [],
                  })
                : m
            )
          );
        }
      } finally {
        dispatch(setAgentBusy(false));
        setSending(false);
      }
      return;
    }

    // Always call design job; backend decides chat vs canvas pipeline.
    const docNow = (store.getState() as any).editor.document;
    if (!chipFrameId && mentionNodeIds.length && docNow) {
      chipFrameId = frameIdContainingNode(docNow, mentionNodeIds[0]);
    }
    // Free-canvas @ shape: do not bind last agent artboard (would clamp ops into it).
    const freeCanvasMention = Boolean(mentionNodeIds.length && !chipFrameId && !frameChip);
    const editTarget =
      docNow && !freeCanvasMention
        ? resolveDesignTargetFrame(
            docNow,
            chipFrameId,
            lastAgentFrameIdRef.current || taskState?.canvas?.last_agent_frame_id || null
          )
        : null;
    const targetFrameId = freeCanvasMention
      ? null
      : editTarget?.id || chipFrameId || null;
    const seedLiveNodeIds =
      editTarget && docNow
        ? nodeIdsInsideFrame(docNow, editTarget.id)
        : freeCanvasMention && docNow
          ? mentionNodeIds
          : [];
    const currentSvg =
      (targetFrameId && lastAgentSvgByFrameRef.current.get(targetFrameId)) ||
      (lastAgentFrameIdRef.current &&
        lastAgentSvgByFrameRef.current.get(lastAgentFrameIdRef.current)) ||
      (editTarget && docNow ? buildEditContextSvg(docNow, editTarget.id) : null) ||
      null;
    const sceneNodes = docNow
      ? buildSceneNodesForCanvas(docNow, {
          focusFrameId: targetFrameId,
          forceIds: mentionNodeIds,
        })
      : [];
    const sceneFrames = docNow ? buildSceneFramesSnapshot(docNow) : [];
    console.info('[AgentDock] design payload', {
      canvasId: chatScopeId || null,
      focusFrameId: targetFrameId,
      nodeCount: sceneNodes.length,
      frameCount: sceneFrames.length,
      frames: sceneFrames.map((f) => ({
        id: f.id,
        name: f.name,
        is_empty: f.is_empty,
        w: f.w,
        h: f.h,
      })),
      nodeSample: sceneNodes.slice(0, 8).map((n) => ({
        id: n.id,
        type: n.type,
        frameId: n.frameId,
        w: n.w,
        h: n.h,
      })),
      note: 'canvasId is chat/project scope only; backend does not load doc by this id',
    });

    let canvasMutated = false;
    const docBefore = docNow;
    if (docBefore) {
      try {
        checkpointsRef.current.set(userMsg.id, JSON.parse(JSON.stringify(docBefore)));
      } catch {
        /* ignore snapshot failure */
      }
    }

    dispatch(setAgentBusy(true));
    let designStarted = false;
    let nodesPainted = false;
    const memoryMedium = buildTaskStateFromDocument({
      doc: docNow,
      sessionId,
      projectId: chatScopeId || '__none__',
      focusFrameId: chipFrameId || targetFrameId,
      lastAgentFrameId: lastAgentFrameIdRef.current,
      config: {
        scene: (designSceneRef.current ?? designScene) || undefined,
        style_group_id: styleGroupId ?? designCatalog?.style_groups?.[0]?.id ?? null,
        model: model || 'auto',
      },
      prior:
        taskState ||
        emptyTaskState({ sessionId, projectId: chatScopeId || '__none__' }),
    });
    const memoryShort = buildShortTermFromMessages(
      [...baseMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.content || '',
      }))
    );
    try {
      const chipNorm = normalizeCanvasSizeChip(imageAspectRatio);
      const sendScene = designSceneRef.current ?? designScene;
      // Always send the composer size chip; backend owns edit vs create sizing.
      const sendCanvasSize = (() => {
        if (/^\d+x\d+$/.test(chipNorm)) return chipNorm;
        if (chipNorm === 'auto') return 'auto';
        if (/^(?:\d+xauto|autox\d+)$/.test(chipNorm)) return chipNorm;
        return undefined;
      })();
      console.info('[AgentDock] design send', {
        scene: sendScene,
        canvasSize: sendCanvasSize,
        chip: chipNorm,
      });
      await runDesignAgent({
        userMessage: userMessageForApi,
        runMode: 'agent',
        scene: sendScene,
        styleGroupId: styleGroupId ?? designCatalog?.style_groups?.[0]?.id ?? null,
        model: isCustomModelId(model) ? 'auto' : model || 'auto',
        routeOverrides:
          !model || model === 'auto' || isCustomModelId(model)
            ? routeOverridesForApi()
            : null,
        canvasSize: sendCanvasSize,
        canvasId: chatScopeId || undefined,
        currentSvg: currentSvg || undefined,
        seedLiveNodeIds: seedLiveNodeIds.length ? seedLiveNodeIds : undefined,
        sceneNodes: sceneNodes.length ? sceneNodes : undefined,
        sceneFrames: sceneFrames.length ? sceneFrames : undefined,
        focusFrameId: targetFrameId || undefined,
        images: attachedImages.length ? attachedImages : undefined,
        sessionId,
        projectId: chatScopeId || '__none__',
        canvasUi,
        memory: {
          medium: memoryMedium,
          short: memoryShort,
          retrieve_long: true,
        },
        onMemoryPatch: (patch: MemoryPatch, hints) => {
          setTaskState((prev) => {
            const base =
              prev ||
              emptyTaskState({ sessionId, projectId: chatScopeId || '__none__' });
            let next = applyMemoryPatch(base, patch);
            next = applyClientFrameHints(next, {
              lastAgentFrameId: hints.lastAgentFrameId || undefined,
            });
            return next;
          });
          if (hints.lastAgentFrameId) {
            lastAgentFrameIdRef.current = String(hints.lastAgentFrameId);
          }
          if (patch.long_suggestions?.length) {
            setPendingLongSuggestions((prev) => [
              ...prev,
              ...patch.long_suggestions!.filter(
                (s) => !prev.some((p) => p.text === s.text)
              ),
            ]);
          }
        },
        dispatch,
        getDocument: () => (store.getState() as any).editor.document,
        targetFrameId,
        signal: ac.signal,
        onEvent: (ev) => {
          if (ev.type === 'token') {
            designStarted = false;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: (m.content || '') + (ev.text || ''),
                      intent: undefined,
                      thinking: undefined,
                    }
                  : m
              )
            );
            return;
          }
          if (ev.type === 'thinking' && ev.text) {
            // AI summary of CoT (replace:true) or rare stream chunks.
            const piece = String(ev.text);
            if (!piece) return;
            const replace = Boolean(ev.replace);
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const steps = [...(m.steps || [])];
                let idx = steps.findIndex(
                  (s) =>
                    s.status === 'running' &&
                    /thinking|thought|思考/i.test(String(s.name || ''))
                );
                if (idx < 0) {
                  idx = steps.findIndex((s) => s.status === 'running');
                }
                if (idx < 0 && steps.length) idx = steps.length - 1;
                if (idx < 0) {
                  steps.push({
                    id: 'thought-live',
                    name: t('agent.activityThoughtRunning'),
                    summary: piece.slice(-1500),
                    status: 'running',
                  });
                  return { ...m, steps };
                }
                const nextSummary = replace
                  ? piece
                  : `${steps[idx].summary || ''}${piece}`;
                steps[idx] = {
                  ...steps[idx],
                  summary: replace
                    ? nextSummary.slice(0, 1500)
                    : nextSummary.length > 1500
                      ? nextSummary.slice(-1500)
                      : nextSummary,
                };
                return { ...m, steps };
              })
            );
            return;
          }
          if (ev.type === 'analysis_delta' && ev.text) {
            // Design brief under Thought — drop model-invented section titles.
            let piece = String(ev.text).replace(
              /^\s*(?:用户)?意图分析\s*[:：]\s*/i,
              ''
            );
            piece = piece.replace(/^\s*intent\s*analysis\s*[:：]\s*/i, '');
            if (!piece.trim()) return;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const steps = [...(m.steps || [])];
                let idx = steps.findIndex(
                  (s) =>
                    s.status === 'running' &&
                    /thinking|thought|思考/i.test(String(s.name || ''))
                );
                if (idx < 0) idx = steps.findIndex((s) => s.status === 'running');
                if (idx < 0 && steps.length) idx = steps.length - 1;
                if (idx < 0) return m;
                const merged = `${steps[idx].summary || ''}${piece}`;
                steps[idx] = {
                  ...steps[idx],
                  summary: merged.length > 1500 ? merged.slice(-1500) : merged,
                };
                return { ...m, steps };
              })
            );
            return;
          }
          if (ev.type === 'canvas' && ev.size) {
            const next = String(ev.size).trim();
            const sendLocked = /^\d+x\d+$/.test(chipNorm);
            // Auto / partial-auto: execute resolved WxH on canvas, but keep picker chip on Auto.
            const keepAutoChip =
              chipNorm === 'auto' || /^(?:\d+xauto|autox\d+)$/.test(chipNorm);
            if (!sendLocked && next && !keepAutoChip) {
              setImageAspectRatio(next);
            }
            // Auto keeps size chip; still stick model/backend scene for next-turn continuity.
            if (
              ev.scene === 'website' ||
              ev.scene === 'mobile' ||
              ev.scene === 'image' ||
              ev.scene === 'poster'
            ) {
              setDesignScene(ev.scene);
              designSceneRef.current = ev.scene;
            }
            return;
          }
          if (ev.type === 'analysis' && ev.text) {
            // Cursor-style fold = activity steps only (图1). Skip intent essays.
            return;
          }
          if (ev.type === 'drawing') {
            designStarted = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, drawing: Boolean(ev.active) } : m
              )
            );
            return;
          }
          if (ev.type === 'activity') {
            // Thought / explore does not mean canvas paint started (agent loop chat).
            if (ev.kind === 'tool' || ev.kind === 'added' || ev.kind === 'updated') {
              designStarted = true;
            }
            const label = formatActivityLabel(t, {
              kind: ev.kind,
              status: ev.status === 'running' ? 'running' : 'done',
              durationSec: ev.durationSec,
              count: ev.count,
              skillName: ev.skillName,
              detail: ev.detail,
            });
            if (!label) return;
            // Tool call: "Tool call" + op list under it (Cursor-style, like 图1).
            const summary =
              ev.kind === 'tool' ? (ev.detail || '').trim() || undefined : undefined;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const steps = [...(m.steps || [])];
                const next = {
                  id: ev.id,
                  name: label,
                  summary,
                  status: (ev.status === 'running' ? 'running' : 'done') as
                    | 'running'
                    | 'done',
                };
                const idx = steps.findIndex((s) => s.id === ev.id);
                if (idx >= 0) {
                  // Keep prior summary if this update has none (e.g. Tool call done after detail).
                  steps[idx] = {
                    ...next,
                    summary: next.summary || steps[idx].summary,
                  };
                } else steps.push(next);
                return { ...m, steps };
              })
            );
            return;
          }
          if (ev.type === 'phase') {
            // Agent loop phases are soft; only drawing/tool_ops mark designStarted.
            const labels = ev.progress.labels || [];
            const currentIndex = ev.progress.currentIndex;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      pipeline: {
                        category: ev.progress.category,
                        labels,
                        currentIndex,
                        stepConfirm: Boolean(ev.progress.stepConfirm),
                        collabMode:
                          (ev.progress.collabMode as
                            | 'collaborative'
                            | 'milestone'
                            | 'auto'
                            | undefined) || 'auto',
                      },
                    }
                  : m
              )
            );
            return;
          }
          if (ev.type === 'svg_delta') {
            designStarted = true;
            if (ev.svg) {
              const fid =
                targetFrameId ||
                lastAgentFrameIdRef.current ||
                (store.getState() as any).editor.document?.activeFrameId ||
                null;
              if (fid) {
                lastAgentSvgByFrameRef.current.set(String(fid), ev.svg);
                lastAgentFrameIdRef.current = String(fid);
              }
            }
            // Actual layer paint count comes from done.painted (empty SVG must not look "updated").
            return;
          }
          if (ev.type === 'error') {
            const friendly = humanizeDesignError(t, ev.message);
            message.error(friendly);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? finishAssistantPatch(m, {
                      content: m.content || friendly || t('agent.requestFailed'),
                      thinking: undefined,
                      pipeline: undefined,
                      drawing: undefined,
                    })
                  : m
              )
            );
            return;
          }
          if (ev.type === 'done') {
            const painted = Boolean(ev.painted);
            if (painted) {
              canvasMutated = true;
              nodesPainted = true;
            }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantId) {
                  let result = '';
                  if (m.content?.trim() && !designStarted) {
                    // Chat divert reply
                    result = m.content.trim();
                  } else if (painted) {
                    const rawProcess = (m.thinking || m.intent || '').trim();
                    const hasIntentAnalysis =
                      Boolean(rawProcess) && !/<svg\b|<\/svg>/i.test(rawProcess);
                    const fromSummary = ev.summary?.trim();
                    // Prefer backend/model summary; FE i18n is chrome-only fallback.
                    if (fromSummary) {
                      result = fromSummary;
                    } else if (hasIntentAnalysis) {
                      result = t('agent.canvasReadyHint');
                    } else {
                      result = t('agent.canvasUpdated');
                    }
                  } else if (designStarted) {
                    result = t('agent.designEmptyResult');
                  } else {
                    result = m.content?.trim() || t('agent.stopped');
                  }
                  return finishAssistantPatch(m, {
                    content: result,
                    thinking: undefined,
                    pipeline: undefined,
                    drawing: undefined,
                    intent: undefined,
                    choices: ev.choices?.length ? ev.choices : undefined,
                    steps: (m.steps || []).map((s) => ({
                      ...s,
                      status: s.status === 'error' ? s.status : ('done' as const),
                    })),
                  });
                }
                if (
                  m.id === userMsg.id &&
                  painted &&
                  checkpointsRef.current.has(userMsg.id)
                ) {
                  return { ...m, canRestore: true };
                }
                return m;
              })
            );
          }
        },
      });
    } finally {
      dispatch(setAgentBusy(false));
      if (canvasMutated && checkpointsRef.current.has(userMsg.id)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === userMsg.id ? { ...m, canRestore: true } : m))
        );
        setPendingReview({ userMessageId: userMsg.id, assistantId });
      }
    }

    if (ac.signal.aborted) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && m.streaming
            ? finishAssistantPatch(m, {
                content: m.content?.trim() ? m.content : t('agent.stopped'),
              })
            : m
        )
      );
    }

    setSending(false);
  };

  /** Flush home-agent auto-submit once model list has settled (ready or error). */
  useEffect(() => {
    if (!open) return;
    if (new URLSearchParams(location.search).get('createNew') === '1') return;
    // Prefer scoped project id so the user message is not wiped by createTemplate scope switch.
    const routeId = decodeURIComponent((routeProjectId || '').trim());
    if (currentId && routeId && routeId !== currentId) return;
    const text = pendingAutoSubmitRef.current;
    if (!text) return;
    if (modelsStatus === 'loading' || modelsStatus === 'idle') return;
    pendingAutoSubmitRef.current = null;
    void send(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelsStatus, draftPrompt, location.search, currentId, routeProjectId]);

  const dismissPendingReview = (opts?: { dropCheckpoint?: boolean }) => {
    if (opts?.dropCheckpoint && pendingReview) {
      checkpointsRef.current.delete(pendingReview.userMessageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingReview.userMessageId ? { ...m, canRestore: false } : m
        )
      );
    }
    setPendingReview(null);
  };

  const undoPendingReview = () => {
    if (!pendingReview) return;
    restoreCheckpoint(pendingReview.userMessageId);
  };

  const keepPendingReview = () => {
    dismissPendingReview({ dropCheckpoint: true });
  };

  const reviewPendingChanges = () => {
    if (!pendingReview) return;
    const el = listRef.current?.querySelector(
      `[data-assistant-id="${CSS.escape(pendingReview.assistantId)}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };


  const beginEditUserMessage = (m: ChatUiMessage) => {
    if (m.role !== 'user' || sending || m.streaming) return;
    setEditingUserId(m.id);
    setEditDraft(m.content);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const cancelEditUserMessage = () => {
    setEditingUserId(null);
    setEditDraft('');
  };

  const submitEditUserMessage = () => {
    const id = editingUserId;
    if (!id || sending) return;
    const draft = editDraft.trim();
    if (!draft) return;
    const idx = messages.findIndex((x) => x.id === id);
    if (idx < 0) return;
    void send({
      text: draft,
      priorMessages: messages.slice(0, idx),
    });
  };

  const restoreCheckpoint = (userMessageId: string) => {
    const snap = checkpointsRef.current.get(userMessageId);
    if (!snap) {
      message.warning(t('agent.checkpointInvalid'));
      return;
    }
    dispatch(setDocument(JSON.parse(JSON.stringify(snap))));
    checkpointsRef.current.delete(userMessageId);
    setMessages((prev) =>
      prev.map((m) => (m.id === userMessageId ? { ...m, canRestore: false } : m))
    );
    // Bubble undo and Canvas updated Undo/Keep/Review share one checkpoint.
    setPendingReview((prev) =>
      prev?.userMessageId === userMessageId ? null : prev
    );
    message.success(t('agent.restored'));
  };

  const closePopovers = () => {
    setModelPanelOpen(false);
  };

  const maybeOpenModelFromAt = (value: string) => {
    const at = value.lastIndexOf('@');
    if (at >= 0) {
      const after = value.slice(at + 1);
      if (!/\s/.test(after)) {
        setModelPanelOpen(true);
        return;
      }
    }
    setModelPanelOpen(false);
  };

  const onInputChange = (value: string) => {
    setInput(value);
    maybeOpenModelFromAt(value);
  };

  const onEditDraftChange = (value: string) => {
    setEditDraft(value);
    maybeOpenModelFromAt(value);
  };

  const pickModel = (id: string) => {
    const next = models.find((m) => m.id === id);
    const limit = maxAttachmentsFor(next);
    setContextChips((prev) => {
      const attachments = prev.filter((c) => c.kind === 'attachment');
      if (attachments.length <= limit) return prev;
      const keep = new Set(attachments.slice(0, limit).map((c) => c.key));
      for (const a of attachments) {
        if (!keep.has(a.key)) {
          pinnedContextKeysRef.current.delete(a.key);
          if (a.uploadKey) void deleteUploadedFile(a.uploadKey).catch(() => {});
        }
      }
      message.warning(t('agent.attachTrimmed', { count: limit }));
      return prev.filter((c) => c.kind !== 'attachment' || keep.has(c.key));
    });
    setModel(id);
    if (id === 'auto') {
      setComposerMode('agent');
      setModelPanelTab('design');
    } else {
      const picked = models.find((m) => m.id === id);
      const image = isImageKind(picked);
      setComposerMode(image ? 'image' : 'agent');
      setModelPanelTab(image ? 'image' : 'design');
    }
    closePopovers();
    // Only strip a trailing @-query used to open the model panel (ASCII token).
    // Do NOT use /@[^\s]*$/ — Chinese has no spaces, so that wipes the whole draft.
    const stripModelAtQuery = (prev: string) =>
      prev.replace(/@[a-zA-Z0-9._/-]*$/, '');
    if (editingUserId) setEditDraft(stripModelAtQuery);
    else setInput(stripModelAtQuery);
    inputRef.current?.focus();
  };

  const switchModelPanelTab = (tab: ModelPickerTab) => {
    // Tab is only a filter for browsing — do not reset the active model / mode.
    setModelPanelTab(tab);
  };

  /** Anchor model menu to its icon (not full-width over the composer). */
  const modelFloating = useFloating({
    open: modelPanelOpen,
    onOpenChange: setModelPanelOpen,
    placement: 'top-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ['top-end', 'bottom-start'] }),
      shift({ padding: 12 }),
    ],
  });
  const modelDismiss = useDismiss(modelFloating.context);
  const modelIx = useInteractions([modelDismiss]);

  if (!open) return null;

  const composerPlaceholder = isImageModelSelected
    ? t('agent.placeholderImage')
    : contextChips.length
      ? t('agent.placeholderSkill')
      : t('agent.placeholderDefault');

  const modelButtonProps = {
    ref: modelFloating.refs.setReference,
    title:
      model === 'auto'
        ? modelDescription(AUTO_MODEL, t)
        : (() => {
            const m = models.find((x) => x.id === model);
            if (!m) return selectedModelLabel;
            return `${m.label || m.id} — ${modelDescription(m, t)}`;
          })(),
    label: selectedModel?.label || selectedModelLabel,
    open: modelPanelOpen,
    onClick: () => {
      setModelPanelTab(composerMode === 'image' ? 'image' : 'design');
      setModelPanelOpen((v) => !v);
    },
    getReferenceProps: modelIx.getReferenceProps,
    icon: <Icon name="editor-model-cube" width={16} height={16} />,
  };

  const escapeComposer = (opts?: { cancelEdit?: boolean }) => {
    if (modelPanelOpen) {
      closePopovers();
      return;
    }
    if (contextChips.length) {
      clearContextChips({ purgeUploads: true });
      return;
    }
    if (opts?.cancelEdit) cancelEditUserMessage();
    else closePopovers();
  };

  const editComposerNode = editingUserId ? (
    <AgentComposerShell
      inputRef={inputRef}
      contexts={contextChips}
      onContextsChange={onContextsChange}
      value={editDraft}
      onChange={onEditDraftChange}
      onSubmit={() => void submitEditUserMessage()}
      onEscape={() => escapeComposer({ cancelEdit: true })}
      sending={sending}
      onStop={stopGeneration}
      disabled={false}
      placeholder={composerPlaceholder}
      canSend={!sending && !!editDraft.trim() && available !== false}
      {...attachProps}
      modelButtonProps={modelButtonProps}
      {...imageAspectProps}
    />
  ) : null;

  return (
    <aside
      data-tour={dataTour}
      style={{ width: dockWidth }}
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]',
        className
      )}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('agent.resizeDock')}
        aria-valuemin={AGENT_DOCK_MIN_W}
        aria-valuemax={AGENT_DOCK_MAX_W}
        aria-valuenow={dockWidth}
        className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40"
        onPointerDown={onDockResizePointerDown}
        onPointerMove={onDockResizePointerMove}
        onPointerUp={endDockResize}
        onPointerCancel={endDockResize}
        onDoubleClick={() => persistDockWidth(AGENT_DOCK_DEFAULT_W)}
      />
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ink)]">
          {historyOpen ? t('agent.history') : chatTitle}
        </span>
        <div className="relative flex items-center gap-0.5">
          <Tooltip title={t('agent.newChat')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.newChat')}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              onClick={startNewChat}
            >
              <BiMessageSquareAdd className="h-4 w-4" />
            </button>
          </Tooltip>
          {newChatTip ? (
            <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-30 -translate-x-1/4">
              <div className="relative rounded bg-[var(--ink)] px-2.5 py-1.5 text-[11px] text-[var(--on-brand)] shadow-md">
                <span
                  className="absolute left-6 top-0 h-2 w-2 -translate-y-1/2 rotate-45 bg-[var(--ink)]"
                  aria-hidden
                />
                {t('agent.alreadyNewChat')}
              </div>
            </div>
          ) : null}
          <Tooltip title={t('agent.history')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.history')}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
                historyOpen && 'bg-[var(--accent-soft)] text-[var(--ink)]'
              )}
              onClick={() => {
                closePopovers();
                setHistoryOpen((v) => !v);
              }}
            >
              <BiTimeFive className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
          <Tooltip title={t('agent.closePanel')} placement="bottom">
            <button
              type="button"
              aria-label={t('agent.closePanel')}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              onClick={() => {
                abortRef.current?.abort();
                dispatch(setAgentBusy(false));
                setSending(false);
                closePopovers();
                setHistoryOpen(false);
                onClose();
              }}
            >
              <LuPanelRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div ref={listRef} className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-2">
        {historyOpen ? (
          sessions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-1">
              <p className="text-center text-[13px] text-[var(--muted)]">
                {t('agent.noHistory')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              {sessions.map((s) => {
                const active = s.id === sessionId;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded px-2.5 py-2 transition-colors',
                      active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openSession(s)}
                    >
                      <div className="truncate text-[13px] text-[var(--ink)]">{s.title}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {formatChatTime(s.updatedAt)}
                        {' · '}
                        {t('agent.messageCount', { count: s.messages.length })}
                      </div>
                    </button>
                    <Tooltip title={t('agent.delete')} placement="top">
                      <button
                        type="button"
                        aria-label={t('agent.delete')}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--muted)] opacity-0 transition hover:bg-[var(--surface)] hover:text-red-500 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(s.id);
                        }}
                      >
                        <HiOutlineTrash className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          )
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <p className="text-center text-[14px] text-[var(--muted)]">
              {t('agent.emptyHint', { defaultValue: '描述你想要的设计，或上传参考图开始' })}
            </p>
          </div>
        ) : (
          <ChatTurnList
            turns={chatTurns}
            editingUserId={editingUserId}
            editComposer={editComposerNode}
            sending={sending}
            formatWorked={formatWorked}
            hasCheckpoint={(id) => checkpointsRef.current.has(id)}
            onBeginEdit={beginEditUserMessage}
            onCancelEdit={cancelEditUserMessage}
            onRestore={restoreCheckpoint}
            onChoice={(choice) => {
              if (sending || choice === '取消') return;
              // Pass chip text through — backend intent skill decides what it means.
              void send({ text: choice, raw: true, displayContent: choice });
            }}
            onAddImageToCanvas={addGeneratedImageToCanvas}
          />
        )}
      </div>

      {historyOpen || editingUserId ? null : (
        <div className="relative shrink-0 px-3 pb-3 pt-0.5" data-tour="editor-agent-chat">
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--canvas)] shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            {pendingReview && !sending ? (
              <div className="flex h-9 items-center gap-2 px-3">
                <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted)]">
                  {t('agent.reviewHint')}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    onClick={undoPendingReview}
                  >
                    {t('agent.undo')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                    onClick={keepPendingReview}
                  >
                    {t('agent.keep')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-md bg-[var(--accent-soft)] px-2.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--line)]"
                    onClick={reviewPendingChanges}
                  >
                    {t('agent.review')}
                  </button>
                </div>
              </div>
            ) : null}
            {pendingLongSuggestions.length > 0 && !sending ? (
              <div className="border-t border-[var(--line)] px-3 py-2">
                <p className="mb-1.5 text-[11px] text-[var(--muted)]">
                  {t('agent.longMemorySuggestHint', '记住这个偏好？')}
                </p>
                {pendingLongSuggestions.map((s, i) => (
                  <div key={i} className="mb-1.5 flex items-start gap-2">
                    <span className="mt-0.5 min-w-0 flex-1 text-[11px] leading-4 text-[var(--ink)]">
                      {s.text}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-[11px] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                        onClick={() =>
                          setPendingLongSuggestions((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        {t('agent.longMemoryIgnore', '忽略')}
                      </button>
                      <button
                        type="button"
                        className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-medium text-white hover:opacity-90"
                        onClick={() => {
                          fetch('/api/v1/design/memory/long', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${getToken()}`,
                            },
                            body: JSON.stringify({ kind: s.kind, text: s.text }),
                          }).catch(() => {/* silently ignore */});
                          setPendingLongSuggestions((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        {t('agent.longMemorySave', '记住')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <AgentComposerShell
              className="min-h-[120px] rounded-none border-0 shadow-none"
              inputRef={inputRef}
              contexts={contextChips}
              onContextsChange={onContextsChange}
              value={input}
              onChange={onInputChange}
              onSubmit={() => void send()}
              onEscape={() => escapeComposer()}
              sending={sending}
              onStop={stopGeneration}
              placeholder={composerPlaceholder}
              canSend={
                !sending && !!input.trim() && available !== false
              }
              {...attachProps}
              modelButtonProps={modelButtonProps}
              {...imageAspectProps}
            />
          </div>
        </div>
      )}

      {!historyOpen ? (
        <FloatingPortal>
          {modelPanelOpen ? (
            <div
              ref={modelFloating.refs.setFloating}
              style={modelFloating.floatingStyles as CSSProperties}
              className="z-[80]"
              {...modelIx.getFloatingProps()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ModelPickerPanel
                tab={modelPanelTab}
                onTabChange={switchModelPanelTab}
                models={models}
                selectedId={model}
                onPick={pickModel}
                status={modelsStatus}
              />
            </div>
          ) : null}
        </FloatingPortal>
      ) : null}
    </aside>
  );
}
