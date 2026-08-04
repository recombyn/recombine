/**
 * Host-accurate path selection chrome on the world top layer.
 * Mirrors shape-host SVG viewport + transform (no zoom drift) and paints above siblings.
 * Gesture / Redux stay in SelectionFeature.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRcbCamera } from '@/components/rcb/camera/context';
import { rememberNodePath2D } from '@/components/rcb/scene/document/sceneShapes';
import {
  getShapeHost,
  getSharedNodeEls,
  listShapeHosts,
  subscribeShapeHosts,
} from '@/components/rcb/shapes/shapeHostRegistry';
import type { AlignGuide, SceneBox } from './alignGuides';
import type { SpacingMeasure } from './SpacingInspectOverlay';
import { SPACING_MEASURE_COLOR } from './SpacingInspectOverlay';

function liveNodeEl(nodeId: string): Element | null {
  return (
    (getSharedNodeEls()?.get(nodeId) as Element | undefined) ||
    (getShapeHost(nodeId)?.el as Element | null | undefined) ||
    null
  );
}

/** Live geometry from the mounted shape host (same numbers paint uses). */
function liveShapeGeomBox(nodeId: string): SceneBox | null {
  const el = liveNodeEl(nodeId) as any;
  if (!el) return null;
  const left = Number(el.__sceneLeft);
  const top = Number(el.__sceneTop);
  const width = Number(el.sceneWidth);
  const height = Number(el.sceneHeight);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return { left, top, width, height };
}

/**
 * Vector ink that can get a host-injected path outline + handles.
 * Same transform tree as paint — avoids world-layer SelectionChrome drift.
 */
function nodeUsesPathChrome(node: any): boolean {
  if (!node) return false;
  const key = String(node.key || '');
  if (key === 'image' || key === 'video' || key === 'text' || key === 'frame') return false;
  if (key === 'shape' || key === 'path' || key === 'rect' || key === 'ellipse') return true;
  return Boolean(node.attrs?.shapeType);
}

export type ShapeOutlineItem = {
  id: string;
  pathD: string;
  box: SceneBox;
  angle: number;
  color?: string;
  /** Selected: inject resize (and rotate) hits into the host with the outline. */
  withHandles?: boolean;
  lineMode?: boolean;
  /**
   * Line/arrow: knobs at shaft ends (0,mid)/(w,mid). Arrow `d` includes a V
   * head — getPointAtLength(end) would land on a wing tip, not the head tip.
   */
  shaftEndpoints?: boolean;
  showRotate?: boolean;
  /**
   * When false, skip the blue path stroke (transform: guides-only chrome).
   * Default true.
   */
  showPath?: boolean;
  /**
   * Guide / spacing segments in host-local coords (origin = geom box top-left).
   * Painted on an *unrotated* layer so world-axis align guides stay axis-aligned.
   * `cross` = × mark at (x1,y1); `arrows` = gap double-heads;
   * `arrowsOnly` = heads on an existing align shaft (no second parallel line).
   */
  auxSegs?: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    dashed?: boolean;
    arrows?: boolean;
    arrowsOnly?: boolean;
    cross?: boolean;
  }>;
  /** Screen-constant badges (W×H / gap px) — host-injected, not world HTML. */
  auxBadges?: Array<{
    x: number;
    y: number;
    text: string;
    fill: string;
    /** Badge center relative to (x,y). */
    anchor?: 'center' | 'below' | 'above' | 'right';
  }>;
};

const SVG_NS = 'http://www.w3.org/2000/svg' as const;
const SEL_OUTLINE_ATTR = 'data-rcb-sel-outline';
const SEL_CHROME_ATTR = 'data-rcb-sel-chrome';
/** Legacy host AABB box attr — cleaned on sync; path silhouette is the outline. */
const SEL_BOX_ATTR = 'data-rcb-sel-box';
/** Inspect pair top/bottom (or L/R) edge rails — host-injected. */
const SEL_EDGE_ATTR = 'data-rcb-sel-edge';
/** Gap / size badge pill — host-injected. */
const SEL_BADGE_ATTR = 'data-rcb-sel-badge';
/** World-layer mount for path chrome (above shape hosts; does not lift node ink). */
const SEL_CHROME_LAYER_ATTR = 'data-rcb-sel-chrome-layer';
/** Scene-space align guides on the chrome layer (same parent as path chrome — no browser-zoom drift). */
const ALIGN_GUIDES_ATTR = 'data-rcb-align-guides';
const SEL_HANDLE_VIS_PX = 8;
const SEL_HANDLE_HIT_PX = 18;
const SEL_LINE_EP_VIS_PX = 8;
const SEL_LINE_EP_HALO_PX = 22;
const SEL_LINE_EP_HIT_PX = 28;
const SEL_ROTATE_HIT_PX = 22;
const SEL_ROTATE_GAP_PX = 2;
const SEL_EP_HOVER_STYLE = 'g.sel-hit:hover > .sel-ep-halo { opacity: 1; }';

function ensureSelEpHoverStyle(root: SVGSVGElement) {
  if (root.querySelector('style[data-rcb-sel-ep-style]')) return;
  const style = document.createElementNS(SVG_NS, 'style');
  style.setAttribute('data-rcb-sel-ep-style', '1');
  style.textContent = SEL_EP_HOVER_STYLE;
  root.insertBefore(style, root.firstChild);
}

/** Local (box) → world, matching host chrome rotate-about-center. */
function localPointToWorld(
  lx: number,
  ly: number,
  box: SceneBox,
  angleDeg: number
): { x: number; y: number } {
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const cx = w / 2;
  const cy = h / 2;
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = lx - cx;
  const dy = ly - cy;
  return {
    x: box.left + cx + dx * cos - dy * sin,
    y: box.top + cy + dx * sin + dy * cos,
  };
}

/** Place AABB so local point maps to a world point under `angleDeg`. */
function boxFromLocalAnchor(
  localX: number,
  localY: number,
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  angleDeg: number
): SceneBox {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cx = w / 2;
  const cy = h / 2;
  const rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = localX - cx;
  const dy = localY - cy;
  const centerX = worldX - (dx * cos - dy * sin);
  const centerY = worldY - (dx * sin + dy * cos);
  return { left: centerX - cx, top: centerY - cy, width: w, height: h };
}

