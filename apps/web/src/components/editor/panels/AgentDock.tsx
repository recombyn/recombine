import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, memo } from 'react';
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
import { Icon } from '@/components/base/icon';
import {
  listModels,
  generateImage,
  generateVideo,
  type LlmModel,
} from '@/apis/chat';
import {
  isVolcanoCatalogModel,
  maxAttachmentsFor,
  agentAttachmentLimit,
} from '@/components/editor/panels/agent/llmModelMeta';
import {
  peekHomeAgentBoot,
  clearHomeAgentBoot,
  attachmentsFromBoot,
  contextsFromBoot,
} from '@/utils/homeAgentBoot';
import {
  setAgentBusy,
  setDocument,
  patchDocumentNode,
  pushEditorHistory,
  startCanvasAttachPick,
  clearCanvasAttachPick,
  consumePendingCanvasAttach,
  EMPTY_ID_LIST,
} from '@/store/modules/editor';
import MentionAttachPanel, {
  type MentionAttachItem,
} from '@/components/editor/panels/agent/MentionAttachPanel';
import {
  deleteChatSessionApi,
  fetchChatSessions,
  upsertChatSessionApi,
} from '@/apis/chatSessions';
import { getToken } from '@/utils/token';
import {
  deleteUploadedFile,
  imageSrcToFile,
  readFileAsDataUrl,
  uploadComposerAttachment,
} from '@/utils/uploadImage';
import { message } from '@/components/base';
import {
  chipBaseKey,
  parseAtMentionQuery,
  parseSlashSkillQuery,
  stripTrailingAtQuery,
  stripTrailingSlashQuery,
  buildComposerContext,
  enrichComposerContextThumb,
  rasterizeNodesToPngDataUrl,
  rasterizeNodesToPngFile,
  type AgentComposerHandle,
  type ComposerContext,
} from '@/components/editor/panels/AgentComposerInput';
import { fetchDesignSkills, type DesignSkillCard } from '@/apis/design';
import AgentDockHeader from '@/components/editor/panels/agent/AgentDockHeader';
import {
  runDesignAgent,
  resolveDesignTargetFrame,
  nodeIdsInsideFrame,
  frameIdContainingNode,
  buildSceneNodesForCanvas,
  buildSceneFramesSnapshot,
  buildSpatialSummary,
  type AgentStepEvent,
} from '@/components/editor/panels/agent/runDesignAgent';
import {
  canAttachNodeToChat,
  captureVideoPosterFrame,
  listGroupMemberIds,
  readNodeGroupId,
} from '@/components/rcb/scene/document/sceneDocument';import {
  applyClientFrameHints,
  applyMemoryPatch,
  buildShortTermFromMessages,
  buildTaskStateFromDocument,
  emptyTaskState,
  type MemoryPatch,
  type TaskState,
} from '@/components/editor/panels/agent/agentMemory';
import AgentMessageList from '@/components/editor/panels/agent/AgentMessageList';
import AgentDockComposerFooter from '@/components/editor/panels/agent/AgentDockComposerFooter';
import AgentDockResizeHandle from '@/components/editor/panels/agent/AgentDockResizeHandle';
import {
  type AskChoicePick,
  type ChatUiMessage,
  applyActivityEventToSteps,
  applyAnalysisDeltaToSteps,
  applyThinkingBodyToSteps,
  buildChatProcessSteps,
  formatActivityLabel,
  localizeExploreItem,
  normalizeActivityStatus,
} from '@/components/editor/panels/agent/ChatTurnList';
import type { VirtualListHandle } from '@/components/base/VirtualList';
import AgentComposerShell, {
  type ComposerInteractionMode,
  type ComposerRunMode,
  type ImageModeComposerControls,
  type VideoModeComposerControls,
} from '@/components/editor/panels/agent/AgentComposerShell';
import { normalizeCanvasSizeChip } from '@/components/editor/chrome/SizePresetPanel';
import {
  customProvidersAsModels,
} from '@/components/editor/panels/agent/customLlmProviders';
import {
  routeOverridesForApi,
  warmAgentRoutePresetRules,
  warmOpenrouterAvailability,
  loadAgentRoutePrefs,
  AgentRoutePrefsEditor,
} from '@/components/editor/panels/agent/AgentModelsPanel';
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
  modelImageLimits,
} from '@/components/editor/panels/agent/ImageAspectRatioPicker';
import ModelPickerPanel, {
  AUTO_MODEL,
  ModelBrandIcon,
  isImageKind,
  isVideoKind,
  modelDescription,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { cn } from '@/utils/classnames';
import { estimateImageCredits, estimateVideoCredits } from '@/utils/imageCredits';
import { FREE_IMAGE_MODEL_ID, planAllowsModelId, planAllowsModelPick, type PlanId } from '@/utils/wallet';

type ChatSessionMessage = {
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
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatSessionMessage[];
  taskState?: TaskState | null;
};

const MAX_CHAT_SESSIONS = 40;

function resolveSeedLiveNodeIds(opts: {
  doc: any;
  editTarget: { id: string } | null;
  freeCanvasMention: boolean;
  mentionNodeIds: string[];
}): string[] {
  const { doc, editTarget, freeCanvasMention, mentionNodeIds } = opts;
  if (editTarget && doc) return nodeIdsInsideFrame(doc, editTarget.id);
  if (freeCanvasMention && doc) return mentionNodeIds;
  return [];
}

/** Model id sent to /design/run (plan gate → auto; custom BYOK kept). */
function resolveAgentSendModel(canPickModel: boolean, model: string): string {
  if (!canPickModel) return 'auto';
  return model || 'auto';
}

/** Auto uses route prefs; locked / BYOK custom pins all tiers+vision. */
function resolveAgentRouteOverrides(
  canPickModel: boolean,
  model: string
): Record<string, string> | null {
  if (!canPickModel) return null;
  if (!model || model === 'auto') {
    return routeOverridesForApi();
  }
  // 锁模 / BYOK：本用户本轮 fast/standard/reasoning/vision 都用同一模型
  return {
    fast: model,
    standard: model,
    reasoning: model,
    vision: model,
  };
}

function assistantDurationMs(
  m: ChatUiMessage,
  patch: Partial<ChatUiMessage>
): number | undefined {
  if (typeof patch.durationMs === 'number') return patch.durationMs;
  if (m.startedAt) return Date.now() - m.startedAt;
  return m.durationMs;
}

function resolveUserContentMarked(opts: {
  markedFromDom: string;
  displayContextsLen: number;
  userFacing: string;
}): string | undefined {
  if (opts.markedFromDom.includes('\uFFFC')) return opts.markedFromDom;
  if (opts.displayContextsLen > 0) {
    return `${'\uFFFC'.repeat(opts.displayContextsLen)}${opts.userFacing}`;
  }
  return undefined;
}

/** Make chip / canvas image URLs safe for remote vision APIs (data URL or public https). */
async function resolveVisionImageUrl(src: string): Promise<string | null> {
  const s = String(src || '').trim();
  if (!s) return null;
  if (s.startsWith('data:image/')) return s;
  const needsAuthFetch =
    s.startsWith('/') ||
    s.includes('/api/v1/uploads/') ||
    (!s.startsWith('http://') && !s.startsWith('https://'));
  if (needsAuthFetch || s.startsWith('http://') || s.startsWith('https://')) {
    try {
      // Auth-relative upload URLs cannot be fetched by the vision provider — inline bytes.
      if (
        s.startsWith('/') ||
        s.includes('/api/v1/uploads/') ||
        s.startsWith('blob:')
      ) {
        const file = await imageSrcToFile(s, 'vision.png');
        return await readFileAsDataUrl(file);
      }
      return s;
    } catch {
      return s.startsWith('http://') || s.startsWith('https://') ? s : null;
    }
  }
  return null;
}

function resolveComposerPlaceholder(
  t: (key: string, opts?: Record<string, unknown>) => string,
  opts: {
    isImageModel: boolean;
    isImageMode?: boolean;
    isVideoMode?: boolean;
    hasContextChips: boolean;
  }
): string {
  if (opts.isVideoMode) return t('editor.tools.videoGenPlaceholder');
  if (opts.isImageMode) return t('editor.tools.imageGenPlaceholder');
  if (opts.isImageModel) return t('agent.placeholderImage');
  if (opts.hasContextChips) return t('agent.placeholderSkill');
  return t('agent.placeholderDefault');
}

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
  if (low === 'free_daily_exhausted') return t('agent.freeDailyExhausted');
  if (low === 'insufficient_credits') return t('agent.insufficientCredits');
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

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const DETAIL_SUMMARY_KINDS = new Set([
  'tool',
  'skipped',
  'added',
  'updated',
  'deleted',
]);
const SUCCESS_VARIANT_KINDS = new Set(['added', 'updated', 'deleted']);
const CONFIRM_VARIANT_KINDS = new Set(['thought', 'explored', 'tool']);

function activityRowSummary(opts: {
  kind: string;
  label: string;
  detailText: string;
  summaryText: string;
}): string | undefined {
  const { kind, label, detailText, summaryText } = opts;
  if (summaryText && summaryText !== label) return summaryText;
  if (!DETAIL_SUMMARY_KINDS.has(kind)) return undefined;
  if (detailText && detailText !== label) return detailText;
  return undefined;
}

function activityRowVariant(
  status: 'running' | 'done' | 'error',
  kind: string
): 'success' | 'confirm' | undefined {
  if (status === 'error') return undefined;
  if (SUCCESS_VARIANT_KINDS.has(kind)) return 'success';
  if (CONFIRM_VARIANT_KINDS.has(kind)) return 'confirm';
  return undefined;
}

function activityNestItem(
  t: TFn,
  item: { id?: string; name?: string; summary?: string } | undefined
) {
  if (!item || !(item.name || item.id)) return null;
  return localizeExploreItem(t, {
    id: String(item.id || `item-${Date.now()}`),
    name: String(item.name || '').trim() || '…',
    summary: item.summary ? String(item.summary) : undefined,
  });
}

type FinishAssistant = (
  m: ChatUiMessage,
  patch?: Partial<ChatUiMessage>
) => ChatUiMessage;

function patchChatDoneAssistant(
  m: ChatUiMessage,
  opts: {
    t: TFn;
    finish: FinishAssistant;
    choices?: string[];
    proposedOps?: ChatUiMessage['proposedOps'];
    applyChoice?: string;
    choiceUi?: ChatUiMessage['choiceUi'];
  }
): ChatUiMessage {
  return opts.finish(m, {
    content: (m.content || '').trim(),
    thinking: undefined,
    pipeline: undefined,
    drawing: undefined,
    intent: undefined,
    choices: opts.choices?.length ? opts.choices : undefined,
    proposedOps: opts.proposedOps?.length ? opts.proposedOps : undefined,
    applyChoice: opts.applyChoice || undefined,
    choiceUi: opts.choiceUi,
    steps: buildChatProcessSteps(opts.t, m),
  });
}

function patchDesignDoneAssistant(
  m: ChatUiMessage,
  opts: {
    t: TFn;
    finish: FinishAssistant;
    painted: boolean;
    designStarted: boolean;
    summary?: string;
    choices?: string[];
    proposedOps?: ChatUiMessage['proposedOps'];
    applyChoice?: string;
    choiceUi?: ChatUiMessage['choiceUi'];
  }
): ChatUiMessage {
  let result = '';
  if (opts.proposedOps?.length) {
    // Keep streamed model wording; Confirm chips carry the ask.
    result = (opts.summary || '').trim() || (m.content || '').trim();
  } else if (opts.painted) {
    const rawProcess = (m.thinking || m.intent || '').trim();
    const hasIntentAnalysis =
      Boolean(rawProcess) && !/<svg\b|<\/svg>/i.test(rawProcess);
    const fromSummary = opts.summary?.trim() || '';
    // Prefer short done copy — long summary is usually the decide/paint essay
    // already shown as gray process thought.
    const summaryIsShortDone = fromSummary.length > 0 && fromSummary.length <= 48;
    if (summaryIsShortDone) result = fromSummary;
    else if (hasIntentAnalysis) result = opts.t('agent.canvasReadyHint');
    else result = opts.t('agent.canvasUpdated');
  } else if (opts.designStarted) {
    result = opts.t('agent.designEmptyResult');
  } else {
    result = m.content?.trim() || opts.t('agent.stopped');
  }
  return opts.finish(m, {
    content: result,
    thinking: undefined,
    pipeline: undefined,
    drawing: undefined,
    intent: undefined,
    choices: opts.choices?.length ? opts.choices : undefined,
    proposedOps: opts.proposedOps?.length ? opts.proposedOps : undefined,
    applyChoice: opts.applyChoice || undefined,
    choiceUi: opts.choiceUi,
    steps: (m.steps || []).map((s) => ({
      ...s,
      status: s.status === 'error' ? s.status : ('done' as const),
    })),
  });
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
    contexts?: ChatUiMessage['contexts'] | null;
    contentMarked?: string | null;
    thinking?: string | null;
    durationMs?: number | null;
    intent?: string | null;
    steps?: ChatUiMessage['steps'] | null;
    images?: string[] | null;
    videos?: string[] | null;
    imageModelId?: string | null;
    imageModelLabel?: string | null;
    imageAspectRatio?: string | null;
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
      projectId: pending.projectId || '__none__',
      id: pending.id,
      title: pending.title,
      messages: pending.messages,
      ...(pending.taskState != null ? { taskState: pending.taskState } : {}),
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

type AgentDockProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
  floating?: boolean;
  allowedInteractionModes?: ComposerInteractionMode[];
  draftPrompt?: string | null;
  /** When true with draftPrompt, auto-send after models are ready (home → editor). */
  autoSubmitDraft?: boolean;
  onDraftConsumed?: () => void;
  draftAttachments?: ComposerContext[];
  /** Home → editor: inline skill / context pills (e.g. plaza 「做同款」). */
  draftContexts?: ComposerContext[];
  /** Home → editor: preferred model + Seedream settings. */
  draftModelId?: string | null;
  /** Home → editor: Agent / Ask mode. */
  draftInteractionMode?: ComposerInteractionMode | null;
  draftImageAspectRatio?: string | null;
  /** Home → editor: product category scene (website / mobile / image / poster). */
  draftScene?: DesignScene | null;
  /** Right-click 「添加到 Chat」— node id, `frame:id`, or multiple ids as one 组N chip. */
  attachToChat?: string | string[] | null;
  onAttachConsumed?: () => void;
  /** Onboarding spotlight target id (`data-tour`). */
  dataTour?: string;
  /** Editor chrome bridge for zoom / panels / agent mode tools. */
  canvasUi?: CanvasUiBridge | null;
  /** Mobile floating mode: document title shown in the top bar. */
  projectName?: string;
  /** Mobile floating mode: navigate back to home. */
  onGoHome?: () => void;
};

const DEFAULT_VIDEO_ASPECT_RATIO = '16:9';
const DEFAULT_VIDEO_RESOLUTION = '720p';
const DEFAULT_VIDEO_DURATION = 5;
const DEFAULT_VIDEO_MODEL_ID = 'or-seedance-2-0-fast';

/** Merge catalog + imageModels + videoModels; normalize kind. */
function normalizeModelList(
  models: LlmModel[] | undefined,
  imageModels?: LlmModel[] | null,
  videoModels?: LlmModel[] | null
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
  for (const m of videoModels || []) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m, kind: 'video' });
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
    if (isVideoKind(m)) {
      return { ...base, kind: 'video' as const };
    }
    if (isImageKind(m)) {
      return { ...base, kind: 'image' as const };
    }
    // Former "画布" svg bucket → show under Agent text models
    if (m.kind === 'svg') return { ...base, kind: 'text' as const };
    return { ...base, kind: (m.kind || 'text') as LlmModel['kind'] };
  });
}

