import { forwardRef, useRef, type ReactNode, type Ref, memo } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineChevronRight,
  HiOutlineComputerDesktop,
  HiOutlineQuestionMarkCircle,
} from 'react-icons/hi2';
import ChatMarkdown from '@/components/editor/panels/ChatMarkdown';
import { ContextChipPill } from '@/components/editor/panels/AgentComposerInput';
import { Image } from '@/components/base/image';
import {
  VirtualList,
  type VirtualListHandle,
} from '@/components/base/VirtualList';
import { cn } from '@/utils/classnames';
import { setChatImageDragData } from '@/utils/chatImageDrag';
import { imageSrcToFile } from '@/utils/uploadImage';
import VideoJsPlayer from '@/components/editor/nodes/VideoNode/VideoJsPlayer';

export type ChatUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** @ chips shown like the composer (label + kind + optional thumb). */
  contexts?: Array<{
    key: string;
    label: string;
    kind: string;
    thumbUrl?: string;
  }>;
  /** `content` with U+FFFC where each context chip sat (inline layout in the bubble). */
  contentMarked?: string;
  /** Design deep-think / reasoner stream — shown inside the foldable gray process. */
  thinking?: string;
  /** Intent analysis — shown inside the foldable gray process, not as final reply. */
  intent?: string;
  streaming?: boolean;
  /** Cursor-like tool execution steps. */
  steps?: Array<{
    id: string;
    name: string;
    status: 'running' | 'done' | 'error' | 'pending';
    kind?: 'thought' | 'explored' | 'tool' | 'added' | 'updated' | 'skipped' | 'deleted';
    /** Timeline tone: confirm / success / info (all plain text rows). */
    variant?: 'confirm' | 'success' | 'info';
    summary?: string;
    /** Nested lines under Explored. */
    items?: Array<{ id: string; name: string; summary?: string }>;
    /** Expandable markdown body (diagrams / long notes). */
    body?: string;
  }>;
  /** Seedream / Image-mode results shown as a gallery (not SVG). */
  images?: string[];
  /** Video-mode results shown as a gallery. */
  videos?: string[];
  /** While image-gen is running: expected card count for shimmer placeholders. */
  imagePendingCount?: number;
  /** While video-gen is running: expected card count for shimmer placeholders. */
  videoPendingCount?: number;
  /** Image-gen aspect (e.g. 9:16) — sizes shimmer / gallery cards. */
  imageAspectRatio?: string;
  /** Image-gen model id — brand icon in the worked-for row. */
  imageModelId?: string;
  /** Image-gen model display name shown before "Worked for …". */
  imageModelLabel?: string;
  /** Canvas was mutated by the reply to this user turn; restore available while editing (in-memory). */
  canRestore?: boolean;
  /** Epoch ms when this assistant turn started streaming. */
  startedAt?: number;
  /** Wall time for completed turn (ms). */
  durationMs?: number;
  /** Quick-reply chips from ask_user (e.g. create canvas). */
  choices?: string[];
  /** Ask mode: proposed tool_ops waiting for an option with action=apply. */
  proposedOps?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
  /** Ask mode: label of the apply option (compat). */
  applyChoice?: string;
  /** Ask interaction UI — mode + options; text = freeform reply. */
  choiceUi?: {
    mode: 'confirm' | 'single' | 'multi' | 'buttons' | 'text';
    options: Array<{ label: string; action: 'apply' | 'reply' | 'dismiss' }>;
    placeholder?: string;
  };
  /** Live-draw pipeline progress — kept for training UI; not shown in normal chat. */
  pipeline?: {
    category: string;
    labels: string[];
    currentIndex: number;
    stepConfirm: boolean;
    collabMode?: 'collaborative' | 'milestone' | 'auto';
  };
  /** True while canvas nodes are being added one-by-one. */
  drawing?: boolean;
};

export type AssistantStep = NonNullable<ChatUiMessage['steps']>[number];

export type ActivityStepEvent = {
  kind: 'thought' | 'added' | 'updated' | 'explored' | 'skipped' | 'deleted' | 'tool';
  status: 'running' | 'done' | 'error';
  durationSec?: number;
  count?: number;
  skillName?: string;
  detail?: string;
  stage?: string;
};

type ProcessTFn = (key: string, opts?: Record<string, unknown>) => string;

export function normalizeActivityStatus(
  status: string | undefined | null
): 'running' | 'done' | 'error' {
  if (status === 'running') return 'running';
  if (status === 'error') return 'error';
  return 'done';
}

function countLabel(
  t: ProcessTFn,
  count: number | undefined,
  withCount: string,
  bare: string
): string {
  if (count != null && count > 0) return t(withCount, { count });
  return t(bare);
}

