import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronUp,
} from 'react-icons/hi2';
import { cn } from '@/utils/classnames';
import './AngleEditorScene.css';

export type AngleCubeScale = 1 | 5 | 10;
export type AngleEditorMode = 'skybox' | 'camera';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rotateMin = -90;
const rotateMax = 90;
const tiltMin = -30;
const tiltMax = 60;
/** Arrow-button increments (sliders use 1°). */
const rotateStep = 5;
const tiltStep = 5;

const snapInt = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));

/** Camera sits outside the sphere; line spans center → camera. */
const CAMERA_ORBIT_RADIUS = 112;
const CAMERA_HANDLE_LENGTH = 104;

const meridianYDeg = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165] as const;
const parallels: { w: number; y: number }[] = [
  { w: 144.75, y: 19.5 },
  { w: 144.75, y: -19.5 },
  { w: 129.75, y: 37.5 },
  { w: 129.75, y: -37.5 },
  { w: 105.75, y: 53.25 },
  { w: 105.75, y: -53.25 },
  { w: 75, y: 65.25 },
  { w: 75, y: -65.25 },
];

const cubeScaleToVisualScale: Record<AngleCubeScale, number> = {
  1: 0.88,
  5: 1,
  10: 1.12,
};

type Props = {
  mode: AngleEditorMode;
  rotate: number;
  tilt: number;
  cubeScale?: AngleCubeScale;
  imageSrc?: string;
  onRotateChange: (next: number) => void;
  onTiltChange: (next: number) => void;
  className?: string;
};

/** Skybox faces (fig.2): L / inset image / B — no camera chrome. */
function SkyboxCubeFaces({ imageSrc }: { imageSrc?: string }): ReactNode {
  return (
    <>
      <div className={cn('angle-editor-cube-face', 'angle-editor-face-front', imageSrc && 'has-image')}>
        {imageSrc ? (
          <img className="angle-editor-face-image-content" alt="" src={imageSrc} draggable={false} />
        ) : (
          <span>F</span>
        )}
      </div>
      <div className="angle-editor-cube-face angle-editor-face-back" />
      <div className="angle-editor-cube-face angle-editor-face-right" />
      <div className="angle-editor-cube-face angle-editor-face-left">L</div>
      <div className="angle-editor-cube-face angle-editor-face-top" />
      <div className="angle-editor-cube-face angle-editor-face-bottom">B</div>
    </>
  );
}

function CameraCubeFaces({ imageSrc }: { imageSrc?: string }): ReactNode {
  return (
    <>
      <div className={cn('angle-editor-cube-face', 'angle-editor-face-front', imageSrc && 'has-image')}>
        {imageSrc ? (
          <img className="angle-editor-face-image-content" alt="" src={imageSrc} draggable={false} />
        ) : (
          <span>F</span>
        )}
      </div>
      <div className="angle-editor-cube-face angle-editor-face-back">B</div>
      <div className="angle-editor-cube-face angle-editor-face-right">R</div>
      <div className="angle-editor-cube-face angle-editor-face-left">L</div>
      <div className="angle-editor-cube-face angle-editor-face-top">T</div>
      <div className="angle-editor-cube-face angle-editor-face-bottom">B</div>
    </>
  );
}

/**
 * Multi-angle preview
 * - skybox: wireframe cube only (fig.2) — no sphere / arrows / camera
 * - camera: orbit camera + sphere grid + compact arrows
 */
