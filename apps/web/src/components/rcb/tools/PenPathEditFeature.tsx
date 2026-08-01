import { useEffect, useRef, useState, memo } from 'react';
import {
  useRcbCamera,
  useRcbScreenToScene,
} from '../camera/context';
import {
  boundsOfAnchors,
  CLOSE_THRESHOLD,
  findClosestPathHit,
  localizeAnchors,
  offsetAnchors,
  penAnchorsToD,
  penSubpathsFromD,
  penSubpathsToD,
  withMirroredHandles,
  type PenAnchor,
} from './penPath';
import { nodeLeftTop } from '../scene/paint/sceneToSvg';
import { normalizePathDForEdit } from '../scene/paint/outlineToPath';
import RcbSceneOverlaySvg from '../canvas/RcbSceneOverlaySvg';

type HandleSide = 'in' | 'out';
type AnchorRef = { sub: number; index: number };
type HandleHit = AnchorRef & { side: HandleSide };

type PenSubpath = { anchors: PenAnchor[]; closed: boolean };

type DragKind =
  | { kind: 'anchor'; sub: number; index: number; ox: number; oy: number; start: PenAnchor }
  | { kind: 'handle'; sub: number; index: number; side: HandleSide; mirror: boolean }
  /** Alt/Option-drag on anchor 鈥?Adobe Convert Point: pull out mirrored handles. */
  | { kind: 'convert'; sub: number; index: number; ax: number; ay: number; pulled: boolean };

function anchorHasHandles(a: PenAnchor) {
  return (
    (a.outX != null && a.outY != null) || (a.inX != null && a.inY != null)
  );
}

type Props = {
  enabled: boolean;
  nodeId: string;
  document: any;
  paperEl: HTMLElement | null;
  stageEl?: HTMLElement | null;
  /**
   * Path-edit toolbar Pen (independent of the bottom toolstrip):
   * hover path edge 鈫?preview dot; click to draw a new path in-place
   * (never activates the global Pen tool / PenStrokeToolbar).
   */
  drawNewShapeMode?: boolean;
  /** Stroke paint for newly drawn paths (path-edit Pen). */
  newStrokeColor?: string;
  newStrokeWidth?: number;
  onCommitNewShape?: (payload: {
    pathD: string;
    box: { left: number; top: number; width: number; height: number };
    closed: boolean;
  }) => void;
  onCommit: (payload: {
    nodeId: string;
    pathD: string;
    box: { left: number; top: number; width: number; height: number };
    closed: boolean;
  }) => void;
  onExit: () => void;
};

const HANDLE_HIT_PX = 14;
const ANCHOR_HIT_PX = 16;
/** Screen px 鈥?hover near stroke to show a preview dot. */
const PATH_HIT_PX = 14;

function hitRadiusScene(zoom: number, screenPx: number) {
  return screenPx / Math.max(0.05, zoom || 1);
}

function hitHandle(
  subs: PenSubpath[],
  p: { x: number; y: number },
  radius: number
): HandleHit | null {
  let best: HandleHit | null = null;
  let bestD = radius;
  for (let s = 0; s < subs.length; s += 1) {
    const anchors = subs[s].anchors;
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      if (a.outX != null && a.outY != null) {
        const d = Math.hypot(p.x - a.outX, p.y - a.outY);
        if (d <= bestD) {
          bestD = d;
          best = { sub: s, index: i, side: 'out' };
        }
      }
      if (a.inX != null && a.inY != null) {
        const d = Math.hypot(p.x - a.inX, p.y - a.inY);
        if (d <= bestD) {
          bestD = d;
          best = { sub: s, index: i, side: 'in' };
        }
      }
    }
  }
  return best;
}

function hitAnchor(subs: PenSubpath[], p: { x: number; y: number }, radius: number): AnchorRef | null {
  let best: AnchorRef | null = null;
  let bestD = radius;
  for (let s = 0; s < subs.length; s += 1) {
    const anchors = subs[s].anchors;
    for (let i = 0; i < anchors.length; i += 1) {
      const d = Math.hypot(p.x - anchors[i].x, p.y - anchors[i].y);
      if (d <= bestD) {
        bestD = d;
        best = { sub: s, index: i };
      }
    }
  }
  return best;
}

