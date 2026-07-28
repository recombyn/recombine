import type { ArtboardFrame } from '@/components/rcb/frames/types';
import { ensureDefs, setAttrs, svgEl, urlRef } from '@/components/rcb/svgDom';

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

let clipSeq = 0;
function nextClipId(prefix: string) {
  clipSeq += 1;
  return `${prefix}-${clipSeq}`;
}

/**
 * Frame that clips this node when `clipContent` is on.
 * Picks the clipContent frame with the largest bbox intersection (not center-only),
 * so strokes that spill out of an artboard still clip to that board.
 * Tie-break: smaller frame (nested), then topmost in the list.
 */
export function findClippingFrameForNode(
  document: { frames?: ArtboardFrame[]; x?: number; y?: number } | null | undefined,
  node: Record<string, unknown> | null | undefined
): ArtboardFrame | null {
  if (!node || !document) return null;
  const frames = Array.isArray(document.frames) ? document.frames : [];
  if (!frames.length) return null;

  const nx = num(node.x);
  const ny = num(node.y);
  const nw = Math.max(1, num(node.width, 1));
  const nh = Math.max(1, num(node.height, 1));

  let best: ArtboardFrame | null = null;
  let bestInter = -1;
  let bestArea = Infinity;

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (!f || !f.clipContent || f.hidden) continue;
    const fw = Math.max(1, num(f.width, 1));
    const fh = Math.max(1, num(f.height, 1));
    const fx = num(f.x);
    const fy = num(f.y);

    const ix0 = Math.max(nx, fx);
    const iy0 = Math.max(ny, fy);
    const ix1 = Math.min(nx + nw, fx + fw);
    const iy1 = Math.min(ny + nh, fy + fh);
    const iw = ix1 - ix0;
    const ih = iy1 - iy0;
    if (iw <= 0 || ih <= 0) continue;

    const inter = iw * ih;
    const area = fw * fh;
    if (inter > bestInter || (inter === bestInter && area < bestArea)) {
      best = f;
      bestInter = inter;
      bestArea = area;
    }
  }
  return best;
}

/** Scene-space origin (matches nodeLeftTop / shape paint). */
function sceneOrigin(document: { x?: number; y?: number } | null | undefined) {
  return { ox: num(document?.x, 0), oy: num(document?.y, 0) };
}

/**
 * Clip an SVG element to its owning clipContent frame.
 * Rect is in the element's local space (after the node's translate).
 */
export function applyFrameContentClip(
  root: SVGSVGElement,
  el: SVGElement | null | undefined,
  document: { frames?: ArtboardFrame[]; x?: number; y?: number } | null | undefined,
  node: Record<string, unknown> | null | undefined
): void {
  if (!el || !root) return;
  const frame = findClippingFrameForNode(document, node);
  if (!frame) return;
  try {
    const { ox, oy } = sceneOrigin(document);
    const left = num(node?.x, 0) - ox;
    const top = num(node?.y, 0) - oy;
    const fx = num(frame.x) - ox;
    const fy = num(frame.y) - oy;
    const id = nextClipId('frame-clip');
    const defs = ensureDefs(root);
    const clip = svgEl('clipPath', { id });
    clip.appendChild(
      svgEl('rect', {
        x: fx - left,
        y: fy - top,
        width: Math.max(1, num(frame.width, 1)),
        height: Math.max(1, num(frame.height, 1)),
      })
    );
    defs.appendChild(clip);
    setAttrs(el, { 'clip-path': urlRef(id) });
  } catch {
    /* ignore */
  }
}
