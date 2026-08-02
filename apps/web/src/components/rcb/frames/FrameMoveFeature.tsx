import { useEffect, useRef, memo } from 'react';
import type { RcbCamera } from '../core/types';
import { rcbClientDeltaToScene, rcbResolveViewportEl, rcbScreenToScene, rcbViewportMetrics } from '../core/math';
import type { ArtboardFrame } from '@/components/rcb/frames/types';
import {
  resizeFromHandle,
  type ResizeHandle,
  type SceneBox,
} from '@/components/rcb/selection/resizeGeometry';
import { bridgeSceneHitTest } from '@/components/rcb/scene/document/sceneHitBridge';

/** `dragDistanceSquared` default. */
const DRAG_DISTANCE_SQUARED = 16;

type Props = {
  enabled: boolean;
  frames: ArtboardFrame[];
  camera: RcbCamera;
  stageEl: HTMLElement | null;
  /** Currently selected artboard — used when resizing via chrome handles (portal). */
  activeFrameId?: string | null;
  onSelect: (frameId: string) => void;
  /** Soft-click on empty stage (no frame / content) — clear node + frame focus. */
  onClearSelection?: () => void;
  /** First nudge of a gesture — caller should snapshot history. */
  onMoveStart?: () => void;
  onMove: (frameId: string, x: number, y: number, opts?: { skipGrid?: boolean }) => void;
  onResize?: (
    frameId: string,
    box: SceneBox,
    handle: ResizeHandle,
    opts?: { skipGrid?: boolean; lockAspect?: boolean }
  ) => void;
  /** Fires when a frame drag becomes active / ends (for hiding titles). */
  onDraggingChange?: (frameId: string | null) => void;
  /**
   * World-space node boxes. Pointer over any of these must not select / move the frame
   * (content click → node selection, not frame toolbar).
   */
  contentBoxes?: SceneBox[];
};

function clientToWorld(
  stageEl: HTMLElement,
  camera: RcbCamera,
  clientX: number,
  clientY: number
) {
  return rcbScreenToScene(camera, stageEl, clientX, clientY);
}

function hitFrame(frames: ArtboardFrame[], x: number, y: number): ArtboardFrame | null {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height) return f;
  }
  return null;
}

function hitContent(
  x: number,
  y: number,
  screen?: { clientX: number; clientY: number }
) {
  // Ink-aware only — never treat path AABB gaps as content.
  return Boolean(bridgeSceneHitTest(x, y, screen));
}

const SKIP_SELECTOR = [
  '[data-scene-node-id]',
  '[data-sel-box]',
  '[data-sel-handle]',
  '[data-sel-toolbar]',
  '[data-frame-toolbar]',
  '[data-frame-label]',
  '[data-image-label]',
  '[data-ctx-menu]',
  '[data-text-inline-editor]',
  '[data-crop-expand-overlay]',
  '[data-crop-expand-toolbar]',
  '[data-image-tool-panel]',
  '[data-shape-style-panel]',
].join(',');

type DragState =
  | {
      kind: 'move';
      id: string;
      originX: number;
      originY: number;
      pointerX0: number;
      pointerY0: number;
      clientX0: number;
      clientY0: number;
      scaleX: number;
      scaleY: number;
      started: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      handle: ResizeHandle;
      union: SceneBox;
      pointerX0: number;
      pointerY0: number;
      clientX0: number;
      clientY0: number;
      scaleX: number;
      scaleY: number;
      aspectRatio: number;
      /** Persisted aspect lock at pointer-down (Shift OR's with lock while dragging). */
      aspectLocked: boolean;
      started: boolean;
    }
  | {
      kind: 'deselect';
      pointerX0: number;
      pointerY0: number;
      clientX0: number;
      clientY0: number;
    };

/**
 * Select tool: resize via frame chrome handles; clear selection on empty stage.
 * Empty artboard drag is owned by SelectionFeature (marquee). Move artboard via
 * the frame title label (HtmlArtboardFrame), not by dragging empty interior.
 */
