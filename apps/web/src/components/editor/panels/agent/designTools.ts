/**
 * Canvas design tools — schemas + local execution (Cursor-like tool loop).
 */

import type { Dispatch } from '@reduxjs/toolkit';
import {
  addArtboardFrame,
  patchDocumentNode,
  patchDocumentNodes,
  pushEditorHistory,
  removeArtboardFrames,
  setCanvasMeta,
  setDocument,
  setDocumentFromCanvas,
  startImageProcess,
  updateArtboardFrame,
  type ArtboardFrame,
} from '@/store/modules/editor';
import { exportFabricImage } from '@/components/rcb/scene/exportImage';
import {
  addNodeToDocument,
  createImageNode,
  createShapeNode,
  createSvgNode,
  createTextNode,
  groupNodesInDocument,
  removeNodesFromDocument,
  reorderNodesInDocument,
  supportsBooleanOp,
  ungroupNodesInDocument,
} from '@/components/rcb/scene/sceneDocument';
import {
  buildMarkdownTextAttrs,
  measurePlainTextSize,
  measureWrappedTextSize,
  parseNodeTextStyle,
} from '@/components/rcb/scene/sceneText';
import { serializeFillGradient } from '@/components/rcb/scene/sceneFill';
import { createMeshGrid, type MeshSize } from '@/components/rcb/scene/sceneDiffuseMesh';
import { isStrokeStyle } from '@/components/rcb/scene/sceneStrokeStyle';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import { computeShapeBoolean, applyBooleanResultPaint, type BoolMode } from '@/components/rcb/selection/shapeBoolean';
import { nanoid } from '@reduxjs/toolkit';
import { getAllowedCanvasToolKeys } from '@/components/editor/panels/agent/toolOpsContract';

const IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#eee" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" fill="#999" font-size="14">Image</text></svg>'
  );
const AVATAR_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="60" fill="#ddd"/><circle cx="60" cy="48" r="22" fill="#bbb"/><ellipse cx="60" cy="100" rx="36" ry="24" fill="#bbb"/></svg>'
  );

export type AgentToolResult = {
  status: 'success' | 'warning' | 'error';
  summary: string;
  artifacts?: Record<string, unknown>;
  next_actions?: string[];
};

export type DesignToolContext = {
  dispatch: Dispatch;
  getDocument: () => any;
  /** Prefer placing new nodes inside this frame. When set (e.g. user @ artboard), frame ops are pinned to it. */
  targetFrameId?: string | null;
  /**
   * When true, allow delete_nodes / other destructive tools.
   * Set by the design-agent executor after backend intent approved the ops — never infer from user text here.
   */
  allowDestructive?: boolean;
  /** User-attached image data URLs (fill slots via create_image). */
  userImages?: string[];
  /** Editor chrome bridge (zoom / panels / agent mode). */
  canvasUi?: CanvasUiBridge | null;
  /** Skip per-tool undo snapshots (e.g. batch SVG → nodes import). */
  skipHistory?: boolean;
};

/**
 * Resolve which artboard a frame op should hit.
 * User @ / FOCUS_FRAME_ID (ctx.targetFrameId) wins over a model-guessed frameId —
 * duplicate names like "新画板" often make the model pick the wrong SCENE_FRAMES entry.
 */
function resolveFrameOpId(
  args: Record<string, any>,
  ctx: DesignToolContext
): string {
  const focus = String(ctx.targetFrameId || '').trim();
  const fromArgs = String(args.frameId ?? args.id ?? '').trim();
  if (focus) {
    if (fromArgs && fromArgs !== focus) {
      console.warn(
        '[designTools] frame op retarget blocked',
        { fromArgs, focus }
      );
    }
    return focus;
  }
  return fromArgs;
}

/** Optional callbacks from EditorPage / AgentDock for non-document UI. */
export type CanvasUiBridge = {
  getZoom?: () => number;
  zoomIn?: () => void;
  zoomOut?: () => void;
  /** Absolute zoom factor (1 = 100%). */
  setZoom?: (zoom: number) => void;
  /** Fit / reset view (typically 100% at stage center). */
  fitView?: () => void;
  getCollabMode?: () => 'collaborative' | 'milestone' | 'auto';
  setCollabMode?: (mode: 'collaborative' | 'milestone' | 'auto') => void;
  setLayersOpen?: (open: boolean) => void;
  setMinimapOpen?: (open: boolean) => void;
  getLayersOpen?: () => boolean;
  getMinimapOpen?: () => boolean;
  openAccountAgent?: () => void;
};

/** Capabilities the agent can honestly say are not wired yet. */
export const UNAVAILABLE_CAPABILITIES: Array<{
  id: string;
  label: string;
  hint: string;
}> = [
  {
    id: 'product_preview',
    label: '产品预览 / 全屏预览',
    hint: '暂未接入 Agent。请选中图片后点「全屏预览」，或用顶栏分享预览。',
  },
  {
    id: 'share',
    label: '分享链接',
    hint: '暂未接入 Agent。请点编辑器顶栏「分享」。',
  },
  {
    id: 'workspace_dev',
    label: '切换 Design / Dev 工作区',
    hint: '暂未接入 Agent。请用顶栏 Design / Dev 切换。',
  },
  {
    id: 'hand_tool',
    label: '切换抓手 / 选择工具',
    hint: '暂未接入 Agent。请用底部工具条或空格拖移画布。',
  },
  {
    id: 'tour',
    label: '新手引导回放',
    hint: '暂未接入 Agent。请点左下角「?」重看引导。',
  },
];

/** FE Action executors (op_key must match Admin design_canvas_tool). */
export const FE_ACTION_EXECUTOR_KEYS = [
  'update_node',
  'create_shape',
  'create_text',
  'create_image',
  'create_svg',
  'create_icon',
  'create_frame',
  'delete_nodes',
  'update_frame',
  'delete_frame',
  'align_nodes',
  'distribute_nodes',
  'reorder_nodes',
  'group_nodes',
  'ungroup_nodes',
  'duplicate_nodes',
  'flip_nodes',
  'boolean_op',
  'set_canvas_background',
  'set_viewport',
  'image_process',
  'export_canvas',
] as const;

export const DESIGN_TOOL_NAMES = [
  'get_scene_summary',
  'list_capabilities',
  'ask_user',
  'create_frame',
  'update_frame',
  'create_shape',
  'create_text',
  'create_image',
  'create_svg',
  'create_icon',
  'update_node',
  'align_nodes',
  'distribute_nodes',
  'boolean_op',
  'reorder_nodes',
  'group_nodes',
  'ungroup_nodes',
  'duplicate_nodes',
  'flip_nodes',
  'set_viewport',
  'set_canvas_background',
  'image_process',
  'export_canvas',
  'set_agent_mode',
  'toggle_editor_panel',
  'delete_nodes',
  'delete_frame',
  'finish',
] as const;

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolvePathClosed(opts: {
  args: Record<string, unknown>;
  mapped: string;
  path: string;
}): boolean {
  const { args, mapped, path } = opts;
  const closedExplicit =
    args.closed === true ||
    args.closed === 'true' ||
    args.closed === false ||
    args.closed === 'false';
  if (closedExplicit) return args.closed === true || args.closed === 'true';
  if (mapped === 'path') return /z\s*$/i.test(path.trim());
  return mapped === 'pen' && path.length > 0;
}

function resolveCreateShapeBorderWidth(opts: {
  args: Record<string, unknown>;
  mapped: string;
  isFreePath: boolean;
  needsDefaultStroke: boolean;
  isStrokeOnly: boolean;
  strokeIsNone: boolean;
}): number {
  const {
    args,
    mapped,
    isFreePath,
    needsDefaultStroke,
    isStrokeOnly,
    strokeIsNone,
  } = opts;
  const penLike = isStrokeOnly || mapped === 'pen' || mapped === 'pencil';
  if (isFreePath) {
    if (args.borderWidth != null) return Math.max(0, num(args.borderWidth, 0));
    if (strokeIsNone) return 0;
    return 1;
  }
  if (needsDefaultStroke) {
    if (args.borderWidth != null) return num(args.borderWidth, penLike ? 2 : 1);
    return penLike ? 2 : 1;
  }
  if (args.borderWidth != null) return num(args.borderWidth, 0);
  if (args.stroke != null && !strokeIsNone) return 1;
  return 0;
}

function resolvePencilBrushStyle(
  mapped: string,
  args: Record<string, unknown>
): string | undefined {
  if (mapped !== 'pencil') return undefined;
  if (args.brushStyle != null) return String(args.brushStyle);
  return 'solid';
}

function summarizeCreateImage(opts: {
  id: string;
  sourceKind: string;
  genPrompt: string;
  placed: { width: number; height: number };
}): string {
  const wh = `${Math.round(opts.placed.width)}×${Math.round(opts.placed.height)}`;
  if (opts.sourceKind !== 'placeholder') {
    return `Created image ${opts.id} from ${opts.sourceKind}`;
  }
  if (opts.genPrompt) {
    return `Created image placeholder ${opts.id} (genPrompt not hydrated) — ${wh}`;
  }
  return `Created image placeholder ${opts.id} (${wh}) — user can replace later`;
}

function normalizeAlignMode(rawMode: string): string {
  if (rawMode === 'center' || rawMode === 'centerx') return 'centerX';
  if (rawMode === 'centerY' || rawMode === 'centery') return 'middle';
  return rawMode;
}

function normalizeExportFormat(formatRaw: string): 'jpeg' | 'svg' | 'png' {
  if (formatRaw === 'jpg' || formatRaw === 'jpeg') return 'jpeg';
  if (formatRaw === 'svg') return 'svg';
  return 'png';
}

function resolveExportNodeIds(args: Record<string, unknown>): string[] {
  if (Array.isArray(args.nodeIds)) {
    return args.nodeIds.map((x) => String(x)).filter(Boolean);
  }
  if (args.nodeId) return [String(args.nodeId)];
  return [];
}

/** Normalize AI pathPressure (csv string or number[]) to comma-separated 0.05–1. */
function normalizePathPressureArg(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const parts: number[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const n = Number(v);
      if (Number.isFinite(n)) parts.push(n);
    }
  } else {
    for (const tok of String(raw).split(/[,;\s]+/)) {
      if (!tok) continue;
      const n = Number(tok);
      if (Number.isFinite(n)) parts.push(n);
    }
  }
  if (!parts.length) return undefined;
  return parts
    .map((n) => {
      const t = n > 1 ? n / 100 : n;
      return Math.min(1, Math.max(0.05, t)).toFixed(3);
    })
    .join(',');
}

function listFrames(doc: any): ArtboardFrame[] {
  return Array.isArray(doc?.frames) ? doc.frames : [];
}