/**
 * Canvas → composer:
 * - single image / video → attachment strip (not inline input chip)
 * - multi: videos/images attach as media; remaining shapes → one PNG (not one giant raster of video)
 * - single shape / frame → context chip with thumb
 */
function canvasAttachToken(payload: string | string[]): string {
  return Array.isArray(payload) ? `arr:${payload.map(String).join('\0')}` : `one:${payload}`;
}

/** Full member ids when every selected id shares one groupId; otherwise null. */
function sharedGroupAttachIds(doc: any, ids: string[]): string[] | null {
  if (!doc || !ids || ids.length < 2) return null;
  const first = readNodeGroupId(doc?.deltaSetLike?.[ids[0]]);
  if (!first) return null;
  if (!ids.every((id) => readNodeGroupId(doc?.deltaSetLike?.[id]) === first)) return null;
  const members = listGroupMemberIds(doc, first);
  return members.length >= 2 ? members : ids;
}

async function buildCanvasVideoAttachment(
  doc: any,
  id: string,
  existingChips: ComposerContext[]
): Promise<ComposerContext | null> {
  const node = doc?.deltaSetLike?.[id];
  const src = String(node?.attrs?.src || '').trim();
  if (node?.key !== 'video' || !src) return null;
  const labeled = buildComposerContext(doc, [id], null, existingChips);
  let thumb = String(node?.attrs?.poster || '').trim();
  if (!thumb) {
    try {
      thumb = await captureVideoPosterFrame(src);
    } catch {
      /* thumb optional */
    }
  }
  return {
    key: `attach:canvas:${id}:${Date.now()}`,
    label: labeled?.label || id,
    kind: 'attachment',
    payload: `[Canvas video]\nid: ${id}${labeled?.payload ? `\n${labeled.payload}` : ''}`,
    dataUrl: src,
    thumbUrl: thumb || undefined,
    uploadStatus: 'ready',
  };
}

export async function applyCanvasAttachPayload(opts: {
  document: any;
  payload: string | string[];
  existingChips: ComposerContext[];
  onAttachFiles: (files: File[], opts?: { mention?: boolean }) => void | Promise<void>;
  insertChip: (ctx: ComposerContext) => void;
  /** Canvas video → strip attachment without re-upload / file-type gates. */
  pushAttachment?: (att: ComposerContext) => void;
  /** Image chat mode — reject video nodes (same as image generator pick). */
  imagesOnly?: boolean;
}) {
  const {
    document: doc,
    payload,
    existingChips,
    onAttachFiles,
    insertChip,
    pushAttachment,
    imagesOnly = false,
  } = opts;
  let ids: string[] = [];
  let frameId: string | null = null;
  if (Array.isArray(payload)) {
    ids = payload.map(String).filter(Boolean);
  } else if (String(payload).startsWith('frame:')) {
    frameId = String(payload).slice('frame:'.length);
  } else {
    ids = [String(payload)];
  }

  if (frameId) {
    const base = buildComposerContext(doc, [], frameId, existingChips);
    const ctx = await enrichComposerContextThumb(doc, base, { frameId });
    if (ctx) insertChip(ctx);
    return;
  }

  const attachable = ids.filter((id) =>
    canAttachNodeToChat(doc?.deltaSetLike?.[id], { imagesOnly })
  );
  if (!attachable.length) return;

  const attachOneVideo = async (id: string) => {
    const att = await buildCanvasVideoAttachment(doc, id, existingChips);
    if (!att) return;
    if (pushAttachment) {
      pushAttachment(att);
      return;
    }
    const src = String(att.dataUrl || '').trim();
    if (!src) return;
    try {
      await onAttachFiles([await imageSrcToFile(src, `canvas-${id}.mp4`)]);
    } catch {
      /* ignore */
    }
  };

  // 编组 → one「组」chip in the input (never as image attachment / file).
  const groupIds = sharedGroupAttachIds(doc, attachable);
  if (groupIds) {
    const base = buildComposerContext(doc, groupIds, null, existingChips);
    let ctx = await enrichComposerContextThumb(doc, base, { nodeIds: groupIds });
    if (ctx && !String(ctx.dataUrl || '').trim()) {
      const dataUrl = await rasterizeNodesToPngDataUrl(doc, groupIds);
      if (dataUrl) {
        ctx = { ...ctx, dataUrl, thumbUrl: String(ctx.thumbUrl || '').trim() || dataUrl };
      }
    }
    if (ctx) insertChip(ctx);
    else if (base) insertChip(base);
    return;
  }

  // Ad-hoc multi: peel videos/images so we never rasterize video into canvas-group.png.
  if (attachable.length > 1) {
    const videos: string[] = [];
    const images: string[] = [];
    const others: string[] = [];
    for (const id of attachable) {
      const node = doc?.deltaSetLike?.[id];
      const src = String(node?.attrs?.src || '').trim();
      if (!imagesOnly && node?.key === 'video' && src) videos.push(id);
      else if (node?.key === 'image' && src) images.push(id);
      else others.push(id);
    }

    for (const id of videos) {
      await attachOneVideo(id);
    }
    const imageFiles: File[] = [];
    for (const id of images) {
      const src = String(doc?.deltaSetLike?.[id]?.attrs?.src || '').trim();
      if (!src) continue;
      try {
        imageFiles.push(await imageSrcToFile(src, `canvas-${id}.png`));
      } catch {
        /* skip */
      }
    }
    if (imageFiles.length) await onAttachFiles(imageFiles);

    if (others.length > 1) {
      const file = await rasterizeNodesToPngFile(doc, others);
      if (file) {
        await onAttachFiles([file]);
        return;
      }
      const base = buildComposerContext(doc, others, null, existingChips);
      const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: others });
      if (ctx) insertChip(ctx);
      return;
    }
    if (others.length === 1) {
      const oid = others[0]!;
      const base = buildComposerContext(doc, [oid], null, existingChips);
      const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: [oid] });
      if (ctx) insertChip(ctx);
    }
    return;
  }

  const id = attachable[0]!;
  const node = doc?.deltaSetLike?.[id];
  if (imagesOnly && node?.key === 'video') return;
  const src = String(node?.attrs?.src || '').trim();
  if (node?.key === 'image' && src) {
    try {
      await onAttachFiles([await imageSrcToFile(src, `canvas-${id}.png`)]);
      return;
    } catch {
      /* fall through to chip */
    }
  }

  if (!imagesOnly && node?.key === 'video' && src) {
    await attachOneVideo(id);
    return;
  }

  const base = buildComposerContext(doc, [id], null, existingChips);
  const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: [id] });
  if (ctx) insertChip(ctx);
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

function isHttpUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://');
}

/** Prefer durable https thumb over local data: for chat history bubbles. */
function preferredChipThumbUrl(c: ComposerContext): string {
  const dataRef = String(c.dataUrl || '').trim();
  const thumb = String(c.thumbUrl || '').trim();
  if (isHttpUrl(dataRef)) return dataRef;
  if (isHttpUrl(thumb)) return thumb;
  if (dataRef.startsWith('data:image/')) return dataRef;
  if (thumb.startsWith('data:image/')) return thumb;
  return dataRef || thumb;
}

function chipToBubbleContext(c: ComposerContext) {
  const preferred = preferredChipThumbUrl(c);
  return {
    key: chipBaseKey(c.key),
    label: c.label,
    kind: c.kind,
    ...(preferred ? { thumbUrl: preferred } : {}),
  };
}

function resolveSendDisplayText(opts: {
  text: string;
  hasChips: boolean;
  hasApplyOps: boolean;
}): string {
  if (opts.text) return opts.text;
  if (opts.hasApplyOps || !opts.hasChips) return 'apply';
  return '';
}

/** Ask mode: typed text matches an apply option → re-send with proposed ops. */
function findAskApplyConfirm(
  messages: ChatUiMessage[],
  typed: string
): { messageId: string; ops: NonNullable<ChatUiMessage['proposedOps']>; label: string } | null {
  const lastAsk = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.proposedOps?.length);
  if (!lastAsk?.proposedOps?.length) return null;
  const t = typed.trim();
  if (!t) return null;
  const applyLabels = new Set<string>();
  for (const o of lastAsk.choiceUi?.options || []) {
    if (o.action === 'apply' && o.label.trim()) applyLabels.add(o.label.trim());
  }
  const legacy = String(lastAsk.applyChoice || '').trim();
  if (legacy) applyLabels.add(legacy);
  for (const applyLabel of applyLabels) {
    const confirms =
      t === applyLabel ||
      (t.length >= 2 && t.length <= applyLabel.length && applyLabel.includes(t));
    if (confirms) {
      return { messageId: lastAsk.id, ops: lastAsk.proposedOps, label: t };
    }
  }
  return null;
}

function clearAskProposalFields(m: ChatUiMessage): ChatUiMessage {
  if (m.role !== 'assistant') return m;
  if (!(m.proposedOps?.length || m.choices?.length || m.applyChoice || m.choiceUi)) return m;
  return {
    ...m,
    proposedOps: undefined,
    applyChoice: undefined,
    choices: undefined,
    choiceUi: undefined,
  };
}

function findLastAskMessage(messages: ChatUiMessage[]): ChatUiMessage | undefined {
  return [...messages]
    .reverse()
    .find(
      (m) =>
        m.role === 'assistant' &&
        Boolean(m.proposedOps?.length || m.choiceUi || m.choices?.length)
    );
}

type AskChoiceSend =
  | { kind: 'noop' }
  | { kind: 'dismiss'; messageId: string }
  | {
      kind: 'apply';
      messageId: string;
      text: string;
      ops: NonNullable<ChatUiMessage['proposedOps']>;
    }
  | { kind: 'reply'; text: string };

/** Map chip click → dismiss / apply proposed ops / plain reply (memory carries context). */
function resolveAskChoiceSend(
  messages: ChatUiMessage[],
  pick: AskChoicePick
): AskChoiceSend {
  const lastAsk = findLastAskMessage(messages);
  if (pick.action === 'dismiss') {
    return lastAsk ? { kind: 'dismiss', messageId: lastAsk.id } : { kind: 'noop' };
  }
  if (pick.action === 'apply' && lastAsk?.proposedOps?.length) {
    const text = pick.selectedLabels?.length
      ? `${pick.label}：${pick.selectedLabels.join('、')}`
      : pick.label;
    return {
      kind: 'apply',
      messageId: lastAsk.id,
      text,
      ops: lastAsk.proposedOps,
    };
  }
  const text = pick.selectedLabels?.length
    ? pick.selectedLabels.join('、')
    : pick.label;
  if (!text) return { kind: 'noop' };
  return { kind: 'reply', text };
}

function splitBubbleContexts(chips: ComposerContext[]) {
  const inline = chips.filter((c) => c.kind !== 'attachment').map(chipToBubbleContext);
  const attachments = chips.filter((c) => c.kind === 'attachment').map(chipToBubbleContext);
  return {
    inlineContexts: inline,
    attachmentContexts: attachments,
    bubbleContexts: [...attachments, ...inline],
  };
}

function shouldRunImageGenPath(opts: {
  isImageModelSelected: boolean;
  forceAgent: boolean;
  hasApplyOps: boolean;
}): boolean {
  return opts.isImageModelSelected && !opts.forceAgent && !opts.hasApplyOps;
}

function shouldRunVideoGenPath(opts: {
  isVideoModelSelected: boolean;
  forceAgent: boolean;
  hasApplyOps: boolean;
}): boolean {
  return opts.isVideoModelSelected && !opts.forceAgent && !opts.hasApplyOps;
}