export default function AngleEditorScene({
  mode,
  rotate,
  tilt,
  cubeScale = 5,
  imageSrc,
  onRotateChange,
  onTiltChange,
  className,
}: Props): ReactNode {
  const cubeSize = mode === 'skybox' ? 100 : 72;
  const half = cubeSize / 2;
  const visualScale = cubeScaleToVisualScale[cubeScale];

  const screenBgStyle = useMemo<CSSProperties | undefined>(() => {
    if (!imageSrc) return undefined;
    return {
      backgroundImage: `url("${imageSrc}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }, [imageSrc]);

  const bumpRotate = (delta: number) =>
    onRotateChange(snapInt(rotate + delta, rotateMin, rotateMax));
  const bumpTilt = (delta: number) => onTiltChange(snapInt(tilt + delta, tiltMin, tiltMax));

  const sceneRef = useRef<HTMLDivElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; rotate: number; tilt: number } | null>(null);
  const onRotateRef = useRef(onRotateChange);
  const onTiltRef = useRef(onTiltChange);
  onRotateRef.current = onRotateChange;
  onTiltRef.current = onTiltChange;
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return undefined;

    const onMove = (e: PointerEvent) => {
      if (dragPointerIdRef.current == null || e.pointerId !== dragPointerIdRef.current) return;
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      onRotateRef.current(snapInt(start.rotate + dx / 1.8, rotateMin, rotateMax));
      onTiltRef.current(snapInt(start.tilt + -dy / 2.2, tiltMin, tiltMax));
    };

    const onUp = (e: PointerEvent) => {
      if (dragPointerIdRef.current == null || e.pointerId !== dragPointerIdRef.current) return;
      const start = dragStartRef.current;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        onRotateRef.current(snapInt(start.rotate + dx / 1.8, rotateMin, rotateMax));
        onTiltRef.current(snapInt(start.tilt + -dy / 2.2, tiltMin, tiltMax));
      }
      dragPointerIdRef.current = null;
      dragStartRef.current = null;
      setIsDragging(false);
      const el = sceneRef.current;
      if (el?.hasPointerCapture?.(e.pointerId)) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDragging]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.angle-editor-direction-btn')) return;
    e.preventDefault();
    e.stopPropagation();
    dragPointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: e.clientX, y: e.clientY, rotate, tilt };
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const cubeStyle: CSSProperties = {
    width: cubeSize,
    height: cubeSize,
    ...({ ['--angle-cube-half']: `${half}px` } as CSSProperties),
  };

  const dirBtns = (
    <>
      <button
        type="button"
        className="angle-editor-direction-btn angle-editor-direction-btn-up"
        aria-label="Tilt up"
        onClick={() => bumpTilt(tiltStep)}
      >
        <HiOutlineChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        className="angle-editor-direction-btn angle-editor-direction-btn-down"
        aria-label="Tilt down"
        onClick={() => bumpTilt(-tiltStep)}
      >
        <HiOutlineChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        className="angle-editor-direction-btn angle-editor-direction-btn-left"
        aria-label="Rotate left"
        onClick={() => bumpRotate(-rotateStep)}
      >
        <HiOutlineChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        className="angle-editor-direction-btn angle-editor-direction-btn-right"
        aria-label="Rotate right"
        onClick={() => bumpRotate(rotateStep)}
      >
        <HiOutlineChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </>
  );

  if (mode === 'skybox') {
    // Wireframe cube only (fig.2). Base pose ≈ isometric; user rotate/tilt orbits the cube.
    const baseYaw = -38;
    const basePitch = -22;
    return (
      <div className={cn('angle-editor-scene', className)}>
        <div
          ref={sceneRef}
          className={cn('unified-scene', 'mode-skybox', isDragging && 'is-dragging')}
          style={{ perspective: 900 }}
          onPointerDown={handlePointerDown}
        >
          <div className="angle-editor-skybox-stage">
            <div className="angle-editor-scene-container" style={{ perspective: 900 }}>
              <div
                className="angle-editor-cube-wrapper"
                style={{
                  transition: isDragging ? 'none' : undefined,
                  transform: `scale(${visualScale}) rotateX(${basePitch + tilt * 0.35}deg) rotateY(${baseYaw + rotate}deg)`,
                }}
              >
                <div className="angle-editor-cube" style={cubeStyle}>
                  <SkyboxCubeFaces imageSrc={imageSrc} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cameraPositionTransform = `translateZ(${CAMERA_ORBIT_RADIUS}px) scale(1) rotateZ(0deg)`;

  return (
    <div className={cn('angle-editor-scene', className)}>
      <div
        ref={sceneRef}
        className={cn('unified-scene', 'mode-camera', isDragging && 'is-dragging')}
        style={{ perspective: 1200 }}
        onPointerDown={handlePointerDown}
      >
        <div className="unified-scene-cube-container" style={{ zIndex: 0, opacity: 1 }}>
          <div className="angle-editor-scene-container" style={{ perspective: 1200 }}>
            <div
              className="angle-editor-cube-wrapper"
              style={{
                transition: isDragging ? 'none' : undefined,
                transform: `scale(${visualScale}) rotateX(${tilt}deg) rotateY(${rotate}deg)`,
              }}
            >
              <div className="angle-editor-cube" style={cubeStyle}>
                <CameraCubeFaces imageSrc={imageSrc} />
              </div>
            </div>
          </div>
        </div>

        <div className="angle-editor-sphere-grid" role="presentation" aria-hidden>
          <div
            className="angle-editor-sphere-grid-inner"
            style={{ transform: `rotateY(${rotate}deg) rotateX(${tilt}deg)` }}
          >
            {meridianYDeg.map((deg) => (
              <div
                key={`m-y-${deg}`}
                className="angle-editor-sphere-grid-meridian"
                style={{ transform: `rotateY(${deg}deg)` }}
              />
            ))}
            <div className="angle-editor-sphere-grid-meridian" style={{ transform: 'rotateX(90deg)' }} />
            {parallels.map((p, i) => (
              <div
                key={`p-${i}`}
                className="angle-editor-sphere-grid-parallel"
                style={{
                  width: p.w,
                  height: p.w,
                  transform: `translate(-50%, -50%) translateY(${p.y}px) rotateX(90deg)`,
                }}
              />
            ))}
          </div>
          <div className="angle-editor-sphere-grid-helper-vertical" />
        </div>

        <div className="angle-editor-scene-camera">
          <div
            className="angle-editor-camera-3d-pivot"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(${tilt}deg) rotateY(${rotate}deg)`,
            }}
          >
            <div
              className="angle-editor-camera-3d-position"
              style={{ transformStyle: 'preserve-3d', transform: cameraPositionTransform }}
            >
              <div
                className="angle-editor-camera-3d-body angle-editor-camera-3d-front"
                style={{ transform: 'translate(-50%, -50%) translateZ(-8px)' }}
              >
                <div className="angle-editor-camera-3d-lens-outer">
                  <div className="angle-editor-camera-3d-lens-inner" />
                </div>
              </div>
              <div
                className="angle-editor-camera-3d-body angle-editor-camera-3d-back"
                style={{ transform: 'translate(-50%, -50%) translateZ(8px)' }}
              >
                <div className="angle-editor-camera-3d-screen" style={screenBgStyle} />
              </div>
              <div
                className="angle-editor-camera-3d-body angle-editor-camera-3d-top"
                style={{ transform: 'translate(-50%, -50%) rotateX(90deg) translateZ(8.2px)' }}
              >
                <div className="angle-editor-camera-3d-shutter" />
              </div>
              <div
                className="angle-editor-camera-3d-body angle-editor-camera-3d-bottom"
                style={{ transform: 'translate(-50%, -50%) rotateX(-90deg) translateZ(8.2px)' }}
              />
              <div
                className="angle-editor-camera-3d-body angle-editor-camera-3d-side"
                style={{ transform: 'translate(-50%, -50%) rotateY(-90deg) translateZ(11px)' }}
              />
              <div
                className="angle-editor-camera-3d-body angle-editor-camera-3d-side"
                style={{ transform: 'translate(-50%, -50%) rotateY(90deg) translateZ(11px)' }}
              />
              <div
                className="angle-editor-camera-3d-hotshoe"
                style={{
                  left: '50%',
                  top: '50%',
                  transformStyle: 'preserve-3d',
                  transform: 'translate(-50%, -50%) translateY(-12px)',
                }}
              >
                <div
                  className="angle-editor-camera-3d-hotshoe-body"
                  style={{ transform: 'translateZ(2px)' }}
                >
                  <div className="angle-editor-camera-3d-hotshoe-mount" />
                </div>
              </div>
              <div
                className="angle-editor-camera-3d-line"
                style={{
                  height: CAMERA_HANDLE_LENGTH,
                  transform: 'translate(-50%, 0px) translateZ(-8px) rotateX(-90deg)',
                }}
              />
            </div>
          </div>
          {dirBtns}
        </div>
      </div>
    </div>
  );
}
