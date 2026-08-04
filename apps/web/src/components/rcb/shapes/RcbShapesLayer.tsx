import { useEffect, useMemo, useState, memo } from 'react';
import { useRcbCamera, useRcbCameraMotion, useRcbViewportEl } from '../camera/context';
import { rcbViewportSceneBounds } from '../core/math';
import { toDomPrecision } from '../core/dpr';
import {
  RcbSpatialIndex,
  boxesIntersect,
  nodeSceneAabb,
} from '../core/spatialIndex';
import { isNodeHidden, stackZIndex } from '@/components/rcb/scene/document/sceneDocument';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import { HEAVY_PATH_D_CHARS } from '@/components/rcb/scene/document/sceneShapes';
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
  /** Shared scene index from SvgCanvas — drives viewport visible set. */
  spatialIndex?: RcbSpatialIndex | null;
};

const EMPTY_KEEP: readonly string[] = [];

/** Screen-px margin so shapes entering the view aren't blank for a frame. */
const CULL_PAD_SCREEN_PX = 96;

/** Above this count, use stepped zoom while the camera is moving. */
const EFFICIENT_ZOOM_SHAPE_THRESHOLD = 80;

/** Prefer index.search over O(N) AABB walk once the scene is this large. */
const INDEX_CULL_THRESHOLD = 64;

/** Cap full SVG hosts; overflow paints as shared-SVG AABB proxies. */
const MAX_FULL_HOSTS = 96;

/** Below this zoom, prefer proxies for most on-screen nodes. */
const LOD_ZOOM_FAR = 0.42;

function nodeProxyFill(node: any): string {
  const a = node?.attrs || {};
  for (const k of ['fill-color', 'fill', 'color', 'border-color', 'stroke'] as const) {
    const v = a[k];
    if (typeof v === 'string' && v && v !== 'none' && v !== 'transparent') return v;
  }
  return '#94a3b8';
}

function isHeavyPathNode(node: any): boolean {
  const d = String(node?.attrs?.path || node?.attrs?.d || '');
  return d.length >= HEAVY_PATH_D_CHARS;
}

function screenAreaPx(node: any, zoom: number): number {
  const w = Math.max(1, Number(node?.width) || 1);
  const h = Math.max(1, Number(node?.height) || 1);
  const z = Math.max(0.05, zoom || 1);
  return w * h * z * z;
}

function hostBudget(opts: {
  zoom: number;
  moving: boolean;
  visibleCount: number;
}): number {
  const { zoom, moving, visibleCount } = opts;
  const far = zoom < LOD_ZOOM_FAR;
  if (far) return Math.min(MAX_FULL_HOSTS, 40);
  if (moving && visibleCount >= EFFICIENT_ZOOM_SHAPE_THRESHOLD) {
    return Math.min(MAX_FULL_HOSTS, 56);
  }
  return MAX_FULL_HOSTS;
}

/**
 * Split visible ids into full SVG hosts vs shared-SVG LOD proxies.
 * Selection / editing always get a real host; heavy paths demoted when far.
 * Exported for unit tests.
 */
export function pickFullAndProxyIds(opts: {
  document: any;
  visibleIds: string[];
  keepSet: Set<string>;
  zoom: number;
  moving: boolean;
}): { fullIds: string[]; proxyIds: string[] } {
  const { document, visibleIds, keepSet, zoom, moving } = opts;
  const budget = hostBudget({ zoom, moving, visibleCount: visibleIds.length });
  const far = zoom < LOD_ZOOM_FAR;
  const forceLod =
    far || (moving && visibleIds.length >= EFFICIENT_ZOOM_SHAPE_THRESHOLD);

  if (visibleIds.length <= budget && !forceLod) {
    return { fullIds: visibleIds, proxyIds: [] };
  }

  const scored: Array<{ id: string; score: number; force: boolean }> = [];
  for (const id of visibleIds) {
    const node = document?.deltaSetLike?.[id];
    const force = keepSet.has(id);
    let score = screenAreaPx(node, zoom);
    if (isHeavyPathNode(node) && forceLod) score *= 0.05;
    scored.push({ id, score, force });
  }
  scored.sort((a, b) => {
    if (a.force !== b.force) return a.force ? -1 : 1;
    return b.score - a.score;
  });

  const fullSet = new Set<string>();
  for (const s of scored) {
    if (s.force || fullSet.size < budget) fullSet.add(s.id);
  }
  // Preserve document z-order for both lists.
  const fullIds = visibleIds.filter((id) => fullSet.has(id));
  const proxyIds = visibleIds.filter((id) => !fullSet.has(id));
  return { fullIds, proxyIds };
}

/**
 * Renders each ROOT child as its own SVG shape host (sharp under CSS camera zoom).
 * Canvas Path2D is only used by selection indicators / draw-tool overlays.
 * Off-viewport nodes are not mounted (lazy paint); selected/editing stay alive.
 * Far zoom / dense views: shared SVG AABB proxies.
 * z-index comes from document.stackOrder so shapes can interleave with artboards.
 */