function firstGeneratedVideoUrl(res: {
  videos?: unknown[];
  assets?: Array<{ url?: string } | null> | null;
}): string {
  for (const u of res.videos || []) {
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  for (const a of res.assets || []) {
    const u = typeof a?.url === 'string' ? a.url.trim() : '';
    if (u) return u;
  }
  return '';
}

function firstGeneratedImageUrl(res: {
  images?: unknown[];
  assets?: Array<{ url?: string } | null> | null;
}): string {
  for (const u of res.images || []) {
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  for (const a of res.assets || []) {
    const u = typeof a?.url === 'string' ? a.url.trim() : '';
    if (u) return u;
  }
  return '';
}

function canvasSizeFromChip(chipNorm: string): string | undefined {
  if (/^\d+x\d+$/.test(chipNorm)) return chipNorm;
  if (chipNorm === 'auto') return 'auto';
  if (/^(?:\d+xauto|autox\d+)$/.test(chipNorm)) return chipNorm;
  return undefined;
}

function pickModelWithFallback(
  pool: LlmModel[],
  selectedId: string,
  fallbackId: string
): LlmModel | undefined {
  return (
    pool.find((m) => m.id === selectedId) ||
    pool.find((m) => m.id === fallbackId) ||
    pool[0]
  );
}

function clampComposerImageCount(n: number): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(4, Math.round(n) || 1)) as 1 | 2 | 3 | 4;
}

function modelButtonTitle(
  modelId: string,
  models: LlmModel[],
  fallbackLabel: string,
  t: (key: string) => string
): string {
  if (modelId === 'auto') return modelDescription(AUTO_MODEL, t);
  const m = models.find((x) => x.id === modelId);
  if (!m) return fallbackLabel;
  return `${m.label || m.id} — ${modelDescription(m, t)}`;
}

function modelButtonLabel(
  modelId: string,
  selected: LlmModel | undefined,
  fallbackLabel: string,
  t: (key: string) => string
): string {
  if (modelId === 'auto') return t('agent.autoToggle');
  return selected?.label || fallbackLabel;
}

function interactionModeLabel(
  mode: ComposerInteractionMode,
  t: (key: string) => string
): string {
  if (mode === 'image') return t('agent.interactionImage');
  if (mode === 'video') return t('agent.interactionVideo');
  return t('agent.interactionAgent');
}

function buildImageModeControls(opts: {
  active: boolean;
  models: LlmModel[];
  modelId: string;
  modelsStatus: 'idle' | 'loading' | 'ready' | 'error';
  resolution: string;
  aspectRatio: string;
  imageCount: 1 | 2 | 3 | 4;
  modelOpen: boolean;
  onResolutionChange: (r: string) => void;
  onAspectRatioChange: (r: string) => void;
  onImageCountChange: (n: number) => void;
  onModelOpenChange: (open: boolean) => void;
  onPickModel: (id: string) => void;
}): ImageModeComposerControls | null {
  if (!opts.active) return null;
  const pool = opts.models.filter((m) => isImageKind(m));
  const selected =
    pickModelWithFallback(pool, opts.modelId, FREE_IMAGE_MODEL_ID) ||
    ({ id: opts.modelId || FREE_IMAGE_MODEL_ID } as LlmModel);
  return {
    resolution: opts.resolution,
    aspectRatio: opts.aspectRatio,
    imageCount: opts.imageCount,
    onResolutionChange: opts.onResolutionChange,
    onAspectRatioChange: opts.onAspectRatioChange,
    onImageCountChange: (n) => opts.onImageCountChange(clampComposerImageCount(n)),
    imageLimits: modelImageLimits(selected),
    creditCost: estimateImageCredits(selected, opts.imageCount, opts.resolution),
    modelLabel: String(selected.label || opts.modelId || FREE_IMAGE_MODEL_ID),
    modelIcon: (
      <ModelBrandIcon model={selected} className="h-3.5 w-3.5 shrink-0" />
    ),
    modelOpen: opts.modelOpen,
    onModelOpenChange: opts.onModelOpenChange,
    modelPanel: (
      <ModelPickerPanel
        tab="image"
        models={opts.models}
        selectedId={opts.modelId}
        status={opts.modelsStatus}
        onPick={opts.onPickModel}
      />
    ),
  };
}

function buildVideoModeControls(opts: {
  active: boolean;
  models: LlmModel[];
  modelId: string;
  modelsStatus: 'idle' | 'loading' | 'ready' | 'error';
  resolution: string;
  aspectRatio: string;
  duration: number;
  modelOpen: boolean;
  onResolutionChange: (r: string) => void;
  onAspectRatioChange: (r: string) => void;
  onDurationChange: (d: number) => void;
  onModelOpenChange: (open: boolean) => void;
  onPickModel: (id: string) => void;
}): VideoModeComposerControls | null {
  if (!opts.active) return null;
  const pool = opts.models.filter((m) => isVideoKind(m));
  const selected =
    pickModelWithFallback(pool, opts.modelId, DEFAULT_VIDEO_MODEL_ID) ||
    ({ id: opts.modelId || DEFAULT_VIDEO_MODEL_ID } as LlmModel);
  return {
    resolution: opts.resolution,
    aspectRatio: opts.aspectRatio,
    duration: opts.duration,
    onResolutionChange: opts.onResolutionChange,
    onAspectRatioChange: opts.onAspectRatioChange,
    onDurationChange: opts.onDurationChange,
    creditCost: estimateVideoCredits(selected),
    modelLabel: String(selected.label || opts.modelId || DEFAULT_VIDEO_MODEL_ID),
    modelIcon: (
      <ModelBrandIcon model={selected} className="h-3.5 w-3.5 shrink-0" />
    ),
    modelOpen: opts.modelOpen,
    onModelOpenChange: opts.onModelOpenChange,
    modelPanel: (
      <ModelPickerPanel
        tab="video"
        models={opts.models}
        selectedId={opts.modelId}
        status={opts.modelsStatus}
        onPick={opts.onPickModel}
      />
    ),
  };
}

function buildImageGenRequestBody(opts: {
  prompt: string;
  canPickModel: boolean;
  model: string;
  aspect?: string;
  resolution?: string;
  isImageInteraction: boolean;
  attachedImages: string[];
}): {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  quality?: string;
  resolution?: string;
  images?: string[];
} {
  const body: {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    quality?: string;
    resolution?: string;
    images?: string[];
  } = { prompt: opts.prompt };
  if (!opts.canPickModel) body.model = FREE_IMAGE_MODEL_ID;
  else if (opts.model) body.model = opts.model;
  if (opts.aspect) body.aspect_ratio = opts.aspect;
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.isImageInteraction) body.quality = DEFAULT_IMAGE_QUALITY;
  if (opts.attachedImages.length) body.images = opts.attachedImages;
  return body;
}

function uniqueVisionUrls(urls: Array<string | null | undefined>, max = 4): string[] {
  return urls
    .filter((u): u is string => Boolean(u))
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, max);
}

function resolveDesignFocusFrameId(opts: {
  freeCanvasMention: boolean;
  editTargetId: string | null | undefined;
  chipFrameId: string | null | undefined;
}): string | null {
  if (opts.freeCanvasMention) return null;
  return opts.editTargetId || opts.chipFrameId || null;
}

type ImageGenFinishKind = 'aborted' | 'failed' | 'success';

function resolveImageGenFinishKind(opts: {
  aborted: boolean;
  urls: string[];
}): ImageGenFinishKind {
  if (opts.aborted) return 'aborted';
  if (!opts.urls.length) return 'failed';
  return 'success';
}

function mergeLongSuggestions<T extends { text: string }>(
  prev: T[],
  incoming: T[] | undefined
): T[] {
  if (!incoming?.length) return prev;
  return [
    ...prev,
    ...incoming.filter((s) => !prev.some((p) => p.text === s.text)),
  ];
}

type SendChipContext = {
  frameChip: ComposerContext | undefined;
  chipFrameId: string | null;
  mentionNodeIds: string[];
  attachedImages: string[];
  mentionImageSrcs: string[];
  skillRefs: string[];
};

