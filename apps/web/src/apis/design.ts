/**
 * Backend table-driven design job client (agent / single_model / partial).
 * Non-stream calls use shared axios `request`; SSE run stays on fetch (see chat.ts).
 */

import { getToken } from '@/utils/token';
import { request } from '@/utils/request';

export type DesignRunMode = 'agent' | 'single_model' | 'partial';
export type DesignScene = 'website' | 'mobile' | 'image' | 'poster';

export type DesignLibraryPack = {
  id: number;
  name: string;
  kind: string;
  scene: string;
  coverUrl?: string;
  description?: string;
  meta?: Record<string, unknown> | null;
};

export type DesignCatalog = {
  scenes: DesignScene[];
  models: Array<{ id: string; label: string }>;
  style_groups: Array<{
    id: number;
    name: string;
    scenes: string;
    skill_ids: number[];
    priority: number;
  }>;
  style_packs?: DesignLibraryPack[];
  templates?: DesignLibraryPack[];
  prompt_patterns?: DesignLibraryPack[];
  prompt_stack?: string[];
  flows: Record<string, { id: number; scene: string; skill_ids: number[] }>;
  /** Enabled canvas tool_ops from design_canvas_tool — FE executes by op_key. */
  canvas_tools?: Array<{
    op_key: string;
    kind?: string;
    label?: string;
    model_hint?: string;
    args_schema?: string;
    enabled?: boolean;
    sort_order?: number;
  }>;
};

export type DesignSvgPatch = {
  mode: 'full' | 'patch';
  creates: string[];
  updates: string[];
  deletes: string[];
  create_count: number;
  update_count: number;
  delete_count: number;
  total_next?: number;
};

export type DesignJobEvent =
  | {
      type: 'status';
      task_id?: string;
      status?: string;
      hold_credits?: number;
      scene?: string;
      canvas_width?: number;
      canvas_height?: number;
      canvas_size?: string;
      edit_in_place?: boolean;
      blank_artboard?: boolean;
      intent?: string;
    }
  | { type: 'thinking'; text: string; replace?: boolean }
  | { type: 'token'; text: string }
  | { type: 'chat_done' }
  | {
      type: 'skill_start';
      index: number;
      skill_id: number;
      skill_name: string;
      category?: string;
      model?: string;
      model_reason?: string;
    }
  | {
      /** Live execute progress (chars received) while model streams tool JSON. */
      type: 'skill_progress';
      index: number;
      skill_id?: number;
      skill_name?: string;
      chars?: number;
    }
  | {
      type: 'skill_done';
      index: number;
      skill_id: number;
      skill_name: string;
      tokens?: number;
      /** Full SVG after this skill — kept for paint / fallback. */
      preview_svg?: string;
      /** Layer-level create/update/delete vs previous emitted SVG. */
      svg_patch?: DesignSvgPatch;
      /** User-facing intent analysis from req_parse / plan skill. */
      analysis?: string;
      tool_ops?: Array<{ name: string; args?: Record<string, unknown> }>;
    }
  | {
      /** Model intent / requirements analysis (from plan skill JSON). */
      type: 'analysis';
      text: string;
      skill_id?: number;
      skill_name?: string;
    }
  | {
      /** Streaming analysis tokens (plan / req_parse). */
      type: 'analysis_delta';
      text: string;
      skill_id?: number;
      skill_name?: string;
    }
  | {
      /** Backend-authored progress (element counts etc.). FE displays, does not invent. */
      type: 'activity';
      id?: string;
      kind?: 'thought' | 'added' | 'updated' | 'explored' | 'skipped' | 'tool';
      status?: 'running' | 'done';
      count?: number;
      detail?: string;
      skillName?: string;
      skill_name?: string;
      durationSec?: number;
      index?: number;
    }
  | {
      /** Dedicated incremental SVG push (optional; skill_done.preview_svg also works). */
      type: 'svg_delta';
      svg: string;
      index?: number;
      skill_name?: string;
      svg_patch?: DesignSvgPatch;
    }
  | {
      type: 'decision';
      trace_id?: string;
      route?: string;
      fast_path?: boolean;
      intent?: string;
      edit_in_place?: boolean;
      blank_artboard?: boolean;
      focus_frame_id?: string;
      memory_injected?: boolean;
      memory_blocks_chars?: number;
      has_target_chip?: boolean;
      has_scene_nodes?: boolean;
      [key: string]: unknown;
    }
  | {
      type: 'result';
      task_id: string;
      trace_id?: string;
      status: string;
      svg: string;
      charged_credits?: number;
      total_tokens?: number;
      actual_models?: unknown[];
      summary?: string;
      choices?: string[];
      scene?: string;
      canvas_width?: number;
      canvas_height?: number;
      canvas_size?: string;
      svg_patch?: DesignSvgPatch;
      tool_ops_applied?: boolean;
      blank_artboard?: boolean;
      intent?: string;
      decision_log?: Record<string, unknown>;
    }
  | {
      type: 'tool_ops';
      ops: Array<{ name: string; args?: Record<string, unknown>; op_id?: string }>;
      schema_version?: string;
      index?: number;
      skill_id?: number;
      skill_name?: string;
      /** True when ops are pushed mid-stream (边想边画). */
      stream?: boolean;
      agent_round?: number;
    }
  | {
      type: 'scene_feedback_request';
      task_id?: string;
      round?: number;
      rounds?: number;
      wait_ms?: number;
    }
  | { type: 'critique_start'; round: number; reason?: string }
  | { type: 'critique_done'; round: number; ok: boolean; reason?: string }
  | {
      type: 'memory_patch';
      medium: Record<string, unknown>;
      long_suggestions?: Array<{ kind: string; text: string }>;
    }
  | { type: 'replan'; action: string; skipped?: string[]; reason?: string }
  | { type: 'subgoals'; goals: string[] }
  | { type: 'error'; message: string; task_id?: string; refunded_credits?: number };

