import { memo } from 'react';
import {
  useRcbCamera,
} from '../camera/context';
import {
  rcbSceneToScreen,
} from '../core/math';
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
   * `world` — parent is camera-scaled scene.
   * `stage` — parent is unscaled RcbOverlayPortal.
   */
  space?: 'world' | 'stage';
  className?: string;
};

/** Screen px — sized as px/zoom in page space. */
const STROKE_PX = 1.5;
/** × at edge corners / centers (MasterGo-style). */
const CROSS_PX = 10;

function GuideCross({
  x,
  y,
  size,
  stroke,
  color,
}: {
  x: number;
  y: number;
  size: number;
  stroke: number;
  color: string;
}) {
  const pad = stroke;
  const outer = size + pad * 2;
  return (
    <svg
      className="absolute overflow-visible"
      width={outer}
      height={outer}
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <path
        d={`M${pad} ${pad} L${pad + size} ${pad + size} M${pad + size} ${pad} L${pad} ${pad + size}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="square"
      />
    </svg>
  );
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
  const zoom = Math.max(0.05, camera.zoom || 1);
  const alignGuides = guides.filter((g) => g.kind !== 'gap' && g.kind !== 'size');
  if (!alignGuides.length) return null;

  const inStage = space === 'stage';
  const inv = inStage ? 1 : 1 / zoom;
  const stroke = STROKE_PX * inv;
  const cross = CROSS_PX * inv;
  const color = SPACING_MEASURE_COLOR;

  const mapX = (wx: number) => (inStage ? rcbSceneToScreen(camera, wx, 0).x : wx);
  const mapY = (wy: number) => (inStage ? rcbSceneToScreen(camera, 0, wy).y : wy);
  const mapLen = (worldLen: number) => (inStage ? worldLen * zoom : worldLen);

  return (
    <div
      className={
        className ||
        `pointer-events-none absolute inset-0 overflow-visible ${inStage ? 'z-[38]' : 'z-30'}`
      }
    >
      {alignGuides.map((g, i) => {
        const a = Math.min(g.from, g.to);
        const b = Math.max(g.from, g.to);
        const markVals = (g.marks?.length ? g.marks : [a, b]).map(
          (n) => Math.round(n * 100) / 100
        );
        const crosses = Array.from(new Set(markVals));
        const len = Math.max(0, mapLen(b - a));
        const drawSegment = len >= stroke;

        if (g.orient === 'v') {
          const x = mapX(g.pos);
          const top = mapY(a);
          return (
            <div key={`v-${g.pos}-${i}`}>
              {drawSegment ? (
                <svg
                  className="absolute overflow-visible"
                  width={Math.max(stroke * 2, 1)}
                  height={len}
                  style={{ left: x, top, transform: 'translateX(-50%)' }}
                  aria-hidden
                >
                  <line
                    x1="50%"
                    y1={0}
                    x2="50%"
                    y2={len}
                    stroke={color}
                    strokeWidth={stroke}
                  />
                </svg>
              ) : null}
              {crosses.map((y) => (
                <GuideCross
                  key={`vx-${y}`}
                  x={x}
                  y={mapY(y)}
                  size={cross}
                  stroke={stroke}
                  color={color}
                />
              ))}
            </div>
          );
        }

        const y = mapY(g.pos);
        const left = mapX(a);
        return (
          <div key={`h-${g.pos}-${i}`}>
            {drawSegment ? (
              <svg
                className="absolute overflow-visible"
                width={len}
                height={Math.max(stroke * 2, 1)}
                style={{ left, top: y, transform: 'translateY(-50%)' }}
                aria-hidden
              >
                <line
                  x1={0}
                  y1="50%"
                  x2={len}
                  y2="50%"
                  stroke={color}
                  strokeWidth={stroke}
                />
              </svg>
            ) : null}
            {crosses.map((x) => (
              <GuideCross
                key={`hx-${x}`}
                x={mapX(x)}
                y={y}
                size={cross}
                stroke={stroke}
                color={color}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default memo(AlignGuidesOverlay);
