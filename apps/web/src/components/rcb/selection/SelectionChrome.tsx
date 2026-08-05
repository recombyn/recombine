import { memo, type ReactNode } from 'react';
import { useRcbCamera, useRcbDevicePixelRatio } from '../camera/context';
import { toDomPrecision } from '../core/dpr';
import { snapSvgSurfaceBox } from '@/components/rcb/scene/paint/sceneToSvg';
import type { RcbCamera } from '../core/types';
import { cursorForRotate } from './rotateCornerCursor';

export type SceneBox = { left: number; top: number; width: number; height: number };
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
  /** When false, only handles / hit targets (no AABB stroke). */
  showBoxStroke?: boolean;
};

/**
 * Selection foreground overlay (AABB box + resize / rotate knobs).
 *
 * **One paint contract for all ephemeral canvas UI** (box / brush / shape handles):
 * - Mount under `[data-rcb-world]` (CSS camera translate+scale)
 * - Scene coords in SVG; CSS `left/top/width/height` === `viewBox`
 * - Screen-constant ink: `lineWidth = screenPx / zoom`
 *
 * Path ink indicators use the same world layer but twin the shape-host viewport
 * (`HostPathChrome`) so fractional DPR cannot desync from path stroke.
 */
export const CHROME_STROKE_PX = 1.5;
export const CHROME_HANDLE_VIS_PX = 8;
export const CHROME_HANDLE_HIT_PX = 18;

const HANDLE_VIS_PX = CHROME_HANDLE_VIS_PX;
const HANDLE_HIT_PX = CHROME_HANDLE_HIT_PX;
const LINE_ENDPOINT_VIS_PX = 8;
const LINE_ENDPOINT_HALO_PX = 22;
const LINE_ENDPOINT_HIT_PX = 28;
const LINE_SHAFT_HIT_PX = 28;
const STROKE_PX = CHROME_STROKE_PX;
const ROTATE_HIT_PX = 22;
const ROTATE_GAP_PX = 2;
const SEL_BASELINE = '#3388ff';

/** Scene AABB that covers a (possibly rotated) box plus chrome pad. */
export function fittedSvgViewport(
  left: number,
  top: number,
  width: number,
  height: number,
  angleDeg: number,
  pad: number
): { minX: number; minY: number; w: number; h: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ] as const) {
    const dx = lx - cx;
    const dy = ly - cy;
    const x = left + cx + dx * cos - dy * sin;
    const y = top + cy + dx * sin + dy * cos;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const p = Math.max(0, pad);
  minX = toDomPrecision(minX - p);
  minY = toDomPrecision(minY - p);
  return {
    minX,
    minY,
    w: toDomPrecision(Math.max(1, maxX - minX + p * 2)),
    h: toDomPrecision(Math.max(1, maxY - minY + p * 2)),
  };
}

/** fittedSvgViewport + same scene-lattice quantize as shape hosts / grid. */
export function fittedSnappedSvgViewport(
  left: number,
  top: number,
  width: number,
  height: number,
  angleDeg: number,
  pad: number,
  camera: RcbCamera,
  dpr: number
): { minX: number; minY: number; w: number; h: number } {
  const raw = fittedSvgViewport(left, top, width, height, angleDeg, pad);
  const s = snapSvgSurfaceBox(
    { left: raw.minX, top: raw.minY, width: raw.w, height: raw.h },
    camera,
    dpr
  );
  return { minX: s.left, minY: s.top, w: s.width, h: s.height };
}

/**
 * World-layer SVG shell — shared by selection box, brush, and shape-handle overlays.
 * Children paint in **scene** coordinates (not CSS pixels).
 * CSS box === viewBox, scene-lattice quantized (same as hosts / pixel grid).
 */
