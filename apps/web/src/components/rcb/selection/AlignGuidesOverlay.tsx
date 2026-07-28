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
const STROKE_PX = 1;

/**
 * Edge/center align guides (solid orange, matching MasterGo).
 * Gap / size distance labels are drawn once by SpacingInspectOverlay.
 */
export default function AlignGuidesOverlay({
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
        const len = Math.max(stroke, mapLen(b - a));

        if (g.orient === 'v') {
          const x = mapX(g.pos);
          const top = mapY(a);
          return (
            <svg
              key={`v-${g.pos}-${i}`}
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
          );
        }

        const y = mapY(g.pos);
        const left = mapX(a);
        return (
          <svg
            key={`h-${g.pos}-${i}`}
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
        );
      })}
    </div>
  );
}
