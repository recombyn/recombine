/**
 * HTML Lottie plates over SVG hit-targets (same pattern as VideoNodeOverlay).
 * Agent / tool-strip store Bodymovin JSON in attrs.animationData.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  memo,
} from 'react';
import lottie, { type AnimationItem } from 'lottie-web';
import { useRcbCamera } from '@/components/rcb';
import {
  isLottieNode,
  isNodeHidden,
  parseLottieAnimationData,
  stackZIndex,
} from '@/components/rcb/scene/document/sceneDocument';
import { radiiFromAttrs } from '@/components/rcb/scene/document/sceneRadii';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';

export type LottieGeomOverride = {
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
};

export type LottieHostApi = {
  play: () => void;
  pause: () => void;
  isPaused: () => boolean;
  setLoop: (loop: boolean) => void;
  setSpeed: (speed: number) => void;
  getSpeed: () => number;
};

const lottieHosts = new Map<string, LottieHostApi>();

export function getLottieHost(nodeId: string): LottieHostApi | null {
  return lottieHosts.get(nodeId) || null;
}

function readNodeAngle(node: any) {
  const n = Number(node?.attrs?.angle);
  return Number.isFinite(n) ? n : 0;
}

function plateTransform(angle: number) {
  if (Math.abs(angle) > 0.001) return `rotate(${angle}deg)`;
  return undefined;
}

function readLoop(attrs: any): boolean {
  const raw = attrs?.lottieLoop;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return true;
}

function readSpeed(attrs: any): number {
  const n = Number(attrs?.lottieSpeed);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

function LottieZoomSync({ onZoom }: { onZoom: (zoom: number) => void }) {
  const zoom = useRcbCamera().zoom;
  useEffect(() => {
    onZoom(Math.max(0.05, zoom || 1));
  }, [zoom, onZoom]);
  return null;
}

function LottiePlate({
  nodeId,
  scenePlate,
  stackZ,
  animationJson,
  loop,
  speed,
  plateFill,
  hidden,
}: {
  nodeId: string;
  scenePlate: CSSProperties & { left: number; top: number; width: number; height: number };
  stackZ: number;
  animationJson: string;
  loop: boolean;
  speed: number;
  plateFill: string;
  hidden?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const data = parseLottieAnimationData(animationJson);
    if (!data) return undefined;
    host.innerHTML = '';
    let anim: AnimationItem;
    try {
      anim = lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop,
        autoplay: true,
        animationData: structuredClone
          ? structuredClone(data)
          : JSON.parse(JSON.stringify(data)),
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: true,
          // Keep SVG inside the counter-scaled wrap.
          viewBoxOnly: true,
        },
      });
    } catch (err) {
      console.warn('[lottie] load failed', err);
      return undefined;
    }
    anim.setSpeed(speed);
    animRef.current = anim;
    const api: LottieHostApi = {
      play: () => anim.play(),
      pause: () => anim.pause(),
      isPaused: () => Boolean(anim.isPaused),
      setLoop: (next) => {
        anim.loop = next;
      },
      setSpeed: (next) => anim.setSpeed(next),
      getSpeed: () => Number(anim.playSpeed) || 1,
    };
    lottieHosts.set(nodeId, api);
    return () => {
      anim.destroy();
      animRef.current = null;
      if (lottieHosts.get(nodeId) === api) lottieHosts.delete(nodeId);
      host.innerHTML = '';
    };
  }, [animationJson, nodeId]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    anim.loop = loop;
  }, [loop]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    anim.setSpeed(speed);
  }, [speed]);

  return (
    <div
      data-lottie-node={nodeId}
      className="pointer-events-none absolute overflow-hidden"
      style={{
        ...scenePlate,
        zIndex: stackZ,
        background: plateFill,
        visibility: hidden ? 'hidden' : undefined,
      }}
      aria-hidden
    >
      {/* Counter-scale like video plates so SVG ink stays sharp under camera zoom. */}
      <div
        className="pointer-events-none absolute left-0 top-0 overflow-hidden"
        style={{
          width: scenePlate.width * z,
          height: scenePlate.height * z,
          transform: `scale(${1 / z})`,
          transformOrigin: '0 0',
        }}
      >
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}

function LottieNodeOverlay({
  document,
  hidden,
  geometryOverrides = null,
}: {
  document: any;
  hidden?: boolean;
  geometryOverrides?: Record<string, LottieGeomOverride> | null;
}): ReactNode {
  const [zoom, setZoom] = useState(1);
  const onZoom = useCallback((z: number) => {
    setZoom((prev) => (Math.abs(prev - z) < 1e-6 ? prev : z));
  }, []);
  void zoom;

  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => {
      const node = document?.deltaSetLike?.[id];
      if (!isLottieNode(node)) return false;
      return Boolean(parseLottieAnimationData(node?.attrs?.animationData));
    });
  }, [document]);

  if (!ids.length) return null;

  return (
    <>
      <LottieZoomSync onZoom={onZoom} />
      {ids.map((nodeId) => {
        const node = document?.deltaSetLike?.[nodeId];
        if (!node) return null;
        const animationJson = String(node.attrs?.animationData || '').trim();
        if (!parseLottieAnimationData(animationJson)) return null;
        const layerHidden = isNodeHidden(node);
        const { left, top } = nodeLeftTop(document, node);
        const ov = geometryOverrides?.[nodeId];
        const width = Math.max(1, ov ? ov.width : Number(node.width) || 1);
        const height = Math.max(1, ov ? ov.height : Number(node.height) || 1);
        const angle =
          ov && Number.isFinite(ov.angle) ? Number(ov.angle) : readNodeAngle(node);
        const radii = radiiFromAttrs(node.attrs || {});
        const scenePlate: CSSProperties & {
          left: number;
          top: number;
          width: number;
          height: number;
        } = {
          left: ov ? ov.left : left,
          top: ov ? ov.top : top,
          width,
          height,
          borderRadius: `${radii.tl}px ${radii.tr}px ${radii.br}px ${radii.bl}px`,
          transform: plateTransform(angle),
          transformOrigin: 'center center',
        };
        return (
          <LottiePlate
            key={nodeId}
            nodeId={nodeId}
            scenePlate={scenePlate}
            stackZ={stackZIndex(document, 'node', nodeId)}
            animationJson={animationJson}
            loop={readLoop(node.attrs)}
            speed={readSpeed(node.attrs)}
            plateFill={
              String(node.attrs?.['fill-color'] || node.attrs?.fill || '').trim() || '#FFFFFF'
            }
            hidden={Boolean(hidden) || layerHidden}
          />
        );
      })}
    </>
  );
}

export default memo(LottieNodeOverlay);
