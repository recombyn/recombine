import { useEffect, useRef, type CSSProperties, memo } from 'react';
import { useRcbCamera } from '@/components/rcb/camera/context';
import { applyFrameContentClip } from '@/components/rcb/frames/frameContentClip';
import { strokeVisualOutset } from '@/components/rcb/scene/document/sceneEffects';
import {
  createSvgBoard,
  fitInfiniteSvgToContent,
  nodeLeftTop,
  nodeToSvgElement,
  seedInfiniteSvgViewport,
} from '@/components/rcb/scene/paint/sceneToSvg';
import {
  blendModeToCss,
  parseBlendMode,
  parseLayerOpacity,
} from '@/components/rcb/selection/chrome/BlendModeControl';
import {
  getSharedNodeEls,
  registerShapeHost,
  unregisterShapeHost,
  updateShapeHostElement,
} from '@/components/rcb/shapes/shapeHostRegistry';

function hostJumpLog(event: string, data: Record<string, unknown> = {}) {
  const row = { event, t: Math.round(performance.now()), ...data };
  const w = window as Window & {
    __rcbJumpLog?: unknown[];
    __rcbJumpDump?: () => string;
  };
  if (!Array.isArray(w.__rcbJumpLog)) w.__rcbJumpLog = [];
  w.__rcbJumpLog.push(row);
  w.__rcbJumpDump = () => JSON.stringify(w.__rcbJumpLog, null, 2);
  console.info(JSON.stringify(row));
}

type Props = {
  nodeId: string;
  document: any;
  /** Paint order among siblings (ROOT.children index). */
  zIndex: number;
  /** Bumps force a full remount / redraw of this host. */
  reloadToken?: number | string;
  /** Keep SVG paint invisible (inline text editor owns the glyphs). */
  forceHidden?: boolean;
};

function setHostPaintOpacity(el: Element | null | undefined, hidden: boolean) {
  if (!el) return;
  const v = hidden ? '0' : '1';
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    el.style.opacity = v;
  }
  el.setAttribute('opacity', v);
  const anyEl = el as any;
  if (typeof anyEl.opacity === 'function') anyEl.opacity(hidden ? 0 : 1);
}

/**
 * One paint host per scene node under the camera world layer.
 * Committed ink is SVG (vector stays sharp under CSS camera zoom).
 * Canvas Path2D caches geometry for hit-test + draw-tool overlays (see sceneShapes).
 * Only mounted while in (or near) the viewport — see RcbShapesLayer culling.
 */
