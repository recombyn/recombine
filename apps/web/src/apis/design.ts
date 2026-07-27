/**
 * Backend table-driven design job client (agent / single_model / partial).
 */

import { request } from '@/utils/request';
import { sse } from '@/utils/sse';

export type DesignRunMode = 'agent' | 'single_model' | 'partial';
export type DesignScene = 'website' | 'mobile' | 'image' | 'poster' | 'drawing';

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
  /** Platform Admin global rules (includes precheck.user_preset.*). */
  global_rules?: Record<string, string>;
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
      /** Host should open a new artboard (WxH) then paint content into it. */
      open_artboard?: boolean;
      intent?: string;
    }
  | {
      type: 'permission';
      can_call_llm: boolean;
      balance?: number;
      need?: number;
      free_daily?: boolean;
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
      stage?: string;
      /** Nested Explored line (Cursor-style). */
      item?: { id?: string; name?: string; summary?: string };
      /** Markdown body for expandable Explored (diagrams / notes). */
      body?: string;
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
      proposed_ops?: Array<{
        name?: string;
        args?: Record<string, unknown>;
        op_id?: string;
      }>;
      apply_choice?: string;
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

export type RunDesignJobBody = {
  run_mode: DesignRunMode;
  prompt: string;
  /** agent = auto paint; ask = propose / clarify first (same LangGraph). */
  interaction_mode?: 'agent' | 'ask';
  scene?: DesignScene | null;
  style_group_id?: number;
  style_pack_id?: number;
  template_id?: number;
  prompt_pattern_id?: number;
  user_selected_model?: string;
  route_overrides?: Record<string, string>;
  canvas_id?: string;
  canvas_size?: string;
  ref_image_sizes?: string[];
  target_layer_id?: string;
  layer_ids?: string[];
  current_svg?: string;
  scene_nodes?: Array<Record<string, unknown>>;
  scene_frames?: Array<Record<string, unknown>>;
  spatial_summary?: Record<string, unknown>;
  focus_frame_id?: string;
  images?: string[];
  session_id?: string;
  project_id?: string;
  memory?: {
    medium: Record<string, unknown>;
    short?: Array<{ role: string; text: string }>;
    retrieve_long?: boolean;
  };
  /** Ask confirm: apply previously proposed tool_ops without a new LLM plan. */
  apply_ops?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
};

export type SseHandlers = {
  onmessage?: (ev: { event: string; data: string }) => void;
  onerror?: (err: Error) => void;
  onopen?: (response: Response) => Promise<void>;
  onclose?: () => void;
  signal?: AbortSignal;
};

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

export const fetchDesignCatalog = () =>
  request<DesignCatalog>({
    url: '/api/v1/design/catalog',
    method: 'get',
  });

/** POST /design/run SSE — callers parse `ev.data` as DesignJobEvent. */
export const runDesignJob = (body: RunDesignJobBody, config: SseHandlers = {}) =>
  sse({
    url: '/api/v1/design/run',
    method: 'POST',
    body,
    signal: config.signal,
    onopen: config.onopen,
    onmessage: config.onmessage,
    onerror: config.onerror,
    onclose: config.onclose,
  });

/** After tool_ops paint: push real canvas inventory for the next agent round. */
export const postDesignSceneFeedback = (
  taskId: string,
  data: {
    scene_nodes: Array<Record<string, unknown>>;
    scene_frames?: Array<Record<string, unknown>>;
    spatial_summary?: Record<string, unknown>;
    op_results?: Array<{ op_id: string; name: string; ok: boolean; error?: string }>;
    round?: number;
  },
  signal?: AbortSignal
) =>
  request<{ ok?: boolean; count?: number; frames?: number }>({
    url: `/api/v1/design/run/${encodeURIComponent(taskId)}/scene`,
    method: 'post',
    data,
    signal,
    timeout: 15000,
  });

/** Official brush wheel from admin material library. */
export const fetchDesignBrushes = () =>
  request<{ items?: DesignBrush[] }>({
    url: '/api/v1/design/brushes',
    method: 'get',
  });
