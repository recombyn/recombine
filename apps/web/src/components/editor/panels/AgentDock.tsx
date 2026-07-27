import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi2';
import { Icon } from '@/components/base/icon';
import {
  listModels,
  generateImage,
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
  buildSpatialSummary,
  captureFocusFramePreview,
  type AgentStepEvent,
} from '@/components/editor/panels/agent/runDesignAgent';
import { canAttachNodeToChat } from '@/components/rcb/scene/sceneDocument';
import { renderComposerChipThumb, renderExport } from '@/components/rcb/scene/exportImage';
import {
  applyClientFrameHints,
  applyMemoryPatch,
  buildShortTermFromMessages,
  buildTaskStateFromDocument,
  emptyTaskState,
  type MemoryPatch,
  type TaskState,
} from '@/components/editor/panels/agent/agentMemory';
import AgentMessageList from '@/components/editor/panels/agent/AgentMessageList';
import { type ChatUiMessage } from '@/components/editor/panels/agent/ChatTurnList';
import type { VirtualListHandle } from '@/components/base/VirtualList';
import AgentComposerShell, {
  type ComposerInteractionMode,
  type ComposerRunMode,
  type ImageModeComposerControls,
} from '@/components/editor/panels/agent/AgentComposerShell';
import { normalizeCanvasSizeChip } from '@/components/editor/chrome/SizePresetPanel';
import {
  customProvidersAsModels,
  isCustomModelId,
} from '@/components/editor/panels/agent/customLlmProviders';
import { routeOverridesForApi, warmAgentRoutePresetRules, loadAgentRoutePrefs, AgentRoutePrefsEditor } from '@/components/editor/panels/agent/AgentModelsPanel';
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
  modelDescription,
} from '@/components/editor/panels/agent/ModelPickerPanel';
import { cn } from '@/utils/classnames';
import { estimateImageCredits } from '@/utils/imageCredits';
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

type ActivityStepEvent = {
  kind: 'thought' | 'added' | 'updated' | 'explored' | 'skipped' | 'deleted' | 'tool';
  status: 'running' | 'done';
  durationSec?: number;
  count?: number;
  skillName?: string;
  detail?: string;
  stage?: string;
};

function exploreItemKindKey(id: string): string {
  if (id === 'lookup-skill' || id.startsWith('lookup-skill')) {
    return 'agent.lookupKindSkill';
  }
  if (id === 'lookup-rule' || id.startsWith('lookup-rule')) {
    return 'agent.lookupKindRule';
  }
  if (id === 'lookup-knowledge' || id.startsWith('lookup-knowledge')) {
    return 'agent.lookupKindKnowledge';
  }
  if (id === 'lookup-aesthetics' || id.startsWith('lookup-aesthetics')) {
    return 'agent.lookupKindAesthetics';
  }
  if (id === 'lookup-gate') return 'agent.lookupGate';
  if (id === 'stage-lookup' || id.startsWith('stage-lookup')) {
    return 'agent.stageLookup';
  }
  if (id === 'stage-scene' || id.startsWith('stage-scene')) {
    return 'agent.stageScene';
  }
  if (id === 'canvas-size') return 'agent.canvasSizeLabel';
  return '';
}

function mergeExploreStepStatus(
  a: 'running' | 'done' | 'error' | 'pending' | undefined,
  b: 'running' | 'done' | 'error' | 'pending' | undefined
): 'running' | 'done' | 'error' {
  if (a === 'running' || b === 'running') return 'running';
  if (a === 'error' || b === 'error') return 'error';
  return 'done';
}

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

/** Model id sent to /design/run (plan + custom catalog → auto). */
function resolveAgentSendModel(canPickModel: boolean, model: string): string {
  if (!canPickModel) return 'auto';
  if (isCustomModelId(model)) return 'auto';
  return model || 'auto';
}

