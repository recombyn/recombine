import { useEffect, useRef } from 'react';
import type { CanvasCamera } from '@/components/editor/Canvas/stage/InfiniteCanvasStage';
import type { ArtboardFrame } from '@/store/modules/editor';
import {
  resizeFromHandle,
  type ResizeHandle,
  type SceneBox,
} from '@/components/editor/Canvas/selection/resizeGeometry';

type Props = {
  enabled: boolean;
  frames: ArtboardFrame[];
  camera: CanvasCamera;
  stageEl: HTMLElement | null;
  /** Currently selected artboard — used when resizing via chrome handles (portal). */
  activeFrameId?: string | null;
  onSelect: (frameId: string) => void;
  /** First nudge of a gesture — caller should snapshot history. */
  onMoveStart?: () => void;
  onMove: (frameId: string, x: number, y: number) => void;
  onResize?: (frameId: string, box: SceneBox) => void;
  /** Fires when a frame drag becomes active / ends (for hiding titles). */
  onDraggingChange?: (frameId: string | null) => void;
  /**
   * World-space node boxes. Pointer over any of these must not select / move the frame
   * (content click → node selection, not frame toolbar).
   */
  contentBoxes?: SceneBox[];
  aspectLocked?: boolean;
};

function clientToWorld(
  stageEl: HTMLElement,
  camera: CanvasCamera,
  clientX: number,
  clientY: number
) {
  const r = stageEl.getBoundingClientRect();
  return {
    x: (clientX - r.left - camera.x) / camera.zoom,
    y: (clientY - r.top - camera.y) / camera.zoom,
  };
}

function hitFrame(frames: ArtboardFrame[], x: number, y: number): ArtboardFrame | null {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height) return f;
  }
  return null;
}

function hitContent(boxes: SceneBox[], x: number, y: number) {
  for (let i = boxes.length - 1; i >= 0; i -= 1) {
    const b = boxes[i];
    if (
      x >= b.left &&
      x <= b.left + b.width &&
      y >= b.top &&
      y <= b.top + b.height
    ) {
      return true;
    }
  }
  return false;
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
      started: boolean;
    }
  | {
      kind: 'resize';
      id: string;
      handle: ResizeHandle;
      union: SceneBox;
      pointerX0: number;
      pointerY0: number;
      aspectRatio: number;
      started: boolean;
    };

/**
 * Select tool: click / drag empty area inside a frame to select and move that artboard
 * (instead of panning the camera). Resize via frame selection chrome handles.
 */
export default function FrameMoveFeature({
  enabled,
  frames,
  camera,
  stageEl,
  activeFrameId = null,
  onSelect,
  onMoveStart,
  onMove,
  onResize,
  onDraggingChange,
  contentBoxes = [],
  aspectLocked = false,
}: Props) {
  const dragRef = useRef<DragState | null>(null);
  const framesRef = useRef(frames);
  const cameraRef = useRef(camera);
  const contentRef = useRef(contentBoxes);
  const aspectRef = useRef(aspectLocked);
  const activeFrameIdRef = useRef(activeFrameId);
  const onDraggingChangeRef = useRef(onDraggingChange);
  framesRef.current = frames;
  cameraRef.current = camera;
  contentRef.current = contentBoxes;
  aspectRef.current = aspectLocked;
  activeFrameIdRef.current = activeFrameId;
  onDraggingChangeRef.current = onDraggingChange;

  useEffect(() => {
    if (!enabled || !stageEl) return undefined;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;

      const resizeEl = target?.closest?.('[data-frame-handle="resize"]') as HTMLElement | null;
      if (resizeEl) {
        const dir = (resizeEl.getAttribute('data-resize') || 'se') as ResizeHandle;
        const id = activeFrameIdRef.current;
        const f = id ? framesRef.current.find((x) => x.id === id) : null;
        if (!f) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(f.id);
        const p = clientToWorld(stageEl, cameraRef.current, e.clientX, e.clientY);
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
          aspectRatio: f.width / Math.max(1, f.height),
          started: false,
        };
        return;
      }

      if (target?.closest?.(SKIP_SELECTOR)) return;
      // Frame chrome border is non-interactive; handles handled above.

      const p = clientToWorld(stageEl, cameraRef.current, e.clientX, e.clientY);
      // Content under cursor → leave to SelectionFeature (no frame toolbar).
      if (hitContent(contentRef.current, p.x, p.y)) return;

      const frame = hitFrame(framesRef.current, p.x, p.y);
      if (!frame) return;

      e.stopPropagation();
      onSelect(frame.id);
      dragRef.current = {
        kind: 'move',
        id: frame.id,
        originX: frame.x,
        originY: frame.y,
        pointerX0: p.x,
        pointerY0: p.y,
        started: false,
      };
    };

    const onMoveWin = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = clientToWorld(stageEl, cameraRef.current, e.clientX, e.clientY);
      const dx = p.x - drag.pointerX0;
      const dy = p.y - drag.pointerY0;
      const zoom = Math.max(0.05, cameraRef.current.zoom);

      if (drag.kind === 'move') {
        if (!drag.started) {
          if (Math.hypot(dx, dy) < 3 / zoom) return;
          drag.started = true;
          onMoveStart?.();
          onDraggingChangeRef.current?.(drag.id);
        }
        onMove(drag.id, Math.round(drag.originX + dx), Math.round(drag.originY + dy));
        return;
      }

      // resize
      if (!drag.started) {
        if (Math.hypot(dx, dy) < 2 / zoom) return;
        drag.started = true;
        onMoveStart?.();
        onDraggingChangeRef.current?.(drag.id);
      }
      const next = resizeFromHandle(drag.union, drag.handle, dx, dy, 0, {
        lockAspect: aspectRef.current,
        aspectRatio: drag.aspectRatio,
        min: 40,
      });
      onResize?.(drag.id, {
        left: Math.round(next.left),
        top: Math.round(next.top),
        width: Math.max(40, Math.round(next.width)),
        height: Math.max(40, Math.round(next.height)),
      });
    };

    const onUp = () => {
      if (dragRef.current?.started) onDraggingChangeRef.current?.(null);
      dragRef.current = null;
    };

    stageEl.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMoveWin);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      stageEl.removeEventListener('pointerdown', onDown, true);
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
  camera: CanvasCamera,
  frames: ArtboardFrame[],
  clientX: number,
  clientY: number
) {
  const p = clientToWorld(stageEl, camera, clientX, clientY);
  return Boolean(hitFrame(frames, p.x, p.y));
}
