/**
 * Canvas design tools — schemas + local execution (Cursor-like tool loop).
 */

import type { Dispatch } from '@reduxjs/toolkit';
import {
  addArtboardFrame,
  patchDocumentNode,
  pushEditorHistory,
  setDocument,
  updateArtboardFrame,
  type ArtboardFrame,
} from '@/store/modules/editor';
import {
  addNodeToDocument,
  createImageNode,
  createShapeNode,
  createTextNode,
  removeNodesFromDocument,
} from '@/store/scene/sceneDocument';
import { buildMarkdownTextAttrs, parseNodeTextStyle } from '@/store/scene/sceneText';
import { serializeFillGradient } from '@/store/scene/sceneFill';
import {
  AGENT_TEMPLATES,
  lookupDesignSkill,
} from '@/components/editor/panels/agent/designStyles';

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AgentToolResult = {
  status: 'success' | 'warning' | 'error';
  summary: string;
  artifacts?: Record<string, unknown>;
  next_actions?: string[];
};

export type DesignToolContext = {
  dispatch: Dispatch;
  getDocument: () => any;
  /** Prefer placing new nodes inside this frame. */
  targetFrameId?: string | null;
  /** Latest user utterance — used to gate destructive tools. */
  userMessage?: string;
  /** User-attached image data URLs (fill slots via create_image). */
  userImages?: string[];
};

export const DESIGN_TOOL_NAMES = [
  'get_scene_summary',
  'lookup_design_skill',
  'ask_user',
  'create_frame',
  'update_frame',
  'create_shape',
  'create_text',
  'create_image',
  'update_node',
  'delete_nodes',
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

function listFrames(doc: any): ArtboardFrame[] {
  return Array.isArray(doc?.frames) ? doc.frames : [];
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

function applyShapeFill(
  node: any,
  args: Record<string, unknown>,
  fallbackFill: string
) {
  const fillType = String(args.fillType || 'solid').toLowerCase();
  const c0 = String(args.fill ?? fallbackFill);
  const c1 = String(args.fillEnd ?? args.fillTo ?? c0);
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
    };
    return;
  }
  node.attrs = {
    ...node.attrs,
    'fill-type': 'solid',
    'fill-color': c0,
    'fill-enabled': 'true',
    'fill-visible': 'true',
  };
}

/** Keep new nodes inside the target artboard (models often place outside). */
function fitIntoFrame(
  frame: ArtboardFrame | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number; clamped: boolean; outside: boolean } {
  if (!frame) return { x, y, clamped: false, outside: false };
  const fx = Number(frame.x) || 0;
  const fy = Number(frame.y) || 0;
  const fw = Math.max(1, Number(frame.width) || 1);
  const fh = Math.max(1, Number(frame.height) || 1);
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  // If model passed local coords (0..size) while frame is offset, promote to world.
  let wx = x;
  let wy = y;
  if (x >= 0 && x <= fw && y >= 0 && y <= fh && (fx !== 0 || fy !== 0)) {
    // Ambiguous when frame origin is 0 — treat as world already.
    if (fx !== 0 || fy !== 0) {
      wx = fx + x;
      wy = fy + y;
    }
  }
  // Clearly meant for another board / free canvas — do NOT silently pull into the wrong frame.
  const pad = 24;
  const outside =
    wx + w < fx - pad ||
    wx > fx + fw + pad ||
    wy + h < fy - pad ||
    wy > fy + fh + pad;
  if (outside) {
    return { x: wx, y: wy, clamped: false, outside: true };
  }
  const maxX = fx + fw - w;
  const maxY = fy + fh - h;
  const nx = Math.min(Math.max(wx, fx), Math.max(fx, maxX));
  const ny = Math.min(Math.max(wy, fy), Math.max(fy, maxY));
  return { x: nx, y: ny, clamped: nx !== wx || ny !== wy, outside: false };
}

/** User must explicitly ask before the agent may delete nodes. */
export function userExplicitlyAllowsDelete(message: string | undefined | null): boolean {
  const s = String(message || '');
  if (!s.trim()) return false;
  return /删除|删掉|移除|清除|去掉|丢掉|不要了|delete\b|remove\b|clear\b|erase\b|discard\b/i.test(
    s
  );
}