function findClosestOnSubpaths(
  subs: PenSubpath[],
  px: number,
  py: number
): { x: number; y: number; dist: number } | null {
  let best: { x: number; y: number; dist: number } | null = null;
  for (const s of subs) {
    const hit = findClosestPathHit(s.anchors, s.closed, px, py);
    if (hit && (!best || hit.dist < best.dist)) {
      best = { x: hit.x, y: hit.y, dist: hit.dist };
    }
  }
  return best;
}

function boundsOfSubpaths(subs: PenSubpath[]) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const s of subs) {
    if (s.anchors.length < 2) continue;
    const b = boundsOfAnchors(s.anchors, s.closed);
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
  }
  if (!Number.isFinite(left)) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function mapSubpathAnchor(
  subs: PenSubpath[],
  sub: number,
  index: number,
  fn: (a: PenAnchor) => PenAnchor
): PenSubpath[] {
  return subs.map((s, si) => {
    if (si !== sub) return s;
    const anchors = s.anchors.map((a, i) => (i === index ? fn(a) : a));
    return { ...s, anchors };
  });
}

function handleDiamondPoints(cx: number, cy: number, r: number) {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
}

function clearHandle(anchor: PenAnchor, side: HandleSide): PenAnchor {
  if (side === 'out') {
    const next: PenAnchor = { x: anchor.x, y: anchor.y };
    if (anchor.inX != null && anchor.inY != null) {
      next.inX = anchor.inX;
      next.inY = anchor.inY;
    }
    return next;
  }
  const next: PenAnchor = { x: anchor.x, y: anchor.y };
  if (anchor.outX != null && anchor.outY != null) {
    next.outX = anchor.outX;
    next.outY = anchor.outY;
  }
  return next;
}

function clearAllHandles(anchor: PenAnchor): PenAnchor {
  return { x: anchor.x, y: anchor.y };
}

function setHandle(
  anchor: PenAnchor,
  side: HandleSide,
  hx: number,
  hy: number,
  mirror: boolean
): PenAnchor {
  if (mirror) {
    if (side === 'out') {
      return withMirroredHandles({ x: anchor.x, y: anchor.y, outX: hx, outY: hy });
    }
    return withMirroredHandles({
      x: anchor.x,
      y: anchor.y,
      outX: anchor.x * 2 - hx,
      outY: anchor.y * 2 - hy,
    });
  }
  if (side === 'out') {
    return {
      x: anchor.x,
      y: anchor.y,
      outX: hx,
      outY: hy,
      ...(anchor.inX != null && anchor.inY != null ? { inX: anchor.inX, inY: anchor.inY } : {}),
    };
  }
  return {
    x: anchor.x,
    y: anchor.y,
    inX: hx,
    inY: hy,
    ...(anchor.outX != null && anchor.outY != null ? { outX: anchor.outX, outY: anchor.outY } : {}),
  };
}

