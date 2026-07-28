import {
  useRcbCamera,
  useRcbScreenToScene,
} from '../camera/context';
import { useEffect, useRef, useState } from 'react';
import {
  CLOSE_THRESHOLD,
  localizeAnchors,
  penAnchorsToD,
  boundsOfAnchors,
  withMirroredHandles,
  type PenAnchor,
} from './penPath';
import RcbSceneOverlaySvg from '../canvas/RcbSceneOverlaySvg';
import { isEditablePathNode } from '../scene/outlineToPath';
import { PEN_CURSOR } from './PencilDrawFeature';

type HandleSide = 'in' | 'out';

type HandleHit = { index: number; side: HandleSide };

type DragKind =
  | { kind: 'place' }
  | { kind: 'close' }
  | { kind: 'handle'; index: number; side: HandleSide; mirror: boolean };

type PenDrawFeatureProps = {
  enabled: boolean;
  artboard: { width: number; height: number };
  paperEl: HTMLElement | null;
  stageEl?: HTMLElement | null;
  strokeColor?: string;
  strokeWidth?: number;
  onCommit: (
    pathD: string,
    box: { left: number; top: number; width: number; height: number },
    closed: boolean
  ) => void;
  onCancel?: () => void;
  hitTest?: (
    x: number,
    y: number,
    screen?: { clientX: number; clientY: number }
  ) => string | null;
  onEditExistingPath?: (nodeId: string) => void;
  document?: any;
};

const HANDLE_HIT_PX = 14;
const ANCHOR_HIT_PX = 16;
const ANCHOR_DBL_MS = 450;

/** Scene-space radius matching ~screenPx at current camera zoom. */
function hitRadiusScene(zoom: number, screenPx: number) {
  return screenPx / Math.max(0.05, zoom || 1);
}

function hitHandle(
  anchors: PenAnchor[],
  p: { x: number; y: number },
  radius: number
): HandleHit | null {
  let best: HandleHit | null = null;
  let bestD = radius;
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i];
    if (a.outX != null && a.outY != null) {
      const d = Math.hypot(p.x - a.outX, p.y - a.outY);
      if (d <= bestD) {
        bestD = d;
        best = { index: i, side: 'out' };
      }
    }
    if (a.inX != null && a.inY != null) {
      const d = Math.hypot(p.x - a.inX, p.y - a.inY);
      if (d <= bestD) {
        bestD = d;
        best = { index: i, side: 'in' };
      }
    }
  }
  return best;
}

/** Nearest anchor index within hit radius, or -1. */
function hitAnchor(
  anchors: PenAnchor[],
  p: { x: number; y: number },
  radius: number
): number {
  let best = -1;
  let bestD = radius;
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i];
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Diamond control-handle corners (axis-aligned bbox ??rotated square). */
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

/** Drop both in/out handles ??sharp corner. */
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
    // Dragging in with mirror ??set out as mirror of in.
    const mirrored = withMirroredHandles({
      x: anchor.x,
      y: anchor.y,
      outX: anchor.x * 2 - hx,
      outY: anchor.y * 2 - hy,
    });
    return mirrored;
  }
  if (side === 'out') {
    return {
      x: anchor.x,
      y: anchor.y,
      outX: hx,
      outY: hy,
      ...(anchor.inX != null && anchor.inY != null
        ? { inX: anchor.inX, inY: anchor.inY }
        : {}),
    };
  }
  return {
    x: anchor.x,
    y: anchor.y,
    inX: hx,
    inY: hy,
    ...(anchor.outX != null && anchor.outY != null
      ? { outX: anchor.outX, outY: anchor.outY }
      : {}),
  };
}

/**
 * Bezier pen tool: click anchors, drag for handles, re-drag / delete in|out handles,
 * click curved anchor to clear handles (corner), close near first,
 * Enter / Esc / toolbar??????finish as open path.
 */