function ensureSelChromeLayer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const world = document.querySelector('[data-rcb-world="1"]') as HTMLElement | null;
  if (!world) return null;
  let layer = world.querySelector(
    `:scope > [${SEL_CHROME_LAYER_ATTR}]`
  ) as HTMLElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.setAttribute(SEL_CHROME_LAYER_ATTR, '1');
    layer.className = 'pointer-events-none absolute left-0 top-0 overflow-visible';
    layer.style.zIndex = '1000000';
    layer.style.width = '0';
    layer.style.height = '0';
    world.appendChild(layer);
  }
  // Always last among world children so chrome paints above every shape host.
  if (world.lastElementChild !== layer) world.appendChild(layer);
  return layer;
}

/** Same quantize as fitInfiniteSvgToContent — keeps guides locked to host ink under browser zoom. */
function quantScene(n: number) {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Orange align guides on the world chrome layer (scene coords, camera CSS scale).
 * Same mount + stroke sizing as path control chrome (`1.5 / camera.zoom`).
 */
function syncChromeLayerAlignGuides(guides: AlignGuide[], stroke: number, inv: number) {
  const layer = ensureSelChromeLayer();
  if (!layer) return;

  const align = guides.filter((g) => g.kind !== 'gap' && g.kind !== 'size');
  let root = layer.querySelector(
    `:scope > svg[${ALIGN_GUIDES_ATTR}]`
  ) as SVGSVGElement | null;

  if (!align.length) {
    try {
      root?.remove();
    } catch {
      /* ignore */
    }
    return;
  }

  // Same × sizing as path aux chrome — screen-constant under camera scale(z).
  const halfCross = Math.max(stroke * 1.25, 2.5 * inv);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const pad = halfCross + stroke + 2 * inv;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const g of align) {
    const a = Math.min(g.from, g.to);
    const b = Math.max(g.from, g.to);
    if (g.orient === 'v') {
      grow(g.pos, a);
      grow(g.pos, b);
      for (const y of g.marks?.length ? g.marks : [a, b]) grow(g.pos, y);
    } else {
      grow(a, g.pos);
      grow(b, g.pos);
      for (const x of g.marks?.length ? g.marks : [a, b]) grow(x, g.pos);
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    try {
      root?.remove();
    } catch {
      /* ignore */
    }
    return;
  }

  const left = quantScene(minX);
  const top = quantScene(minY);
  const w = Math.max(1, quantScene(maxX - minX));
  const h = Math.max(1, quantScene(maxY - minY));

  if (!root) {
    root = document.createElementNS(SVG_NS, 'svg');
    root.setAttribute(ALIGN_GUIDES_ATTR, '1');
    root.setAttribute('overflow', 'visible');
    root.setAttribute('preserveAspectRatio', 'none');
    root.style.position = 'absolute';
    root.style.overflow = 'visible';
    root.style.pointerEvents = 'none';
    root.style.display = 'block';
    layer.appendChild(root);
  }

  root.setAttribute('width', String(w));
  root.setAttribute('height', String(h));
  root.setAttribute('viewBox', `${left} ${top} ${w} ${h}`);
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;

  while (root.firstChild) root.removeChild(root.firstChild);

  const color = SPACING_MEASURE_COLOR;
  for (let i = 0; i < align.length; i++) {
    const g = align[i];
    const a = Math.min(g.from, g.to);
    const b = Math.max(g.from, g.to);
    const marks = Array.from(
      new Set((g.marks?.length ? g.marks : [a, b]).map((n) => quantScene(n)))
    );
    const len = Math.max(0, b - a);
    const group = document.createElementNS(SVG_NS, 'g');

    if (g.orient === 'v') {
      const x = quantScene(g.pos);
      if (len >= stroke) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(x));
        line.setAttribute('y1', String(quantScene(a)));
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(quantScene(b)));
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', String(stroke));
        line.setAttribute('stroke-linecap', 'butt');
        group.appendChild(line);
      }
      for (const y of marks) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute(
          'd',
          `M${x - halfCross} ${y - halfCross} L${x + halfCross} ${y + halfCross} M${x + halfCross} ${y - halfCross} L${x - halfCross} ${y + halfCross}`
        );
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', String(stroke));
        p.setAttribute('stroke-linecap', 'butt');
        group.appendChild(p);
      }
    } else {
      const y = quantScene(g.pos);
      if (len >= stroke) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(quantScene(a)));
        line.setAttribute('y1', String(y));
        line.setAttribute('x2', String(quantScene(b)));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', String(stroke));
        line.setAttribute('stroke-linecap', 'butt');
        group.appendChild(line);
      }
      for (const x of marks) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute(
          'd',
          `M${x - halfCross} ${y - halfCross} L${x + halfCross} ${y + halfCross} M${x + halfCross} ${y - halfCross} L${x - halfCross} ${y + halfCross}`
        );
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', String(stroke));
        p.setAttribute('stroke-linecap', 'butt');
        group.appendChild(p);
      }
    }
    root.appendChild(group);
  }
}

function clearChromeLayerAlignGuides() {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll(`svg[${ALIGN_GUIDES_ATTR}]`)
    .forEach((n) => {
      try {
        n.remove();
      } catch {
        /* ignore */
      }
    });
}

/** Align guides on the chrome layer (scene coords under world CSS scale). */
function ChromeAlignGuidesSvg({ guides }: { guides: AlignGuide[] }) {
  const camera = useRcbCamera();
  // Match ShapeOutlineSvg / path control stroke — camera zoom only, not browser zoom.
  const z = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / z;
  const stroke = 1.5 * inv;
  const key = guides
    .filter((g) => g.kind !== 'gap' && g.kind !== 'size')
    .map(
      (g) =>
        `${g.orient}:${g.pos}:${g.from}:${g.to}:${(g.marks || []).join(',')}:${g.center ? 1 : 0}`
    )
    .join('|');

  useLayoutEffect(() => {
    syncChromeLayerAlignGuides(guides, stroke, inv);
  }, [key, stroke, inv, guides]);

  useEffect(() => () => clearChromeLayerAlignGuides(), []);

  return null;
}