function RcbShapesLayer({
  document,
  reloadToken = 0,
  documentPatchToken = 0,
  lastPatchedNodeIds = [],
  hiddenNodeId = null,
  keepVisibleIds = EMPTY_KEEP,
  spatialIndex = null,
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

  /** Mount only in-view (+ keep) ids — avoid `ids.map → null` over 10k. */
  const visibleIds = useMemo(() => {
    if (!document || !ids.length || stageSize.width < 1 || stageSize.height < 1) {
      return ids;
    }
    const vp = rcbViewportSceneBounds(cullCam, stageSize);
    const pad = CULL_PAD_SCREEN_PX / Math.max(0.05, cullCam.zoom || 1);
    const view = {
      minX: vp.x - pad,
      minY: vp.y - pad,
      maxX: vp.x + vp.width + pad,
      maxY: vp.y + vp.height + pad,
    };

    if (ids.length >= INDEX_CULL_THRESHOLD && spatialIndex && spatialIndex.size > 0) {
      const hits = spatialIndex.search(view.minX, view.minY, view.maxX, view.maxY);
      const vis = new Set(hits.map((h) => h.id));
      for (const id of keepSet) vis.add(id);
      return ids.filter((id) => vis.has(id));
    }

    const out: string[] = [];
    for (const id of ids) {
      if (keepSet.has(id)) {
        out.push(id);
        continue;
      }
      const box = nodeSceneAabb(document, id, 8);
      if (!box) continue;
      if (boxesIntersect(box, view)) out.push(id);
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
    spatialIndex,
    documentPatchToken,
  ]);

  const { fullIds, proxyIds } = useMemo(
    () =>
      pickFullAndProxyIds({
        document,
        visibleIds,
        keepSet,
        zoom: cullCam.zoom || 1,
        moving,
      }),
    [document, visibleIds, keepSet, cullCam.zoom, moving]
  );

  const patched = useMemo(() => new Set(lastPatchedNodeIds.filter(Boolean)), [lastPatchedNodeIds]);

  /** Fitted viewBox for LOD proxies — same CSS box + viewBox as shape hosts. */
  const lodViewport = useMemo(() => {
    if (!proxyIds.length || !document) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of proxyIds) {
      const node = document.deltaSetLike?.[id];
      if (!node || isNodeHidden(node) || hiddenNodeId === id) continue;
      const { left, top } = nodeLeftTop(document, node);
      const w = Math.max(1, Number(node.width) || 1);
      const h = Math.max(1, Number(node.height) || 1);
      const angle = Number(node.attrs?.angle) || 0;
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const cx = left + w / 2;
      const cy = top + h / 2;
      for (const [lx, ly] of [
        [left, top],
        [left + w, top],
        [left + w, top + h],
        [left, top + h],
      ] as const) {
        const dx = lx - cx;
        const dy = ly - cy;
        const x = cx + dx * cos - dy * sin;
        const y = cy + dx * sin + dy * cos;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    const pad = 2;
    return {
      minX: toDomPrecision(minX - pad),
      minY: toDomPrecision(minY - pad),
      w: toDomPrecision(Math.max(1, maxX - minX + pad * 2)),
      h: toDomPrecision(Math.max(1, maxY - minY + pad * 2)),
    };
  }, [document, proxyIds, hiddenNodeId]);

  if (!document || !visibleIds.length) return null;

  return (
    <div
      data-rcb-shapes-layer="1"
      data-rcb-visible-count={visibleIds.length}
      data-rcb-full-host-count={fullIds.length}
      data-rcb-proxy-count={proxyIds.length}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
    >
      {lodViewport ? (
        <svg
          data-rcb-lod-layer="1"
          className="pointer-events-none absolute overflow-visible"
          width={lodViewport.w}
          height={lodViewport.h}
          viewBox={`${lodViewport.minX} ${lodViewport.minY} ${lodViewport.w} ${lodViewport.h}`}
          style={{
            left: lodViewport.minX,
            top: lodViewport.minY,
            width: lodViewport.w,
            height: lodViewport.h,
            overflow: 'visible',
          }}
          aria-hidden
        >
          {proxyIds.map((id) => {
            const node = document?.deltaSetLike?.[id];
            if (!node || isNodeHidden(node) || hiddenNodeId === id) return null;
            const { left, top } = nodeLeftTop(document, node);
            const w = Math.max(1, Number(node.width) || 1);
            const h = Math.max(1, Number(node.height) || 1);
            const angle = Number(node.attrs?.angle) || 0;
            const fill = nodeProxyFill(node);
            const opacity = Math.min(
              1,
              Math.max(0.15, Number(node.attrs?.opacity) || 1)
            );
            const z = stackZIndex(document, 'node', id);
            const cx = left + w / 2;
            const cy = top + h / 2;
            const transform =
              Math.abs(angle) > 0.5 ? `rotate(${angle} ${cx} ${cy})` : undefined;
            return (
              <rect
                key={`lod:${id}`}
                data-rcb-lod-proxy={id}
                x={left}
                y={top}
                width={w}
                height={h}
                fill={fill}
                opacity={opacity}
                transform={transform}
                style={{ zIndex: z }}
              />
            );
          })}
        </svg>
      ) : null}
      {fullIds.map((id) => {
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
