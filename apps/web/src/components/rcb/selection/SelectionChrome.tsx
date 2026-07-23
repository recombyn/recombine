import Tooltip from '@/components/base/tooltip';
import { useRcbCamera } from '../camera/context';
import { toDomPrecision } from '../core/dpr';
import { cn } from '@/utils/classnames';
import { cursorForRotate } from './rotateCornerCursor';
import rotateCornerSvg from '@/assets/svg/editor/rotate_corner.svg?raw';

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
   * Edge handles: `all` (default), `horizontal` (text L/R wrap width only), or none.
   */
  edgeHandles?: 'all' | 'horizontal' | 'none';
  /**
   * Line variant: draw the blue shaft stroke. Set false for arrows (full path
   * comes from ShapeIndicatorOverlay instead).
   */
  showLineStroke?: boolean;
  /** When false, only handles are drawn (unused for normal box chrome). */
  showBoxStroke?: boolean;
};

/**
 * Screen-constant chrome: page size = screenPx / zoom under camera scale.
 * Outline + knob *visuals* share one SVG so zoom cannot desync handle vs stroke.
 * Hit targets stay as HTML (invisible) for pointer events.
 */
const HANDLE_VIS_PX = 8;
const HANDLE_HIT_PX = 18;
const LINE_ENDPOINT_VIS_PX = 8;
const LINE_ENDPOINT_HALO_PX = 22;
const LINE_ENDPOINT_HIT_PX = 28;
const LINE_SHAFT_HIT_PX = 28;
const STROKE_PX = 1.5;
const ROTATE_HIT_PX = 22;
const ROTATE_ICON_PX = 18;
const ROTATE_GAP_PX = 2;
const SEL_BASELINE = '#3388ff';

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