function clearHostSelOutline(nodeId: string) {
  const host = getShapeHost(nodeId);
  const el = host?.el || getSharedNodeEls()?.get(nodeId);
  const scopes: Array<Element | null | undefined> = [
    el,
    host?.root,
    el?.parentElement,
    typeof document !== 'undefined'
      ? document.querySelector(`[${SEL_CHROME_LAYER_ATTR}]`)
      : null,
  ];
  const edgeForSel = `g[data-rcb-sel-edge-for="${CSS.escape(nodeId)}"]`;
  for (const scope of scopes) {
    if (!scope || typeof scope.querySelectorAll !== 'function') continue;
    scope
      .querySelectorAll(
        `[${SEL_OUTLINE_ATTR}="${CSS.escape(nodeId)}"],[${SEL_CHROME_ATTR}="${CSS.escape(nodeId)}"],[${SEL_EDGE_ATTR}="${CSS.escape(nodeId)}"],[${SEL_BADGE_ATTR}="${CSS.escape(nodeId)}"],${edgeForSel}`
      )
      .forEach((n) => {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      });
  }
}

function readBaselinePathD(baseline: SVGElement | null, fallback: string): string {
  if (!baseline) return fallback;
  const tag = baseline.tagName.toLowerCase();
  if (tag === 'path') {
    const d = baseline.getAttribute('d') || '';
    return d.trim().length >= 2 ? d : fallback;
  }
  if (tag === 'line') {
    const x1 = Number(baseline.getAttribute('x1') || 0);
    const y1 = Number(baseline.getAttribute('y1') || 0);
    const x2 = Number(baseline.getAttribute('x2') || 0);
    const y2 = Number(baseline.getAttribute('y2') || 0);
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  return fallback;
}

/** Path chrome `d` — prefer live host baseline, else attrs path. */
function readHostOutlinePathD(
  _el: SVGElement | null | undefined,
  baseline: SVGElement | null,
  o: ShapeOutlineItem
): string {
  return readBaselinePathD(baseline, o.pathD);
}

function pathLocalEndpoints(
  d: string,
  w: number,
  h: number,
  mode: 'path' | 'shaft' = 'path'
): [[number, number], [number, number]] {
  const midY = h / 2;
  const fallback: [[number, number], [number, number]] = [
    [0, midY],
    [Math.max(1, w), midY],
  ];
  // Line / arrow share AABB shaft ends (matches world SelectionChrome line variant).
  if (mode === 'shaft') return fallback;
  const raw = String(d || '').trim();
  if (!raw || typeof document === 'undefined') return fallback;
  try {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', raw);
    const len = el.getTotalLength?.() ?? 0;
    if (!(len > 0)) return fallback;
    const a = el.getPointAtLength(0);
    const b = el.getPointAtLength(len);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return fallback;
    return [
      [a.x, a.y],
      [b.x, b.y],
    ];
  } catch {
    return fallback;
  }
}

/** Line / arrow only — shaft endpoint knobs. Pen / pencil / path use AABB control box. */
function nodeUsesOpenStrokeEndpoints(node: any): boolean {
  if (!node) return false;
  const t = String(node.attrs?.shapeType || '');
  return t === 'line' || t === 'arrow';}

/**
 * Orange align/spacing on the world chrome twin (same layer as blue path —
 * above all shape hosts, so not occluded). Local path coords inside the chrome
 * `<g>` (same transform as the silhouette). Never inject into host paint —
 * that expands getBBox / fitInfiniteSvg and causes drag jitter.
 */
function appendHostAuxLines(
  chrome: SVGGElement,
  o: ShapeOutlineItem,
  stroke: number,
  inv: number
) {
  const color = SPACING_MEASURE_COLOR;
  const dashArr = `${stroke * 3.5} ${stroke * 3}`;
  const arrow = Math.max(stroke * 2, 3.5 * inv);
  const halfCross = Math.max(stroke * 1.25, 2.5 * inv);

  chrome
    .querySelectorAll(
      `[${SEL_EDGE_ATTR}],[${SEL_BADGE_ATTR}],g[data-rcb-sel-edge-for="${CSS.escape(o.id)}"]`
    )
    .forEach((n) => {
      try {
        n.remove();
      } catch {
        /* ignore */
      }
    });
  // Drop any leftover scene-space aux sibling under the chrome svg root.
  const root = chrome.ownerSVGElement;
  root
    ?.querySelectorAll?.(
      `:scope > g[data-rcb-sel-edge-for="${CSS.escape(o.id)}"],:scope > [${SEL_EDGE_ATTR}],:scope > [${SEL_BADGE_ATTR}]`
    )
    .forEach((n) => {
      try {
        n.remove();
      } catch {
        /* ignore */
      }
    });

  let layer = chrome.querySelector(
    `:scope > g[data-rcb-sel-edge-for="${CSS.escape(o.id)}"]`
  ) as SVGGElement | null;
  if (!layer) {
    layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute(SEL_EDGE_ATTR, 'layer');
    layer.setAttribute('data-rcb-sel-edge-for', o.id);
    layer.setAttribute('pointer-events', 'none');
    chrome.appendChild(layer);
  } else {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
  }

  function appendLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashed?: boolean
  ) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute(SEL_EDGE_ATTR, o.id);
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', String(stroke));
    line.setAttribute('stroke-linecap', 'butt');
    line.setAttribute('pointer-events', 'none');
    if (dashed) line.setAttribute('stroke-dasharray', dashArr);
    layer!.appendChild(line);
  }

  function appendArrowHeads(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (!(len > 0.05)) return;
    const head = Math.min(arrow, Math.max(stroke * 2, Math.min(len * 0.28, arrow)));
    const wing = head * 0.55;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const mk = (d: string) => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute(SEL_EDGE_ATTR, o.id);
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', String(stroke));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('pointer-events', 'none');
      layer!.appendChild(p);
    };
    if (horizontal) {
      const dir = dx >= 0 ? 1 : -1;
      mk(
        `M${x1} ${y1} L${x1 + dir * head} ${y1 - wing} M${x1} ${y1} L${x1 + dir * head} ${y1 + wing}`
      );
      mk(
        `M${x2} ${y2} L${x2 - dir * head} ${y2 - wing} M${x2} ${y2} L${x2 - dir * head} ${y2 + wing}`
      );
    } else {
      const dir = dy >= 0 ? 1 : -1;
      mk(
        `M${x1} ${y1} L${x1 - wing} ${y1 + dir * head} M${x1} ${y1} L${x1 + wing} ${y1 + dir * head}`
      );
      mk(
        `M${x2} ${y2} L${x2 - wing} ${y2 - dir * head} M${x2} ${y2} L${x2 + wing} ${y2 - dir * head}`
      );
    }
  }

  function appendCross(x: number, y: number) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute(SEL_EDGE_ATTR, o.id);
    p.setAttribute(
      'd',
      `M${x - halfCross} ${y - halfCross} L${x + halfCross} ${y + halfCross} M${x + halfCross} ${y - halfCross} L${x - halfCross} ${y + halfCross}`
    );
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', String(stroke));
    p.setAttribute('stroke-linecap', 'butt');
    p.setAttribute('pointer-events', 'none');
    layer!.appendChild(p);
  }

  function appendBadge(b: NonNullable<ShapeOutlineItem['auxBadges']>[number]) {
    const fontSize = 11 * inv;
    const padX = 5.5 * inv;
    const padY = 2.25 * inv;
    const radius = 4 * inv;
    const gap = 6 * inv;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute(SEL_BADGE_ATTR, o.id);
    g.setAttribute('pointer-events', 'none');

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = b.text;
    g.appendChild(text);
    layer!.appendChild(g);

    let tw = Math.max(14 * inv, b.text.length * fontSize * 0.56);
    let th = fontSize * 1.2;
    try {
      const bb = text.getBBox();
      if (bb.width > 0) tw = bb.width;
      if (bb.height > 0) th = bb.height;
    } catch {
      /* ignore */
    }
    const bw = tw + padX * 2;
    const bh = th + padY * 2;
    let cx = b.x;
    let cy = b.y;
    const anchor = b.anchor || 'center';
    if (anchor === 'below') cy = b.y + gap + bh / 2;
    else if (anchor === 'above') cy = b.y - gap - bh / 2;
    else if (anchor === 'right') cx = b.x + gap + bw / 2;

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(cx - bw / 2));
    rect.setAttribute('y', String(cy - bh / 2));
    rect.setAttribute('width', String(bw));
    rect.setAttribute('height', String(bh));
    rect.setAttribute('rx', String(radius));
    rect.setAttribute('ry', String(radius));
    rect.setAttribute('fill', b.fill);
    g.insertBefore(rect, text);
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy));
  }

  for (const seg of o.auxSegs || []) {
    if (seg.cross) continue;
    if (seg.arrowsOnly) {
      appendArrowHeads(seg.x1, seg.y1, seg.x2, seg.y2);
      continue;
    }
    appendLine(seg.x1, seg.y1, seg.x2, seg.y2, seg.dashed);
    if (seg.arrows && !seg.dashed) appendArrowHeads(seg.x1, seg.y1, seg.x2, seg.y2);
  }
  for (const seg of o.auxSegs || []) {
    if (seg.cross) appendCross(seg.x1, seg.y1);
  }
  for (const b of o.auxBadges || []) appendBadge(b);
}

