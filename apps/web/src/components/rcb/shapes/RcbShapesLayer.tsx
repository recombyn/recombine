import { useEffect, useMemo, useState, memo } from 'react';
import { useRcbCamera, useRcbCameraMotion, useRcbViewportEl } from '../camera/context';
import { rcbViewportSceneBounds } from '../core/math';
import { boxesIntersect, nodeSceneAabb } from '../core/spatialIndex';
import { isNodeHidden } from '@/components/rcb/scene/sceneDocument';
import { stackZIndex } from '@/components/rcb/scene/sceneDocument';
import RcbShapeHost from './RcbShapeHost';

type Props = {
  document: any;
  reloadToken?: number | string;
  /** Bumps paint for nodes touched by the latest document patch. */
  documentPatchToken?: number;
  lastPatchedNodeIds?: string[];
  /** Hide this node's SVG paint (e.g. while inline text editor is open). */
  hiddenNodeId?: string | null;
  /** Never cull these (selection / inline editors) even if off-screen. */
  keepVisibleIds?: readonly string[];
};

const EMPTY_KEEP: readonly string[] = [];

/** Screen-px margin so shapes entering the view aren't blank for a frame. */
const CULL_PAD_SCREEN_PX = 96;

/** Above this count, use stepped zoom while the camera is moving (). */
const EFFICIENT_ZOOM_SHAPE_THRESHOLD = 80;

/**
 * Renders each ROOT child as its own shape host (per-shape paint layer).
 * Off-viewport nodes are not mounted (lazy paint); selected/editing stay alive.
 * z-index comes from document.stackOrder so shapes can interleave with artboards.
 */
function RcbShapesLayer({
  document,
  reloadToken = 0,
  documentPatchToken = 0,
  lastPatchedNodeIds = [],
  hiddenNodeId = null,
  keepVisibleIds = EMPTY_KEEP,
}: Props) {
  const camera = useRcbCamera();
  const { moving, efficientZoom } = useRcbCameraMotion();
  const viewportEl = useRcbViewportEl();
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  /** Coalesce pan/zoom cull to one update per frame. */
  const [cullCam, setCullCam] = useState({ x: camera.x, y: camera.y, zoom: camera.zoom });

  useEffect(() => {
    if (!viewportEl) return undefined;
    const measure = () => {
      const r = viewportEl.getBoundingClientRect();
      setStageSize({
        width: Math.max(0, r.width),
        height: Math.max(0, r.height),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewportEl);
    return () => ro.disconnect();
  }, [viewportEl]);

  const ids = useMemo(() => {
    const children = document?.deltaSetLike?.ROOT?.children;
    return Array.isArray(children) ? (children as string[]) : [];
  }, [document]);

  const zoomForCull =
    moving && ids.length >= EFFICIENT_ZOOM_SHAPE_THRESHOLD ? efficientZoom : camera.zoom;

  useEffect(() => {
    let raf = 0;
    raf = requestAnimationFrame(() => {
      setCullCam({ x: camera.x, y: camera.y, zoom: zoomForCull });
    });
    return () => cancelAnimationFrame(raf);
  }, [camera.x, camera.y, zoomForCull]);

  const keepSet = useMemo(
    () => new Set(keepVisibleIds.filter(Boolean)),
    [keepVisibleIds]
  );

  const culledIds = useMemo(() => {
    const out = new Set<string>();
    if (!document || !ids.length || stageSize.width < 1 || stageSize.height < 1) {
      return out;
    }
    const vp = rcbViewportSceneBounds(cullCam, stageSize);
    const pad = CULL_PAD_SCREEN_PX / Math.max(0.05, cullCam.zoom || 1);
    const view = {
      minX: vp.x - pad,
      minY: vp.y - pad,
      maxX: vp.x + vp.width + pad,
      maxY: vp.y + vp.height + pad,
    };
    for (const id of ids) {
      if (keepSet.has(id)) continue;
      const box = nodeSceneAabb(document, id, 8);
      if (!box) continue;
      if (!boxesIntersect(box, view)) out.add(id);
    }
    return out;
  }, [
    document,
    ids,
    stageSize.width,
    stageSize.height,
    cullCam.x,
    cullCam.y,
    cullCam.zoom,
    keepSet,
  ]);

  const patched = useMemo(() => new Set(lastPatchedNodeIds.filter(Boolean)), [lastPatchedNodeIds]);

  if (!document || !ids.length) return null;

  return (
    <div
      data-rcb-shapes-layer="1"
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
    >
      {ids.map((id) => {
        // Lazy mount: skip React + SVG for off-viewport nodes (re-enter remounts).
        if (culledIds.has(id)) return null;
        const node = document?.deltaSetLike?.[id];
        // Layer hide (`attrs.hidden`) + inline-edit hide share the same paint gate.
        const layerHidden = isNodeHidden(node);
        return (
          <RcbShapeHost
            key={id}
            nodeId={id}
            document={document}
            zIndex={stackZIndex(document, 'node', id)}
            reloadToken={patched.has(id) ? `${reloadToken}:${documentPatchToken}` : reloadToken}
            forceHidden={hiddenNodeId === id || layerHidden}
          />
        );
      })}
    </div>
  );
}

export default memo(RcbShapesLayer);
