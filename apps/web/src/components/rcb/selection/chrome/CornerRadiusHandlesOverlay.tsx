/**
 * Figma-style corner-radius dots on the selection chrome.
 * Pointer engine stays in SelectionFeature; this is floating UI only.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { previewSvgNodeCornerRadii } from '@/components/rcb/scene/paint/sceneToSvg';
import { useRcbCamera } from '@/components/rcb/camera/context';
import {
  clampCornerRadii,
  cornerVertexCount,
  isRadiusLinked,
  radiiFromAttrs,
  serializeRadiusVertices,
  sharpCornerSitesForNode,
  parseRadiusVertices,
  vertexRadiiFromAttrs,
  type CornerKey,
  type CornerRadii,
  type SharpCornerSite,
} from '@/components/rcb/scene/document/sceneRadii';
import { strokeChromeOutset } from '@/components/rcb/scene/document/sceneEffects';
import { patchDocumentNode } from '@/store/modules/editor';
import { getShapeHost, getSharedNodeEls } from '@/components/rcb/shapes/shapeHostRegistry';
import type { SceneBox } from '../alignGuides';

/** Soft-click threshold (screen px²) — match SelectionFeature. */
const DRAG_DISTANCE_SQUARED = 16;

function liveNodeEl(nodeId: string): Element | null {
  return (
    (getSharedNodeEls()?.get(nodeId) as Element | undefined) ||
    (getShapeHost(nodeId)?.el as Element | null | undefined) ||
    null
  );
}

const RADIUS_CORNERS: Array<{
  key: CornerKey;
  /** Inward unit in local box space. */
  ix: number;
  iy: number;
  cx: 0 | 1;
  cy: 0 | 1;
}> = [
  { key: 'tl', ix: 1, iy: 1, cx: 0, cy: 0 },
  { key: 'tr', ix: -1, iy: 1, cx: 1, cy: 0 },
  { key: 'br', ix: -1, iy: -1, cx: 1, cy: 1 },
  { key: 'bl', ix: 1, iy: -1, cx: 0, cy: 1 },
];

function scenePointToLocal(
  sceneX: number,
  sceneY: number,
  box: SceneBox,
  angleDeg: number
): { x: number; y: number } {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const dx = sceneX - cx;
  const dy = sceneY - cy;
  if (Math.abs(angleDeg) < 0.001) {
    return { x: dx + box.width / 2, y: dy + box.height / 2 };
  }
  const rad = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: dx * cos - dy * sin + box.width / 2,
    y: dx * sin + dy * cos + box.height / 2,
  };
}

function localPointToScene(
  lx: number,
  ly: number,
  box: SceneBox,
  angleDeg: number
): { x: number; y: number } {
  const cx = box.width / 2;
  const cy = box.height / 2;
  const dx = lx - cx;
  const dy = ly - cy;
  if (Math.abs(angleDeg) < 0.001) {
    return { x: box.left + lx, y: box.top + ly };
  }
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: box.left + cx + dx * cos - dy * sin,
    y: box.top + cy + dx * sin + dy * cos,
  };
}

function patchNodeCornerRadii(opts: {
  dispatch: (a: unknown) => void;
  nodeId: string;
  node: any;
  radii: CornerRadii;
  linked: boolean;
  /** When set, written as radiusVertices (sharp-corner list for paths). */
  vertices?: number[];
  skipHistory?: boolean;
}) {
  const { dispatch, nodeId, node, radii, linked, skipHistory } = opts;
  const clamped = clampCornerRadii(radii, Number(node.width) || 1, Number(node.height) || 1);
  const count = cornerVertexCount(node);
  let vertices: number[];
  if (opts.vertices && opts.vertices.length) {
    vertices = opts.vertices.map((v) => Math.max(0, Math.round(v)));
  } else if (linked) {
    vertices = Array.from({ length: count }, () => Math.round(clamped.tl));
  } else {
    vertices = vertexRadiiFromAttrs(
      {
        radiusTL: clamped.tl,
        radiusTR: clamped.tr,
        radiusBR: clamped.br,
        radiusBL: clamped.bl,
        radiusLinked: 'false',
      },
      count
    );
  }
  dispatch(
    patchDocumentNode({
      nodeId,
      skipHistory: Boolean(skipHistory),
      patch: {
        attrs: {
          radiusTL: Math.max(0, Math.round(clamped.tl)),
          radiusTR: Math.max(0, Math.round(clamped.tr)),
          radiusBR: Math.max(0, Math.round(clamped.br)),
          radiusBL: Math.max(0, Math.round(clamped.bl)),
          radiusLinked: linked ? 'true' : 'false',
          radiusVertices: serializeRadiusVertices(vertices),
        },
      },
    })
  );
}