function collectSendChipContext(chips: ComposerContext[]): SendChipContext {
  const frameChip = chips.find((c) => c.kind === 'frame');
  const chipFrameId = frameChip
    ? chipBaseKey(frameChip.key).replace(/^frame:/, '')
    : null;
  const nodeChipIds = [
    ...new Set(
      chips
        .map((c) => chipBaseKey(c.key))
        .filter((k) => k.startsWith('node:'))
        .map((k) => k.replace(/^node:/, ''))
        .filter(Boolean)
    ),
  ];
  const groupChip = chips.find((c) => c.kind === 'group' || c.kind === 'multi');
  const groupMemberIds = groupChip
    ? chipBaseKey(groupChip.key)
        .replace(/^group:/, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const mentionNodeIds = nodeChipIds.length ? nodeChipIds : groupMemberIds;
  const attachedImages = chips
    .filter((c) => c.kind === 'attachment' && c.dataUrl)
    .map((c) => String(c.dataUrl))
    .filter((u) => u.startsWith('data:image/') || u.startsWith('http'));
  const mentionImageSrcs = chips
    .filter((c) => {
      if (c.kind === 'attachment') return false;
      const src = String(c.dataUrl || c.thumbUrl || '').trim();
      return (
        c.kind === 'image' ||
        src.startsWith('data:image/') ||
        src.startsWith('http') ||
        src.startsWith('/')
      );
    })
    .map((c) => String(c.dataUrl || c.thumbUrl || '').trim())
    .filter(Boolean);
  const skillRefs = [
    ...new Set(
      chips
        .filter((c) => c.kind === 'skill')
        .map((c) => {
          const base = chipBaseKey(c.key);
          if (base.startsWith('skill:')) return base.slice(6);
          return String(c.payload || base).trim();
        })
        .filter(Boolean)
    ),
  ];
  return {
    frameChip,
    chipFrameId,
    mentionNodeIds,
    attachedImages,
    mentionImageSrcs,
    skillRefs,
  };
}

function resolveImageGenPlan(opts: {
  isImageInteraction: boolean;
  imageGenCountSetting: number;
  isImageModelSelected: boolean;
  imageResolution: string;
  imageGenAspectRatio: string;
  mentionNodeIds: string[];
  docForFill: any;
}): {
  imageGenCount: number;
  imageGenAspect?: string;
  imageGenResolution?: string;
  imageFillTargets: string[];
} {
  const imageGenCount = opts.isImageInteraction
    ? Math.max(1, Math.min(4, Math.round(opts.imageGenCountSetting) || 1))
    : opts.isImageModelSelected
      ? 1
      : 0;
  let imageGenAspect: string | undefined;
  let imageGenResolution: string | undefined;
  const imageFillTargets: string[] = [];
  if (!imageGenCount) {
    return { imageGenCount, imageFillTargets };
  }
  if (opts.isImageInteraction) {
    imageGenResolution = opts.imageResolution;
    if (String(opts.imageGenAspectRatio).trim() !== 'smart') {
      imageGenAspect = String(opts.imageGenAspectRatio).trim() || undefined;
    }
  }
  for (const id of opts.mentionNodeIds) {
    const n = opts.docForFill?.deltaSetLike?.[id];
    if (!n) continue;
    const key = String(n.key || '').toLowerCase();
    if (['text', 'frame', 'artboard', 'group'].includes(key)) continue;
    const shape = String(n.attrs?.shapeType || key || '').toLowerCase();
    if (['line', 'arrow', 'pen', 'pencil'].includes(shape)) continue;
    imageFillTargets.push(id);
  }
  if (imageFillTargets[0] && opts.docForFill) {
    const n = opts.docForFill.deltaSetLike[imageFillTargets[0]];
    const tw = Math.max(1, Number(n?.width) || 0);
    const th = Math.max(1, Number(n?.height) || 0);
    if (tw > 0 && th > 0) {
      imageGenAspect = `${Math.round(tw)}:${Math.round(th)}`;
    }
  }
  return { imageGenCount, imageGenAspect, imageGenResolution, imageFillTargets };
}

function buildStreamingAssistantSeed(opts: {
  imageGenCount: number;
  imageGenAspect?: string;
  imageGenAspectRatio: string;
  canPickModel: boolean;
  model: string;
  selectedModel?: LlmModel | null;
  models: LlmModel[];
  t: TFn;
}): Pick<
  ChatUiMessage,
  'steps' | 'imagePendingCount' | 'imageAspectRatio' | 'imageModelId' | 'imageModelLabel'
> {
  if (opts.imageGenCount) {
    return {
      imagePendingCount: opts.imageGenCount,
      imageAspectRatio: opts.imageGenAspect || opts.imageGenAspectRatio,
      imageModelId: !opts.canPickModel
        ? FREE_IMAGE_MODEL_ID
        : String(opts.model || opts.selectedModel?.id || ''),
      imageModelLabel: String(
        (!opts.canPickModel
          ? opts.models.find((m) => m.id === FREE_IMAGE_MODEL_ID)?.label
          : opts.selectedModel?.label) ||
          opts.selectedModel?.id ||
          opts.model ||
          FREE_IMAGE_MODEL_ID
      ),
      steps: [],
    };
  }
  return {
    steps: [],
  };
}

function buildVideoAssistantSeed(opts: {
  videoGenAspect?: string;
  videoGenAspectRatio: string;
  canPickModel: boolean;
  model: string;
  selectedModel?: LlmModel | null;
}): Pick<
  ChatUiMessage,
  'videoPendingCount' | 'imageAspectRatio' | 'imageModelId' | 'imageModelLabel' | 'steps'
> {
  return {
    videoPendingCount: 1,
    imageAspectRatio: opts.videoGenAspect || opts.videoGenAspectRatio,
    imageModelId: !opts.canPickModel
      ? DEFAULT_VIDEO_MODEL_ID
      : String(opts.model || opts.selectedModel?.id || DEFAULT_VIDEO_MODEL_ID),
    imageModelLabel: String(
      opts.selectedModel?.label || opts.model || DEFAULT_VIDEO_MODEL_ID
    ),
    steps: [],
  };
}

type DesignSendMutable = {
  designStarted: boolean;
  canvasMutated: boolean;
  nodesPainted: boolean;
};

function buildDesignSceneSnapshot(opts: {
  docNow: any;
  chipFrameId: string | null;
  frameChip: ComposerContext | undefined;
  mentionNodeIds: string[];
  lastAgentFrameId: string | null;
  taskStateFrameId?: string | null;
  canvasUi?: CanvasUiBridge | null;
}) {
  let chipFrameId = opts.chipFrameId;
  if (!chipFrameId && opts.mentionNodeIds.length && opts.docNow) {
    chipFrameId = frameIdContainingNode(opts.docNow, opts.mentionNodeIds[0]);
  }
  const freeCanvasMention = Boolean(
    opts.mentionNodeIds.length && !chipFrameId && !opts.frameChip
  );
  let editTarget: ReturnType<typeof resolveDesignTargetFrame> | null = null;
  if (opts.docNow && !freeCanvasMention) {
    editTarget = resolveDesignTargetFrame(
      opts.docNow,
      chipFrameId,
      opts.lastAgentFrameId || opts.taskStateFrameId || null
    );
  }
  const targetFrameId = resolveDesignFocusFrameId({
    freeCanvasMention,
    editTargetId: editTarget?.id,
    chipFrameId,
  });
  const sceneNodes = opts.docNow
    ? buildSceneNodesForCanvas(opts.docNow, {
        focusFrameId: targetFrameId,
        forceIds: opts.mentionNodeIds,
      })
    : [];
  const sceneFrames = opts.docNow ? buildSceneFramesSnapshot(opts.docNow) : [];
  const vp = opts.canvasUi?.getViewportSceneBounds?.() || null;
  const spatialSummary = opts.docNow
    ? buildSpatialSummary(opts.docNow, {
        focusFrameId: targetFrameId,
        viewport: vp
          ? { x: vp.x, y: vp.y, w: vp.width, h: vp.height }
          : null,
      })
    : null;
  const seedLiveNodeIds = resolveSeedLiveNodeIds({
    doc: opts.docNow,
    editTarget,
    freeCanvasMention,
    mentionNodeIds: opts.mentionNodeIds,
  });
  return {
    chipFrameId,
    targetFrameId,
    sceneNodes,
    sceneFrames,
    spatialSummary,
    seedLiveNodeIds,
  };
}

function createDesignAgentEventRouter(opts: {
  t: TFn;
  assistantId: string;
  userMsg: ChatUiMessage;
  chipNorm: string;
  setMessages: (updater: (prev: ChatUiMessage[]) => ChatUiMessage[]) => void;
  setImageAspectRatio: (next: string) => void;
  setDesignScene: (scene: DesignScene) => void;
  designSceneRef: { current: DesignScene | null };
  lastAgentFrameIdRef: { current: string | null };
  lastAgentSvgByFrameRef: { current: Map<string, string> };
  checkpointsRef: { current: Map<string, any> };
  store: ReturnType<typeof useStore>;
  finishAssistantPatch: (m: ChatUiMessage, patch?: Partial<ChatUiMessage>) => ChatUiMessage;
  mutable: DesignSendMutable;
}) {
  const handleUiChat = () => {
    opts.mutable.designStarted = false;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        return opts.finishAssistantPatch(m, {
          content: (m.content || '').trim(),
          steps: buildChatProcessSteps(opts.t, m),
          thinking: undefined,
          pipeline: undefined,
          drawing: undefined,
          intent: undefined,
        });
      })
    );
  };

  const handleUiToken = (ev: Extract<AgentStepEvent, { type: 'token' }>) => {
    opts.mutable.designStarted = false;
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? {
              ...m,
              content: (m.content || '') + (ev.text || ''),
              intent: undefined,
              thinking: undefined,
            }
          : m
      )
    );
  };

  const handleUiThinking = (ev: Extract<AgentStepEvent, { type: 'thinking' }>) => {
    const piece = String(ev.text);
    if (!piece) return;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        return {
          ...m,
          steps: applyThinkingBodyToSteps(
            m.steps || [],
            piece,
            Boolean(ev.replace),
            opts.t
          ),
        };
      })
    );
  };

  const handleUiAnalysisDelta = (ev: Extract<AgentStepEvent, { type: 'analysis_delta' }>) => {
    let piece = String(ev.text).replace(/^\s*(?:用户)?意图分析\s*[:：]\s*/i, '');
    piece = piece.replace(/^\s*intent\s*analysis\s*[:：]\s*/i, '');
    if (!piece.trim()) return;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const next = applyAnalysisDeltaToSteps(m.steps || [], piece);
        return next ? { ...m, steps: next } : m;
      })
    );
  };

  const handleUiCanvas = (ev: Extract<AgentStepEvent, { type: 'canvas' }>) => {
    const next = String(ev.size).trim();
    const sendLocked = /^\d+x\d+$/.test(opts.chipNorm);
    const keepAutoChip =
      opts.chipNorm === 'auto' || /^(?:\d+xauto|autox\d+)$/.test(opts.chipNorm);
    if (!sendLocked && next && !keepAutoChip) opts.setImageAspectRatio(next);
    if (
      ev.scene === 'website' ||
      ev.scene === 'mobile' ||
      ev.scene === 'image' ||
      ev.scene === 'poster' ||
      ev.scene === 'drawing'
    ) {
      opts.setDesignScene(ev.scene);
      opts.designSceneRef.current = ev.scene;
    }
  };

  const handleUiActivity = (ev: Extract<AgentStepEvent, { type: 'activity' }>) => {
    if (ev.kind === 'tool' || ev.kind === 'added' || ev.kind === 'updated') {
      opts.mutable.designStarted = true;
    }
    // Intent confirm / "understanding request" rows — keep off the chat timeline.
    if (ev.kind === 'thought') return;
    const actStatus = normalizeActivityStatus(ev.status);
    const label = formatActivityLabel(opts.t, {
      kind: ev.kind,
      status: actStatus,
      durationSec: ev.durationSec,
      count: ev.count,
      skillName: ev.skillName,
      detail: ev.detail,
      stage: ev.stage,
    });
    if (!label) return;
    const detailText = (ev.detail || '').trim();
    const summaryText = String(ev.summary || '').trim();
    const summary = activityRowSummary({
      kind: ev.kind,
      label,
      detailText,
      summaryText,
    });
    const variant = activityRowVariant(actStatus, ev.kind);
    const nestItem = activityNestItem(opts.t, ev.item);
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const next = applyActivityEventToSteps(m.steps || [], {
          kind: ev.kind,
          eventId: ev.id,
          status: actStatus,
          label,
          summary,
          variant,
          nestItem,
          bodyMd: ev.body ? String(ev.body) : '',
        });
        return next ? { ...m, steps: next } : m;
      })
    );
  };

  const handleUiPhase = (ev: Extract<AgentStepEvent, { type: 'phase' }>) => {
    const labels = ev.progress.labels || [];
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? {
              ...m,
              pipeline: {
                category: ev.progress.category,
                labels,
                currentIndex: ev.progress.currentIndex,
                stepConfirm: Boolean(ev.progress.stepConfirm),
                collabMode:
                  (ev.progress.collabMode as 'collaborative' | 'milestone' | 'auto' | undefined) ||
                  'auto',
              },
            }
          : m
      )
    );
  };

  const handleUiSvgDelta = (ev: Extract<AgentStepEvent, { type: 'svg_delta' }>) => {
    opts.mutable.designStarted = true;
    if (!ev.svg) return;
    const fid =
      opts.lastAgentFrameIdRef.current ||
      (opts.store.getState() as any).editor.document?.activeFrameId ||
      null;
    if (!fid) return;
    opts.lastAgentSvgByFrameRef.current.set(String(fid), ev.svg);
    opts.lastAgentFrameIdRef.current = String(fid);
  };

  const handleUiError = (ev: Extract<AgentStepEvent, { type: 'error' }>) => {
    const friendly = humanizeDesignError(opts.t, ev.message);
    message.error(friendly);
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? opts.finishAssistantPatch(m, {
              content: m.content || friendly || opts.t('agent.requestFailed'),
              thinking: undefined,
              pipeline: undefined,
              drawing: undefined,
            })
          : m
      )
    );
  };

  const handleUiDone = (ev: Extract<AgentStepEvent, { type: 'done' }>) => {
    const painted = Boolean(ev.painted);
    if (painted) {
      opts.mutable.canvasMutated = true;
      opts.mutable.nodesPainted = true;
    }
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id === opts.assistantId) {
          if (!opts.mutable.designStarted) {
            return patchChatDoneAssistant(m, {
              t: opts.t,
              finish: opts.finishAssistantPatch,
              choices: ev.choices,
              proposedOps: ev.proposedOps,
              applyChoice: ev.applyChoice,
              choiceUi: ev.choiceUi,
            });
          }
          return patchDesignDoneAssistant(m, {
            t: opts.t,
            finish: opts.finishAssistantPatch,
            painted,
            designStarted: opts.mutable.designStarted,
            summary: ev.summary,
            choices: ev.choices,
            proposedOps: ev.proposedOps,
            applyChoice: ev.applyChoice,
            choiceUi: ev.choiceUi,
          });
        }
        if (
          m.id === opts.userMsg.id &&
          painted &&
          opts.checkpointsRef.current.has(opts.userMsg.id)
        ) {
          return { ...m, canRestore: true };
        }
        return m;
      })
    );
  };

  return (ev: AgentStepEvent) => {
    switch (ev.type) {
      case 'permission':
        return;
      case 'chat':
        handleUiChat();
        return;
      case 'token':
        handleUiToken(ev);
        return;
      case 'thinking':
        if (ev.text) handleUiThinking(ev);
        return;
      case 'analysis_delta':
        if (ev.text) handleUiAnalysisDelta(ev);
        return;
      case 'canvas':
        if (ev.size) handleUiCanvas(ev);
        return;
      case 'analysis':
        return;
      case 'drawing':
        opts.mutable.designStarted = true;
        opts.setMessages((prev) =>
          prev.map((m) =>
            m.id === opts.assistantId ? { ...m, drawing: Boolean(ev.active) } : m
          )
        );
        return;
      case 'activity':
        handleUiActivity(ev);
        return;
      case 'phase':
        handleUiPhase(ev);
        return;
      case 'svg_delta':
        handleUiSvgDelta(ev);
        return;
      case 'error':
        handleUiError(ev);
        return;
      case 'done':
        handleUiDone(ev);
        return;
      default:
        return;
    }
  };
}

