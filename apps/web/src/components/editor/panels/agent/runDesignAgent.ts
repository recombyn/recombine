/**
 * Cursor-like design agent loop: LLM plans → tools → canvas SVG nodes → iterate.
 * Full design jobs run a fixed phase pipeline (layout → type → color → …).
 * Optional step-confirm = human-in-the-loop approval gates between phases.
 */

import type { Dispatch } from '@reduxjs/toolkit';
import {
  buildPlacementPolicy,
  executeDesignTool,
  userWantsSiblingFrame,
  type AgentToolResult,
  type DesignToolContext,
} from './designTools';
import { streamAgentTurn, type AgentMessage } from './streamAgentTurn';
import {
  categoryLabel,
  continueChoiceLabel,
  getPipeline,
  inferDesignCategory,
  shouldPauseAfterPhase,
  shouldRunDesignPipeline,
  stopChoiceLabel,
  type AgentCollabMode,
  type DesignCategory,
  type DesignPhase,
  type PipelineProgress,
} from './designPipeline';

export type AgentStepEvent =
  | { type: 'thinking'; text: string }
  | { type: 'token'; text: string }
  | { type: 'tool_start'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; id: string; name: string; result: AgentToolResult }
  | { type: 'phase'; progress: PipelineProgress }
  | { type: 'done'; summary?: string; choices?: string[]; pipelinePaused?: boolean }
  | { type: 'error'; message: string };

export type PipelineResume = {
  category: DesignCategory;
  /** Index of the phase to run next */
  phaseIndex: number;
  brief: string;
};

export type RunDesignAgentParams = {
  userMessage: string;
  model?: string | null;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  contextPayload?: string | null;
  /** Active design-style guide (spacing / color / type). */
  styleGuide?: string | null;
  /** Human-in-the-loop mode (default collaborative). */
  collabMode?: AgentCollabMode;
  /** @deprecated use collabMode */
  stepConfirm?: boolean;
  /** Resume a paused pipeline (after user clicked 继续：…). */
  pipelineResume?: PipelineResume | null;
  dispatch: Dispatch;
  getDocument: () => any;
  targetFrameId?: string | null;
  /** User-attached image data URLs for create_image. */
  userImages?: string[];
  onEvent: (ev: AgentStepEvent) => void;
  signal?: AbortSignal;
  maxTurns?: number;
  /** Max tool turns per pipeline phase */
  maxTurnsPerPhase?: number;
};

const MUTATING_TOOLS = new Set([
  'create_frame',
  'create_shape',
  'create_text',
  'create_image',
  'update_node',
  'update_frame',
  'delete_nodes',
]);

function looksLikeDesignRequest(message: string) {
  const s = String(message || '');
  if (!s.trim()) return false;
  return /生成|绘制|设计|海报|画板|创建|做[一]?个|排版|布局|放[一]?个|加上|写上|改成|换成|海报|banner|poster|design|draw|create|make|layout|继续/i.test(
    s
  );
}

function progressOf(
  category: DesignCategory,
  pipeline: DesignPhase[],
  currentIndex: number,
  collabMode: AgentCollabMode
): PipelineProgress {
  return {
    category,
    phaseIds: pipeline.map((p) => p.id),
    labels: pipeline.map((p) => p.label),
    currentIndex,
    stepConfirm: collabMode !== 'auto',
    collabMode,
  };
}

type PhaseLoopResult =
  | { kind: 'aborted' | 'failed' | 'done' }
  | { kind: 'ask'; summary?: string; choices?: string[] }
  | { kind: 'phase_done'; summary?: string; mutated: boolean };

