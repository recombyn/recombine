import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useDispatch } from 'react-redux';
import { rcbResolveViewportEl, type RcbCamera } from '@/components/rcb';
import type { ContextMenuState } from '@/components/rcb/selection/chrome/CanvasContextMenu';
import {
  setActiveFrameId,
  setSelectedNodeId,
  setSelectedNodeIds,
} from '@/store/modules/editor';
import { pointerToWorld, type ArtboardRect } from '../pointerToWorld';

type UseCanvasContextMenuArgs = {
  readOnly: boolean;
  camera: RcbCamera;
  artboard?: ArtboardRect;
  viewportEl: HTMLElement | null;
  stageEl: HTMLElement | null;
  paperEl: HTMLElement | null;
  documentRef: RefObject<any>;
  selectedIdsRef: RefObject<string[]>;
  selectedFrameIdsRef: RefObject<string[]>;
  activeFrameIdRef: RefObject<string | null>;
  hitTest: (
    x: number,
    y: number,
    opts?: { clientX?: number; clientY?: number }
  ) => string | null;
  setCtxMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

/** Right-click / contextmenu → canvas context menu state. */
export function useCanvasContextMenu(args: UseCanvasContextMenuArgs) {
  const {
    readOnly,
    camera,
    artboard,
    viewportEl,
    stageEl,
    paperEl,
    documentRef,
    selectedIdsRef,
    selectedFrameIdsRef,
    activeFrameIdRef,
    hitTest,
    setCtxMenu,
  } = args;
  const dispatch = useDispatch();

  useEffect(() => {
    const hitEl = rcbResolveViewportEl(viewportEl, stageEl, paperEl);
    if (readOnly || !hitEl) return undefined;

    const skipSel =
      '[data-sel-toolbar],[data-frame-toolbar],[data-ctx-menu],[data-export-panel],[data-image-label],[data-frame-label],[data-crop-expand-overlay],[data-crop-expand-toolbar],[data-image-tool-panel],[data-text-inline-editor],[data-video-trim-toolbar],[data-video-playback-bar]';
    const sceneComposerSel =
      '[data-image-generator],[data-video-generator],[data-image-quick-edit]';

    let openedAt = 0;
    let lastClientX = Number.NaN;
    let lastClientY = Number.NaN;

    const isBogusClient = (clientX: number, clientY: number) =>
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY) ||
      (clientX <= 2 && clientY <= 2);

    const clientInStage = (clientX: number, clientY: number) => {
      const r = hitEl.getBoundingClientRect();
      return (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      );
    };

    const isChromeTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el?.closest) return false;
      if (el.closest(sceneComposerSel)) return false;
      return Boolean(el.closest(skipSel));
    };

    const noteClient = (clientX: number, clientY: number) => {
      if (isBogusClient(clientX, clientY) || !clientInStage(clientX, clientY)) return;
      lastClientX = clientX;
      lastClientY = clientY;
    };

    const openMenuAt = (clientX: number, clientY: number) => {
      const p = pointerToWorld(
        camera,
        { viewportEl, stageEl, paperEl, artboard },
        clientX,
        clientY
      );
      const id = hitTest(p.x, p.y, { clientX, clientY });
      const selected = selectedIdsRef.current;
      if (id && !selected.includes(id)) {
        dispatch(setSelectedNodeIds([id]));
        dispatch(setSelectedNodeId(id));
      }
      let frameId: string | null = activeFrameIdRef.current;
      if (!id) {
        const frames = Array.isArray(documentRef.current?.frames)
          ? documentRef.current.frames
          : [];
        for (let i = frames.length - 1; i >= 0; i -= 1) {
          const f = frames[i];
          if (!f || f.hidden) continue;
          const fx = Number(f.x) || 0;
          const fy = Number(f.y) || 0;
          const fw = Math.max(1, Number(f.width) || 1);
          const fh = Math.max(1, Number(f.height) || 1);
          if (p.x >= fx && p.x <= fx + fw && p.y >= fy && p.y <= fy + fh) {
            frameId = String(f.id);
            if (!selected.length && !selectedFrameIdsRef.current.includes(frameId)) {
              dispatch(setActiveFrameId(frameId));
              dispatch(setSelectedNodeIds([]));
              dispatch(setSelectedNodeId(null));
            }
            break;
          }
        }
      }
      setCtxMenu({
        clientX,
        clientY,
        sceneX: p.x,
        sceneY: p.y,
        nodeId: id || (selected.length === 1 ? selected[0] : null),
        frameId,
      });
    };

    const openFromRightButton = (
      clientX: number,
      clientY: number,
      target: EventTarget | null,
      opts?: { allowOutsideStage?: boolean }
    ) => {
      if (performance.now() - openedAt < 400) return false;
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
      if (!opts?.allowOutsideStage && !clientInStage(clientX, clientY)) return false;
      if (isChromeTarget(target)) return false;
      openedAt = performance.now();
      openMenuAt(clientX, clientY);
      return true;
    };

    const onPointerMove = (e: PointerEvent) => {
      noteClient(e.clientX, e.clientY);
    };

    const onPointerDown = (e: PointerEvent) => {
      noteClient(e.clientX, e.clientY);
      if (e.button !== 2) return;
      if (!clientInStage(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      openFromRightButton(e.clientX, e.clientY, e.target);
    };

    const onMouseDown = (e: MouseEvent) => {
      noteClient(e.clientX, e.clientY);
      if (e.button !== 2) return;
      if (!clientInStage(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      openFromRightButton(e.clientX, e.clientY, e.target);
    };

    const onContextMenu = (e: MouseEvent) => {
      const stageOk = clientInStage(e.clientX, e.clientY);
      const hasLast = !isBogusClient(lastClientX, lastClientY);
      const bogus = isBogusClient(e.clientX, e.clientY);
      if (!stageOk && !(bogus && hasLast)) return;

      e.preventDefault();
      e.stopPropagation();

      if (isChromeTarget(e.target)) return;

      let clientX = bogus ? lastClientX : e.clientX;
      let clientY = bogus ? lastClientY : e.clientY;
      if (isBogusClient(clientX, clientY)) {
        const r = hitEl.getBoundingClientRect();
        clientX = r.left + r.width / 2;
        clientY = r.top + r.height / 2;
      }
      openFromRightButton(clientX, clientY, e.target, {
        allowOutsideStage: bogus && hasLast,
      });
    };

    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('contextmenu', onContextMenu, { capture: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [
    activeFrameIdRef,
    artboard,
    camera,
    dispatch,
    documentRef,
    hitTest,
    paperEl,
    readOnly,
    selectedFrameIdsRef,
    selectedIdsRef,
    setCtxMenu,
    stageEl,
    viewportEl,
  ]);
}