/** Agent panel: chat + model picker + Agent input. */
function AgentDock({
  open,
  onClose,
  className,
  floating = false,
  allowedInteractionModes,
  draftPrompt,
  autoSubmitDraft = false,
  onDraftConsumed,
  draftAttachments,
  draftContexts,
  draftModelId,
  draftInteractionMode,
  draftImageAspectRatio,
  draftScene,
  attachToChat,
  onAttachConsumed,
  dataTour,
  canvasUi: canvasUiProp,
  projectName,
  onGoHome,
}: AgentDockProps): ReactNode {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const store = useStore();
  const document = useSelector((s: any) => s.editor.document);
  const activeFrameId = useSelector(
    (s: any) => (s.editor.document?.activeFrameId as string | null) ?? null
  );
  const planId = useSelector((s: any) => (s.wallet?.planId as PlanId) || 'free');
  const canPickModel = planAllowsModelPick(planId);

  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [model, setModel] = useState('auto');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('auto');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  /** @ / cube → model panel */
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [mentionPanelOpen, setMentionPanelOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const [skillCatalog, setSkillCatalog] = useState<DesignSkillCard[]>([]);
  /** Context chips in the composer (right-click 添加到 Chat + file attachments). */
  const [contextChips, setContextChips] = useState<ComposerContext[]>([]);
  const contextChipsRef = useRef<ComposerContext[]>([]);
  contextChipsRef.current = contextChips;
  const pinnedContextKeysRef = useRef<Set<string>>(new Set());
  const contextDismissedKeyRef = useRef<string | null>(null);
  /** Dedup canvas→composer applies (React StrictMode runs effects twice). */
  const attachToChatLockRef = useRef<string | null>(null);
  const pendingCanvasAttachLockRef = useRef<string | null>(null);
  const onlyImageInteraction =
    allowedInteractionModes?.length === 1 && allowedInteractionModes[0] === 'image';
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerRunMode>(
    onlyImageInteraction ? 'image' : 'agent'
  );
  /** Agent / Ask / Image — mode switch in the composer toolbar. */
  const [interactionMode, setInteractionMode] = useState<ComposerInteractionMode>(
    onlyImageInteraction ? 'image' : 'agent'
  );
  /** Image-mode gen settings (mirrors ImageGeneratorCard). */
  const [imageResolution, setImageResolution] = useState(DEFAULT_IMAGE_RESOLUTION);
  const [imageGenAspectRatio, setImageGenAspectRatio] = useState(DEFAULT_IMAGE_ASPECT_RATIO);
  const [imageGenCountSetting, setImageGenCountSetting] = useState(DEFAULT_IMAGE_COUNT);
  const [imageModelPanelOpen, setImageModelPanelOpen] = useState(false);
  const [videoResolution, setVideoResolution] = useState(DEFAULT_VIDEO_RESOLUTION);
  const [videoGenAspectRatio, setVideoGenAspectRatio] = useState(DEFAULT_VIDEO_ASPECT_RATIO);
  const [videoGenDuration, setVideoGenDuration] = useState(DEFAULT_VIDEO_DURATION);
  const [videoModelPanelOpen, setVideoModelPanelOpen] = useState(false);
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
  const canvasAttachPick = useSelector(
    (s: any) => s.editor.canvasAttachPick as null | { target: string }
  );
  const pickingFromCanvas = canvasAttachPick?.target === 'agent';
  const selectedNodeIds = useSelector(
    (s: any) => (s.editor.selectedNodeIds as string[]) ?? EMPTY_ID_LIST
  );
  const selectedFrameIds = useSelector(
    (s: any) => (s.editor.selectedFrameIds as string[]) ?? EMPTY_ID_LIST
  );
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
    refreshSessions,
    formatChatTime,
    newMessageId,
    taskState,
    setTaskState,
    pendingLongSuggestions,
    setPendingLongSuggestions,
  } = useChatSessions(chatScopeId);
  const listRef = useRef<VirtualListHandle | null>(null);
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
  const enabledInteractionModes = useMemo(
    () =>
      allowedInteractionModes && allowedInteractionModes.length
        ? allowedInteractionModes
        : (['agent', 'ask', 'image', 'video'] as ComposerInteractionMode[]),
    [allowedInteractionModes]
  );

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
        void warmAgentRoutePresetRules(cat.global_rules);
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
    listModels()
      .then((res) => {
        if (cancelled) return;
        warmOpenrouterAvailability(res?.openrouterAvailable);
        const list = normalizeModelList(res?.models, res?.imageModels, res?.videoModels);
        setModels(list);
        setModelsStatus('ready');
        setAvailable(Boolean(res?.available));
        setModel((prev) => {
          if (!canPickModel) return planAllowsModelId('free', prev) ? prev : 'auto';
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
  }, [open, canPickModel]);

  useEffect(() => {
    if (canPickModel) return;
    setModel((prev) => {
      if (prev === FREE_IMAGE_MODEL_ID) {
        setComposerMode('image');
        return prev;
      }
      setComposerMode('agent');
      setInteractionMode('agent');
      return 'auto';
    });
  }, [canPickModel]);

  useEffect(() => {
    if (!open || draftPrompt == null) return;
    const text = draftPrompt;
    const shouldAuto = autoSubmitDraft;
    const inlineDraft = draftContexts || [];
    const attachmentDraft = draftAttachments || [];
    // Attachments live in React state (square strip). Inline skills use insertContextAtCaret
    // only — same as 「添加到 Chat」— so we do not double-add via setContextChips.
    if (attachmentDraft.length) {
      setContextChips((prev) => {
        const keys = new Set(prev.map((c) => c.key));
        const merged = [...prev];
        for (const a of attachmentDraft) {
          if (!keys.has(a.key)) merged.push(a);
        }
        return merged;
      });
    }
    if (inlineDraft.length) {
      queueMicrotask(() => {
        for (const ctx of inlineDraft) {
          inputRef.current?.insertContextAtCaret(ctx);
        }
      });
    }
    if (draftModelId) {
      if (!canPickModel) {
        if (planAllowsModelId('free', draftModelId) && isImageKind({ id: draftModelId })) {
          setModel(FREE_IMAGE_MODEL_ID);
          setComposerMode('image');
        } else {
          setModel('auto');
          setComposerMode('agent');
        }
      } else {
        setModel(draftModelId);
        const image = isImageKind({ id: draftModelId });
        setComposerMode(image ? 'image' : 'agent');
      }
    }
    if (draftInteractionMode === 'image') {
      setInteractionMode('image');
      setComposerMode('image');
      // Prefer the model chosen on Home; fall back to free Seedream.
      if (!draftModelId || !planAllowsModelId(canPickModel ? planId : 'free', draftModelId)) {
        setModel(FREE_IMAGE_MODEL_ID);
      }
    } else if (draftInteractionMode === 'video') {
      setInteractionMode('video');
      setComposerMode('video');
      if (!draftModelId || !planAllowsModelId(canPickModel ? planId : 'free', draftModelId)) {
        setModel(DEFAULT_VIDEO_MODEL_ID);
      }
    } else if (draftInteractionMode === 'ask') {
      setInteractionMode('ask');
      setComposerMode('agent');
    } else if (draftInteractionMode === 'agent') {
      setInteractionMode('agent');
      setComposerMode('agent');
    }
    if (draftImageAspectRatio) {
      setImageAspectRatio(draftImageAspectRatio);
      // Home Image chat passes gen aspect here — seed the image-mode picker too.
      if (draftInteractionMode === 'image') {
        setImageGenAspectRatio(draftImageAspectRatio as typeof imageGenAspectRatio);
      }
      if (draftInteractionMode === 'video') {
        setVideoGenAspectRatio(draftImageAspectRatio);
      }
    }
    if (draftScene) {
      setDesignScene(draftScene);
      designSceneRef.current = draftScene;
    }
    onDraftConsumed?.();
    if (shouldAuto && text.trim()) {
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
    if (draftPrompt != null) return;
    if (pendingAutoSubmitRef.current) return;
    const boot = peekHomeAgentBoot();
    if (!boot) return;
    const text = String(boot.prompt || '').trim();
    const inline = contextsFromBoot(boot);
    const attachments = attachmentsFromBoot(boot);
    if (!text && !inline.length && !attachments.length) return;
    if (attachments.length) {
      setContextChips((prev) => {
        const keys = new Set(prev.map((c) => c.key));
        return [...prev, ...attachments.filter((a) => !keys.has(a.key))];
      });
    }
    if (inline.length) {
      queueMicrotask(() => {
        for (const ctx of inline) {
          inputRef.current?.insertContextAtCaret(ctx);
        }
      });
    }
    if (boot.modelId) {
      setModel(boot.modelId);
      const image = isImageKind({ id: boot.modelId });
      const video = isVideoKind({ id: boot.modelId });
      setComposerMode(image ? 'image' : video ? 'video' : 'agent');
    }
    if (boot.interactionMode === 'agent') {
      setInteractionMode('agent');
      setComposerMode('agent');
    } else if (boot.interactionMode === 'ask') {
      setInteractionMode('ask');
      setComposerMode('agent');
    } else if (boot.interactionMode === 'image') {
      setInteractionMode('image');
      setComposerMode('image');
    } else if (boot.interactionMode === 'video') {
      setInteractionMode('video');
      setComposerMode('video');
    }
    if (boot.imageAspectRatio) setImageAspectRatio(boot.imageAspectRatio);
    if (boot.scene) {
      setDesignScene(boot.scene);
      designSceneRef.current = boot.scene;
    }
    if (boot.autoSubmit && text) {
      pendingAutoSubmitRef.current = text;
      setInput(text);
    } else {
      setInput(text);
      queueMicrotask(() => inputRef.current?.focus());
    }
    clearHomeAgentBoot();
  }, [open, draftPrompt, location.search]);

  /** Right-click / pick 「添加到 Chat」— shapes → chips; images/videos → attachment strip. */
  useEffect(() => {
    if (attachToChat == null) {
      attachToChatLockRef.current = null;
      return;
    }
    if (!open || !document) return;
    const token = canvasAttachToken(attachToChat);
    // StrictMode (and any double-delivery) must not upload the same payload twice.
    if (attachToChatLockRef.current === token) {
      onAttachConsumed?.();
      return;
    }
    attachToChatLockRef.current = token;
    const payload = attachToChat;
    onAttachConsumed?.();
    void applyCanvasAttachPayload({
      document,
      payload,
      existingChips: contextChipsRef.current,
      onAttachFiles: handleAttachFiles,
      insertChip: (ctx) => {
        pinnedContextKeysRef.current.add(ctx.key);
        contextDismissedKeyRef.current = null;
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focusEnd();
      },
      pushAttachment: (att) => {
        pinnedContextKeysRef.current.add(att.key);
        setContextChips((prev) => {
          if (prev.some((c) => c.key === att.key)) return prev;
          return [...prev, att];
        });
        queueMicrotask(() => inputRef.current?.focusEnd());
      },
      imagesOnly:
        interactionMode === 'image' ||
        (composerMode === 'image' && interactionMode !== 'video') ||
        (isImageKind(models.find((m) => m.id === model)) && interactionMode !== 'video'),
    });
    // handleAttachFiles / onAttachConsumed omitted — identity churn must not re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attachToChat, document, interactionMode, composerMode, model, models]);

  /** Composer "Add from canvas" pick result (node composers use pending; agent uses attachToChat). */
  const pendingCanvasAttach = useSelector(
    (s: any) =>
      s.editor.pendingCanvasAttach as null | { target: string; payload: string | string[] }
  );
  useEffect(() => {
    if (!pendingCanvasAttach) {
      pendingCanvasAttachLockRef.current = null;
      return;
    }
    if (!open || !document) return;
    if (pendingCanvasAttach.target !== 'agent') return;
    const token = `pending:${pendingCanvasAttach.target}:${canvasAttachToken(pendingCanvasAttach.payload)}`;
    if (pendingCanvasAttachLockRef.current === token) {
      dispatch(consumePendingCanvasAttach());
      return;
    }
    pendingCanvasAttachLockRef.current = token;
    const payload = pendingCanvasAttach.payload;
    dispatch(consumePendingCanvasAttach());
    void applyCanvasAttachPayload({
      document,
      payload,
      existingChips: contextChipsRef.current,
      onAttachFiles: handleAttachFiles,
      insertChip: (ctx) => {
        pinnedContextKeysRef.current.add(ctx.key);
        contextDismissedKeyRef.current = null;
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focusEnd();
      },
      pushAttachment: (att) => {
        pinnedContextKeysRef.current.add(att.key);
        setContextChips((prev) => {
          if (prev.some((c) => c.key === att.key)) return prev;
          return [...prev, att];
        });
        queueMicrotask(() => inputRef.current?.focusEnd());
      },
      imagesOnly:
        interactionMode === 'image' ||
        (composerMode === 'image' && interactionMode !== 'video') ||
        (isImageKind(models.find((m) => m.id === model)) && interactionMode !== 'video'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingCanvasAttach, document, dispatch, interactionMode, composerMode, model, models]);

  useEffect(() => {
    listRef.current?.scrollToBottom();
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
    setMentionPanelOpen(false);
    setMentionQuery('');
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

  const handleAttachFiles = async (files: File[], opts?: { mention?: boolean }) => {
    const MAX_IMAGE = 10 * 1024 * 1024;
    const MAX_VIDEO = 100 * 1024 * 1024;
    const pickedModel = models.find((m) => m.id === model);
    const isVideoMode =
      interactionMode === 'video' ||
      composerMode === 'video' ||
      isVideoKind(pickedModel);
    const isImageMode =
      !isVideoMode &&
      (interactionMode === 'image' ||
        composerMode === 'image' ||
        isImageKind(pickedModel));
    const limit = agentAttachmentLimit({
      models,
      modelId: model,
      isImageMode: isImageMode || isVideoMode,
      rules: designCatalog?.global_rules,
      routedImageId: routeOverridesForApi(loadAgentRoutePrefs(designCatalog?.global_rules))?.image,
      freeImageId: FREE_IMAGE_MODEL_ID,
      autoModel: AUTO_MODEL,
    });
    let remaining = Math.max(
      0,
      limit - contextChips.filter((c) => c.kind === 'attachment').length
    );
    if (remaining <= 0) {
      message.warning(t('agent.attachMaxReached', { count: limit }));
      return;
    }

    const accepted: File[] = [];
    for (const file of files) {
      if (remaining <= 0) {
        message.warning(t('agent.attachMaxReached', { count: limit }));
        break;
      }
      const mime = (file.type || '').toLowerCase();
      const isVideo = mime.startsWith('video/');
      const isImage = mime.startsWith('image/');
      if (!isImage && !isVideo) {
        message.warning(t('agent.attachImageOnly', { name: file.name }));
        continue;
      }
      const maxBytes = isVideo ? MAX_VIDEO : MAX_IMAGE;
      if (file.size > maxBytes) {
        message.warning(t('agent.attachTooLarge', { name: file.name }));
        continue;
      }
      accepted.push(file);
      remaining -= 1;
    }
    if (!accepted.length) return;

    const previews = await Promise.all(
      accepted.map(async (file) => {
        try {
          const preview = await readFileAsDataUrl(file);
          let thumb = preview;
          if (file.type.startsWith('video/')) {
            try {
              thumb = await captureVideoPosterFrame(preview);
            } catch {
              /* poster optional */
            }
          }
          return { file, preview, thumb, ok: true as const };
        } catch {
          message.error(t('agent.attachReadFailed', { name: file.name }));
          return { file, preview: '', thumb: '', ok: false as const };
        }
      })
    );
    const readable = previews.filter((p) => p.ok);
    if (!readable.length) return;

    let mentionOrdinal = contextChipsRef.current.filter((c) => c.kind === 'attachment').length;
    const batch: Array<{
      file: File;
      key: string;
      preview: string;
      pending: ComposerContext;
      mentionCtx: ComposerContext | null;
    }> = readable.map(({ file, preview, thumb }) => {
      const key = `attachment:${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`;
      const isVideo = file.type.startsWith('video/');
      const pending: ComposerContext = {
        key,
        label: file.name,
        kind: 'attachment',
        payload: isVideo
          ? `[Attached video]\nname: ${file.name}\nmime: ${file.type}`
          : `[Attached image]\nname: ${file.name}\nmime: ${file.type}`,
        dataUrl: preview,
        thumbUrl: thumb,
        uploadStatus: 'uploading',
      };
      pinnedContextKeysRef.current.add(key);
      mentionOrdinal += 1;
      const n = mentionOrdinal;
      const mentionCtx: ComposerContext | null = opts?.mention
        ? {
            key: `attach-ref:${chipBaseKey(key)}`,
            label: t('agent.mentionAttachImageN', { n }),
            kind: 'image',
            payload: pending.payload || `[User attachment ${n}]`,
            dataUrl: preview,
            thumbUrl: thumb,
          }
        : null;
      return { file, key, preview, pending, mentionCtx };
    });

    setContextChips((prev) => {
      const extra: ComposerContext[] = [];
      for (const item of batch) {
        extra.push(item.pending);
        if (item.mentionCtx) extra.push(item.mentionCtx);
      }
      return [...prev, ...extra];
    });
    queueMicrotask(() => inputRef.current?.focusEnd());

    await Promise.all(
      batch.map(async ({ file, key, preview, pending }) => {
        try {
          const poster = String(pending.thumbUrl || '').trim();
          const uploaded = await uploadComposerAttachment(file, {
            previewDataUrl:
              file.type.startsWith('video/') && poster.startsWith('data:image/')
                ? poster
                : preview,
          });
          const imageRef = String(uploaded.imageRef || '').trim();
          const localPreview = String(uploaded.previewDataUrl || poster || preview).trim();
          setContextChips((prev) => {
            if (!prev.some((c) => c.key === key)) {
              if (uploaded.uploadKey) {
                void deleteUploadedFile(uploaded.uploadKey).catch(() => {});
              }
              return prev;
            }
            return prev.map((c) =>
              c.key === key
                ? {
                    ...c,
                    dataUrl: imageRef || localPreview,
                    thumbUrl:
                      (c.thumbUrl && c.thumbUrl.startsWith('data:image/')
                        ? c.thumbUrl
                        : null) ||
                      (localPreview.startsWith('data:image/') ? localPreview : null) ||
                      c.thumbUrl ||
                      localPreview ||
                      imageRef,
                    uploadKey: uploaded.uploadKey || undefined,
                    uploadStatus: 'ready' as const,
                  }
                : c
            );
          });
        } catch {
          pinnedContextKeysRef.current.delete(key);
          setContextChips((prev) => prev.filter((c) => c.key !== key));
          message.error(t('agent.uploadFailed', { name: file.name }));
        }
      })
    );
  };

  const selectedModel =
    model === 'auto' ? AUTO_MODEL : models.find((m) => m.id === model);
  const selectedModelLabel = selectedModel?.label || (models[0]?.label ?? 'Agent');
  const isVideoInteraction = interactionMode === 'video';
  const isVideoModelSelected =
    isVideoInteraction ||
    composerMode === 'video' ||
    isVideoKind(selectedModel);
  const isImageInteraction = interactionMode === 'image';
  const isImageModelSelected =
    !isVideoInteraction &&
    (isImageInteraction || composerMode === 'image' || isImageKind(selectedModel));
  const rules = designCatalog?.global_rules;
  const attachmentLimit = agentAttachmentLimit({
    models,
    modelId: model,
    isImageMode: isImageModelSelected || isVideoModelSelected,
    rules,
    routedImageId: routeOverridesForApi(loadAgentRoutePrefs(rules))?.image,
    freeImageId: FREE_IMAGE_MODEL_ID,
    autoModel: AUTO_MODEL,
  });
  const attachmentCount = contextChips.filter((c) => c.kind === 'attachment').length;
  const attachmentsUploading = contextChips.some(
    (c) => c.kind === 'attachment' && c.uploadStatus === 'uploading'
  );
  const attachFull = attachmentCount >= attachmentLimit;

  const imageAspectProps = {
    showDesignSizePicker: !isImageModelSelected && !isVideoInteraction,
    imageAspectRatio,
    onImageAspectRatioChange: setImageAspectRatio,
    designSceneCategory: (designScene === 'drawing' ? 'image' : designScene) as
      | 'website'
      | 'mobile'
      | 'image'
      | 'poster'
      | null,
    onDesignSceneChange: (scene: DesignScene | null) => {
      setDesignScene(scene);
      designSceneRef.current = scene;
      if (scene !== 'image') {
        setComposerMode('agent');
        setInteractionMode('agent');
        setModel('auto');
        return;
      }
      setComposerMode('image');
      if (!canPickModel) {
        setModel(FREE_IMAGE_MODEL_ID);
        return;
      }
      const images = models.filter((m) => isImageKind(m));
      setModel(
        (
          images.find((m) => m.id === FREE_IMAGE_MODEL_ID) ||
          images.find((m) => /seedream/i.test(m.id)) ||
          images[0]
        )?.id || FREE_IMAGE_MODEL_ID
      );
    },
    aspectMenuPlacement: 'top-start' as const,
  };
  const attachProps = {
    onAttachFiles: attachFull ? undefined : handleAttachFiles,
    attachTooltip: attachFull
      ? t('agent.attachMaxReached', { count: attachmentLimit })
      : t('agent.uploadImage'),
    // Mobile floating dock: canvas pick is not usable — hide the control.
    onPickFromCanvas: floating
      ? undefined
      : () => {
          if (pickingFromCanvas) {
            dispatch(clearCanvasAttachPick());
            return;
          }
          // Image chat mode — stills only; video chat mode allows media.
          const imagesOnly = isImageModelSelected && !isVideoModelSelected;
          // If the canvas already has a selection, attach it immediately without entering pick mode.
          // Entering pick mode after attaching would cause the user to re-click the same node
          // and attach it a second time.
          const doc = document;
          const attachable = selectedNodeIds.filter((id) =>
            canAttachNodeToChat(doc?.deltaSetLike?.[id], { imagesOnly })
          );
          const frameId = selectedFrameIds.find(Boolean) || null;
          const insertChip = (ctx: ComposerContext) => {
            pinnedContextKeysRef.current.add(ctx.key);
            contextDismissedKeyRef.current = null;
            inputRef.current?.insertContextAtCaret(ctx);
            inputRef.current?.focusEnd();
          };
          const pushAttachment = (att: ComposerContext) => {
            pinnedContextKeysRef.current.add(att.key);
            setContextChips((prev) => {
              if (prev.some((c) => c.key === att.key)) return prev;
              return [...prev, att];
            });
            queueMicrotask(() => inputRef.current?.focusEnd());
          };
          if (attachable.length || frameId) {
            async function attachSelection() {
              if (attachable.length) {
                await applyCanvasAttachPayload({
                  document: doc,
                  payload: attachable.length === 1 ? attachable[0]! : attachable,
                  existingChips: contextChipsRef.current,
                  onAttachFiles: handleAttachFiles,
                  insertChip,
                  pushAttachment,
                  imagesOnly,
                });
              }
              if (frameId) {
                await applyCanvasAttachPayload({
                  document: doc,
                  payload: `frame:${frameId}`,
                  existingChips: contextChipsRef.current,
                  onAttachFiles: handleAttachFiles,
                  insertChip,
                  pushAttachment,
                  imagesOnly,
                });
              }
            }
            attachSelection();
          } else {
            dispatch(
              startCanvasAttachPick({
                target: 'agent',
                accept: imagesOnly ? 'image' : 'media',
              })
            );
          }
        },
    pickingFromCanvas: floating ? false : pickingFromCanvas,
    pickFromCanvasTooltip: pickingFromCanvas
      ? t('agent.pickFromCanvasCancel')
      : t('agent.pickFromCanvas'),
  };

  const buildUserMessage = (text: string) => {
    // Pass-through only: explicit composer chips + user text. No FE intent routing.
    const parts: string[] = [];
    if (contextChips.length) {
      let attachIdx = 0;
      parts.push(
        ...contextChips.map((c) => {
          if (c.kind === 'attachment') {
            attachIdx += 1;
            return `[Attached image ${attachIdx}]\nname: ${c.label}`;
          }
          return c.payload;
        })
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
    durationMs: assistantDurationMs(m, patch),
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
          /** Ask confirm: apply proposed ops (forces Design / agent path). */
          applyOps?: ChatUiMessage['proposedOps'];
          forceAgent?: boolean;
        }
  ) => {
    const options = typeof opts === 'string' ? { text: opts } : opts || {};
    const text = (options.text ?? input).trim();
    const hasChips = contextChipsRef.current.length > 0;
    if ((!text && !options.applyOps?.length && !hasChips) || sending) return;

    // Confirm a proposed_ops chip (intent-driven Ask on the shared Agent line).
    if (
      !options.applyOps?.length &&
      !options.forceAgent &&
      text
    ) {
      const confirm = findAskApplyConfirm(messages, text);
      if (confirm) {
        setMessages((prev) =>
          prev.map((m) => (m.id === confirm.messageId ? clearAskProposalFields(m) : m))
        );
        await send({
          text: confirm.label,
          raw: true,
          displayContent: confirm.label,
          applyOps: confirm.ops,
          forceAgent: true,
        });
        return;
      }
    }

    const sendText = resolveSendDisplayText({
      text,
      hasChips,
      hasApplyOps: Boolean(options.applyOps?.length),
    });
    const forceAgent = Boolean(options.forceAgent || options.applyOps?.length);

    if (
      contextChips.some(
        (c) => c.kind === 'attachment' && c.uploadStatus === 'uploading'
      )
    ) {
      message.warning(t('agent.attachWaitUpload'));
      return;
    }
    if (available === false) {
      message.warning(
        '未配置 API Key。请在 apps/api/.env 中设置 DEEPSEEK_API_KEY 或 LLM_API_KEY。'
      );
      setInput(sendText);
      queueMicrotask(() => inputRef.current?.focus());
      return;
    }

    const baseMessages = options.priorMessages ?? messages;
    const { inlineContexts, bubbleContexts } = splitBubbleContexts(contextChips);
    const userFacing = options.displayContent ?? sendText;
    const markedFromDom =
      !options.raw && inlineContexts.length
        ? String(inputRef.current?.getMarkedText?.() || '')
        : '';
    const contentMarked = resolveUserContentMarked({
      markedFromDom,
      displayContextsLen: inlineContexts.length,
      userFacing,
    });
    const userMsg: ChatUiMessage = {
      id: newMessageId(),
      role: 'user',
      content: userFacing,
      ...(bubbleContexts.length && !options.raw
        ? {
            contexts: bubbleContexts,
            ...(contentMarked ? { contentMarked } : {}),
          }
        : {}),
    };
    const assistantId = newMessageId();

    setInput('');
    setModelPanelOpen(false);
    setMentionPanelOpen(false);
    setMentionQuery('');
    setEditingUserId(null);
    setEditDraft('');
    setPendingReview(null);
    const {
      frameChip,
      chipFrameId: chipFrameIdFromContext,
      mentionNodeIds,
      attachedImages,
      mentionImageSrcs,
      skillRefs,
    } = collectSendChipContext(contextChips);
    // Build API prompt while chips still exist — clearing first drops [Target element]
    // so the backend never sees @ and may create a new artboard instead of edit/delete.
    const userMessageForApi = options.raw
      ? sendText
      : buildUserMessage(sendText);
    const docForFill = (store.getState() as any).editor?.document;
    const {
      imageGenCount,
      imageGenAspect,
      imageGenResolution,
      imageFillTargets,
    } = resolveImageGenPlan({
      isImageInteraction,
      imageGenCountSetting,
      isImageModelSelected,
      imageResolution,
      imageGenAspectRatio,
      mentionNodeIds,
      docForFill,
    });
    const runVideoGen = shouldRunVideoGenPath({
      isVideoModelSelected,
      forceAgent,
      hasApplyOps: Boolean(options.applyOps?.length),
    });
    const videoGenAspect =
      String(videoGenAspectRatio).trim() !== 'smart'
        ? String(videoGenAspectRatio).trim() || undefined
        : undefined;
    clearContextChips();
    setSending(true);
    // Clear prior Ask chips in the same write — a separate setMessages(clear)
    // would be overwritten by this replace with stale baseMessages.
    setMessages([
      ...baseMessages.map(clearAskProposalFields),
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        ...(runVideoGen
          ? buildVideoAssistantSeed({
              videoGenAspect,
              videoGenAspectRatio,
              canPickModel,
              model,
              selectedModel,
            })
          : buildStreamingAssistantSeed({
              imageGenCount,
              imageGenAspect,
              imageGenAspectRatio,
              canPickModel,
              model,
              selectedModel,
              models,
              t,
            })),
        streaming: true,
        startedAt: Date.now(),
      },
    ]);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Video model → gallery in chat; takes precedence over image gen.
    if (runVideoGen) {
      dispatch(setAgentBusy(true));
      const aspect = videoGenAspect;
      const resolution = videoResolution;
      const duration = videoGenDuration;
      const videoModel = !canPickModel ? DEFAULT_VIDEO_MODEL_ID : model || DEFAULT_VIDEO_MODEL_ID;
      const refImages = attachedImages.filter((u) => Boolean(u) && !u.startsWith('data:video/'));
      const patchAssistant = (
        pred: (m: ChatUiMessage) => boolean,
        patch: (m: ChatUiMessage) => ChatUiMessage
      ) => {
        setMessages((prev) => prev.map((m) => (pred(m) ? patch(m) : m)));
      };
      try {
        const body: Parameters<typeof generateVideo>[0] = {
          prompt: text,
          model: videoModel,
          aspect_ratio: aspect,
          resolution,
          duration,
        };
        if (refImages.length) body.images = refImages;
        const res = await generateVideo(body, { signal: ac.signal });
        const url = firstGeneratedVideoUrl(res);
        if (ac.signal.aborted) return;
        if (!url) {
          patchAssistant(
            (m) => m.id === assistantId,
            (m) =>
              finishAssistantPatch(m, {
                content: t('agent.requestFailed'),
                videoPendingCount: undefined,
                imageAspectRatio: aspect || videoGenAspectRatio,
                steps: [],
              })
          );
          return;
        }
        patchAssistant(
          (m) => m.id === assistantId,
          (m) =>
            finishAssistantPatch(m, {
              content: '',
              videos: [url],
              videoPendingCount: undefined,
              imageAspectRatio: aspect || videoGenAspectRatio,
              steps: [],
            })
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        const msg =
          err instanceof Error && err.message ? err.message : t('agent.requestFailed');
        patchAssistant(
          (m) => m.id === assistantId,
          (m) =>
            finishAssistantPatch(m, {
              content: humanizeDesignError(t, msg),
              videoPendingCount: undefined,
              steps: [],
            })
        );
      } finally {
        dispatch(setAgentBusy(false));
        setSending(false);
      }
      return;
    }

    // Image model → Seedream gallery; Ask / forceAgent stay on design agent.
    if (
      shouldRunImageGenPath({
        isImageModelSelected,
        forceAgent,
        hasApplyOps: Boolean(options.applyOps?.length),
      })
    ) {
      dispatch(setAgentBusy(true));
      const count = imageGenCount;
      const fillTargets = imageFillTargets;
      const aspect = imageGenAspect;
      const resolution = imageGenResolution;
      const patchAssistant = (
        pred: (m: ChatUiMessage) => boolean,
        patch: (m: ChatUiMessage) => ChatUiMessage
      ) => {
        setMessages((prev) => prev.map((m) => (pred(m) ? patch(m) : m)));
      };
      const finishImageGen = (kind: ImageGenFinishKind, urls: string[]) => {
        switch (kind) {
          case 'aborted':
            patchAssistant(
              (m) => m.id === assistantId && Boolean(m.streaming),
              (m) =>
                finishAssistantPatch(m, {
                  content: m.content?.trim() ? m.content : t('agent.stopped'),
                  images: urls.length ? urls : m.images?.filter(Boolean),
                  imagePendingCount: undefined,
                  imageAspectRatio: aspect,
                  steps: [],
                })
            );
            return;
          case 'failed':
            patchAssistant(
              (m) => m.id === assistantId,
              (m) =>
                finishAssistantPatch(m, {
                  content: t('agent.requestFailed'),
                  imagePendingCount: undefined,
                  imageAspectRatio: aspect,
                  steps: [],
                })
            );
            return;
          case 'success': {
            let filled = 0;
            if (fillTargets.length) {
              dispatch(pushEditorHistory());
              const n = Math.min(fillTargets.length, urls.length);
              for (let i = 0; i < n; i += 1) {
                if (fillNodeWithImage(fillTargets[i], urls[i], true)) filled += 1;
              }
            }
            patchAssistant(
              (m) => m.id === assistantId,
              (m) =>
                finishAssistantPatch(m, {
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
            );
          }
        }
      };
      try {
        // Parallel per-slot gens (Seedream `n` is unreliable). Each ready card unlocks
        // immediately — no more 「第 2 张一直扫光」while waiting on a serial queue.
        const slotUrls = Array.from({ length: count }, () => '');
        const publishSlots = () => {
          patchAssistant(
            (m) => m.id === assistantId,
            (m) => ({
              ...m,
              images: [...slotUrls],
              imagePendingCount: count,
              imageAspectRatio: aspect || imageGenAspectRatio,
            })
          );
        };
        await Promise.all(
          Array.from({ length: count }, async (_, i) => {
            if (ac.signal.aborted) return;
            try {
              const imageBody = buildImageGenRequestBody({
                prompt: text,
                canPickModel,
                model,
                aspect,
                resolution,
                isImageInteraction,
                attachedImages,
              });
              const res = await generateImage(imageBody, { signal: ac.signal });
              const url = firstGeneratedImageUrl(res);
              if (!url) return;
              slotUrls[i] = url;
              publishSlots();
            } catch {
              // Leave this slot as shimmer until the batch settles.
            }
          })
        );
        const urls = slotUrls.filter(Boolean);
        finishImageGen(
          resolveImageGenFinishKind({ aborted: ac.signal.aborted, urls }),
          urls
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        const msg =
          err instanceof Error && err.message ? err.message : t('agent.requestFailed');
        patchAssistant(
          (m) => m.id === assistantId,
          (m) =>
            finishAssistantPatch(m, {
              content: humanizeDesignError(t, msg),
              imagePendingCount: undefined,
              steps: [],
            })
        );
      } finally {
        dispatch(setAgentBusy(false));
        setSending(false);
      }
      return;
    }

    // P0 agent: lean canvas digest (sync) — no focus-frame screenshot (that stalled 40s).
    const docNow = (store.getState() as any).editor.document;
    const {
      chipFrameId,
      targetFrameId,
      sceneNodes,
      sceneFrames,
      spatialSummary,
      seedLiveNodeIds,
    } = buildDesignSceneSnapshot({
      docNow,
      chipFrameId: chipFrameIdFromContext,
      frameChip,
      mentionNodeIds,
      lastAgentFrameId: lastAgentFrameIdRef.current,
      taskStateFrameId: taskState?.canvas?.last_agent_frame_id || null,
      canvasUi,
    });
    const sendImages = uniqueVisionUrls(
      await Promise.all(
        [...attachedImages, ...mentionImageSrcs].map((src) => resolveVisionImageUrl(src))
      )
    );

    const designMutable: DesignSendMutable = {
      designStarted: false,
      canvasMutated: false,
      nodesPainted: false,
    };
    if (docNow) {
      try {
        checkpointsRef.current.set(userMsg.id, JSON.parse(JSON.stringify(docNow)));
      } catch {
        /* ignore snapshot failure */
      }
    }

    dispatch(setAgentBusy(true));
    const memoryMedium = buildTaskStateFromDocument({
      doc: docNow,
      sessionId,
      projectId: chatScopeId || '__none__',
      focusFrameId: chipFrameId || targetFrameId,
      lastAgentFrameId: lastAgentFrameIdRef.current,
      config: {
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
      const sendScene = null;
      const sendCanvasSize = canvasSizeFromChip(chipNorm);
      console.info('[AgentDock] design send (react p0)', {
        scene: sendScene,
        canvasSize: sendCanvasSize,
        chip: chipNorm,
        nodes: sceneNodes.length,
        frames: sceneFrames.length,
      });
      const onDesignEvent = createDesignAgentEventRouter({
        t,
        assistantId,
        userMsg,
        chipNorm,
        setMessages,
        setImageAspectRatio,
        setDesignScene,
        designSceneRef,
        lastAgentFrameIdRef,
        lastAgentSvgByFrameRef,
        checkpointsRef,
        store,
        finishAssistantPatch,
        mutable: designMutable,
      });

      // P0: lean scene + memory; skip canvas screenshot preview.
      await runDesignAgent({
        userMessage: userMessageForApi,
        runMode: 'agent',
        interactionMode: isImageInteraction
          ? 'agent'
          : interactionMode === 'ask'
            ? 'ask'
            : 'agent',
        applyOps: options.applyOps?.length ? options.applyOps : undefined,
        scene: sendScene,
        styleGroupId: styleGroupId ?? designCatalog?.style_groups?.[0]?.id ?? null,
        model: resolveAgentSendModel(canPickModel, model),
        routeOverrides: resolveAgentRouteOverrides(canPickModel, model),
        canvasSize: sendCanvasSize,
        canvasId: chatScopeId || undefined,
        sceneNodes: sceneNodes.length ? sceneNodes : undefined,
        sceneFrames: sceneFrames.length ? sceneFrames : undefined,
        spatialSummary: spatialSummary || undefined,
        focusFrameId: targetFrameId || undefined,
        seedLiveNodeIds: seedLiveNodeIds.length ? seedLiveNodeIds : undefined,
        skillRefs: skillRefs.length ? skillRefs : undefined,
        images: sendImages.length ? sendImages : undefined,
        sessionId,
        projectId: chatScopeId || '__none__',
        canvasUi,
        processLabels: {
          preparing: t('agent.canvasProcessPreparing'),
          thinking: t('agent.canvasProcessThinking'),
          exploring: t('agent.canvasProcessExploring'),
          editing: t('agent.canvasProcessEditing'),
        },
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
          setPendingLongSuggestions((prev) =>
            mergeLongSuggestions(prev, patch.long_suggestions)
          );
        },
        dispatch,
        getDocument: () => (store.getState() as any).editor.document,
        targetFrameId,
        // Explicit @ frame / @ node→frame only — not last-agent inference.
        pinnedFrameId: chipFrameId || null,
        signal: ac.signal,
        onEvent: onDesignEvent,
      });
    } finally {
      dispatch(setAgentBusy(false));
      if (designMutable.canvasMutated && checkpointsRef.current.has(userMsg.id)) {
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

  function handleAskChoice(pick: AskChoicePick) {
    if (sending) return;
    const next = resolveAskChoiceSend(messages, pick);
    switch (next.kind) {
      case 'dismiss':
        setMessages((prev) =>
          prev.map((m) => (m.id === next.messageId ? clearAskProposalFields(m) : m))
        );
        return;
      case 'apply':
        void send({
          text: next.text,
          raw: true,
          displayContent: next.text,
          applyOps: next.ops,
          forceAgent: true,
        });
        return;
      case 'reply':
        void send({ text: next.text, raw: true, displayContent: next.text });
        return;
      default:
        return;
    }
  }

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
    const el = listRef.current?.getScrollElement()?.querySelector(
      `[data-assistant-id="${CSS.escape(pendingReview.assistantId)}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };


  const beginEditUserMessage = (m: ChatUiMessage) => {
    if (m.role !== 'user' || sending || m.streaming) return;
    setEditingUserId(m.id);
    // Legacy bubbles stored `@label\ntext` — strip leading @ lines when chips exist.
    let draft = m.content || '';
    if (m.contexts?.length) {
      const lines = draft.split('\n');
      while (lines[0]?.trim().startsWith('@')) lines.shift();
      draft = lines.join('\n').replace(/^\n+/, '');
      // Prefer marked layout (chip slots) when present — plain content alone loses positions.
      if (m.contentMarked?.includes('\uFFFC')) {
        draft = m.contentMarked.replace(/\uFFFC/g, '');
      }
      const rebuilt: ComposerContext[] = [];
      for (const c of m.contexts) {
        const base = chipBaseKey(c.key);
        let ctx: ComposerContext | null = null;
        if (base.startsWith('frame:')) {
          ctx = buildComposerContext(document, [], base.slice('frame:'.length), rebuilt);
        } else if (base.startsWith('node:')) {
          ctx = buildComposerContext(document, [base.slice('node:'.length)], null, rebuilt);
        } else if (base.startsWith('group:')) {
          const ids = base
            .slice('group:'.length)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          ctx = buildComposerContext(document, ids, null, rebuilt);
        }
        rebuilt.push(
          ctx
            ? {
                ...ctx,
                // Keep prior chip preview when rebuild has no image src (shapes / groups).
                ...(c.thumbUrl && !ctx.thumbUrl ? { thumbUrl: c.thumbUrl } : {}),
              }
            : {
                key: c.key,
                label: c.label,
                kind: c.kind,
                payload: '',
                ...(c.thumbUrl ? { thumbUrl: c.thumbUrl } : {}),
              }
        );
      }
      setContextChips(rebuilt);
    } else {
      clearContextChips();
    }
    setEditDraft(draft);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const cancelEditUserMessage = () => {
    setEditingUserId(null);
    setEditDraft('');
    clearContextChips();
  };

  const submitEditUserMessage = () => {
    const id = editingUserId;
    if (!id || sending) return;
    if (
      contextChips.some(
        (c) => c.kind === 'attachment' && c.uploadStatus === 'uploading'
      )
    ) {
      message.warning(t('agent.attachWaitUpload'));
      return;
    }
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
    setMentionPanelOpen(false);
    setMentionQuery('');
    setSkillPanelOpen(false);
    setSkillQuery('');
  };

  const slashTriggerIndex = (value: string): number => {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      if (value[i] !== '/') continue;
      if (/\s/.test(value.slice(i + 1))) return -1;
      if (i > 0 && !/\s/.test(value[i - 1]!)) continue;
      return i;
    }
    return -1;
  };

  /** `@` attachments or `/` skills — prefer the later trigger. */
  const maybeOpenComposerMentions = (value: string) => {
    if (onlyImageInteraction) {
      setMentionPanelOpen(false);
      setMentionQuery('');
      setSkillPanelOpen(false);
      setSkillQuery('');
      return;
    }
    const at = parseAtMentionQuery(value);
    const slash = parseSlashSkillQuery(value);
    const atIdx = at.open ? value.lastIndexOf('@') : -1;
    const slashIdx = slash.open ? slashTriggerIndex(value) : -1;
    const preferSkill = slash.open && (!at.open || slashIdx > atIdx);
    if (preferSkill) {
      setModelPanelOpen(false);
      setMentionPanelOpen(false);
      setMentionQuery('');
      setSkillQuery(slash.query);
      setSkillPanelOpen(true);
      return;
    }
    if (at.open) {
      setModelPanelOpen(false);
      setSkillPanelOpen(false);
      setSkillQuery('');
      setMentionQuery(at.query);
      setMentionPanelOpen(true);
      return;
    }
    setMentionPanelOpen(false);
    setMentionQuery('');
    setSkillPanelOpen(false);
    setSkillQuery('');
  };

  const mentionItems = useMemo((): MentionAttachItem[] => {
    const attachments = contextChips.filter((c) => c.kind === 'attachment');
    return attachments.map((c, i) => ({
      id: c.key,
      label: t('agent.mentionAttachImageN', { n: i + 1 }),
      ...(c.thumbUrl || c.dataUrl
        ? { thumbUrl: String(c.thumbUrl || c.dataUrl) }
        : {}),
    }));
  }, [contextChips, t]);

  const skillMentionItems = useMemo((): MentionAttachItem[] => {
    const mineLabel = t('agent.skillsMine');
    const officialLabel = t('agent.skillsOfficial');
    return skillCatalog.map((s) => ({
      id: String(s.skillKey || s.id),
      label: s.name,
      hint: s.whenToUse || s.description || undefined,
      group: s.mine ? mineLabel : officialLabel,
      ...(s.logo ? { thumbUrl: s.logo } : {}),
    }));
  }, [skillCatalog, t]);

  useEffect(() => {
    if (!skillPanelOpen) return;
    let cancelled = false;
    void fetchDesignSkills()
      .then((res) => {
        if (!cancelled) setSkillCatalog(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setSkillCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [skillPanelOpen]);

  const pickMentionAttach = (pickId: string) => {
    const attachments = contextChipsRef.current.filter((c) => c.kind === 'attachment');
    const idx = attachments.findIndex((c) => c.key === pickId);
    if (idx < 0) return;
    const att = attachments[idx]!;
    const n = idx + 1;
    const ctx: ComposerContext = {
      key: `attach-ref:${chipBaseKey(att.key)}`,
      label: t('agent.mentionAttachImageN', { n }),
      kind: 'image',
      payload: `[Ref: Attached image ${n}]`,
      ...(att.dataUrl ? { dataUrl: att.dataUrl } : {}),
      ...(att.thumbUrl || att.dataUrl
        ? { thumbUrl: String(att.thumbUrl || att.dataUrl) }
        : {}),
    };
    pinnedContextKeysRef.current.add(ctx.key);
    contextDismissedKeyRef.current = null;
    if (editingUserId) setEditDraft(stripTrailingAtQuery);
    else setInput(stripTrailingAtQuery);
    setMentionPanelOpen(false);
    setMentionQuery('');
    queueMicrotask(() => {
      inputRef.current?.insertContextAtCaret(ctx);
      inputRef.current?.focus();
    });
  };

  const pickSkillMention = (pickId: string) => {
    const skill = skillCatalog.find(
      (s) => String(s.skillKey || s.id) === pickId || String(s.id) === pickId
    );
    if (!skill) return;
    const key = String(skill.skillKey || skill.id);
    const ctx: ComposerContext = {
      key: `skill:${key}`,
      label: skill.name,
      kind: 'skill',
      payload: key,
      ...(skill.logo ? { thumbUrl: skill.logo } : {}),
    };
    pinnedContextKeysRef.current.add(ctx.key);
    contextDismissedKeyRef.current = null;
    if (editingUserId) setEditDraft(stripTrailingSlashQuery);
    else setInput(stripTrailingSlashQuery);
    setSkillPanelOpen(false);
    setSkillQuery('');
    queueMicrotask(() => {
      inputRef.current?.insertContextAtCaret(ctx);
      inputRef.current?.focus();
    });
  };

  const onInputChange = (value: string) => {
    setInput(value);
    maybeOpenComposerMentions(value);
  };

  const onEditDraftChange = (value: string) => {
    setEditDraft(value);
    maybeOpenComposerMentions(value);
  };

  const applyInteractionMode = (mode: ComposerInteractionMode) => {
    setInteractionMode(mode);
    setImageModelPanelOpen(false);
    setVideoModelPanelOpen(false);
    setModelPanelOpen(false);
    if (mode === 'video') {
      setComposerMode('video');
      if (!canPickModel) {
        setModel(DEFAULT_VIDEO_MODEL_ID);
        return;
      }
      const videos = models.filter((m) => isVideoKind(m));
      const preferred =
        videos.find((m) => m.id === model) ||
        videos.find((m) => m.id === DEFAULT_VIDEO_MODEL_ID) ||
        videos[0];
      setModel(preferred?.id || DEFAULT_VIDEO_MODEL_ID);
      return;
    }
    if (mode === 'image') {
      setComposerMode('image');
      if (!canPickModel) {
        setModel(FREE_IMAGE_MODEL_ID);
        return;
      }
      const images = models.filter((m) => isImageKind(m));
      const preferred =
        images.find((m) => m.id === model) ||
        images.find((m) => m.id === FREE_IMAGE_MODEL_ID) ||
        images[0];
      setModel(preferred?.id || FREE_IMAGE_MODEL_ID);
      return;
    }
    setComposerMode('agent');
    setModel('auto');
  };

  useEffect(() => {
    if (enabledInteractionModes.includes(interactionMode)) return;
    applyInteractionMode(enabledInteractionModes[enabledInteractionModes.length - 1] || 'image');
  }, [enabledInteractionModes, interactionMode]);

  useEffect(() => {
    if (!onlyImageInteraction) return;
    setModelPanelOpen(false);
    setMentionPanelOpen(false);
    setSkillPanelOpen(false);
    setImageModelPanelOpen(false);
    setVideoModelPanelOpen(false);
  }, [onlyImageInteraction]);

  const mentionFloating = useFloating({
    open: mentionPanelOpen,
    onOpenChange: (open) => {
      setMentionPanelOpen(open);
      if (!open) setMentionQuery('');
    },
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12, fallbackPlacements: ['top-start', 'bottom-end', 'top-end'] }),
      shift({ padding: 12 }),
    ],
  });
  const mentionDismiss = useDismiss(mentionFloating.context);
  const mentionIx = useInteractions([mentionDismiss]);

  const skillFloating = useFloating({
    open: skillPanelOpen,
    onOpenChange: (open) => {
      setSkillPanelOpen(open);
      if (!open) setSkillQuery('');
    },
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12, fallbackPlacements: ['top-start', 'bottom-end', 'top-end'] }),
      shift({ padding: 12 }),
    ],
  });
  const skillDismiss = useDismiss(skillFloating.context);
  const skillIx = useInteractions([skillDismiss]);

  /** Anchor attach picker to the `@` glyph / caret — not the whole composer chrome. */
  useLayoutEffect(() => {
    if (!mentionPanelOpen) return;
    const editor =
      (window.document.querySelector('[data-agent-composer]') as HTMLElement | null) ||
      undefined;
    mentionFloating.refs.setPositionReference({
      contextElement: editor,
      getBoundingClientRect: () =>
        inputRef.current?.getAtMentionAnchorRect?.() ??
        editor?.getBoundingClientRect() ??
        new DOMRect(),
    });
    void mentionFloating.update();
  }, [
    mentionPanelOpen,
    mentionQuery,
    input,
    editDraft,
    mentionFloating.refs,
    mentionFloating.update,
  ]);

  useLayoutEffect(() => {
    if (!skillPanelOpen) return;
    const editor =
      (window.document.querySelector('[data-agent-composer]') as HTMLElement | null) ||
      undefined;
    skillFloating.refs.setPositionReference({
      contextElement: editor,
      getBoundingClientRect: () =>
        inputRef.current?.getSlashMentionAnchorRect?.() ??
        editor?.getBoundingClientRect() ??
        new DOMRect(),
    });
    void skillFloating.update();
  }, [
    skillPanelOpen,
    skillQuery,
    input,
    editDraft,
    skillFloating.refs,
    skillFloating.update,
  ]);

  if (!open) return null;

  const composerPlaceholder = resolveComposerPlaceholder(t, {
    isImageModel: isImageModelSelected,
    isImageMode: isImageInteraction,
    isVideoMode: isVideoInteraction,
    hasContextChips: contextChips.length > 0,
  });

  const imageModeControls = buildImageModeControls({
    active: isImageInteraction,
    models,
    modelId: model,
    modelsStatus,
    resolution: imageResolution,
    aspectRatio: imageGenAspectRatio,
    imageCount: imageGenCountSetting,
    modelOpen: imageModelPanelOpen,
    onResolutionChange: (r) => setImageResolution(r as typeof imageResolution),
    onAspectRatioChange: (r) => setImageGenAspectRatio(r as typeof imageGenAspectRatio),
    onImageCountChange: (n) => setImageGenCountSetting(clampComposerImageCount(n)),
    onModelOpenChange: setImageModelPanelOpen,
    onPickModel: (id) => {
      setModel(id);
      setComposerMode('image');
      setImageModelPanelOpen(false);
    },
  });

  const videoModeControls = buildVideoModeControls({
    active: isVideoInteraction,
    models,
    modelId: model,
    modelsStatus,
    resolution: videoResolution,
    aspectRatio: videoGenAspectRatio,
    duration: videoGenDuration,
    modelOpen: videoModelPanelOpen,
    onResolutionChange: setVideoResolution,
    onAspectRatioChange: setVideoGenAspectRatio,
    onDurationChange: (d) =>
      setVideoGenDuration(Math.max(1, Math.round(d) || DEFAULT_VIDEO_DURATION)),
    onModelOpenChange: setVideoModelPanelOpen,
    onPickModel: (id) => {
      setModel(id);
      setComposerMode('video');
      setVideoModelPanelOpen(false);
    },
  });

  const modelButtonProps = {
    title: modelButtonTitle(model, models, selectedModelLabel, t),
    label: modelButtonLabel(model, selectedModel, selectedModelLabel, t),
    open: modelPanelOpen,
    onOpenChange: (next: boolean) => {
      if (next) {
        setMentionPanelOpen(false);
        setMentionQuery('');
        setModel('auto');
      }
      setModelPanelOpen(next);
    },
    panel: (
      <AgentRoutePrefsEditor
        compact
        modeLabel={interactionModeLabel(interactionMode, t)}
      />
    ),
    icon: <Icon name="editor-model-cube" width={16} height={16} />,
  };

  const escapeComposer = (opts?: { cancelEdit?: boolean }) => {
    if (mentionPanelOpen || skillPanelOpen || modelPanelOpen) {
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
        canSend={!sending && !!editDraft.trim() && available !== false && !attachmentsUploading}
        {...attachProps}
        modelButtonProps={modelButtonProps}
        {...imageAspectProps}
      />
  ) : null;

  return (
    <aside
      data-tour={dataTour}
      style={floating ? undefined : { width: dockWidth }}
      className={cn(
        floating
          ? 'fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col overflow-hidden bg-[var(--surface)]'
          : 'relative flex shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--surface)]',
        className
      )}
    >
      {!floating ? (
        <AgentDockResizeHandle
          width={dockWidth}
          minWidth={AGENT_DOCK_MIN_W}
          maxWidth={AGENT_DOCK_MAX_W}
          onPointerDown={onDockResizePointerDown}
          onPointerMove={onDockResizePointerMove}
          onPointerUp={endDockResize}
          onPointerCancel={endDockResize}
          onResetWidth={() => persistDockWidth(AGENT_DOCK_DEFAULT_W)}
        />
      ) : null}
      <AgentDockHeader
        title={chatTitle}
        historyOpen={historyOpen}
        showNewChatTip={!onlyImageInteraction && newChatTip}
        showClose={!floating}
        onNewChat={startNewChat}
        onToggleHistory={() => {
          closePopovers();
          setHistoryOpen((v) => {
            const next = !v;
            if (next) void refreshSessions();
            return next;
          });
        }}
        onClose={() => {
          abortRef.current?.abort();
          dispatch(setAgentBusy(false));
          setSending(false);
          closePopovers();
          setHistoryOpen(false);
          onClose();
        }}
      />

      <AgentMessageList
        ref={listRef}
        historyOpen={historyOpen}
        sessions={sessions}
        sessionId={sessionId}
        turns={chatTurns}
        editingUserId={editingUserId}
        editComposer={editComposerNode}
        sending={sending}
        formatWorked={formatWorked}
        hasCheckpoint={(id) => checkpointsRef.current.has(id)}
        onBeginEdit={beginEditUserMessage}
        onCancelEdit={cancelEditUserMessage}
        onRestore={restoreCheckpoint}
        onChoice={handleAskChoice}
        onOpenSession={openSession}
        onDeleteSession={deleteSession}
        formatChatTime={formatChatTime}
      />

      {historyOpen || editingUserId ? null : (
        <AgentDockComposerFooter
          pendingReview={Boolean(pendingReview && !sending)}
          onUndoReview={undoPendingReview}
          onKeepReview={keepPendingReview}
          onReview={reviewPendingChanges}
          pendingLongSuggestions={!sending ? pendingLongSuggestions : []}
          onIgnoreLongSuggestion={(i) =>
            setPendingLongSuggestions((prev) => prev.filter((_, j) => j !== i))
          }
          onSavedLongSuggestion={(i) =>
            setPendingLongSuggestions((prev) => prev.filter((_, j) => j !== i))
          }
          composer={
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
                !sending &&
                (!!input.trim() || contextChips.length > 0) &&
                available !== false &&
                !attachmentsUploading
              }
              {...attachProps}
              interactionMode={interactionMode}
              onInteractionModeChange={applyInteractionMode}
              allowedInteractionModes={enabledInteractionModes}
              imageModeControls={imageModeControls}
              videoModeControls={videoModeControls}
              modelButtonProps={modelButtonProps}
              {...imageAspectProps}
            />
          }
        />
      )}

      {!historyOpen && mentionPanelOpen ? (
        <FloatingPortal>
          <div
            ref={mentionFloating.refs.setFloating}
            style={mentionFloating.floatingStyles as CSSProperties}
            className="z-[80]"
            {...mentionIx.getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MentionAttachPanel
              items={mentionItems}
              query={mentionQuery}
              onPick={pickMentionAttach}
            />
          </div>
        </FloatingPortal>
      ) : null}

      {!historyOpen && skillPanelOpen ? (
        <FloatingPortal>
          <div
            ref={skillFloating.refs.setFloating}
            style={skillFloating.floatingStyles as CSSProperties}
            className="z-[80]"
            {...skillIx.getFloatingProps()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MentionAttachPanel
              variant="skill"
              items={skillMentionItems}
              query={skillQuery}
              onPick={pickSkillMention}
            />
          </div>
        </FloatingPortal>
      ) : null}
    </aside>
  );
}

export default memo(AgentDock);