function formatGuideBadgePx(n: number) {
  return String(Math.round(n));
}

function worldSegToLocal(
  box: SceneBox,
  seg: { x1: number; y1: number; x2: number; y2: number }
) {
  return {
    x1: seg.x1 - box.left,
    y1: seg.y1 - box.top,
    x2: seg.x2 - box.left,
    y2: seg.y2 - box.top,
  };
}

type HostAuxSeg = NonNullable<ShapeOutlineItem['auxSegs']>[number];

/** Align guides → host-local segs (+ × marks) using path edge coords as-is. */
function alignGuidesToLocalSegs(
  guides: AlignGuide[],
  box: SceneBox
): HostAuxSeg[] {
  const out: HostAuxSeg[] = [];
  for (const g of guides) {
    if (g.kind === 'gap' || g.kind === 'size') continue;
    const a = Math.min(g.from, g.to);
    const b = Math.max(g.from, g.to);
    const marks = g.marks?.length ? g.marks : [a, b];
    if (g.orient === 'v') {
      if (b - a > 0.05) {
        out.push({ ...worldSegToLocal(box, { x1: g.pos, y1: a, x2: g.pos, y2: b }) });
      }
      for (const y of marks) {
        const local = worldSegToLocal(box, { x1: g.pos, y1: y, x2: g.pos, y2: y });
        out.push({ x1: local.x1, y1: local.y1, x2: local.x1, y2: local.y1, cross: true });
      }
    } else {
      if (b - a > 0.05) {
        out.push({ ...worldSegToLocal(box, { x1: a, y1: g.pos, x2: b, y2: g.pos }) });
      }
      for (const x of marks) {
        const local = worldSegToLocal(box, { x1: x, y1: g.pos, x2: x, y2: g.pos });
        out.push({ x1: local.x1, y1: local.y1, x2: local.x1, y2: local.y1, cross: true });
      }
    }
  }
  return out;
}

/** Spacing measures → host-local shafts (arrows on gap, dashed on offset). */
function measuresToLocalSegs(measures: SpacingMeasure[], box: SceneBox): HostAuxSeg[] {
  const out: HostAuxSeg[] = [];
  for (const m of measures) {
    if (!(m.distance >= 0.05)) continue;
    const dashed = m.kind === 'offset';
    out.push({
      ...worldSegToLocal(box, m),
      dashed,
      arrows: !dashed,
    });
    for (const d of m.dashes || []) {
      out.push({ ...worldSegToLocal(box, d), dashed: true });
    }
  }
  return out;
}

