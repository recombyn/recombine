import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import AlignGuidesOverlay, { type AlignGuide } from '@/components/editor/Canvas/selection/AlignGuidesOverlay';
import {
  snapBoxToGuides,
  type SceneBox,
} from '@/components/editor/Canvas/selection/alignGuides';
import {
  calcCropCornerResize,
  calcCropEdgeResize,
  calcCropMove,
  calcExpandCornerResize,
  calcExpandEdgeResize,
  calcExpandMove,
  type CropRect,
  type ExpandFrame,
  type HandlePos,
} from './cropExpandMath';

/** System ink — avoid bright brand blues. */
const ACCENT = '#383838';
const ACCENT_SOFT = 'rgba(56, 56, 56, 0.35)';
const EXPAND_GRAY = '#e8e8e8';
/** Dim outside the crop hole (kept region stays clear). */
const CROP_MASK = 'rgba(0, 0, 0, 0.48)';

const HANDLES: { id: HandlePos; cursor: string }[] = [
  { id: 'nw', cursor: 'nw-resize' },
  { id: 'n', cursor: 'n-resize' },
  { id: 'ne', cursor: 'ne-resize' },
  { id: 'e', cursor: 'e-resize' },
  { id: 'se', cursor: 'se-resize' },
  { id: 's', cursor: 's-resize' },
  { id: 'sw', cursor: 'sw-resize' },
  { id: 'w', cursor: 'w-resize' },
];

type DragState =
  | { type: 'move'; startX: number; startY: number; crop: CropRect; expand: ExpandFrame }
  | {
      type: 'resize';
      handle: HandlePos;
      startX: number;
      startY: number;
      crop: CropRect;
      expand: ExpandFrame;
    };

type Props = {
  mode: 'crop' | 'expand';
  /** Image box in world coords. */
  imageBox: { left: number; top: number; width: number; height: number };
  cropRect: CropRect;
  expandFrame: ExpandFrame;
  label?: string;
  /** Sibling / frame boxes for smart guides while dragging. */
  guideBoxes?: SceneBox[];
  frameBoxes?: SceneBox[];
  onCropChange: (next: CropRect) => void;
  onExpandChange: (next: ExpandFrame) => void;
};

