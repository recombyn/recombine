import { Icon } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import {
  CameraOverlayPortal,
  useCamera,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import { cn } from '@/utils/classnames';
import { cursorForRotate } from './rotateCornerCursor';

type SceneBox = { left: number; top: number; width: number; height: number };
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type SelectionChromeProps = {
  box: SceneBox;
  angle?: number;
  showHandles?: boolean;
  /** Multi-select (Fig.1): only four corner knobs. */
  cornerHandlesOnly?: boolean;
  /**
   * `line`: shaft + two free endpoints (length + angle). No box / corners / rotate knob.
   * Used for straight line & arrow.
   */
  variant?: 'box' | 'line';
  showRotate?: boolean;
  metaLabel?: string;
  /**
   * When false, the blue border box does not capture pointers (handles still do).
   * Used for artboard frames so content inside remains clickable.
   */
  interactiveBox?: boolean;
  /** Override move-box data attribute (default data-sel-box). */
  boxDataAttr?: string;
  /** Override handle data attribute name (default data-sel-handle). */
  handleDataAttr?: string;
  /** Value for handleDataAttr (default "resize"). */
  handleDataValue?: string;
  /**
   * Corner radii in world/scene units (same space as `box`).
   * Converted to screen px via camera zoom so the chrome follows rounded shapes.
   */
  cornerRadii?: { tl: number; tr: number; br: number; bl: number } | null;
};

/** Fixed on-screen sizes — chrome lives in the unscaled camera overlay. */
const HANDLE_VIS_PX = 8;
const HANDLE_HIT_PX = 18;
/** Thicker shaft hit for line/arrow selection chrome (screen px). */
const LINE_SHAFT_HIT_PX = 28;
const BORDER_PX = 1.5;
const ROTATE_HIT_PX = 22;
const ROTATE_ICON_PX = 18;
/** Gap between corner resize knob and rotate hit zone (screen px). */
const ROTATE_GAP_PX = 2;

/** Local-box direction angle (deg) for each resize handle. */
const HANDLE_DIR_DEG: Record<ResizeHandle, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: 225,
  n: 270,
  ne: 315,
};

/**
 * System resize cursor for a handle, accounting for selection rotation.
 * (CSS cursors are viewport-aligned and do not follow element transforms.)
 */
function cursorForResize(handle: ResizeHandle, angleDeg: number): string {
  let a = (HANDLE_DIR_DEG[handle] + angleDeg) % 360;
  if (a < 0) a += 360;
  const snapped = Math.round(a / 45) % 8;
  // 0° ew, 45° nwse, 90° ns, 135° nesw, …
  const cursors = [
    'ew-resize',
    'nwse-resize',
    'ns-resize',
    'nesw-resize',
    'ew-resize',
    'nwse-resize',
    'ns-resize',
    'nesw-resize',
  ];
  return cursors[snapped];
}

/** Rotate a point in the selection's local (0..w, 0..h) space around center. */
function rotateLocal(
  x: number,
  y: number,
  w: number,
  h: number,
  angleDeg: number
): { x: number; y: number } {
  if (!angleDeg) return { x, y };
  const cx = w / 2;
  const cy = h / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = x - cx;
  const ly = y - cy;
  return { x: cx + cos * lx - sin * ly, y: cy + sin * lx + cos * ly };
}

/** : nwse-rotate=0°, nesw-rotate=90°, senw-rotate=180°, swne-rotate=270°. */
const ROTATE_CORNERS: Array<{
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  localX: number;
  localY: number;
  iconDeg: number;
  label: string;
}> = [
  { corner: 'top-left', localX: 0, localY: 0, iconDeg: 0, label: '旋转左上' },
  { corner: 'top-right', localX: 1, localY: 0, iconDeg: 90, label: '旋转右上' },
  { corner: 'bottom-right', localX: 1, localY: 1, iconDeg: 180, label: '旋转右下' },
  { corner: 'bottom-left', localX: 0, localY: 1, iconDeg: 270, label: '旋转左下' },
];

/**
 * Selection control box in screen space (CameraOverlayPortal).
 * Handles are NOT nested under CSS rotate — cursors stay visible and direction-correct.
 */