/** Scene node ids whose boxes mostly overlap any of the given frames. */
function nodeIdsInsideFrameLocal(doc: any, frameIds: string[]): string[] {
  if (!doc || !frameIds.length) return [];
  const idSet = new Set(frameIds.map(String));
  const frames = listFrames(doc).filter((f) => f?.id && idSet.has(String(f.id)));
  if (!frames.length) return [];
  const rootChildren: string[] = doc?.deltaSetLike?.ROOT?.children || [];
  const out: string[] = [];
  for (const id of rootChildren) {
    const node = doc?.deltaSetLike?.[id];
    if (!node || !id) continue;
    const { left, top } = nodeLeftTop(doc, node);
    const nw = Math.max(1, Number(node.width) || 1);
    const nh = Math.max(1, Number(node.height) || 1);
    const hits = frames.some((frame) => {
      const fx = Number(frame.x) || 0;
      const fy = Number(frame.y) || 0;
      const fw = Math.max(1, Number(frame.width) || 1);
      const fh = Math.max(1, Number(frame.height) || 1);
      const ow = Math.max(0, Math.min(left + nw, fx + fw) - Math.max(left, fx));
      const oh = Math.max(0, Math.min(top + nh, fy + fh) - Math.max(top, fy));
      return ow * oh >= nw * nh * 0.35;
    });
    if (hits) out.push(id);
  }
  return out;
}

function frameById(doc: any, id?: string | null) {
  if (!id) return null;
  return listFrames(doc).find((f) => f.id === id) || null;
}

function sceneSummary(doc: any, targetFrameId?: string | null) {
  const frames = listFrames(doc).map((f) => ({
    id: f.id,
    name: f.name,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
  }));
  const nodes = Object.values(doc?.deltaSetLike || {})
    .filter((n: any) => n && n.id)
    .slice(0, 80)
    .map((n: any) => ({
      id: n.id,
      key: n.key,
      shapeType: n.attrs?.shapeType,
      x: Math.round(Number(n.x) || 0),
      y: Math.round(Number(n.y) || 0),
      width: Math.round(Number(n.width) || 0),
      height: Math.round(Number(n.height) || 0),
      name: n.attrs?.name,
      fillType: n.attrs?.['fill-type'] || 'solid',
      fill: n.attrs?.['fill-color'],
      strokeStyle: n.attrs?.strokeStyle || 'solid',
      shadow: n.attrs?.['shadow-enabled'] === 'true' || n.attrs?.['shadow-enabled'] === true,
      rotation: Number(n.attrs?.angle) || 0,
      opacity: n.attrs?.opacity != null ? Number(n.attrs.opacity) : undefined,
      blendMode: n.attrs?.blendMode,
    }));
  const target = frameById(doc, targetFrameId);
  return {
    targetFrame: target
      ? {
          id: target.id,
          name: target.name,
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
          hint: 'Place new elements inside this frame using absolute world coordinates (frame.x + localX).',
        }
      : null,
    frames,
    nodeCount: nodes.length,
    nodes,
  };
}

function applyCornerRadius(node: any, r: number) {
  const v = Math.max(0, Math.round(r));
  node.attrs = {
    ...node.attrs,
    radiusTL: v,
    radiusTR: v,
    radiusBR: v,
    radiusBL: v,
    radiusLinked: 'true',
  };
}

function truthy(v: unknown) {
  return v === true || v === 'true';
}

function parseMeshPoints(raw: unknown, size: MeshSize, base: string) {
  if (!Array.isArray(raw) || !raw.length) return createMeshGrid(size, base);
  return raw.map((p: any) => ({
    x: Math.min(100, Math.max(0, Number(p?.x) || 0)),
    y: Math.min(100, Math.max(0, Number(p?.y) || 0)),
    color: String(p?.color || base),
  }));
}

function applyShapeFill(
  node: any,
  args: Record<string, unknown>,
  fallbackFill: string
) {
  const fillType = String(args.fillType || 'solid').toLowerCase();
  const c0 = String(args.fill ?? fallbackFill);
  const c1 = String(args.fillEnd ?? args.fillTo ?? c0);
  const fillOpacity =
    args.fillOpacity != null ? Math.min(100, Math.max(0, num(args.fillOpacity, 100))) : undefined;

  if (fillType === 'image') {
    const src = String(args.fillImageSrc ?? args.imageSrc ?? args.src ?? '').trim();
    if (!src) {
      node.attrs = {
        ...node.attrs,
        'fill-type': 'solid',
        'fill-color': c0,
        'fill-enabled': 'true',
        'fill-visible': 'true',
        ...(fillOpacity != null ? { 'fill-opacity': fillOpacity } : {}),
      };
      return;
    }
    const fit = String(args.fillImageFit || 'fill').toLowerCase();
    node.attrs = {
      ...node.attrs,
      'fill-type': 'image',
      'fill-enabled': 'true',
      'fill-visible': 'true',
      'fill-color': c0,
      'fill-image-src': src,
      'fill-image-fit':
        fit === 'fit' || fit === 'crop' || fit === 'tile' ? fit : 'fill',
      'fill-image-rotate':
        args.fillImageRotate != null ? num(args.fillImageRotate, 0) : 0,
      ...(fillOpacity != null ? { 'fill-opacity': fillOpacity } : {}),
    };
    return;
  }

  if (fillType === 'diffuse') {
    const meshSize = Math.min(8, Math.max(3, Math.round(num(args.meshSize, 4)))) as MeshSize;
    const meshPoints = parseMeshPoints(args.meshPoints, meshSize, c0);
    node.attrs = {
      ...node.attrs,
      'fill-type': 'diffuse',
      'fill-enabled': 'true',
      'fill-visible': 'true',
      'fill-color': c0,
      'fill-gradient': serializeFillGradient({
        type: 'diffuse',
        meshSize,
        meshPoints,
        colorStops: [
          { offset: 0, color: meshPoints[0]?.color || c0 },
          { offset: 1, color: meshPoints[meshPoints.length - 1]?.color || c1 },
        ],
      }),
      ...(fillOpacity != null ? { 'fill-opacity': fillOpacity } : {}),
    };
    return;
  }

  if (fillType === 'linear' || fillType === 'radial' || fillType === 'angular') {
    const angle = num(args.gradientAngle ?? args.angle, fillType === 'angular' ? 0 : 90);
    node.attrs = {
      ...node.attrs,
      'fill-type': fillType,
      'fill-enabled': 'true',
      'fill-visible': 'true',
      'fill-color': c0,
      'fill-gradient': serializeFillGradient({
        type: fillType as 'linear' | 'radial' | 'angular',
        angle,
        cx: 50,
        cy: 50,
        r: 70,
        colorStops: [
          { offset: 0, color: c0 },
          { offset: 1, color: c1 },
        ],
      }),
      ...(fillOpacity != null ? { 'fill-opacity': fillOpacity } : {}),
    };
    return;
  }

  node.attrs = {
    ...node.attrs,
    'fill-type': 'solid',
    'fill-color': c0,
    'fill-enabled': 'true',
    'fill-visible': 'true',
    ...(fillOpacity != null ? { 'fill-opacity': fillOpacity } : {}),
  };
}

/** Stroke dash / align / cap / join / opacity / side strokes. */
function applyStrokeExtras(node: any, args: Record<string, unknown>) {
  const attrs: Record<string, unknown> = { ...(node.attrs || {}) };
  if (args.strokeStyle != null && isStrokeStyle(String(args.strokeStyle))) {
    attrs.strokeStyle = String(args.strokeStyle);
  }
  if (args.strokeAlign != null) {
    const v = String(args.strokeAlign);
    if (v === 'center' || v === 'inside' || v === 'outside') {
      attrs.strokeAlign = v;
      attrs['stroke-align'] = v;
    }
  }
  if (args.strokeLinecap != null) {
    const v = String(args.strokeLinecap);
    if (v === 'butt' || v === 'round' || v === 'square') {
      attrs.strokeLinecap = v;
      attrs['stroke-linecap'] = v;
    }
  }
  if (args.strokeLinejoin != null) {
    const v = String(args.strokeLinejoin);
    if (v === 'miter' || v === 'round' || v === 'bevel') {
      attrs.strokeLinejoin = v;
      attrs['stroke-linejoin'] = v;
    }
  }
  if (args.strokeOpacity != null) {
    attrs['stroke-opacity'] = Math.min(100, Math.max(0, num(args.strokeOpacity, 100)));
  }
  const sides = args.strokeSides;
  if (sides && typeof sides === 'object' && !Array.isArray(sides)) {
    const s = sides as Record<string, unknown>;
    for (const key of ['T', 'R', 'B', 'L'] as const) {
      if (s[key] != null) attrs[key] = truthy(s[key]) ? 'true' : 'false';
    }
  } else {
    for (const key of ['strokeTop', 'strokeRight', 'strokeBottom', 'strokeLeft'] as const) {
      if (args[key] == null) continue;
      const map = {
        strokeTop: 'T',
        strokeRight: 'R',
        strokeBottom: 'B',
        strokeLeft: 'L',
      } as const;
      attrs[map[key]] = truthy(args[key]) ? 'true' : 'false';
    }
  }
  node.attrs = attrs;
}

function applyShadow(node: any, args: Record<string, unknown>) {
  const attrs: Record<string, unknown> = { ...(node.attrs || {}) };
  if (args.shadowEnabled != null) {
    attrs['shadow-enabled'] = truthy(args.shadowEnabled) ? 'true' : 'false';
  }
  if (args.shadowVisible != null) {
    attrs['shadow-visible'] = truthy(args.shadowVisible) ? 'true' : 'false';
  }
  if (args.shadowColor != null) attrs['shadow-color'] = String(args.shadowColor);
  if (args.shadowBlur != null) attrs['shadow-blur'] = Math.max(0, num(args.shadowBlur, 4));
  if (args.shadowX != null) attrs['shadow-x'] = num(args.shadowX, 0);
  if (args.shadowY != null) attrs['shadow-y'] = num(args.shadowY, 2);
  // Convenience: any shadow-* field implies enable unless explicitly disabled.
  if (
    attrs['shadow-enabled'] == null &&
    (args.shadowColor != null ||
      args.shadowBlur != null ||
      args.shadowX != null ||
      args.shadowY != null)
  ) {
    attrs['shadow-enabled'] = 'true';
    attrs['shadow-visible'] = 'true';
  }
  node.attrs = attrs;
}

function applyCornerRadii(node: any, args: Record<string, unknown>) {
  if (args.cornerRadius != null) {
    applyCornerRadius(node, num(args.cornerRadius));
    return;
  }
  const has =
    args.radiusTL != null ||
    args.radiusTR != null ||
    args.radiusBR != null ||
    args.radiusBL != null;
  if (!has) return;
  const attrs: Record<string, unknown> = { ...(node.attrs || {}) };
  if (args.radiusTL != null) attrs.radiusTL = Math.max(0, Math.round(num(args.radiusTL)));
  if (args.radiusTR != null) attrs.radiusTR = Math.max(0, Math.round(num(args.radiusTR)));
  if (args.radiusBR != null) attrs.radiusBR = Math.max(0, Math.round(num(args.radiusBR)));
  if (args.radiusBL != null) attrs.radiusBL = Math.max(0, Math.round(num(args.radiusBL)));
  attrs.radiusLinked = 'false';
  node.attrs = attrs;
}

type AgentNodeBox = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  shapeType: string;
  fill: string;
  stroke: string;
  borderWidth: number;
  path?: string;
  angle?: number;
  sides?: number;
};

