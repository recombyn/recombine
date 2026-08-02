import { useEffect, useRef, type CSSProperties, memo } from 'react';
import { applyFrameContentClip } from '@/components/rcb/frames/frameContentClip';
import {
  createSvgBoard,
  fitInfiniteSvgToContent,
  nodeToSvgElement,
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

function setHostPaintOpacity(el: SVGElement | null | undefined, hidden: boolean) {
  if (!el) return;
  // Layer opacity lives on the HTML wrapper (for mix-blend with siblings).
  // Hide for text-edit by zeroing SVG paint only.
  const v = hidden ? '0' : '1';
  el.style.opacity = v;
  el.setAttribute('opacity', v);
  const anyEl = el as any;
  if (typeof anyEl.opacity === 'function') anyEl.opacity(hidden ? 0 : 1);
}

/**
 * One native SVG board per scene node under the camera world layer.
 * Only mounted while in (or near) the viewport — see RcbShapesLayer culling.
 * Patch / drag-preview stay in SvgCanvas via shapeHostRegistry.
 */
function RcbShapeHost({
  nodeId,
  document,
  zIndex,
  reloadToken = 0,
  forceHidden = false,
}: Props) {
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
    node?.attrs?.['fill-color'],
    node?.attrs?.['fill-type'],
    node?.attrs?.['fill-opacity'],
    node?.attrs?.['fill-enabled'],
    node?.attrs?.['fill-visible'],
    node?.attrs?.opacity,
    node?.attrs?.blendMode,
    node?.width,
    node?.height,
    node?.attrs?.markdown ?? node?.attrs?.DATA,
    node?.attrs?.fontSize,
    node?.attrs?.fontFamily,
    node?.attrs?.autoSize,
    node?.attrs?.path,
    node?.attrs?.shapeType,
  ].join('|');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !document) return undefined;

    const seq = ++bootRef.current;
    const { root, layer } = createSvgBoard(host, 1, 1, { infinite: true });
    const nodeEls = getSharedNodeEls() || new Map();

    let cancelled = false;
    registerShapeHost({ nodeId, root, layer, el: null });

    async function mountShape() {
      const n = document.deltaSetLike?.[nodeId];
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
          // Blend / layer opacity are on the HTML wrapper — clear SVG duplicates
          // so we don't double-apply opacity and so mix-blend sees sibling hosts.
          el.style.removeProperty('mix-blend-mode');
          el.style.opacity = '1';
          el.setAttribute('opacity', '1');
          // Hide before first paint if inline editor owns this node (no double glyphs).
          if (forceHiddenRef.current) setHostPaintOpacity(el, true);
          applyFrameContentClip(root, el, document, n);
          // Prefer the live shared map (board.nodeEls). A throwaway Map here
          // would make geometry preview miss the node and skip live resize.
          const shared = getSharedNodeEls();
          if (shared) shared.set(nodeId, el);
          else nodeEls.set(nodeId, el);
          updateShapeHostElement(nodeId, el);
        }
        try {
          fitInfiniteSvgToContent(root, layer);
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
      (hostRef.current?.querySelector?.('[data-scene-node-id]') as SVGElement | null);
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
