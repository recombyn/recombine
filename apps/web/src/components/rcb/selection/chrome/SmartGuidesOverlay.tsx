/**
 * Smart guides: Path2D on RcbSceneOverlayCanvas (same stack as pen / shape draw).
 * Scene coords only — no separate host/fallback SVG (those drift under browser zoom).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRcbCamera } from '@/components/rcb/camera/context';
import { CHROME_STROKE_PX } from '../SelectionChrome';
import { SMART_GUIDE_COLOR, type SmartGuideGap, type SmartGuideLine } from '../alignGuides';
import RcbSceneOverlayCanvas, {
  type RcbSceneOverlayCanvasHandle,
} from '@/components/rcb/canvas/RcbSceneOverlayCanvas';

const GUIDE_STROKE = SMART_GUIDE_COLOR;

function isGapGuide(g: SmartGuideLine): g is SmartGuideGap {
  return g.kind === 'gap';
}

function guideBounds(guides: SmartGuideLine[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of guides) {
    if (isGapGuide(g)) {
      if (g.axis === 'x') {
        minX = Math.min(minX, g.from, g.to);
        maxX = Math.max(maxX, g.from, g.to);
        minY = Math.min(minY, g.at);
        maxY = Math.max(maxY, g.at);
      } else {
        minY = Math.min(minY, g.from, g.to);
        maxY = Math.max(maxY, g.from, g.to);
        minX = Math.min(minX, g.at);
        maxX = Math.max(maxX, g.at);
      }
      continue;
    }
    if (g.axis === 'x') {
      minX = Math.min(minX, g.at);
      maxX = Math.max(maxX, g.at);
      minY = Math.min(minY, g.from, g.to);
      maxY = Math.max(maxY, g.from, g.to);
    } else {
      minY = Math.min(minY, g.at);
      maxY = Math.max(maxY, g.at);
      minX = Math.min(minX, g.from, g.to);
      maxX = Math.max(maxX, g.from, g.to);
    }
    for (const m of g.marks || []) {
      minX = Math.min(minX, m.x);
      maxX = Math.max(maxX, m.x);
      minY = Math.min(minY, m.y);
      maxY = Math.max(maxY, m.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function paintBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  inv: number,
  anchor: 'below' | 'right'
) {
  const fontSize = 11 * inv;
  const padX = 5.5 * inv;
  const padY = 2.25 * inv;
  const radius = 4 * inv;
  const gap = 6 * inv;
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  const tw = Math.max(14 * inv, ctx.measureText(String(text)).width);
  const th = fontSize * 1.2;
  const w = tw + padX * 2;
  const h = th + padY * 2;
  let cx = x;
  let cy = y;
  if (anchor === 'below') cy = y + gap + h / 2;
  else cx = x + gap + w / 2;

  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, radius);
  } else {
    ctx.rect(cx - w / 2, cy - h / 2, w, h);
  }
  ctx.fillStyle = GUIDE_STROKE;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), cx, cy);
}

function paintPathMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  arm: number,
  stroke: number
) {
  ctx.strokeStyle = GUIDE_STROKE;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x - arm, y - arm);
  ctx.lineTo(x + arm, y + arm);
  ctx.moveTo(x + arm, y - arm);
  ctx.lineTo(x - arm, y + arm);
  ctx.stroke();
}

function paintGuidesOnCtx(
  ctx: CanvasRenderingContext2D,
  guides: SmartGuideLine[],
  stroke: number,
  tip: number,
  inv: number
) {
  const markArm = 3.5 * inv;
  ctx.strokeStyle = GUIDE_STROKE;
  ctx.fillStyle = GUIDE_STROKE;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  for (const g of guides) {
    if (isGapGuide(g)) {
      const x0 = g.axis === 'x' ? Math.min(g.from, g.to) : g.at;
      const x1 = g.axis === 'x' ? Math.max(g.from, g.to) : g.at;
      const y0 = g.axis === 'y' ? Math.min(g.from, g.to) : g.at;
      const y1 = g.axis === 'y' ? Math.max(g.from, g.to) : g.at;
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(x0, g.at);
        ctx.lineTo(x1, g.at);
      } else {
        ctx.moveTo(g.at, y0);
        ctx.lineTo(g.at, y1);
      }
      ctx.stroke();

      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(x0 + tip, g.at - tip);
        ctx.lineTo(x0, g.at);
        ctx.lineTo(x0 + tip, g.at + tip);
        ctx.moveTo(x1 - tip, g.at - tip);
        ctx.lineTo(x1, g.at);
        ctx.lineTo(x1 - tip, g.at + tip);
      } else {
        ctx.moveTo(g.at - tip, y0 + tip);
        ctx.lineTo(g.at, y0);
        ctx.lineTo(g.at + tip, y0 + tip);
        ctx.moveTo(g.at - tip, y1 - tip);
        ctx.lineTo(g.at, y1);
        ctx.lineTo(g.at + tip, y1 - tip);
      }
      ctx.stroke();

      const midX = g.axis === 'x' ? (g.from + g.to) / 2 : g.at;
      const midY = g.axis === 'y' ? (g.from + g.to) / 2 : g.at;
      paintBadge(ctx, String(g.dist), midX, midY, inv, g.axis === 'x' ? 'below' : 'right');
      continue;
    }

    ctx.beginPath();
    if (g.axis === 'x') {
      ctx.moveTo(g.at, g.from);
      ctx.lineTo(g.at, g.to);
    } else {
      ctx.moveTo(g.from, g.at);
      ctx.lineTo(g.to, g.at);
    }
    ctx.stroke();
    for (const m of g.marks || []) {
      paintPathMark(ctx, m.x, m.y, markArm, stroke);
    }
  }
}

/** Clear leftover guide groups injected into shape hosts by older builds. */
function clearLegacyHostGuides() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-rcb-smart-guides]').forEach((n) => {
    try {
      n.remove();
    } catch {
      /* ignore */
    }
  });
}