/**
 * Badge on the path line (fig.2): sit on align/path coords, not a screen reverse-calc.
 * Prefer intersection with a crossing path guide / mark so h+v path lines stack.
 */
function badgeOnPathLine(
  m: SpacingMeasure,
  pinned: AlignGuide | null,
  align: AlignGuide[]
): { x: number; y: number; anchor: 'below' | 'right' | 'center' } {
  if (pinned?.orient === 'h') {
    const lo = Math.min(m.x1, m.x2);
    const hi = Math.max(m.x1, m.x2);
    let x = m.mx;
    // Crossing vertical path guide → badge on that path X (压到路径中线).
    for (const g of align) {
      if (g.orient !== 'v' || g.kind === 'gap' || g.kind === 'size') continue;
      if (g.pos >= lo - 1 && g.pos <= hi + 1) {
        x = g.pos;
        break;
      }
    }
    if (x === m.mx && pinned.marks?.length) {
      const hits = pinned.marks.filter((mk) => mk >= lo - 1 && mk <= hi + 1);
      if (hits.length) x = hits.reduce((a, b) => a + b, 0) / hits.length;
    }
    return { x, y: pinned.pos, anchor: 'below' };
  }
  if (pinned?.orient === 'v') {
    const lo = Math.min(m.y1, m.y2);
    const hi = Math.max(m.y1, m.y2);
    let y = m.my;
    for (const g of align) {
      if (g.orient !== 'h' || g.kind === 'gap' || g.kind === 'size') continue;
      if (g.pos >= lo - 1 && g.pos <= hi + 1) {
        y = g.pos;
        break;
      }
    }
    if (y === m.my && pinned.marks?.length) {
      const hits = pinned.marks.filter((mk) => mk >= lo - 1 && mk <= hi + 1);
      if (hits.length) y = hits.reduce((a, b) => a + b, 0) / hits.length;
    }
    return { x: pinned.pos, y, anchor: 'right' };
  }
  const horizontal = m.side === 'left' || m.side === 'right';
  return { x: m.mx, y: m.my, anchor: horizontal ? 'below' : 'right' };
}

/**
 * Align shafts + spacing on the mover host, all in path geom coords (L/T/R/B).
 * Same mirror as path chrome — no stage scene→screen reverse calc.
 */
function buildUnifiedGuideAux(
  guides: AlignGuide[],
  measures: SpacingMeasure[],
  box: SceneBox
): {
  aux: HostAuxSeg[];
  badgeMeasures: SpacingMeasure[];
  badges: NonNullable<ShapeOutlineItem['auxBadges']>;
} {
  const align = guides.filter((g) => g.kind !== 'gap' && g.kind !== 'size');
  const aux: HostAuxSeg[] = alignGuidesToLocalSegs(guides, box);
  const badgeMeasures: SpacingMeasure[] = [];
  const badges: NonNullable<ShapeOutlineItem['auxBadges']> = [];

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    if (!(m.distance >= 0.05)) continue;

    if (m.kind === 'offset') {
      badgeMeasures.push(m);
      aux.push(...measuresToLocalSegs([m], box));
      const pt = badgeOnPathLine(m, null, align);
      badges.push({
        x: pt.x - box.left,
        y: pt.y - box.top,
        text: formatGuideBadgePx(m.distance),
        fill: SPACING_MEASURE_COLOR,
        anchor: pt.anchor,
      });
      continue;
    }

    const horizontal = m.side === 'left' || m.side === 'right';
    const mAxis = horizontal ? (m.y1 + m.y2) / 2 : (m.x1 + m.x2) / 2;
    const gapLo = horizontal ? Math.min(m.x1, m.x2) : Math.min(m.y1, m.y2);
    const gapHi = horizontal ? Math.max(m.x1, m.x2) : Math.max(m.y1, m.y2);

    let pinned: AlignGuide | null = null;
    let best = Infinity;
    for (const g of align) {
      if (horizontal && g.orient !== 'h') continue;
      if (!horizontal && g.orient !== 'v') continue;
      const gLo = Math.min(g.from, g.to);
      const gHi = Math.max(g.from, g.to);
      if (gLo > gapLo + 2 || gHi < gapHi - 2) continue;
      const d = Math.abs(g.pos - mAxis);
      const score = d + (g.center ? 0 : 1e3);
      if (score < best) {
        best = score;
        pinned = g;
      }
    }
    const mergeSlop = Math.max(48, (horizontal ? box.height : box.width) * 0.6);
    let drawn: SpacingMeasure = m;
    if (pinned && (pinned.center ? best : best - 1e3) < mergeSlop) {
      const pos = pinned.pos;
      drawn = horizontal
        ? { ...m, y1: pos, y2: pos, my: pos }
        : { ...m, x1: pos, x2: pos, mx: pos };
      badgeMeasures.push(drawn);
      aux.push({
        ...worldSegToLocal(box, drawn),
        arrows: true,
        arrowsOnly: true,
      });
    } else {
      badgeMeasures.push(m);
      aux.push(...measuresToLocalSegs([m], box));
    }

    const pt = badgeOnPathLine(drawn, pinned, align);
    badges.push({
      x: pt.x - box.left,
      y: pt.y - box.top,
      text: formatGuideBadgePx(drawn.distance),
      fill: SPACING_MEASURE_COLOR,
      anchor: pt.anchor,
    });
  }

  return { aux, badgeMeasures, badges };
}