type RadiusHandleDrag =
  | {
      mode: 'box';
      corner: CornerKey;
      startRadii: CornerRadii;
      linked: boolean;
      solo: boolean;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      mode: 'path';
      sharpIndex: number;
      startVertices: number[];
      linked: boolean;
      solo: boolean;
      site: SharpCornerSite;
      startX: number;
      startY: number;
      moved: boolean;
    };

/** Screen-constant radius knob — same overlay contract as SelectionChrome. */
const RADIUS_VIS_PX = 8;
const RADIUS_HIT_PX = 18;
const RADIUS_STROKE_PX = 1.5;
const RADIUS_REVEAL_DIST_PX = 56;
const RADIUS_PAD_PX = 24;

/**
 * Figma-style corner-radius dots: appear near corners, drag inward to round.
 * Path shapes use sharp polyline corners (not the AABB), so boolean cutouts
 * get handles on real corners only — not along arc samples.
 */
function CornerRadiusHandlesOverlay({
  box,
  angle,
  nodeId,
  node,
  toScene,
  stageEl,
  interactive = true,
}: {
  box: SceneBox;
  angle: number;
  nodeId: string;
  node: any;
  toScene: (clientX: number, clientY: number) => { x: number; y: number };
  stageEl: HTMLElement | null;
  /** False while moving/resizing so dots follow chrome without stealing pointers. */
  interactive?: boolean;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const [nearCorners, setNearCorners] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragRef = useRef<RadiusHandleDrag | null>(null);

  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const maxR = Math.min(w, h) / 2;
  const baseRadii = clampCornerRadii(radiiFromAttrs(node?.attrs), w, h);
  const linked = isRadiusLinked(node?.attrs);
  const pathSites = sharpCornerSitesForNode(node);
  const usePath = Boolean(pathSites && pathSites.length > 0);
  const pathVertexCount = usePath ? pathSites!.length : 0;
  const pathVertices = usePath
    ? (() => {
        const stored = parseRadiusVertices(node?.attrs?.radiusVertices);
        if (stored.length === pathVertexCount) return stored;
        const u = Math.round(
          (baseRadii.tl + baseRadii.tr + baseRadii.br + baseRadii.bl) / 4
        );
        return Array.from({ length: pathVertexCount }, () =>
          stored.length ? stored[0] ?? u : u
        );
      })()
    : [];

  // Seat at the corner's arc center (inset = R on both axes). At max R on a
  // pill this sits on the end-cap midline (fig.2), not stuck near the AABB corner.
  // Screen-constant minimum keeps the dot off resize knobs when R is tiny.
  const padPx = RADIUS_PAD_PX;
  const visualPx = RADIUS_VIS_PX;
  const hitPx = RADIUS_HIT_PX;
  const revealDist = RADIUS_REVEAL_DIST_PX;
  // Min inset in scene units (pad is screen-constant → scene = px / zoom).
  const k = 1 / z;
  // `box` is the chrome AABB (inflateSelectionBox); path sites are geometry-local.
  const geomOutset = strokeChromeOutset(node);

  const radiusHandleInset = (r: number) => {
    const arcInset = Math.max(0, r);
    const minInset = padPx * k;
    return Math.min(Math.max(arcInset, minInset), Math.min(w, h) / 2 - 1);
  };

  const boxHandleScenePos = (corner: (typeof RADIUS_CORNERS)[number], r: number) => {
    const inset = radiusHandleInset(r);
    const lx = corner.cx === 0 ? inset : w - inset;
    const ly = corner.cy === 0 ? inset : h - inset;
    return localPointToScene(lx, ly, box, angle);
  };

  const pathHandleScenePos = (site: SharpCornerSite, r: number) => {
    // Inward along the bisector by R (arc-center distance for a 90° corner).
    const along = radiusHandleInset(r);
    return localPointToScene(
      geomOutset + site.x + site.ix * along,
      geomOutset + site.y + site.iy * along,
      box,
      angle
    );
  };

  const radiusAlongBoxCorner = (
    corner: (typeof RADIUS_CORNERS)[number],
    local: { x: number; y: number }
  ) => {
    const cornerLx = corner.cx * w;
    const cornerLy = corner.cy * h;
    const len = Math.hypot(corner.ix, corner.iy) || 1;
    // Bisector projection; seat at (R,R) ⇒ along = R√2, so R = along/√2.
    const along =
      (local.x - cornerLx) * (corner.ix / len) + (local.y - cornerLy) * (corner.iy / len);
    return Math.max(0, Math.min(maxR, along / Math.SQRT2));
  };

  const radiusAlongPathSite = (site: SharpCornerSite, local: { x: number; y: number }) => {
    const sx = geomOutset + site.x;
    const sy = geomOutset + site.y;
    const along = (local.x - sx) * site.ix + (local.y - sy) * site.iy;
    return Math.max(0, Math.min(maxR, along));
  };

  const previewRadiiOnHost = (radii: CornerRadii, vertices?: number[]) => {
    const hostEl = liveNodeEl(nodeId);
    if (!hostEl) return;
    const map = getSharedNodeEls() || new Map<string, any>([[nodeId, hostEl]]);
    if (!map.has(nodeId)) map.set(nodeId, hostEl);
    const shapeType = String(
      node?.attrs?.shapeType || (node?.key === 'path' ? 'path' : node?.key) || 'rect'
    );
    const attrs = {
      ...(node?.attrs || {}),
      radiusTL: radii.tl,
      radiusTR: radii.tr,
      radiusBR: radii.br,
      radiusBL: radii.bl,
      radiusLinked: linked ? 'true' : 'false',
      ...(vertices ? { radiusVertices: serializeRadiusVertices(vertices) } : {}),
    };
    previewSvgNodeCornerRadii(map, nodeId, {
      width: Number(node?.width) || w,
      height: Number(node?.height) || h,
      shapeType,
      radii,
      attrs,
    });
  };

  useEffect(() => {
    if (!stageEl || !interactive) return undefined;
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-radius-handle]')) {
        setNearCorners(true);
        return;
      }
      const sc = toScene(e.clientX, e.clientY);
      const local = scenePointToLocal(sc.x, sc.y, box, angle);
      let best = Infinity;
      if (usePath && pathSites) {
        for (const site of pathSites) {
          const r = pathVertices[site.sharpIndex] ?? 0;
          const seat = pathHandleScenePos(site, r);
          const lx = geomOutset + site.x;
          const ly = geomOutset + site.y;
          best = Math.min(
            best,
            Math.hypot((sc.x - seat.x) * z, (sc.y - seat.y) * z),
            Math.hypot((local.x - lx) * z, (local.y - ly) * z)
          );
        }
      } else {
        for (const c of RADIUS_CORNERS) {
          const r = baseRadii[c.key] ?? 0;
          // Probe the real seat (follows R — near center at max radius), not only AABB corners.
          const seat = radiusHandleInset(r);
          const seatLx = c.cx === 0 ? seat : w - seat;
          const seatLy = c.cy === 0 ? seat : h - seat;
          best = Math.min(
            best,
            Math.hypot((local.x - c.cx * w) * z, (local.y - c.cy * h) * z),
            Math.hypot((local.x - seatLx) * z, (local.y - seatLy) * z)
          );
        }
      }
      setNearCorners(best <= revealDist);
    };
    const onLeave = () => {
      if (!dragRef.current) setNearCorners(false);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    stageEl.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      stageEl.removeEventListener('pointerleave', onLeave);
    };
  }, [
    stageEl,
    interactive,
    box,
    angle,
    w,
    h,
    z,
    toScene,
    revealDist,
    usePath,
    pathSites,
    pathVertices,
    baseRadii,
  ]);

  useEffect(() => {
    if (!interactive) return undefined;

    const commitPathRadii = (
      vertices: number[],
      linkedNext: boolean,
      skipHistory: boolean
    ) => {
      const u = vertices[0] ?? 0;
      patchNodeCornerRadii({
        dispatch,
        nodeId,
        node,
        radii: { tl: u, tr: u, br: u, bl: u },
        linked: linkedNext,
        vertices,
        skipHistory,
      });
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const distSq = (e.clientX - d.startX) ** 2 + (e.clientY - d.startY) ** 2;
      // Soft-click: ignore OS jitter; seat maps to R via along/√2 but R=0
      // seats on the screen pad and must not commit that pad as radius.
      if (!d.moved && distSq <= DRAG_DISTANCE_SQUARED) return;
      d.moved = true;
      const sc = toScene(e.clientX, e.clientY);
      const local = scenePointToLocal(sc.x, sc.y, box, angle);
      if (d.mode === 'path') {
        const rounded = Math.round(radiusAlongPathSite(d.site, local));
        const next = d.solo
          ? d.startVertices.map((v, i) => (i === d.sharpIndex ? rounded : v))
          : d.startVertices.map(() => rounded);
        setDragValue(rounded);
        // DOM preview only — Redux remount mid-drag leaves ghost shadows.
        const u = next[0] ?? rounded;
        previewRadiiOnHost(
          d.solo
            ? { tl: u, tr: u, br: u, bl: u }
            : { tl: rounded, tr: rounded, br: rounded, bl: rounded },
          next
        );
        return;
      }
      const corner = RADIUS_CORNERS.find((c) => c.key === d.corner);
      if (!corner) return;
      const rounded = Math.round(radiusAlongBoxCorner(corner, local));
      const next: CornerRadii = d.solo
        ? { ...d.startRadii, [d.corner]: rounded }
        : { tl: rounded, tr: rounded, br: rounded, bl: rounded };
      setDragValue(rounded);
      previewRadiiOnHost(next);
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const softClick = !d.moved;
      dragRef.current = null;
      setActiveKey(null);
      setDragValue(null);
      if (softClick) {
        // Restore any mid-frame preview (none on soft click) and bail.
        if (d.mode === 'path') {
          previewRadiiOnHost(
            {
              tl: d.startVertices[0] ?? 0,
              tr: d.startVertices[0] ?? 0,
              br: d.startVertices[0] ?? 0,
              bl: d.startVertices[0] ?? 0,
            },
            d.startVertices
          );
        } else {
          previewRadiiOnHost(d.startRadii);
        }
        return;
      }
      const sc = toScene(e.clientX, e.clientY);
      const local = scenePointToLocal(sc.x, sc.y, box, angle);
      if (d.mode === 'path') {
        const rounded = Math.round(radiusAlongPathSite(d.site, local));
        const next = d.solo
          ? d.startVertices.map((v, i) => (i === d.sharpIndex ? rounded : v))
          : d.startVertices.map(() => rounded);
        commitPathRadii(next, !d.solo && d.linked, false);
        return;
      }
      const corner = RADIUS_CORNERS.find((c) => c.key === d.corner);
      if (!corner) return;
      const rounded = Math.round(radiusAlongBoxCorner(corner, local));
      const next: CornerRadii = d.solo
        ? { ...d.startRadii, [d.corner]: rounded }
        : { tl: rounded, tr: rounded, br: rounded, bl: rounded };
      patchNodeCornerRadii({
        dispatch,
        nodeId,
        node,
        radii: next,
        linked: !d.solo && d.linked,
        skipHistory: false,
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !dragRef.current) return;
      const d = dragRef.current;
      dragRef.current = null;
      setActiveKey(null);
      setDragValue(null);
      if (d.mode === 'path') {
        previewRadiiOnHost(
          {
            tl: d.startVertices[0] ?? 0,
            tr: d.startVertices[0] ?? 0,
            br: d.startVertices[0] ?? 0,
            bl: d.startVertices[0] ?? 0,
          },
          d.startVertices
        );
        return;
      }
      previewRadiiOnHost(d.startRadii);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [dispatch, node, nodeId, box, angle, w, h, maxR, toScene, interactive, linked]);

  // nearCorners sticks across a move/resize gesture (probe pauses while
  // !interactive) so visible dots stay glued to chromeUnion / liveUnion.
  const visible = nearCorners || activeKey != null;
  if (!visible) return null;

  let badgeVal = Math.round(baseRadii.tl);
  if (dragValue != null) {
    badgeVal = dragValue;
  } else if (activeKey && usePath) {
    badgeVal = Math.round(pathVertices[Number(activeKey)] ?? baseRadii.tl);
  } else if (activeKey && activeKey in baseRadii) {
    badgeVal = Math.round(baseRadii[activeKey as CornerKey]);
  }

  // Live radii while dragging so dots track the pointer before Redux catches up.
  const drag = dragRef.current;
  let liveBoxRadii = baseRadii;
  let livePathVertices = pathVertices;
  if (dragValue != null && drag) {
    if (drag.mode === 'box') {
      liveBoxRadii = drag.solo
        ? { ...baseRadii, [drag.corner]: dragValue }
        : { tl: dragValue, tr: dragValue, br: dragValue, bl: dragValue };
    } else {
      livePathVertices = drag.solo
        ? pathVertices.map((v, i) => (i === drag.sharpIndex ? dragValue : v))
        : pathVertices.map(() => dragValue);
    }
  }

  const hitSize = hitPx * k;
  const visualSize = visualPx * k;
  const stroke = RADIUS_STROKE_PX * k;
  const halfVis = visualSize / 2;

  const renderHandle = (
    key: string,
    pos: { x: number; y: number },
    onDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  ) => {
    const isActive = activeKey === key;
    return (
      <button
        key={key}
        type="button"
        data-radius-handle={key}
        className={interactive ? 'pointer-events-auto absolute' : 'pointer-events-none absolute'}
        style={{
          width: hitSize,
          height: hitSize,
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -50%)',
          cursor: interactive ? 'default' : undefined,
          background: 'transparent',
          border: 'none',
          padding: 0,
        }}
        aria-label={t('editor.imageToolbar.cornerRadius')}
        onPointerDown={interactive ? onDown : undefined}
        tabIndex={interactive ? 0 : -1}
      >
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
          width={visualSize}
          height={visualSize}
          aria-hidden
        >
          <circle
            cx={halfVis}
            cy={halfVis}
            r={Math.max(0.01, halfVis - stroke / 2)}
            fill="#ffffff"
            stroke="#3388ff"
            strokeWidth={stroke}
          />
          {isActive ? (
            <circle
              cx={halfVis}
              cy={halfVis}
              r={Math.max(0.01, halfVis + stroke)}
              fill="none"
              stroke="rgba(51,136,255,0.35)"
              strokeWidth={2 * k}
            />
          ) : null}
        </svg>
      </button>
    );
  };

  let badgePos: { x: number; y: number } | null = null;
  if (activeKey != null && dragValue != null) {
    if (usePath && pathSites) {
      const site = pathSites.find((s) => String(s.sharpIndex) === activeKey);
      if (site) {
        badgePos = pathHandleScenePos(
          site,
          livePathVertices[site.sharpIndex] ?? dragValue
        );
      }
    } else {
      const corner = RADIUS_CORNERS.find((c) => c.key === activeKey);
      if (corner) badgePos = boxHandleScenePos(corner, liveBoxRadii[corner.key]);
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[28] overflow-visible">
      {usePath && pathSites
        ? pathSites.map((site) => {
            const r = livePathVertices[site.sharpIndex] ?? 0;
            return renderHandle(String(site.sharpIndex), pathHandleScenePos(site, r), (e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const solo = e.altKey || !linked;
              dragRef.current = {
                mode: 'path',
                sharpIndex: site.sharpIndex,
                startVertices: [...pathVertices],
                linked,
                solo,
                site,
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
              };
              setActiveKey(String(site.sharpIndex));
              setDragValue(Math.round(pathVertices[site.sharpIndex] ?? 0));
              setNearCorners(true);
            });
          })
        : RADIUS_CORNERS.map((corner) => {
            const r = liveBoxRadii[corner.key];
            return renderHandle(corner.key, boxHandleScenePos(corner, r), (e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const solo = e.altKey || !linked;
              dragRef.current = {
                mode: 'box',
                corner: corner.key,
                startRadii: { ...baseRadii },
                linked,
                solo,
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
              };
              setActiveKey(corner.key);
              setDragValue(Math.round(baseRadii[corner.key]));
              setNearCorners(true);
            });
          })}
      {badgePos ? (
        <div
          className="pointer-events-none absolute z-[29] whitespace-nowrap font-semibold tabular-nums text-white"
          style={{
            left: badgePos.x,
            top: badgePos.y,
            transform: `translate(-50%, calc(-100% - ${12 * k}px))`,
            fontSize: 11 * k,
            lineHeight: 1.15,
            paddingInline: 6 * k,
            paddingBlock: 2.5 * k,
            borderRadius: 4 * k,
            background: '#3388ff',
          }}
        >
          {t('editor.imageToolbar.cornerRadius')} {badgeVal}
        </div>
      ) : null}
    </div>
  );
}

export default CornerRadiusHandlesOverlay;