function readAgentBoxes(doc: any, nodeIds: string[]): AgentNodeBox[] {
  return nodeIds
    .map((id) => {
      const node = doc?.deltaSetLike?.[id];
      if (!node) return null;
      const { left, top } = nodeLeftTop(doc, node);
      const pathRaw = node.attrs?.path != null ? String(node.attrs.path) : '';
      const angle = Number(node.attrs?.angle ?? 0) || 0;
      const sidesRaw = Number(node.attrs?.sides);
      return {
        id,
        left,
        top,
        width: Math.max(1, Number(node.width) || 1),
        height: Math.max(1, Number(node.height) || 1),
        shapeType: String(
          node.attrs?.shapeType || (node.key === 'shape' ? 'rect' : node.key || '')
        ),
        fill: String(node.attrs?.['fill-color'] || '#FFFFFF'),
        stroke: String(node.attrs?.['border-color'] || '#333333'),
        borderWidth: Number(node.attrs?.['border-width'] ?? 1) || 1,
        path: pathRaw || undefined,
        angle,
        sides: Number.isFinite(sidesRaw) ? sidesRaw : undefined,
      };
    })
    .filter(Boolean) as AgentNodeBox[];
}

function parseNodeIds(args: Record<string, unknown>): string[] {
  if (!Array.isArray(args.nodeIds)) return [];
  return [...new Set(args.nodeIds.map((x) => String(x)).filter(Boolean))];
}

/** Keep new nodes inside the target artboard (models often place outside). */
function normalizeLocalGeom(
  fw: number,
  fh: number,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number; scale: number } {
  let nx = x;
  let ny = y;
  let nw = Math.max(1, width);
  let nh = Math.max(1, height);
  let scale = 1;

  // Normalized 0..1 coords (model forgot × TARGET_CANVAS).
  const looksFrac =
    nx >= 0 &&
    ny >= 0 &&
    nw > 0 &&
    nh > 0 &&
    nx <= 1.01 &&
    ny <= 1.01 &&
    nw <= 1.01 &&
    nh <= 1.01 &&
    (nw < 0.999 || nh < 0.999 || (nx > 0 && nx < 1) || (ny > 0 && ny < 1));
  if (looksFrac) {
    nx = Math.round(nx * fw);
    ny = Math.round(ny * fh);
    nw = Math.max(1, Math.round(nw * fw));
    nh = Math.max(1, Math.round(nh * fh));
  }

  // Poster-scale layout on a small board (e.g. 1080×1920 ops → 390×844).
  const layoutW = Math.max(nx + nw, nw);
  const layoutH = Math.max(ny + nh, nh);
  if (layoutW > fw * 1.45 && layoutW >= 640) {
    scale = fw / layoutW;
    nx = Math.round(nx * scale);
    ny = Math.round(ny * scale);
    nw = Math.max(1, Math.round(nw * scale));
    nh = Math.max(1, Math.round(nh * scale));
  } else if (layoutH > fh * 1.45 && layoutH >= 1000 && layoutW > fw * 1.1) {
    scale = Math.min(fw / layoutW, fh / layoutH);
    if (scale < 0.95) {
      nx = Math.round(nx * scale);
      ny = Math.round(ny * scale);
      nw = Math.max(1, Math.round(nw * scale));
      nh = Math.max(1, Math.round(nh * scale));
    } else {
      scale = 1;
    }
  }

  return { x: nx, y: ny, width: nw, height: nh, scale };
}

function fitIntoFrame(
  frame: ArtboardFrame | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number
): {
  x: number;
  y: number;
  width: number;
  height: number;
  clamped: boolean;
  outside: boolean;
  scale: number;
} {
  if (!frame) {
    return {
      x,
      y,
      width: Math.max(1, width),
      height: Math.max(1, height),
      clamped: false,
      outside: false,
      scale: 1,
    };
  }
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const fw = Math.max(1, Number(frame.width) || 1);
  const fh = Math.max(1, Number(frame.height) || 1);
  const norm = normalizeLocalGeom(fw, fh, x, y, width, height);
  const w = Math.max(1, Math.min(norm.width, fw));
  const h = Math.max(1, Math.min(norm.height, fh));
  // If model passed local coords (0..size) while frame is offset, promote to world.
  let wx = norm.x;
  let wy = norm.y;
  if (norm.x >= 0 && norm.x <= fw && norm.y >= 0 && norm.y <= fh && (fx !== 0 || fy !== 0)) {
    wx = fx + norm.x;
    wy = fy + norm.y;
  }
  const maxX = fx + fw - w;
  const maxY = fy + fh - h;
  const nx = Math.min(Math.max(wx, fx), Math.max(fx, maxX));
  const ny = Math.min(Math.max(wy, fy), Math.max(fy, maxY));
  const sizeClamped = w !== Math.max(1, norm.width) || h !== Math.max(1, norm.height);
  const posClamped = nx !== wx || ny !== wy;
  return {
    x: nx,
    y: ny,
    width: w,
    height: h,
    clamped: sizeClamped || posClamped || norm.scale < 0.999,
    outside: false,
    scale: norm.scale,
  };
}

/** Place size at frame center (world coords), or a small inset when no frame. */
function centerInFrame(
  frame: ArtboardFrame | null | undefined,
  width: number,
  height: number
): { x: number; y: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (!frame) return { x: 40, y: 40 };
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const fw = Math.max(1, Number(frame.width) || 1);
  const fh = Math.max(1, Number(frame.height) || 1);
  return {
    x: Math.round(fx + Math.max(0, (fw - w) / 2)),
    y: Math.round(fy + Math.max(0, (fh - h) / 2)),
  };
}

/** Resolve create_* origin: omitted or LLM-default (0,0) → frame center; full-bleed keeps 0,0. */
function resolveCreateXY(
  args: Record<string, unknown>,
  frame: ArtboardFrame | null | undefined,
  width: number,
  height: number
): { x: number; y: number } {
  const hasX = args.x != null && Number.isFinite(Number(args.x));
  const hasY = args.y != null && Number.isFinite(Number(args.y));
  const x = hasX ? num(args.x) : NaN;
  const y = hasY ? num(args.y) : NaN;
  const fw = Math.max(1, Number(frame?.width) || 1);
  const fh = Math.max(1, Number(frame?.height) || 1);
  const fullBleed =
    width >= fw * 0.9 && height >= fh * 0.9;
  // Models often emit x:0,y:0 meaning "default" — center unless this is a full-bleed fill.
  const looksUnset =
    (!hasX && !hasY) ||
    (hasX && hasY && x === 0 && y === 0 && !fullBleed);
  if (looksUnset) return centerInFrame(frame, width, height);
  return {
    x: hasX ? x : centerInFrame(frame, width, height).x,
    y: hasY ? y : centerInFrame(frame, width, height).y,
  };
}

const FRAME_GAP = 80;
const NODE_GAP = 12;

type WorldRect = { x: number; y: number; width: number; height: number; id?: string };

function frameRectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  gap = 1
): boolean {
  return (
    ax < bx + bw + gap &&
    ax + aw + gap > bx &&
    ay < by + bh + gap &&
    ay + ah + gap > by
  );
}

function rectHitsAny(
  x: number,
  y: number,
  w: number,
  h: number,
  obstacles: WorldRect[],
  gap: number
): boolean {
  return obstacles.some((o) =>
    frameRectsOverlap(x, y, w, h, o.x, o.y, o.width, o.height, gap)
  );
}

function collectFrameObstacles(doc: any): WorldRect[] {
  return listFrames(doc).map((f) => ({
    id: f.id,
    x: Math.round(Number(f.x) || 0),
    y: Math.round(Number(f.y) || 0),
    width: Math.max(1, Math.round(Number(f.width) || 1)),
    height: Math.max(1, Math.round(Number(f.height) || 1)),
  }));
}

function collectNodeObstacles(
  doc: any,
  opts?: { frame?: ArtboardFrame | null; excludeIds?: Set<string> }
): WorldRect[] {
  const rootChildren: string[] = Array.isArray(doc?.deltaSetLike?.ROOT?.children)
    ? doc.deltaSetLike.ROOT.children
    : Object.keys(doc?.deltaSetLike || {}).filter((id) => id && id !== 'ROOT');
  const frame = opts?.frame;
  const fx = frame ? Number(frame.x) || 0 : 0;
  const fy = frame ? Number(frame.y) || 0 : 0;
  const fw = frame ? Math.max(1, Number(frame.width) || 1) : 0;
  const fh = frame ? Math.max(1, Number(frame.height) || 1) : 0;
  const out: WorldRect[] = [];
  for (const id of rootChildren) {
    if (!id || opts?.excludeIds?.has(id)) continue;
    const node = doc?.deltaSetLike?.[id];
    if (!node) continue;
    const { left, top } = nodeLeftTop(doc, node);
    const nw = Math.max(1, Math.round(Number(node.width) || 1));
    const nh = Math.max(1, Math.round(Number(node.height) || 1));
    if (frame) {
      const ow = Math.max(0, Math.min(left + nw, fx + fw) - Math.max(left, fx));
      const oh = Math.max(0, Math.min(top + nh, fy + fh) - Math.max(top, fy));
      if (ow * oh < nw * nh * 0.2) continue;
    }
    out.push({
      id: String(id),
      x: Math.round(left),
      y: Math.round(top),
      width: nw,
      height: nh,
    });
  }
  return out;
}

/** Scan for free top-left; prefers `prefer` when free. */
function findFreeOrigin(opts: {
  width: number;
  height: number;
  obstacles: WorldRect[];
  prefer?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  gap?: number;
  step?: number;
}): { x: number; y: number } | null {
  const w = Math.max(1, Math.round(opts.width));
  const h = Math.max(1, Math.round(opts.height));
  const gap = opts.gap ?? NODE_GAP;
  const step = Math.max(8, opts.step ?? Math.max(24, Math.round(Math.min(w, h) / 2)));
  const obstacles = opts.obstacles;
  const prefer = opts.prefer
    ? { x: Math.round(opts.prefer.x), y: Math.round(opts.prefer.y) }
    : null;

  const inBounds = (x: number, y: number) => {
    if (!opts.bounds) return true;
    const b = opts.bounds;
    return (
      x >= b.x - 0.5 &&
      y >= b.y - 0.5 &&
      x + w <= b.x + b.width + 0.5 &&
      y + h <= b.y + b.height + 0.5
    );
  };

  if (
    prefer &&
    inBounds(prefer.x, prefer.y) &&
    !rectHitsAny(prefer.x, prefer.y, w, h, obstacles, gap)
  ) {
    return prefer;
  }

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  if (opts.bounds) {
    minX = Math.round(opts.bounds.x);
    minY = Math.round(opts.bounds.y);
    maxX = Math.round(opts.bounds.x + opts.bounds.width - w);
    maxY = Math.round(opts.bounds.y + opts.bounds.height - h);
  } else {
    let maxRight = 0;
    let maxBottom = 0;
    for (const o of obstacles) {
      maxRight = Math.max(maxRight, o.x + o.width);
      maxBottom = Math.max(maxBottom, o.y + o.height);
    }
    minX = prefer?.x ?? (obstacles.length ? Math.round(maxRight + gap) : 0);
    minY = prefer?.y ?? 0;
    maxX = Math.round(maxRight + gap + w * 6 + 400);
    maxY = Math.round(maxBottom + gap + h * 4 + 400);
  }
  if (maxX < minX || maxY < minY) return null;

  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      if (!inBounds(x, y)) continue;
      if (!rectHitsAny(x, y, w, h, obstacles, gap)) return { x, y };
    }
  }
  if (prefer) {
    const fine = Math.max(4, Math.round(step / 2));
    const x0 = Math.max(minX, prefer.x - step * 2);
    const y0 = Math.max(minY, prefer.y - step * 2);
    const x1 = Math.min(maxX, prefer.x + step * 4);
    const y1 = Math.min(maxY, prefer.y + step * 4);
    for (let y = y0; y <= y1; y += fine) {
      for (let x = x0; x <= x1; x += fine) {
        if (!inBounds(x, y)) continue;
        if (!rectHitsAny(x, y, w, h, obstacles, gap)) return { x, y };
      }
    }
  }
  return null;
}