function syncHostSelHandles(
  chrome: SVGGElement,
  o: ShapeOutlineItem,
  stroke: number,
  inv: number,
  outlineD: string
) {
  const w = Math.max(1, o.box.width);
  const h = Math.max(1, o.box.height);
  const color = o.color || '#3388ff';
  const handleVis = SEL_HANDLE_VIS_PX * inv;
  const handleHit = SEL_HANDLE_HIT_PX * inv;
  const halfVis = handleVis / 2;
  const halfHit = handleHit / 2;
  const lineEpVis = SEL_LINE_EP_VIS_PX * inv;
  const lineEpHit = SEL_LINE_EP_HIT_PX * inv;
  const rotateHit = SEL_ROTATE_HIT_PX * inv;
  const rotateGap = SEL_ROTATE_GAP_PX * inv;

  // Drop previous handle/rotate/box children (keep path silhouette outline).
  chrome
    .querySelectorAll(`g.sel-hit,[data-sel-handle],[data-rcb-sel-knob],[${SEL_BOX_ATTR}]`)
    .forEach((n) => n.remove());

  if (o.lineMode) {
    const [start, end] = pathLocalEndpoints(
      outlineD,
      w,
      h,
      o.shaftEndpoints ? 'shaft' : 'path'
    );
    const knobs: Array<[string, number, number]> = [
      ['w', start[0], start[1]],
      ['e', end[0], end[1]],
    ];
    const lineEpHalo = SEL_LINE_EP_HALO_PX * inv;
    const root = chrome.ownerSVGElement as SVGSVGElement | null;
    if (root) ensureSelEpHoverStyle(root);
    for (const [dir, lx, ly] of knobs) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sel-hit');
      g.setAttribute('transform', `translate(${lx} ${ly})`);

      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('class', 'sel-ep-halo');
      halo.setAttribute('r', String(lineEpHalo / 2));
      halo.setAttribute('fill', `${color}59`);
      halo.setAttribute('opacity', '0');
      halo.setAttribute('pointer-events', 'none');
      g.appendChild(halo);

      const vis = document.createElementNS(SVG_NS, 'circle');
      vis.setAttribute('data-rcb-sel-knob', '1');
      vis.setAttribute('data-rcb-sel-endpoint', dir);
      vis.setAttribute('r', String(Math.max(0.01, lineEpVis / 2 - stroke / 2)));
      vis.setAttribute('fill', '#fff');
      vis.setAttribute('stroke', color);
      vis.setAttribute('stroke-width', String(stroke));
      vis.setAttribute('pointer-events', 'none');
      g.appendChild(vis);

      const hit = document.createElementNS(SVG_NS, 'rect');
      hit.setAttribute('data-sel-handle', 'resize');
      hit.setAttribute('data-resize', dir);
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', `endpoint-${dir}`);
      hit.setAttribute('x', String(-lineEpHit / 2));
      hit.setAttribute('y', String(-lineEpHit / 2));
      hit.setAttribute('width', String(lineEpHit));
      hit.setAttribute('height', String(lineEpHit));
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('pointer-events', 'all');
      hit.style.cursor = 'grab';
      g.appendChild(hit);

      chrome.appendChild(g);
    }
    return;
  }

  // Control box + knobs (pen/pencil/path). No path silhouette when selected —
  // that is toggled via showPath on the outline.
  const box = document.createElementNS(SVG_NS, 'rect');
  box.setAttribute(SEL_BOX_ATTR, o.id);
  box.setAttribute('x', '0');
  box.setAttribute('y', '0');
  box.setAttribute('width', String(w));
  box.setAttribute('height', String(h));
  box.setAttribute('fill', 'none');
  box.setAttribute('stroke', color);
  box.setAttribute('stroke-width', String(stroke));
  box.setAttribute('pointer-events', 'none');
  chrome.appendChild(box);

  const knobs: Array<[string, number, number]> = [
    ['nw', 0, 0],
    ['n', w / 2, 0],
    ['ne', w, 0],
    ['e', w, h / 2],
    ['se', w, h],
    ['s', w / 2, h],
    ['sw', 0, h],
    ['w', 0, h / 2],
  ];

  for (const [dir, lx, ly] of knobs) {
    const visFill = document.createElementNS(SVG_NS, 'rect');
    visFill.setAttribute('data-rcb-sel-knob', '1');
    visFill.setAttribute('x', String(lx - halfVis));
    visFill.setAttribute('y', String(ly - halfVis));
    visFill.setAttribute('width', String(handleVis));
    visFill.setAttribute('height', String(handleVis));
    visFill.setAttribute('fill', '#ffffff');
    visFill.setAttribute('pointer-events', 'none');
    chrome.appendChild(visFill);

    const visStroke = document.createElementNS(SVG_NS, 'rect');
    visStroke.setAttribute('data-rcb-sel-knob', '1');
    visStroke.setAttribute('x', String(lx - halfVis));
    visStroke.setAttribute('y', String(ly - halfVis));
    visStroke.setAttribute('width', String(handleVis));
    visStroke.setAttribute('height', String(handleVis));
    visStroke.setAttribute('fill', 'none');
    visStroke.setAttribute('stroke', color);
    visStroke.setAttribute('stroke-width', String(stroke));
    visStroke.setAttribute('pointer-events', 'none');
    chrome.appendChild(visStroke);

    const hit = document.createElementNS(SVG_NS, 'rect');
    hit.setAttribute('data-sel-handle', 'resize');
    hit.setAttribute('data-resize', dir);
    hit.setAttribute('x', String(lx - halfHit));
    hit.setAttribute('y', String(ly - halfHit));
    hit.setAttribute('width', String(handleHit));
    hit.setAttribute('height', String(handleHit));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('pointer-events', 'all');
    hit.style.cursor = 'nwse-resize';
    chrome.appendChild(hit);
  }

  if (o.showRotate) {
    const corners: Array<['nw' | 'ne' | 'se' | 'sw', number, number]> = [
      ['nw', 0, 0],
      ['ne', w, 0],
      ['se', w, h],
      ['sw', 0, h],
    ];
    const cx = w / 2;
    const cy = h / 2;
    for (const [corner, lx, ly] of corners) {
      const vx = lx - cx;
      const vy = ly - cy;
      const len = Math.hypot(vx, vy) || 1;
      const push = handleHit / 2 + rotateGap + rotateHit / 2;
      const hx = lx + (vx / len) * push;
      const hy = ly + (vy / len) * push;
      const hit = document.createElementNS(SVG_NS, 'rect');
      hit.setAttribute('data-sel-handle', 'rotate');
      hit.setAttribute('data-rotate-corner', corner);
      hit.setAttribute('x', String(hx - rotateHit / 2));
      hit.setAttribute('y', String(hy - rotateHit / 2));
      hit.setAttribute('width', String(rotateHit));
      hit.setAttribute('height', String(rotateHit));
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('pointer-events', 'all');
      hit.style.cursor = 'grab';
      chrome.appendChild(hit);
    }
  }
}

