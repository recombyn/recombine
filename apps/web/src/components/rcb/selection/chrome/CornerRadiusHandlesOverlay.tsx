/**
 * Shape handles — corner radius.
 * Pointer engine stays in SelectionFeature; this paints world-SVG knobs only.
 *
 * Paint shell mirrors the shape-host SVG (same as HostPathChrome sel knobs) so
 * zoom / fractional DPR cannot desync dots from the blue control box.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  hostChromeBodyTransform,
  hostMirrorSvgProps,
  previewSvgNodeCornerRadii,
  sceneSurfaceSvgProps,
} from '@/components/rcb/scene/paint/sceneToSvg';
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
import { patchDocumentNode } from '@/store/modules/editor';
import {
  getShapeHost,
  getSharedNodeEls,
  notifyShapeHostGeometry,
  subscribeShapeHosts,
} from '@/components/rcb/shapes/shapeHostRegistry';
import type { SceneBox } from '../alignGuides';
import {
  CHROME_HANDLE_VIS_PX,
  CHROME_RADIUS_HIT_PX,
  CHROME_STROKE_PX,
  chromeHitScaleForBox,
  radiusHandleParkScreenPx,
  radiusHandlesFitOnScreen,
  radiusParkSceneForBox,
  WorldScreenBadge,
} from '../SelectionChrome';

/** Soft-click threshold (screen px²) — match SelectionFeature. */
const DRAG_DISTANCE_SQUARED = 16;

/** Ideal park when the box is large enough on screen (icon-centered hits). */
const RADIUS_PARK_PX = radiusHandleParkScreenPx();

function liveNodeEl(nodeId: string): Element | null {
  return (
    (getSharedNodeEls()?.get(nodeId) as Element | undefined) ||
    (getShapeHost(nodeId)?.el as Element | null | undefined) ||
    null
  );
}

/**
 * Twin the shape-host SVG viewport.
 * Local children: host-local box; sceneChildren: absolute scene (badges).
 */