/** Place a new artboard in empty world space (no overlap with frames or free nodes). */
export function nextArtboardOrigin(
  doc: any,
  width = 390,
  height = 844
): { x: number; y: number } {
  const frames = listFrames(doc);
  const w = Math.max(40, Math.round(Number(width) || 390));
  const h = Math.max(40, Math.round(Number(height) || 844));
  const nodeObs = collectNodeObstacles(doc);
  if (!frames.length && !nodeObs.length) return { x: 0, y: 0 };

  const obstacles = [...collectFrameObstacles(doc), ...nodeObs];
  let maxRight = 0;
  let anchorY = 0;
  for (const f of frames) {
    const right = Number(f.x || 0) + Number(f.width || 0);
    if (right >= maxRight) {
      maxRight = right;
      anchorY = Math.round(Number(f.y) || 0);
    }
  }
  for (const o of obstacles) {
    maxRight = Math.max(maxRight, o.x + o.width);
  }

  const prefer = {
    x: Math.round((frames.length ? maxRight : 0) + (frames.length ? FRAME_GAP : 0)),
    y: anchorY,
  };
  const slot = findFreeOrigin({
    width: w,
    height: h,
    obstacles,
    prefer,
    gap: FRAME_GAP,
    step: Math.max(40, Math.round(FRAME_GAP / 2)),
  });
  if (slot) return slot;

  let maxBottom = 0;
  for (const o of obstacles) {
    maxBottom = Math.max(maxBottom, o.y + o.height);
  }
  return { x: 0, y: Math.round(maxBottom + FRAME_GAP) };
}

function execCreateShape(
  args: Record<string, unknown>,
  ctx: DesignToolContext,
  doc: any,
  pushHistory: () => void
): AgentToolResult {

  const shapeType = String(args.shapeType || args.type || 'rect');
  const mapped =
    shapeType === 'ellipse' ? 'circle' : shapeType === 'pen' ? 'pen' : shapeType;
  const width = Math.max(1, num(args.width, 120));
  const height = Math.max(1, num(args.height, 80));
  const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
  const svgRaw = args.svg != null ? String(args.svg) : args.iconSvg != null ? String(args.iconSvg) : '';
  // Icon SVG → native svg node (not image, not path conversion).
  if (svgRaw.trim() || mapped === 'svg') {
    if (!svgRaw.trim()) {
      return {
        status: 'error',
        summary: 'create_shape type=svg requires args.svg markup.',
        next_actions: ['Pass args.svg', 'or use create_svg'],
      };
    }
    const origin = resolveCreateXY(args, target, width, height);
    const placed = fitIntoFrame(target, origin.x, origin.y, width, height);
    const fill = args.fill != null ? String(args.fill) : undefined;
    const { id, node } = createSvgNode({
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
      svg: svgRaw,
      name: String(args.name || 'SVG'),
      fill,
    });
    console.info('[create_shape → svg node]', {
      id,
      placed,
      fill,
      svgHead: svgRaw.slice(0, 160),
    });
    pushHistory();
    ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
    return {
      status: placed.clamped ? 'warning' : 'success',
      summary: `Created svg ${id}`,
      artifacts: { nodeId: id, shapeType: 'svg' },
      next_actions: ['Continue layout or create_text'],
    };
  }
  const path = args.path != null ? String(args.path) : '';
  // Honor model x/y when provided; otherwise center in the target frame.
  const origin = resolveCreateXY(args, target, width, height);
  const placed = fitIntoFrame(target, origin.x, origin.y, width, height);
  if (mapped === 'path' || path) {
    console.info('[create_shape path diag]', {
      source: 'model tool_ops path (pass-through)',
      argsXY: { x: args.x, y: args.y, width: args.width, height: args.height },
      placed: { x: placed.x, y: placed.y, width: placed.width, height: placed.height },
      fill: args.fill,
      pathLen: path.length,
      pathHead: path.slice(0, 180),
      fullPath: path,
    });
  }
  const isFreePath = mapped === 'path';
  const closed = resolvePathClosed({ args, mapped, path });
  const isStrokeOnly = mapped === 'line' || mapped === 'arrow' || mapped === 'pencil';
  const fillDefault = String(
    args.fill ?? (isStrokeOnly || (isFreePath && !closed) ? 'transparent' : '#FFFFFF')
  );
  const fillIsNone =
    !fillDefault ||
    fillDefault === 'transparent' ||
    fillDefault === 'none' ||
    fillDefault === 'rgba(0,0,0,0)';
  // Free paths (SVG → path): never invent a border/fill — honor args as-is.
  // Pen/pencil/line still need a visible stroke when the model omits one.
  const needsDefaultStroke =
    !isFreePath &&
    (isStrokeOnly || mapped === 'pen' || mapped === 'pencil' || fillIsNone);
  const strokeRaw =
    args.stroke != null ? String(args.stroke) : needsDefaultStroke ? '#333333' : 'transparent';
  const stroke =
    !strokeRaw || strokeRaw === 'none' || strokeRaw === 'rgba(0,0,0,0)'
      ? 'transparent'
      : strokeRaw;
  const strokeIsNone = stroke === 'transparent';
  const borderWidth = resolveCreateShapeBorderWidth({
    args,
    mapped,
    isFreePath,
    needsDefaultStroke,
    isStrokeOnly,
    strokeIsNone,
  });
  const opacityRaw = args.opacity != null ? num(args.opacity, 1) : 1;
  const opacity = opacityRaw > 1 ? Math.min(1, opacityRaw / 100) : Math.min(1, Math.max(0, opacityRaw));
  const brushStyle = resolvePencilBrushStyle(mapped, args);
  const pathPressure =
    mapped === 'pencil' ? normalizePathPressureArg(args.pathPressure) : undefined;
  const { id, node } = createShapeNode({
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    shapeType: mapped,
    fill: fillDefault,
    stroke,
    borderWidth,
    path: path || undefined,
    closed: mapped === 'pencil' ? false : closed,
    sides: args.sides != null ? num(args.sides, 5) : undefined,
    angle: args.rotation != null ? num(args.rotation) : undefined,
    brushStyle,
    pathPressure,
    opacity,
  });
  applyShapeFill(node, args, fillDefault);
  applyStrokeExtras(node, args);
  applyShadow(node, args);
  if (borderWidth <= 0 || strokeIsNone) {
    node.attrs = {
      ...node.attrs,
      'stroke-enabled': 'false',
      'stroke-visible': 'false',
      'border-width': 0,
    };
  }
  if (fillIsNone) {
    node.attrs = {
      ...node.attrs,
      'fill-enabled': 'false',
      'fill-visible': 'false',
    };
  }
  if (args.name) {
    (node.attrs as Record<string, unknown>).name = String(args.name);
  }
  applyCornerRadii(node, args);
  if (closed) node.attrs = { ...node.attrs, closed: 'true' };
  pushHistory();
  ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
  return {
    status: placed.clamped ? 'warning' : 'success',
    summary: placed.clamped
      ? `Created ${mapped} ${id} (clamped into frame at ${Math.round(placed.x)},${Math.round(placed.y)} ${Math.round(placed.width)}×${Math.round(placed.height)})`
      : `Created ${mapped} ${id}${path ? ' (path)' : ''}`,
    artifacts: { nodeId: id, shapeType: mapped },
    next_actions: ['Continue layout or create_text'],
  };
}

function execCreateText(
  args: Record<string, unknown>,
  ctx: DesignToolContext,
  doc: any,
  pushHistory: () => void
): AgentToolResult {

  const text = String(args.text ?? '');
  const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
  // Fixed width+height = label-in-box (button/chip); do not hug content.
  const boxMode = args.width != null && args.height != null;
  const baseStyle = parseNodeTextStyle({});
  const nextStyle: Record<string, unknown> = { ...baseStyle };
  if (args.fontSize != null) nextStyle.fontSize = num(args.fontSize, 14);
  if (args.color != null) nextStyle.fill = String(args.color);
  if (args.fontWeight != null) nextStyle.fontWeight = String(args.fontWeight);
  if (args.fontFamily != null) nextStyle.fontFamily = String(args.fontFamily);
  if (args.fontStyle != null) nextStyle.fontStyle = String(args.fontStyle);
  if (args.textAlign != null) nextStyle.textAlign = String(args.textAlign);
  else if (boxMode) nextStyle.textAlign = 'center';
  // Hug labels use tight leading; fixed boxes keep 1.4 unless caller sets it.
  if (args.lineHeight != null) nextStyle.lineHeight = num(args.lineHeight, 1.4);
  else if (!boxMode) nextStyle.lineHeight = 1.15;
  if (args.letterSpacing != null) nextStyle.letterSpacing = num(args.letterSpacing, 0);
  if (args.textDecoration != null) {
    nextStyle.textDecoration = String(args.textDecoration);
  }
  const measured = measurePlainTextSize(text || ' ', nextStyle);
  const wantWrap = args.wrap === true || args.wrap === 'true';
  const singleLine = !String(text).includes('\n');
  // Agent often copies full-bleed "width:W-48" for short titles — clamp to ink
  // unless this is an explicit label-in-box or wrap column.
  let boxW: number;
  if (boxMode) {
    boxW = Math.max(1, num(args.width));
  } else if (args.width != null) {
    const asked = Math.max(1, num(args.width));
    if (
      !wantWrap &&
      singleLine &&
      asked > measured.width * 1.35 &&
      measured.width > 0
    ) {
      boxW = measured.width;
    } else {
      boxW = asked;
    }
  } else {
    boxW = measured.width;
  }
  let boxH: number;
  if (args.height != null) {
    boxH = Math.max(1, num(args.height));
  } else if (args.width != null && (wantWrap || boxW === Math.max(1, num(args.width)))) {
    boxH = measureWrappedTextSize(text || ' ', nextStyle, boxW).height;
  } else {
    boxH = measured.height;
  }
  // Labels must sit on top of buttons — never nudge away from overlapping shapes.
  const textOrigin = resolveCreateXY(args, target, boxW, boxH);
  const placed = fitIntoFrame(target, textOrigin.x, textOrigin.y, boxW, boxH);
  if (placed.scale > 0 && placed.scale < 0.999 && nextStyle.fontSize != null) {
    nextStyle.fontSize = Math.max(
      10,
      Math.round(Number(nextStyle.fontSize) * placed.scale)
    );
  }
  const { id, node } = createTextNode({
    x: placed.x,
    y: placed.y,
    text,
    width: placed.width,
    height: placed.height,
    autoSize: !boxMode,
  });
  const shell = {
    attrs: {
      ...buildMarkdownTextAttrs(text, nextStyle),
      autoSize: boxMode ? 'false' : 'true',
      ...(args.name ? { name: String(args.name) } : {}),
    } as Record<string, unknown>,
  };
  applyShadow(shell, args);
  if (args.opacity != null) {
    const o = num(args.opacity, 1);
    shell.attrs.opacity = o > 1 ? Math.min(1, o / 100) : Math.min(1, Math.max(0, o));
  }
  if (args.blendMode != null) shell.attrs.blendMode = String(args.blendMode);
  // shell.attrs is widened for applyShadow; text nodes still require markdown/DATA fields.
  node.attrs = shell.attrs as typeof node.attrs;
  node.width = placed.width;
  node.height = placed.height;
  pushHistory();
  ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
  return {
    status: placed.clamped ? 'warning' : 'success',
    summary: placed.clamped
      ? `Created text ${id} (clamped ${Math.round(placed.width)}×${Math.round(placed.height)} at ${Math.round(placed.x)},${Math.round(placed.y)})`
      : `Created text ${id} (${Math.round(placed.width)}×${Math.round(placed.height)})`,
    artifacts: { nodeId: id },
  };
}