export default function SmartGuidesOverlay({
  guides,
  mirrorNodeId: _mirrorNodeId = null,
}: {
  guides: SmartGuideLine[];
  /** Kept for call-site compat; Path2D overlay does not host-mirror. */
  mirrorNodeId?: string | null;
}) {
  const camera = useRcbCamera();
  const overlayRef = useRef<RcbSceneOverlayCanvasHandle>(null);
  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  const z = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / z;
  const stroke = Math.max(1 / z, CHROME_STROKE_PX / z);
  const tip = 5 * inv;
  const guideKey = guides
    .map((g) =>
      isGapGuide(g)
        ? `g:${g.axis}:${g.from}:${g.to}:${g.at}:${g.dist}`
        : `a:${g.axis}:${g.at}:${g.from}:${g.to}:${(g.marks || [])
            .map((m) => `${m.x},${m.y}`)
            .join(';')}`
    )
    .join('|');

  useEffect(() => {
    clearLegacyHostGuides();
    return () => {
      clearLegacyHostGuides();
      overlayRef.current?.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const handle = overlayRef.current;
    const list = guidesRef.current;
    if (!handle) return;
    if (!list.length) {
      handle.clear();
      return;
    }
    const bounds = guideBounds(list);
    if (!bounds) {
      handle.clear();
      return;
    }
    const pad = Math.max(36 * inv, stroke * 10, tip * 8);
    const ctx = handle.beginFrame({
      left: bounds.minX - pad,
      top: bounds.minY - pad,
      width: Math.max(1, bounds.maxX - bounds.minX + pad * 2),
      height: Math.max(1, bounds.maxY - bounds.minY + pad * 2),
    });
    if (!ctx) return;
    paintGuidesOnCtx(ctx, list, stroke, tip, inv);
  }, [guideKey, stroke, tip, inv, camera.x, camera.y, camera.zoom]);

  return <RcbSceneOverlayCanvas ref={overlayRef} zClass="z-[1000000]" />;
}