export function WorldSvgFrame({
  left,
  top,
  width,
  height,
  angle = 0,
  pad = 0,
  zClass = 'z-[18]',
  pointerEvents = 'none',
  children,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
  pad?: number;
  zClass?: string;
  pointerEvents?: 'none' | 'auto';
  children: ReactNode;
}) {
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const vp = fittedSnappedSvgViewport(left, top, width, height, angle, pad, camera, dpr);
  return (
    <svg
      data-rcb-infinite="1"
      className={`absolute overflow-visible ${zClass}`}
      width={vp.w}
      height={vp.h}
      viewBox={`${vp.minX} ${vp.minY} ${vp.w} ${vp.h}`}
      preserveAspectRatio="none"
      style={{
        left: vp.minX,
        top: vp.minY,
        width: vp.w,
        height: vp.h,
        overflow: 'visible',
        pointerEvents,
        display: 'block',
        shapeRendering: 'geometricPrecision',
      }}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/**
 * Screen-constant value pill in scene space (SVG).
 * HTML pills under camera `scale(zoom)` squash fonts / radius — keep badges as SVG.
 */
export function WorldScreenBadge({
  text,
  x,
  y,
  inv,
  anchor = 'above',
  fill = '#3388ff',
  clearance = 0,
}: {
  text: string;
  x: number;
  y: number;
  /** Scene units per screen px (= 1 / camera.zoom). */
  inv: number;
  anchor?: 'center' | 'below' | 'above' | 'right';
  fill?: string;
  clearance?: number;
}) {
  const fontSize = 11 * inv;
  const padX = 5.5 * inv;
  const padY = 2.25 * inv;
  const radius = 4 * inv;
  const gap = Math.max(6 * inv, clearance);
  const tw = Math.max(14 * inv, String(text).length * fontSize * 0.62);
  const th = fontSize * 1.2;
  const w = tw + padX * 2;
  const h = th + padY * 2;
  let cx = x;
  let cy = y;
  if (anchor === 'below') cy = y + gap + h / 2;
  else if (anchor === 'above') cy = y - gap - h / 2;
  else if (anchor === 'right') cx = x + gap + w / 2;
  return (
    <g pointerEvents="none">
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill={fill}
      />
      <text
        x={cx}
        y={cy}
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight={600}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

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

type Knob = [ResizeHandle, number, number];

function isCornerHandle(dir: ResizeHandle) {
  return dir === 'nw' || dir === 'ne' || dir === 'se' || dir === 'sw';
}

function isEdgeHandle(dir: ResizeHandle) {
  return dir === 'n' || dir === 's' || dir === 'e' || dir === 'w';
}

function buildAllKnobs(w: number, h: number): Knob[] {
  return [
    ['nw', 0, 0],
    ['n', w / 2, 0],
    ['ne', w, 0],
    ['e', w, h / 2],
    ['se', w, h],
    ['s', w / 2, h],
    ['sw', 0, h],
    ['w', 0, h / 2],
  ];
}

function selectResizeKnobs(opts: {
  lineMode: boolean;
  cornerHandlesOnly: boolean;
  edgeHandles: 'all' | 'horizontal' | 'none';
  w: number;
  h: number;
}): Knob[] {
  const { lineMode, cornerHandlesOnly, edgeHandles, w, h } = opts;
  if (lineMode) return [['w', 0, h / 2], ['e', w, h / 2]];
  const all = buildAllKnobs(w, h);
  if (cornerHandlesOnly) return all.filter(([dir]) => isCornerHandle(dir));
  if (edgeHandles === 'horizontal') {
    return all.filter(([dir]) => isCornerHandle(dir) || dir === 'e' || dir === 'w');
  }
  return all;
}

function selectVisualKnobs(
  knobs: Knob[],
  opts: { lineMode: boolean; cornerHandlesOnly: boolean; edgeHandles: 'all' | 'horizontal' | 'none' }
): Knob[] {
  if (opts.lineMode) return [];
  const showEdges = !opts.cornerHandlesOnly && opts.edgeHandles === 'all';
  return knobs.filter(([dir]) => (isEdgeHandle(dir) ? showEdges : true));
}

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

function SelectionChrome({
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
  showBoxStroke = true,
}: SelectionChromeProps) {
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const z = Math.max(0.05, camera.zoom || 1);
  const inv = 1 / z;

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
  const rotateGap = ROTATE_GAP_PX * inv;
  const metaOffset = 16 * inv;
  const metaFont = 10 * inv;
  const halfVis = handleVis / 2;
  const halfHit = handleHit / 2;

  const svgBoxTransform =
    Math.abs(angle) > 0.001
      ? `translate(${left} ${top}) rotate(${angle} ${w / 2} ${h / 2})`
      : `translate(${left} ${top})`;

  const knobs = selectResizeKnobs({
    lineMode,
    cornerHandlesOnly,
    edgeHandles,
    w,
    h,
  });
  const visualKnobs = selectVisualKnobs(knobs, {
    lineMode,
    cornerHandlesOnly,
    edgeHandles,
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

  const edgeHits: Array<[ResizeHandle, number, number]> =
    !lineMode && !cornerHandlesOnly && edgeHandles === 'all'
      ? [
          ['n', w / 2, 0],
          ['s', w / 2, h],
          ['e', w, h / 2],
          ['w', 0, h / 2],
        ]
      : [];

  // Viewport fits the **box outline only** — do NOT include handle / rotate hit
  // pads here. Those scale with 1/zoom and made the SVG CSS box resize every
  // zoom tick → path-vs-chrome drift + shake. Handles paint via overflow:visible.
  const vp = fittedSnappedSvgViewport(
    left,
    top,
    w,
    h,
    angle,
    Math.max(1, stroke),
    camera,
    dpr
  );

  return (
    <svg
      data-rcb-infinite="1"
      className="absolute z-[18] overflow-visible"
      width={vp.w}
      height={vp.h}
      viewBox={`${vp.minX} ${vp.minY} ${vp.w} ${vp.h}`}
      preserveAspectRatio="none"
      style={{
        left: vp.minX,
        top: vp.minY,
        width: vp.w,
        height: vp.h,
        overflow: 'visible',
        pointerEvents: 'none',
        display: 'block',
        shapeRendering: 'geometricPrecision',
      }}
      aria-hidden={!showHandles && !interactiveBox}
    >
      <style>{`
        g.sel-hit:hover > .sel-ep-halo { opacity: 1; }
      `}</style>
      {metaLabel ? (
        <text
          x={left + w / 2}
          y={top - metaOffset}
          fill={SEL_BASELINE}
          fontSize={metaFont}
          fontWeight={500}
          textAnchor="middle"
          dominantBaseline="auto"
          style={{ pointerEvents: 'none' }}
        >
          {metaLabel}
        </text>
      ) : null}

      {lineMode ? (
        <g transform={`translate(${lineStart.x} ${lineStart.y}) rotate(${lineAngleDeg})`}>
          {interactiveBox ? (
            <rect
              {...{ [boxDataAttr]: true }}
              x={0}
              y={-lineShaftHit / 2}
              width={lineLen}
              height={lineShaftHit}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'move' }}
            />
          ) : null}
        </g>
      ) : (
        <g transform={svgBoxTransform}>
          {interactiveBox ? (
            <rect
              {...{ [boxDataAttr]: true }}
              x={0}
              y={0}
              width={w}
              height={h}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'move' }}
            />
          ) : null}
          {showBoxStroke ? (
            <rect
              x={0}
              y={0}
              width={w}
              height={h}
              fill="none"
              stroke={SEL_BASELINE}
              strokeWidth={stroke}
              style={{ pointerEvents: 'none' }}
            />
          ) : null}
          {showHandles
            ? visualKnobs.map(([dir, lx, ly]) => (
                <g key={`knob-${dir}`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={lx - halfVis}
                    y={ly - halfVis}
                    width={handleVis}
                    height={handleVis}
                    fill="#ffffff"
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
          {showHandles
            ? edgeHits.map(([dir, lx, ly]) => (
                <rect
                  key={`edge-hit-${dir}`}
                  {...{ [handleDataAttr]: handleDataValue }}
                  data-resize={dir}
                  role="button"
                  aria-label={`resize-${dir}`}
                  x={lx - halfHit}
                  y={ly - halfHit}
                  width={handleHit}
                  height={handleHit}
                  fill="transparent"
                  style={{ pointerEvents: 'all', cursor: cursorForResize(dir, angle) }}
                />
              ))
            : null}
          {showHandles
            ? knobs.map(([dir, lx, ly]) => (
                <rect
                  key={`hit-${dir}`}
                  {...{ [handleDataAttr]: handleDataValue }}
                  data-resize={dir}
                  role="button"
                  aria-label={`resize-${dir}`}
                  x={lx - halfHit}
                  y={ly - halfHit}
                  width={handleHit}
                  height={handleHit}
                  fill="transparent"
                  style={{ pointerEvents: 'all', cursor: cursorForResize(dir, angle) }}
                />
              ))
            : null}
        </g>
      )}

      {showHandles && lineMode
        ? knobs.map(([dir, lx, ly]) => {
            const p = toScene(lx, ly);
            return (
              <g key={`ep-${dir}`} className="sel-hit" transform={`translate(${p.x} ${p.y})`}>
                <circle
                  className="sel-ep-halo"
                  r={lineEpHalo / 2}
                  fill={`${SEL_BASELINE}59`}
                  opacity={0}
                  style={{ pointerEvents: 'none' }}
                />
                <circle
                  r={Math.max(0.01, lineEpVis / 2 - stroke / 2)}
                  fill="#fff"
                  stroke={SEL_BASELINE}
                  strokeWidth={stroke}
                  style={{ pointerEvents: 'none' }}
                />
                <rect
                  {...{ [handleDataAttr]: handleDataValue }}
                  data-resize={dir}
                  role="button"
                  aria-label={`endpoint-${dir}`}
                  x={-lineEpHit / 2}
                  y={-lineEpHit / 2}
                  width={lineEpHit}
                  height={lineEpHit}
                  fill="transparent"
                  style={{ pointerEvents: 'all', cursor: 'grab' }}
                />
              </g>
            );
          })
        : null}

      {showRotate && !lineMode
        ? ROTATE_CORNERS.map(({ corner, localX, localY, iconDeg, label }) => {
            // Fixed hotzone just outside each corner — cursor only, no on-canvas icon.
            const cornerPt = toScene(localX * w, localY * h);
            const mid = toScene(w / 2, h / 2);
            const vx = cornerPt.x - mid.x;
            const vy = cornerPt.y - mid.y;
            const len = Math.hypot(vx, vy) || 1;
            const push = handleHit / 2 + rotateGap + rotateHit / 2;
            const cx = cornerPt.x + (vx / len) * push;
            const cy = cornerPt.y + (vy / len) * push;
            return (
              <g key={`rot-${corner}`} className="sel-hit" transform={`translate(${cx} ${cy})`}>
                <title>{label}</title>
                <rect
                  data-sel-handle="rotate"
                  data-rotate-corner={corner}
                  data-testid={`selection.rotate.${corner}`}
                  role="button"
                  aria-label={label}
                  x={-rotateHit / 2}
                  y={-rotateHit / 2}
                  width={rotateHit}
                  height={rotateHit}
                  fill="transparent"
                  style={{
                    pointerEvents: 'all',
                    cursor: cursorForRotate(iconDeg, angle),
                  }}
                />
              </g>
            );
          })
        : null}
    </svg>
  );
}

export default memo(SelectionChrome);