function execUpdateNode(
  args: Record<string, unknown>,
  ctx: DesignToolContext,
  doc: any,
  pushHistory: () => void
): AgentToolResult {

  const nodeId = String(args.nodeId || args.id || '');
  if (!nodeId) return { status: 'error', summary: 'nodeId required' };
  const latest = ctx.getDocument()?.deltaSetLike?.[nodeId];
  if (!latest) return { status: 'error', summary: `Node not found: ${nodeId}` };
  const patch: Record<string, unknown> = {};
  // Inventory uses w/h; update_node contract uses width/height.
  const argWidth = args.width ?? args.w;
  const argHeight = args.height ?? args.h;
  // Faithful apply: geometry / style exactly as backend ops say (no FE policy).
  if (args.x != null && args.y != null) {
    const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
    const w =
      argWidth != null
        ? Math.max(1, num(argWidth))
        : Math.max(1, Number(latest.width) || 1);
    const h =
      argHeight != null
        ? Math.max(1, num(argHeight))
        : Math.max(1, Number(latest.height) || 1);
    const placed = fitIntoFrame(target, num(args.x), num(args.y), w, h);
    patch.x = placed.x;
    patch.y = placed.y;
    if (argWidth != null) patch.width = placed.width;
    if (argHeight != null) patch.height = placed.height;
  } else {
    if (args.x != null) patch.x = num(args.x);
    if (args.y != null) patch.y = num(args.y);
    if (argWidth != null) patch.width = Math.max(1, num(argWidth));
    if (argHeight != null) patch.height = Math.max(1, num(argHeight));
  }

  const shell = { attrs: { ...(latest.attrs || {}) } as Record<string, unknown> };
  const fillRaw = args.fill ?? args.fillColor ?? args.backgroundColor;
  const fillTypeArg =
    args.fillType != null ? String(args.fillType).toLowerCase() : null;
  const fillTouched =
    fillTypeArg != null ||
    fillRaw != null ||
    args.fillEnd != null ||
    args.fillTo != null ||
    args.gradientAngle != null ||
    args.meshSize != null ||
    args.meshPoints != null ||
    args.fillImageSrc != null ||
    args.fillOpacity != null;

  if (fillTouched) {
    applyShapeFill(
      shell,
      {
        ...args,
        fillType: fillTypeArg || args.fillType || 'solid',
        fill: fillRaw ?? shell.attrs['fill-color'] ?? '#FFFFFF',
      },
      String(fillRaw ?? shell.attrs['fill-color'] ?? '#FFFFFF')
    );
  }

  if (args.stroke != null) {
    shell.attrs['border-color'] = String(args.stroke);
    shell.attrs['stroke-enabled'] = 'true';
    shell.attrs['stroke-visible'] = 'true';
  }
  if (args.borderWidth != null) {
    const bw = num(args.borderWidth);
    shell.attrs['border-width'] = bw;
    if (bw <= 0) {
      shell.attrs['stroke-enabled'] = 'false';
      shell.attrs['stroke-visible'] = 'false';
    } else {
      shell.attrs['stroke-enabled'] = 'true';
      shell.attrs['stroke-visible'] = 'true';
    }
  }
  applyStrokeExtras(shell, args);
  applyShadow(shell, args);
  applyCornerRadii(shell, args);

  if (args.opacity != null) {
    const o = num(args.opacity, 1);
    shell.attrs.opacity = o > 1 ? Math.min(1, o / 100) : Math.min(1, Math.max(0, o));
  }
  if (args.rotation != null) shell.attrs.angle = num(args.rotation);
  if (args.flipX != null) shell.attrs.flipX = truthy(args.flipX) ? 'true' : 'false';
  if (args.flipY != null) shell.attrs.flipY = truthy(args.flipY) ? 'true' : 'false';
  if (args.hidden != null) shell.attrs.hidden = truthy(args.hidden) ? 'true' : 'false';
  if (args.locked != null) shell.attrs.locked = truthy(args.locked) ? 'true' : 'false';
  if (args.blendMode != null) shell.attrs.blendMode = String(args.blendMode);
  if (args.path != null) shell.attrs.path = String(args.path);
  if (args.closed != null) shell.attrs.closed = truthy(args.closed) ? 'true' : 'false';
  if (args.name != null) shell.attrs.name = String(args.name);
  // Morph shape in place (rect→circle etc.) — keep id / z-order.
  const shapeTypeRaw = args.shapeType ?? args.type;
  if (shapeTypeRaw != null && String(shapeTypeRaw).trim() && latest.key === 'shape') {
    const st = String(shapeTypeRaw).trim().toLowerCase();
    shell.attrs.shapeType = st === 'ellipse' ? 'circle' : st;
  }
  if (args.sides != null && latest.key === 'shape') {
    shell.attrs.sides = Math.max(3, Math.round(num(args.sides, 5)));
  }
  if (latest.key === 'image' && args.src != null) {
    shell.attrs.src = String(args.src);
  }

  if (latest.key === 'text') {
    const stylePatch: Record<string, unknown> = {};
    if (args.fontSize != null) stylePatch.fontSize = num(args.fontSize);
    if (args.fontWeight != null) stylePatch.fontWeight = String(args.fontWeight);
    if (args.fontFamily != null) stylePatch.fontFamily = String(args.fontFamily);
    if (args.fontStyle != null) stylePatch.fontStyle = String(args.fontStyle);
    if (args.textAlign != null) stylePatch.textAlign = String(args.textAlign);
    if (args.lineHeight != null) stylePatch.lineHeight = num(args.lineHeight, 1.4);
    if (args.letterSpacing != null) stylePatch.letterSpacing = num(args.letterSpacing, 0);
    if (args.textDecoration != null) stylePatch.textDecoration = String(args.textDecoration);
    if (args.color != null && fillRaw == null) {
      shell.attrs['fill-color'] = String(args.color);
      shell.attrs['fill-type'] = 'solid';
      stylePatch.fill = String(args.color);
    }
    if (args.text != null || Object.keys(stylePatch).length) {
      const style = {
        ...parseNodeTextStyle({ ...(latest.attrs || {}), ...shell.attrs }),
        ...stylePatch,
      };
      const nextText =
        args.text != null ? String(args.text) : String(latest.attrs?.text || '');
      Object.assign(shell.attrs, buildMarkdownTextAttrs(nextText, style as any));
      if (argWidth == null || argHeight == null) {
        const measured = measurePlainTextSize(nextText, style as any);
        if (argWidth == null) patch.width = measured.width;
        if (argHeight == null) patch.height = measured.height;
      }
    }
  }

  // Only patch attrs if something style-related changed (diff vs original).
  const styleArgsTouched =
    fillTouched ||
    args.stroke != null ||
    args.borderWidth != null ||
    args.strokeStyle != null ||
    args.strokeAlign != null ||
    args.strokeLinecap != null ||
    args.strokeLinejoin != null ||
    args.strokeOpacity != null ||
    args.strokeSides != null ||
    args.strokeTop != null ||
    args.strokeRight != null ||
    args.strokeBottom != null ||
    args.strokeLeft != null ||
    args.shadowEnabled != null ||
    args.shadowVisible != null ||
    args.shadowColor != null ||
    args.shadowBlur != null ||
    args.shadowX != null ||
    args.shadowY != null ||
    args.cornerRadius != null ||
    args.radiusTL != null ||
    args.radiusTR != null ||
    args.radiusBR != null ||
    args.radiusBL != null ||
    args.opacity != null ||
    args.rotation != null ||
    args.flipX != null ||
    args.flipY != null ||
    args.hidden != null ||
    args.locked != null ||
    args.blendMode != null ||
    args.path != null ||
    args.closed != null ||
    args.name != null ||
    shapeTypeRaw != null ||
    args.sides != null ||
    args.text != null ||
    args.fontSize != null ||
    args.fontWeight != null ||
    args.fontFamily != null ||
    args.fontStyle != null ||
    args.textAlign != null ||
    args.lineHeight != null ||
    args.letterSpacing != null ||
    args.textDecoration != null ||
    args.color != null ||
    (latest.key === 'image' && args.src != null);

  if (styleArgsTouched) patch.attrs = shell.attrs;
  if (!Object.keys(patch).length) {
    return {
      status: 'warning',
      summary: `No updatable fields for ${nodeId}`,
      artifacts: { nodeId },
    };
  }
  ctx.dispatch(patchDocumentNode({ nodeId, patch }));
  return {
    status: 'success',
    summary: `Updated ${nodeId}`,
    artifacts: { nodeId },
  };
}

function execCreateFrame(
  args: Record<string, unknown>,
  ctx: DesignToolContext,
  doc: any,
  pushHistory: () => void
): AgentToolResult {

  const beforeIds = new Set(listFrames(doc).map((f) => f.id));
  const width = Math.max(40, num(args.width, 390));
  const height = Math.max(40, num(args.height, 844));
  const hasExplicitXY = args.x != null || args.y != null;
  let x = num(args.x, 0);
  let y = num(args.y, 0);
  // Default (0,0) on a non-empty doc overlaps the first artboard — shift right.
  if ((!hasExplicitXY || (x === 0 && y === 0)) && listFrames(doc).length > 0) {
    const slot = nextArtboardOrigin(doc, width, height);
    x = slot.x;
    y = slot.y;
  } else if (listFrames(doc).length > 0) {
    const overlaps = listFrames(doc).some((f) =>
      frameRectsOverlap(
        x,
        y,
        width,
        height,
        Number(f.x) || 0,
        Number(f.y) || 0,
        Number(f.width) || 0,
        Number(f.height) || 0
      )
    );
    if (overlaps) {
      const slot = nextArtboardOrigin(doc, width, height);
      x = slot.x;
      y = slot.y;
    }
  }
  // Default white artboard — thematic colors belong in the color phase.
  const backgroundColor =
    args.backgroundColor != null ? String(args.backgroundColor) : '#FFFFFF';
  ctx.dispatch(
    addArtboardFrame({
      name: String(args.name || 'Frame'),
      x,
      y,
      width,
      height,
      backgroundColor,
      // Agent tools never auto-select; user must click the artboard.
      activate: false,
    })
  );
  const frames = listFrames(ctx.getDocument());
  const created =
    frames.find((f) => !beforeIds.has(f.id)) || frames[frames.length - 1] || null;
  if (!created?.id) {
    return {
      status: 'error',
      summary: 'create_frame failed — frame missing from document after dispatch',
      next_actions: ['Retry create_frame', 'get_scene_summary'],
    };
  }
  return {
    status: 'success',
    summary: `Created frame ${created.id} "${created.name}" at (${Math.round(created.x)},${Math.round(created.y)}) ${Math.round(created.width)}×${Math.round(created.height)}`,
    artifacts: {
      frameId: created.id,
      x: created.x,
      y: created.y,
      width: created.width,
      height: created.height,
    },
    next_actions: ['create_shape', 'create_text inside this new frame'],
  };
}

