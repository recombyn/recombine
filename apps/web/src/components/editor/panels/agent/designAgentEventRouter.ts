import type { Store } from '@reduxjs/toolkit';
import { message } from '@/components/base';
import type { DesignScene } from '@/apis/design';
import {
  applyActivityEventToSteps,
  applyAnalysisDeltaToSteps,
  applyThinkingBodyToSteps,
  buildChatProcessSteps,
  formatActivityLabel,
  localizeExploreItem,
  normalizeActivityStatus,
  type ChatUiMessage,
} from '@/components/editor/panels/agent/ChatTurnList';
import {
  type AgentStepEvent,
} from '@/components/editor/panels/agent/runDesignAgent';

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
  bodyText?: string;
}): string | undefined {
  const { kind, label, detailText, summaryText, bodyText } = opts;
  const body = (bodyText || '').trim();
  if (summaryText && summaryText !== label && summaryText !== body) {
    return summaryText;
  }
  if (!DETAIL_SUMMARY_KINDS.has(kind)) return undefined;
  if (detailText && detailText !== label && detailText !== body) return detailText;
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
    proposalId?: string;
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
    proposalId: opts.proposalId || undefined,
    applyChoice: opts.applyChoice || undefined,
    choiceUi: opts.choiceUi,
    steps: buildChatProcessSteps(opts.t, m),
  });
}

function isProgressChatLine(text: string): boolean {
  const s = String(text || '').trim();
  if (!s) return false;
  if (/[…⋯]$/.test(s) || /\.\.\.$/.test(s)) return true;
  if (/^(正在|创建中|生成中|处理中|working|creating|generating|painting)/i.test(s)) {
    return true;
  }
  return false;
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
    proposalId?: string;
    applyChoice?: string;
    choiceUi?: ChatUiMessage['choiceUi'];
  }
): ChatUiMessage {
  let result = '';
  if (opts.proposedOps?.length) {
    result = (opts.summary || '').trim() || (m.content || '').trim();
  } else if (opts.painted) {
    const rawProcess = (m.thinking || m.intent || '').trim();
    const hasIntentAnalysis =
      Boolean(rawProcess) && !/<svg\b|<\/svg>/i.test(rawProcess);
    const fromSummary = opts.summary?.trim() || '';
    const summaryIsShortDone =
      fromSummary.length > 0 &&
      fromSummary.length <= 48 &&
      !isProgressChatLine(fromSummary);
    if (summaryIsShortDone) result = fromSummary;
    else if (hasIntentAnalysis) result = opts.t('agent.canvasReadyHint');
    else result = opts.t('agent.canvasUpdated');
  } else if (opts.designStarted) {
    result = opts.t('agent.designEmptyResult');
  } else {
    const kept = m.content?.trim() || '';
    result = kept && !isProgressChatLine(kept) ? kept : opts.t('agent.stopped');
  }
  return opts.finish(m, {
    content: result,
    thinking: undefined,
    pipeline: undefined,
    drawing: undefined,
    intent: undefined,
    choices: opts.choices?.length ? opts.choices : undefined,
    proposedOps: opts.proposedOps?.length ? opts.proposedOps : undefined,
    proposalId: opts.proposalId || undefined,
    applyChoice: opts.applyChoice || undefined,
    choiceUi: opts.choiceUi,
    steps: (m.steps || []).map((s) => ({
      ...s,
      status: s.status === 'error' ? s.status : ('done' as const),
    })),
  });
}

export function humanizeDesignError(
  t: (key: string, opts?: Record<string, unknown>) => string,
  raw: string | undefined | null
): string {
  const msg = String(raw || '').trim();
  if (!msg) return t('agent.requestFailed');
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
  if (/^[a-z][a-z0-9_]+:/i.test(msg) && !/\s/.test(msg.slice(0, 40))) {
    return t('agent.designExecFailed');
  }
  return msg;
}

export function assistantDurationMs(
  m: ChatUiMessage,
  patch: Partial<ChatUiMessage>
): number | undefined {
  if (typeof patch.durationMs === 'number') return patch.durationMs;
  if (m.startedAt) return Date.now() - m.startedAt;
  return m.durationMs;
}

export type DesignSendMutable = {
  designStarted: boolean;
  canvasMutated: boolean;
  nodesPainted: boolean;
};

export function createDesignAgentEventRouter(opts: {
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
  store: Store;
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
    const bodyText = ev.body ? String(ev.body) : '';
    const summary = activityRowSummary({
      kind: ev.kind,
      label,
      detailText,
      summaryText,
      bodyText,
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
          bodyMd: bodyText,
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
              canResume: false,
            })
          : m
      )
    );
  };

  const handleUiPaused = (ev: Extract<AgentStepEvent, { type: 'paused' }>) => {
    const tip = opts.t('agent.pausedHint');
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? opts.finishAssistantPatch(m, {
              content: m.content?.trim() ? m.content : tip,
              thinking: undefined,
              pipeline: undefined,
              drawing: undefined,
              designTaskId: ev.taskId || m.designTaskId,
              designResumeToken: ev.resumeToken || m.designResumeToken,
              canResume: Boolean(ev.taskId || m.designTaskId),
            })
          : m
      )
    );
  };

  const handleUiTask = (ev: Extract<AgentStepEvent, { type: 'task' }>) => {
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? { ...m, designTaskId: ev.taskId, canResume: false }
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
            return {
              ...patchChatDoneAssistant(m, {
                t: opts.t,
                finish: opts.finishAssistantPatch,
                choices: ev.choices,
                proposedOps: ev.proposedOps,
                proposalId: ev.proposalId,
                applyChoice: ev.applyChoice,
                choiceUi: ev.choiceUi,
              }),
              ...(ev.taskId ? { designTaskId: ev.taskId } : {}),
              canResume: false,
              designResumeToken: undefined,
            };
          }
          return {
            ...patchDesignDoneAssistant(m, {
              t: opts.t,
              finish: opts.finishAssistantPatch,
              painted,
              designStarted: opts.mutable.designStarted,
              summary: ev.summary,
              choices: ev.choices,
              proposedOps: ev.proposedOps,
              proposalId: ev.proposalId,
              applyChoice: ev.applyChoice,
              choiceUi: ev.choiceUi,
            }),
            ...(ev.taskId ? { designTaskId: ev.taskId } : {}),
            canResume: false,
            designResumeToken: undefined,
          };
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
      case 'paused':
        handleUiPaused(ev);
        return;
      case 'task':
        handleUiTask(ev);
        return;
      case 'done':
        handleUiDone(ev);
        return;
      default:
        return;
    }
  };
}