/** Fig.1 — dashed frame, L-corners, edge bars, grid; expand shows gray margins. */
export default function CropExpandOverlay({
  mode,
  imageBox,
  cropRect,
  expandFrame,
  label = 'Image',
  guideBoxes = [],
  frameBoxes = [],
  onCropChange,
  onExpandChange,
}: Props): ReactNode {
  const camera = useCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const cropRef = useRef(cropRect);
  const expandRef = useRef(expandFrame);
  cropRef.current = cropRect;
  expandRef.current = expandFrame;
  const onCropRef = useRef(onCropChange);
  const onExpandRef = useRef(onExpandChange);
  onCropRef.current = onCropChange;
  onExpandRef.current = onExpandChange;
  const guideBoxesRef = useRef(guideBoxes);
  const frameBoxesRef = useRef(frameBoxes);
  guideBoxesRef.current = guideBoxes;
  frameBoxesRef.current = frameBoxes;
  const imageBoxRef = useRef(imageBox);
  imageBoxRef.current = imageBox;

  const cw = Math.max(1, imageBox.width);
  const ch = Math.max(1, imageBox.height);

  const frameWorld =
    mode === 'expand'
      ? {
          left: imageBox.left + expandFrame.ox,
          top: imageBox.top + expandFrame.oy,
          width: expandFrame.w,
          height: expandFrame.h,
        }
      : {
          left: imageBox.left + cropRect.x,
          top: imageBox.top + cropRect.y,
          width: cropRect.w,
          height: cropRect.h,
        };

  const origin = worldToStage(camera, frameWorld.left, frameWorld.top);
  const stageW = frameWorld.width * z;
  const stageH = frameWorld.height * z;
  const imgOrigin = worldToStage(camera, imageBox.left, imageBox.top);
  const imgStageW = cw * z;
  const imgStageH = ch * z;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / z;
      const dy = (e.clientY - drag.startY) / z;
      const img = imageBoxRef.current;
      const others = guideBoxesRef.current;
      const frames = frameBoxesRef.current;

      if (mode === 'crop') {
        const orig = drag.crop;
        if (drag.type === 'move') {
          const moved = calcCropMove(orig, dx, dy, cw, ch);
          const world: SceneBox = {
            left: img.left + moved.x,
            top: img.top + moved.y,
            width: moved.w,
            height: moved.h,
          };
          const snapped = snapBoxToGuides(world, others, frames);
          const next = calcCropMove(
            orig,
            snapped.box.left - img.left - orig.x,
            snapped.box.top - img.top - orig.y,
            cw,
            ch
          );
          const finalWorld: SceneBox = {
            left: img.left + next.x,
            top: img.top + next.y,
            width: next.w,
            height: next.h,
          };
          setGuides(snapBoxToGuides(finalWorld, others, frames, 0).guides);
          onCropRef.current(next);
          return;
        }
        setGuides([]);
        const h = drag.handle;
        const isEdge = h === 'n' || h === 's' || h === 'w' || h === 'e';
        onCropRef.current(
          isEdge
            ? calcCropEdgeResize(orig, h, dx, dy, cw, ch)
            : calcCropCornerResize(orig, h as 'nw' | 'ne' | 'sw' | 'se', dx, dy, cw, ch)
        );
        return;
      }

      const orig = drag.expand;
      if (drag.type === 'move') {
        const moved = calcExpandMove(orig, dx, dy, cw, ch);
        const world: SceneBox = {
          left: img.left + moved.ox,
          top: img.top + moved.oy,
          width: moved.w,
          height: moved.h,
        };
        const snapped = snapBoxToGuides(world, others, frames);
        const next = calcExpandMove(
          orig,
          snapped.box.left - img.left - orig.ox,
          snapped.box.top - img.top - orig.oy,
          cw,
          ch
        );
        const finalWorld: SceneBox = {
          left: img.left + next.ox,
          top: img.top + next.oy,
          width: next.w,
          height: next.h,
        };
        setGuides(snapBoxToGuides(finalWorld, others, frames, 0).guides);
        onExpandRef.current(next);
        return;
      }
      setGuides([]);
      const h = drag.handle;
      const isEdge = h === 'n' || h === 's' || h === 'w' || h === 'e';
      onExpandRef.current(
        isEdge
          ? calcExpandEdgeResize(orig, h, dx, dy, cw, ch)
          : calcExpandCornerResize(orig, h as 'nw' | 'ne' | 'sw' | 'se', dx, dy, cw, ch)
      );
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      setGuides([]);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [mode, z, cw, ch]);

  const startMove = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      crop: { ...cropRef.current },
      expand: { ...expandRef.current },
    };
    setDragging(true);
  };

  const startResize = (handle: HandlePos) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type: 'resize',
      handle,
      startX: e.clientX,
      startY: e.clientY,
      crop: { ...cropRef.current },
      expand: { ...expandRef.current },
    };
    setDragging(true);
    setGuides([]);
  };

  const frameStyle: CSSProperties = {
    position: 'absolute',
    left: origin.x,
    top: origin.y,
    width: stageW,
    height: stageH,
  };

  const dimLabel = `${Math.round(frameWorld.width)} × ${Math.round(frameWorld.height)}`;

  /** L-bracket corner (fig.1). */
  const corner = (id: HandlePos): CSSProperties => {
    const arm = 14;
    const thick = 3;
    const base: CSSProperties = {
      position: 'absolute',
      width: arm,
      height: arm,
      pointerEvents: 'auto',
      boxSizing: 'border-box',
      background: 'transparent',
    };
    if (id === 'nw') {
      return {
        ...base,
        left: -1,
        top: -1,
        borderTop: `${thick}px solid ${ACCENT}`,
        borderLeft: `${thick}px solid ${ACCENT}`,
      };
    }
    if (id === 'ne') {
      return {
        ...base,
        right: -1,
        top: -1,
        borderTop: `${thick}px solid ${ACCENT}`,
        borderRight: `${thick}px solid ${ACCENT}`,
      };
    }
    if (id === 'sw') {
      return {
        ...base,
        left: -1,
        bottom: -1,
        borderBottom: `${thick}px solid ${ACCENT}`,
        borderLeft: `${thick}px solid ${ACCENT}`,
      };
    }
    return {
      ...base,
      right: -1,
      bottom: -1,
      borderBottom: `${thick}px solid ${ACCENT}`,
      borderRight: `${thick}px solid ${ACCENT}`,
    };
  };

  const edgeBar = (id: HandlePos): CSSProperties => {
    const base: CSSProperties = {
      position: 'absolute',
      background: ACCENT,
      borderRadius: 2,
      pointerEvents: 'auto',
    };
    if (id === 'n' || id === 's') {
      return {
        ...base,
        left: '50%',
        width: 22,
        height: 4,
        transform: 'translateX(-50%)',
        ...(id === 'n' ? { top: -2 } : { bottom: -2 }),
      };
    }
    return {
      ...base,
      top: '50%',
      width: 4,
      height: 22,
      transform: 'translateY(-50%)',
      ...(id === 'w' ? { left: -2 } : { right: -2 }),
    };
  };

  const holeLeft = mode === 'expand' ? -expandFrame.ox * z : 0;
  const holeTop = mode === 'expand' ? -expandFrame.oy * z : 0;

  return (
    <CameraOverlayPortal>
      <div
        data-crop-expand-overlay
        className="pointer-events-none absolute inset-0 z-[36]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {mode === 'expand' ? (
          <div className="pointer-events-none absolute overflow-hidden" style={frameStyle}>
            <div
              className="absolute left-0 right-0 top-0"
              style={{ height: Math.max(0, holeTop), background: EXPAND_GRAY }}
            />
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: Math.max(0, stageH - holeTop - imgStageH),
                background: EXPAND_GRAY,
              }}
            />
            <div
              className="absolute"
              style={{
                left: 0,
                top: holeTop,
                width: Math.max(0, holeLeft),
                height: imgStageH,
                background: EXPAND_GRAY,
              }}
            />
            <div
              className="absolute"
              style={{
                left: holeLeft + imgStageW,
                top: holeTop,
                width: Math.max(0, stageW - holeLeft - imgStageW),
                height: imgStageH,
                background: EXPAND_GRAY,
              }}
            />
          </div>
        ) : null}

        {mode === 'crop' ? (
          <div
            className="pointer-events-none absolute overflow-hidden"
            style={{
              left: imgOrigin.x,
              top: imgOrigin.y,
              width: imgStageW,
              height: imgStageH,
            }}
            aria-hidden
          >
            {/* Dim discarded regions inside the image; crop hole stays clear. */}
            <div
              className="absolute left-0 right-0 top-0"
              style={{
                height: Math.max(0, origin.y - imgOrigin.y),
                background: CROP_MASK,
              }}
            />
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: Math.max(0, imgOrigin.y + imgStageH - (origin.y + stageH)),
                background: CROP_MASK,
              }}
            />
            <div
              className="absolute"
              style={{
                left: 0,
                top: Math.max(0, origin.y - imgOrigin.y),
                width: Math.max(0, origin.x - imgOrigin.x),
                height: stageH,
                background: CROP_MASK,
              }}
            />
            <div
              className="absolute"
              style={{
                left: Math.max(0, origin.x - imgOrigin.x + stageW),
                top: Math.max(0, origin.y - imgOrigin.y),
                width: Math.max(0, imgOrigin.x + imgStageW - (origin.x + stageW)),
                height: stageH,
                background: CROP_MASK,
              }}
            />
          </div>
        ) : null}

        <div
          className="pointer-events-auto absolute cursor-move"
          style={{
            ...frameStyle,
            border: `1.5px dashed ${ACCENT}`,
            boxSizing: 'border-box',
          }}
          onPointerDown={startMove}
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div
              className="absolute left-0 right-0"
              style={{ top: '33.33%', height: 1, background: ACCENT_SOFT }}
            />
            <div
              className="absolute left-0 right-0"
              style={{ top: '66.66%', height: 1, background: ACCENT_SOFT }}
            />
            <div
              className="absolute top-0 bottom-0"
              style={{ left: '33.33%', width: 1, background: ACCENT_SOFT }}
            />
            <div
              className="absolute top-0 bottom-0"
              style={{ left: '66.66%', width: 1, background: ACCENT_SOFT }}
            />
          </div>

          <div
            className="pointer-events-none absolute left-2 top-1.5 text-[11px] font-medium"
            style={{ color: ACCENT }}
          >
            {label}
          </div>
          <div
            className="pointer-events-none absolute right-2 top-1.5 text-[11px] font-medium tabular-nums"
            style={{ color: ACCENT }}
          >
            {dimLabel}
          </div>

          {HANDLES.map(({ id, cursor }) => {
            const isCorner = id === 'nw' || id === 'ne' || id === 'sw' || id === 'se';
            return (
              <div
                key={id}
                role="slider"
                aria-label={id}
                className="absolute"
                style={{ ...(isCorner ? corner(id) : edgeBar(id)), cursor }}
                onPointerDown={startResize(id)}
              />
            );
          })}
        </div>

        {mode === 'expand' && dragging ? (
          <div
            className="pointer-events-none absolute ring-1 ring-black/20"
            style={{
              left: imgOrigin.x,
              top: imgOrigin.y,
              width: imgStageW,
              height: imgStageH,
            }}
          />
        ) : null}

        {guides.length ? <AlignGuidesOverlay guides={guides} space="stage" /> : null}
      </div>
    </CameraOverlayPortal>
  );
}