function formatThoughtLabel(
  t: ProcessTFn,
  ev: ActivityStepEvent,
  detail: string,
  preferDetail: boolean
): string | null {
  if (ev.status === 'running') {
    return preferDetail ? detail : t('agent.activityThoughtRunning');
  }
  if (preferDetail) return detail;
  if (ev.status === 'done' && ev.durationSec != null) {
    return t('agent.activityThought', { seconds: ev.durationSec });
  }
  if (ev.status === 'done') return t('agent.activityThoughtBrief');
  return null;
}

function formatPreloadExploredLabel(
  t: ProcessTFn,
  detail: string,
  stage: string | undefined
): string | null {
  const preloadTag = detail.toLowerCase();
  const isPreload =
    stage === 'skill_preload' ||
    preloadTag === 'skills' ||
    preloadTag === 'tools' ||
    preloadTag === 'knowledge' ||
    preloadTag === 'aesthetics';
  if (!isPreload) return null;
  if (preloadTag === 'tools') return t('agent.lookupKindRule');
  if (preloadTag === 'knowledge') return t('agent.lookupKindKnowledge');
  if (preloadTag === 'aesthetics') return t('agent.lookupKindAesthetics');
  return t('agent.lookupKindSkill');
}

function formatCanvasSizeExploredLabel(
  t: ProcessTFn,
  ev: ActivityStepEvent,
  detail: string
): string | null {
  if (ev.stage !== 'scene' && !detail.startsWith('canvas_size:')) return null;
  const raw = detail.replace(/^canvas_size:/i, '').trim();
  const size =
    raw && /^\d+x\d+$/i.test(raw) ? raw.replace(/x/i, '×') : detail;
  if (ev.status === 'running') {
    return size
      ? t('agent.activityCanvasSizeRunning', { size })
      : t('agent.stageScene');
  }
  return size
    ? t('agent.activityCanvasSizeDone', { size })
    : t('agent.stageScene');
}

function formatLookupExploredLabel(
  t: ProcessTFn,
  ev: ActivityStepEvent,
  detail: string
): string | null {
  if (ev.stage !== 'lookup' && !detail.includes('lookup')) return null;
  if (ev.status === 'running') return t('agent.activityLookupRunning');
  const n = ev.count != null && ev.count > 0 ? ev.count : 0;
  return countLabel(
    t,
    n || undefined,
    'agent.activityLookupDoneCount',
    'agent.activityLookupDone'
  );
}

function formatExploredLabel(
  t: ProcessTFn,
  ev: ActivityStepEvent,
  detail: string,
  preferDetail: boolean
): string {
  const preload = formatPreloadExploredLabel(t, detail, ev.stage);
  if (preload) return preload;
  if (preferDetail && !detail.startsWith('canvas_size:')) return detail;
  const canvas = formatCanvasSizeExploredLabel(t, ev, detail);
  if (canvas) return canvas;
  const lookup = formatLookupExploredLabel(t, ev, detail);
  if (lookup) return lookup;
  if (ev.status === 'running') return t('agent.activityExploredRunning');
  const fromCount = ev.count != null && ev.count > 0 ? ev.count : 0;
  const fromDetail = detail
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean).length;
  return countLabel(
    t,
    fromCount || fromDetail || undefined,
    'agent.activityExploredCount',
    'agent.activityExplored'
  );
}

export function formatActivityLabel(
  t: ProcessTFn,
  ev: ActivityStepEvent
): string | null {
  const detail = (ev.detail || '').trim();
  const preferDetail = detail.length > 0;

  if (ev.kind === 'thought') {
    return formatThoughtLabel(t, ev, detail, preferDetail);
  }
  if (ev.kind === 'added') {
    if (preferDetail) return detail;
    return countLabel(
      t,
      ev.count,
      'agent.activityAddedCount',
      'agent.activityAdded'
    );
  }
  if (ev.kind === 'updated') {
    if (preferDetail) return detail;
    return countLabel(
      t,
      ev.count,
      'agent.activityUpdatedCount',
      'agent.activityUpdated'
    );
  }
  if (ev.kind === 'explored') {
    return formatExploredLabel(t, ev, detail, preferDetail);
  }
  if (ev.kind === 'skipped') {
    if (preferDetail) return detail;
    return t('agent.activitySkipped');
  }
  if (ev.kind === 'deleted') {
    if (preferDetail) return detail;
    return countLabel(
      t,
      ev.count,
      'agent.activityDeletedCount',
      'agent.activityDeleted'
    );
  }
  if (preferDetail) return detail;
  if (ev.status === 'running') return t('agent.activityToolRunning');
  return t('agent.activityTool');
}

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
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'running' || b === 'running') return 'running';
  return 'done';
}

