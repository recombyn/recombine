/**
 * Path indicator + path handles.
 *
 * Not the AABB control box (`SelectionChrome`). Twin the shape-host SVG viewport under
 * `[data-rcb-world]` so silhouette ink shares the paint transform tree — one scheme with
 * SelectionChrome (`left/top === viewBox`, screenPx/zoom), specialized for path accuracy.
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
import type { SceneBox } from './alignGuides';
import { cursorForRotate } from './rotateCornerCursor';

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
   * When false, skip the blue path stroke (handles/edges only).
   * Default true.
   */
  showPath?: boolean;
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
  if (world.lastElementChild !== layer) world.appendChild(layer);
  return layer;
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
    // Transparent corner hotzones only — rotate icon appears as the cursor, not on canvas.
    const corners: Array<['nw' | 'ne' | 'se' | 'sw', number, number, number]> = [
      ['nw', 0, 0, 0],
      ['ne', w, 0, 90],
      ['se', w, h, 180],
      ['sw', 0, h, 270],
    ];
    const cx = w / 2;
    const cy = h / 2;
    const angle = Number(o.angle) || 0;
    for (const [corner, lx, ly, iconDeg] of corners) {
      const vx = lx - cx;
      const vy = ly - cy;
      const len = Math.hypot(vx, vy) || 1;
      const push = handleHit / 2 + rotateGap + rotateHit / 2;
      const hx = lx + (vx / len) * push;
      const hy = ly + (vy / len) * push;
      const hit = document.createElementNS(SVG_NS, 'rect');
      hit.setAttribute('data-sel-handle', 'rotate');
      hit.setAttribute('data-rotate-corner', corner);
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', 'Rotate');
      hit.setAttribute('x', String(hx - rotateHit / 2));
      hit.setAttribute('y', String(hy - rotateHit / 2));
      hit.setAttribute('width', String(rotateHit));
      hit.setAttribute('height', String(rotateHit));
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('pointer-events', 'all');
      hit.style.cursor = cursorForRotate(iconDeg, angle);
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
      const hostEl = (host?.el || getSharedNodeEls()?.get(o.id)) as SVGElement | null | undefined;
      const baseline =
        hostEl &&
        ((hostEl.getAttribute?.('data-baseline') === '1' ? hostEl : null) ||
          (hostEl.querySelector?.(':scope > [data-baseline="1"]') as SVGElement | null) ||
          (hostEl.querySelector?.('[data-baseline="1"]') as SVGElement | null));
      // Prefer live host `d` so radius / tip previews re-sync chrome (attrs path stays stale mid-drag).
      const liveD = readBaselinePathD(baseline, o.pathD);
      const vb = host?.root?.getAttribute?.('viewBox') || '';
      const tf = hostEl?.getAttribute?.('transform') || '';
      const anyEl = hostEl as any;
      const origin = `${Number(anyEl?.__sceneLeft) || o.box.left},${Number(anyEl?.__sceneTop) || o.box.top}`;
      return `${o.id}:${liveD.length}:${liveD.slice(0, 24)}:${liveD.slice(-24)}:${o.box.left.toFixed(1)},${o.box.top.toFixed(1)},${o.box.width}x${o.box.height}:${o.angle.toFixed(2)}:${o.withHandles ? 1 : 0}:${o.showPath === false ? 0 : 1}:${o.lineMode ? 1 : 0}:${o.shaftEndpoints ? 1 : 0}:${o.showRotate ? 1 : 0}:${o.color || ''}:${vb}:${tf}:${origin}`;
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
  ShapeOutlineSvg,
};