function loadSceneAnchors(document: any, nodeId: string) {
  const node = document?.deltaSetLike?.[nodeId];
  if (!node) return null;
  const raw = String(node.attrs?.path || node.attrs?.d || '');
  if (!raw.trim()) return null;
  // Normalize arcs / shorthand so anchors parse reliably after outline.
  // Keep multi-contour paths intact (do not sample into one polyline).
  const d = normalizePathDForEdit(raw) || raw;
  const { left, top } = nodeLeftTop(document, node);
  const parsed = penSubpathsFromD(d);
  if (!parsed.length) return null;
  const strokeOn =
    node.attrs?.['stroke-enabled'] !== false && node.attrs?.['stroke-enabled'] !== 'false';
  const bw = Number(node.attrs?.['border-width'] ?? node.attrs?.borderWidth ?? 0);
  const strokeWidth = strokeOn ? Math.max(0, Number.isFinite(bw) ? bw : 0) : 0;
  const strokeColor = String(node.attrs?.['border-color'] || node.attrs?.stroke || '#333333');
  const fillColor = String(node.attrs?.['fill-color'] || node.attrs?.fill || '');
  const fillEnabled =
    node.attrs?.['fill-enabled'] !== false &&
    node.attrs?.['fill-enabled'] !== 'false' &&
    fillColor &&
    fillColor !== 'transparent';
  const fillRule =
    String(node.attrs?.['fill-rule'] || node.attrs?.fillRule || 'nonzero') === 'evenodd'
      ? 'evenodd'
      : 'nonzero';
  const anyClosed = parsed.some((s) => s.closed);
  return {
    subpaths: parsed.map((s) => ({
      anchors: offsetAnchors(s.anchors, left, top),
      closed: s.closed,
    })),
    strokeWidth,
    strokeColor,
    strokeEnabled: strokeOn && strokeWidth > 0,
    fill: anyClosed && fillEnabled ? fillColor : 'none',
    fillRule,
  };
}

/**
 * Double-click pen path 鈫?edit anchors / Bezier handles.
 * Path-edit: Esc / ✓ finish. Empty-canvas click never auto-exits
 * (Pen subtool keeps adding draft points; Select subtool only clears handle chrome).
 * Path-edit toolbar Pen: hover path shows a preview dot; click draws a new
 * path in-place (does not activate the global Pen tool).
 *
 * Convert Point (same idea as PS / AI):
 * - Alt/Option + drag on an anchor 鈫?pull out mirrored handles (restore curve)
 * - Alt/Option + click on an anchor with handles 鈫?remove handles (corner)
 * - Double-click anchor 鈫?remove handles
 * - Alt/Option + click a handle 鈫?delete that side鈥檚 handle
 */
