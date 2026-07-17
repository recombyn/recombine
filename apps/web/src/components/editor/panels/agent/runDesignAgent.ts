/**
 * Cursor-like design agent loop: LLM plans → tools → canvas SVG nodes → iterate.
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

export type AgentStepEvent =
  | { type: 'thinking'; text: string }
  | { type: 'token'; text: string }
  | { type: 'tool_start'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; id: string; name: string; result: AgentToolResult }
  | { type: 'done'; summary?: string; choices?: string[] }
  | { type: 'error'; message: string };

export type RunDesignAgentParams = {
  userMessage: string;
  model?: string | null;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  contextPayload?: string | null;
  /** Active design-style guide (spacing / color / type). */
  styleGuide?: string | null;
  dispatch: Dispatch;
  getDocument: () => any;
  targetFrameId?: string | null;
  /** User-attached image data URLs for create_image. */
  userImages?: string[];
  onEvent: (ev: AgentStepEvent) => void;
  signal?: AbortSignal;
  maxTurns?: number;
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
  return /生成|绘制|设计|海报|画板|创建|做[一]?个|排版|布局|放[一]?个|加上|写上|改成|换成|海报|banner|poster|design|draw|create|make|layout/i.test(
    s
  );
}

export async function runDesignAgent({
  userMessage,
  model,
  history = [],
  contextPayload,
  styleGuide,
  dispatch,
  getDocument,
  targetFrameId,
  userImages = [],
  onEvent,
  signal,
  maxTurns = 10,
}: RunDesignAgentParams): Promise<void> {
  const doc = getDocument();
  const frames = Array.isArray(doc?.frames) ? doc.frames : [];
  const frame =
    (targetFrameId && frames.find((f: any) => f.id === targetFrameId)) ||
    frames.find((f: any) => f.id === doc?.activeFrameId) ||
    (frames.length === 1 ? frames[0] : null) ||
    null;

    const systemExtra = [
    buildPlacementPolicy(doc, targetFrameId, userMessage),
    styleGuide || '',
    contextPayload || '',
    'LAYOUT FIRST, then vector tools. create_image without attachment → placeholder only; with user attachments use attachmentIndex. Never auto-generate bitmaps.',
    'Icons: use closed path/pen fills and clash-color layered shapes — not empty outline boxes only.',
    'When Canvas context includes [Target element] with an id, you MUST call update_node with that id for style/geometry edits.',
    'Never delete canvas elements unless the user explicitly asked to delete them.',
    'Never call finish until create_frame / create_shape / create_text / create_image / update_node has succeeded for this request.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: AgentMessage[] = [
    {
      role: 'system',
      content:
        'You are recombyn Design Agent. Design on the SVG canvas with tools. ' +
        'Respond in Chinese for user-facing text. ' +
        (systemExtra ? `\n\nCanvas context:\n${systemExtra}` : ''),
    },
    ...history
      .filter((m) => m.content?.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }) as AgentMessage),
    { role: 'user', content: userMessage },
  ];

  const toolCtx: DesignToolContext = {
    dispatch,
    getDocument,
    targetFrameId: frame?.id || targetFrameId || null,
    userMessage,
    userImages,
  };

  let canvasMutated = false;
  let emptyToolNudgeUsed = false;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) return;

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

    if (failed || signal?.aborted) return;

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
      const latest = getDocument();
      const hasFrames = Array.isArray(latest?.frames) && latest.frames.length > 0;
      const needsDraw = looksLikeDesignRequest(userMessage) && !canvasMutated;

      if (!hasFrames && needsDraw) {
        onEvent({
          type: 'done',
          summary:
            '当前没有画布。需要我先创建一个新画布再绘制吗？也可以告诉我要用哪块已有画板。',
          choices: ['创建手机画布(390×844)', '创建画板(794×1123)'],
        });
        return;
      }

      // Model talked without tools — nudge once, then be honest if still nothing.
      if (needsDraw && !emptyToolNudgeUsed && turn < maxTurns - 1) {
        emptyToolNudgeUsed = true;
        messages.push({
          role: 'user',
          content: userWantsSiblingFrame(userMessage)
            ? '系统提醒：你还没有调用工具。请立即 create_frame（与现有画板同尺寸，放在右侧 gap=48），再在新画板内 create_shape/create_text。禁止只写方案或假装已完成。禁止删除已有元素。'
            : '系统提醒：你还没有调用工具修改画布。请立即用 create_frame/create_shape/create_text/update_node 执行，禁止只写方案或调用 finish。禁止删除用户未要求删除的元素。',
        });
        continue;
      }

      if (needsDraw) {
        onEvent({
          type: 'done',
          summary:
            '我还没有在画布上创建任何内容（只输出了文字）。请再说一次需求，或点下方选项让我继续用工具绘制。',
          choices: userWantsSiblingFrame(userMessage)
            ? ['继续：右侧新建同比例画板并绘制']
            : ['继续用工具绘制'],
        });
        return;
      }

      onEvent({ type: 'done' });
      return;
    }

    let finished = false;
    let askChoices: string[] | undefined;
    let askSummary: string | undefined;

    for (const tc of toolCalls) {
      if (signal?.aborted) return;

      let result = executeDesignTool(tc.name, tc.arguments, toolCtx);

      // Reject premature finish when nothing was drawn yet.
      if (
        (tc.name === 'finish' || result.artifacts?.done) &&
        !canvasMutated &&
        looksLikeDesignRequest(userMessage)
      ) {
        result = {
          status: 'error',
          summary:
            'finish blocked: no successful canvas mutations yet. Call create_frame / create_shape / create_text first, then finish.',
          next_actions: userWantsSiblingFrame(userMessage)
            ? ['create_frame', 'create_shape', 'create_text', 'create_image']
            : ['create_shape', 'create_text', 'create_image', 'update_node', 'create_frame'],
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
        finished = true;
        askSummary = result.summary;
        const opts = result.artifacts?.options;
        askChoices = Array.isArray(opts) ? opts.map((x) => String(x)) : undefined;
        onEvent({ type: 'done', summary: askSummary, choices: askChoices });
      }

      if ((tc.name === 'finish' || result.artifacts?.done) && result.status !== 'error') {
        finished = true;
        onEvent({ type: 'done', summary: result.summary });
      }
    }
    if (finished) return;
  }

  onEvent({
    type: 'done',
    summary: canvasMutated
      ? '已达到最大工具轮次；画布已有部分修改，可继续补充需求。'
      : '已达到最大工具轮次，但画布尚未成功修改。请再发一次需求。',
  });
}