export default function SelectionChrome({
  box,
  angle = 0,
  showHandles = true,
  cornerHandlesOnly = false,
  variant = 'box',
  showRotate = true,
  metaLabel,
  interactiveBox = true,
  boxDataAttr = 'data-sel-box',
  handleDataAttr = 'data-sel-handle',
  handleDataValue = 'resize',
  cornerRadii = null,
}: SelectionChromeProps) {
  const camera = useCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const { x: left, y: top } = worldToStage(camera, box.left, box.top);
  const sw = w * z;
  const sh = h * z;
  const lineMode = variant === 'line';
  const maxR = Math.min(w, h) / 2;
  const chromeRadius = cornerRadii
    ? [
        Math.min(maxR, Math.max(0, cornerRadii.tl)) * z,
        Math.min(maxR, Math.max(0, cornerRadii.tr)) * z,
        Math.min(maxR, Math.max(0, cornerRadii.br)) * z,
        Math.min(maxR, Math.max(0, cornerRadii.bl)) * z,
      ]
        .map((n) => `${n}px`)
        .join(' ')
    : undefined;

  const allKnobs: Array<[ResizeHandle, number, number]> = [
    ['nw', 0, 0],
    ['n', sw / 2, 0],
    ['ne', sw, 0],
    ['e', sw, sh / 2],
    ['se', sw, sh],
    ['s', sw / 2, sh],
    ['sw', 0, sh],
    ['w', 0, sh / 2],
  ];
  const knobs = lineMode
    ? ([['w', 0, sh / 2], ['e', sw, sh / 2]] as Array<[ResizeHandle, number, number]>)
    : cornerHandlesOnly
      ? allKnobs.filter(([dir]) => dir === 'nw' || dir === 'ne' || dir === 'se' || dir === 'sw')
      : allKnobs;

  const toStage = (lx: number, ly: number) => {
    const p = rotateLocal(lx, ly, sw, sh, angle);
    return { x: left + p.x, y: top + p.y };
  };

  const lineStart = toStage(0, sh / 2);
  const lineEnd = toStage(sw, sh / 2);
  const lineLen = Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y) || 1;
  const lineAngleDeg =
    (Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x) * 180) / Math.PI;

  return (
    <CameraOverlayPortal>
      {metaLabel ? (
        <div
          className="pointer-events-none absolute z-[25] whitespace-nowrap text-[10px] font-medium text-[#3388ff]"
          style={{
            left: left + sw / 2,
            top: top - 16,
            transform: 'translateX(-50%)',
          }}
        >
          {metaLabel}
        </div>
      ) : null}

      {lineMode ? (
        <>
          {/* Move hit along the shaft */}
          <div
            {...{ [boxDataAttr]: true }}
            className={cn(
              'absolute z-10',
              interactiveBox ? 'pointer-events-auto' : 'pointer-events-none'
            )}
            style={{
              left: lineStart.x,
              top: lineStart.y,
              width: lineLen,
              height: LINE_SHAFT_HIT_PX,
              transform: `translateY(-50%) rotate(${lineAngleDeg}deg)`,
              transformOrigin: '0 50%',
              cursor: interactiveBox ? 'move' : undefined,
            }}
          />
          {/* Visible selection line */}
          <div
            className="pointer-events-none absolute z-[11]"
            style={{
              left: lineStart.x,
              top: lineStart.y,
              width: lineLen,
              height: BORDER_PX,
              background: '#3388ff',
              boxShadow: `0 0 0 1px rgba(255,255,255,0.9)`,
              transform: `translateY(-50%) rotate(${lineAngleDeg}deg)`,
              transformOrigin: '0 50%',
            }}
          />
        </>
      ) : (
        <div
          {...{ [boxDataAttr]: true }}
          className={cn(
            'absolute z-10 overflow-visible',
            interactiveBox ? 'pointer-events-auto' : 'pointer-events-none'
          )}
          style={{
            left,
            top,
            width: sw,
            height: sh,
            transform: angle ? `rotate(${angle}deg)` : undefined,
            transformOrigin: 'center center',
            cursor: interactiveBox ? 'move' : undefined,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 border-[#3388ff]"
            style={{
              borderWidth: BORDER_PX,
              borderStyle: 'solid',
              borderRadius: chromeRadius,
              boxShadow: `0 0 0 ${BORDER_PX}px rgba(255,255,255,0.9)`,
            }}
          />
        </div>
      )}

      {showHandles ? (
        <>
          {!lineMode && !cornerHandlesOnly
            ? (
                [
                  ['n', sw / 2, 0],
                  ['s', sw / 2, sh],
                  ['e', sw, sh / 2],
                  ['w', 0, sh / 2],
                ] as Array<[ResizeHandle, number, number]>
              ).map(([dir, lx, ly]) => {
                const p = toStage(lx, ly);
                return (
                  <div
                    key={`edge-${dir}`}
                    {...{ [handleDataAttr]: handleDataValue }}
                    data-resize={dir}
                    role="button"
                    aria-label={`resize-${dir}`}
                    className="pointer-events-auto absolute z-[16]"
                    style={{
                      left: p.x - HANDLE_HIT_PX / 2,
                      top: p.y - HANDLE_HIT_PX / 2,
                      width: HANDLE_HIT_PX,
                      height: HANDLE_HIT_PX,
                      cursor: lineMode ? 'crosshair' : cursorForResize(dir, angle),
                    }}
                  />
                );
              })
            : null}

          {knobs.map(([dir, lx, ly]) => {
            const p = toStage(lx, ly);
            return (
              <div
                key={dir}
                {...{ [handleDataAttr]: handleDataValue }}
                data-resize={dir}
                role="button"
                aria-label={lineMode ? `endpoint-${dir}` : `resize-${dir}`}
                className="pointer-events-auto absolute z-[18]"
                style={{
                  left: p.x - HANDLE_HIT_PX / 2,
                  top: p.y - HANDLE_HIT_PX / 2,
                  width: HANDLE_HIT_PX,
                  height: HANDLE_HIT_PX,
                  cursor: lineMode ? 'crosshair' : cursorForResize(dir, angle),
                }}
              >
                <span
                  className="pointer-events-none absolute rounded-full bg-white"
                  style={{
                    left: (HANDLE_HIT_PX - HANDLE_VIS_PX) / 2,
                    top: (HANDLE_HIT_PX - HANDLE_VIS_PX) / 2,
                    width: HANDLE_VIS_PX,
                    height: HANDLE_VIS_PX,
                    border: `${BORDER_PX}px solid #3388ff`,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            );
          })}
        </>
      ) : null}

      {showRotate && !lineMode
        ? ROTATE_CORNERS.map(({ corner, localX, localY, iconDeg, label }) => {
            // Place rotate hit fully outside the corner knob along the corner's outward diagonal.
            const cornerPt = toStage(localX * sw, localY * sh);
            const mid = toStage(sw / 2, sh / 2);
            const vx = cornerPt.x - mid.x;
            const vy = cornerPt.y - mid.y;
            const len = Math.hypot(vx, vy) || 1;
            const push = HANDLE_HIT_PX / 2 + ROTATE_GAP_PX + ROTATE_HIT_PX / 2;
            const cx = cornerPt.x + (vx / len) * push;
            const cy = cornerPt.y + (vy / len) * push;
            const rot = ((iconDeg + angle) % 360 + 360) % 360;
            return (
              <div
                key={corner}
                className="pointer-events-auto absolute z-[14]"
                style={{
                  left: cx - ROTATE_HIT_PX / 2,
                  top: cy - ROTATE_HIT_PX / 2,
                  width: ROTATE_HIT_PX,
                  height: ROTATE_HIT_PX,
                  cursor: cursorForRotate(iconDeg, angle),
                }}
              >
                <Tooltip title={label} placement="top" triggerClassName="h-full w-full">
                  <div
                    data-sel-handle="rotate"
                    data-rotate-corner={corner}
                    data-testid={`selection.rotate.${corner}`}
                    role="button"
                    aria-label={label}
                    className="group/rotate h-full w-full"
                  >
                    <Icon
                      name="editor-rotate_corner"
                      width={ROTATE_ICON_PX}
                      height={ROTATE_ICON_PX}
                      className="pointer-events-none absolute left-1/2 top-1/2 opacity-0 transition-opacity duration-100 group-hover/rotate:opacity-100"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                      }}
                    />
                  </div>
                </Tooltip>
              </div>
            );
          })
        : null}
    </CameraOverlayPortal>
  );
}