async function runToolLoop(opts: {
  userMessage: string;
  phaseUserMessage: string;
  model?: string | null;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemExtra: string;
  phaseGuard: string;
  toolCtx: DesignToolContext;
  onEvent: (ev: AgentStepEvent) => void;
  signal?: AbortSignal;
  maxTurns: number;
  /** When true, finish ends this phase only (caller advances pipeline). */
  finishEndsPhase: boolean;
  requireMutation: boolean;
}): Promise<PhaseLoopResult> {
  const {
    userMessage,
    phaseUserMessage,
    model,
    history,
    systemExtra,
    phaseGuard,
    toolCtx,
    onEvent,
    signal,
    maxTurns,
    finishEndsPhase,
    requireMutation,
  } = opts;

  const messages: AgentMessage[] = [
    {
      role: 'system',
      content:
        'You are recombyn Design Agent. Design on the SVG canvas with tools. ' +
        'Respond in Chinese for user-facing text. ' +
        (systemExtra ? `\n\nCanvas context:\n${systemExtra}` : '') +
        (phaseGuard ? `\n\n${phaseGuard}` : ''),
    },
    ...history
      .filter((m) => m.content?.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }) as AgentMessage),
    { role: 'user', content: phaseUserMessage },
  ];

  let canvasMutated = false;
  let emptyToolNudgeUsed = false;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) return { kind: 'aborted' };

    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let assistantMsg: (AgentMessage & { role: 'assistant' }) | null = null;
    let failed = false;

    await streamAgentTurn({
      messages,
      model,
      signal,
      onThinking: (text) => onEvent({ type: 'thinking', text }),
      onToken: (text) => onEvent({ type: 'token', text }),
      onToolCall: (tc) => {
        toolCalls.push(tc);
        onEvent({ type: 'tool_start', id: tc.id, name: tc.name, arguments: tc.arguments });
      },
      onAssistantMessage: (msg) => {
        assistantMsg = msg;
      },
      onError: (message) => {
        failed = true;
        onEvent({ type: 'error', message });
      },
    });

    if (failed) return { kind: 'failed' };
    if (signal?.aborted) return { kind: 'aborted' };

    if (assistantMsg) {
      messages.push(assistantMsg);
    } else if (toolCalls.length) {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    }

    if (!toolCalls.length) {
      const latest = toolCtx.getDocument();
      const hasFrames = Array.isArray(latest?.frames) && latest.frames.length > 0;
      const needsDraw = looksLikeDesignRequest(userMessage) && !canvasMutated;

      if (!hasFrames && needsDraw) {
        onEvent({
          type: 'done',
          summary:
            '当前没有画布。需要我先创建一个新画布再绘制吗？也可以告诉我要用哪块已有画板。',
          choices: ['创建手机画布(390×844)', '创建画板(794×1123)'],
        });
        return { kind: 'done' };
      }

      if (needsDraw && !emptyToolNudgeUsed && turn < maxTurns - 1) {
        emptyToolNudgeUsed = true;
        messages.push({
          role: 'user',
          content: userWantsSiblingFrame(userMessage)
            ? '系统提醒：你还没有调用工具。请立即 create_frame（与现有画板同尺寸，放在右侧 gap=48），再在新画板内 create_shape/create_text。禁止只写方案。'
            : '系统提醒：你还没有调用工具修改画布。请立即用工具执行当前阶段，完成后调用 finish。',
        });
        continue;
      }

      if (needsDraw && requireMutation && !canvasMutated) {
        onEvent({
          type: 'done',
          summary: '我还没有在画布上完成本阶段。请再说一次，或点选项继续。',
          choices: ['继续用工具绘制'],
        });
        return { kind: 'done' };
      }

      // Soft end of phase when model stops talking after some work
      if (canvasMutated || !requireMutation) {
        return { kind: 'phase_done', mutated: canvasMutated };
      }
      onEvent({ type: 'done' });
      return { kind: 'done' };
    }

    for (const tc of toolCalls) {
      if (signal?.aborted) return { kind: 'aborted' };

      let result = executeDesignTool(tc.name, tc.arguments, toolCtx);

      if (
        (tc.name === 'finish' || result.artifacts?.done) &&
        !canvasMutated &&
        requireMutation &&
        looksLikeDesignRequest(userMessage)
      ) {
        result = {
          status: 'error',
          summary:
            'finish blocked: no successful canvas mutations yet this phase. Call drawing tools first, then finish.',
          next_actions: ['create_frame', 'create_shape', 'create_text', 'create_image', 'update_node'],
        };
        onEvent({ type: 'tool_result', id: tc.id, name: tc.name, result });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        continue;
      }

      onEvent({ type: 'tool_result', id: tc.id, name: tc.name, result });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });

      if (MUTATING_TOOLS.has(tc.name) && result.status !== 'error') {
        canvasMutated = true;
      }
      if (tc.name === 'create_frame' && result.artifacts?.frameId) {
        toolCtx.targetFrameId = String(result.artifacts.frameId);
      }

      if (tc.name === 'ask_user' || result.artifacts?.ask) {
        const opts = result.artifacts?.options;
        return {
          kind: 'ask',
          summary: result.summary,
          choices: Array.isArray(opts) ? opts.map((x) => String(x)) : undefined,
        };
      }

      if ((tc.name === 'finish' || result.artifacts?.done) && result.status !== 'error') {
        if (finishEndsPhase) {
          return { kind: 'phase_done', summary: result.summary, mutated: canvasMutated };
        }
        onEvent({ type: 'done', summary: result.summary });
        return { kind: 'done' };
      }
    }
  }

  return { kind: 'phase_done', mutated: canvasMutated, summary: canvasMutated ? undefined : undefined };
}