function HostMirroredKnobSvg({
  nodeId,
  box,
  angle,
  localChildren,
  sceneChildren,
}: {
  nodeId: string;
  box: SceneBox;
  angle: number;
  localChildren: ReactNode;
  sceneChildren?: ReactNode;
}) {
  const camera = useRcbCamera();
  const [hostEpoch, setHostEpoch] = useState(0);
  useEffect(() => subscribeShapeHosts(() => setHostEpoch((n) => n + 1)), []);

  const host = getShapeHost(nodeId);
  const hostRoot = host?.root as SVGSVGElement | null | undefined;
  const el = (host?.el || getSharedNodeEls()?.get(nodeId)) as SVGElement | null | undefined;
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const pad = 32;
  void hostEpoch;

  const mirror = hostRoot ? hostMirrorSvgProps(hostRoot) : null;
  const mirrored = Boolean(mirror);
  const bodyTransform = hostChromeBodyTransform(el, box, angle, mirrored);

  if (mirror) {
    return (
      <svg
        data-rcb-infinite="1"
        className="absolute z-[16] overflow-visible"
        preserveAspectRatio="none"
        viewBox={mirror.viewBox}
        width={mirror.width}
        height={mirror.height}
        style={{
          ...mirror.style,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <g transform={bodyTransform} style={{ pointerEvents: 'none' }}>
          {localChildren}
        </g>
        {sceneChildren}
      </svg>
    );
  }

  const surf = sceneSurfaceSvgProps(
    {
      left: box.left - pad,
      top: box.top - pad,
      width: w + pad * 2,
      height: h + pad * 2,
    },
    camera
  );

  return (
    <svg
      data-rcb-infinite="1"
      className="absolute z-[16] overflow-visible"
      preserveAspectRatio="none"
      width={surf.width}
      height={surf.height}
      viewBox={surf.viewBox}
      style={{
        ...surf.style,
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      <g transform={bodyTransform} style={{ pointerEvents: 'none' }}>
        {localChildren}
      </g>
      {sceneChildren}
    </svg>
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

/**
 * Seat inset from the corner: tracks R. When R is below the park distance,
 * keep a screen-constant inset so the radius hit clears the resize hit under any zoom.
 * Park is clamped on tiny boxes so the seat cannot cross the center.
 */
export function radiusSeatInset(r: number, halfSide: number, parkScene: number): number {
  const park = Math.min(Math.max(0, parkScene), Math.max(0, halfSide * 0.45));
  const capped = Math.max(0, Math.min(Number(r) || 0, Math.max(0, halfSide - park)));
  return Math.max(park, capped);
}

/**
 * Path seats travel along the inward bisector. Axis AABB clearance needs the
 * same park on both axes as box-mode `(inset, inset)` — so along ≥ park / min(|ix|,|iy|).
 */
export function radiusParkAlongBisector(
  parkScene: number,
  ix: number,
  iy: number
): number {
  const park = Math.max(0, parkScene);
  const ax = Math.abs(Number(ix) || 0);
  const ay = Math.abs(Number(iy) || 0);
  const m = Math.min(ax, ay);
  if (!(m > 1e-9)) return park;
  return park / m;
}

/** Path sharp-corner radii list — stored vertices, or uniform fallback from box radii. */
function resolvePathVertexRadii(
  attrs: any,
  pathVertexCount: number,
  baseRadii: CornerRadii
): number[] {
  const stored = parseRadiusVertices(attrs?.radiusVertices);
  if (stored.length === pathVertexCount) return stored;
  const u = Math.round((baseRadii.tl + baseRadii.tr + baseRadii.br + baseRadii.bl) / 4);
  return Array.from({ length: pathVertexCount }, () => (stored.length ? stored[0] ?? u : u));
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
          radius: Math.max(
            0,
            Math.round(Math.max(clamped.tl, clamped.tr, clamped.br, clamped.bl))
          ),
          cornerRadius: Math.max(
            0,
            Math.round(Math.max(clamped.tl, clamped.tr, clamped.br, clamped.bl))
          ),
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

/**
 * Corner-radius dots on the world camera layer (same SVG contract as
 * SelectionChrome). Seat tracks R; screen size = px / zoom under CSS scale.
 */
function CornerRadiusHandlesOverlay({
  box,
  angle,
  nodeId,
  node,
  toScene,
  stageEl: _stageEl,
  interactive = true,
}: {
  box: SceneBox;
  angle: number;
  nodeId: string;
  node: any;
  toScene: (clientX: number, clientY: number) => { x: number; y: number };
  /** Kept for call-site parity with other shape overlays (unused — seats always show). */
  stageEl: HTMLElement | null;
  /** False while moving/resizing so dots follow chrome without stealing pointers. */
  interactive?: boolean;
}) {
  const shapeType = String(
    node?.attrs?.shapeType || (node?.key === 'ellipse' ? 'ellipse' : node?.key) || 'rect'
  );
  // Circle / ellipse: no corners — AABB park seats sit in the empty square corners
  // (outside the disk). Rect-style R dots stay off.
  if (shapeType === 'circle' || shapeType === 'ellipse' || node?.key === 'ellipse') {
    return null;
  }

  const { t } = useTranslation();
  const dispatch = useDispatch();
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
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
    ? resolvePathVertexRadii(node?.attrs, pathVertexCount, baseRadii)
    : [];

  // Seat tracks R (scene). Park when R≈0 so radius hit clears the resize hit.
  // Screen budget keeps seats near corners at every zoom (not only one %).
  const hitScale = chromeHitScaleForBox(w, h, z);
  const hitPx = CHROME_RADIUS_HIT_PX * hitScale;
  const k = 1 / z;
  const parkScene = radiusParkSceneForBox(w, h, z, RADIUS_PARK_PX);
  const radiusInteractive =
    interactive && radiusHandlesFitOnScreen(w, h, z, RADIUS_PARK_PX);
  // `box` prop is path geom (caller deflates visual chrome). Host-mirrored
  // local space is also geom — path sites need no chrome pad.
  const halfSide = Math.min(w, h) / 2;

  const radiusHandleInset = (r: number) => radiusSeatInset(r, halfSide, parkScene);

  const boxHandleLocalPos = (corner: (typeof RADIUS_CORNERS)[number], r: number) => {
    const inset = radiusHandleInset(r);
    return {
      lx: corner.cx === 0 ? inset : w - inset,
      ly: corner.cy === 0 ? inset : h - inset,
    };
  };

  const boxHandleScenePos = (corner: (typeof RADIUS_CORNERS)[number], r: number) => {
    const { lx, ly } = boxHandleLocalPos(corner, r);
    return localPointToScene(lx, ly, box, angle);
  };

  const pathHandleLocalPos = (site: SharpCornerSite, r: number) => {
    const along = radiusParkAlongBisector(radiusHandleInset(r), site.ix, site.iy);
    return {
      lx: site.x + site.ix * along,
      ly: site.y + site.iy * along,
    };
  };

  const pathHandleScenePos = (site: SharpCornerSite, r: number) => {
    const { lx, ly } = pathHandleLocalPos(site, r);
    return localPointToScene(lx, ly, box, angle);
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
    const along = (local.x - site.x) * site.ix + (local.y - site.y) * site.iy;
    // Inverse of radiusParkAlongBisector: axis park ↔ R (same as box inset).
    const m = Math.min(Math.abs(site.ix), Math.abs(site.iy));
    const axis = m > 1e-9 ? along * m : along;
    return Math.max(0, Math.min(maxR, axis));
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
    if (
      previewSvgNodeCornerRadii(map, nodeId, {
        width: w,
        height: h,
        shapeType,
        radii,
        attrs,
      })
    ) {
      notifyShapeHostGeometry(nodeId);
    }
  };

  useEffect(() => {
    if (!radiusInteractive) return undefined;

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
  }, [dispatch, node, nodeId, box, angle, w, h, maxR, toScene, radiusInteractive, linked]);

  // Always show while selected — seats track R (park only when R≈0).
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
  const visualSize = CHROME_HANDLE_VIS_PX * k;
  const stroke = CHROME_STROKE_PX * k;
  const halfVis = visualSize / 2;
  const halfHit = hitSize / 2;

  type HandleSpec = {
    key: string;
    lx: number;
    ly: number;
    onDown: (e: ReactPointerEvent<SVGElement>) => void;
  };

  const handles: HandleSpec[] =
    usePath && pathSites
      ? pathSites.map((site) => {
          const r = livePathVertices[site.sharpIndex] ?? 0;
          const { lx, ly } = pathHandleLocalPos(site, r);
          return {
            key: String(site.sharpIndex),
            lx,
            ly,
            onDown: (e: ReactPointerEvent<SVGElement>) => {
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
            },
          };
        })
      : RADIUS_CORNERS.map((corner) => {
          const r = liveBoxRadii[corner.key];
          const { lx, ly } = boxHandleLocalPos(corner, r);
          return {
            key: corner.key,
            lx,
            ly,
            onDown: (e: ReactPointerEvent<SVGElement>) => {
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
            },
          };
        });

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
    <HostMirroredKnobSvg
      nodeId={nodeId}
      box={box}
      angle={angle}
      localChildren={handles.map((h) => {
        const isActive = activeKey === h.key;
        return (
          <g
            key={h.key}
            data-radius-handle={h.key}
            transform={`translate(${h.lx} ${h.ly})`}
            style={{
              pointerEvents: radiusInteractive ? 'all' : 'none',
              cursor: radiusInteractive ? 'default' : undefined,
            }}
            onPointerDown={radiusInteractive ? h.onDown : undefined}
          >
            <rect x={-halfHit} y={-halfHit} width={hitSize} height={hitSize} fill="transparent" />
            <circle
              r={Math.max(0.01, halfVis - stroke / 2)}
              fill="#ffffff"
              stroke="#3388ff"
              strokeWidth={stroke}
              style={{ pointerEvents: 'none' }}
            />
            {isActive ? (
              <circle
                r={Math.max(0.01, halfVis + stroke)}
                fill="none"
                stroke="rgba(51,136,255,0.35)"
                strokeWidth={2 * k}
                style={{ pointerEvents: 'none' }}
              />
            ) : null}
          </g>
        );
      })}
      sceneChildren={
        badgePos ? (
          <WorldScreenBadge
            text={`${t('editor.imageToolbar.cornerRadius')} ${badgeVal}`}
            x={badgePos.x}
            y={badgePos.y}
            inv={k}
            anchor="above"
            clearance={12 * k}
          />
        ) : null
      }
    />
  );
}

export default CornerRadiusHandlesOverlay;