export type RunDesignJobParams = {
  runMode: DesignRunMode;
  prompt: string;
  scene?: DesignScene | null;
  styleGroupId?: number | null;
  stylePackId?: number | null;
  templateId?: number | null;
  promptPatternId?: number | null;
  userSelectedModel?: string | null;
  /** Auto 路由偏好（简单/中等/复杂/看图/生图）；不传则跟平台预检。 */
  routeOverrides?: Record<string, string> | null;
  canvasId?: string | null;
  canvasSize?: string | null;
  targetLayerId?: string | null;
  layerIds?: string[] | null;
  currentSvg?: string | null;
  /** Scene node inventory for edit-in-place tool ops. */
  sceneNodes?: Array<Record<string, unknown>> | null;
  /** Artboard list for SCENE_FRAMES / delete_frame validation. */
  sceneFrames?: Array<Record<string, unknown>> | null;
  focusFrameId?: string | null;
  /** User-attached reference images (data URLs / https). */
  images?: string[] | null;
  sessionId?: string | null;
  projectId?: string | null;
  memory?: {
    medium: Record<string, unknown>;
    short?: Array<{ role: string; text: string }>;
    retrieve_long?: boolean;
  } | null;
  signal?: AbortSignal;
  onEvent: (ev: DesignJobEvent) => void;
};

let catalogCache: DesignCatalog | null = null;

export async function fetchDesignCatalog(force = false): Promise<DesignCatalog> {
  if (catalogCache && !force) return catalogCache;
  catalogCache = await request<DesignCatalog>({
    url: '/api/v1/design/catalog',
    method: 'get',
  });
  return catalogCache;
}

export async function runDesignJob(params: RunDesignJobParams): Promise<void> {
  const token = getToken();
  if (!token) {
    params.onEvent({ type: 'error', message: 'Unauthorized' });
    return;
  }

  const body = {
    run_mode: params.runMode,
    prompt: params.prompt,
    scene: params.scene || undefined,
    style_group_id: params.styleGroupId ?? undefined,
    style_pack_id: params.stylePackId ?? undefined,
    template_id: params.templateId ?? undefined,
    prompt_pattern_id: params.promptPatternId ?? undefined,
    user_selected_model: params.userSelectedModel || 'auto',
    route_overrides: params.routeOverrides || undefined,
    canvas_id: params.canvasId || undefined,
    canvas_size: params.canvasSize || undefined,
    target_layer_id: params.targetLayerId || undefined,
    layer_ids: params.layerIds || undefined,
    current_svg: params.currentSvg || undefined,
    scene_nodes: params.sceneNodes?.length ? params.sceneNodes : undefined,
    scene_frames: params.sceneFrames?.length ? params.sceneFrames : undefined,
    focus_frame_id: params.focusFrameId || undefined,
    images: params.images?.length ? params.images : undefined,
    session_id: params.sessionId || undefined,
    project_id: params.projectId || undefined,
    memory: params.memory || undefined,
  };

  let res: Response;
  try {
    res = await fetch('/api/v1/design/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  } catch (err: unknown) {
    if (params.signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    params.onEvent({
      type: 'error',
      message: /Failed to fetch|NetworkError|ERR_/i.test(msg)
        ? '连接中断（代理超时或 API 热重载）。请重试；生成过程中勿保存 API 代码。'
        : msg || 'Failed to fetch',
    });
    return;
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    params.onEvent({
      type: 'error',
      message: detail || `design run HTTP ${res.status}`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const idx = buffer.indexOf('\n');
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const ev = JSON.parse(data) as DesignJobEvent;
          params.onEvent(ev);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err: unknown) {
    if (params.signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    params.onEvent({
      type: 'error',
      message: /Failed to fetch|NetworkError|ERR_/i.test(msg)
        ? '连接中断（代理超时或 API 热重载）。请重试；生成过程中勿保存 API 代码。'
        : msg || 'stream interrupted',
    });
  }
}


export type DesignBrush = {
  id: string;
  label: string;
  sizeFactor: number;
  simulatePressure?: boolean;
  kind?: string;
  options?: Record<string, number>;
  stampSrc?: string | null;
  spacingFactor?: number | null;
  libraryId?: number;
};

/** After tool_ops paint: push real canvas inventory for the next agent round. */
export async function postDesignSceneFeedback(params: {
  taskId: string;
  sceneNodes: Array<Record<string, unknown>>;
  sceneFrames?: Array<Record<string, unknown>>;
  round?: number;
  signal?: AbortSignal;
}): Promise<void> {
  if (!params.taskId) return;
  try {
    await request<{ ok?: boolean; count?: number; frames?: number }>({
      url: `/api/v1/design/run/${encodeURIComponent(params.taskId)}/scene`,
      method: 'post',
      data: {
        scene_nodes: params.sceneNodes,
        scene_frames: params.sceneFrames?.length ? params.sceneFrames : undefined,
        round: params.round ?? undefined,
      },
      signal: params.signal,
      timeout: 15000,
    });
  } catch {
    /* best-effort — backend falls back to simulated inventory */
  }
}

/** Official brush wheel from admin material library. */
export async function fetchDesignBrushes(): Promise<DesignBrush[]> {
  try {
    const data = await request<{ items?: DesignBrush[] }>({
      url: '/api/v1/design/brushes',
      method: 'get',
    });
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}