export async function runDesignAgent({
  userMessage,
  model,
  history = [],
  contextPayload,
  styleGuide,
  collabMode,
  stepConfirm,
  pipelineResume = null,
  dispatch,
  getDocument,
  targetFrameId,
  userImages = [],
  onEvent,
  signal,
  maxTurns = 14,
  maxTurnsPerPhase = 6,
}: RunDesignAgentParams): Promise<void> {
  const mode: AgentCollabMode =
    collabMode ||
    (stepConfirm === false ? 'auto' : stepConfirm === true ? 'collaborative' : 'collaborative');
  const doc = getDocument();
  const frames = Array.isArray(doc?.frames) ? doc.frames : [];
  const frame =
    (targetFrameId && frames.find((f: any) => f.id === targetFrameId)) ||
    frames.find((f: any) => f.id === doc?.activeFrameId) ||
    (frames.length === 1 ? frames[0] : null) ||
    null;

  const toolCtx: DesignToolContext = {
    dispatch,
    getDocument,
    targetFrameId: frame?.id || targetFrameId || null,
    userMessage,
    userImages,
  };

  const baseExtra = [
    buildPlacementPolicy(doc, targetFrameId, userMessage),
    styleGuide || '',
    contextPayload || '',
    'Skills ON DEMAND via lookup_design_skill — never invent specialty rules.',
    'Vector only. create_image without attachment → placeholder or simple vector illustration. Never auto-generate bitmaps.',
    'Icons: closed path fills / layered shapes. Never silent delete_nodes.',
    'When [Target element] id is present, update_node that id.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const usePipeline =
    Boolean(pipelineResume) || shouldRunDesignPipeline(userMessage);

  // —— Incremental edit: single loop, no fixed pipeline ——
  if (!usePipeline) {
    const result = await runToolLoop({
      userMessage,
      phaseUserMessage: userMessage,
      model,
      history,
      systemExtra: baseExtra,
      phaseGuard:
        'This is an incremental edit — do NOT restart a full design pipeline. Apply the requested change with tools, then finish.',
      toolCtx,
      onEvent,
      signal,
      maxTurns,
      finishEndsPhase: false,
      requireMutation: looksLikeDesignRequest(userMessage),
    });
    if (result.kind === 'ask') {
      onEvent({ type: 'done', summary: result.summary, choices: result.choices });
    } else if (result.kind === 'phase_done') {
      onEvent({
        type: 'done',
        summary: result.summary || (result.mutated ? '已更新画布。' : undefined),
      });
    }
    return;
  }

  // —— Fixed pipeline ——
  const category =
    pipelineResume?.category || inferDesignCategory(pipelineResume?.brief || userMessage);
  const pipeline = getPipeline(category);
  const brief = pipelineResume?.brief || userMessage;
  let startIndex = pipelineResume?.phaseIndex ?? 0;
  if (startIndex < 0) startIndex = 0;
  if (startIndex >= pipeline.length) {
    onEvent({ type: 'done', summary: '设计流程已全部完成。' });
    return;
  }

  onEvent({
    type: 'phase',
    progress: progressOf(category, pipeline, startIndex, mode),
  });

  for (let i = startIndex; i < pipeline.length; i += 1) {
    if (signal?.aborted) return;
    const phase = pipeline[i];
    const isLast = i === pipeline.length - 1;

    onEvent({
      type: 'phase',
      progress: progressOf(category, pipeline, i, mode),
    });

    const skillHints = phase.skills
      .map((sk, idx) => {
        const focus = phase.focuses[Math.min(idx, phase.focuses.length - 1)] || phase.focuses[0];
        return `lookup_design_skill("${sk}", "${focus}")`;
      })
      .join('；');

    const willPause = shouldPauseAfterPhase(mode, phase.id, isLast, pipeline);

    const phaseGuard = [
      `FIXED PIPELINE · 品类 ${categoryLabel(category)} · 当前阶段 ${i + 1}/${pipeline.length}「${phase.label}」`,
      '只执行当前阶段，不要跳到后续阶段（配色/装饰等留到对应阶段）。',
      phase.brief,
      `建议先调用：${skillHints}`,
      '完成本阶段画布修改后必须调用 finish（summary 用中文简述本阶段做了什么）。',
      willPause
        ? '协作模式：本阶段 finish 后系统会询问用户是否继续，你不要自行进入下一阶段。'
        : !isLast
          ? '自动推进：finish 后系统会进入下一阶段。'
          : '这是最后一阶段：finish 即全部完成。',
    ].join('\n');

    const phaseUserMessage = [
      `【用户需求】${brief}`,
      `【当前只做】${phase.label}（${i + 1}/${pipeline.length}）`,
      phase.brief,
    ].join('\n');

    const result = await runToolLoop({
      userMessage: brief,
      phaseUserMessage,
      model,
      history,
      systemExtra: baseExtra,
      phaseGuard,
      toolCtx,
      onEvent,
      signal,
      maxTurns: maxTurnsPerPhase,
      finishEndsPhase: true,
      requireMutation: true,
    });

    if (result.kind === 'aborted' || result.kind === 'failed' || result.kind === 'done') {
      return;
    }

    if (result.kind === 'ask') {
      onEvent({ type: 'done', summary: result.summary, choices: result.choices });
      return;
    }

    // result.kind === 'phase_done'
    const phaseSummary = 'summary' in result ? result.summary : undefined;
    const mutated = 'mutated' in result ? result.mutated : false;
    void mutated;

    if (willPause) {
      const next = pipeline[i + 1];
      onEvent({
        type: 'done',
        summary:
          phaseSummary ||
          `「${phase.label}」已完成。当前为协作模式——是否继续「${next.label}」？`,
        choices: [continueChoiceLabel(next), stopChoiceLabel()],
        pipelinePaused: true,
      });
      return;
    }

    if (isLast) {
      onEvent({
        type: 'done',
        summary:
          phaseSummary ||
          `「${categoryLabel(category)}」设计流程已完成（共 ${pipeline.length} 步）。`,
      });
      return;
    }

    onEvent({
      type: 'token',
      text: `\n\n✓ ${phase.label} → 进入「${pipeline[i + 1].label}」…\n\n`,
    });
  }
}
