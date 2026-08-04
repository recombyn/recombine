import { memo } from 'react';
import { useRcbCamera, useRcbDevicePixelRatio } from '../camera/context';
import { rcbSceneToScreen } from '../core/math';
import { toDomPrecision } from '../core/dpr';
import type { AlignGuide } from './alignGuides';
import { SPACING_MEASURE_COLOR } from './SpacingInspectOverlay';

export type { AlignGuide, SceneBox } from './alignGuides';
export {
  snapBoxToGuides,
  snapResizeToGuides,
  frameGuideBoxes,
  nodeGuideBoxes,
  chromeBandGuideBoxes,
  guideEdges,
  getSnapThreshold,
} from './alignGuides';

type AlignGuidesOverlayProps = {
  guides: AlignGuide[];
  /**
   * `world` — parent is camera-scaled scene (CSS box + viewBox like shape hosts).
   * `stage` — parent is unscaled RcbOverlayPortal.
   */
  space?: 'world' | 'stage';
  className?: string;
};

/** Screen px — sized as px/zoom in page space. */
const STROKE_PX = 1.5;
/** × at edge corners / centers — small, centered on the hairline (MasterGo). */
const CROSS_PX = 5;

function worldGuidesViewport(
  guides: AlignGuide[],
  cross: number,
  stroke: number
): { minX: number; minY: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const pad = cross / 2 + stroke + 2;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const g of guides) {
    const a = Math.min(g.from, g.to);
    const b = Math.max(g.from, g.to);
    if (g.orient === 'v') {
      grow(g.pos, a);
      grow(g.pos, b);
      for (const y of g.marks?.length ? g.marks : [a, b]) grow(g.pos, y);
    } else {
      grow(a, g.pos);
      grow(b, g.pos);
      for (const x of g.marks?.length ? g.marks : [a, b]) grow(x, g.pos);
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return {
    minX: toDomPrecision(minX),
    minY: toDomPrecision(minY),
    w: toDomPrecision(Math.max(1, maxX - minX)),
    h: toDomPrecision(Math.max(1, maxY - minY)),
  };
}

/**
 * Edge/center align guides (orange, MasterGo-style):
 * one continuous segment + × at marks (corners for edges, mids for centers).
 * Gap / size distance labels are drawn once by SpacingInspectOverlay.
 */
function AlignGuidesOverlay({
  guides,
  space = 'world',
  className,
}: AlignGuidesOverlayProps) {
  const camera = useRcbCamera();
  const dpr = useRcbDevicePixelRatio();
  const alignGuides = guides.filter((g) => g.kind !== 'gap' && g.kind !== 'size');
  if (!alignGuides.length) return null;

  const inStage = space === 'stage';
  const zoom = toDomPrecision(Math.max(0.05, camera.zoom || 1));
  // World sits under camera scale(z) → scene = px / zoom (same as path chrome).
  // Stage portal is unscaled → raw screen px.
  const stroke = inStage ? STROKE_PX : STROKE_PX / zoom;
  const cross = inStage ? CROSS_PX : CROSS_PX / zoom;
  const color = SPACING_MEASURE_COLOR;
  const halfCross = cross / 2;

  if (!inStage) {
    const vp = worldGuidesViewport(alignGuides, cross, stroke);
    if (!vp) return null;
    return (
      <svg
        className={
          className ||
          'pointer-events-none absolute z-[40] overflow-visible'
        }
        width={vp.w}
        height={vp.h}
        viewBox={`${vp.minX} ${vp.minY} ${vp.w} ${vp.h}`}
        style={{
          left: vp.minX,
          top: vp.minY,
          width: vp.w,
          height: vp.h,
          overflow: 'visible',
        }}
        aria-hidden
      >
        {alignGuides.map((g, i) => {
          const a = Math.min(g.from, g.to);
          const b = Math.max(g.from, g.to);
          const markVals = (g.marks?.length ? g.marks : [a, b]).map(
            (n) => Math.round(n * 100) / 100
          );
          const crosses = Array.from(new Set(markVals));
          const len = Math.max(0, b - a);
          const drawSegment = len >= stroke;

          if (g.orient === 'v') {
            return (
              <g key={`v-${g.pos}-${i}`}>
                {drawSegment ? (
                  <line
                    x1={g.pos}
                    y1={a}
                    x2={g.pos}
                    y2={b}
                    stroke={color}
                    strokeWidth={stroke}
                  />
                ) : null}
                {crosses.map((y) => (
                  <path
                    key={`vx-${y}`}
                    d={`M${g.pos - halfCross} ${y - halfCross} L${g.pos + halfCross} ${y + halfCross} M${g.pos + halfCross} ${y - halfCross} L${g.pos - halfCross} ${y + halfCross}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="butt"
                  />
                ))}
              </g>
            );
          }

          return (
            <g key={`h-${g.pos}-${i}`}>
              {drawSegment ? (
                <line
                  x1={a}
                  y1={g.pos}
                  x2={b}
                  y2={g.pos}
                  stroke={color}
                  strokeWidth={stroke}
                />
              ) : null}
              {crosses.map((x) => (
                <path
                  key={`hx-${x}`}
                  d={`M${x - halfCross} ${g.pos - halfCross} L${x + halfCross} ${g.pos + halfCross} M${x + halfCross} ${g.pos - halfCross} L${x - halfCross} ${g.pos + halfCross}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                />
              ))}
            </g>
          );
        })}
      </svg>
    );
  }

  const mapX = (wx: number) => rcbSceneToScreen(camera, wx, 0, dpr).x;
  const mapY = (wy: number) => rcbSceneToScreen(camera, 0, wy, dpr).y;

  return (
    <div
      className={
        className || 'pointer-events-none absolute inset-0 z-[38] overflow-visible'
      }
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {alignGuides.map((g, i) => {
          const a = Math.min(g.from, g.to);
          const b = Math.max(g.from, g.to);
          const markVals = (g.marks?.length ? g.marks : [a, b]).map(
            (n) => Math.round(n * 100) / 100
          );
          const crosses = Array.from(new Set(markVals));
          const len = Math.abs(b - a) * zoom;
          const drawSegment = len >= stroke;

          if (g.orient === 'v') {
            const x = mapX(g.pos);
            return (
              <g key={`v-${g.pos}-${i}`}>
                {drawSegment ? (
                  <line
                    x1={x}
                    y1={mapY(a)}
                    x2={x}
                    y2={mapY(b)}
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="butt"
                  />
                ) : null}
                {crosses.map((y) => (
                  <path
                    key={`vx-${y}`}
                    d={`M${x - halfCross} ${mapY(y) - halfCross} L${x + halfCross} ${mapY(y) + halfCross} M${x + halfCross} ${mapY(y) - halfCross} L${x - halfCross} ${mapY(y) + halfCross}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="butt"
                  />
                ))}
              </g>
            );
          }

          const y = mapY(g.pos);
          return (
            <g key={`h-${g.pos}-${i}`}>
              {drawSegment ? (
                <line
                  x1={mapX(a)}
                  y1={y}
                  x2={mapX(b)}
                  y2={y}
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                />
              ) : null}
              {crosses.map((x) => (
                <path
                  key={`hx-${x}`}
                  d={`M${mapX(x) - halfCross} ${y - halfCross} L${mapX(x) + halfCross} ${y + halfCross} M${mapX(x) + halfCross} ${y - halfCross} L${mapX(x) - halfCross} ${y + halfCross}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default memo(AlignGuidesOverlay);