export function executeDesignTool(
  name: string,
  argsRaw: string,
  ctx: DesignToolContext
): AgentToolResult {
  const args = parseArgs(argsRaw);
  const doc = ctx.getDocument();
  if (!doc) {
    return { status: 'error', summary: 'No document open', next_actions: ['Open a project first'] };
  }
  const pushHistory = () => {
    if (!ctx.skipHistory) ctx.dispatch(pushEditorHistory());
  };

  try {
    if (name === 'get_scene_summary') {
      const summary = sceneSummary(doc, ctx.targetFrameId);
      return {
        status: 'success',
        summary: `Scene: ${summary.frames.length} frames, ${summary.nodeCount} nodes`,
        artifacts: summary,
      };
    }

    if (name === 'list_capabilities') {
      const ui = ctx.canvasUi;
      const keys = [...getAllowedCanvasToolKeys()].sort();
      const available = [
        keys.length
          ? `画布 tool_ops（design_canvas_tool）：${keys.join(' / ')}`
          : '画布 tool_ops：尚未从 catalog 同步（Admin 维护 design_canvas_tool）',
        '样式：实色/线性/径向/角度/网格渐变(diffuse)/图片填充、描边虚线、阴影、混合模式、圆角、文字排版',
        ui?.setZoom || ui?.zoomIn
          ? '视口：set_viewport（缩放/适应画布）'
          : null,
        ui?.setCollabMode
          ? 'Agent 模式：set_agent_mode（collaborative|milestone|auto）'
          : null,
        ui?.setLayersOpen || ui?.setMinimapOpen
          ? '面板：toggle_editor_panel（layers|minimap|agent_settings）'
          : null,
      ].filter(Boolean);
      return {
        status: 'success',
        summary: '已列出 Agent 已接入与暂未接入的画布能力',
        artifacts: {
          available,
          tool_ops: keys,
          unavailable: UNAVAILABLE_CAPABILITIES,
          zoom: ui?.getZoom?.() ?? null,
          collabMode: ui?.getCollabMode?.() ?? null,
        },
        next_actions: [
          '对已接入能力直接调用对应工具',
          '对暂未接入能力用中文告知用户，并给出手动操作路径；不要假装已执行',
        ],
      };
    }

    if (name === 'set_viewport') {
      const ui = ctx.canvasUi;
      let action = String(args.action || args.mode || '').toLowerCase();
      if (!action && truthy(args.fit)) action = 'fit';
      if (!action && (args.percent != null || args.zoom != null)) action = 'set';
      if (!ui?.zoomIn && !ui?.setZoom && !ui?.fitView) {
        return {
          status: 'error',
          summary:
            '缩放暂未接入当前会话。请用左下角缩放条手动调节。',
        };
      }
      if (action === 'zoom_in' || action === 'in') {
        ui.zoomIn?.();
        return {
          status: 'success',
          summary: `已放大（当前约 ${Math.round((ui.getZoom?.() || 1) * 100)}%）`,
        };
      }
      if (action === 'zoom_out' || action === 'out') {
        ui.zoomOut?.();
        return {
          status: 'success',
          summary: `已缩小（当前约 ${Math.round((ui.getZoom?.() || 1) * 100)}%）`,
        };
      }
      if (action === 'fit' || action === 'reset' || action === 'fit_view') {
        if (typeof ui.fitView === 'function') ui.fitView();
        else ui.setZoom?.(1);
        return { status: 'success', summary: '已适应/重置画布缩放' };
      }
      if (
        action === 'set' ||
        action === 'percent' ||
        args.percent != null ||
        args.zoom != null
      ) {
        let z = 1;
        if (args.percent != null) z = num(args.percent, 100) / 100;
        else if (args.zoom != null) {
          const raw = num(args.zoom, 1);
          z = raw > 8 ? raw / 100 : raw;
        }
        z = Math.min(8, Math.max(0.05, z));
        if (!ui.setZoom) {
          return {
            status: 'error',
            summary: '当前无法设置精确缩放百分比，请用左下角缩放条。',
          };
        }
        ui.setZoom(z);
        return { status: 'success', summary: `缩放已设为 ${Math.round(z * 100)}%` };
      }
      return {
        status: 'error',
        summary: 'set_viewport 需要 action: zoom_in|zoom_out|fit|set（可配 percent）',
      };
    }

    if (name === 'set_canvas_background') {
      const color = String(args.color ?? args.backgroundColor ?? args.fill ?? '').trim();
      const fillType = String(args.fillType || 'solid').toLowerCase();
      if (!color && fillType === 'solid') {
        return { status: 'error', summary: 'set_canvas_background 需要 color' };
      }
      const allowed = new Set(['solid', 'linear', 'radial', 'angular', 'diffuse', 'image']);
      const meta: Record<string, unknown> = {
        backgroundFillType: allowed.has(fillType) ? fillType : 'solid',
        backgroundColor: color || '#f5f5f5',
        backgroundOpacity: args.opacity != null ? num(args.opacity, 100) : 100,
      };
      if (
        fillType === 'linear' ||
        fillType === 'radial' ||
        fillType === 'angular' ||
        fillType === 'diffuse'
      ) {
        const c0 = color || '#3B82F6';
        const c1 = String(args.fillEnd ?? c0);
        const angle = num(args.gradientAngle, fillType === 'angular' ? 0 : 90);
        if (fillType === 'diffuse') {
          const meshSize = Math.min(8, Math.max(3, Math.round(num(args.meshSize, 4)))) as MeshSize;
          const meshPoints = parseMeshPoints(args.meshPoints, meshSize, c0);
          meta.backgroundGradient = serializeFillGradient({
            type: 'diffuse',
            meshSize,
            meshPoints,
            colorStops: [
              { offset: 0, color: meshPoints[0]?.color || c0 },
              { offset: 1, color: meshPoints[meshPoints.length - 1]?.color || c1 },
            ],
          });
        } else {
          meta.backgroundGradient = serializeFillGradient({
            type: fillType as 'linear' | 'radial' | 'angular',
            angle,
            cx: 50,
            cy: 50,
            r: 70,
            colorStops: [
              { offset: 0, color: c0 },
              { offset: 1, color: c1 },
            ],
          });
        }
      }
      if (fillType === 'image' && args.fillImageSrc != null) {
        meta.backgroundImageSrc = String(args.fillImageSrc);
        meta.backgroundImageFit = String(args.fillImageFit || 'fill');
      }
      ctx.dispatch(setCanvasMeta(meta));
      return {
        status: 'success',
        summary: `画布背景已更新（${fillType}${color ? ` ${color}` : ''}）`,
        artifacts: meta,
      };
    }

    if (name === 'set_agent_mode') {
      const mode = String(args.mode || '').toLowerCase();
      if (!['collaborative', 'milestone', 'auto'].includes(mode)) {
        return {
          status: 'error',
          summary: 'mode 须为 collaborative | milestone | auto（对应协作/里程碑/全自动）',
        };
      }
      if (!ctx.canvasUi?.setCollabMode) {
        return {
          status: 'error',
          summary: 'Agent 模式切换暂未注入。请在输入框左侧切换 Agent / 图片生成。',
        };
      }
      ctx.canvasUi.setCollabMode(mode as 'collaborative' | 'milestone' | 'auto');
      const labels: Record<string, string> = {
        collaborative: '协作（每阶段确认）',
        milestone: '里程碑（关键节点确认）',
        auto: '全自动',
      };
      return {
        status: 'success',
        summary: `Agent 执行模式已设为「${labels[mode]}」`,
        artifacts: { mode },
      };
    }

    if (name === 'toggle_editor_panel') {
      const panel = String(args.panel || args.name || '').toLowerCase();
      const open = args.open == null ? true : args.open === true || args.open === 'true';
      const ui = ctx.canvasUi;
      if (panel === 'layers' || panel === 'layer') {
        if (!ui?.setLayersOpen) {
          return {
            status: 'error',
            summary: '图层面板暂未接入。请点左下角「图层」按钮。',
          };
        }
        ui.setLayersOpen(open);
        return { status: 'success', summary: open ? '已打开图层面板' : '已关闭图层面板' };
      }
      if (panel === 'minimap' || panel === 'map') {
        if (!ui?.setMinimapOpen) {
          return {
            status: 'error',
            summary: '小地图暂未接入。请点左下角「小地图」按钮。',
          };
        }
        ui.setMinimapOpen(open);
        return { status: 'success', summary: open ? '已打开小地图' : '已关闭小地图' };
      }
      if (panel === 'agent_settings' || panel === 'settings' || panel === 'collab') {
        if (ui?.openAccountAgent) {
          ui.openAccountAgent();
          return { status: 'success', summary: '已打开账户页的 Agent 模型设置' };
        }
        return {
          status: 'error',
          summary: '请到「管理账户 → Agent」添加第三方模型。',
        };
      }
      if (
        panel.includes('preview') ||
        panel.includes('预览') ||
        panel.includes('share') ||
        panel.includes('分享')
      ) {
        const hit =
          UNAVAILABLE_CAPABILITIES.find((c) =>
            panel.includes('share') || panel.includes('分享')
              ? c.id === 'share'
              : c.id === 'product_preview'
          ) || UNAVAILABLE_CAPABILITIES[0];
        return { status: 'error', summary: hit.hint };
      }
      if (panel.includes('export') || panel.includes('导出')) {
        return {
          status: 'error',
          summary:
            '导出请用 export_canvas（format=png|jpeg|svg），不是 toggle_editor_panel。',
          next_actions: ['export_canvas'],
        };
      }
      return {
        status: 'error',
        summary: 'panel 支持：layers | minimap | agent_settings。其他请 list_capabilities。',
      };
    }

    if (name === 'ask_user') {
      const question = String(args.question || '').trim();
      if (!question) return { status: 'error', summary: 'question required' };
      const options = Array.isArray(args.options)
        ? args.options
            .map((x) => String(x).trim())
            .filter((x) => Boolean(x) && x !== '取消')
            .slice(0, 6)
        : [];
      return {
        status: 'success',
        summary: question,
        artifacts: { ask: true, options },
        next_actions: options.length ? options : ['等待用户回复'],
      };
    }

    if (name === 'finish') {
      const summary = String(args.summary || '完成');
      return { status: 'success', summary, artifacts: { done: true } };
    }

    // Free-canvas is allowed: create_shape/create_text/create_image work without artboards.
    // When a target frame was requested but is gone, still block so the agent can recover.
    if (
      ctx.targetFrameId &&
      (name === 'create_shape' ||
        name === 'create_text' ||
        name === 'create_image' ||
        name === 'create_svg' ||
        name === 'create_icon')
    ) {
      const target = frameById(doc, ctx.targetFrameId);
      if (!target) {
        return {
          status: 'error',
          summary: `Target frame ${ctx.targetFrameId} not found (deleted?). Call create_frame or ask_user.`,
          next_actions: ['create_frame', 'ask_user', 'get_scene_summary'],
        };
      }
    }

    if (name === 'create_svg' || name === 'create_icon') {
      const width = Math.max(1, num(args.width, 48));
      const height = Math.max(1, num(args.height, 48));
      const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
      const svgRaw = String(args.svg || args.iconSvg || args.content || '').trim();
      if (!svgRaw) {
        return {
          status: 'error',
          summary: `${name} requires args.svg (mini SVG markup).`,
          next_actions: ['Pass args.svg with viewBox 0 0 24 24'],
        };
      }
      const origin = resolveCreateXY(args, target, width, height);
      const placed = fitIntoFrame(target, origin.x, origin.y, width, height);
      const fill = args.fill != null ? String(args.fill) : undefined;
      const { id, node } = createSvgNode({
        x: placed.x,
        y: placed.y,
        width: placed.width,
        height: placed.height,
        svg: svgRaw,
        name: String(args.name || 'SVG'),
        fill,
      });
      console.info('[create_svg]', {
        id,
        placed,
        fill,
        svgHead: svgRaw.slice(0, 160),
        svgLen: svgRaw.length,
      });
      pushHistory();
      ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
      return {
        status: placed.clamped ? 'warning' : 'success',
        summary: `Created svg ${id}`,
        artifacts: { nodeId: id, shapeType: 'svg' },
        next_actions: ['Continue layout'],
      };
    }

    if (name === 'create_shape') {
      return execCreateShape(args, ctx, doc, pushHistory);
    }

    if (name === 'create_image') {
      const width = Math.max(8, num(args.width, 240));
      const height = Math.max(8, num(args.height, 180));
      const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
      const origin = resolveCreateXY(args, target, width, height);
      const placed = fitIntoFrame(target, origin.x, origin.y, width, height);
      const userImages = Array.isArray(ctx.userImages) ? ctx.userImages : [];
      const genPrompt = String(args.genPrompt || args.prompt || '').trim();
      let src = '';
      let sourceKind: 'attachment' | 'src' | 'placeholder' = 'placeholder';
      if (args.attachmentIndex != null) {
        const idx = Math.max(0, Math.floor(num(args.attachmentIndex, 0)));
        src = userImages[idx] || '';
        if (!src) {
          return {
            status: 'error',
            summary: `No user attachment at index ${idx} (have ${userImages.length}). Use placeholder or ask user to attach.`,
            next_actions: ['create_image without attachmentIndex', 'ask_user'],
          };
        }
        sourceKind = 'attachment';
      } else if (args.src != null && String(args.src).trim()) {
        src = String(args.src).trim();
        sourceKind = 'src';
      } else {
        // Backend should have hydrated genPrompt → src via Seedream. If we still
        // land here, show placeholder but keep genPrompt on the node for retry.
        const kind = String(args.placeholder || 'image').toLowerCase();
        src =
          kind === 'avatar'
            ? AVATAR_PLACEHOLDER
            : IMAGE_PLACEHOLDER;
        sourceKind = 'placeholder';
        if (genPrompt) {
          console.warn('[create_image] genPrompt without src — hydrate missed?', {
            genPrompt: genPrompt.slice(0, 120),
            width: placed.width,
            height: placed.height,
          });
        }
      }
      const { id, node } = createImageNode({
        x: placed.x,
        y: placed.y,
        width: placed.width,
        height: placed.height,
        src,
        name: String(args.name || (sourceKind === 'placeholder' ? 'Image Placeholder' : 'Image')),
        assetKind: 'image',
      });
      if (genPrompt && sourceKind === 'placeholder') {
        node.attrs = { ...(node.attrs || {}), genPrompt };
      }
      pushHistory();
      ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
      return {
        status: placed.clamped || (sourceKind === 'placeholder' && Boolean(genPrompt))
          ? 'warning'
          : 'success',
        summary: summarizeCreateImage({
          id,
          sourceKind,
          genPrompt,
          placed,
        }),
        artifacts: { nodeId: id, sourceKind },
        next_actions: ['Continue layout'],
      };
    }

    if (name === 'create_text') {
      return execCreateText(args, ctx, doc, pushHistory);
    }

    if (name === 'update_node') {
      return execUpdateNode(args, ctx, doc, pushHistory);
    }

    if (name === 'align_nodes') {
      const ids = parseNodeIds(args);
      const rawMode = String(args.mode || args.align || '').trim();
      const mode = normalizeAlignMode(rawMode);
      const allowedAlign = new Set([
        'left',
        'centerX',
        'right',
        'top',
        'middle',
        'bottom',
      ]);
      if (ids.length < 2) return { status: 'error', summary: 'align_nodes needs at least 2 nodeIds' };
      if (!allowedAlign.has(mode)) {
        return { status: 'error', summary: `Unknown align mode: ${mode || '(empty)'}` };
      }
      const boxes = readAgentBoxes(doc, ids);
      if (boxes.length < 2) return { status: 'error', summary: 'Could not resolve node boxes' };
      const minL = Math.min(...boxes.map((b) => b.left));
      const maxR = Math.max(...boxes.map((b) => b.left + b.width));
      const minT = Math.min(...boxes.map((b) => b.top));
      const maxB = Math.max(...boxes.map((b) => b.top + b.height));
      const midX = (minL + maxR) / 2;
      const midY = (minT + maxB) / 2;
      pushHistory();
      const alignPatches = boxes.map((b) => {
        const patch: { x?: number; y?: number } = {};
        if (mode === 'left') patch.x = minL;
        else if (mode === 'centerX') patch.x = midX - b.width / 2;
        else if (mode === 'right') patch.x = maxR - b.width;
        else if (mode === 'top') patch.y = minT;
        else if (mode === 'middle') patch.y = midY - b.height / 2;
        else patch.y = maxB - b.height;
        return { nodeId: b.id, patch };
      });
      ctx.dispatch(patchDocumentNodes({ patches: alignPatches, skipHistory: true }));
      return {
        status: 'success',
        summary: `Aligned ${boxes.length} nodes (${mode})`,
        artifacts: { nodeIds: boxes.map((b) => b.id), mode },
      };
    }

    if (name === 'distribute_nodes') {
      const ids = parseNodeIds(args);
      const axisRaw = String(args.axis || 'h').toLowerCase();
      const axis =
        axisRaw === 'v' || axisRaw === 'vertical' || axisRaw === 'y' ? 'v' : 'h';
      if (ids.length < 3) return { status: 'error', summary: 'distribute_nodes needs at least 3 nodeIds' };
      const boxes = readAgentBoxes(doc, ids);
      if (boxes.length < 3) return { status: 'error', summary: 'Could not resolve node boxes' };
      const sorted = [...boxes].sort((a, b) => (axis === 'h' ? a.left - b.left : a.top - b.top));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      pushHistory();
      const distributePatches: Array<{ nodeId: string; patch: { x?: number; y?: number } }> = [];
      if (axis === 'h') {
        const span =
          last.left + last.width - first.left - sorted.reduce((s, b) => s + b.width, 0);
        const gap = span / (sorted.length - 1);
        let x = first.left;
        sorted.forEach((b, i) => {
          if (i === 0) {
            x = b.left + b.width + gap;
            return;
          }
          if (i === sorted.length - 1) return;
          distributePatches.push({ nodeId: b.id, patch: { x } });
          x += b.width + gap;
        });
      } else {
        const span =
          last.top + last.height - first.top - sorted.reduce((s, b) => s + b.height, 0);
        const gap = span / (sorted.length - 1);
        let y = first.top;
        sorted.forEach((b, i) => {
          if (i === 0) {
            y = b.top + b.height + gap;
            return;
          }
          if (i === sorted.length - 1) return;
          distributePatches.push({ nodeId: b.id, patch: { y } });
          y += b.height + gap;
        });
      }
      if (distributePatches.length) {
        ctx.dispatch(patchDocumentNodes({ patches: distributePatches, skipHistory: true }));
      }
      return {
        status: 'success',
        summary: `Distributed ${sorted.length} nodes (${axis})`,
        artifacts: { nodeIds: sorted.map((b) => b.id), axis },
      };
    }

    if (name === 'boolean_op') {
      const ids = parseNodeIds(args);
      const mode = String(args.mode || 'union') as BoolMode;
      if (!['union', 'subtract', 'intersect', 'exclude'].includes(mode)) {
        return { status: 'error', summary: `Unknown boolean mode: ${mode}` };
      }
      if (ids.length < 2) return { status: 'error', summary: 'boolean_op needs at least 2 nodeIds' };
      const boxes = readAgentBoxes(doc, ids).filter((b) =>
        supportsBooleanOp(doc?.deltaSetLike?.[b.id])
      );
      if (boxes.length < 2) {
        return {
          status: 'error',
          summary: 'Need 2+ closed shapes (not line/arrow/pen/pencil/text/image)',
        };
      }
      const { result, usedFallback } = computeShapeBoolean(boxes, mode);
      if (!result) {
        return {
          status: 'error',
          summary: mode === 'intersect' ? 'No overlap for intersect' : 'Boolean operation failed',
        };
      }
      const sample = boxes[0];
      const sampleNode = doc?.deltaSetLike?.[sample.id];
      const { id, node } = createShapeNode({
        x: result.x,
        y: result.y,
        width: result.width,
        height: result.height,
        shapeType: 'path',
        fill: sample.fill,
        stroke: sample.stroke,
        borderWidth: sample.borderWidth,
        path: result.path,
        closed: true,
      });
      const attrs = node.attrs as Record<string, unknown>;
      attrs['fill-rule'] = result.fillRule;
      attrs.closed = 'true';
      applyBooleanResultPaint(
        attrs,
        sampleNode?.attrs as Record<string, unknown> | undefined,
        { stroke: sample.stroke, borderWidth: sample.borderWidth }
      );
      let next = addNodeToDocument(doc, id, node);
      next = removeNodesFromDocument(next, boxes.map((b) => b.id));
      pushHistory();
      ctx.dispatch(setDocument(next));
      return {
        status: usedFallback ? 'warning' : 'success',
        summary: usedFallback
          ? `Boolean ${mode} → ${id} (bbox fallback)`
          : `Boolean ${mode} → ${id}`,
        artifacts: { nodeId: id, mode, removed: boxes.map((b) => b.id) },
      };
    }

    if (name === 'reorder_nodes') {
      const ids = parseNodeIds(args);
      const raw = String(args.action || args.order || '').toLowerCase();
      const actionMap: Record<string, 'front' | 'back' | 'forward' | 'backward'> = {
        front: 'front',
        back: 'back',
        forward: 'forward',
        backward: 'backward',
        bring_to_front: 'front',
        send_to_back: 'back',
        bring_forward: 'forward',
        send_backward: 'backward',
      };
      const action = actionMap[raw];
      if (!ids.length) return { status: 'error', summary: 'nodeIds required' };
      if (!action) {
        return { status: 'error', summary: `Unknown reorder action: ${raw}` };
      }
      pushHistory();
      ctx.dispatch(setDocumentFromCanvas(reorderNodesInDocument(doc, ids, action)));
      return {
        status: 'success',
        summary: `Reordered ${ids.length} node(s) (${action})`,
        artifacts: { nodeIds: ids, action },
      };
    }

    if (name === 'group_nodes') {
      const ids = parseNodeIds(args);
      if (ids.length < 2) return { status: 'error', summary: 'group_nodes needs at least 2 nodeIds' };
      pushHistory();
      ctx.dispatch(setDocument(groupNodesInDocument(doc, ids)));
      return {
        status: 'success',
        summary: `Grouped ${ids.length} nodes`,
        artifacts: { nodeIds: ids },
      };
    }

    if (name === 'ungroup_nodes') {
      const ids = parseNodeIds(args);
      if (!ids.length) return { status: 'error', summary: 'nodeIds required' };
      pushHistory();
      ctx.dispatch(setDocument(ungroupNodesInDocument(doc, ids)));
      return {
        status: 'success',
        summary: `Ungrouped ${ids.length} node(s)`,
        artifacts: { nodeIds: ids },
      };
    }

    if (name === 'duplicate_nodes') {
      const ids = parseNodeIds(args);
      if (!ids.length) return { status: 'error', summary: 'nodeIds required' };
      const ox = num(args.offsetX, 24);
      const oy = num(args.offsetY, 24);
      let next = doc;
      const created: string[] = [];
      pushHistory();
      for (const oldId of ids) {
        const raw = next?.deltaSetLike?.[oldId];
        if (!raw) continue;
        const node = JSON.parse(JSON.stringify(raw));
        const newId = nanoid(10);
        node.id = newId;
        node.x = (Number(node.x) || 0) + ox;
        node.y = (Number(node.y) || 0) + oy;
        if (node.attrs?.groupId) {
          const { groupId: _g, ...rest } = node.attrs;
          node.attrs = rest;
        }
        next = addNodeToDocument(next, newId, node);
        created.push(newId);
      }
      if (!created.length) return { status: 'error', summary: 'No nodes duplicated' };
      ctx.dispatch(setDocument(next));
      return {
        status: 'success',
        summary: `Duplicated ${created.length} node(s)`,
        artifacts: { nodeIds: created },
      };
    }

    if (name === 'flip_nodes') {
      const ids = parseNodeIds(args);
      if (!ids.length) return { status: 'error', summary: 'nodeIds required' };
      const axis = String(args.axis || '').toLowerCase();
      const doX =
        args.flipX === true ||
        args.flipX === 'true' ||
        axis === 'horizontal' ||
        axis === 'h' ||
        axis === 'x';
      const doY =
        args.flipY === true ||
        args.flipY === 'true' ||
        axis === 'vertical' ||
        axis === 'v' ||
        axis === 'y';
      if (!doX && !doY) return { status: 'error', summary: 'Set flipX and/or flipY true' };
      pushHistory();
      const flipPatches: Array<{ nodeId: string; patch: { attrs: Record<string, unknown> } }> = [];
      for (const id of ids) {
        const node = ctx.getDocument()?.deltaSetLike?.[id];
        if (!node) continue;
        const attrs: Record<string, unknown> = {};
        if (doX) {
          const cur = node.attrs?.flipX === true || node.attrs?.flipX === 'true';
          attrs.flipX = cur ? 'false' : 'true';
        }
        if (doY) {
          const cur = node.attrs?.flipY === true || node.attrs?.flipY === 'true';
          attrs.flipY = cur ? 'false' : 'true';
        }
        flipPatches.push({ nodeId: id, patch: { attrs } });
      }
      if (flipPatches.length) {
        ctx.dispatch(patchDocumentNodes({ patches: flipPatches, skipHistory: true }));
      }
      return {
        status: 'success',
        summary: `Flipped ${ids.length} node(s)`,
        artifacts: { nodeIds: ids, flipX: doX, flipY: doY },
      };
    }

    if (name === 'delete_nodes') {
      if (!ctx.allowDestructive) {
        return {
          status: 'error',
          summary:
            'delete_nodes blocked: destructive ops require backend-approved allowDestructive.',
          next_actions: ['create_frame', 'create_shape', 'create_text', 'update_node'],
        };
      }
      const ids = Array.isArray(args.nodeIds)
        ? args.nodeIds.map((x) => String(x)).filter(Boolean)
        : [];
      if (!ids.length) return { status: 'error', summary: 'nodeIds required' };
      const docNow = ctx.getDocument();
      const frameIdSet = new Set(listFrames(docNow).map((f) => String(f.id)));
      const frameIds = ids.filter((id) => frameIdSet.has(id));
      const nodeIds = ids.filter((id) => !frameIdSet.has(id));
      // Models often pass artboard id into delete_nodes — remap to frame delete.
      if (frameIds.length) {
        const childIds = nodeIdsInsideFrameLocal(docNow, frameIds);
        const removeIds = [...new Set([...nodeIds, ...childIds])];
        if (removeIds.length) {
          ctx.dispatch(setDocument(removeNodesFromDocument(ctx.getDocument(), removeIds)));
        }
        ctx.dispatch(removeArtboardFrames(frameIds));
        return {
          status: 'success',
          summary: `Deleted ${frameIds.length} frame(s)` + (removeIds.length ? ` + ${removeIds.length} node(s)` : ''),
          artifacts: { frameIds, nodeIds: removeIds },
        };
      }
      const before = new Set(
        ((docNow?.deltaSetLike?.ROOT?.children as string[]) || []).filter(Boolean)
      );
      const next = removeNodesFromDocument(docNow, nodeIds);
      const after = new Set(
        ((next?.deltaSetLike?.ROOT?.children as string[]) || []).filter(Boolean)
      );
      const removed = nodeIds.filter((id) => before.has(id) && !after.has(id));
      if (!removed.length) {
        return {
          status: 'error',
          summary: 'delete_nodes: no matching scene nodes (use delete_frame for artboards)',
        };
      }
      ctx.dispatch(setDocument(next));
      return {
        status: 'success',
        summary: `Deleted ${removed.length} node(s)`,
        artifacts: { nodeIds: removed },
      };
    }

    if (name === 'delete_frame') {
      if (!ctx.allowDestructive) {
        return {
          status: 'error',
          summary:
            'delete_frame blocked: destructive ops require backend-approved allowDestructive.',
          next_actions: ['delete_nodes', 'update_frame'],
        };
      }
      const fid = resolveFrameOpId(args, ctx);
      if (!fid) return { status: 'error', summary: 'frameId required' };
      const docNow = ctx.getDocument();
      if (!listFrames(docNow).some((f) => String(f.id) === fid)) {
        return { status: 'error', summary: `frame not found: ${fid}` };
      }
      const childIds = nodeIdsInsideFrameLocal(docNow, [fid]);
      if (childIds.length) {
        ctx.dispatch(setDocument(removeNodesFromDocument(ctx.getDocument(), childIds)));
      }
      ctx.dispatch(removeArtboardFrames([fid]));
      return {
        status: 'success',
        summary: `Deleted frame ${fid}`,
        artifacts: { frameId: fid, nodeIds: childIds },
      };
    }

    // Optional: resize target frame
    if (name === 'update_frame') {
      const id = resolveFrameOpId(args, ctx);
      if (!id) return { status: 'error', summary: 'frameId required' };
      const patch: Partial<ArtboardFrame> = {};
      if (args.width != null) patch.width = Math.max(40, num(args.width));
      if (args.height != null) patch.height = Math.max(40, num(args.height));
      if (args.name != null) patch.name = String(args.name);
      if (args.backgroundColor != null) {
        patch.backgroundColor = String(args.backgroundColor || 'transparent');
      }
      if (args.locked != null) patch.locked = truthy(args.locked);
      ctx.dispatch(updateArtboardFrame({ id, patch }));
      return { status: 'success', summary: `Updated frame ${id}`, artifacts: { frameId: id } };
    }

    if (name === 'create_frame') {
      return execCreateFrame(args, ctx, doc, pushHistory);
    }

    if (name === 'image_process') {
      const nodeId = String(args.nodeId || args.id || '').trim();
      const kind = String(args.kind || args.processKind || '').trim();
      const allowed = new Set([
        'upscale',
        'removeBg',
        'eraser',
        'editText',
        'multiAngle',
        'expand',
        'adjust',
        'crop',
        'flipRotate',
        'moveObject',
        'vector',
      ]);
      if (!nodeId) {
        return {
          status: 'error',
          summary: 'image_process requires args.nodeId',
          next_actions: ['Pass image node id'],
        };
      }
      if (!allowed.has(kind)) {
        return {
          status: 'error',
          summary: `image_process unknown kind=${kind || '(empty)'}`,
          next_actions: [`Use kind one of: ${[...allowed].join('|')}`],
        };
      }
      const node = doc.deltaSetLike?.[nodeId];
      if (!node) {
        return {
          status: 'error',
          summary: `image_process: node ${nodeId} not found`,
          next_actions: ['get_scene_summary'],
        };
      }
      const label = String(args.label || kind);
      ctx.dispatch(
        startImageProcess({
          sourceId: nodeId,
          kind,
          label,
          targetWidth:
            args.targetWidth != null ? Number(args.targetWidth) : undefined,
          targetHeight:
            args.targetHeight != null ? Number(args.targetHeight) : undefined,
          meta:
            args.meta && typeof args.meta === 'object'
              ? (args.meta as Record<string, unknown>)
              : undefined,
        })
      );
      return {
        status: 'success',
        summary: `Started image_process ${kind} on ${nodeId}`,
        artifacts: { sourceId: nodeId, kind },
        next_actions: ['Wait for process UI / continue other ops'],
      };
    }

    if (name === 'export_canvas') {
      const formatRaw = String(args.format || 'png').toLowerCase();
      const format = normalizeExportFormat(formatRaw);
      const nodeIds = resolveExportNodeIds(args);
      const multiplier = Math.max(0.25, Math.min(4, Number(args.multiplier) || 1));
      const filename = String(args.filename || 'export').replace(/[^\w\-]+/g, '_');
      const ok = exportFabricImage({
        format,
        multiplier,
        filename,
        selectionOnly: nodeIds.length > 0,
        nodeIds: nodeIds.length ? nodeIds : undefined,
        document: doc,
      });
      if (!ok) {
        return {
          status: 'error',
          summary: 'export_canvas failed to start (empty selection?)',
          next_actions: ['Pass nodeIds or export full board'],
        };
      }
      return {
        status: 'success',
        summary: `Export started (${format}${nodeIds.length ? `, ${nodeIds.length} nodes` : ', full'})`,
        artifacts: { format, nodeIds, multiplier },
      };
    }

    return {
      status: 'error',
      summary: (() => {
        const n = String(name || '').toLowerCase();
        const miss = UNAVAILABLE_CAPABILITIES.find(
          (c) =>
            n.includes(c.id) ||
            n.includes('preview') ||
            n.includes('share') ||
            n.includes('zoom') ||
            n.includes('预览')
        );
        if (miss) return miss.hint;
        return `未知工具: ${name}。请先 list_capabilities；不要假装已执行未接入能力。`;
      })(),
      next_actions: ['list_capabilities', ...DESIGN_TOOL_NAMES.slice(0, 8)],
    };
  } catch (err: any) {
    return {
      status: 'error',
      summary: err?.message || String(err),
      next_actions: ['Fix arguments and retry'],
    };
  }
}