export function localizeExploreItem(
  t: ProcessTFn,
  item: { id: string; name: string; summary?: string }
): { id: string; name: string; summary?: string } {
  const id = String(item.id || '');
  const kindKey = exploreItemKindKey(id);
  if (!kindKey) return item;
  if (kindKey === 'agent.canvasSizeLabel') {
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

function collapseExplorePipelineSteps(steps: AssistantStep[]): AssistantStep[] {
  let explore: AssistantStep | null = null;
  const rest: AssistantStep[] = [];
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

function workedSecsOf(m: ChatUiMessage): number | undefined {
  if (m.startedAt) return Math.max(1, Math.round((Date.now() - m.startedAt) / 1000));
  if (m.durationMs != null) return Math.max(1, Math.round(m.durationMs / 1000));
  return undefined;
}

/** Foldable chat process under "Worked for Xs". */
export function buildChatProcessSteps(t: ProcessTFn, m: ChatUiMessage): AssistantStep[] {
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

export function applyThinkingBodyToSteps(
  stepsIn: AssistantStep[],
  piece: string,
  replace: boolean,
  t: ProcessTFn
): AssistantStep[] {
  const text = String(piece || '').trim();
  if (!text) return stepsIn;

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
      items: [{ id: 'thought-brief', name: text }],
    });
    return collapseExplorePipelineSteps(steps);
  }
  const prevStep = steps[idx];
  const items = [...(prevStep.items || [])];
  const prev = items.find((x) => x.id === 'thought-brief');
  const merged = replace
    ? text
    : `${String(prev?.summary || prev?.name || '')}${text}`.trim();
  const thoughtLine = {
    id: 'thought-brief',
    name: merged,
  };
  const ti = items.findIndex((x) => x.id === 'thought-brief');
  if (ti >= 0) items[ti] = thoughtLine;
  else items.push(thoughtLine);
  // Gray nest line only — do not also mirror into body (that looked like a second copy).
  const prevBody = (prevStep.body || '').trim();
  const body =
    prevBody && prevBody !== merged && !merged.startsWith(prevBody)
      ? prevStep.body
      : undefined;
  steps[idx] = {
    ...prevStep,
    id: 'explore-pipeline',
    kind: 'explored',
    items,
    body,
    status: prevStep.status,
  };
  return collapseExplorePipelineSteps(steps);
}

/** True when assistant reply is the same essay already shown in the process fold. */
export function replyDuplicatesProcessThought(
  content: string,
  steps: AssistantStep[] | undefined
): boolean {
  const reply = content.replace(/\s+/g, ' ').trim();
  if (reply.length < 24) return false;
  for (const s of steps || []) {
    for (const it of s.items || []) {
      if (it.id !== 'thought-brief') continue;
      const thought = String(it.name || it.summary || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!thought) continue;
      if (reply === thought) return true;
      if (reply.length >= 40 && thought.includes(reply.slice(0, 40))) return true;
      if (thought.length >= 40 && reply.includes(thought.slice(0, 40))) return true;
    }
    const body = String(s.body || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body && (reply === body || (body.length >= 40 && reply.includes(body.slice(0, 40))))) {
      return true;
    }
  }
  return false;
}

export function applyAnalysisDeltaToSteps(
  stepsIn: AssistantStep[],
  piece: string
): AssistantStep[] | null {
  const steps = [...stepsIn];
  let idx = steps.findIndex((s) => s.status === 'running' && s.kind === 'thought');
  if (idx < 0) idx = steps.findIndex((s) => s.status === 'running');
  if (idx < 0 && steps.length) idx = steps.length - 1;
  if (idx < 0) return null;
  const merged = `${steps[idx].summary || ''}${piece}`;
  steps[idx] = {
    ...steps[idx],
    summary: merged,
  };
  return steps;
}

export function applyActivityEventToSteps(
  stepsIn: AssistantStep[],
  opts: {
    kind: NonNullable<AssistantStep['kind']>;
    eventId?: string;
    status: 'running' | 'done' | 'error';
    label: string;
    summary?: string;
    variant?: NonNullable<AssistantStep['variant']>;
    nestItem?: { id: string; name: string; summary?: string } | null;
    bodyMd: string;
  }
): AssistantStep[] | null {
  const { kind, status, label, summary, variant, nestItem, bodyMd } = opts;
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
      variant: variant || 'confirm',
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
    variant,
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

export type ChatTurn = {
  user: ChatUiMessage | null;
  assistant?: ChatUiMessage;
};

type Props = {
  turns: ChatTurn[];
  editingUserId: string | null;
  editComposer?: ReactNode;
  sending: boolean;
  formatWorked: (assistant?: ChatUiMessage) => string | null;
  hasCheckpoint: (userId: string) => boolean;
  onBeginEdit: (m: ChatUiMessage) => void;
  onCancelEdit: () => void;
  onRestore: (userId: string) => void;
  onChoice?: (choice: AskChoicePick) => void;
  className?: string;
};

export type AskChoicePick = {
  label: string;
  action: 'apply' | 'reply' | 'dismiss';
  /** multi mode: all selected labels when submitting. */
  selectedLabels?: string[];
};

function hasFoldableProcess(assistant: ChatUiMessage): boolean {
  return Boolean(
    assistant.steps?.some(
      (s) => s.kind !== 'thought' && s.id !== 'thought-0'
    )
  );
}

/** Gallery / shimmer cards — wide enough for hover CTA; scroll when many. */
function cardBoxFromAspect(raw?: string): { width: number; height: number } {
  const TARGET_W = 168;
  let rw = 1;
  let rh = 1;
  const s = String(raw || '1:1').trim();
  if (s === 'smart' || s.toLowerCase() === 'auto') {
    /* keep 1:1 */
  } else {
    const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) {
      rw = Math.max(0.01, Number(m[1]));
      rh = Math.max(0.01, Number(m[2]));
    }
  }
  const width = TARGET_W;
  const height = Math.max(96, Math.min(280, Math.round((width * rh) / rw)));
  return { width, height };
}

/** User bubble: attachment thumbs above text (composer strip / 图2); @ chips inline. */
function UserMessageBody({
  content,
  contentMarked,
  contexts,
}: {
  content: string;
  contentMarked?: string;
  contexts?: ChatUiMessage['contexts'];
}): ReactNode {
  const chips = contexts || [];
  const attachments = chips.filter((c) => c.kind === 'attachment');
  const inline = chips.filter((c) => c.kind !== 'attachment');

  const attachmentStrip =
    attachments.length > 0 ? (
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {attachments.map((a) => {
          const src = String(a.thumbUrl || '').trim();
          return (
            <div
              key={a.key}
              title={a.label}
              className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--canvas)]"
            >
              {src ? (
                <img src={src} alt={a.label} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[8px] leading-tight text-[var(--muted)]">
                  {a.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  if (!inline.length) {
    return (
      <>
        {attachmentStrip}
        {content || (attachments.length ? '' : '...')}
      </>
    );
  }

  const marked =
    contentMarked && contentMarked.includes('\uFFFC')
      ? contentMarked
      : `${'\uFFFC'.repeat(inline.length)}${content || ''}`;

  const parts = marked.split('\uFFFC');
  const nodes: ReactNode[] = [];
  let chipIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part) nodes.push(<span key={`t-${i}`}>{part}</span>);
    if (i < parts.length - 1) {
      const c = inline[chipIdx++];
      if (c) {
        nodes.push(
          <ContextChipPill
            key={`${c.key}-${chipIdx}`}
            label={c.label}
            thumbUrl={c.thumbUrl}
            className="mx-0.5"
          />
        );
      }
    }
  }
  while (chipIdx < inline.length) {
    const c = inline[chipIdx++];
    if (!c) break;
    nodes.push(
      <ContextChipPill
        key={`${c.key}-${chipIdx}`}
        label={c.label}
        thumbUrl={c.thumbUrl}
        className="mx-0.5"
      />
    );
  }
  return (
    <>
      {attachmentStrip}
      {nodes.length ? nodes : content || '...'}
    </>
  );
}

function stepVariant(
  step: NonNullable<ChatUiMessage['steps']>[number]
): 'confirm' | 'success' | 'info' {
  if (step.variant === 'success' || step.variant === 'confirm' || step.variant === 'info') {
    return step.variant;
  }
  const kind = step.kind || '';
  if (kind === 'added' || kind === 'updated' || kind === 'deleted') return 'success';
  if (kind === 'thought' || kind === 'explored' || kind === 'tool' || kind === 'skipped') {
    return 'confirm';
  }
  return 'info';
}

function AssistantProcessBody({
  assistant,
}: {
  assistant: ChatUiMessage;
}): ReactNode {
  const raw = assistant.steps || [];
  const seen = new Set<string>();
  const steps = raw.filter((s) => {
    const id = String(s.id || '');
    if (!id || seen.has(id)) return false;
    // Intent/understanding rows ("要望を理解中…" / "已确认对话意图") — not shown in chat.
    if (s.kind === 'thought' || id === 'thought-0') return false;
    seen.add(id);
    return true;
  });
  const turnActive = Boolean(assistant.streaming);
  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      {steps.map((step, i) => (
        <ProcessStepRow
          key={`${step.id}-${i}`}
          step={step}
          turnActive={turnActive}
        />
      ))}
    </div>
  );
}

function ProcessStepRow({
  step,
  turnActive,
}: {
  step: NonNullable<ChatUiMessage['steps']>[number];
  /** True while this assistant turn is still streaming — keep process expanded. */
  turnActive: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const variant = stepVariant(step);
  const expandable = Boolean(
    (step.items && step.items.length) ||
      step.body?.trim() ||
      (step.summary?.trim() && step.summary.trim() !== step.name.trim())
  );
  // Live turn: expand. Finished turn: collapse (click to re-open).
  const [open, setOpen] = useState(() => turnActive);
  const userToggledRef = useRef(false);

  useEffect(() => {
    userToggledRef.current = false;
    setOpen(turnActive);
  }, [step.id]);

  useEffect(() => {
    if (userToggledRef.current) return;
    setOpen(turnActive);
  }, [turnActive]);

  const label = (
    <>
      {step.name}
      {step.status === 'running' && !/[.…]$/.test(step.name.trim()) ? '…' : ''}
    </>
  );

  const chevron = expandable ? (
    <HiOutlineChevronRight
      className={cn(
        'h-3.5 w-3.5 shrink-0 opacity-45 transition-transform',
        open && 'rotate-90'
      )}
      aria-hidden
    />
  ) : null;

  const detail =
    open && expandable ? (
      <div className="flex w-full flex-col gap-1 text-[12px] leading-relaxed text-[var(--muted)]">
        {(step.items || []).map((it) => (
          <div key={it.id} className="flex w-full min-w-0 items-start gap-1.5">
            <HiOutlineCheckCircle
              className="mt-0.5 h-3 w-3 shrink-0 text-[var(--success,#22a06b)] opacity-80"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <span className="block whitespace-pre-wrap break-words leading-snug">
                {it.name}
              </span>
              {it.summary?.trim() ? (
                <span className="mt-0.5 block whitespace-pre-wrap break-words text-[11px] leading-snug opacity-80">
                  {it.summary}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {step.summary?.trim() && step.summary.trim() !== step.name.trim() ? (
          <span className="w-full whitespace-pre-wrap break-words leading-snug">{step.summary}</span>
        ) : null}
        {step.body?.trim() ? (
          <div className="w-full whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--ink)]/80">
            <ChatMarkdown content={step.body} />
          </div>
        ) : null}
      </div>
    ) : null;

  const rowClass = cn(
    'flex w-full items-center gap-1.5 text-left text-[12px] leading-none text-[var(--muted)] transition-colors',
    step.status === 'error' && 'text-[var(--ink)]',
    (step.status === 'done' || variant === 'success') && 'text-[var(--ink)]/70'
  );

  const leadingIcon =
    step.status === 'error' ? (
      <HiOutlineQuestionMarkCircle
        className="h-3.5 w-3.5 shrink-0 text-[var(--danger,#c45)]"
        aria-hidden
      />
    ) : step.status === 'done' || variant === 'success' ? (
      <HiOutlineCheckCircle
        className="h-3.5 w-3.5 shrink-0 text-[var(--success,#22a06b)]"
        aria-hidden
      />
    ) : (
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--ink)]/35"
        aria-hidden
      />
    );

  if (!expandable) {
    return (
      <span className={cn(rowClass, 'items-start')}>
        <span className="mt-0.5 shrink-0">{leadingIcon}</span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-snug">{label}</span>
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5">
      <button
        type="button"
        className={cn(rowClass, 'items-start hover:text-[var(--ink)]')}
        onClick={() => {
          userToggledRef.current = true;
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        title={open ? t('agent.collapseProcess') : t('agent.expandProcess')}
      >
        <span className="mt-0.5 shrink-0">{leadingIcon}</span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-left leading-snug">
          {label}
        </span>
        <span className="mt-0.5 shrink-0">{chevron}</span>
      </button>
      {detail}
    </div>
  );
}

function AssistantTurn({
  assistant,
  onChoice,
  sending,
}: {
  assistant: ChatUiMessage;
  worked?: string | null;
  onChoice?: (choice: AskChoicePick) => void;
  sending: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const foldable = hasFoldableProcess(assistant);
  const streaming = Boolean(assistant.streaming);
  const processRunning = (assistant.steps || []).some((s) => s.status === 'running');
  const contentTrim = (assistant.content || '').trim();
  // Process timeline first — don't stream the reply while earlier steps are still running.
  // Also hide black reply when it duplicates the gray thought already in the fold.
  const showReplyText =
    Boolean(contentTrim) &&
    !(streaming && processRunning) &&
    !replyDuplicatesProcessThought(contentTrim, assistant.steps);

  const showImageGallery =
    Boolean(assistant.images?.length) ||
    (Number(assistant.imagePendingCount) || 0) > 0;
  const showVideoGallery =
    Boolean(assistant.videos?.length) ||
    (Number(assistant.videoPendingCount) || 0) > 0;
  const showMediaGallery = showImageGallery || showVideoGallery;
  const doneMilestone =
    !streaming &&
    (foldable || showMediaGallery) &&
    Boolean(assistant.content || showMediaGallery);

  const showAskChoices =
    !streaming &&
    onChoice &&
    Boolean(
      (assistant.choiceUi?.mode !== 'text' && assistant.choiceUi?.options?.length) ||
        (assistant.choiceUi?.mode === 'text' &&
          assistant.choiceUi.options?.some(
            (o) => o.action === 'apply' || o.action === 'dismiss'
          )) ||
        assistant.choices?.length ||
        assistant.applyChoice ||
        assistant.proposedOps?.length
    );

  return (
    <div
      data-assistant-id={assistant.id}
      className="flex w-full min-w-0 flex-col items-stretch gap-2.5 px-0.5"
    >
      <div className="flex w-full items-center gap-1.5 text-[12px] leading-none text-[var(--ink)]/70">
        <HiOutlineQuestionMarkCircle className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {streaming && (!assistant.content?.trim() || processRunning)
            ? t('agent.working')
            : t('agent.replied', { defaultValue: '已回复' })}
        </span>
      </div>

      {/* Process first, then reply — matching product timeline order. */}
      {foldable ? <AssistantProcessBody assistant={assistant} /> : null}

      {showImageGallery ? (
        <ImageGenGallery assistant={assistant} sending={sending} />
      ) : null}

      {showVideoGallery ? (
        <VideoGenGallery assistant={assistant} sending={sending} />
      ) : null}

      {showReplyText ? (
        <div className="w-full min-w-0 overflow-x-hidden text-[13px] leading-[1.7] text-[var(--ink)] [&_.rcb-chat-md_p:first-child]:font-semibold">
          <ChatMarkdown content={assistant.content || ''} />
          {streaming ? (
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
          ) : null}
        </div>
      ) : streaming && !foldable && !showMediaGallery ? (
        <div className="w-full text-[12px] text-[var(--muted)]">
          {t('agent.working')}
          <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-current align-middle opacity-50" />
        </div>
      ) : null}

      {doneMilestone ? (
        <div className="flex w-full items-center gap-1.5 text-[12px] text-[var(--muted)]">
          <HiOutlineComputerDesktop className="h-3.5 w-3.5 opacity-70" aria-hidden />
          <span>
            {t('agent.taskCompleteNamed', {
              name: t('app.name', { defaultValue: 'Recombyn' }),
              defaultValue: '{{name}} 已完成任务',
            })}
          </span>
        </div>
      ) : null}

      {showAskChoices && onChoice ? (
        <AskChoicePanel assistant={assistant} onChoice={onChoice} sending={sending} />
      ) : null}
    </div>
  );
}

function ChatResultImageCard({
  src,
  box,
}: {
  src: string;
  box: { width: number; height: number };
}): ReactNode {
  const { t } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const draggedRef = useRef(false);

  const download = async () => {
    try {
      const file = await imageSrcToFile(src, 'image.png');
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name || 'image.png';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="group relative shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--canvas)]"
      style={{ width: box.width, height: box.height }}
    >
      <img
        src={src}
        alt=""
        draggable
        loading="lazy"
        className="block h-full w-full cursor-grab object-cover active:cursor-grabbing"
        onDragStart={(e) => {
          draggedRef.current = true;
          setChatImageDragData(e.dataTransfer, src);
        }}
        onDragEnd={() => {
          // Click often follows a completed drag — ignore the next click once.
          window.setTimeout(() => {
            draggedRef.current = false;
          }, 0);
        }}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          setPreviewOpen(true);
        }}
      />
      <button
        type="button"
        aria-label={t('agent.downloadImage', { defaultValue: '下载图片' })}
        title={t('agent.downloadImage', { defaultValue: '下载图片' })}
        className="absolute bottom-1.5 right-1.5 z-[1] inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white shadow-sm backdrop-blur-[2px] transition-colors hover:bg-black/70"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void download();
        }}
      >
        <HiOutlineArrowDownTray className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <Image
        src={src}
        alt=""
        lazy={false}
        preview={{ open: previewOpen, onOpenChange: setPreviewOpen, previewOnClick: false }}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        imgClassName="!hidden"
      />
    </div>
  );
}

function VideoGenGallery({
  assistant,
}: {
  assistant: ChatUiMessage;
  sending?: boolean;
}): ReactNode {
  const videos = assistant.videos || [];
  const pending = Math.max(0, Number(assistant.videoPendingCount) || 0);
  const slots = Math.max(videos.length, pending);
  if (slots <= 0) return null;
  const box = cardBoxFromAspect(assistant.imageAspectRatio);

  return (
    <div className="mt-1 flex max-w-full gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
      {Array.from({ length: slots }, (_, i) => {
        const src = videos[i];
        if (src) {
          return (
            <div
              key={`${assistant.id}-vid-${i}`}
              className="group relative shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-black"
              style={{ width: box.width, height: box.height }}
            >
              <VideoJsPlayer
                src={src}
                layout="fill"
                controlsMode="always"
                muted
                className="h-full w-full"
              />
            </div>
          );
        }
        return (
          <div
            key={`${assistant.id}-vshimmer-${i}`}
            className="rcb-chat-image-gen-shimmer shrink-0 rounded-lg border border-[var(--line)]"
            style={{ width: box.width, height: box.height }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}

function ImageGenGallery({
  assistant,
}: {
  assistant: ChatUiMessage;
  sending?: boolean;
}): ReactNode {
  const images = assistant.images || [];
  const pending = Math.max(0, Number(assistant.imagePendingCount) || 0);
  const slots = Math.max(images.length, pending);
  if (slots <= 0) return null;
  const box = cardBoxFromAspect(assistant.imageAspectRatio);

  return (
    <div className="mt-1 flex max-w-full gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
      {Array.from({ length: slots }, (_, i) => {
        const src = images[i];
        if (src) {
          return (
            <ChatResultImageCard
              key={`${assistant.id}-img-${i}`}
              src={src}
              box={box}
            />
          );
        }
        return (
          <div
            key={`${assistant.id}-shimmer-${i}`}
            className="rcb-chat-image-gen-shimmer shrink-0 rounded-lg border border-[var(--line)]"
            style={{ width: box.width, height: box.height }}
            aria-hidden
          />
        );
      })}
    </div>
  );
}

function resolveAskChoiceUi(assistant: ChatUiMessage): ChatUiMessage['choiceUi'] | null {
  if (assistant.choiceUi?.mode === 'text') {
    // Free-text answers use the bottom composer — only keep chip actions if any.
    const opts = (assistant.choiceUi.options || []).filter(
      (o) => o.action === 'apply' || o.action === 'dismiss'
    );
    if (!opts.length) return null;
    return { mode: 'buttons', options: opts };
  }
  if (assistant.choiceUi?.options?.length) return assistant.choiceUi;
  const labels = (assistant.choices || []).map((c) => String(c).trim()).filter(Boolean);
  const apply = String(assistant.applyChoice || '').trim();
  if (!labels.length && !apply && !assistant.proposedOps?.length) return null;
  const options: NonNullable<ChatUiMessage['choiceUi']>['options'] = [];
  if (apply) options.push({ label: apply, action: 'apply' });
  for (const label of labels) {
    if (label === apply) continue;
    options.push({ label, action: 'reply' });
  }
  if (assistant.proposedOps?.length && !options.some((o) => o.action === 'apply')) {
    options.unshift({ label: '', action: 'apply' });
  }
  if (!options.length) return null;
  const mode =
    options.every((o) => o.action === 'apply' || o.action === 'dismiss')
      ? 'confirm'
      : 'buttons';
  return { mode, options };
}

function AskChoicePanel({
  assistant,
  onChoice,
  sending,
}: {
  assistant: ChatUiMessage;
  onChoice: (choice: AskChoicePick) => void;
  sending: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const ui = resolveAskChoiceUi(assistant);
  const [picked, setPicked] = useState<string[]>([]);
  if (!ui?.options.length) return null;

  const optionLabel = (opt: { label: string; action: string }) => {
    if (opt.label) return opt.label;
    if (opt.action === 'apply') return t('common.confirm');
    if (opt.action === 'dismiss') return t('common.cancel');
    return opt.label;
  };

  const chipClass =
    'inline-flex h-8 max-w-full items-center rounded-full border border-[var(--line)] bg-[var(--canvas)] px-3 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-40';

  if (ui.mode === 'multi') {
    const replyOpts = ui.options.filter((o) => o.action === 'reply');
    const applyOpt = ui.options.find((o) => o.action === 'apply');
    const dismissOpt = ui.options.find((o) => o.action === 'dismiss');
    return (
      <div className="mt-1 flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {replyOpts.map((opt) => {
            const label = optionLabel(opt);
            const on = picked.includes(label);
            return (
              <button
                key={`m-${label}`}
                type="button"
                disabled={sending}
                className={cn(chipClass, on && 'border-[var(--ink)] bg-[var(--line)]')}
                onClick={() =>
                  setPicked((prev) =>
                    on ? prev.filter((x) => x !== label) : [...prev, label]
                  )
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {applyOpt ? (
            <button
              type="button"
              disabled={sending}
              className={chipClass}
              onClick={() =>
                onChoice({
                  label: optionLabel(applyOpt),
                  action: 'apply',
                  selectedLabels: picked,
                })
              }
            >
              {optionLabel(applyOpt)}
            </button>
          ) : (
            <button
              type="button"
              disabled={sending || picked.length === 0}
              className={chipClass}
              onClick={() =>
                onChoice({
                  label: picked.join('、'),
                  action: 'reply',
                  selectedLabels: picked,
                })
              }
            >
              {t('common.confirm')}
            </button>
          )}
          {dismissOpt ? (
            <button
              type="button"
              disabled={sending}
              className={chipClass}
              onClick={() =>
                onChoice({ label: optionLabel(dismissOpt), action: 'dismiss' })
              }
            >
              {optionLabel(dismissOpt)}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1.5">
      {ui.options.map((opt, i) => {
        const label = optionLabel(opt);
        return (
          <button
            key={`${opt.action}-${label}-${i}`}
            type="button"
            disabled={sending}
            className={chipClass}
            onClick={() => onChoice({ label, action: opt.action })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const ChatTurnList = forwardRef(function ChatTurnList(
  {
    turns,
    editingUserId,
    editComposer,
    sending,
    formatWorked: _formatWorked,
    hasCheckpoint,
    onBeginEdit,
    onCancelEdit,
    onRestore,
    onChoice,
    className,
  }: Props,
  ref: Ref<VirtualListHandle>
): ReactNode {
  const { t } = useTranslation();

  return (
    <VirtualList
      ref={ref}
      items={turns}
      estimateSize={180}
      overscan={4}
      gap={20}
      getItemKey={(turn) => turn.user?.id || turn.assistant?.id || 'turn'}
      className={cn('px-4 py-2', className)}
      contentClassName="py-2"
      empty={
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="text-center text-[14px] text-[var(--muted)]">
            {t('agent.emptyHint')}
          </p>
        </div>
      }
    >
      {({ user: m, assistant }) => {
        const isEditing = Boolean(m && editingUserId === m.id);
        const canRestore = Boolean(m && hasCheckpoint(m.id));
        return (
          <div className="flex w-full min-w-0 flex-col gap-3">
            {m ? (
              isEditing ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--canvas)] shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
                    {editComposer}
                  </div>
                  <div className="flex items-center gap-1 px-0.5">
                    {canRestore ? (
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                        onClick={() => onRestore(m.id)}
                      >
                        <HiOutlineArrowUturnLeft className="h-3.5 w-3.5" />
                        {t('agent.restore')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                      onClick={onCancelEdit}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group relative w-full min-w-0">
                  <div
                    onClick={!sending ? () => onBeginEdit(m) : undefined}
                    className={cn(
                      'w-full rounded-[22px] bg-[var(--canvas)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--ink)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
                      !sending ? 'cursor-pointer' : '',
                      canRestore && !sending ? 'pr-10' : ''
                    )}
                    title={t('agent.clickToEdit')}
                  >
                    <UserMessageBody
                      content={m.content}
                      contentMarked={m.contentMarked}
                      contexts={m.contexts}
                    />
                  </div>
                  {canRestore ? (
                    <button
                      type="button"
                      aria-label={t('agent.restoreCheckpoint')}
                      title={t('agent.restoreCheckpoint')}
                      disabled={sending}
                      className={cn(
                        'absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-opacity hover:bg-[var(--canvas)] hover:text-[var(--ink)]',
                        sending
                          ? 'pointer-events-none opacity-0'
                          : 'opacity-0 group-hover:opacity-100'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = m.id;
                        window.setTimeout(() => onRestore(id), 0);
                      }}
                    >
                      <HiOutlineArrowUturnLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              )
            ) : null}

            {assistant && !isEditing ? (
              <AssistantTurn
                assistant={assistant}
                onChoice={onChoice}
                sending={sending}
              />
            ) : null}
          </div>
        );
      }}
    </VirtualList>
  );
});

export default memo(ChatTurnList);