/** User wants a new artboard beside an existing one (not edit-in-place). */
export function userWantsSiblingFrame(message: string | undefined | null): boolean {
  const s = String(message || '');
  if (!s.trim()) return false;
  return /右侧|左边|左侧|旁边|再[生成做创画]|另一[张个块]|新的?[张个]?海报|同比例|再来一|旁边再|旁边生成|旁边做/.test(
    s
  );
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

  try {
    if (name === 'get_scene_summary') {
      const summary = sceneSummary(doc, ctx.targetFrameId);
      return {
        status: 'success',
        summary: `Scene: ${summary.frames.length} frames, ${summary.nodeCount} nodes`,
        artifacts: summary,
      };
    }

    if (name === 'lookup_design_skill') {
      const skill = String(args.skill || args.name || '').trim();
      const focus = args.focus != null ? String(args.focus) : 'all';
      if (!skill) {
        return {
          status: 'error',
          summary: 'skill required (e.g. poster, ui, icon, banner, core)',
          next_actions: ['lookup_design_skill with skill + optional focus'],
        };
      }
      const hit = lookupDesignSkill(skill, focus);
      return {
        status: hit.found ? 'success' : 'warning',
        summary: hit.found
          ? `Skill ${hit.skill} · focus=${hit.focus} (${hit.body.length} chars)`
          : `Skill lookup: ${hit.body.slice(0, 120)}`,
        artifacts: {
          skill: hit.skill,
          focus: hit.focus,
          guide: hit.body,
        },
        next_actions: hit.found
          ? ['Apply this guide in the current phase, then continue tools']
          : ['Pick a valid skill id from the catalog'],
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
      (name === 'create_shape' || name === 'create_text' || name === 'create_image')
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

    if (name === 'create_shape') {
      const shapeType = String(args.shapeType || 'rect');
      const mapped =
        shapeType === 'ellipse' ? 'circle' : shapeType === 'pen' ? 'pen' : shapeType;
      const width = Math.max(1, num(args.width, 120));
      const height = Math.max(1, num(args.height, 80));
      const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
      const placed = fitIntoFrame(target, num(args.x), num(args.y), width, height);
      const path = args.path != null ? String(args.path) : '';
      const closed =
        args.closed === true ||
        args.closed === 'true' ||
        mapped === 'path' ||
        (mapped === 'pen' && path.length > 0);
      const { id, node } = createShapeNode({
        x: placed.x,
        y: placed.y,
        width,
        height,
        shapeType: mapped,
        fill: String(args.fill ?? '#FFFFFF'),
        stroke: String(args.stroke ?? '#333333'),
        borderWidth: args.borderWidth != null ? num(args.borderWidth, 1) : undefined,
        path: path || undefined,
        closed,
        sides: args.sides != null ? num(args.sides, 5) : undefined,
        angle: args.rotation != null ? num(args.rotation) : undefined,
      });
      applyShapeFill(node, args, String(args.fill ?? '#FFFFFF'));
      if (args.name) node.attrs = { ...node.attrs, name: String(args.name) };
      if (args.cornerRadius != null) applyCornerRadius(node, num(args.cornerRadius));
      if (closed) node.attrs = { ...node.attrs, closed: 'true' };
      ctx.dispatch(pushEditorHistory());
      ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
      if (placed.outside) {
        return {
          status: 'warning',
          summary: `Created ${mapped} ${id} OUTSIDE target frame — if this is a new poster, call create_frame first then redraw inside it`,
          artifacts: { nodeId: id, shapeType: mapped, outsideTarget: true },
          next_actions: ['create_frame', 'create_shape', 'create_text'],
        };
      }
      return {
        status: placed.clamped ? 'warning' : 'success',
        summary: placed.clamped
          ? `Created ${mapped} ${id} (clamped into frame at ${Math.round(placed.x)},${Math.round(placed.y)})`
          : `Created ${mapped} ${id}${path ? ' (path)' : ''}`,
        artifacts: { nodeId: id, shapeType: mapped },
        next_actions: ['Continue layout or create_text'],
      };
    }

    if (name === 'create_image') {
      const width = Math.max(8, num(args.width, 240));
      const height = Math.max(8, num(args.height, 180));
      const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
      const placed = fitIntoFrame(target, num(args.x), num(args.y), width, height);
      const userImages = Array.isArray(ctx.userImages) ? ctx.userImages : [];
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
        const kind = String(args.placeholder || 'image').toLowerCase();
        src =
          kind === 'avatar'
            ? AGENT_TEMPLATES.avatarPlaceholder
            : AGENT_TEMPLATES.imagePlaceholder;
        sourceKind = 'placeholder';
      }
      const { id, node } = createImageNode({
        x: placed.x,
        y: placed.y,
        width,
        height,
        src,
        name: String(args.name || (sourceKind === 'placeholder' ? 'Image Placeholder' : 'Image')),
        assetKind: 'image',
      });
      ctx.dispatch(pushEditorHistory());
      ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
      return {
        status: placed.outside || placed.clamped ? 'warning' : 'success',
        summary:
          sourceKind === 'placeholder'
            ? `Created image placeholder ${id} (${Math.round(width)}×${Math.round(height)}) — user can replace later`
            : `Created image ${id} from ${sourceKind}`,
        artifacts: { nodeId: id, sourceKind },
        next_actions: ['Continue layout'],
      };
    }

    if (name === 'create_text') {
      const text = String(args.text ?? '');
      const width = args.width != null ? num(args.width) : undefined;
      const height = 40;
      const target = ctx.targetFrameId ? frameById(doc, ctx.targetFrameId) : null;
      const placed = fitIntoFrame(
        target,
        num(args.x),
        num(args.y),
        Math.max(1, width || 120),
        height
      );
      const { id, node } = createTextNode({
        x: placed.x,
        y: placed.y,
        text,
        width,
      });
      const style = parseNodeTextStyle(node.attrs || {});
      const nextStyle = {
        ...style,
        ...(args.fontSize != null ? { fontSize: num(args.fontSize, 14) } : {}),
        ...(args.color != null ? { fill: String(args.color) } : {}),
        ...(args.fontWeight != null ? { fontWeight: String(args.fontWeight) } : {}),
      };
      node.attrs = {
        ...buildMarkdownTextAttrs(text, nextStyle),
        ...(args.name ? { name: String(args.name) } : {}),
      };
      ctx.dispatch(pushEditorHistory());
      ctx.dispatch(setDocument(addNodeToDocument(ctx.getDocument(), id, node)));
      if (placed.outside) {
        return {
          status: 'warning',
          summary: `Created text ${id} OUTSIDE target frame — call create_frame for a sibling poster if needed`,
          artifacts: { nodeId: id, outsideTarget: true },
          next_actions: ['create_frame', 'create_text'],
        };
      }
      return {
        status: 'success',
        summary: `Created text ${id}`,
        artifacts: { nodeId: id },
      };
    }

    if (name === 'update_node') {
      const nodeId = String(args.nodeId || args.id || '');
      if (!nodeId) return { status: 'error', summary: 'nodeId required' };
      const latest = ctx.getDocument()?.deltaSetLike?.[nodeId];
      if (!latest) return { status: 'error', summary: `Node not found: ${nodeId}` };
      const patch: Record<string, unknown> = {};
      if (args.x != null) patch.x = num(args.x);
      if (args.y != null) patch.y = num(args.y);
      if (args.width != null) patch.width = Math.max(1, num(args.width));
      if (args.height != null) patch.height = Math.max(1, num(args.height));
      const fillRaw = args.fill ?? args.fillColor ?? args.color ?? args.backgroundColor;
      const attrs: Record<string, unknown> = {};
      if (fillRaw != null) {
        attrs['fill-color'] = String(fillRaw);
        attrs['fill-type'] = 'solid';
        attrs['fill-enabled'] = 'true';
        attrs['fill-visible'] = 'true';
      }
      if (args.stroke != null) attrs['border-color'] = String(args.stroke);
      if (args.borderWidth != null) attrs['border-width'] = num(args.borderWidth);
      if (args.opacity != null) attrs.opacity = Math.min(1, Math.max(0, num(args.opacity, 1)));
      if (args.text != null && latest.key === 'text') {
        const style = parseNodeTextStyle(latest.attrs || {});
        Object.assign(attrs, buildMarkdownTextAttrs(String(args.text), style));
      }
      if (Object.keys(attrs).length) patch.attrs = attrs;
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

    if (name === 'delete_nodes') {
      if (!userExplicitlyAllowsDelete(ctx.userMessage)) {
        return {
          status: 'error',
          summary:
            'delete_nodes blocked: user did not explicitly ask to delete. Keep existing elements; create a new frame for new designs.',
          next_actions: ['create_frame', 'create_shape', 'create_text', 'update_node'],
        };
      }
      const ids = Array.isArray(args.nodeIds)
        ? args.nodeIds.map((x) => String(x)).filter(Boolean)
        : [];
      if (!ids.length) return { status: 'error', summary: 'nodeIds required' };
      ctx.dispatch(setDocument(removeNodesFromDocument(ctx.getDocument(), ids)));
      return {
        status: 'success',
        summary: `Deleted ${ids.length} node(s)`,
        artifacts: { nodeIds: ids },
      };
    }

    // Optional: resize target frame
    if (name === 'update_frame') {
      const id = String(args.frameId || ctx.targetFrameId || '');
      if (!id) return { status: 'error', summary: 'frameId required' };
      const patch: Partial<ArtboardFrame> = {};
      if (args.width != null) patch.width = Math.max(40, num(args.width));
      if (args.height != null) patch.height = Math.max(40, num(args.height));
      if (args.name != null) patch.name = String(args.name);
      ctx.dispatch(updateArtboardFrame({ id, patch }));
      return { status: 'success', summary: `Updated frame ${id}`, artifacts: { frameId: id } };
    }

    if (name === 'create_frame') {
      const beforeIds = new Set(listFrames(doc).map((f) => f.id));
      const width = Math.max(40, num(args.width, 390));
      const height = Math.max(40, num(args.height, 844));
      const x = num(args.x, 0);
      const y = num(args.y, 0);
      ctx.dispatch(
        addArtboardFrame({
          name: String(args.name || 'Frame'),
          x,
          y,
          width,
          height,
          backgroundColor: String(args.backgroundColor || '#FFFFFF'),
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

    return {
      status: 'error',
      summary: `Unknown tool: ${name}`,
      next_actions: [`Use one of: ${DESIGN_TOOL_NAMES.join(', ')}`],
    };
  } catch (err: any) {
    return {
      status: 'error',
      summary: err?.message || String(err),
      next_actions: ['Fix arguments and retry'],
    };
  }
}

/** Resolve absolute coords if model gave local frame-relative values by mistake. */
export function resolvePlacementHint(frame: ArtboardFrame | null | undefined) {
  if (!frame) return '';
  return [
    `Target canvas "${frame.name}" id=${frame.id}`,
    `World origin: (${Math.round(frame.x)}, ${Math.round(frame.y)}) size ${Math.round(frame.width)}×${Math.round(frame.height)}`,
    `Place UI with absolute x/y inside [${Math.round(frame.x)}..${Math.round(frame.x + frame.width)}] × [${Math.round(frame.y)}..${Math.round(frame.y + frame.height)}].`,
  ].join('\n');
}

/** Extra placement policy injected into the agent system prompt. */
export function buildPlacementPolicy(doc: any, targetFrameId?: string | null, userMessage?: string | null) {
  const frames = listFrames(doc);
  const target =
    (targetFrameId && frames.find((f) => f.id === targetFrameId)) ||
    frames.find((f) => f.id === doc?.activeFrameId) ||
    null;

  if (userWantsSiblingFrame(userMessage) && frames.length > 0) {
    const ref =
      target ||
      (frames.length === 1 ? frames[0] : null) ||
      frames[frames.length - 1];
    if (ref) {
      const gap = 48;
      const nx = Math.round(Number(ref.x) + Number(ref.width) + gap);
      const ny = Math.round(Number(ref.y) || 0);
      const w = Math.round(Number(ref.width) || 595);
      const h = Math.round(Number(ref.height) || 842);
      return [
        'PLACEMENT STATUS: User wants a NEW artboard beside the existing one (same size).',
        `Reference frame "${ref.name}" id=${ref.id} at (${Math.round(ref.x)},${Math.round(ref.y)}) ${w}×${h}.`,
        `REQUIRED: create_frame name=… width=${w} height=${h} x=${nx} y=${ny} (gap ${gap} to the right).`,
        'Then draw ONLY inside the NEW frame with create_shape/create_text (absolute world coords).',
        'Do NOT modify, overwrite, or delete_nodes on the reference poster.',
        'Do NOT call finish until create_frame + drawing tools have succeeded.',
      ].join('\n');
    }
  }

  if (!frames.length) {
    const nodeCount = Object.keys(doc?.deltaSetLike || {}).length;
    if (nodeCount > 0) {
      return [
        'PLACEMENT STATUS: No artboards, but free-canvas nodes exist.',
        'Draw with create_shape/create_text using world x/y near those nodes.',
        'Do NOT ask for a frame first. Do NOT delete existing nodes unless the user explicitly asked.',
      ].join('\n');
    }
    return [
      'PLACEMENT STATUS: ZERO artboards and empty canvas.',
      'Call create_frame (default 794×1123) then draw — do not only ask_user.',
      'Suggested: create_frame name=画板 width=794 height=1123.',
    ].join('\n');
  }

  if (targetFrameId && !frameById(doc, targetFrameId)) {
    return [
      `PLACEMENT STATUS: Requested frame ${targetFrameId} is MISSING (likely deleted).`,
      'Call ask_user: create a new canvas, or pick another existing frame.',
      `Existing frames: ${frames.map((f) => `${f.name}(${f.id})`).join(', ')}`,
    ].join('\n');
  }

  if (!target && frames.length > 1) {
    return [
      'PLACEMENT STATUS: Multiple artboards, no clear target.',
      'Call get_scene_summary then ask_user which frame to use, or offer create_frame.',
      `Frames: ${frames.map((f) => `${f.name} ${Math.round(f.width)}×${Math.round(f.height)} id=${f.id}`).join('; ')}`,
    ].join('\n');
  }

  if (target) {
    return [
      resolvePlacementHint(target),
      'If the user asks for another poster beside this one, create_frame first — do not draw over this frame.',
    ].join('\n');
  }

  if (frames.length === 1) {
    return resolvePlacementHint(frames[0]);
  }

  return '';
}