export default function PenDrawFeature({
  enabled,
  artboard,
  paperEl,
  stageEl = null,
  strokeColor = '#333333',
  strokeWidth = 2,
  onCommit,
  onCancel,
  hitTest,
  onEditExistingPath,
  document,
}: PenDrawFeatureProps) {
  const camera = useRcbCamera();
  const toScene = useRcbScreenToScene();
  const [anchors, setAnchors] = useState<PenAnchor[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [closeHot, setCloseHot] = useState(false);
  const [closing, setClosing] = useState(false);
  const [selectedHandle, setSelectedHandle] = useState<HandleHit | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleHit | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<number | null>(null);
  const placingRef = useRef<PenAnchor | null>(null);
  const draggingRef = useRef(false);
  const closingRef = useRef(false);
  const dragKindRef = useRef<DragKind | null>(null);
  const anchorsRef = useRef<PenAnchor[]>([]);
  const selectedHandleRef = useRef<HandleHit | null>(null);
  const prevCursorRef = useRef<string>('');
  /** Last click on an existing anchor ??second click within window ??corner. */
  const lastAnchorTapRef = useRef<{ index: number; t: number } | null>(null);
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  const strokeWidthRef = useRef(strokeWidth);
  onCommitRef.current = onCommit;
  onCancelRef.current = onCancel;
  strokeWidthRef.current = strokeWidth;
  anchorsRef.current = anchors;
  selectedHandleRef.current = selectedHandle;

  const setPaperCursor = (el: HTMLElement, next: string) => {
    if (prevCursorRef.current === next) return;
    prevCursorRef.current = next;
    el.style.cursor = next;
  };

  const resetDraft = () => {
    setAnchors([]);
    setCloseHot(false);
    setCursor(null);
    setClosing(false);
    setSelectedHandle(null);
    setHoverHandle(null);
    setHoverAnchor(null);
    placingRef.current = null;
    closingRef.current = false;
    draggingRef.current = false;
    dragKindRef.current = null;
    lastAnchorTapRef.current = null;
  };

  /**
   * Commit open/closed path.
   * `leaveTool`: Esc / ??/ switch-to-select ??exit to select after commit.
   * Closing the path by clicking the first point keeps the pen tool for the next stroke.
   */
  const finish = (closed: boolean, opts?: { leaveTool?: boolean }) => {
    const list = anchorsRef.current;
    const leave = Boolean(opts?.leaveTool);
    closingRef.current = false;
    dragKindRef.current = null;
    setClosing(false);
    setSelectedHandle(null);
    if (list.length < 2) {
      resetDraft();
      if (leave) onCancelRef.current?.();
      return;
    }
    const sw = Math.max(1, Number(strokeWidthRef.current) || 2);
    const bounds = boundsOfAnchors(list, closed);
    const pad = sw / 2;
    const origin = {
      left: bounds.left - pad,
      top: bounds.top - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
    };
    const local = localizeAnchors(list, origin.left, origin.top);
    const d = penAnchorsToD(local, closed);
    resetDraft();
    onCommitRef.current(d, origin, closed);
    if (leave) onCancelRef.current?.();
  };

  // Switching away from pen (e.g. bottom Select): commit draft, then tear down.
  useEffect(() => {
    if (enabled) return;
    const list = anchorsRef.current;
    if (list.length >= 2) {
      const sw = Math.max(1, Number(strokeWidthRef.current) || 2);
      const bounds = boundsOfAnchors(list, false);
      const pad = sw / 2;
      const origin = {
        left: bounds.left - pad,
        top: bounds.top - pad,
        width: bounds.width + pad * 2,
        height: bounds.height + pad * 2,
      };
      const local = localizeAnchors(list, origin.left, origin.top);
      const d = penAnchorsToD(local, false);
      onCommitRef.current(d, origin, false);
    }
    resetDraft();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onSeed = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const x = Number(detail.x);
      const y = Number(detail.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (anchorsRef.current.length > 0) return;
      const anchor = { x, y };
      placingRef.current = null;
      draggingRef.current = false;
      setAnchors([anchor]);
      setCursor({ x, y });
      setSelectedHandle(null);
      setHoverHandle(null);
      setHoverAnchor(null);
    };
    window.addEventListener('resume:pen-seed', onSeed);
    return () => window.removeEventListener('resume:pen-seed', onSeed);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const hitEl = stageEl || paperEl;

    const radii = () => ({
      anchor: hitRadiusScene(camera.zoom, ANCHOR_HIT_PX),
      handle: hitRadiusScene(camera.zoom, HANDLE_HIT_PX),
    });

    const nearClose = (p: { x: number; y: number }) => {
      const list = anchorsRef.current;
      if (list.length < 2) return false;
      const first = list[0];
      return Math.hypot(p.x - first.x, p.y - first.y) <= CLOSE_THRESHOLD;
    };

    const anchorHasHandles = (a: PenAnchor) =>
      (a.inX != null && a.inY != null) || (a.outX != null && a.outY != null);

    const cornerizeAnchor = (index: number) => {
      setAnchors((prev) => {
        if (!prev[index]) return prev;
        const next = [...prev];
        next[index] = clearAllHandles(next[index]);
        return next;
      });
      setSelectedHandle(null);
      setHoverHandle(null);
      setHoverAnchor(index);
    };

    const exitOpen = () => {
      // Do not clear hitEl.style.cursor ? RcbCanvas owns the tool cursor via React.
      // Clearing here races the next tool (e.g. pencil) and wipes its icon cursor.
      // Esc / Enter: commit open path and leave the pen tool.
      finish(false, { leaveTool: true });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        exitOpen();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedHandleRef.current;
        if (!sel) return;
        e.preventDefault();
        e.stopPropagation();
        setAnchors((prev) => {
          if (!prev[sel.index]) return prev;
          const next = [...prev];
          next[sel.index] = clearHandle(next[sel.index], sel.side);
          return next;
        });
        setSelectedHandle(null);
        setHoverHandle(null);
      }
    };

    const onExitEvent = () => exitOpen();

    // Always listen while pen is active ??do not require hitEl (Esc / ??must work).
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resume:exit-pen', onExitEvent);

    if (!hitEl) {
      return () => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resume:exit-pen', onExitEvent);
      };
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const p = toScene(e.clientX, e.clientY);
      const list = anchorsRef.current;
      const { anchor: anchorR, handle: handleR } = radii();

      // Prefer the anchor disc over nearby handle diamonds (click center ??corner).
      const anchorIdx = hitAnchor(list, p, anchorR);
      const handleHit = anchorIdx >= 0 ? null : hitHandle(list, p, handleR);

      // Alt/Option + click handle ??delete that side (in = left, out = right).
      if (handleHit && (e.altKey || e.metaKey)) {
        setAnchors((prev) => {
          const next = [...prev];
          next[handleHit.index] = clearHandle(next[handleHit.index], handleHit.side);
          return next;
        });
        setSelectedHandle(null);
        setHoverHandle(null);
        setHoverAnchor(null);
        setPaperCursor(hitEl || paperEl, PEN_CURSOR);
        return;
      }

      if (handleHit) {
        // Enter handle-edit mode (adjust curvature); release returns to drawing.
        draggingRef.current = false;
        placingRef.current = null;
        closingRef.current = false;
        lastAnchorTapRef.current = null;
        setClosing(false);
        setCloseHot(false);
        setCursor(null);
        setSelectedHandle(handleHit);
        setHoverHandle(handleHit);
        setHoverAnchor(null);
        setPaperCursor(hitEl || paperEl, 'grabbing');
        // Shift keeps opposite handle mirrored while dragging.
        dragKindRef.current = {
          kind: 'handle',
          index: handleHit.index,
          side: handleHit.side,
          mirror: e.shiftKey,
        };
        hitEl.setPointerCapture?.(e.pointerId);
        return;
      }

      setSelectedHandle(null);
      setHoverHandle(null);
      setPaperCursor(hitEl || paperEl, PEN_CURSOR);

      if (nearClose(p)) {
        closingRef.current = true;
        draggingRef.current = false;
        placingRef.current = null;
        lastAnchorTapRef.current = null;
        dragKindRef.current = { kind: 'close' };
        setClosing(true);
        setCloseHot(true);
        setHoverAnchor(null);
        setCursor(null);
        hitEl.setPointerCapture?.(e.pointerId);
        return;
      }

      // Click / double-click existing anchor: clear handles ??sharp corner.
      if (anchorIdx >= 0) {
        const a = list[anchorIdx];
        const now = performance.now();
        const last = lastAnchorTapRef.current;
        const isDbl =
          last != null && last.index === anchorIdx && now - last.t <= ANCHOR_DBL_MS;
        lastAnchorTapRef.current = isDbl ? null : { index: anchorIdx, t: now };

        // Clear on first click if curved, or on double-click (always).
        if (anchorHasHandles(a) || isDbl) {
          cornerizeAnchor(anchorIdx);
          lastAnchorTapRef.current = null;
        } else {
          setHoverAnchor(anchorIdx);
        }
        draggingRef.current = false;
        placingRef.current = null;
        dragKindRef.current = null;
        setCloseHot(false);
        setCursor(p);
        setPaperCursor(hitEl || paperEl, 'pointer');
        return;
      }

      lastAnchorTapRef.current = null;
      setHoverAnchor(null);

      const anchor: PenAnchor = { x: p.x, y: p.y };
      placingRef.current = anchor;
      draggingRef.current = false;
      dragKindRef.current = { kind: 'place' };
      setCloseHot(false);
      setAnchors((prev) => [...prev, anchor]);
      hitEl.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const p = toScene(e.clientX, e.clientY);
      const drag = dragKindRef.current;
      const { anchor: anchorR, handle: handleR } = radii();

      if (drag?.kind === 'handle') {
        draggingRef.current = true;
        setPaperCursor(hitEl || paperEl, 'grabbing');
        setAnchors((prev) => {
          if (!prev[drag.index]) return prev;
          const next = [...prev];
          next[drag.index] = setHandle(
            next[drag.index],
            drag.side,
            p.x,
            p.y,
            drag.mirror || e.shiftKey
          );
          return next;
        });
        return;
      }

      if (closingRef.current || drag?.kind === 'close') {
        const first = anchorsRef.current[0];
        if (!first) return;
        const dist = Math.hypot(p.x - first.x, p.y - first.y);
        if (dist > 3) draggingRef.current = true;
        if (draggingRef.current) {
          const updated = withMirroredHandles({
            x: first.x,
            y: first.y,
            outX: p.x,
            outY: p.y,
          });
          setAnchors((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            next[0] = updated;
            return next;
          });
        }
        return;
      }

      const placing = placingRef.current;
      if (placing) {
        const dist = Math.hypot(p.x - placing.x, p.y - placing.y);
        if (dist > 3) draggingRef.current = true;
        if (draggingRef.current) {
          placing.outX = p.x;
          placing.outY = p.y;
          const mirrored = withMirroredHandles(placing);
          setAnchors((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            next[next.length - 1] = mirrored;
            return next;
          });
        }
        setCloseHot(false);
        setCursor(null);
        setHoverHandle(null);
        setHoverAnchor(null);
        setPaperCursor(hitEl || paperEl, PEN_CURSOR);
        return;
      }

      // Idle: prefer anchor hover, then handle diamonds.
      const aIdx = hitAnchor(anchorsRef.current, p, anchorR);
      if (aIdx >= 0) {
        setHoverAnchor(aIdx);
        setHoverHandle(null);
        setPaperCursor(hitEl || paperEl, 'pointer');
        setCloseHot(false);
        setCursor(p);
        return;
      }

      const hit = hitHandle(anchorsRef.current, p, handleR);
      setHoverAnchor(null);
      setHoverHandle(hit);
      if (hit) {
        setPaperCursor(hitEl || paperEl, 'grab');
        setCloseHot(false);
        setCursor(p);
        return;
      }

      setPaperCursor(hitEl || paperEl, PEN_CURSOR);
      setCursor(p);
      setCloseHot(nearClose(p));
    };

    const onUp = (e: PointerEvent) => {
      try {
        hitEl.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      if (dragKindRef.current?.kind === 'handle') {
        dragKindRef.current = null;
        draggingRef.current = false;
        // Back to drawing: restore rubber-band from current pointer.
        const p = toScene(e.clientX, e.clientY);
        const { anchor: anchorR, handle: handleR } = radii();
        const aIdx = hitAnchor(anchorsRef.current, p, anchorR);
        if (aIdx >= 0) {
          setHoverAnchor(aIdx);
          setHoverHandle(null);
          setPaperCursor(hitEl || paperEl, 'pointer');
          setCloseHot(false);
        } else {
          const hit = hitHandle(anchorsRef.current, p, handleR);
          setHoverAnchor(null);
          setHoverHandle(hit);
          setPaperCursor(hitEl || paperEl, hit ? 'grab' : PEN_CURSOR);
          setCloseHot(!hit && nearClose(p));
        }
        setCursor(p);
        return;
      }

      if (closingRef.current) {
        closingRef.current = false;
        draggingRef.current = false;
        dragKindRef.current = null;
        setClosing(false);
        finish(true);
        return;
      }

      if (!placingRef.current) return;
      placingRef.current = null;
      draggingRef.current = false;
      dragKindRef.current = null;
      const p = toScene(e.clientX, e.clientY);
      setCursor(p);
      setPaperCursor(hitEl || paperEl, PEN_CURSOR);
    };

    const onLeave = () => {
      if (placingRef.current || closingRef.current || dragKindRef.current) return;
      setCursor(null);
      setCloseHot(false);
      setHoverHandle(null);
      setHoverAnchor(null);
      setPaperCursor(hitEl, PEN_CURSOR);
    };

    const onDbl = (e: MouseEvent) => {
      if (!hitTest || !onEditExistingPath) return;
      if (anchorsRef.current.length > 0) return;
      const p = toScene(e.clientX, e.clientY);
      const id = hitTest(p.x, p.y, { clientX: e.clientX, clientY: e.clientY });
      if (!id) return;
      const node = document?.deltaSetLike?.[id];
      if (!isEditablePathNode(node)) return;
      e.preventDefault();
      e.stopPropagation();
      onEditExistingPath(id);
    };

    setPaperCursor(hitEl, PEN_CURSOR);
    // Capture so anchors register even when shapes SVG sits under the pointer.
    hitEl.addEventListener('pointerdown', onDown, true);
    hitEl.addEventListener('pointermove', onMove);
    hitEl.addEventListener('pointerup', onUp);
    hitEl.addEventListener('pointerleave', onLeave);
    hitEl.addEventListener('dblclick', onDbl, true);
    return () => {
      hitEl.removeEventListener('pointerdown', onDown, true);
      hitEl.removeEventListener('pointermove', onMove);
      hitEl.removeEventListener('pointerup', onUp);
      hitEl.removeEventListener('pointerleave', onLeave);
      hitEl.removeEventListener('dblclick', onDbl, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resume:exit-pen', onExitEvent);
      prevCursorRef.current = '';
      // Leave style.cursor alone ? React (RcbCanvas) sets the next tool cursor after commit;
      // assigning '' here runs in effect cleanup and erases pencil/bucket icons.
    };
  }, [enabled, paperEl, stageEl, camera.zoom, toScene, onCommit, onCancel, strokeWidth, hitTest, onEditExistingPath, document]);

  if (!enabled) return null;

  const d = penAnchorsToD(anchors, false);
  const closePreviewD = closing || closeHot ? penAnchorsToD(anchors, true) : '';
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const showClosePreview =
    (closing || closeHot) && first && last && anchors.length >= 2 && !placingRef.current;

  const sw = Math.max(1, Number(strokeWidth) || 1);
  const zoom = Math.max(0.15, camera.zoom || 1);
  const anchorR = Math.min(5.5, 4.25 / zoom);
  const handleR = Math.min(4.25, 3.1 / zoom);
  const pathSw = Math.min(sw, 2.25 / zoom);

  const handleSelected = (i: number, side: HandleSide) =>
    selectedHandle?.index === i && selectedHandle.side === side;
  const handleHovered = (i: number, side: HandleSide) =>
    hoverHandle?.index === i && hoverHandle.side === side;

  const renderHandle = (i: number, side: HandleSide, hx: number, hy: number) => {
    const active = handleSelected(i, side) || handleHovered(i, side);
    const r = handleR + (active ? 1.25 : 0);
    return (
      <>
        <line x1={anchors[i].x} y1={anchors[i].y} x2={hx} y2={hy} stroke="#8b8b8b" strokeWidth={1} />
        <polygon
          points={handleDiamondPoints(hx, hy, r)}
          fill={active ? '#3388ff' : '#fff'}
          stroke={active ? '#3388ff' : '#383838'}
          strokeWidth={active ? 1.5 : 1}
        />
      </>
    );
  };

  return (
    <RcbSceneOverlaySvg>
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={pathSw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showClosePreview && closePreviewD ? (
        <path
          d={closePreviewD}
          fill="none"
          stroke="#3388ff"
          strokeWidth={1.25}
          strokeDasharray="4 3"
          opacity={0.85}
        />
      ) : cursor && anchors.length > 0 && last && !hoverHandle && hoverAnchor == null ? (
        <line
          x1={last.x}
          y1={last.y}
          x2={cursor.x}
          y2={cursor.y}
          stroke="#8b8b8b"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.55}
        />
      ) : null}
      {anchors.map((a, i) => {
        const isStart = i === 0;
        const hot = isStart && (closeHot || closing) && anchors.length >= 2;
        const hovered = hoverAnchor === i;
        const hasOut = a.outX != null && a.outY != null;
        const hasIn = a.inX != null && a.inY != null;
        return (
          <g key={i}>
            {hasOut ? renderHandle(i, 'out', a.outX!, a.outY!) : null}
            {hasIn ? renderHandle(i, 'in', a.inX!, a.inY!) : null}
            {hot ? (
              <>
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={anchorR + 6}
                  fill="none"
                  stroke="#3388ff"
                  strokeWidth={1.5}
                  opacity={0.55}
                >
                  <animate
                    attributeName="r"
                    values={`${anchorR + 3};${anchorR + 8};${anchorR + 3}`}
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.7;0.25;0.7"
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx={a.x} cy={a.y} r={anchorR + 1.5} fill="#fff" />
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={anchorR}
                  fill="#3388ff"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              </>
            ) : (
              <>
                {hovered ? (
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r={anchorR + 4}
                    fill="none"
                    stroke="#3388ff"
                    strokeWidth={1.5}
                    opacity={0.45}
                  />
                ) : null}
                <circle cx={a.x} cy={a.y} r={anchorR + 1.25} fill="#fff" />
                <circle
                  cx={a.x}
                  cy={a.y}
                  r={hovered ? anchorR + 0.75 : anchorR}
                  fill={hovered ? '#3388ff' : isStart ? '#383838' : '#fff'}
                  stroke={hovered ? '#fff' : '#383838'}
                  strokeWidth={hovered ? 1.5 : 1}
                />
              </>
            )}
          </g>
        );
      })}
    </RcbSceneOverlaySvg>
  );
}