/**
 * Blue path outline (+ handles) on the world chrome layer (z above all hosts).
 *
 * Accuracy: mirror the shape host SVG's CSS box + viewBox, and copy the paint
 * element's `transform` — same scene mapping as host-injected chrome (no zoom drift).
 * Occlusion: paint lives on the top world layer so sibling hosts cannot cover it.
 */
function syncHostSelOutline(o: ShapeOutlineItem, stroke: number, inv: number): boolean {
  const layer = ensureSelChromeLayer();
  if (!layer) return false;

  const host = getShapeHost(o.id);
  const hostRoot = host?.root as SVGSVGElement | null | undefined;
  const el = (host?.el || getSharedNodeEls()?.get(o.id)) as SVGElement | null | undefined;
  const baseline = el
    ? (el.getAttribute?.('data-baseline') === '1' ? el : null) ||
      (el.querySelector?.(':scope > [data-baseline="1"]') as SVGElement | null) ||
      (el.querySelector?.('[data-baseline="1"]') as SVGElement | null)
    : null;

  const d = readHostOutlinePathD(el, baseline, o);
  if (!d) {
    clearHostSelOutline(o.id);
    return false;
  }

  // Strip any leftover chrome still injected inside the shape host.
  if (el) {
    const hostParent =
      (baseline?.parentElement as Element | null) ||
      (el.tagName.toLowerCase() === 'g' ? el : el.parentElement);
    hostParent
      ?.querySelectorAll?.(
        `[${SEL_OUTLINE_ATTR}="${CSS.escape(o.id)}"],[${SEL_CHROME_ATTR}="${CSS.escape(o.id)}"]`
      )
      .forEach((n) => {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      });
  }

  const w = Math.max(1, o.box.width);
  const h = Math.max(1, o.box.height);
  const angle = Number(o.angle) || 0;
  const pad = Math.max(stroke * 8, SEL_HANDLE_HIT_PX * inv, SEL_ROTATE_HIT_PX * inv + SEL_ROTATE_GAP_PX * inv);

  let root = layer.querySelector(
    `:scope > svg[${SEL_CHROME_ATTR}="${CSS.escape(o.id)}"]`
  ) as SVGSVGElement | null;
  if (!root) {
    root = document.createElementNS(SVG_NS, 'svg');
    root.setAttribute(SEL_CHROME_ATTR, o.id);
    root.setAttribute('overflow', 'visible');
    root.setAttribute('preserveAspectRatio', 'none');
    root.style.position = 'absolute';
    root.style.overflow = 'visible';
    root.style.pointerEvents = 'none';
    root.style.display = 'block';
    layer.appendChild(root);
  }

  // Prefer an exact twin of the host infinite SVG viewport (same left/top/viewBox
  // quantization). Fallback: geometry box + pad when the host is not mounted yet.
  const hostViewBox = hostRoot?.getAttribute?.('viewBox') || '';
  const hostCssLeft = hostRoot?.style?.left || '';
  const hostCssTop = hostRoot?.style?.top || '';
  const hostCssW = hostRoot?.style?.width || '';
  const hostCssH = hostRoot?.style?.height || '';
  const mirrored = Boolean(hostRoot && hostViewBox && hostCssLeft && hostCssTop);

  if (mirrored && hostRoot) {
    root.style.left = hostCssLeft;
    root.style.top = hostCssTop;
    root.style.width = hostCssW || hostRoot.style.width;
    root.style.height = hostCssH || hostRoot.style.height;
    const attrW = hostRoot.getAttribute('width');
    const attrH = hostRoot.getAttribute('height');
    if (attrW) root.setAttribute('width', attrW);
    if (attrH) root.setAttribute('height', attrH);
    root.setAttribute('viewBox', hostViewBox);
  } else {
    const left = o.box.left;
    const top = o.box.top;
    root.style.left = `${left - pad}px`;
    root.style.top = `${top - pad}px`;
    root.style.width = `${w + pad * 2}px`;
    root.style.height = `${h + pad * 2}px`;
    root.setAttribute('width', String(w + pad * 2));
    root.setAttribute('height', String(h + pad * 2));
    root.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
  }

  let chrome = root.querySelector(`:scope > g[${SEL_CHROME_ATTR}="body"]`) as SVGGElement | null;
  if (!chrome) {
    chrome = document.createElementNS(SVG_NS, 'g');
    chrome.setAttribute(SEL_CHROME_ATTR, 'body');
    chrome.setAttribute('pointer-events', 'none');
    root.appendChild(chrome);
  }

  // Same transform tree as ink (translate + rotate + flip) — not a re-derived angle.
  const hostTransform = el?.getAttribute?.('transform') || '';
  if (mirrored && hostTransform) {
    chrome.setAttribute('transform', hostTransform);
  } else if (mirrored) {
    // Host local origin is scene left/top even when transform attr is briefly empty.
    const hl = Number((el as any)?.__sceneLeft);
    const ht = Number((el as any)?.__sceneTop);
    chrome.setAttribute(
      'transform',
      `translate(${Number.isFinite(hl) ? hl : o.box.left} ${Number.isFinite(ht) ? ht : o.box.top})`
    );
  } else if (Math.abs(angle) > 0.01) {
    chrome.setAttribute('transform', `rotate(${angle} ${w / 2} ${h / 2})`);
  } else {
    chrome.removeAttribute('transform');
  }

  let outline = chrome.querySelector(
    `:scope > path[${SEL_OUTLINE_ATTR}="${CSS.escape(o.id)}"]`
  ) as SVGPathElement | null;
  if (!outline) {
    outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute(SEL_OUTLINE_ATTR, o.id);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('pointer-events', 'none');
    chrome.insertBefore(outline, chrome.firstChild);
  }

  rememberNodePath2D(o.id, d);
  outline.setAttribute('d', d);
  const showPath = o.showPath !== false;
  outline.setAttribute('stroke', showPath ? o.color || '#3388ff' : 'none');
  outline.setAttribute('stroke-width', String(stroke));
  const roundStroke = Boolean(o.lineMode || o.shaftEndpoints);
  outline.setAttribute('stroke-linejoin', roundStroke ? 'round' : 'miter');
  outline.setAttribute('stroke-linecap', roundStroke ? 'round' : 'butt');

  if (o.withHandles) syncHostSelHandles(chrome, o, stroke, inv, d);
  else {
    chrome
      .querySelectorAll(`g.sel-hit,[data-sel-handle],[data-rcb-sel-knob],[${SEL_BOX_ATTR}]`)
      .forEach((n) => n.remove());
  }

  const hasAux = Boolean(o.auxSegs?.length || o.auxBadges?.length);
  // Strip any leftover aux injected into the shape host (old path that caused
  // occlusion + fitInfiniteSvg jitter while dragging).
  el
    ?.querySelectorAll?.(
      `[${SEL_EDGE_ATTR}],[${SEL_BADGE_ATTR}],g[data-rcb-sel-edge-for="${CSS.escape(o.id)}"]`
    )
    .forEach((n) => {
      try {
        n.remove();
      } catch {
        /* ignore */
      }
    });
  if (hasAux) appendHostAuxLines(chrome, o, stroke, inv);
  else {
    chrome
      .querySelectorAll(
        `[${SEL_EDGE_ATTR}],[${SEL_BADGE_ATTR}],g[data-rcb-sel-edge-for="${CSS.escape(o.id)}"]`
      )
      .forEach((n) => {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      });
    root
      .querySelectorAll(
        `:scope > g[data-rcb-sel-edge-for="${CSS.escape(o.id)}"],:scope > [${SEL_EDGE_ATTR}],:scope > [${SEL_BADGE_ATTR}]`
      )
      .forEach((n) => {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      });
  }

  return true;
}