function PenPathEditFeature({
  enabled,
  nodeId,
  document,
  paperEl,
  stageEl = null,
  drawNewShapeMode = false,
  newStrokeColor = '#333333',
  newStrokeWidth = 2,
  onCommitNewShape,
  onCommit,
  onExit,
}: Props) {
  const camera = useRcbCamera();
  const toScene = useRcbScreenToScene();
  const [subpaths, setSubpaths] = useState<PenSubpath[]>([]);
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [strokeColor, setStrokeColor] = useState('#333333');
  const [strokeEnabled, setStrokeEnabled] = useState(false);
  const [fillColor, setFillColor] = useState('none');
  const [fillRule, setFillRule] = useState<'nonzero' | 'evenodd'>('nonzero');
  const [selectedHandle, setSelectedHandle] = useState<HandleHit | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleHit | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<AnchorRef | null>(null);
  const [pathHover, setPathHover] = useState<{ x: number; y: number } | null>(null);
  /** In-place new path while path-edit Pen is active (keeps edge-hover + PathEditToolbar). */
  const [draftAnchors, setDraftAnchors] = useState<PenAnchor[]>([]);
  const [draftCursor, setDraftCursor] = useState<{ x: number; y: number } | null>(null);

  const subpathsRef = useRef<PenSubpath[]>([]);
  const strokeWidthRef = useRef(0);
  const draftAnchorsRef = useRef<PenAnchor[]>([]);
  const pathHoverRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragKind | null>(null);
  const dirtyRef = useRef(false);
  const lastAnchorTapRef = useRef<{ sub: number; index: number; t: number } | null>(null);
  const selectedHandleRef = useRef<HandleHit | null>(null);
  const onCommitRef = useRef(onCommit);
  const onExitRef = useRef(onExit);
  const onCommitNewShapeRef = useRef(onCommitNewShape);
  const drawNewRef = useRef(drawNewShapeMode);
  const newStrokeWidthRef = useRef(newStrokeWidth);
  onCommitRef.current = onCommit;
  onExitRef.current = onExit;
  onCommitNewShapeRef.current = onCommitNewShape;
  drawNewRef.current = drawNewShapeMode;
  newStrokeWidthRef.current = newStrokeWidth;

  subpathsRef.current = subpaths;
  strokeWidthRef.current = strokeWidth;
  draftAnchorsRef.current = draftAnchors;
  pathHoverRef.current = pathHover;
  selectedHandleRef.current = selectedHandle;

  const commitDirty = () => {
    const list = subpathsRef.current;
    if (list.length && dirtyRef.current) {
      const pad = Math.max(0, strokeWidthRef.current) / 2;
      const bounds = boundsOfSubpaths(list);
      const box = {
        left: bounds.left - pad,
        top: bounds.top - pad,
        width: bounds.width + pad * 2,
        height: bounds.height + pad * 2,
      };
      const local = list.map((s) => ({
        anchors: localizeAnchors(s.anchors, box.left, box.top),
        closed: s.closed,
      }));
      const d = penSubpathsToD(local);
      onCommitRef.current({
        nodeId,
        pathD: d,
        box,
        closed: list.every((s) => s.closed),
      });
    }
    dirtyRef.current = false;
  };

  const commitDraftIfAny = (closedDraft: boolean) => {
    const list = draftAnchorsRef.current;
    if (list.length < 2) {
      setDraftAnchors([]);
      setDraftCursor(null);
      return false;
    }
    const pad = Math.max(1, newStrokeWidthRef.current) / 2;
    const bounds = boundsOfAnchors(list, closedDraft);
    const box = {
      left: bounds.left - pad,
      top: bounds.top - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
    };
    const local = localizeAnchors(list, box.left, box.top);
    const d = penAnchorsToD(local, closedDraft);
    onCommitNewShapeRef.current?.({ pathD: d, box, closed: closedDraft });
    setDraftAnchors([]);
    setDraftCursor(null);
    return true;
  };

  const commitAndExit = () => {
    commitDirty();
    commitDraftIfAny(false);
    setPathHover(null);
    setDraftCursor(null);
    onExitRef.current();
  };

  useEffect(() => {
    if (!drawNewShapeMode) {
      // Leaving Pen subtool: keep a 鈮?-point draft as an open path.
      commitDraftIfAny(false);
      setPathHover(null);
      setDraftCursor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawNewShapeMode]);

  useEffect(() => {
    if (!enabled || !nodeId) {
      setSubpaths([]);
      setPathHover(null);
      setDraftAnchors([]);
      setDraftCursor(null);
      return;
    }
    const loaded = loadSceneAnchors(document, nodeId);
    if (!loaded) {
      onExitRef.current();
      return;
    }
    setSubpaths(loaded.subpaths);
    setStrokeWidth(loaded.strokeWidth);
    setStrokeColor(loaded.strokeColor);
    setStrokeEnabled(loaded.strokeEnabled);
    setFillColor(loaded.fill || 'none');
    setFillRule(loaded.fillRule);
    dirtyRef.current = false;
    dragRef.current = null;
    setSelectedHandle(null);
    setHoverHandle(null);
    setHoverAnchor(null);
    setPathHover(null);
    setDraftAnchors([]);
    setDraftCursor(null);
    // Reload when path geometry changes (e.g. path-edit pen boolean union).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    nodeId,
    String(document?.deltaSetLike?.[nodeId]?.attrs?.path || document?.deltaSetLike?.[nodeId]?.attrs?.d || ''),
    Number(document?.deltaSetLike?.[nodeId]?.width),
    Number(document?.deltaSetLike?.[nodeId]?.height),
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onExitToolbar = () => commitAndExit();
    window.addEventListener('resume:exit-path-edit', onExitToolbar);
    return () => window.removeEventListener('resume:exit-path-edit', onExitToolbar);
    // commitAndExit closes over refs 鈥?stable enough for this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nodeId]);

  useEffect(() => {
    const hitEl = stageEl || paperEl;
    if (!enabled || !hitEl) return undefined;

    const radii = () => ({
      anchor: hitRadiusScene(camera.zoom, ANCHOR_HIT_PX),
      handle: hitRadiusScene(camera.zoom, HANDLE_HIT_PX),
      path: hitRadiusScene(camera.zoom, PATH_HIT_PX),
    });

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-sel-toolbar],[data-frame-toolbar],[data-text-inline-editor]')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const p = toScene(e.clientX, e.clientY);
      const list = subpathsRef.current;
      const { anchor: anchorR, handle: handleR } = radii();

      // Path-edit Pen: draw a new path in-place (keep edge hover; never leave to Pen tool).
      if (drawNewRef.current) {
        const draft = draftAnchorsRef.current;
        const hover = pathHoverRef.current;
        const place =
          hover && Math.hypot(hover.x - p.x, hover.y - p.y) < 24 / Math.max(0.05, camera.zoom || 1)
            ? { x: hover.x, y: hover.y }
            : p;
        if (draft.length >= 2) {
          const first = draft[0];
          if (Math.hypot(place.x - first.x, place.y - first.y) <= CLOSE_THRESHOLD) {
            commitDraftIfAny(true);
            return;
          }
        }
        setDraftAnchors((prev) => [...prev, { x: place.x, y: place.y }]);
        setDraftCursor(place);
        return;
      }

      const aRef = hitAnchor(list, p, anchorR);
      const handleHit = aRef ? null : hitHandle(list, p, handleR);

      // Select subtool (convert / drag / empty-exit).
      if (handleHit && (e.altKey || e.metaKey)) {
        dirtyRef.current = true;
        setSubpaths((prev) =>
          mapSubpathAnchor(prev, handleHit.sub, handleHit.index, (a) =>
            clearHandle(a, handleHit.side)
          )
        );
        setSelectedHandle(null);
        return;
      }

      if (handleHit) {
        dragRef.current = {
          kind: 'handle',
          sub: handleHit.sub,
          index: handleHit.index,
          side: handleHit.side,
          mirror: !e.altKey,
        };
        setSelectedHandle(handleHit);
        try {
          hitEl.setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }

      if (aRef) {
        const a = list[aRef.sub]?.anchors[aRef.index];
        if (!a) return;
        // Adobe Convert Point: Alt/Option on the anchor (not Meta — reserved for OS).
        if (e.altKey) {
          dragRef.current = {
            kind: 'convert',
            sub: aRef.sub,
            index: aRef.index,
            ax: a.x,
            ay: a.y,
            pulled: false,
          };
          lastAnchorTapRef.current = null;
          setSelectedHandle(null);
          try {
            hitEl.setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore */
          }
          return;
        }

        const now = Date.now();
        const last = lastAnchorTapRef.current;
        if (
          last &&
          last.sub === aRef.sub &&
          last.index === aRef.index &&
          now - last.t < 450
        ) {
          dirtyRef.current = true;
          setSubpaths((prev) =>
            mapSubpathAnchor(prev, aRef.sub, aRef.index, clearAllHandles)
          );
          lastAnchorTapRef.current = null;
          setSelectedHandle(null);
          return;
        }
        lastAnchorTapRef.current = { sub: aRef.sub, index: aRef.index, t: now };
        dragRef.current = {
          kind: 'anchor',
          sub: aRef.sub,
          index: aRef.index,
          ox: p.x,
          oy: p.y,
          start: { ...a },
        };
        try {
          hitEl.setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }

      // Empty canvas: stay in path-edit. Exit only via ✓ / Esc / bottom Select.
      setSelectedHandle(null);
      setHoverHandle(null);
      setHoverAnchor(null);
      setPathHover(null);
    };

    const onMove = (e: PointerEvent) => {
      const p = toScene(e.clientX, e.clientY);
      const drag = dragRef.current;
      if (!drag) {
        const { anchor: anchorR, handle: handleR, path: pathR } = radii();
        const list = subpathsRef.current;
        if (drawNewRef.current) {
          // Always show edge preview on the edited path 鈥?even mid-draw.
          const nearest = findClosestOnSubpaths(list, p.x, p.y);
          if (nearest && nearest.dist <= pathR) {
            setPathHover({ x: nearest.x, y: nearest.y });
          } else {
            setPathHover(null);
          }
          if (draftAnchorsRef.current.length > 0) {
            setDraftCursor(p);
          }
          setHoverAnchor(null);
          setHoverHandle(null);
          return;
        }
        setHoverAnchor(hitAnchor(list, p, anchorR));
        setHoverHandle(hitHandle(list, p, handleR));
        setPathHover(null);
        return;
      }

      if (drag.kind === 'convert') {
        const dist = Math.hypot(p.x - drag.ax, p.y - drag.ay);
        // Small threshold so a plain Alt-click can still mean 鈥渕ake corner鈥?
        if (dist < 3 / Math.max(0.05, camera.zoom || 1)) return;
        drag.pulled = true;
        dirtyRef.current = true;
        setSubpaths((prev) =>
          mapSubpathAnchor(prev, drag.sub, drag.index, () =>
            withMirroredHandles({
              x: drag.ax,
              y: drag.ay,
              outX: p.x,
              outY: p.y,
            })
          )
        );
        setSelectedHandle({ sub: drag.sub, index: drag.index, side: 'out' });
        return;
      }

      if (drag.kind === 'anchor') {
        dirtyRef.current = true;
        const dx = p.x - drag.ox;
        const dy = p.y - drag.oy;
        setSubpaths((prev) =>
          mapSubpathAnchor(prev, drag.sub, drag.index, () => {
            const s = drag.start;
            return {
              ...s,
              x: s.x + dx,
              y: s.y + dy,
              ...(s.inX != null && s.inY != null
                ? { inX: s.inX + dx, inY: s.inY + dy }
                : {}),
              ...(s.outX != null && s.outY != null
                ? { outX: s.outX + dx, outY: s.outY + dy }
                : {}),
            };
          })
        );
        return;
      }

      dirtyRef.current = true;
      setSubpaths((prev) =>
        mapSubpathAnchor(prev, drag.sub, drag.index, (a) =>
          setHandle(a, drag.side, p.x, p.y, drag.mirror)
        )
      );
      setSelectedHandle({ sub: drag.sub, index: drag.index, side: drag.side });
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Alt-click (no drag): convert smooth 鈫?corner (remove handles).
      if (drag.kind === 'convert' && !drag.pulled) {
        const a = subpathsRef.current[drag.sub]?.anchors[drag.index];
        if (a && anchorHasHandles(a)) {
          dirtyRef.current = true;
          setSubpaths((prev) =>
            mapSubpathAnchor(prev, drag.sub, drag.index, clearAllHandles)
          );
          setSelectedHandle(null);
        }
      }
      dragRef.current = null;
      try {
        hitEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        if (drawNewRef.current && draftAnchorsRef.current.length >= 2) {
          e.preventDefault();
          e.stopPropagation();
          commitDraftIfAny(false);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        commitAndExit();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedHandleRef.current;
        if (!sel) return;
        e.preventDefault();
        dirtyRef.current = true;
        setSubpaths((prev) =>
          mapSubpathAnchor(prev, sel.sub, sel.index, (a) => clearHandle(a, sel.side))
        );
        setSelectedHandle(null);
      }
    };

    hitEl.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
    return () => {
      hitEl.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [enabled, paperEl, stageEl, camera.zoom, toScene, nodeId]);

  if (!enabled || !subpaths.length) return null;

  const d = penSubpathsToD(subpaths);
  const sw = Math.max(0, strokeWidth);
  // Screen-fixed chrome — do not scale with stroke width (outlined text / thick fills).
  const zoom = Math.max(0.15, camera.zoom || 1);
  const anchorR = Math.min(5.5, 4.25 / zoom);
  const handleR = Math.min(4.25, 3.1 / zoom);
  // Fill-only paths (stroke off) still need a visible edit centerline.
  const editStrokeOn = strokeEnabled || fillColor === 'none';
  const editStrokeColor = strokeEnabled ? strokeColor : '#3388ff';
  const pathSw = editStrokeOn ? Math.min(Math.max(sw || 1.5, 0.5), 2.25 / zoom) : 0;
  const draftD =
    draftAnchors.length >= 2
      ? penAnchorsToD(draftAnchors, false)
      : draftAnchors.length === 1 && draftCursor
        ? `M ${draftAnchors[0].x} ${draftAnchors[0].y} L ${draftCursor.x} ${draftCursor.y}`
        : '';
  const draftRubber =
    draftAnchors.length >= 2 && draftCursor
      ? `M ${draftAnchors[draftAnchors.length - 1].x} ${draftAnchors[draftAnchors.length - 1].y} L ${draftCursor.x} ${draftCursor.y}`
      : '';

  const renderHandle = (sub: number, i: number, side: HandleSide, hx: number, hy: number, ax: number, ay: number) => {
    const active =
      (selectedHandle?.sub === sub && selectedHandle?.index === i && selectedHandle.side === side) ||
      (hoverHandle?.sub === sub && hoverHandle?.index === i && hoverHandle.side === side);
    const r = handleR + (active ? 0.7 / Math.max(0.15, camera.zoom || 1) : 0);
    return (
      <g key={`h-${sub}-${i}-${side}`}>
        <line
          x1={ax}
          y1={ay}
          x2={hx}
          y2={hy}
          stroke="#8b8b8b"
          strokeWidth={1 / Math.max(0.15, camera.zoom || 1)}
        />
        <polygon
          points={handleDiamondPoints(hx, hy, r)}
          fill={active ? '#3388ff' : '#fff'}
          stroke={active ? '#3388ff' : '#383838'}
          strokeWidth={(active ? 1.35 : 1) / Math.max(0.15, camera.zoom || 1)}
        />
      </g>
    );
  };

  return (
    <RcbSceneOverlaySvg>
      <path
        d={d}
        fill={fillColor !== 'none' ? fillColor : 'none'}
        fillRule={fillRule}
        stroke={editStrokeOn ? editStrokeColor : 'none'}
        strokeWidth={pathSw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {subpaths.map((sp, si) =>
        sp.anchors.map((a, i) => {
          const hovered = hoverAnchor?.sub === si && hoverAnchor?.index === i;
          return (
            <g key={`a-${si}-${i}`}>
              {a.outX != null && a.outY != null
                ? renderHandle(si, i, 'out', a.outX, a.outY, a.x, a.y)
                : null}
              {a.inX != null && a.inY != null
                ? renderHandle(si, i, 'in', a.inX, a.inY, a.x, a.y)
                : null}
              <circle
                cx={a.x}
                cy={a.y}
                r={anchorR + (hovered ? 0.8 / zoom : 0)}
                fill={hovered ? '#3388ff' : '#fff'}
                stroke="#3388ff"
                strokeWidth={1.25 / zoom}
              />
            </g>
          );
        })
      )}
      {pathHover ? (
        <circle
          cx={pathHover.x}
          cy={pathHover.y}
          r={anchorR}
          fill="#3388ff"
          stroke="#fff"
          strokeWidth={1.5 / zoom}
          pointerEvents="none"
        />
      ) : null}
      {draftD ? (
        <path
          d={draftD}
          fill="none"
          stroke={newStrokeColor}
          strokeWidth={Math.max(1, newStrokeWidth) / zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ) : null}
      {draftRubber ? (
        <path
          d={draftRubber}
          fill="none"
          stroke={newStrokeColor}
          strokeWidth={Math.max(1, newStrokeWidth) / zoom}
          strokeLinecap="round"
          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
          opacity={0.7}
          pointerEvents="none"
        />
      ) : null}
      {draftAnchors.map((a, i) => (
        <circle
          key={`draft-a-${i}`}
          cx={a.x}
          cy={a.y}
          r={anchorR}
          fill="#fff"
          stroke="#3388ff"
          strokeWidth={1.25 / zoom}
          pointerEvents="none"
        />
      ))}
    </RcbSceneOverlaySvg>
  );
}

export default memo(PenPathEditFeature);