/** Auto / custom model uses route prefs; locked model pins all tiers+vision. */
function resolveAgentRouteOverrides(
  canPickModel: boolean,
  model: string
): Record<string, string> | null {
  if (!canPickModel) return null;
  if (!model || model === 'auto' || isCustomModelId(model)) {
    return routeOverridesForApi();
  }
  // 锁模：本用户本轮 simple/medium/complex/vision 都用同一模型
  return {
    simple: model,
    medium: model,
    complex: model,
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
  opts: { isImageModel: boolean; isImageMode?: boolean; hasContextChips: boolean }
): string {
  if (opts.isImageMode) return t('editor.tools.imageGenPlaceholder');
  if (opts.isImageModel) return t('agent.placeholderImage');
  if (opts.hasContextChips) return t('agent.placeholderSkill');
  return t('agent.placeholderDefault');
}

function localizeExploreItem(
  t: (key: string, opts?: Record<string, unknown>) => string,
  item: { id: string; name: string; summary?: string }
): { id: string; name: string; summary?: string } {
  const id = String(item.id || '');
  const kindKey = exploreItemKindKey(id);
  if (!kindKey) return item;
  if (kindKey === 'agent.canvasSizeLabel') {
    // Keep WxH from backend as the visible name; i18n is the stage line only.
    return {
      ...item,
      name: String(item.name || '').trim() || t(kindKey),
      summary: item.summary,
    };
  }
  const host = /^Host\s*·/i.test(String(item.name || '').trim());
  const label = t(kindKey);
  return {
    ...item,
    name: host ? t('agent.lookupHostPrefix', { name: label }) : label,
  };
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

function formatActivityLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  ev: ActivityStepEvent
): string | null {
  // Classic Cursor-style verbs — op details go under the label (step.summary).
  if (ev.kind === 'thought') {
    if (ev.status === 'running') {
      const detail = (ev.detail || '').trim();
      // Backend heartbeat / phase copy while waiting on the model.
      if (detail) return detail;
      return t('agent.activityThoughtRunning');
    }
    if (ev.status === 'done' && ev.durationSec != null) {
      return t('agent.activityThought', { seconds: ev.durationSec });
    }
    if (ev.status === 'done') return t('agent.activityThoughtBrief');
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
    if (ev.stage === 'scene' || (ev.detail || '').startsWith('canvas_size:')) {
      const raw = (ev.detail || '').replace(/^canvas_size:/i, '').trim();
      const size =
        raw && /^\d+x\d+$/i.test(raw)
          ? raw.replace(/x/i, '×')
          : (ev.detail || '').trim();
      if (ev.status === 'running') {
        return size
          ? t('agent.activityCanvasSizeRunning', { size })
          : t('agent.stageScene');
      }
      return size
        ? t('agent.activityCanvasSizeDone', { size })
        : t('agent.stageScene');
    }
    if (ev.stage === 'lookup' || (ev.detail || '').includes('lookup')) {
      if (ev.status === 'running') return t('agent.activityLookupRunning');
      const n = ev.count != null && ev.count > 0 ? ev.count : 0;
      return n > 0
        ? t('agent.activityLookupDoneCount', { count: n })
        : t('agent.activityLookupDone');
    }
    if (ev.status === 'running') return t('agent.activityExploredRunning');
    const fromCount = ev.count != null && ev.count > 0 ? ev.count : 0;
    const fromDetail = (ev.detail || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length;
    const n = fromCount || fromDetail;
    return n > 0
      ? t('agent.activityExploredCount', { count: n })
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

/** One Explored fold per turn — merge duplicate explore-pipeline / explored rows. */
function collapseExplorePipelineSteps(
  steps: NonNullable<ChatUiMessage['steps']>
): NonNullable<ChatUiMessage['steps']> {
  let explore: NonNullable<ChatUiMessage['steps']>[number] | null = null;
  const rest: NonNullable<ChatUiMessage['steps']> = [];
  for (const s of steps) {
    const isExplore =
      s.id === 'explore-pipeline' ||
      (s.kind === 'explored' && s.id !== 'chat-process');
    if (!isExplore) {
      rest.push(s);
      continue;
    }
    if (!explore) {
      explore = { ...s, id: 'explore-pipeline', kind: 'explored' };
      continue;
    }
    const items = [...(explore.items || [])];
    for (const it of s.items || []) {
      const ii = items.findIndex((x) => x.id === it.id);
      if (ii >= 0) items[ii] = { ...items[ii], ...it };
      else items.push(it);
    }
    explore = {
      ...explore,
      name: s.name || explore.name,
      summary: s.summary || explore.summary,
      body: s.body || explore.body,
      items,
      status: mergeExploreStepStatus(s.status, explore.status),
    };
  }
  if (!explore) return rest;
  const provisional = rest.findIndex(
    (s) => s.id === 'thought-0' || s.id === 'skill-0'
  );
  if (provisional >= 0) {
    const next = [...rest];
    next.splice(provisional, 1, explore);
    return next;
  }
  return [explore, ...rest];
}

type AssistantStep = NonNullable<ChatUiMessage['steps']>[number];
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type FinishAssistant = (
  m: ChatUiMessage,
  patch?: Partial<ChatUiMessage>
) => ChatUiMessage;

function workedSecsOf(m: ChatUiMessage): number | undefined {
  if (m.startedAt) return Math.max(1, Math.round((Date.now() - m.startedAt) / 1000));
  if (m.durationMs != null) return Math.max(1, Math.round(m.durationMs / 1000));
  return undefined;
}

/** Foldable chat process under "Worked for Xs". */
function buildChatProcessSteps(t: TFn, m: ChatUiMessage): AssistantStep[] {
  if (m.steps?.length) {
    return m.steps.map((s) =>
      s.status === 'running' ? { ...s, status: 'done' as const } : s
    );
  }
  const secs = workedSecsOf(m);
  return [
    {
      id: 'chat-process',
      kind: 'explored',
      name: t('agent.chatProcessTitle'),
      status: 'done',
      ...(secs != null ? { durationSec: secs } : {}),
      items: [
        { id: 'chat-wait', name: t('agent.chatProcessWait') },
        { id: 'chat-reply', name: t('agent.chatProcessReply') },
      ],
    },
  ];
}

function applyThinkingBodyToSteps(
  stepsIn: AssistantStep[],
  piece: string,
  replace: boolean,
  t: TFn
): AssistantStep[] {
  const steps = [...stepsIn];
  let idx = steps.findIndex((s) => s.id === 'explore-pipeline');
  if (idx < 0) {
    idx = steps.findIndex(
      (s) => s.kind === 'explored' && s.id !== 'chat-process'
    );
  }
  if (idx < 0) {
    steps.push({
      id: 'explore-pipeline',
      kind: 'explored',
      name: t('agent.activityExplored'),
      status: replace ? 'done' : 'running',
      items: [{ id: 'thought-brief', name: t('agent.activityThoughtBrief') }],
      body: replace ? piece : piece.slice(-4000),
    });
    return collapseExplorePipelineSteps(steps);
  }
  const prevStep = steps[idx];
  const items = [...(prevStep.items || [])];
  if (replace) {
    const ti = items.findIndex((x) => x.id === 'thought-brief');
    const thoughtLine = {
      id: 'thought-brief',
      name: t('agent.activityThoughtBrief'),
    };
    if (ti >= 0) items[ti] = thoughtLine;
    else items.push(thoughtLine);
  }
  steps[idx] = {
    ...prevStep,
    id: 'explore-pipeline',
    kind: 'explored',
    items,
    body: replace ? piece : `${prevStep.body || ''}${piece}`.slice(-6000),
    status: prevStep.status,
  };
  return collapseExplorePipelineSteps(steps);
}

function applyAnalysisDeltaToSteps(
  stepsIn: AssistantStep[],
  piece: string
): AssistantStep[] | null {
  const steps = [...stepsIn];
  let idx = steps.findIndex(
    (s) =>
      s.status === 'running' &&
      /thinking|thought|思考/i.test(String(s.name || ''))
  );
  if (idx < 0) idx = steps.findIndex((s) => s.status === 'running');
  if (idx < 0 && steps.length) idx = steps.length - 1;
  if (idx < 0) return null;
  const merged = `${steps[idx].summary || ''}${piece}`;
  steps[idx] = {
    ...steps[idx],
    summary: merged.length > 1500 ? merged.slice(-1500) : merged,
  };
  return steps;
}

function applyActivityEventToSteps(
  stepsIn: AssistantStep[],
  opts: {
    kind: NonNullable<AssistantStep['kind']>;
    eventId?: string;
    status: 'running' | 'done';
    label: string;
    summary?: string;
    nestItem?: { id: string; name: string; summary?: string } | null;
    bodyMd: string;
  }
): AssistantStep[] | null {
  const { kind, status, label, summary, nestItem, bodyMd } = opts;
  const steps = [...stepsIn];
  let idx =
    kind === 'explored'
      ? steps.findIndex((s) => s.id === 'explore-pipeline')
      : steps.findIndex((s) => s.id === String(opts.eventId || 'skill-0'));
  if (idx < 0 && kind === 'explored') {
    idx = steps.findIndex(
      (s) => s.kind === 'explored' && s.id !== 'chat-process'
    );
  }
  if (idx < 0 && kind === 'explored') {
    idx = steps.findIndex((s) => s.id === 'skill-0' || s.id === 'thought-0');
  }
  if (idx < 0 && kind === 'thought' && status === 'running') {
    idx = steps.findIndex(
      (s) =>
        s.status === 'running' &&
        (s.id === 'skill-0' || s.id === 'thought-0' || !s.id)
    );
  }

  if (kind === 'explored') {
    const prevStep = idx >= 0 ? steps[idx] : null;
    if (prevStep?.status === 'done' && status === 'running' && !nestItem && !bodyMd) {
      return null;
    }
    let items = [...(prevStep?.items || [])];
    if (nestItem) {
      const ii = items.findIndex((x) => x.id === nestItem.id);
      if (ii >= 0) items[ii] = { ...items[ii], ...nestItem };
      else items.push(nestItem);
    }
    const nextStep: AssistantStep = {
      id: 'explore-pipeline',
      kind: 'explored',
      name: label,
      status,
      summary: summary || prevStep?.summary,
      items,
      body: bodyMd.trim() ? bodyMd : prevStep?.body,
    };
    if (idx >= 0) steps[idx] = nextStep;
    else steps.push(nextStep);
    return collapseExplorePipelineSteps(steps);
  }

  const stepId = String(opts.eventId || 'skill-0');
  const safeId = stepId === 'explore-pipeline' ? `step-${stepId}` : stepId;
  const next: AssistantStep = {
    id: safeId,
    kind,
    name: label,
    summary,
    status,
    body: bodyMd.trim() || undefined,
  };
  if (idx >= 0 && steps[idx]?.id !== 'explore-pipeline') {
    if (kind === 'thought' && status === 'running' && steps[idx].status === 'done') {
      return null;
    }
    const prevStep = steps[idx];
    steps[idx] = {
      ...next,
      id: prevStep.id || next.id,
      summary: next.summary || prevStep.summary,
      items: prevStep.items,
      body: next.body || prevStep.body,
    };
  } else {
    steps.push(next);
  }
  return collapseExplorePipelineSteps(steps);
}

function patchChatDoneAssistant(
  m: ChatUiMessage,
  opts: {
    t: TFn;
    finish: FinishAssistant;
    choices?: string[];
    proposedOps?: ChatUiMessage['proposedOps'];
    applyChoice?: string;
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
  }
): ChatUiMessage {
  let result = '';
  if (opts.painted) {
    const rawProcess = (m.thinking || m.intent || '').trim();
    const hasIntentAnalysis =
      Boolean(rawProcess) && !/<svg\b|<\/svg>/i.test(rawProcess);
    const fromSummary = opts.summary?.trim();
    if (fromSummary) result = fromSummary;
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
        (m.images && m.images.length)
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

/** Unique chip label: 矩形 1 / 矩形 2 / 多边形 1 … (stable by position). */
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
  return `${base} ${idx}`;
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

export function buildComposerContext(
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
        ? {
            thumbUrl: String(node.attrs.src).trim(),
            // Same src for vision bag — send() resolves /api → data URL when needed.
            dataUrl: String(node.attrs.src).trim(),
          }
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
    const nodeLabel = numberedNodeLabel(document, id);
    const fill = String(node.attrs?.['fill-color'] ?? node.attrs?.fill ?? '');
    let line = `- id=${id} name="${nodeLabel}" kind=${kind} box=${Math.round(nw)}×${Math.round(nh)} at (${Math.round(left)},${Math.round(top)})`;
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

/** Attach a live shape/group/frame raster when the chip has no image `src` yet. */
export async function enrichComposerContextThumb(
  document: any,
  ctx: ComposerContext | null,
  opts: { nodeIds?: string[]; frameId?: string | null } = {}
): Promise<ComposerContext | null> {
  if (!ctx) return null;
  if (String(ctx.thumbUrl || '').trim()) return ctx;
  try {
    const thumb = await renderComposerChipThumb({
      document,
      nodeIds: opts.nodeIds,
      frameId: opts.frameId,
    });
    if (thumb) return { ...ctx, thumbUrl: thumb };
  } catch {
    /* best-effort preview */
  }
  return ctx;
}

/** Same path as selection export — flatten nodes to one PNG data-URL. */
export async function rasterizeNodesToPngDataUrl(
  document: any,
  nodeIds: string[]
): Promise<string | null> {
  const ids = nodeIds.filter(Boolean);
  if (!document || !ids.length) return null;
  try {
    const rendered = await renderExport({
      document,
      format: 'png',
      multiplier: 2,
      selectionOnly: true,
      nodeIds: ids,
    });
    if (rendered?.kind !== 'raster' || !rendered.dataUrl) return null;
    return rendered.dataUrl;
  } catch {
    return null;
  }
}

/** Same path as selection export — flatten nodes to one PNG File for Chat. */
export async function rasterizeNodesToPngFile(
  document: any,
  nodeIds: string[],
  filename = 'canvas-group.png'
): Promise<File | null> {
  const dataUrl = await rasterizeNodesToPngDataUrl(document, nodeIds);
  if (!dataUrl) return null;
  try {
    return await imageSrcToFile(dataUrl, filename);
  } catch {
    return null;
  }
}

/**
 * Canvas → composer:
 * - single image → attachment strip
 * - multi / group (image+shape etc.) → one export-raster PNG attachment (not split)
 * - single shape / frame → context chip with thumb
 */
export async function applyCanvasAttachPayload(opts: {
  document: any;
  payload: string | string[];
  existingChips: ComposerContext[];
  onAttachFiles: (files: File[], opts?: { mention?: boolean }) => void | Promise<void>;
  insertChip: (ctx: ComposerContext) => void;
}) {
  const { document: doc, payload, existingChips, onAttachFiles, insertChip } = opts;
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

  const attachable = ids.filter((id) => canAttachNodeToChat(doc?.deltaSetLike?.[id]));
  if (!attachable.length) return;

  // Group / multi-select — one flattened PNG (same raster path as export), never split.
  if (attachable.length > 1) {
    const file = await rasterizeNodesToPngFile(doc, attachable);
    if (file) {
      await onAttachFiles([file]);
      return;
    }
    // Raster failed — fall back to a single group chip with thumb.
    const base = buildComposerContext(doc, attachable, null, existingChips);
    const ctx = await enrichComposerContextThumb(doc, base, { nodeIds: attachable });
    if (ctx) insertChip(ctx);
    return;
  }

  const id = attachable[0]!;
  const node = doc?.deltaSetLike?.[id];
  const src = String(node?.attrs?.src || '').trim();
  if (node?.key === 'image' && src) {
    try {
      await onAttachFiles([await imageSrcToFile(src, `canvas-${id}.png`)]);
      return;
    } catch {
      /* fall through to chip */
    }
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

/** Ask mode: typed text matches the apply chip → re-send with proposed ops. */
function findAskApplyConfirm(
  messages: ChatUiMessage[],
  typed: string
): { messageId: string; ops: NonNullable<ChatUiMessage['proposedOps']>; label: string } | null {
  const lastAsk = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.proposedOps?.length && m.applyChoice);
  if (!lastAsk?.proposedOps?.length) return null;
  const applyLabel = String(lastAsk.applyChoice || '').trim();
  if (!applyLabel) return null;
  const t = typed.trim();
  const confirms =
    t === applyLabel ||
    (t.length >= 2 && t.length <= applyLabel.length && applyLabel.includes(t));
  if (!confirms) return null;
  return { messageId: lastAsk.id, ops: lastAsk.proposedOps, label: t };
}

function clearAskProposalFields(m: ChatUiMessage): ChatUiMessage {
  if (m.role !== 'assistant') return m;
  if (!(m.proposedOps?.length || m.choices?.length || m.applyChoice)) return m;
  return {
    ...m,
    proposedOps: undefined,
    applyChoice: undefined,
    choices: undefined,
  };
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
  return { frameChip, chipFrameId, mentionNodeIds, attachedImages, mentionImageSrcs };
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
    steps: [
      {
        id: 'thought-0',
        kind: 'thought',
        name: opts.t('agent.activityThoughtRunning'),
        status: 'running' as const,
      },
    ],
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
  const spatialSummary = opts.docNow
    ? buildSpatialSummary(opts.docNow, { focusFrameId: targetFrameId })
    : null;
  return { chipFrameId, targetFrameId, sceneNodes, sceneFrames, spatialSummary };
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
    const label = formatActivityLabel(opts.t, {
      kind: ev.kind,
      status: ev.status === 'running' ? 'running' : 'done',
      durationSec: ev.durationSec,
      count: ev.count,
      skillName: ev.skillName,
      detail: ev.detail,
      stage: ev.stage,
    });
    if (!label) return;
    const summary =
      ev.kind === 'tool' ||
      ev.kind === 'skipped' ||
      ev.kind === 'added' ||
      ev.kind === 'updated' ||
      ev.kind === 'deleted'
        ? (ev.detail || '').trim() || undefined
        : undefined;
    const nestItem =
      ev.item && (ev.item.name || ev.item.id)
        ? localizeExploreItem(opts.t, {
            id: String(ev.item.id || `item-${Date.now()}`),
            name: String(ev.item.name || '').trim() || '…',
            summary: ev.item.summary ? String(ev.item.summary) : undefined,
          })
        : null;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const next = applyActivityEventToSteps(m.steps || [], {
          kind: ev.kind,
          eventId: ev.id,
          status: ev.status === 'running' ? 'running' : 'done',
          label,
          summary,
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
export default function AgentDock({
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
  /** Context chips in the composer (right-click 添加到 Chat + file attachments). */
  const [contextChips, setContextChips] = useState<ComposerContext[]>([]);
  const contextChipsRef = useRef<ComposerContext[]>([]);
  contextChipsRef.current = contextChips;
  const pinnedContextKeysRef = useRef<Set<string>>(new Set());
  const contextDismissedKeyRef = useRef<string | null>(null);
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
    (s: any) => (s.editor.selectedNodeIds || []) as string[]
  );
  const selectedFrameIds = useSelector(
    (s: any) => (s.editor.selectedFrameIds || []) as string[]
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
        : (['agent', 'ask', 'image'] as ComposerInteractionMode[]),
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
        void warmAgentRoutePresetRules();
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
        const list = normalizeModelList(res?.models, res?.imageModels);
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
      setComposerMode(image ? 'image' : 'agent');
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

  /** Right-click / pick 「添加到 Chat」— shapes → chips; images → attachment strip. */
  useEffect(() => {
    if (!open || attachToChat == null || !document) return;
    const payload = attachToChat;
    // Clear parent flag immediately so the effect does not re-fire. Do NOT abort the
    // in-flight apply on that clear — cleanup would cancel shape chip inserts.
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
      },
    });
    // handleAttachFiles is stable enough via closure; omit to avoid re-fire loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attachToChat, document, onAttachConsumed]);

  /** Composer "Add from canvas" pick result (node composers use pending; agent uses attachToChat). */
  const pendingCanvasAttach = useSelector(
    (s: any) =>
      s.editor.pendingCanvasAttach as null | { target: string; payload: string | string[] }
  );
  useEffect(() => {
    if (!open || !document || !pendingCanvasAttach) return;
    if (pendingCanvasAttach.target !== 'agent') return;
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
        inputRef.current?.focus();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingCanvasAttach, document, dispatch]);

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
    const MAX = 10 * 1024 * 1024;
    const isImageMode =
      interactionMode === 'image' || composerMode === 'image' || isImageKind(models.find((m) => m.id === model));
    const limit = agentAttachmentLimit({
      models,
      modelId: model,
      isImageMode,
      rules: designCatalog?.global_rules,
      routedImageId: routeOverridesForApi(loadAgentRoutePrefs(designCatalog?.global_rules))?.image,
      freeImageId: FREE_IMAGE_MODEL_ID,
      autoModel: AUTO_MODEL,
    });
    let remaining = Math.max(
      0,
      limit - contextChips.filter((c) => c.kind === 'attachment').length
    );
    let mentionOrdinal = contextChipsRef.current.filter((c) => c.kind === 'attachment').length;
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
      const key = `attachment:${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`;
      let preview = '';
      try {
        preview = await readFileAsDataUrl(file);
      } catch {
        message.error(t('agent.attachReadFailed', { name: file.name }));
        continue;
      }
      const pending: ComposerContext = {
        key,
        label: file.name,
        kind: 'attachment',
        payload: `[Attached image]\nname: ${file.name}\nmime: ${file.type}`,
        dataUrl: preview,
        thumbUrl: preview,
        uploadStatus: 'uploading',
      };
      pinnedContextKeysRef.current.add(key);
      remaining -= 1;
      mentionOrdinal += 1;

      const n = mentionOrdinal;
      const mentionCtx: ComposerContext | null = opts?.mention
        ? {
            key: `attach-ref:${chipBaseKey(key)}`,
            label: t('agent.mentionAttachImageN', { n }),
            kind: 'image',
            payload: pending.payload || `[User attachment ${n}]`,
            dataUrl: preview,
            thumbUrl: preview,
          }
        : null;
      // Instant local thumb; upload continues in background. Attachment chip + inline
      // @mention are added in ONE update so a stale-closure onContextsChange from the
      // input (fired via microtask before commit) can't drop the new attachment.
      setContextChips((prev) => {
        const base = prev.filter((c) => c.key !== key);
        return mentionCtx ? [...base, pending, mentionCtx] : [...base, pending];
      });
      if (mentionCtx) {
        queueMicrotask(() => inputRef.current?.focus());
      }

      try {
        const uploaded = await uploadComposerAttachment(file, {
          previewDataUrl: preview,
        });
        const imageRef = String(uploaded.imageRef || '').trim();
        const localPreview = String(uploaded.previewDataUrl || preview).trim();
        setContextChips((prev) => {
          if (!prev.some((c) => c.key === key)) {
            // User removed while uploading — drop orphaned server object.
            if (uploaded.uploadKey) {
              void deleteUploadedFile(uploaded.uploadKey).catch(() => {});
            }
            return prev;
          }
          return prev.map((c) =>
            c.key === key
              ? {
                  ...c,
                  // Composer thumb stays local (auth-less); bubble prefers https imageRef.
                  dataUrl: imageRef || localPreview,
                  thumbUrl: localPreview || imageRef,
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
    }
  };

  const selectedModel =
    model === 'auto' ? AUTO_MODEL : models.find((m) => m.id === model);
  const selectedModelLabel = selectedModel?.label || (models[0]?.label ?? 'Agent');
  const isImageInteraction = interactionMode === 'image';
  const isImageModelSelected =
    isImageInteraction || composerMode === 'image' || isImageKind(selectedModel);
  const rules = designCatalog?.global_rules;
  const attachmentLimit = agentAttachmentLimit({
    models,
    modelId: model,
    isImageMode: isImageModelSelected,
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
    showDesignSizePicker: !isImageModelSelected,
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
    onPickFromCanvas: () => {
      if (pickingFromCanvas) {
        dispatch(clearCanvasAttachPick());
        return;
      }
      // Add current canvas selection first (nodes + artboards), then stay in pick for more.
      const doc = document;
      const attachable = selectedNodeIds.filter((id) =>
        canAttachNodeToChat(doc?.deltaSetLike?.[id])
      );
      const frameId = selectedFrameIds.find(Boolean) || null;
      const insertChip = (ctx: ComposerContext) => {
        pinnedContextKeysRef.current.add(ctx.key);
        contextDismissedKeyRef.current = null;
        inputRef.current?.insertContextAtCaret(ctx);
        inputRef.current?.focus();
      };
      void (async () => {
        if (attachable.length) {
          await applyCanvasAttachPayload({
            document: doc,
            payload: attachable.length === 1 ? attachable[0]! : attachable,
            existingChips: contextChipsRef.current,
            onAttachFiles: handleAttachFiles,
            insertChip,
          });
        }
        if (frameId) {
          await applyCanvasAttachPayload({
            document: doc,
            payload: `frame:${frameId}`,
            existingChips: contextChipsRef.current,
            onAttachFiles: handleAttachFiles,
            insertChip,
          });
        }
      })();
      dispatch(startCanvasAttachPick({ target: 'agent' }));
    },
    pickingFromCanvas,
    pickFromCanvasTooltip: pickingFromCanvas
      ? t('agent.pickFromCanvasCancel')
      : t('agent.pickFromCanvas'),
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

    if (!options.applyOps?.length) {
      setMessages((prev) => prev.map(clearAskProposalFields));
    }

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
    clearContextChips();
    setSending(true);
    setMessages([
      ...baseMessages,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        ...buildStreamingAssistantSeed({
          imageGenCount,
          imageGenAspect,
          imageGenAspectRatio,
          canPickModel,
          model,
          selectedModel,
          models,
          t,
        }),
        streaming: true,
        startedAt: Date.now(),
      },
    ]);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

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
    } = buildDesignSceneSnapshot({
      docNow,
      chipFrameId: chipFrameIdFromContext,
      frameChip,
      mentionNodeIds,
      lastAgentFrameId: lastAgentFrameIdRef.current,
      taskStateFrameId: taskState?.canvas?.last_agent_frame_id || null,
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
  };

  /** `@` opens canvas attach picker (not the model list). */
  const maybeOpenMentionFromAt = (value: string) => {
    if (onlyImageInteraction) {
      setMentionPanelOpen(false);
      setMentionQuery('');
      return;
    }
    const at = value.lastIndexOf('@');
    if (at >= 0) {
      const after = value.slice(at + 1);
      if (!/\s/.test(after)) {
        setModelPanelOpen(false);
        setMentionQuery(after);
        setMentionPanelOpen(true);
        return;
      }
    }
    setMentionPanelOpen(false);
    setMentionQuery('');
  };

  const stripTrailingAtQuery = (prev: string) => {
    const at = prev.lastIndexOf('@');
    if (at < 0) return prev;
    const after = prev.slice(at + 1);
    if (/\s/.test(after)) return prev;
    return prev.slice(0, at);
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
      payload: att.payload || `[User attachment ${n}]`,
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

  const onInputChange = (value: string) => {
    setInput(value);
    maybeOpenMentionFromAt(value);
  };

  const onEditDraftChange = (value: string) => {
    setEditDraft(value);
    maybeOpenMentionFromAt(value);
  };

  const applyInteractionMode = (mode: ComposerInteractionMode) => {
    setInteractionMode(mode);
    setImageModelPanelOpen(false);
    setModelPanelOpen(false);
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
    setImageModelPanelOpen(false);
    setHistoryOpen(false);
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

  if (!open) return null;

  const composerPlaceholder = resolveComposerPlaceholder(t, {
    isImageModel: isImageModelSelected,
    isImageMode: isImageInteraction,
    hasContextChips: contextChips.length > 0,
  });

  const imageModels = models.filter((m) => isImageKind(m));
  const imageModeSelectedModel =
    imageModels.find((m) => m.id === model) ||
    imageModels.find((m) => m.id === FREE_IMAGE_MODEL_ID) ||
    imageModels[0];
  const imageModeControls: ImageModeComposerControls | null = isImageInteraction
    ? {
        resolution: imageResolution,
        aspectRatio: imageGenAspectRatio,
        imageCount: imageGenCountSetting,
        onResolutionChange: (r) => setImageResolution(r as typeof imageResolution),
        onAspectRatioChange: (r) => setImageGenAspectRatio(r as typeof imageGenAspectRatio),
        onImageCountChange: (n) =>
          setImageGenCountSetting(
            Math.max(1, Math.min(4, Math.round(n) || 1)) as 1 | 2 | 3 | 4
          ),
        imageLimits: modelImageLimits(imageModeSelectedModel),
        creditCost: estimateImageCredits(
          imageModeSelectedModel,
          imageGenCountSetting,
          imageResolution
        ),
        modelLabel: String(
          imageModeSelectedModel?.label || model || FREE_IMAGE_MODEL_ID
        ),
        modelIcon: (
          <ModelBrandIcon
            model={imageModeSelectedModel || { id: model || FREE_IMAGE_MODEL_ID }}
            className="h-3.5 w-3.5 shrink-0"
          />
        ),
        modelOpen: imageModelPanelOpen,
        onModelOpenChange: setImageModelPanelOpen,
        modelPanel: (
          <ModelPickerPanel
            tab="image"
            models={models}
            selectedId={model}
            status={modelsStatus}
            onPick={(id) => {
              setModel(id);
              setComposerMode('image');
              setImageModelPanelOpen(false);
            }}
          />
        ),
      }
    : null;

  const modelButtonProps = {
    title:
      model === 'auto'
        ? modelDescription(AUTO_MODEL, t)
        : (() => {
            const m = models.find((x) => x.id === model);
            if (!m) return selectedModelLabel;
            return `${m.label || m.id} — ${modelDescription(m, t)}`;
          })(),
    label:
      model === 'auto'
        ? t('agent.autoToggle')
        : selectedModel?.label || selectedModelLabel,
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
        modeLabel={
          interactionMode === 'image'
            ? t('agent.interactionImage')
            : t('agent.interactionAgent')
        }
      />
    ),
    icon: <Icon name="editor-model-cube" width={16} height={16} />,
  };

  const escapeComposer = (opts?: { cancelEdit?: boolean }) => {
    if (mentionPanelOpen || modelPanelOpen) {
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
      ) : null}
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
          {!onlyImageInteraction && newChatTip ? (
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
              disabled={onlyImageInteraction}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
                historyOpen && 'bg-[var(--accent-soft)] text-[var(--ink)]'
              )}
              onClick={() => {
                if (onlyImageInteraction) return;
                closePopovers();
                setHistoryOpen((v) => !v);
              }}
            >
              <BiTimeFive className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
          {!floating ? (
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
          ) : null}
        </div>
      </div>

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
        onChoice={(choice) => {
          if (sending || choice === '取消') return;
          const lastAsk = [...messages]
            .reverse()
            .find(
              (m) =>
                m.role === 'assistant' &&
                m.proposedOps?.length &&
                m.applyChoice &&
                m.applyChoice === choice
            );
          if (lastAsk?.proposedOps?.length) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === lastAsk.id
                  ? {
                      ...m,
                      proposedOps: undefined,
                      applyChoice: undefined,
                      choices: undefined,
                    }
                  : m
              )
            );
            void send({
              text: choice,
              raw: true,
              displayContent: choice,
              applyOps: lastAsk.proposedOps,
              forceAgent: true,
            });
            return;
          }
          void send({ text: choice, raw: true, displayContent: choice });
        }}
        onOpenSession={openSession}
        onDeleteSession={deleteSession}
        formatChatTime={formatChatTime}
      />

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
            <div>
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
                modelButtonProps={modelButtonProps}
                {...imageAspectProps}
              />
            </div>
          </div>
        </div>
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
    </aside>
  );
}
