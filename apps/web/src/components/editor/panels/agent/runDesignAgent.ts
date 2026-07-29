/**
 * Run backend design pipeline and stream progress into the agent UI.
 * Live-draw applies SVG via existing design tools (create_shape / create_text / …)
 * so results land as editable canvas nodes — not a single image blob.
 */

import type { Dispatch } from '@reduxjs/toolkit';
import {
  runDesignJob,
  postDesignSceneFeedback,
  type DesignJobEvent,
  type DesignRunMode,
  type DesignScene,
  type DesignSvgPatch,
  type RunDesignJobBody,
} from '@/apis/design';
import { removeNodesFromDocument, groupNodesInDocument } from '@/components/rcb/scene/sceneDocument';
import { scalePathData } from '@/components/rcb/scene/pathScale';
import { maxRadius, radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import {
  applyClientFrameHints,
  applyMemoryPatch,
  frameIsEmpty,
  type DesignMemoryPayload,
  type MemoryPatch,
  type TaskState,
} from '@/components/editor/panels/agent/agentMemory';
import { executeDesignTool, nextArtboardOrigin, type CanvasUiBridge } from '@/components/editor/panels/agent/designTools';
import {
  dedupeToolOpsById,
  filterAllowedToolOps,
} from '@/components/editor/panels/agent/toolOpsContract';
import {
  cancelImportPlaceholder,
  pushEditorHistory,
  setDocument,
  updateArtboardFrame,
} from '@/store/modules/editor';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import { parseNodeText, parseNodeTextStyle } from '@/components/rcb/scene/sceneText';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SKIP_TAGS = new Set([
  'defs',
  'clippath',
  'mask',
  'pattern',
  'lineargradient',
  'radialgradient',
  'filter',
  'style',
  'script',
  'title',
  'desc',
  'metadata',
  'marker',
  'symbol',
]);

type AskChoiceUi = {
  mode: 'confirm' | 'single' | 'multi' | 'buttons' | 'text';
  options: Array<{ label: string; action: 'apply' | 'reply' | 'dismiss' }>;
  placeholder?: string;
};

function normalizeChoiceUi(raw: unknown): AskChoiceUi | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as {
    mode?: string;
    options?: unknown[];
    placeholder?: string;
    hint?: string;
  };
  let modeRaw = String(obj.mode || '').trim().toLowerCase();
  if (
    modeRaw === 'freeform' ||
    modeRaw === 'free_text' ||
    modeRaw === 'input' ||
    modeRaw === 'textarea'
  ) {
    modeRaw = 'text';
  }
  const mode: AskChoiceUi['mode'] =
    modeRaw === 'confirm' ||
    modeRaw === 'single' ||
    modeRaw === 'multi' ||
    modeRaw === 'buttons' ||
    modeRaw === 'text'
      ? modeRaw
      : 'buttons';
  const options: AskChoiceUi['options'] = [];
  for (const item of obj.options || []) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { label?: string; action?: string };
    let action = String(row.action || 'reply').trim().toLowerCase();
    if (action === 'cancel' || action === 'close') action = 'dismiss';
    if (action === 'ok' || action === 'confirm') action = 'apply';
    if (action !== 'apply' && action !== 'reply' && action !== 'dismiss') {
      action = 'reply';
    }
    const label = String(row.label || '').trim();
    if (!label && action === 'reply') continue;
    options.push({ label, action: action as AskChoiceUi['options'][number]['action'] });
    if (options.length >= 8) break;
  }
  const placeholder = String(obj.placeholder || obj.hint || '').trim() || undefined;
  if (!options.length && mode !== 'text') return undefined;
  return { mode, options, ...(placeholder ? { placeholder } : {}) };
}

function parseSize(canvasSize?: string | null): { width: number; height: number } {
  const raw = String(canvasSize || '390x844')
    .toLowerCase()
    .replace('*', 'x')
    .replace('×', 'x')
    .replace(/\s+/g, '')
    .trim();
  if (raw === 'auto') return { width: 1440, height: 900 };
  const m = raw.match(/^(\d+|auto)x(\d+|auto)$/);
  if (m) {
    const width = m[1] === 'auto' ? 1440 : Math.max(64, Number(m[1]) || 1440);
    const height = m[2] === 'auto' ? 900 : Math.max(64, Number(m[2]) || 900);
    return { width, height };
  }
  const [a, b] = raw.split('x');
  const width = Math.max(64, Number(a) || 390);
  const height = Math.max(64, Number(b) || 844);
  return { width, height };
}

