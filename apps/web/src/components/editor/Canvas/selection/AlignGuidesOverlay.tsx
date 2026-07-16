import { useCamera, worldToStage } from '@/components/editor/Canvas/stage/CameraContext';

export type AlignGuide = {
  orient: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
  marks: number[];
};

type AlignGuidesOverlayProps = {
  guides: AlignGuide[];
  /** Kept for API compatibility; segments no longer span the full artboard. */
  artboard?: { width: number; height: number };
  /**
   * `world` — parent is camera-scaled scene (SelectionFeature).
   * `stage` — parent is unscaled CameraOverlayPortal (crop/expand).
   */
  space?: 'world' | 'stage';
  className?: string;
};

const GUIDE_RED = '#FF2D2D';

/** Red × mark at a scene-space or stage-space point. */
function GuideCross({
  x,
  y,
  sizePx,
}: {
  x: number;
  y: number;
  sizePx: number;
}) {
  return (
    <svg
      className="absolute overflow-visible"
      width={sizePx}
      height={sizePx}
      viewBox="0 0 8 8"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <path
        d="M1.2 1.2 L6.8 6.8 M6.8 1.2 L1.2 6.8"
        fill="none"
        stroke={GUIDE_RED}
        strokeWidth="1.35"
        strokeLinecap="square"
      />
    </svg>
  );
}

/**
 * Align guides (fig.1): bright red 1px segments spanning snapped boxes,
 * with × marks at corners / endpoints.
 */
export default function AlignGuidesOverlay({
  guides,
  space = 'world',
  className,
}: AlignGuidesOverlayProps) {
  const camera = useCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  if (!guides.length) return null;

  const inStage = space === 'stage';
  // World parent is scaled by zoom → use world units so lines stay ~1px on screen.
  // Stage portal is unscaled → use screen pixels after worldToStage.
  const lw = inStage ? 1 : Math.max(1 / zoom, 0.6);
  const crossPx = inStage ? 7 : 7 / zoom;

  const mapX = (wx: number) => (inStage ? worldToStage(camera, wx, 0).x : wx);
  const mapY = (wy: number) => (inStage ? worldToStage(camera, 0, wy).y : wy);
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
        const crosses = Array.from(
          new Set([a, b, ...(g.marks || [])].map((n) => Math.round(n * 100) / 100))
        );

        if (g.orient === 'v') {
          const x = mapX(g.pos);
          const top = mapY(a);
          return (
            <div key={`v-${g.pos}-${i}`}>
              <div
                className="absolute"
                style={{
                  left: x,
                  top,
                  width: lw,
                  height: Math.max(1, mapLen(b - a)),
                  background: GUIDE_RED,
                  transform: 'translateX(-50%)',
                }}
              />
              {crosses.map((y) => (
                <GuideCross key={`vx-${y}`} x={x} y={mapY(y)} sizePx={crossPx} />
              ))}
            </div>
          );
        }

        const y = mapY(g.pos);
        const left = mapX(a);
        return (
          <div key={`h-${g.pos}-${i}`}>
            <div
              className="absolute"
              style={{
                left,
                top: y,
                width: Math.max(1, mapLen(b - a)),
                height: lw,
                background: GUIDE_RED,
                transform: 'translateY(-50%)',
              }}
            />
            {crosses.map((x) => (
              <GuideCross key={`hx-${x}`} x={mapX(x)} y={y} sizePx={crossPx} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