function cursorForResize(handle: ResizeHandle, angleDeg: number): string {
  const dirs = [
    'e-resize',
    'se-resize',
    's-resize',
    'sw-resize',
    'w-resize',
    'nw-resize',
    'n-resize',
    'ne-resize',
  ];
  const base = HANDLE_DIR_DEG[handle];
  const idx = Math.round(((((base + angleDeg) % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function rotateLocal(lx: number, ly: number, w: number, h: number, angleDeg: number) {
  if (Math.abs(angleDeg) < 0.001) return { x: lx, y: ly };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  const dx = lx - cx;
  const dy = ly - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * rotate_corner base orientation offsets:
 * nwse=0, nesw=90, senw=180, swne=270
 */
const ROTATE_CORNERS: Array<{
  corner: 'nw' | 'ne' | 'se' | 'sw';
  localX: number;
  localY: number;
  iconDeg: number;
  label: string;
}> = [
  { corner: 'nw', localX: 0, localY: 0, iconDeg: 0, label: 'Rotate' },
  { corner: 'ne', localX: 1, localY: 0, iconDeg: 90, label: 'Rotate' },
  { corner: 'se', localX: 1, localY: 1, iconDeg: 180, label: 'Rotate' },
  { corner: 'sw', localX: 0, localY: 1, iconDeg: 270, label: 'Rotate' },
];

/** Inner path `d` from rotate_corner.svg. */
const ROTATE_CORNER_PATH = (() => {
  const m = rotateCornerSvg.match(/\bd="([^"]+)"/);
  return m?.[1] || '';
})();

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
  edgeHandles = 'all',
  showLineStroke = true,
  showBoxStroke = true,
}: SelectionChromeProps) {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / z;
  // Use document box as-is (no separate DPR snap) so chrome tracks shape geometry.
  const left = toDomPrecision(box.left);
  const top = toDomPrecision(box.top);
  const w = toDomPrecision(Math.max(1, box.width));
  const h = toDomPrecision(Math.max(1, box.height));
  const lineMode = variant === 'line';

  const stroke = STROKE_PX * inv;
  const handleVis = HANDLE_VIS_PX * inv;
  const handleHit = HANDLE_HIT_PX * inv;
  const lineEpVis = LINE_ENDPOINT_VIS_PX * inv;
  const lineEpHalo = LINE_ENDPOINT_HALO_PX * inv;
  const lineEpHit = LINE_ENDPOINT_HIT_PX * inv;
  const lineShaftHit = LINE_SHAFT_HIT_PX * inv;
  const rotateHit = ROTATE_HIT_PX * inv;
  const rotateIcon = ROTATE_ICON_PX * inv;
  const rotateGap = ROTATE_GAP_PX * inv;
  const metaOffset = 16 * inv;
  const metaFont = 10 * inv;
  const halfVis = handleVis / 2;

  const allKnobs: Array<[ResizeHandle, number, number]> = [
    ['nw', 0, 0],
    ['n', w / 2, 0],
    ['ne', w, 0],
    ['e', w, h / 2],
    ['se', w, h],
    ['s', w / 2, h],
    ['sw', 0, h],
    ['w', 0, h / 2],
  ];
  const knobs = lineMode
    ? ([['w', 0, h / 2], ['e', w, h / 2]] as Array<[ResizeHandle, number, number]>)
    : cornerHandlesOnly
      ? allKnobs.filter(([dir]) => dir === 'nw' || dir === 'ne' || dir === 'se' || dir === 'sw')
      : edgeHandles === 'horizontal'
        ? allKnobs.filter(
            ([dir]) =>
              dir === 'nw' ||
              dir === 'ne' ||
              dir === 'se' ||
              dir === 'sw' ||
              dir === 'e' ||
              dir === 'w'
          )
        : allKnobs;

  const visualKnobs = lineMode
    ? []
    : knobs.filter(([dir]) => {
        // Edge mid-knobs only when edge handles are shown as full set.
        if (dir === 'n' || dir === 's' || dir === 'e' || dir === 'w') {
          return !cornerHandlesOnly && edgeHandles === 'all';
        }
        return true;
      });

  const toScene = (lx: number, ly: number) => {
    const p = rotateLocal(lx, ly, w, h, angle);
    return { x: left + p.x, y: top + p.y };
  };

  const lineStart = toScene(0, h / 2);
  const lineEnd = toScene(w, h / 2);
  const lineLen = Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y) || 1;
  const lineAngleDeg =
    (Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x) * 180) / Math.PI;

  return (
    <>
      {metaLabel ? (
        <div
          className="pointer-events-none absolute z-[25] whitespace-nowrap font-medium"
          style={{
            color: SEL_BASELINE,
            left: left + w / 2,
            top: top - metaOffset,
            fontSize: metaFont,
            transform: 'translateX(-50%)',
          }}
        >
          {metaLabel}
        </div>
      ) : null}

      {lineMode ? (
        <>
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
              height: lineShaftHit,
              transform: `translateY(-50%) rotate(${lineAngleDeg}deg)`,
              transformOrigin: '0 50%',
              cursor: interactiveBox ? 'move' : undefined,
            }}
          />
          {showLineStroke ? (
            <svg
              className="pointer-events-none absolute z-[11] overflow-visible"
              width={Math.max(1, lineLen)}
              height={Math.max(stroke * 2, 1)}
              style={{
                left: lineStart.x,
                top: lineStart.y,
                transform: `translateY(-50%) rotate(${lineAngleDeg}deg)`,
                transformOrigin: '0 50%',
              }}
              aria-hidden
            >
              <line
                x1={0}
                y1="50%"
                x2={lineLen}
                y2="50%"
                stroke={SEL_BASELINE}
                strokeWidth={stroke}
                strokeLinecap="butt"
              />
            </svg>
          ) : null}
        </>
      ) : (
        <div
          {...{ [boxDataAttr]: true }}
          className={cn(
            // Above ShapeIndicatorOverlay (z-11) so white knobs cover the blue baseline.
            'absolute z-[18] overflow-visible',
            interactiveBox ? 'pointer-events-auto' : 'pointer-events-none'
          )}
          style={{
            left,
            top,
            width: w,
            height: h,
            transform: Math.abs(angle) > 0.001 ? `rotate(${angle}deg)` : undefined,
            transformOrigin: 'center center',
            cursor: interactiveBox ? 'move' : undefined,
          }}
        >
          {/*
            Outline + corner knobs in ONE SVG. Separate HTML knobs
            round to different device pixels under camera scale → look offset.
          */}
          <svg
            className="pointer-events-none absolute overflow-visible"
            width={w}
            height={h}
            style={{ left: 0, top: 0, overflow: 'visible' }}
            aria-hidden
          >
            {showBoxStroke ? (
              <rect
                x={0}
                y={0}
                width={w}
                height={h}
                fill="none"
                stroke={SEL_BASELINE}
                strokeWidth={stroke}
              />
            ) : null}
            {showHandles
              ? visualKnobs.map(([dir, lx, ly]) => (
                  <g key={`knob-${dir}`}>
                    {/* Opaque white plate first — must fully cover outline under the knob. */}
                    <rect
                      x={lx - halfVis}
                      y={ly - halfVis}
                      width={handleVis}
                      height={handleVis}
                      fill="#ffffff"
                      fillOpacity={1}
                      stroke="none"
                    />
                    <rect
                      x={lx - halfVis}
                      y={ly - halfVis}
                      width={handleVis}
                      height={handleVis}
                      fill="none"
                      stroke={SEL_BASELINE}
                      strokeWidth={stroke}
                    />
                  </g>
                ))
              : null}
          </svg>
        </div>
      )}

      {showHandles ? (
        <>
          {!lineMode && !cornerHandlesOnly && edgeHandles === 'all'
            ? (() => {
                const edges: Array<[ResizeHandle, number, number]> = [
                  ['n', w / 2, 0],
                  ['s', w / 2, h],
                  ['e', w, h / 2],
                  ['w', 0, h / 2],
                ];
                return edges.map(([dir, lx, ly]) => {
                  const p = toScene(lx, ly);
                  return (
                    <div
                      key={`edge-${dir}`}
                      {...{ [handleDataAttr]: handleDataValue }}
                      data-resize={dir}
                      role="button"
                      aria-label={`resize-${dir}`}
                      className="pointer-events-auto absolute z-[16]"
                      style={{
                        left: p.x - handleHit / 2,
                        top: p.y - handleHit / 2,
                        width: handleHit,
                        height: handleHit,
                        cursor: cursorForResize(dir, angle),
                      }}
                    />
                  );
                });
              })()
            : null}

          {knobs.map(([dir, lx, ly]) => {
            const p = toScene(lx, ly);
            if (lineMode) {
              return (
                <div
                  key={dir}
                  {...{ [handleDataAttr]: handleDataValue }}
                  data-resize={dir}
                  role="button"
                  aria-label={`endpoint-${dir}`}
                  className="group pointer-events-auto absolute z-[18]"
                  style={{
                    left: p.x - lineEpHit / 2,
                    top: p.y - lineEpHit / 2,
                    width: lineEpHit,
                    height: lineEpHit,
                    cursor: 'grab',
                  }}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 top-1/2 rounded-full',
                      '-translate-x-1/2 -translate-y-1/2',
                      'opacity-0 scale-75',
                      'transition-[opacity,transform] duration-100 ease-out',
                      'group-hover:opacity-100 group-hover:scale-100',
                      'group-active:opacity-100 group-active:scale-100'
                    )}
                    style={{
                      width: lineEpHalo,
                      height: lineEpHalo,
                      background: `${SEL_BASELINE}59`,
                    }}
                  />
                  <svg
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
                    width={lineEpVis}
                    height={lineEpVis}
                    aria-hidden
                  >
                    <circle
                      cx={lineEpVis / 2}
                      cy={lineEpVis / 2}
                      r={Math.max(0.01, lineEpVis / 2 - stroke / 2)}
                      fill="#fff"
                      stroke={SEL_BASELINE}
                      strokeWidth={stroke}
                    />
                  </svg>
                </div>
              );
            }
            // Invisible hit target only — knob visual is in the shared SVG above.
            return (
              <div
                key={dir}
                {...{ [handleDataAttr]: handleDataValue }}
                data-resize={dir}
                role="button"
                aria-label={`resize-${dir}`}
                className="pointer-events-auto absolute z-[18]"
                style={{
                  left: p.x - handleHit / 2,
                  top: p.y - handleHit / 2,
                  width: handleHit,
                  height: handleHit,
                  cursor: cursorForResize(dir, angle),
                }}
              />
            );
          })}
        </>
      ) : null}

      {showRotate && !lineMode
        ? ROTATE_CORNERS.map(({ corner, localX, localY, iconDeg, label }) => {
            const cornerPt = toScene(localX * w, localY * h);
            const mid = toScene(w / 2, h / 2);
            const vx = cornerPt.x - mid.x;
            const vy = cornerPt.y - mid.y;
            const len = Math.hypot(vx, vy) || 1;
            const push = handleHit / 2 + rotateGap + rotateHit / 2;
            const cx = cornerPt.x + (vx / len) * push;
            const cy = cornerPt.y + (vy / len) * push;
            // Icon + selection angle. Drawn as page-space SVG so zoom
            // cannot skew orientation the way HTML <Icon> + CSS rotate can.
            const rot = ((iconDeg + angle) % 360 + 360) % 360;
            return (
              <div
                key={corner}
                className="pointer-events-auto absolute z-[19]"
                style={{
                  left: cx - rotateHit / 2,
                  top: cy - rotateHit / 2,
                  width: rotateHit,
                  height: rotateHit,
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
                    className="group/rotate relative h-full w-full"
                  >
                    <svg
                      className="pointer-events-none absolute left-1/2 top-1/2 opacity-0 transition-opacity duration-100 group-hover/rotate:opacity-100"
                      width={rotateIcon}
                      height={rotateIcon}
                      viewBox="0 0 32 32"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                        overflow: 'visible',
                      }}
                      aria-hidden
                    >
                      <path fill="#1a1a1a" d={ROTATE_CORNER_PATH} />
                    </svg>
                  </div>
                </Tooltip>
              </div>
            );
          })
        : null}
    </>
  );
}