function FrameMoveFeature({
  enabled,
  frames,
  camera,
  stageEl,
  activeFrameId = null,
  onSelect,
  onClearSelection,
  onMoveStart,
  onMove,
  onResize,
  onDraggingChange,
  contentBoxes = [],
}: Props) {
  const dragRef = useRef<DragState | null>(null);
  const framesRef = useRef(frames);
  const cameraRef = useRef(camera);
  const contentRef = useRef(contentBoxes);
  const activeFrameIdRef = useRef(activeFrameId);
  const onDraggingChangeRef = useRef(onDraggingChange);
  const onClearSelectionRef = useRef(onClearSelection);
  framesRef.current = frames;
  cameraRef.current = camera;
  contentRef.current = contentBoxes;
  activeFrameIdRef.current = activeFrameId;
  onDraggingChangeRef.current = onDraggingChange;
  onClearSelectionRef.current = onClearSelection;

  useEffect(() => {
    const liveStage = rcbResolveViewportEl(stageEl);
    if (!enabled || !liveStage) return undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;

      const resizeEl = target?.closest?.('[data-frame-handle="resize"]') as HTMLElement | null;
      if (resizeEl) {
        const dir = (resizeEl.getAttribute('data-resize') || 'se') as ResizeHandle;
        const id = activeFrameIdRef.current;
        const f = id ? framesRef.current.find((x) => x.id === id) : null;
        if (!f || f.locked) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(f.id);
        const p = clientToWorld(liveStage, cameraRef.current, e.clientX, e.clientY);
        const metrics = rcbViewportMetrics(liveStage);
        dragRef.current = {
          kind: 'resize',
          id: f.id,
          handle: dir,
          union: {
            left: f.x,
            top: f.y,
            width: Math.max(1, f.width),
            height: Math.max(1, f.height),
          },
          pointerX0: p.x,
          pointerY0: p.y,
          clientX0: e.clientX,
          clientY0: e.clientY,
          scaleX: metrics.scaleX,
          scaleY: metrics.scaleY,
          aspectRatio: f.width / Math.max(1, f.height),
          aspectLocked: Boolean(f.lockAspect),
          started: false,
        };
        return;
      }

      if (target?.closest?.(SKIP_SELECTOR)) return;

      const p = clientToWorld(liveStage, cameraRef.current, e.clientX, e.clientY);
      if (hitContent(p.x, p.y, { clientX: e.clientX, clientY: e.clientY })) return;

      const frame = hitFrame(framesRef.current, p.x, p.y);
      if (!frame) {
        const ae = document.activeElement;
        if (ae instanceof HTMLElement && ae.closest('[data-text-inline-editor]')) {
          ae.blur();
        }
        dragRef.current = {
          kind: 'deselect',
          pointerX0: p.x,
          pointerY0: p.y,
          clientX0: e.clientX,
          clientY0: e.clientY,
        };
        return;
      }

      // Empty artboard interior: do NOT steal the gesture.
      // SelectionFeature owns marquee / soft-click→select-frame; move via title label
      // (HtmlArtboardFrame) or resize chrome. Stealing here made box-select impossible.
      return;
    };

    const onMoveWin = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === 'deselect') {
        const distSq =
          (e.clientX - drag.clientX0) ** 2 + (e.clientY - drag.clientY0) ** 2;
        if (distSq > DRAG_DISTANCE_SQUARED) {
          dragRef.current = null;
        }
        return;
      }
      // Client-delta — avoids drift when stage rect jitters mid-gesture.
      const { x: dx, y: dy } = rcbClientDeltaToScene(
        cameraRef.current.zoom,
        e.clientX - drag.clientX0,
        e.clientY - drag.clientY0,
        drag.scaleX,
        drag.scaleY
      );
      const zoom = Math.max(0.05, cameraRef.current.zoom);

      if (drag.kind === 'move') {
        if (!drag.started) {
          if (Math.hypot(dx, dy) < 3 / zoom) return;
          drag.started = true;
          onMoveStart?.();
          onDraggingChangeRef.current?.(drag.id);
        }
        onMove(drag.id, Math.round(drag.originX + dx), Math.round(drag.originY + dy), {
          skipGrid: e.ctrlKey || e.metaKey,
        });
        return;
      }

      // resize
      if (!drag.started) {
        if (Math.hypot(dx, dy) < 2 / zoom) return;
        drag.started = true;
        onMoveStart?.();
        onDraggingChangeRef.current?.(drag.id);
      }
      // Lock UI OR Shift — Shift reinforces ratio; never unlocks when chain is on.
      const lockAspect = drag.aspectLocked || e.shiftKey;
      const next = resizeFromHandle(drag.union, drag.handle, dx, dy, 0, {
        lockAspect,
        aspectRatio: drag.aspectRatio,
        min: 40,
      });
      onResize?.(
        drag.id,
        {
          left: Math.round(next.left),
          top: Math.round(next.top),
          width: Math.max(40, Math.round(next.width)),
          height: Math.max(40, Math.round(next.height)),
        },
        drag.handle,
        { skipGrid: e.ctrlKey || e.metaKey, lockAspect }
      );
    };

    // Soft-click deselect: move already drops the drag past threshold, so a
    // surviving deselect drag is always a click. Ignore cancel (no clear).
    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.kind === 'deselect') {
        dragRef.current = null;
        if (e.type === 'pointerup') onClearSelectionRef.current?.();
        return;
      }
      if (drag && 'started' in drag && drag.started) onDraggingChangeRef.current?.(null);
      dragRef.current = null;
    };

    liveStage.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMoveWin);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      liveStage.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMoveWin);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [enabled, stageEl, onSelect, onMoveStart, onMove, onResize]);

  return null;
}

/** True when world point under cursor is inside any frame (for blocking empty-canvas pan). */
export function clientHitsFrame(
  stageEl: HTMLElement,
  camera: RcbCamera,
  frames: ArtboardFrame[],
  clientX: number,
  clientY: number
) {
  const p = clientToWorld(stageEl, camera, clientX, clientY);
  return Boolean(hitFrame(frames, p.x, p.y));
}

export default memo(FrameMoveFeature);
