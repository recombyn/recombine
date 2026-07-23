import {
  useRcbCamera,
} from '../camera/context';
import {
  rcbSceneToScreen,
} from '../core/math';
import type { AlignGuide } from './alignGuides';

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

const GUIDE_RED = '#FF2D2D';
const GAP_PINK = '#E11D8F';
/** Screen px — sized as px/zoom in page space. */
const STROKE_PX = 1;
const CROSS_PX = 7;
const LABEL_PX = 10;

function GuideCross({
  x,
  y,
  size,
  stroke,
  color = GUIDE_RED,
}: {
  x: number;
  y: number;
  size: number;
  stroke: number;
  color?: string;
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
 * Align / gap guides: page-space geometry, screen-constant
 * stroke via `px / zoom` SVG widths (no CSS border / reverse scale).
 */
export default function AlignGuidesOverlay({
  guides,
  space = 'world',
  className,
}: AlignGuidesOverlayProps) {
  const camera = useRcbCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  if (!guides.length) return null;

  const inStage = space === 'stage';
  const inv = inStage ? 1 : 1 / zoom;
  const stroke = STROKE_PX * inv;
  const cross = CROSS_PX * inv;
  const labelFont = LABEL_PX * inv;

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
      {guides.map((g, i) => {
        const a = Math.min(g.from, g.to);
        const b = Math.max(g.from, g.to);
        const color = g.kind === 'gap' || g.kind === 'size' ? GAP_PINK : GUIDE_RED;
        const crosses = Array.from(
          new Set([a, b, ...(g.marks || [])].map((n) => Math.round(n * 100) / 100))
        );
        const len = Math.max(stroke, mapLen(b - a));

        if (g.orient === 'v') {
          const x = mapX(g.pos);
          const top = mapY(a);
          const midY = mapY((a + b) / 2);
          const dimLabel =
            g.kind === 'gap' || g.kind === 'size' ? Math.round(Math.abs(b - a)) : null;
          return (
            <div key={`v-${g.pos}-${i}`}>
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
              {dimLabel != null && dimLabel > 0 ? (
                <div
                  className="absolute whitespace-nowrap rounded px-1 py-px font-semibold tabular-nums text-white"
                  style={{
                    left: x,
                    top: midY,
                    fontSize: labelFont,
                    paddingInline: 4 * inv,
                    paddingBlock: 1 * inv,
                    transform: 'translate(-50%, -50%)',
                    background: color,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                  }}
                >
                  {dimLabel}
                </div>
              ) : null}
            </div>
          );
        }

        const y = mapY(g.pos);
        const left = mapX(a);
        const midX = mapX((a + b) / 2);
        const dimLabel =
          g.kind === 'gap' || g.kind === 'size' ? Math.round(Math.abs(b - a)) : null;
        return (
          <div key={`h-${g.pos}-${i}`}>
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
            {dimLabel != null && dimLabel > 0 ? (
              <div
                className="absolute whitespace-nowrap rounded px-1 py-px font-semibold tabular-nums text-white"
                style={{
                  left: midX,
                  top: y,
                  fontSize: labelFont,
                  paddingInline: 4 * inv,
                  paddingBlock: 1 * inv,
                  transform: 'translate(-50%, -50%)',
                  background: color,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                }}
              >
                {dimLabel}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