/** Fully resolved WxH only — Auto / partial-auto must not spawn a stock artboard. */
function parseResolvedSize(
  canvasSize?: string | null
): { width: number; height: number } | null {
  const raw = String(canvasSize || '')
    .toLowerCase()
    .replace('*', 'x')
    .replace('×', 'x')
    .replace(/\s+/g, '')
    .trim();
  const m = raw.match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  const width = Math.max(64, Number(m[1]) || 0);
  const height = Math.max(64, Number(m[2]) || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

/** Pick artboard for edit context: @ chip → last agent frame → active → sole frame. */
export function resolveDesignTargetFrame(
  doc: any,
  chipFrameId?: string | null,
  lastAgentFrameId?: string | null
): { id: string; width: number; height: number; x: number; y: number; name?: string } | null {
  const frames = Array.isArray(doc?.frames) ? doc.frames : [];
  if (!frames.length) return null;
  const pick = (id?: string | null) =>
    id ? frames.find((f: any) => f && f.id === id) || null : null;
  const frame =
    pick(chipFrameId) ||
    pick(lastAgentFrameId) ||
    pick(doc?.activeFrameId) ||
    (frames.length === 1 ? frames[0] : null);
  if (!frame?.id) return null;
  return {
    id: String(frame.id),
    width: Math.max(64, Math.round(Number(frame.width) || 390)),
    height: Math.max(64, Math.round(Number(frame.height) || 844)),
    x: Math.round(Number(frame.x) || 0),
    y: Math.round(Number(frame.y) || 0),
    name: frame.name ? String(frame.name) : undefined,
  };
}

/** Scene node ids that mostly overlap a frame. */
export function nodeIdsInsideFrame(doc: any, frameId: string | null | undefined): string[] {
  if (!doc || !frameId) return [];
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const frame = frames.find((f: any) => f?.id === frameId);
  if (!frame) return [];
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const fw = Math.max(1, Number(frame.width) || 1);
  const fh = Math.max(1, Number(frame.height) || 1);
  const rootChildren: string[] = doc?.deltaSetLike?.ROOT?.children || [];
  const out: string[] = [];
  for (const id of rootChildren) {
    const node = doc?.deltaSetLike?.[id];
    if (!node || !id) continue;
    const { left, top } = nodeLeftTop(doc, node);
    const nw = Math.max(1, Number(node.width) || 1);
    const nh = Math.max(1, Number(node.height) || 1);
    const ow = Math.max(0, Math.min(left + nw, fx + fw) - Math.max(left, fx));
    const oh = Math.max(0, Math.min(top + nh, fy + fh) - Math.max(top, fy));
    if (ow * oh >= nw * nh * 0.35) out.push(id);
  }
  return out;
}

/** Frame that mostly contains a node, or null for free-canvas shapes. */
export function frameIdContainingNode(
  doc: any,
  nodeId: string | null | undefined
): string | null {
  if (!doc || !nodeId) return null;
  const node = doc?.deltaSetLike?.[nodeId];
  if (!node) return null;
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  if (!frames.length) return null;
  const { left, top } = nodeLeftTop(doc, node);
  const nw = Math.max(1, Number(node.width) || 1);
  const nh = Math.max(1, Number(node.height) || 1);
  let bestId: string | null = null;
  let bestArea = 0;
  for (const frame of frames) {
    if (!frame?.id) continue;
    const fx = Number(frame.x) || 0;
    const fy = Number(frame.y) || 0;
    const fw = Math.max(1, Number(frame.width) || 1);
    const fh = Math.max(1, Number(frame.height) || 1);
    const ow = Math.max(0, Math.min(left + nw, fx + fw) - Math.max(left, fx));
    const oh = Math.max(0, Math.min(top + nh, fy + fh) - Math.max(top, fy));
    const area = ow * oh;
    if (area > bestArea) {
      bestArea = area;
      bestId = String(frame.id);
    }
  }
  if (!bestId || bestArea < nw * nh * 0.35) return null;
  return bestId;
}

/**
 * Lightweight SVG snapshot of a frame for edit-in-place when the last agent SVG
 * is unavailable (e.g. page refresh). Includes size + visible text + big fills.
 */
export function buildEditContextSvg(doc: any, frameId: string | null | undefined): string {
  if (!doc || !frameId) return '';
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const frame = frames.find((f: any) => f?.id === frameId);
  if (!frame) return '';
  const w = Math.max(64, Math.round(Number(frame.width) || 1080));
  const h = Math.max(64, Math.round(Number(frame.height) || 1920));
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const ids = nodeIdsInsideFrame(doc, frameId);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  let i = 0;
  for (const id of ids) {
    const node = doc?.deltaSetLike?.[id];
    if (!node) continue;
    const { left, top } = nodeLeftTop(doc, node);
    const lx = Math.round(left - fx);
    const ly = Math.round(top - fy);
    const nw = Math.max(1, Math.round(Number(node.width) || 1));
    const nh = Math.max(1, Math.round(Number(node.height) || 1));
    const fill = String(node.attrs?.['fill-color'] || node.attrs?.fill || '').trim();
    const stroke = String(node.attrs?.stroke || node.attrs?.['stroke-color'] || '').trim();
    const key = String(node.key || node.attrs?.shapeType || '').toLowerCase();
    const text = parseNodeText(node.attrs || {}).trim();
    const lid = `layer-${key || 'node'}-${i++}`;
    const pathD = String(node.attrs?.path || node.attrs?.d || '').trim();
    const imgSrc = String(
      node.attrs?.src || node.attrs?.href || node.attrs?.url || ''
    ).trim();
    if (text) {
      const esc = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      parts.push(
        `<text id="${lid}" x="${lx}" y="${ly + Math.min(nh, 48)}" fill="${fill || '#111'}" font-size="${Math.min(nh, 64)}">${esc}</text>`
      );
    } else if (key.includes('image') && imgSrc) {
      const esc = imgSrc
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
      parts.push(
        `<image id="${lid}" x="${lx}" y="${ly}" width="${nw}" height="${nh}" href="${esc}" xlink:href="${esc}" preserveAspectRatio="xMidYMid slice"/>`
      );
    } else if (pathD) {
      const esc = pathD.replace(/"/g, '');
      parts.push(
        `<path id="${lid}" transform="translate(${lx},${ly})" d="${esc}" fill="${fill || 'none'}" stroke="${stroke || 'none'}"/>`
      );
    } else if (key.includes('circle') || key.includes('ellipse')) {
      parts.push(
        `<ellipse id="${lid}" cx="${lx + nw / 2}" cy="${ly + nh / 2}" rx="${nw / 2}" ry="${nh / 2}" fill="${fill || '#ccc'}" stroke="${stroke || 'none'}"/>`
      );
    } else if (fill || stroke) {
      parts.push(
        `<rect id="${lid}" x="${lx}" y="${ly}" width="${nw}" height="${nh}" fill="${fill || 'none'}" stroke="${stroke || 'none'}"/>`
      );
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

export type SceneNodeInventoryItem = {
  id: string;
  type: string;
  frameId?: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Same as w/h — update_node uses width/height. */
  width: number;
  height: number;
  /** Full snapshot for @ edits — model may change any field. */
  fill?: string;
  fillType?: string;
  stroke?: string;
  borderWidth?: number;
  opacity?: number;
  rotation?: number;
  path?: string;
  closed?: boolean;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: string;
  cornerRadius?: number;
  radiusTL?: number;
  radiusTR?: number;
  radiusBR?: number;
  radiusBL?: number;
};

/** Prefer solid fills for inventory (text color + shape fill). */
function nodeFillForInventory(node: any): string {
  const attrs = node?.attrs || {};
  const candidates = [
    attrs['fill-color'],
    attrs.fill,
    attrs.color,
    attrs['font-color'],
    attrs.fontColor,
    attrs.textColor,
  ];
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : '';
    if (s && s !== 'none' && s !== 'transparent' && typeof c !== 'object') return s;
  }
  const grad = attrs.fill;
  if (grad && typeof grad === 'object') {
    const from = String(
      (grad as any).from || (grad as any).color || (grad as any).start || ''
    ).trim();
    if (from && from !== 'none' && from !== 'transparent') return from;
  }
  return '';
}

/** Inventory opacity is 0–100; attrs may store 0–1 or already percent. */
function sceneNodeOpacityPercent(opacityRaw: number): number {
  if (!Number.isFinite(opacityRaw)) return 100;
  if (opacityRaw > 1) return Math.min(100, opacityRaw);
  return Math.round(opacityRaw * 100);
}

/**
 * Parent artboard for tool_ops.
 * Prefer Host-opened / @-pinned board; free-canvas when none.
 */
function resolveToolOpsFrameId(opts: {
  editInPlace: boolean;
  liveFrameId: string | null;
  targetFrameId: string | null | undefined;
  pinnedFrameId?: string | null;
}): string | null {
  const pinned = String(opts.pinnedFrameId || '').trim() || null;
  const target = String(opts.targetFrameId || '').trim() || null;
  return opts.liveFrameId || pinned || target || null;
}

/** Pull WxH from a create_frame op when Host size is still unknown. */
function sizeFromCreateFrameOp(
  ops: Array<{ name?: string; args?: Record<string, unknown> }>
): { width: number; height: number } | null {
  for (const o of ops) {
    if (String(o?.name || '').trim() !== 'create_frame') continue;
    const args = o?.args && typeof o.args === 'object' ? o.args : {};
    const width = Math.round(Number(args.width ?? args.w) || 0);
    const height = Math.round(Number(args.height ?? args.h) || 0);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

/** Full node snapshot for SCENE_NODES (@ targets + edit inventory). No field filtering. */
function nodeToInventoryItem(
  doc: any,
  id: string,
  node: any,
  originX = 0,
  originY = 0,
  frameId?: string | null
): SceneNodeInventoryItem {
  const { left, top } = nodeLeftTop(doc, node);
  const attrs = node?.attrs || {};
  const key = String(node.key || '').toLowerCase();
  const shapeType = String(attrs.shapeType || key || 'shape').toLowerCase();
  const fill = nodeFillForInventory(node);
  const stroke = String(attrs['border-color'] ?? attrs.stroke ?? '').trim();
  const borderRaw = Number(attrs['border-width'] ?? attrs.strokeWidth);
  const opacityRaw = Number(attrs.opacity);
  const angleRaw = Number(attrs.angle ?? attrs.rotation);
  const path = String(attrs.path || attrs.d || '').trim();
  const fillType = String(attrs['fill-type'] || 'solid').trim() || 'solid';
  const w = Math.max(1, Math.round(Number(node.width) || 1));
  const h = Math.max(1, Math.round(Number(node.height) || 1));
  const item: SceneNodeInventoryItem = {
    id: String(id),
    type: key === 'text' ? 'text' : shapeType || key || 'shape',
    ...(frameId ? { frameId: String(frameId) } : {}),
    x: Math.round(left - originX),
    y: Math.round(top - originY),
    w,
    h,
    width: w,
    height: h,
    fill: fill || undefined,
    fillType,
    stroke: stroke && stroke !== 'transparent' && stroke !== 'none' ? stroke : undefined,
    borderWidth: Number.isFinite(borderRaw) && borderRaw >= 0 ? borderRaw : 0,
    opacity: sceneNodeOpacityPercent(opacityRaw),
    rotation: Number.isFinite(angleRaw) ? Math.round(angleRaw * 100) / 100 : 0,
  };
  const name = attrs.name != null ? String(attrs.name).trim() : '';
  if (name) item.name = name;
  if (path) item.path = path;
  if (attrs.closed != null) {
    item.closed = attrs.closed === true || attrs.closed === 'true';
  }
  if (key === 'text') {
    const text = parseNodeText(attrs).trim();
    const style = parseNodeTextStyle(attrs);
    item.text = text.slice(0, 500);
    const fontSizeRaw = Number(style?.fontSize) || Number(attrs.fontSize ?? attrs['font-size']);
    if (Number.isFinite(fontSizeRaw) && fontSizeRaw > 0) item.fontSize = Math.round(fontSizeRaw);
    if (style?.fontWeight) item.fontWeight = String(style.fontWeight);
    if (style?.fontFamily) item.fontFamily = String(style.fontFamily);
    if (style?.textAlign) item.textAlign = String(style.textAlign);
  } else {
    const radii = radiiFromAttrs(attrs);
    item.cornerRadius = Math.round(maxRadius(radii));
    item.radiusTL = Math.round(radii.tl);
    item.radiusTR = Math.round(radii.tr);
    item.radiusBR = Math.round(radii.br);
    item.radiusBL = Math.round(radii.bl);
  }
  return item;
}

/** World-space inventory for free-canvas @ targets (no artboard). */
export function buildSceneNodesForIds(
  doc: any,
  nodeIds: string[]
): SceneNodeInventoryItem[] {
  if (!doc || !nodeIds.length) return [];
  const items: SceneNodeInventoryItem[] = [];
  for (const id of nodeIds) {
    const node = doc?.deltaSetLike?.[id];
    if (!node || !id) continue;
    items.push(nodeToInventoryItem(doc, id, node, 0, 0));
  }
  return items;
}

/** Frame-local node inventory for edit-in-place tool ops (full snapshot per node). */
export function buildSceneNodesForEdit(
  doc: any,
  frameId: string | null | undefined,
  forceIds?: string[] | null
): SceneNodeInventoryItem[] {
  if (!doc || !frameId) return [];
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const frame = frames.find((f: any) => f?.id === frameId);
  if (!frame) return [];
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const forced = new Set(
    (forceIds || []).filter((id) => id && doc?.deltaSetLike?.[id]).map(String)
  );
  const idSet = new Set(nodeIdsInsideFrame(doc, frameId));
  for (const id of forced) idSet.add(id);
  const items: SceneNodeInventoryItem[] = [];
  for (const id of idSet) {
    const node = doc?.deltaSetLike?.[id];
    if (!node) continue;
    items.push(nodeToInventoryItem(doc, id, node, fx, fy, frameId));
  }
  // Always keep @ / live forceIds; fill remaining slots with largest plates.
  const pinned = items.filter((n) => forced.has(n.id));
  const rest = items
    .filter((n) => !forced.has(n.id))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const room = Math.max(0, 60 - pinned.length);
  return [...pinned, ...rest.slice(0, room)];
}

/** All artboards + free-canvas nodes — what the agent actually "sees". */
export function buildSceneNodesForCanvas(
  doc: any,
  opts?: {
    focusFrameId?: string | null;
    forceIds?: string[] | null;
    maxNodes?: number;
  }
): SceneNodeInventoryItem[] {
  if (!doc) return [];
  const maxNodes = Math.max(1, opts?.maxNodes ?? 120);
  const forced = new Set(
    (opts?.forceIds || []).filter((id) => id && doc?.deltaSetLike?.[id]).map(String)
  );
  const focus = String(opts?.focusFrameId || '').trim();
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  const ordered = [...frames].sort((a: any, b: any) => {
    const aid = String(a?.id || '');
    const bid = String(b?.id || '');
    if (aid === focus) return -1;
    if (bid === focus) return 1;
    return (Number(a?.x) || 0) - (Number(b?.x) || 0);
  });

  const byId = new Map<string, SceneNodeInventoryItem>();
  for (const frame of ordered) {
    const fid = frame?.id != null ? String(frame.id) : '';
    if (!fid) continue;
    for (const item of buildSceneNodesForEdit(doc, fid, [...forced])) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  const rootChildren: string[] = doc?.deltaSetLike?.ROOT?.children || [];
  for (const id of rootChildren) {
    const sid = String(id || '');
    if (!sid || byId.has(sid)) continue;
    if (frameIdContainingNode(doc, sid)) continue;
    const node = doc?.deltaSetLike?.[sid];
    if (!node) continue;
    byId.set(sid, nodeToInventoryItem(doc, sid, node, 0, 0));
  }

  const all = [...byId.values()];
  const pinned = all.filter((n) => forced.has(n.id));
  const rest = all
    .filter((n) => !forced.has(n.id))
    .sort((a, b) => {
      const af = a.frameId && a.frameId === focus ? 0 : 1;
      const bf = b.frameId && b.frameId === focus ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.w * b.h - a.w * a.h;
    });
  const room = Math.max(0, maxNodes - pinned.length);
  return [...pinned, ...rest.slice(0, room)];
}

export type SceneFrameSnapshot = {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  is_empty: boolean;
};

/** Artboard list for SCENE_FRAMES — sent with every agent turn. */
export function buildSceneFramesSnapshot(doc: any): SceneFrameSnapshot[] {
  const frames = Array.isArray(doc?.frames) ? doc.frames : [];
  return frames.slice(0, 32).map((f: any) => {
    const id = String(f.id);
    return {
      id,
      name: f.name ? String(f.name) : undefined,
      x: Math.round(Number(f.x) || 0),
      y: Math.round(Number(f.y) || 0),
      w: Math.round(Number(f.width) || 0),
      h: Math.round(Number(f.height) || 0),
      is_empty: frameIsEmpty(doc, id),
    };
  });
}

export type SpatialBox = { x: number; y: number; w: number; h: number };

export type SpatialSummary = {
  focus_frame_id: string | null;
  gap_px: number;
  /** Frame-local boxes for create_* inside the focus artboard. */
  focused: Array<{
    id: string;
    type: string;
    name?: string;
    text?: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
  /** World-space other artboards. */
  peripheral: Array<{
    id: string;
    name?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    child_count: number;
    is_empty: boolean;
  }>;
  overlaps: Array<{ a: string; b: string; iou: number }>;
  /** Frame-local empty slots (create_shape/text/… inside focus). */
  empty_rects: SpatialBox[];
  /** World-space slots for create_frame. */
  new_frame_slots: SpatialBox[];
  /** Frame-local default place for new children. */
  suggested_place: SpatialBox;
};

const SPATIAL_GAP = 40;
const SPATIAL_FOCUSED_MAX = 36;

function _boxIou(a: SpatialBox, b: SpatialBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function _boxesOverlap(a: SpatialBox, b: SpatialBox, gap = 0): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

/** Map-like summary for the agent (focused / peripheral / empty slots). */
export function buildSpatialSummary(
  doc: any,
  opts?: { focusFrameId?: string | null; maxFocused?: number }
): SpatialSummary {
  const gap = SPATIAL_GAP;
  const frames = buildSceneFramesSnapshot(doc);
  const focus =
    String(opts?.focusFrameId || '').trim() ||
    (frames.find((f) => !f.is_empty)?.id ?? frames[0]?.id ?? '') ||
    null;
  const maxFocused = Math.max(8, opts?.maxFocused ?? SPATIAL_FOCUSED_MAX);

  const focusFrame = focus ? frames.find((f) => f.id === focus) : undefined;
  const fw = Math.max(1, focusFrame?.w || 1280);
  const fh = Math.max(1, focusFrame?.h || 720);

  const inventory = buildSceneNodesForCanvas(doc, {
    focusFrameId: focus,
    maxNodes: 120,
  });
  const inFocus = inventory
    .filter((n) => (focus ? n.frameId === focus : !n.frameId))
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, maxFocused)
    .map((n) => ({
      id: n.id,
      type: n.type,
      ...(n.name ? { name: n.name } : {}),
      ...(n.text ? { text: String(n.text).slice(0, 80) } : {}),
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
    }));

  const peripheral = frames
    .filter((f) => f.id !== focus)
    .slice(0, 16)
    .map((f) => ({
      id: f.id,
      ...(f.name ? { name: f.name } : {}),
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      child_count: inventory.filter((n) => n.frameId === f.id).length,
      is_empty: f.is_empty,
    }));

  const overlaps: SpatialSummary['overlaps'] = [];
  for (let i = 0; i < inFocus.length; i++) {
    for (let j = i + 1; j < inFocus.length; j++) {
      const a = inFocus[i];
      const b = inFocus[j];
      const iou = _boxIou(a, b);
      if (iou >= 0.08) overlaps.push({ a: a.id, b: b.id, iou: Math.round(iou * 100) / 100 });
    }
  }
  overlaps.sort((a, b) => b.iou - a.iou);

  const occupied: SpatialBox[] = inFocus.map((n) => ({
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
  }));
  const candidates: SpatialBox[] = [];
  // Right of content / below content / top-left empty.
  let maxR = 0;
  let maxB = 0;
  for (const b of occupied) {
    maxR = Math.max(maxR, b.x + b.w);
    maxB = Math.max(maxB, b.y + b.h);
  }
  if (!occupied.length) {
    // Empty frame: suggest the visible center, not top-left.
    const cw = Math.min(320, Math.max(80, fw - gap * 2));
    const ch = Math.min(200, Math.max(80, fh - gap * 2));
    candidates.push({
      x: Math.round(Math.max(gap, (fw - cw) / 2)),
      y: Math.round(Math.max(gap, (fh - ch) / 2)),
      w: cw,
      h: ch,
    });
  } else {
    candidates.push(
      { x: Math.min(maxR + gap, Math.max(gap, fw - 360)), y: gap, w: 320, h: 200 },
      { x: gap, y: Math.min(maxB + gap, Math.max(gap, fh - 240)), w: 320, h: 200 },
      { x: gap, y: gap, w: 280, h: 160 }
    );
  }

  const empty_rects: SpatialBox[] = [];
  for (const c of candidates.slice(0, 3)) {
    const box = {
      x: Math.round(Math.max(0, c.x)),
      y: Math.round(Math.max(0, c.y)),
      w: Math.max(80, Math.round(c.w)),
      h: Math.max(80, Math.round(c.h)),
    };
    if (occupied.some((o) => _boxesOverlap(box, o, gap))) continue;
    empty_rects.push(box);
    if (empty_rects.length >= 3) break;
  }
  if (!empty_rects.length) {
    empty_rects.push({
      x: Math.round(maxR + gap),
      y: gap,
      w: 320,
      h: 200,
    });
  }

  const new_frame_slots: SpatialBox[] = [];
  if (frames.length) {
    let worldR = 0;
    let worldB = 0;
    for (const f of frames) {
      worldR = Math.max(worldR, f.x + f.w);
      worldB = Math.max(worldB, f.y + f.h);
    }
    new_frame_slots.push({
      x: Math.round(worldR + gap),
      y: Math.round(frames[0]?.y || 0),
      w: Math.round(fw),
      h: Math.round(fh),
    });
    new_frame_slots.push({
      x: Math.round(frames[0]?.x || 0),
      y: Math.round(worldB + gap),
      w: Math.round(fw),
      h: Math.round(fh),
    });
  }

  return {
    focus_frame_id: focus,
    gap_px: gap,
    focused: inFocus,
    peripheral,
    overlaps: overlaps.slice(0, 12),
    empty_rects,
    new_frame_slots,
    suggested_place: empty_rects[0],
  };
}

/**
 * Cheap layout schematic of the focus artboard → JPEG data URL for vision.
 * Not a photoreal export — colored boxes so the model sees denseness / stacking.
 */
export async function captureFocusFramePreview(
  doc: any,
  focusFrameId?: string | null
): Promise<string | null> {
  if (typeof window === 'undefined' || !doc) return null;
  const summary = buildSpatialSummary(doc, { focusFrameId });
  const focus = summary.focus_frame_id;
  if (!focus) return null;
  const frame = (Array.isArray(doc.frames) ? doc.frames : []).find(
    (f: any) => String(f?.id) === focus
  );
  const fw = Math.max(64, Math.round(Number(frame?.width) || 1280));
  const fh = Math.max(64, Math.round(Number(frame?.height) || 720));
  const maxEdge = 768;
  const scale = Math.min(1, maxEdge / Math.max(fw, fh));
  const outW = Math.max(64, Math.round(fw * scale));
  const outH = Math.max(64, Math.round(fh * scale));

  const bg = String(frame?.fill || frame?.background || '#ffffff');
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${fw} ${fh}">`,
    `<rect width="${fw}" height="${fh}" fill="${bg.replace(/"/g, '') || '#fff'}"/>`,
  ];
  for (const n of summary.focused) {
    const fill = n.type === 'text' ? '#94a3b8' : '#cbd5e1';
    parts.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${fill}" fill-opacity="0.55" stroke="#64748b" stroke-width="2"/>`
    );
    const label = (n.name || n.text || n.type || '').slice(0, 24);
    if (label) {
      const esc = label.replace(/[<>&"]/g, '');
      parts.push(
        `<text x="${n.x + 6}" y="${n.y + 18}" font-size="14" fill="#0f172a">${esc}</text>`
      );
    }
  }
  parts.push('</svg>');
  const svg = parts.join('');
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('preview_img_fail'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

export type ToolOpResult = {
  op_id: string;
  name: string;
  ok: boolean;
  error?: string;
};

function applyAgentToolOps(opts: {
  ops: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
  dispatch: Dispatch;
  getDocument: () => any;
  frameId: string | null;
  signal?: AbortSignal;
  /** Prefer update over create when model stacks a new bg plate. */
  sceneNodes?: SceneNodeInventoryItem[] | null;
  userImages?: string[] | null;
  /** Cross-chunk dedupe when SSE replays the same op_id. */
  appliedOpIds?: Set<string>;
  canvasUi?: CanvasUiBridge | null;
}): {
  created: number;
  updated: number;
  deleted: number;
  nodeIds: string[];
  frameId: string | null;
  /** Per-op truth for scene_feedback — backend must not assume success. */
  opResults: ToolOpResult[];
} {
  const { ops, dispatch, getDocument, frameId, signal, userImages, appliedOpIds } =
    opts;
  const toolCtx = {
    dispatch,
    getDocument,
    skipHistory: true as const,
    targetFrameId: frameId as string | null,
    // Backend already emitted these ops after intent — allow delete_nodes if present.
    allowDestructive: true as const,
    userImages: (userImages || []).filter(Boolean),
    canvasUi: opts.canvasUi,
  };
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let outFrameId: string | null = frameId;
  const nodeIds: string[] = [];
  // Backend already normalized / hygiened ops — FE only allowlists + op_id dedupe, then executes.
  const allowed = dedupeToolOpsById(filterAllowedToolOps(ops), appliedOpIds || new Set());
  const rawDeletes = ops.filter((o) =>
    ['delete_frame', 'delete_nodes'].includes(String(o?.name || '').trim())
  );
  if (rawDeletes.length) {
    const allowedDeletes = allowed.filter((o) =>
      ['delete_frame', 'delete_nodes'].includes(String(o?.name || '').trim())
    );
    console.info('[tool_ops delete filter]', {
      raw: rawDeletes.length,
      allowed: allowedDeletes.length,
      dropped: rawDeletes.length - allowedDeletes.length,
      rawOps: rawDeletes,
    });
  }
  const opResults: ToolOpResult[] = [];
  if (!allowed.length) {
    return { created, updated, deleted, nodeIds, frameId: outFrameId, opResults };
  }

  dispatch(pushEditorHistory());
  for (let i = 0; i < allowed.length; i++) {
    if (signal?.aborted) break;
    const op = allowed[i];
    const name = String(op?.name || '').trim();
    if (!name) continue;
    // Host auto-groups once at the end of the run — ignore mid-stream group ops.
    if (name === 'group_nodes' || name === 'ungroup_nodes') continue;
    const opId = String((op as { op_id?: string })?.op_id || '');
    const args = op?.args && typeof op.args === 'object' ? op.args : {};
    if (name === 'create_shape' && (args.path != null || String(args.type || args.shapeType || '') === 'path')) {
      console.info('[tool_ops raw create_shape]', {
        i,
        name,
        type: args.type || args.shapeType,
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
        fill: args.fill,
        stroke: args.stroke,
        path: args.path != null ? String(args.path) : '',
      });
    }
    const res = executeDesignTool(name, JSON.stringify(args), toolCtx);
    if (name === 'create_frame' && res.status !== 'error') {
      const fid = String(res.artifacts?.frameId || '').trim();
      if (fid) {
        outFrameId = fid;
        toolCtx.targetFrameId = fid;
      }
    }
    if (name === 'delete_frame' || name === 'delete_nodes') {
      const docAfter = getDocument();
      const framesAfter = Array.isArray(docAfter?.frames)
        ? docAfter.frames.map((f: { id?: string; name?: string }) => ({
            id: f?.id,
            name: f?.name,
          }))
        : [];
      console.info('[tool_ops delete]', {
        i,
        name,
        args,
        status: res.status,
        summary: res.summary,
        framesAfter,
        artifacts: res.artifacts,
      });
    }
    if (res.status === 'error') {
      console.warn('[tool_ops error]', { i, name, args, summary: res.summary });
      opResults.push({
        op_id: opId,
        name,
        ok: false,
        error: String(res.summary || 'failed').slice(0, 200),
      });
      continue;
    }
    opResults.push({ op_id: opId, name, ok: true });
    if (name === 'update_node') {
      updated += 1;
      const nid = String(args.nodeId || args.id || '');
      if (nid) nodeIds.push(nid);
    } else if (name === 'delete_nodes') {
      deleted += 1;
    } else if (name === 'delete_frame') {
      deleted += 1;
    } else {
      const id = res.artifacts?.nodeId != null ? String(res.artifacts.nodeId) : '';
      if (id) {
        nodeIds.push(id);
        created += 1;
      }
    }
  }
  if (deleted > 0) {
    console.info('[tool_ops delete done]', { deleted, created, updated });
  }
  return { created, updated, deleted, nodeIds, frameId: outFrameId, opResults };
}

/** Show artboard scan/shimmer while the design agent is generating. */
function markArtboardGenerating(
  dispatch: Dispatch,
  frameId: string | null | undefined,
  label = 'Preparing…'
) {
  if (!frameId) return;
  dispatch(
    updateArtboardFrame({
      id: frameId,
      patch: {
        processStatus: 'running' as const,
        processLabel: label,
      },
      skipHistory: true,
    })
  );
}

function ensureFrameSize(opts: {
  dispatch: Dispatch;
  getDocument: () => any;
  frameId: string | null;
  width: number;
  height: number;
  skipHistory?: boolean;
}): string | null {
  const toolCtxBase = {
    dispatch: opts.dispatch,
    getDocument: opts.getDocument,
    skipHistory: opts.skipHistory !== false ? (true as const) : undefined,
  };
  let doc = opts.getDocument();
  if (!doc) return null;
  let frameId = opts.frameId;
  const frames = Array.isArray(doc.frames) ? doc.frames : [];
  if (!frameId || !frames.some((f: any) => f.id === frameId)) {
    const slot = nextArtboardOrigin(doc, opts.width, opts.height);
    const created = executeDesignTool(
      'create_frame',
      JSON.stringify({
        name: 'Design',
        x: slot.x,
        y: slot.y,
        width: opts.width,
        height: opts.height,
        backgroundColor: '#FFFFFF',
      }),
      toolCtxBase
    );
    frameId = String(created.artifacts?.frameId || '') || null;
    if (!frameId) {
      doc = opts.getDocument();
      const nextFrames = Array.isArray(doc?.frames) ? doc.frames : [];
      // Prefer the newest frame — do not fall back to activeFrameId (agent does not activate).
      frameId = nextFrames[nextFrames.length - 1]?.id || null;
    }
    return frameId;
  }
  const frame = frames.find((f: any) => f.id === frameId);
  const fw = Math.round(Number(frame?.width) || 0);
  const fh = Math.round(Number(frame?.height) || 0);
  if (fw !== opts.width || fh !== opts.height) {
    executeDesignTool(
      'update_frame',
      JSON.stringify({ frameId, width: opts.width, height: opts.height }),
      toolCtxBase
    );
  }
  return frameId;
}

function wrapSvgFragment(svg: string, width: number, height: number): string {
  const trimmed = svg.trim();
  if (/^<svg[\s>]/i.test(trimmed)) return trimmed;
  return `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${trimmed}</svg>`;
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const n = Number(el.getAttribute(name));
  return Number.isFinite(n) ? n : fallback;
}

function paintOf(el: Element, prop: 'fill' | 'stroke'): string {
  // Prefer the presentation attribute — computed style invents SVG defaults
  // (fill=black) which then become unwanted solid plates on path import.
  const raw = String(el.getAttribute(prop) || '').trim();
  if (raw === 'none' || raw === 'transparent') return 'transparent';
  if (raw && raw !== 'inherit' && !raw.startsWith('url(')) return raw;
  try {
    const cs = getComputedStyle(el as Element);
    const v = String(cs.getPropertyValue(prop) || '').trim();
    if (!v || v === 'none') return 'transparent';
    // Bare default black fill with no attribute → treat as none for import.
    if (prop === 'fill' && !raw && /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(v)) {
      return 'transparent';
    }
    return v;
  } catch {
    /* ignore */
  }
  return 'transparent';
}

function strokeWidthOf(el: Element): number {
  const strokeAttr = String(el.getAttribute('stroke') || '').trim();
  if (strokeAttr === 'none' || strokeAttr === 'transparent') return 0;
  const attr = el.getAttribute('stroke-width');
  if (attr != null && String(attr).trim() !== '') {
    const n = Number(attr);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  try {
    const cs = getComputedStyle(el as Element);
    const strokeCs = String(cs.getPropertyValue('stroke') || '').trim();
    if (!strokeCs || strokeCs === 'none') return 0;
    const n = parseFloat(cs.strokeWidth || '');
    if (Number.isFinite(n) && n >= 0) return n;
  } catch {
    /* ignore */
  }
  // Explicit stroke color but no width → SVG default 1.
  if (strokeAttr && strokeAttr !== 'none') return 1;
  return 0;
}

function opacityOf(el: Element): number {
  try {
    const cs = getComputedStyle(el as Element);
    const n = parseFloat(cs.opacity || '1');
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch {
    /* ignore */
  }
  const n = Number(el.getAttribute('opacity'));
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

function translatePathData(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d;
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  if (!tokens.length) return d;
  const CMD_ARGS: Record<string, number> = {
    M: 2,
    m: 2,
    L: 2,
    l: 2,
    H: 1,
    h: 1,
    V: 1,
    v: 1,
    C: 6,
    c: 6,
    S: 4,
    s: 4,
    Q: 4,
    q: 4,
    T: 2,
    t: 2,
    A: 7,
    a: 7,
  };
  const out: string[] = [];
  let i = 0;
  const readNum = () => {
    if (i >= tokens.length || /^[a-zA-Z]$/.test(tokens[i])) return null;
    return parseFloat(tokens[i++]);
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    out.push(cmd);
    if (cmd === 'Z' || cmd === 'z') continue;
    const abs = cmd === cmd.toUpperCase();
    if (cmd === 'H' || cmd === 'h') {
      let x = readNum();
      while (x != null) {
        out.push(String(Number((abs ? x + dx : x).toFixed(3))));
        x = readNum();
      }
      continue;
    }
    if (cmd === 'V' || cmd === 'v') {
      let y = readNum();
      while (y != null) {
        out.push(String(Number((abs ? y + dy : y).toFixed(3))));
        y = readNum();
      }
      continue;
    }
    if (cmd === 'A' || cmd === 'a') {
      while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
        const rx = readNum();
        const ry = readNum();
        const rot = readNum();
        const laf = readNum();
        const sf = readNum();
        const x = readNum();
        const y = readNum();
        if (
          rx == null ||
          ry == null ||
          rot == null ||
          laf == null ||
          sf == null ||
          x == null ||
          y == null
        ) {
          break;
        }
        out.push(
          String(rx),
          String(ry),
          String(rot),
          String(laf),
          String(sf),
          String(Number((abs ? x + dx : x).toFixed(3))),
          String(Number((abs ? y + dy : y).toFixed(3)))
        );
      }
      continue;
    }
    const argCount = CMD_ARGS[cmd];
    if (!argCount) continue;
    while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      out.push(
        String(Number((abs ? x + dx : x).toFixed(3))),
        String(Number((abs ? y + dy : y).toFixed(3)))
      );
    }
  }
  return out.join(' ');
}

function matrixRelativeToRoot(el: SVGGraphicsElement, root: SVGSVGElement): DOMMatrix | null {
  try {
    const ctm = el.getCTM();
    const rootCtm = root.getCTM();
    if (!ctm) return null;
    if (!rootCtm) return ctm;
    return rootCtm.inverse().multiply(ctm);
  } catch {
    return null;
  }
}

function localBBox(el: SVGGraphicsElement): { x: number; y: number; width: number; height: number } | null {
  try {
    const bb = el.getBBox();
    return { x: bb.x, y: bb.y, width: Math.max(1, bb.width), height: Math.max(1, bb.height) };
  } catch {
    return null;
  }
}

function mapPoint(m: DOMMatrix, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function decomposeMatrix(m: DOMMatrix) {
  const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const scaleX = Math.hypot(m.a, m.b) || 1;
  const scaleY = Math.hypot(m.c, m.d) || 1;
  return { angle, scaleX, scaleY };
}

function isInsideSkipped(el: Element): boolean {
  let cur: Element | null = el.parentElement;
  while (cur) {
    const tag = cur.tagName.toLowerCase().replace(/^.*:/, '');
    if (SKIP_TAGS.has(tag)) return true;
    if (tag === 'svg') break;
    cur = cur.parentElement;
  }
  return false;
}

type ToolOp = { name: 'create_shape' | 'create_text' | 'create_image'; args: Record<string, unknown> };

function elementToToolOp(el: SVGGraphicsElement, root: SVGSVGElement): ToolOp | null {
  const tag = el.tagName.toLowerCase().replace(/^.*:/, '');
  if (SKIP_TAGS.has(tag) || tag === 'svg' || tag === 'g' || tag === 'use') return null;
  if (isInsideSkipped(el)) return null;
  if (String(el.getAttribute('display') || '') === 'none') return null;
  if (String(el.getAttribute('visibility') || '') === 'hidden') return null;

  const bb = localBBox(el);
  if (!bb) return null;
  const m = matrixRelativeToRoot(el, root);
  const dec = m ? decomposeMatrix(m) : { angle: 0, scaleX: 1, scaleY: 1 };
  const topLeft = m ? mapPoint(m, bb.x, bb.y) : { x: bb.x, y: bb.y };
  // Local to artboard — executeDesignTool.fitIntoFrame promotes to world when frame is offset.
  const x = Math.round(topLeft.x);
  const y = Math.round(topLeft.y);
  const w = Math.max(1, Math.round(bb.width * Math.abs(dec.scaleX)));
  const h = Math.max(1, Math.round(bb.height * Math.abs(dec.scaleY)));
  const rotation = Math.abs(dec.angle) < 0.5 ? undefined : Math.round(dec.angle * 10) / 10;
  const fill = paintOf(el, 'fill');
  const stroke = paintOf(el, 'stroke');
  const borderWidth = strokeWidthOf(el);
  const opacity = opacityOf(el);
  const name = el.getAttribute('id') || undefined;

  if (tag === 'rect') {
    const rx = Math.max(0, numAttr(el, 'rx', numAttr(el, 'ry', 0)) * Math.abs(dec.scaleX));
    return {
      name: 'create_shape',
      args: {
        shapeType: 'rect',
        x,
        y,
        width: w,
        height: h,
        fill,
        stroke: stroke === 'transparent' ? undefined : stroke,
        borderWidth: stroke === 'transparent' ? 0 : borderWidth,
        cornerRadius: rx > 0 ? Math.round(rx) : undefined,
        rotation,
        opacity,
        name: name || '矩形',
      },
    };
  }

  if (tag === 'circle' || tag === 'ellipse') {
    return {
      name: 'create_shape',
      args: {
        shapeType: 'circle',
        x,
        y,
        width: w,
        height: h,
        fill,
        stroke: stroke === 'transparent' ? undefined : stroke,
        borderWidth: stroke === 'transparent' ? 0 : borderWidth,
        rotation,
        opacity,
        name: name || '圆形',
      },
    };
  }

  if (tag === 'line') {
    return {
      name: 'create_shape',
      args: {
        shapeType: 'line',
        x,
        y,
        width: Math.max(w, 1),
        height: Math.max(h, 8),
        stroke: stroke === 'transparent' ? '#333333' : stroke,
        borderWidth: Math.max(1, borderWidth),
        rotation,
        opacity,
        name: name || '直线',
      },
    };
  }

  if (tag === 'path' || tag === 'polygon' || tag === 'polyline') {
    let d = '';
    if (tag === 'path') {
      d = String(el.getAttribute('d') || '').trim();
    } else {
      const pts = String(el.getAttribute('points') || '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (pts.length >= 4) {
        const parts: string[] = [];
        for (let i = 0; i < pts.length; i += 2) {
          parts.push(`${i === 0 ? 'M' : 'L'} ${pts[i]} ${pts[i + 1]}`);
        }
        if (tag === 'polygon') parts.push('Z');
        d = parts.join(' ');
      }
    }
    if (!d) return null;
    let local = translatePathData(d, -bb.x, -bb.y);
    if (Math.abs(dec.scaleX - 1) > 0.01 || Math.abs(dec.scaleY - 1) > 0.01) {
      local = scalePathData(local, Math.abs(dec.scaleX), Math.abs(dec.scaleY));
    }
    const closed = tag === 'polygon' || /\bz\s*$/i.test(d.trim()) || fill !== 'transparent';
    const strokeIsNone = stroke === 'transparent';
    return {
      name: 'create_shape',
      args: {
        shapeType: 'path',
        x,
        y,
        width: w,
        height: h,
        path: local,
        closed,
        fill: closed ? fill : 'transparent',
        // Keep SVG paint as-is — never invent #333 borders for fill-only paths.
        stroke: strokeIsNone ? 'transparent' : stroke,
        borderWidth: strokeIsNone ? 0 : borderWidth,
        rotation,
        opacity,
        name: name || '路径',
      },
    };
  }

  if (tag === 'text') {
    const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    let fontSize = 14;
    let fontFamily = 'Alibaba PuHuiTi';
    let fontWeight = 'normal';
    let textAnchor = 'start';
    try {
      const cs = getComputedStyle(el);
      fontSize = Math.max(8, parseFloat(cs.fontSize) || 14);
      fontFamily =
        String(cs.fontFamily || fontFamily)
          .split(',')[0]
          ?.replace(/['"]/g, '')
          .trim() || fontFamily;
      fontWeight = String(cs.fontWeight || 'normal');
      textAnchor = String(el.getAttribute('text-anchor') || 'start');
    } catch {
      fontSize = Math.max(8, numAttr(el, 'font-size', 14));
    }
    return {
      name: 'create_text',
      args: {
        text,
        x,
        y,
        width: Math.max(w, Math.ceil(fontSize * text.length * 0.6)),
        height: Math.max(h, Math.ceil(fontSize * 1.4)),
        fontSize: Math.round(fontSize * Math.abs(dec.scaleY) * 10) / 10,
        color: fill === 'transparent' ? '#333333' : fill,
        fontFamily,
        fontWeight: /bold|700|800|900/i.test(fontWeight) ? 'bold' : 'normal',
        textAlign: textAnchor === 'middle' ? 'center' : textAnchor === 'end' ? 'right' : 'left',
        name: name || '文字',
      },
    };
  }

  if (tag === 'image') {
    const href =
      el.getAttribute('href') ||
      el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      '';
    if (!href) return null;
    return {
      name: 'create_image',
      args: {
        x,
        y,
        width: w,
        height: h,
        src: href,
        name: name || '图片',
      },
    };
  }

  return null;
}

function designSvgToToolOps(svg: string, size: { width: number; height: number }): ToolOp[] {
  if (typeof document === 'undefined') return [];
  const wrapped = wrapSvgFragment(svg, size.width, size.height);
  const parsed = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) return [];
  const svgEl = parsed.documentElement;
  if (!svgEl || svgEl.tagName.toLowerCase().replace(/^.*:/, '') !== 'svg') return [];

  const host = document.createElement('div');
  host.style.cssText =
    'position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  document.body.appendChild(host);
  host.appendChild(svgEl);

  const root = host.querySelector('svg') as SVGSVGElement | null;
  const out: ToolOp[] = [];
  try {
    if (!root) return out;
    root.querySelectorAll('*').forEach((node) => {
      if (!(node instanceof SVGGraphicsElement)) return;
      const op = elementToToolOp(node, root);
      if (op) out.push(op);
    });
  } finally {
    host.remove();
  }
  return out;
}

export type ApplyDesignSvgResult = {
  frameId: string | null;
  nodeIds: string[];
  nodeId: string | null;
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  fingerprintById: Record<string, string>;
};

function fingerprintsFor(nodeIds: string[], ops: ToolOp[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < nodeIds.length && i < ops.length; i++) {
    map[nodeIds[i]] = opFingerprint(ops[i]);
  }
  return map;
}

const GENERIC_LAYER_NAMES = new Set([
  '矩形',
  '圆形',
  '直线',
  '路径',
  '文字',
  '图片',
  'rect',
  'circle',
  'ellipse',
  'line',
  'path',
  'text',
  'image',
  'Image',
  'Image Placeholder',
  'Icon',
]);

function opFingerprint(op: ToolOp): string {
  return `${op.name}:${JSON.stringify(op.args)}`;
}

function opLayerKey(op: ToolOp): string | null {
  const name = op.args.name != null ? String(op.args.name).trim() : '';
  if (!name || GENERIC_LAYER_NAMES.has(name)) return null;
  return name;
}

function normalizeShapeType(raw: unknown): string {
  const s = String(raw || 'rect').toLowerCase();
  if (s === 'ellipse') return 'circle';
  if (s === 'pen') return 'pen';
  return s;
}

function nodeMatchesOp(node: any, op: ToolOp): boolean {
  if (!node) return false;
  if (op.name === 'create_text') return node.key === 'text';
  if (op.name === 'create_image') return node.key === 'image';
  if (node.key !== 'shape') return false;
  return normalizeShapeType(node.attrs?.shapeType) === normalizeShapeType(op.args.shapeType);
}

/** Align new SVG ops to existing live nodes — prefer stable layer ids, then kind+order. */
function assignOpsToPrevNodes(
  ops: ToolOp[],
  prevIds: string[],
  getDocument: () => any
): { assignment: (string | null)[]; leftoverPrev: string[] } {
  const assignment: (string | null)[] = Array(ops.length).fill(null);
  const used = new Set<string>();
  const doc = getDocument();

  for (let i = 0; i < ops.length; i++) {
    const key = opLayerKey(ops[i]);
    if (!key) continue;
    for (const id of prevIds) {
      if (used.has(id)) continue;
      const node = doc?.deltaSetLike?.[id];
      if (!nodeMatchesOp(node, ops[i])) continue;
      if (String(node?.attrs?.name || '') !== key) continue;
      assignment[i] = id;
      used.add(id);
      break;
    }
  }

  let pi = 0;
  for (let i = 0; i < ops.length; i++) {
    if (assignment[i]) continue;
    while (pi < prevIds.length && used.has(prevIds[pi])) pi += 1;
    while (pi < prevIds.length) {
      const id = prevIds[pi];
      pi += 1;
      if (used.has(id)) continue;
      const node = getDocument()?.deltaSetLike?.[id];
      if (!nodeMatchesOp(node, ops[i])) continue;
      assignment[i] = id;
      used.add(id);
      break;
    }
  }

  const leftoverPrev = prevIds.filter((id) => !used.has(id));
  return { assignment, leftoverPrev };
}

function shouldFullReplace(
  ops: ToolOp[],
  prevIds: string[],
  assignment: (string | null)[]
): boolean {
  if (!prevIds.length) return true;
  const kept = assignment.filter(Boolean).length;
  const denom = Math.max(prevIds.length, ops.length, 1);
  // Structure mostly rewritten — cheaper / safer to recreate once.
  return kept / denom < 0.35 && denom > 3;
}

type ApplyCoreOpts = {
  dispatch: Dispatch;
  getDocument: () => any;
  ops: ToolOp[];
  frameId: string | null;
  prevIds: string[];
  fingerprintById?: Record<string, string> | null;
  forceFullReplace?: boolean;
  delayMs?: number;
  signal?: AbortSignal;
  onProgress?: (info: { done: number; total: number }) => void;
};

async function applyOpsIncremental(opts: ApplyCoreOpts): Promise<ApplyDesignSvgResult> {
  const {
    dispatch,
    getDocument,
    ops,
    frameId,
    prevIds,
    fingerprintById,
    signal,
    onProgress,
  } = opts;
  const delayMs = Math.max(0, opts.delayMs ?? 0);
  const toolCtx = {
    dispatch,
    getDocument,
    skipHistory: true as const,
    targetFrameId: frameId,
  };

  const empty: ApplyDesignSvgResult = {
    frameId,
    nodeIds: prevIds,
    nodeId: prevIds[0] || null,
    created: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    fingerprintById: {},
  };
  if (!ops.length) return empty;

  dispatch(pushEditorHistory());

  const { assignment, leftoverPrev } = assignOpsToPrevNodes(ops, prevIds, getDocument);
  const fullReplace =
    Boolean(opts.forceFullReplace) || shouldFullReplace(ops, prevIds, assignment);

  if (fullReplace) {
    if (prevIds.length) {
      dispatch(setDocument(removeNodesFromDocument(getDocument(), prevIds)));
    }
    const nodeIds: string[] = [];
    for (let i = 0; i < ops.length; i++) {
      if (signal?.aborted) break;
      const res = executeDesignTool(ops[i].name, JSON.stringify(ops[i].args), toolCtx);
      const id = res.artifacts?.nodeId != null ? String(res.artifacts.nodeId) : '';
      if (id) nodeIds.push(id);
      onProgress?.({ done: i + 1, total: ops.length });
      if (delayMs > 0 && i < ops.length - 1) {
        try {
          await sleep(delayMs, signal);
        } catch {
          break;
        }
      }
    }
    return {
      frameId,
      nodeIds,
      nodeId: nodeIds[0] || null,
      created: nodeIds.length,
      updated: 0,
      removed: prevIds.length,
      unchanged: 0,
      fingerprintById: fingerprintsFor(nodeIds, ops),
    };
  }

  if (leftoverPrev.length) {
    dispatch(setDocument(removeNodesFromDocument(getDocument(), leftoverPrev)));
  }

  const nodeIds: string[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const totalWork = ops.length;

  for (let i = 0; i < ops.length; i++) {
    if (signal?.aborted) break;
    const op = ops[i];
    const prevId = assignment[i];
    const fp = opFingerprint(op);
    let mutated = false;

    if (prevId && getDocument()?.deltaSetLike?.[prevId]) {
      if (fingerprintById?.[prevId] === fp) {
        nodeIds.push(prevId);
        unchanged += 1;
      } else {
        executeDesignTool(
          'update_node',
          JSON.stringify({ nodeId: prevId, ...op.args }),
          toolCtx
        );
        nodeIds.push(prevId);
        updated += 1;
        mutated = true;
      }
    } else {
      const res = executeDesignTool(op.name, JSON.stringify(op.args), toolCtx);
      const id = res.artifacts?.nodeId != null ? String(res.artifacts.nodeId) : '';
      if (id) {
        nodeIds.push(id);
        created += 1;
        mutated = true;
      }
    }

    onProgress?.({ done: i + 1, total: totalWork });
    if (mutated && delayMs > 0 && i < ops.length - 1) {
      try {
        await sleep(delayMs, signal);
      } catch {
        break;
      }
    }
  }

  return {
    frameId,
    nodeIds,
    nodeId: nodeIds[0] || null,
    created,
    updated,
    removed: leftoverPrev.length,
    unchanged,
    fingerprintById: fingerprintsFor(nodeIds, ops),
  };
}

function collectPrevIds(opts: {
  liveNodeIds?: string[] | null;
  liveNodeId?: string | null;
}): string[] {
  return [
    ...(Array.isArray(opts.liveNodeIds) ? opts.liveNodeIds : []),
    ...(opts.liveNodeId ? [opts.liveNodeId] : []),
  ].filter(Boolean);
}

/**
 * Apply design SVG through canvas tools → editable nodes (progressive live-draw).
 */
function frameSizeFromDoc(
  getDocument: () => any,
  frameId: string | null | undefined
): { width: number; height: number } | null {
  if (!frameId) return null;
  const doc = getDocument();
  const frame = (Array.isArray(doc?.frames) ? doc.frames : []).find(
    (f: any) => f?.id === frameId
  );
  const width = Math.round(Number(frame?.width) || 0);
  const height = Math.round(Number(frame?.height) || 0);
  if (width < 64 || height < 64) return null;
  return { width, height };
}

export async function applyDesignSvgToDocumentProgressive(opts: {
  dispatch: Dispatch;
  getDocument: () => any;
  svg: string;
  canvasSize?: string | null;
  targetFrameId?: string | null;
  liveNodeIds?: string[] | null;
  liveNodeId?: string | null;
  fingerprintById?: Record<string, string> | null;
  /** Backend svg_patch.mode === 'full' — wipe previous live nodes and recreate. */
  forceFullReplace?: boolean;
  delayMs?: number;
  signal?: AbortSignal;
  onProgress?: (info: { done: number; total: number }) => void;
}): Promise<ApplyDesignSvgResult> {
  const empty: ApplyDesignSvgResult = {
    frameId: null,
    nodeIds: [],
    nodeId: null,
    created: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    fingerprintById: {},
  };
  if (!opts.getDocument()) return empty;

  // Never spawn a stock 1440×900 from Auto / partial-auto.
  const resolved =
    parseResolvedSize(opts.canvasSize) ||
    frameSizeFromDoc(opts.getDocument, opts.targetFrameId);
  if (!resolved) return empty;
  const { width, height } = resolved;

  const frameId = ensureFrameSize({
    dispatch: opts.dispatch,
    getDocument: opts.getDocument,
    frameId: opts.targetFrameId || null,
    width,
    height,
  });

  const ops = designSvgToToolOps(opts.svg, { width, height });
  const prevIds = collectPrevIds(opts);
  if (!ops.length) {
    return {
      frameId,
      nodeIds: prevIds,
      nodeId: prevIds[0] || null,
      created: 0,
      updated: 0,
      removed: 0,
      unchanged: prevIds.length,
      fingerprintById: {},
    };
  }

  const isFirstPaint = prevIds.length === 0;
  return applyOpsIncremental({
    dispatch: opts.dispatch,
    getDocument: opts.getDocument,
    ops,
    frameId,
    prevIds,
    fingerprintById: opts.fingerprintById,
    forceFullReplace: Boolean(opts.forceFullReplace),
    delayMs: isFirstPaint ? Math.max(16, opts.delayMs ?? 48) : Math.max(8, opts.delayMs ?? 24),
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type AgentStepEvent =
  | {
      type: 'permission';
      can_call_llm: boolean;
      balance?: number;
      need?: number;
      free_daily?: boolean;
    }
  | { type: 'thinking'; text: string; replace?: boolean }
  | { type: 'token'; text: string }
  | { type: 'chat' }
  | { type: 'phase'; progress: PipelineProgress }
  | { type: 'analysis'; text: string }
  | { type: 'analysis_delta'; text: string }
  | { type: 'drawing'; active: boolean; done?: number; total?: number }
  | {
      type: 'activity';
      id: string;
      kind: 'thought' | 'added' | 'updated' | 'explored' | 'skipped' | 'deleted' | 'tool';
      status: 'running' | 'done';
      durationSec?: number;
      count?: number;
      skillName?: string;
      /** Human-readable what happened (e.g. 添加文字「中秋」). */
      detail?: string;
      stage?: string;
      item?: { id?: string; name?: string; summary?: string };
      body?: string;
    }
  | { type: 'svg_delta'; svg: string }
  | { type: 'canvas'; size: string; scene?: string }
  | {
      type: 'done';
      summary?: string;
      painted?: boolean;
      choices?: string[];
      proposedOps?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
      applyChoice?: string;
      choiceUi?: AskChoiceUi;
    }
  | { type: 'error'; message: string };

export type PipelineProgress = {
  category: string;
  labels: string[];
  currentIndex: number;
  stepConfirm?: boolean;
  collabMode?: string;
};


export type RunDesignAgentParams = {
  userMessage: string;
  runMode?: DesignRunMode;
  /** Composer Agent / Ask — Ask proposes before paint. */
  interactionMode?: 'agent' | 'ask' | null;
  scene?: DesignScene | null;
  styleGroupId?: number | null;
  model?: string | null;
  canvasSize?: string | null;
  canvasId?: string | null;
  targetLayerId?: string | null;
  layerIds?: string[] | null;
  currentSvg?: string | null;
  /** Prefill live-draw tracking so edits patch the existing frame instead of spawning a new one. */
  seedLiveNodeIds?: string[] | null;
  /** Frame-local node inventory for edit tool ops. */
  sceneNodes?: SceneNodeInventoryItem[] | null;
  /** Artboard list (ids / sizes) for delete_frame + SCENE_FRAMES. */
  sceneFrames?: SceneFrameSnapshot[] | null;
  /** Dual-context map: focused / peripheral / empty_rects / suggested_place. */
  spatialSummary?: SpatialSummary | null;
  focusFrameId?: string | null;
  /** User-attached reference images (data URLs) for vision + create_image. */
  images?: string[] | null;
  /** Natural WxH of attachments (e.g. ["750x1624"]) — auto canvas soft hint only. */
  refImageSizes?: string[] | null;
  sessionId?: string | null;
  projectId?: string | null;
  memory?: DesignMemoryPayload | null;
  onMemoryPatch?: (patch: MemoryPatch, localHints: { lastAgentFrameId?: string | null }) => void;
  dispatch: Dispatch;
  getDocument: () => any;
  targetFrameId?: string | null;
  /**
   * Explicit user @ artboard (or @ node → containing frame).
   * Prefer this board for shimmer / tool_ops parent; Host never invents an empty plate.
   */
  pinnedFrameId?: string | null;
  onEvent: (ev: AgentStepEvent) => void;
  signal?: AbortSignal;
  /** Editor chrome bridge for zoom / panels / account Agent settings. */
  canvasUi?: CanvasUiBridge | null;
  /** Artboard shimmer pill copy (i18n from AgentDock). */
  processLabels?: {
    preparing?: string;
    thinking?: string;
    exploring?: string;
    editing?: string;
  } | null;
  /** Auto routing overrides from account prefs (null = platform). */
  routeOverrides?: Record<string, string> | null;
  /** Ask confirm: skip LLM and apply these ops (agent mode). */
  applyOps?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }> | null;
};

/** Map agent params → POST /design/run body (omit empty optional fields). */
function buildRunDesignJobBody(
  params: RunDesignAgentParams,
  runMode: DesignRunMode
): RunDesignJobBody {
  const body: RunDesignJobBody = {
    run_mode: runMode,
    prompt: params.userMessage,
    user_selected_model: params.model || 'auto',
  };
  if (params.interactionMode === 'ask' || params.interactionMode === 'agent') {
    body.interaction_mode = params.interactionMode;
  }
  if (runMode === 'agent' && params.scene) body.scene = params.scene;
  if (params.styleGroupId != null) body.style_group_id = params.styleGroupId;
  if (params.routeOverrides) body.route_overrides = params.routeOverrides;
  if (params.canvasId) body.canvas_id = params.canvasId;
  if (params.canvasSize) body.canvas_size = params.canvasSize;
  if (params.refImageSizes?.length) body.ref_image_sizes = params.refImageSizes;
  if (params.targetLayerId) body.target_layer_id = params.targetLayerId;
  if (params.layerIds) body.layer_ids = params.layerIds;
  if (params.currentSvg) body.current_svg = params.currentSvg;
  if (params.sceneNodes?.length) {
    body.scene_nodes = params.sceneNodes as Array<Record<string, unknown>>;
  }
  if (params.sceneFrames?.length) {
    body.scene_frames = params.sceneFrames as Array<Record<string, unknown>>;
  }
  if (params.spatialSummary) {
    body.spatial_summary = params.spatialSummary as unknown as Record<string, unknown>;
  }
  if (params.focusFrameId) body.focus_frame_id = params.focusFrameId;
  if (params.images?.length) body.images = params.images;
  if (params.sessionId) body.session_id = params.sessionId;
  if (params.projectId) body.project_id = params.projectId;
  if (params.memory) body.memory = params.memory;
  if (params.applyOps?.length) {
    body.apply_ops = params.applyOps as Array<Record<string, unknown>>;
  }
  return body;
}

type LiveDrawState = {
  nodeIds: string[];
  frameId: string | null;
  fingerprintById: Record<string, string>;
};

export async function runDesignAgent(params: RunDesignAgentParams): Promise<void> {
  const runMode = params.runMode || 'agent';
  // Do NOT seed old-frame id/nodes until backend confirms edit_in_place.
  // Seeding early causes blank/create to resize the prior artboard instead of spawning a new one.
  const live: LiveDrawState = {
    nodeIds: [],
    frameId: null,
    fingerprintById: {},
  };

  const labels: string[] = [];
  const skillStartedAt = new Map<number, number>();
  const skillMeta = new Map<number, { category: string; name: string }>();

  let paintChain: Promise<void> = Promise.resolve();
  let painted = false;
  let pendingDone: {
    summary?: string;
    painted?: boolean;
    choices?: string[];
    proposedOps?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
    applyChoice?: string;
    choiceUi?: AskChoiceUi;
  } | null = null;
  let resultSummary = '';
  let resultChoices: string[] = [];
  let lastPaintedSvg = '';
  let activitySeq = 0;
  /** Early greeting divert — ignore Explored stage SSE after clear. */
  let chatDiverted = false;
  /** Client chip WxH — never let backend status rewrite it. */
  const lockedClientSize = (() => {
    const s = String(params.canvasSize || '')
      .trim()
      .toLowerCase()
      .replace('*', 'x');
    return /^\d+x\d+$/.test(s) ? s : null;
  })();
  let liveCanvasSize = lockedClientSize || params.canvasSize || null;
  /** Pre-draw grade=good refs actually attached to vision (activity UI). */
  let aesRefsAttached = 0;
  /** Authoritative only after backend status.edit_in_place — never infer from local canvas. */
  let editInPlace = false;
  let toolOpsApplied = false;
  let blankArtboard = false;
  const appliedOpIdsRef = { current: new Set<string>() };
  /** Per-op execution truth for this round — flushed into scene_feedback. */
  let pendingOpResults: ToolOpResult[] = [];
  let latestMemory: TaskState | null = params.memory?.medium || null;
  let liveTaskId: string | null = null;

  if (typeof console !== 'undefined') {
    console.info('[designAgent] start', {
      scene: params.scene,
      canvasSize: params.canvasSize,
      lockedClientSize,
    });
  }

  // Do not mark process shimmer until backend status.
  // Shimmer for create OR empty edit target (focused blank artboard).
  const processLabels = params.processLabels || {};
  let shimmerFrameId: string | null = null;

  const setProcessPill = (frameId: string | null | undefined, label: string) => {
    if (!frameId) return;
    shimmerFrameId = frameId;
    markArtboardGenerating(params.dispatch, frameId, label);
  };

  const clearProcessPill = () => {
    shimmerFrameId = null;
    params.dispatch(cancelImportPlaceholder());
  };

  const shouldShimmerFrame = (frameId: string | null, edit: boolean): boolean => {
    if (!frameId) return false;
    if (!edit) return true;
    if (blankArtboard) return false;
    try {
      if (frameIsEmpty(params.getDocument(), frameId)) return true;
    } catch {
      /* ignore */
    }
    const nodes = params.sceneNodes || [];
    if (!nodes.length) return true;
    return !nodes.some((n) => {
      const fid = String((n as { frameId?: string }).frameId || '');
      return !fid || fid === frameId;
    });
  };

  const emitMemory = (patch: MemoryPatch | undefined, frameId: string | null) => {
    if (!params.onMemoryPatch) return;
    const hints = frameId ? { lastAgentFrameId: frameId } : {};
    if (patch?.medium) {
      const base = latestMemory || params.memory?.medium;
      if (base) {
        latestMemory = applyClientFrameHints(applyMemoryPatch(base, patch), {
          lastAgentFrameId: frameId || undefined,
          referent:
            blankArtboard && frameId
              ? { label: '新建的画布', frameId }
              : undefined,
        });
      }
      params.onMemoryPatch(patch, hints);
    } else if (frameId) {
      params.onMemoryPatch({ medium: {} }, hints);
    }
  };

  const paintCanvasSize = () => liveCanvasSize || params.canvasSize || null;

  /** SVG live-draw only: open a WxH plate when painting full SVG (not tool_ops). */
  const ensureCreateFrameReady = (): string | null => {
    if (editInPlace) {
      return live.frameId || params.targetFrameId || null;
    }
    if (live.frameId) return live.frameId;
    const resolved = parseResolvedSize(paintCanvasSize());
    if (!resolved) return null;
    const frameId = ensureFrameSize({
      dispatch: params.dispatch,
      getDocument: params.getDocument,
      frameId: null,
      width: resolved.width,
      height: resolved.height,
    });
    if (frameId) live.frameId = frameId;
    return frameId;
  };

  const activityKindForSkill = (
    category?: string,
    skillName?: string
  ): 'thought' | 'explored' | 'tool' | 'hidden' => {
    const cat = String(category || '').toLowerCase();
    const name = String(skillName || '').toLowerCase();
    // Tool-first agent loop turns — stage Explored covers wait progress; hide bare Thought.
    if (cat === 'agent' || name === 'agent' || name === 'agent_loop') {
      return 'hidden';
    }
    if (
      cat === 'summary' ||
      name.includes('结果总结') ||
      name.includes('summar')
    ) {
      return 'hidden';
    }
    if (
      cat === 'plan' ||
      name.includes('需求') ||
      name.includes('parse') ||
      name.includes('brief') ||
      name.includes('intent') ||
      name.includes('思考') ||
      name.includes('think')
    ) {
      return 'thought';
    }
    if (
      cat === 'layout' ||
      cat === 'validate' ||
      name.includes('布局') ||
      name.includes('构图') ||
      name.includes('校验') ||
      name.includes('validate') ||
      name.includes('explore') ||
      name.includes('检索') ||
      name.includes('参考')
    ) {
      return 'explored';
    }
    // Execute / draw: backend SSE `activity` owns "Tool call" + op detail.
    return 'hidden';
  };

  const paintSvgProgressive = (svg: string, patch?: DesignSvgPatch | null) => {
    // Edit path must only mutate via tool_ops — SVG live-draw stacks duplicate shapes.
    // Blank artboard: empty frame only — never paint invented SVG onto anything.
    if (editInPlace || toolOpsApplied || blankArtboard) return;
    const trimmed = svg?.trim();
    if (!trimmed) return;
    if (
      patch &&
      patch.mode === 'patch' &&
      patch.create_count === 0 &&
      patch.update_count === 0 &&
      patch.delete_count === 0
    ) {
      activitySeq += 1;
      params.onEvent({
        type: 'activity',
        id: `skip-${activitySeq}`,
        kind: 'skipped',
        status: 'done',
      });
      return;
    }
    if (trimmed === lastPaintedSvg) {
      activitySeq += 1;
      params.onEvent({
        type: 'activity',
        id: `skip-${activitySeq}`,
        kind: 'skipped',
        status: 'done',
      });
      return;
    }
    paintChain = paintChain.then(async () => {
      if (params.signal?.aborted) return;
      // First paint replaces the import-style shimmer plate on the same frame.
      params.dispatch(cancelImportPlaceholder());
      const frameReady = ensureCreateFrameReady();
      if (!frameReady && !parseResolvedSize(paintCanvasSize())) {
        // Size still Auto — do not mark painted; allow retry after 设计思考 status.
        return;
      }
      lastPaintedSvg = trimmed;
      params.onEvent({ type: 'drawing', active: true, done: 0, total: 0 });
      try {
        const applied = await applyDesignSvgToDocumentProgressive({
          dispatch: params.dispatch,
          getDocument: params.getDocument,
          svg: trimmed,
          canvasSize: paintCanvasSize(),
          targetFrameId: live.frameId || params.targetFrameId,
          liveNodeIds: live.nodeIds,
          fingerprintById: live.fingerprintById,
          // Backend already decided full vs patch; honor full → wipe+recreate.
          forceFullReplace: patch?.mode === 'full' && live.nodeIds.length > 0,
          signal: params.signal,
          onProgress: (info) => {
            params.onEvent({
              type: 'drawing',
              active: true,
              done: info.done,
              total: info.total,
            });
          },
        });
        if (!applied.frameId) {
          lastPaintedSvg = '';
          return;
        }
        live.nodeIds = applied.nodeIds;
        live.frameId = applied.frameId;
        live.fingerprintById = applied.fingerprintById;
        // Prefer backend patch counts when present (source of truth for "incremental").
        const created = patch ? patch.create_count : applied.created;
        const updated = patch ? patch.update_count : applied.updated;
        if (created > 0 || updated > 0) {
          painted = true;
          activitySeq += 1;
          params.onEvent({
            type: 'activity',
            id: `paint-${activitySeq}`,
            kind: created > 0 ? 'added' : 'updated',
            status: 'done',
            count: created + updated,
          });
        } else if (applied.unchanged > 0 || (patch && patch.total_next)) {
          activitySeq += 1;
          params.onEvent({
            type: 'activity',
            id: `skip-${activitySeq}`,
            kind: 'skipped',
            status: 'done',
          });
        } else {
          activitySeq += 1;
          params.onEvent({
            type: 'activity',
            id: `skip-${activitySeq}`,
            kind: 'skipped',
            status: 'done',
          });
        }
        params.onEvent({ type: 'svg_delta', svg: trimmed });
      } finally {
        params.onEvent({ type: 'drawing', active: false });
      }
    });
  };

  const emitPhase = (currentIndex: number, category?: string) => {
    params.onEvent({
      type: 'phase',
      progress: {
        category: category || params.scene || 'design',
        labels: labels.length ? [...labels] : ['Design'],
        currentIndex,
        stepConfirm: false,
        collabMode: 'auto',
      },
    });
  };

  const handleStreamStatus = (ev: any) => {

    if (ev.task_id) liveTaskId = String(ev.task_id);
    if (ev.status === 'routing') {
      // Legacy status — ignore (no longer emitted).
      return;
    }
    if (ev.status === 'aesthetic_refs') {
      // Internal retrieval only — do not surface as an Explored activity row.
      const aesEv = ev as {
        refs?: Array<{ name?: string; score?: number; imageUrl?: string }>;
        aesRefsAttached?: number;
      };
      const refs = Array.isArray(aesEv.refs) ? aesEv.refs : [];
      const attached = Number(aesEv.aesRefsAttached);
      aesRefsAttached = Number.isFinite(attached)
        ? Math.max(0, attached)
        : refs.filter((r) => String(r.imageUrl || '').trim()).length ||
          (refs.length ? refs.length : 0);
      return;
    }

    // Design: size resolved + needs a plate → open artboard + shimmer before content.
    // User @ board → bind + shimmer only (no second plate).
    if (ev.open_artboard === true) {
      const sizeRaw =
        (ev.canvas_size && String(ev.canvas_size)) ||
        (ev.canvas_width != null && ev.canvas_height != null
          ? `${ev.canvas_width}x${ev.canvas_height}`
          : '');
      const size = /^\d+x\d+$/i.test(String(sizeRaw).trim())
        ? String(sizeRaw).trim().toLowerCase()
        : '';
      if (lockedClientSize) liveCanvasSize = lockedClientSize;
      else if (size) liveCanvasSize = size;
      const pinned = String(params.pinnedFrameId || '').trim() || null;
      if (pinned) {
        live.frameId = pinned;
        setProcessPill(pinned, processLabels.preparing || 'Preparing…');
        return;
      }
      const resolved = parseResolvedSize(liveCanvasSize);
      if (!resolved) return;
      live.nodeIds = [];
      live.fingerprintById = {};
      const frameId = ensureFrameSize({
        dispatch: params.dispatch,
        getDocument: params.getDocument,
        frameId: null,
        width: resolved.width,
        height: resolved.height,
      });
      if (frameId) {
        live.frameId = frameId;
        setProcessPill(frameId, processLabels.preparing || 'Preparing…');
      }
      return;
    }

    const sizeRaw =
      (ev.canvas_size && String(ev.canvas_size)) ||
      (ev.canvas_width != null && ev.canvas_height != null
        ? `${ev.canvas_width}x${ev.canvas_height}`
        : '');
    const size = /^\d+x\d+$/i.test(String(sizeRaw).trim())
      ? String(sizeRaw).trim().toLowerCase()
      : '';
    if (size || lockedClientSize) {
      // User chip wins — backend must not resize the live artboard.
      liveCanvasSize = lockedClientSize || size.toLowerCase();
      if (typeof console !== 'undefined') {
        console.info('[designAgent] status size', {
          fromBackend: size || null,
          lockedClientSize,
          using: liveCanvasSize,
          scene: ev.scene,
          edit_in_place: ev.edit_in_place,
        });
      }
      if (typeof ev.edit_in_place === 'boolean') {
        editInPlace = ev.edit_in_place;
      }
      if (ev.blank_artboard === true || ev.intent === 'blank') {
        blankArtboard = true;
      }
      if (editInPlace) {
        // Force rebind to the user's target — don't keep a sibling spawned
        // by an earlier provisional create status.
        live.frameId = params.targetFrameId || live.frameId || null;
        if (!live.nodeIds.length && params.seedLiveNodeIds?.length) {
          live.nodeIds = [...params.seedLiveNodeIds].filter(Boolean);
        }
      } else {
        // New artboard / blank — never mutate prior poster nodes.
        // Keep live.frameId only if this run already opened one (repeat status events).
        live.nodeIds = [];
        live.fingerprintById = {};
        // Provisional edit status may have bound the user's @ target; create/sibling must spawn new.
        if (
          live.frameId &&
          params.targetFrameId &&
          live.frameId === params.targetFrameId
        ) {
          live.frameId = null;
        }
      }
      const resolved = parseResolvedSize(liveCanvasSize);
      // Auto / partial-auto: wait for 设计思考 before opening a stock WxH plate.
      // edit_in_place without resolved size: bind only — never resize to 1440×900.
      let frameId: string | null = null;
      if (editInPlace) {
        frameId = live.frameId || params.targetFrameId || null;
        if (frameId && resolved) {
          frameId = ensureFrameSize({
            dispatch: params.dispatch,
            getDocument: params.getDocument,
            frameId,
            width: resolved.width,
            height: resolved.height,
          });
        }
      } else if (resolved) {
        // Only resize an artboard this run already opened.
        // Do NOT spawn a stock WxH plate from early status — chat
        // ("你好") shares the same status event and must not create canvas.
        if (live.frameId) {
          frameId = ensureFrameSize({
            dispatch: params.dispatch,
            getDocument: params.getDocument,
            frameId: live.frameId,
            width: resolved.width,
            height: resolved.height,
          });
        }
      }
      if (frameId) {
        live.frameId = frameId;
        // Clear stale chrome, then show shimmer for create / empty artboard.
        params.dispatch(cancelImportPlaceholder());
        if (blankArtboard) {
          painted = true;
        } else if (shouldShimmerFrame(frameId, editInPlace)) {
          setProcessPill(
            frameId,
            processLabels.preparing || 'Preparing…'
          );
        }
      }
      params.onEvent({
        type: 'canvas',
        size: liveCanvasSize,
        scene: ev.scene ? String(ev.scene) : undefined,
      });
    }
    emitPhase(0, ev.scene || params.scene || 'design');
    return;
    
  };

  const handleStreamSkillStart = (ev: any) => {

    const name = ev.skill_name || `Step ${ev.index + 1}`;
    while (labels.length <= ev.index) labels.push(`Step ${labels.length + 1}`);
    labels[ev.index] = name;
    if (!skillStartedAt.has(ev.index)) {
      skillStartedAt.set(ev.index, Date.now());
    }
    skillMeta.set(ev.index, {
      category: String(ev.category || ''),
      name,
    });
    const kind = activityKindForSkill(ev.category, name);
    if (kind !== 'hidden') {
      params.onEvent({
        type: 'activity',
        id: `skill-${ev.index}`,
        kind,
        status: 'running',
        skillName: name,
      });
    }
    if (kind === 'thought' && (shimmerFrameId || live.frameId)) {
      setProcessPill(
        shimmerFrameId || live.frameId,
        processLabels.thinking || 'Thinking…'
      );
    }
    emitPhase(ev.index, ev.category || params.scene || 'design');
    return;
    
  };

  const handleStreamSkillProgress = (ev: any) => {

    const meta = skillMeta.get(ev.index);
    const kind = activityKindForSkill(
      meta?.category || '',
      ev.skill_name || meta?.name || ''
    );
    if (kind === 'hidden') return;
    // Status only — do not invent progress copy; backend text streams elsewhere.
    params.onEvent({
      type: 'activity',
      id: `skill-${ev.index}`,
      kind,
      status: 'running',
      skillName: ev.skill_name || meta?.name,
    });
    return;
    
  };

  const handleStreamActivity = (ev: any) => {

    // Backend-authored progress (counts / detail) — do not invent on the client.
    if (chatDiverted && (ev.kind === 'explored' || ev.kind === 'thought')) {
      return;
    }
    const stage = ev.stage ? String(ev.stage) : '';
    const detail = ev.detail ? String(ev.detail) : '';
    // Bind an existing @ / focus board for shimmer — never spawn an empty artboard.
    // Free-canvas create/edit does not need a frame; only model create_frame opens one.
    if (
      !chatDiverted &&
      ev.kind === 'explored' &&
      (stage === 'scene' || detail.startsWith('canvas_size:'))
    ) {
      if (detail.startsWith('canvas_size:')) {
        const raw = detail.replace(/^canvas_size:/i, '').trim().toLowerCase();
        if (/^\d+x\d+$/.test(raw)) liveCanvasSize = raw;
      }
      const pinned = String(params.pinnedFrameId || '').trim() || null;
      const focus =
        pinned ||
        String(params.targetFrameId || '').trim() ||
        live.frameId ||
        null;
      let frameId: string | null = null;
      if (focus) {
        const boardSize = frameSizeFromDoc(params.getDocument, focus);
        if (boardSize) {
          liveCanvasSize = `${boardSize.width}x${boardSize.height}`;
        }
        live.frameId = focus;
        frameId = focus;
      }
      if (frameId) {
        setProcessPill(frameId, processLabels.exploring || 'Exploring…');
      }
    }
    const kind =
      (ev.kind as
        | 'thought'
        | 'added'
        | 'updated'
        | 'explored'
        | 'skipped'
        | 'deleted'
        | 'tool') || 'tool';
    params.onEvent({
      type: 'activity',
      id: String(ev.id || `activity-${activitySeq++}`),
      kind,
      status: ev.status === 'running' ? 'running' : 'done',
      count: typeof ev.count === 'number' ? ev.count : undefined,
      detail: detail || undefined,
      skillName: ev.skillName || ev.skill_name || undefined,
      durationSec: typeof ev.durationSec === 'number' ? ev.durationSec : undefined,
      stage: stage || undefined,
      item: ev.item
        ? {
            id: ev.item.id ? String(ev.item.id) : undefined,
            name: ev.item.name ? String(ev.item.name) : undefined,
            summary: ev.item.summary ? String(ev.item.summary) : undefined,
          }
        : undefined,
      body: ev.body ? String(ev.body) : undefined,
    });
    const pillFrame = shimmerFrameId || live.frameId;
    if (pillFrame && ev.status !== 'done') {
      if (kind === 'explored') {
        setProcessPill(pillFrame, processLabels.exploring || 'Exploring…');
      } else if (kind === 'thought') {
        setProcessPill(pillFrame, processLabels.thinking || 'Thinking…');
      } else if (
        kind === 'tool' ||
        kind === 'added' ||
        kind === 'updated' ||
        kind === 'deleted'
      ) {
        setProcessPill(pillFrame, processLabels.editing || 'Editing elements…');
      }
    }
    return;
    
  };

  const handleStreamToolOps = (ev: any) => {

    const ops = Array.isArray(ev.ops) ? ev.ops : [];
    if (!ops.length) return;
    const deleteish = ops.filter((o: { name?: string }) =>
      ['delete_frame', 'delete_nodes'].includes(String(o?.name || '').trim())
    );
    if (deleteish.length) {
      console.info('[sse tool_ops delete]', deleteish);
    }
    paintChain = paintChain.then(async () => {
      if (params.signal?.aborted) return;
      params.onEvent({ type: 'drawing', active: true, done: 0, total: ops.length });
      const pinned = String(params.pinnedFrameId || '').trim() || null;
      const aiCreatesFrame = ops.some(
        (o: { name?: string }) => String(o?.name || '').trim() === 'create_frame'
      );

      // Fallback if backend did not emit open_artboard: Host opens plate first.
      if (!pinned && !live.frameId && aiCreatesFrame && !editInPlace) {
        const fromOp = sizeFromCreateFrameOp(ops);
        const resolved =
          parseResolvedSize(paintCanvasSize()) ||
          fromOp ||
          null;
        if (resolved) {
          if (!parseResolvedSize(paintCanvasSize())) {
            liveCanvasSize = `${resolved.width}x${resolved.height}`;
          }
          const opened = ensureFrameSize({
            dispatch: params.dispatch,
            getDocument: params.getDocument,
            frameId: null,
            width: resolved.width,
            height: resolved.height,
          });
          if (opened) live.frameId = opened;
        }
      }

      // Host already opened → drop model create_frame so we don't get a second plate.
      const paintOps =
        live.frameId || pinned
          ? ops.filter((o) => String(o?.name || '').trim() !== 'create_frame')
          : ops;

      const frameId = resolveToolOpsFrameId({
        editInPlace,
        liveFrameId: live.frameId,
        targetFrameId: params.targetFrameId,
        pinnedFrameId: params.pinnedFrameId,
      });
      if (frameId) {
        live.frameId = frameId;
        if (shouldShimmerFrame(frameId, editInPlace) || Boolean(live.frameId)) {
          setProcessPill(
            frameId,
            processLabels.editing || 'Editing elements…'
          );
        }
      }
      try {
        const applied = applyAgentToolOps({
          ops: paintOps,
          dispatch: params.dispatch,
          getDocument: params.getDocument,
          frameId,
          signal: params.signal,
          // Create has no prior nodes — don't rewrite create_shape against old bg.
          sceneNodes: editInPlace ? params.sceneNodes : null,
          userImages: params.images,
          appliedOpIds: appliedOpIdsRef.current,
          canvasUi: params.canvasUi,
        });
        pendingOpResults.push(...applied.opResults);
        const failures = applied.opResults.filter((r) => !r.ok);
        if (failures.length) {
          // Correct the backend's pre-emitted counts — user must see the truth.
          activitySeq += 1;
          params.onEvent({
            type: 'activity',
            id: `opfail-${activitySeq}`,
            kind: 'skipped',
            status: 'done',
            count: failures.length,
            detail: `${failures.length} 个操作未生效：${failures[0].error || '目标元素不存在'}`,
          });
        }
        const anyOk = applied.opResults.some((r) => r.ok);
        toolOpsApplied = true;
        painted = painted || anyOk;
        if (applied.frameId) {
          live.frameId = applied.frameId;
        }
        if (applied.nodeIds.length) {
          live.nodeIds = [...new Set([...live.nodeIds, ...applied.nodeIds])];
        }
        // Keep shimmer until the whole run finishes (cleared after paintChain).
        if (live.frameId) {
          setProcessPill(
            live.frameId,
            processLabels.editing || 'Editing elements…'
          );
        }
      } finally {
        params.onEvent({
          type: 'drawing',
          active: false,
          done: ops.length,
          total: ops.length,
        });
      }
    });
    return;
    
  };

  const handleStreamSceneFeedback = (ev: any) => {

    const taskId = String(ev.task_id || liveTaskId || '').trim();
    const round = typeof ev.round === 'number' ? ev.round : undefined;
    if (!taskId) return;
    // Wait until pending paints land, then POST real inventory via axios.
    paintChain = paintChain.then(async () => {
      if (params.signal?.aborted) return;
      const docNow = params.getDocument();
      const nodes = buildSceneNodesForCanvas(docNow, {
        focusFrameId: live.frameId || params.targetFrameId || null,
        forceIds: live.nodeIds,
      });
      const frames = buildSceneFramesSnapshot(docNow);
      const focusId = live.frameId || params.targetFrameId || null;
      const spatial = buildSpatialSummary(docNow, { focusFrameId: focusId });
      const opResults = pendingOpResults;
      pendingOpResults = [];
      console.info('[scene_feedback] post', {
        taskId,
        round,
        nodeCount: nodes.length,
        frameCount: frames.length,
        frames: frames.map((f) => ({ id: f.id, is_empty: f.is_empty })),
        emptyRects: spatial.empty_rects.length,
        opFailed: opResults.filter((r) => !r.ok).length,
      });
      await postDesignSceneFeedback(
        taskId,
        {
          scene_nodes: nodes as Array<Record<string, unknown>>,
          ...(frames.length
            ? { scene_frames: frames as Array<Record<string, unknown>> }
            : {}),
          spatial_summary: spatial as unknown as Record<string, unknown>,
          ...(opResults.length ? { op_results: opResults } : {}),
          round,
        },
        params.signal
      ).catch(() => undefined);
    });
    return;
    
  };

  const handleStreamSkillDone = (ev: any) => {

    if (ev.analysis) params.onEvent({ type: 'analysis', text: ev.analysis });
    const meta = skillMeta.get(ev.index);
    const kind = activityKindForSkill(
      meta?.category || '',
      ev.skill_name || meta?.name || ''
    );
    if (kind !== 'hidden') {
      const started = skillStartedAt.get(ev.index);
      const durationSec = started
        ? Math.max(1, Math.round((Date.now() - started) / 1000))
        : undefined;
      params.onEvent({
        type: 'activity',
        id: `skill-${ev.index}`,
        kind,
        status: 'done',
        skillName: ev.skill_name || meta?.name,
        ...(kind === 'thought' && durationSec != null ? { durationSec } : {}),
      });
    }
    if (ev.preview_svg && !toolOpsApplied) {
      paintSvgProgressive(ev.preview_svg, ev.svg_patch);
    }
    emitPhase(ev.index + 1, params.scene || 'design');
    return;
    
  };

  const handleStreamResult = (ev: any) => {

    const size =
      (ev.canvas_size && String(ev.canvas_size)) ||
      (ev.canvas_width != null && ev.canvas_height != null
        ? `${ev.canvas_width}x${ev.canvas_height}`
        : '');
    if (lockedClientSize) {
      liveCanvasSize = lockedClientSize;
    } else if (size) {
      liveCanvasSize = size.toLowerCase();
    }
    if (ev.blank_artboard === true) {
      blankArtboard = true;
      painted = true;
      params.dispatch(cancelImportPlaceholder());
    }
    // Blank / edit tool-ops: no SVG paint. Create/sibling: paint onto new frame only.
    if (ev.svg && !(toolOpsApplied || Boolean(ev.tool_ops_applied) || blankArtboard)) {
      if (!editInPlace) {
        live.nodeIds = [];
        live.fingerprintById = {};
      }
      paintSvgProgressive(ev.svg, ev.svg_patch);
    }
    if (ev.summary) resultSummary = ev.summary;
    if (Array.isArray(ev.choices) && ev.choices.length) {
      resultChoices = ev.choices.map((c) => String(c).trim()).filter(Boolean).slice(0, 6);
    }
    let resultProposed:
      | Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>
      | undefined;
    if (Array.isArray(ev.proposed_ops) && ev.proposed_ops.length) {
      resultProposed = ev.proposed_ops
        .filter((o: unknown) => o && typeof o === 'object')
        .map((o: { name?: string; args?: Record<string, unknown>; op_id?: string }) => ({
          name: o.name,
          args: o.args && typeof o.args === 'object' ? o.args : {},
          ...(o.op_id ? { op_id: String(o.op_id) } : {}),
        }))
        .slice(0, 80);
    }
    const applyChoice = String(ev.apply_choice || '').trim() || undefined;
    const choiceUi = normalizeChoiceUi(ev.choice_ui);
    emitPhase(Math.max(labels.length, 1), ev.scene || params.scene || 'design');
    pendingDone = {
      summary: resultSummary,
      painted:
        painted ||
        toolOpsApplied ||
        Boolean(ev.tool_ops_applied) ||
        blankArtboard,
      choices: resultChoices.length ? resultChoices : undefined,
      proposedOps: resultProposed?.length ? resultProposed : undefined,
      applyChoice,
      choiceUi,
    };
    emitMemory(
      undefined,
      live.frameId || params.targetFrameId || null
    );
    return;
    
  };

  try {
    const onStreamEvent = (ev: DesignJobEvent) => {
        if (ev.type === 'status') {
          handleStreamStatus(ev);
          return;
        }
        if (ev.type === 'permission') {
          // End empty Thinking pill; do NOT divert to chat-only when LLM may run.
          clearProcessPill();
          if (!ev.can_call_llm) {
            chatDiverted = true;
            pendingDone = { summary: '', painted: false };
          }
          params.onEvent({
            type: 'permission',
            can_call_llm: Boolean(ev.can_call_llm),
            balance: ev.balance,
            need: ev.need,
            free_daily: ev.free_daily,
          });
          return;
        }
        if (ev.type === 'thinking' && ev.text) {
          params.onEvent({
            type: 'thinking',
            text: ev.text,
            ...(ev.replace ? { replace: true } : {}),
          });
          return;
        }
        if (ev.type === 'token' && ev.text) {
          params.onEvent({ type: 'token', text: ev.text });
          return;
        }
        if (ev.type === 'chat_done') {
          // Ask proposals also finish without paint — do NOT wipe proposedOps / choices.
          if (pendingDone?.proposedOps?.length) {
            return;
          }
          // Model returned reply-only — clear Thought / Explored chrome.
          chatDiverted = true;
          pendingDone = {
            summary: pendingDone?.summary || resultSummary || '',
            painted: false,
            choices: pendingDone?.choices,
          };
          params.onEvent({ type: 'chat' });
          return;
        }
        if (ev.type === 'analysis_delta' && ev.text) {
          params.onEvent({ type: 'analysis_delta', text: ev.text });
          return;
        }
        if (ev.type === 'analysis' && ev.text) {
          params.onEvent({ type: 'analysis', text: ev.text });
          return;
        }
        if (ev.type === 'skill_start') {
          handleStreamSkillStart(ev);
          return;
        }
        if (ev.type === 'skill_progress') {
          handleStreamSkillProgress(ev);
          return;
        }
        if (ev.type === 'activity') {
          handleStreamActivity(ev);
          return;
        }
        if (ev.type === 'tool_ops') {
          handleStreamToolOps(ev);
          return;
        }
        if (ev.type === 'scene_feedback_request') {
          handleStreamSceneFeedback(ev);
          return;
        }
        if (ev.type === 'skill_done') {
          handleStreamSkillDone(ev);
          return;
        }
        if (ev.type === 'svg_delta') {
          if (!toolOpsApplied) paintSvgProgressive(ev.svg, ev.svg_patch);
          if (typeof ev.index === 'number') emitPhase(ev.index + 1, params.scene || 'design');
          return;
        }
        if (ev.type === 'critique_start') {
          const label = `Critique ${ev.round}`;
          if (!labels.includes(label)) labels.push(label);
          params.onEvent({
            type: 'activity',
            id: `critique-${ev.round}`,
            kind: 'tool',
            status: 'running',
          });
          emitPhase(Math.max(0, labels.length - 1), 'critique');
          return;
        }
        if (ev.type === 'critique_done') {
          params.onEvent({
            type: 'activity',
            id: `critique-${ev.round}`,
            kind: ev.ok === false ? 'skipped' : 'tool',
            status: 'done',
          });
          emitPhase(labels.length, 'critique');
          return;
        }
        if (ev.type === 'replan') {
          // Dynamic skip: labels may shrink; just log, no UI needed.
          return;
        }
        if (ev.type === 'subgoals') {
          // Surface as analysis text so user sees task decomposition.
          if (ev.goals?.length) {
            params.onEvent({
              type: 'analysis_delta',
              text: ev.goals.map((g, i) => `${i + 1}. ${g}`).join('\n'),
            });
          }
          return;
        }
        if (ev.type === 'memory_patch') {
          emitMemory(
            {
              medium: (ev.medium || {}) as MemoryPatch['medium'],
              long_suggestions: ev.long_suggestions,
            },
            live.frameId || params.targetFrameId || null
          );
          return;
        }
        if (ev.type === 'result') {
          handleStreamResult(ev);
          return;
        }
        if (ev.type === 'error') {
          params.onEvent({ type: 'error', message: ev.message || 'design_failed' });
        }
    };

    await runDesignJob(buildRunDesignJobBody(params, runMode), {
      signal: params.signal,
      onmessage: (frame) => {
        const raw = String(frame.data || '').trim();
        if (!raw || raw === '[DONE]') return;
        try {
          onStreamEvent(JSON.parse(raw) as DesignJobEvent);
        } catch {
          /* ignore malformed SSE frame */
        }
      },
      onerror: (err) => {
        if (params.signal?.aborted) return;
        const msg = err.message || String(err);
        params.onEvent({
          type: 'error',
          message: /Failed to fetch|NetworkError|ERR_/i.test(msg)
            ? '连接中断（代理超时或 API 热重载）。请重试；生成过程中勿保存 API 代码。'
            : msg || 'Failed to fetch',
        });
      },
    });
    await paintChain.catch(() => undefined);
    params.dispatch(cancelImportPlaceholder());

    if (pendingDone) {
      const summary = (pendingDone.summary || resultSummary || '').trim();
      params.onEvent({
        type: 'done',
        summary,
        painted: Boolean(pendingDone.painted),
        choices: pendingDone.choices?.length ? pendingDone.choices : undefined,
        proposedOps: pendingDone.proposedOps?.length
          ? pendingDone.proposedOps
          : undefined,
        applyChoice: pendingDone.applyChoice || undefined,
        choiceUi: pendingDone.choiceUi,
      });
    }

    // Only after the run is fully done (never mid tool_ops / mid-draw).
    // Prefer every node on the artboard — live.nodeIds can miss creates when
    // artifacts omit nodeId or create_frame retargets mid-batch.
    if (!params.signal?.aborted && pendingDone?.painted) {
      const doc = params.getDocument();
      const frameId = live.frameId || params.targetFrameId || null;
      const fromFrame = nodeIdsInsideFrame(doc, frameId);
      const fromLive = [
        ...new Set(
          live.nodeIds.filter((id) => Boolean(doc?.deltaSetLike?.[id]))
        ),
      ];
      const ids = fromFrame.length >= 2 ? fromFrame : fromLive;
      if (ids.length >= 2) {
        params.dispatch(pushEditorHistory());
        params.dispatch(setDocument(groupNodesInDocument(doc, ids)));
      }
    }
  } catch (err: any) {
    params.dispatch(cancelImportPlaceholder());
    if (params.signal?.aborted) return;
    params.onEvent({ type: 'error', message: err?.message || String(err) });
  }
}