function RcbShapeHost({
  nodeId,
  document,
  zIndex,
  reloadToken = 0,
  forceHidden = false,
}: Props) {
  const camera = useRcbCamera();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bootRef = useRef(0);
  const forceHiddenRef = useRef(forceHidden);
  forceHiddenRef.current = forceHidden;
  const node = document?.deltaSetLike?.[nodeId];
  const blendMode = parseBlendMode(node?.attrs?.blendMode, { allowPassThrough: false });
  const layerOpacity = parseLayerOpacity(node?.attrs?.opacity, 1);
  const blendCss = blendModeToCss(blendMode);
  // Remount when stroke/fill paint attrs change — not on every geometry nudge.
  const paintToken = [
    node?.attrs?.hidden,
    node?.attrs?.locked,
    node?.attrs?.strokeAlign,
    node?.attrs?.['stroke-align'],
    node?.attrs?.['border-width'],
    node?.attrs?.strokeWidth,
    node?.attrs?.['border-color'],
    node?.attrs?.stroke,
    node?.attrs?.['stroke-opacity'],
    node?.attrs?.strokeStyle,
    node?.attrs?.strokeLinecap,
    node?.attrs?.['stroke-linecap'],
    node?.attrs?.strokeLinejoin,
    node?.attrs?.['stroke-linejoin'],
    node?.attrs?.['stroke-enabled'],
    node?.attrs?.['stroke-visible'],
    node?.attrs?.['fill-color'],
    node?.attrs?.['fill-type'],
    node?.attrs?.['fill-opacity'],
    node?.attrs?.['fill-enabled'],
    node?.attrs?.['fill-visible'],
    node?.attrs?.['fill-gradient'],
    node?.attrs?.['fill-image-src'],
    node?.attrs?.['fill-image-fit'],
    node?.attrs?.['fill-image-rotate'],
    node?.attrs?.['fill-image-adjust'],
    node?.attrs?.opacity,
    node?.attrs?.blendMode,
    node?.attrs?.brushStampSrc,
    node?.width,
    node?.height,
    node?.attrs?.markdown ?? node?.attrs?.DATA,
    node?.attrs?.fontSize,
    node?.attrs?.fontFamily,
    node?.attrs?.autoSize,
    node?.attrs?.path,
    node?.attrs?.shapeType,
    node?.attrs?.brushStyle,
    node?.attrs?.pathPressure,
  ].join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !document) return undefined;

    const seq = ++bootRef.current;
    const n = document.deltaSetLike?.[nodeId];
    let cancelled = false;

    const { root, layer } = createSvgBoard(host, 1, 1, { infinite: true });
    // Seed CSS box from node AABB before paint — avoids 1×1→fit jump under browser zoom.
    let seedBox: { left: number; top: number; width: number; height: number } | null = null;
    if (n) {
      try {
        const { left, top } = nodeLeftTop(document, n);
        const w = Math.max(1, Number(n.width) || 1);
        const h = Math.max(1, Number(n.height) || 1);
        const outset = Math.max(0, strokeVisualOutset(n));
        seedBox = {
          left: left - outset,
          top: top - outset,
          width: w + outset * 2,
          height: h + outset * 2,
        };
        seedInfiniteSvgViewport(root, seedBox);
        hostJumpLog('host.seed', { nodeId, seed: seedBox, paintToken });
      } catch {
        /* keep 1×1 until fit */
      }
    }
    const nodeEls = getSharedNodeEls() || new Map();
    registerShapeHost({ nodeId, root, layer, el: null, kind: 'svg' });

    async function mountShape() {
      try {
        const el = await nodeToSvgElement(root, layer, document, n, nodeId);
        if (cancelled || bootRef.current !== seq) {
          try {
            el?.remove();
          } catch {
            /* ignore */
          }
          return;
        }
        if (el) {
          el.style.removeProperty('mix-blend-mode');
          el.style.opacity = '1';
          el.setAttribute('opacity', '1');
          if (forceHiddenRef.current) setHostPaintOpacity(el, true);
          applyFrameContentClip(root, el, document, n, { zoom: camera.zoom });
          const shared = getSharedNodeEls();
          if (shared) shared.set(nodeId, el);
          else nodeEls.set(nodeId, el);
          updateShapeHostElement(nodeId, el);
        }
        try {
          const before = {
            left: root.style.left,
            top: root.style.top,
            width: root.style.width,
            height: root.style.height,
            viewBox: root.getAttribute('viewBox'),
          };
          // Freehand / open paths can grow past the seed AABB — allow getBBox fit.
          // Closed shapes keep the locked seed (preserves *.5 stroke-on-grid).
          const shapeType = String(n?.attrs?.shapeType || '');
          const unlockFit =
            shapeType === 'pen' ||
            shapeType === 'pencil' ||
            shapeType === 'path' ||
            shapeType === 'line' ||
            shapeType === 'arrow';
          if (unlockFit) root.removeAttribute('data-rcb-viewport-locked');
          fitInfiniteSvgToContent(root, layer);
          const after = {
            left: root.style.left,
            top: root.style.top,
            width: root.style.width,
            height: root.style.height,
            viewBox: root.getAttribute('viewBox'),
          };
          const moved =
            before.left !== after.left ||
            before.top !== after.top ||
            before.width !== after.width ||
            before.height !== after.height;
          if (moved) {
            hostJumpLog('host.fitDelta', { nodeId, seed: seedBox, before, after });
          }
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.error('RcbShapeHost mount failed', nodeId, err);
      }
    }
    mountShape();

    return () => {
      cancelled = true;
      hostJumpLog('host.unmount', { nodeId, paintToken: String(paintToken).slice(0, 120) });
      unregisterShapeHost(nodeId);
      try {
        root.remove();
      } catch {
        /* ignore */
      }
      host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, reloadToken, paintToken]);

  // Toggle hide without remounting (enter / leave inline text edit).
  useEffect(() => {
    const el =
      getSharedNodeEls()?.get(nodeId) ||
      (hostRef.current?.querySelector?.('[data-scene-node-id]') as Element | null);
    setHostPaintOpacity(el, forceHidden);
  }, [forceHidden, nodeId, paintToken, reloadToken]);

  return (
    <div
      ref={wrapRef}
      data-rcb-shape={nodeId}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      style={{
        zIndex,
        opacity: forceHidden ? 0 : layerOpacity,
        mixBlendMode: (blendCss || undefined) as CSSProperties['mixBlendMode'],
      }}
    >
      <div
        ref={hostRef}
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        data-rcb-shape-host={nodeId}
        style={{ width: 0, height: 0, overflow: 'visible' }}
      />
    </div>
  );
}

export default memo(RcbShapeHost);