/** Path chrome on the world chrome layer (above hosts); geometry from host baseline. */
function ShapeOutlineSvg({ outlines }: { outlines: ShapeOutlineItem[] }) {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / z;
  const stroke = 1.5 * inv;
  const [hostEpoch, setHostEpoch] = useState(0);
  const outlineKey = outlines
    .map((o) => {
      const host = getShapeHost(o.id);
      const hostEl = (host?.el || getSharedNodeEls()?.get(o.id)) as any;
      const vb = host?.root?.getAttribute?.('viewBox') || '';
      const tf = hostEl?.getAttribute?.('transform') || '';
      const origin = `${Number(hostEl?.__sceneLeft) || o.box.left},${Number(hostEl?.__sceneTop) || o.box.top}`;
      const aux = (o.auxSegs || [])
        .map(
          (s) =>
            `${s.x1.toFixed(1)},${s.y1.toFixed(1)},${s.x2.toFixed(1)},${s.y2.toFixed(1)},${s.dashed ? 1 : 0}${s.arrows ? 'a' : ''}${s.arrowsOnly ? 'o' : ''}${s.cross ? 'x' : ''}`
        )
        .join(';');
      const badges = (o.auxBadges || [])
        .map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.text},${b.anchor || ''}`)
        .join(';');
      return `${o.id}:${o.pathD.length}:${o.pathD.slice(0, 24)}:${o.pathD.slice(-24)}:${o.box.left.toFixed(1)},${o.box.top.toFixed(1)},${o.box.width}x${o.box.height}:${o.angle.toFixed(2)}:${o.withHandles ? 1 : 0}:${o.showPath === false ? 0 : 1}:${o.lineMode ? 1 : 0}:${o.shaftEndpoints ? 1 : 0}:${o.showRotate ? 1 : 0}:${aux}:${badges}:${o.color || ''}:${vb}:${tf}:${origin}`;
    })
    .join('|');
  const outlinesRef = useRef(outlines);
  outlinesRef.current = outlines;

  useEffect(() => subscribeShapeHosts(() => setHostEpoch((n) => n + 1)), []);

  useLayoutEffect(() => {
    const current = outlinesRef.current;
    const active = new Set(current.map((o) => o.id));
    let pending = current.filter((o) => !syncHostSelOutline(o, stroke, inv));
    for (const h of listShapeHosts()) {
      if (!active.has(h.nodeId)) clearHostSelOutline(h.nodeId);
    }
    // Also clear world-layer chrome for ids that left the set (may not be in hosts).
    const layer = typeof document !== 'undefined'
      ? document.querySelector(`[${SEL_CHROME_LAYER_ATTR}]`)
      : null;
    layer?.querySelectorAll?.(`svg[${SEL_CHROME_ATTR}]`).forEach((n) => {
      const id = n.getAttribute(SEL_CHROME_ATTR);
      if (id && !active.has(id)) {
        try {
          n.remove();
        } catch {
          /* ignore */
        }
      }
    });

    let raf = 0;
    let tries = 0;
    const retry = () => {
      if (!pending.length) return;
      tries += 1;
      pending = pending.filter((o) => !syncHostSelOutline(o, stroke, inv));
      if (pending.length && tries < 120) raf = requestAnimationFrame(retry);
    };
    if (pending.length) raf = requestAnimationFrame(retry);

    return () => {
      cancelAnimationFrame(raf);
      const next = new Set(outlinesRef.current.map((o) => o.id));
      for (const id of active) {
        if (!next.has(id)) clearHostSelOutline(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlineKey, stroke, inv, hostEpoch]);

  useEffect(() => {
    return () => {
      for (const o of outlinesRef.current) clearHostSelOutline(o.id);
      // Keep the chrome layer for align guides; only drop orphan outline svgs.
    };
  }, []);

  return null;
}

export {
  liveShapeGeomBox,
  nodeUsesPathChrome,
  nodeUsesOpenStrokeEndpoints,
  pathLocalEndpoints,
  localPointToWorld,
  boxFromLocalAnchor,
  buildUnifiedGuideAux,
  ShapeOutlineSvg,
  ChromeAlignGuidesSvg,
};
