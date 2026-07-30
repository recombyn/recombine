import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  memo,
} from 'react';
import type Player from 'video.js/dist/types/player';
import { RcbOverlayPortal, rcbSceneToScreen, useRcbCamera } from '@/components/rcb';
import VideoJsPlayer, {
  usePlayableVideoSrc,
  type VideoCropNorm,
} from '@/components/editor/nodes/VideoNode/VideoJsPlayer';
import VideoPlaybackBar, {
  videoPlaybackBarScale,
} from '@/components/editor/nodes/VideoNode/VideoPlaybackBar';

function readCrop(
  cropX?: number,
  cropY?: number,
  cropW?: number,
  cropH?: number
): VideoCropNorm | undefined {
  if (
    !Number.isFinite(cropX) ||
    !Number.isFinite(cropY) ||
    !Number.isFinite(cropW) ||
    !Number.isFinite(cropH) ||
    Number(cropW) <= 0 ||
    Number(cropH) <= 0
  ) {
    return undefined;
  }
  const crop = {
    x: Number(cropX),
    y: Number(cropY),
    w: Number(cropW),
    h: Number(cropH),
  };
  if (crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999) {
    return undefined;
  }
  return crop;
}

function pointInRect(x: number, y: number, r: DOMRect) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * Screen-space portal wrapper so the shared bar tracks the node under camera zoom
 * (same positioning model as VideoReplaceCornerButton).
 */
function VideoPlaybackBarPortal({
  nodeId,
  box,
  angle,
  visible,
  player,
  trimStart,
  trimEnd,
  onBarHoverChange,
}: {
  nodeId: string;
  box: { left: number; top: number; width: number; height: number };
  angle: number;
  visible: boolean;
  player: Player | null;
  trimStart?: number;
  trimEnd?: number;
  onBarHoverChange: (hovered: boolean) => void;
}): ReactNode {
  const camera = useRcbCamera();
  const tl = rcbSceneToScreen(camera, box.left, box.top);
  const br = rcbSceneToScreen(camera, box.left + box.width, box.top + box.height);
  const stageBox = {
    left: Math.min(tl.x, br.x),
    top: Math.min(tl.y, br.y),
    width: Math.abs(br.x - tl.x),
    height: Math.abs(br.y - tl.y),
  };

  const frameStyle: CSSProperties = {
    position: 'absolute',
    left: stageBox.left,
    top: stageBox.top,
    width: stageBox.width,
    height: stageBox.height,
    transform: Math.abs(angle) > 0.001 ? `rotate(${angle}deg)` : undefined,
    transformOrigin: 'center center',
  };

  return (
    <RcbOverlayPortal>
      <div className="pointer-events-none absolute z-[60]" style={frameStyle}>
        <VideoPlaybackBar
          nodeId={nodeId}
          player={player}
          visible={visible}
          trimStart={trimStart}
          trimEnd={trimEnd}
          scale={videoPlaybackBarScale(stageBox.width)}
          className="absolute inset-x-0 bottom-0"
          onHoverChange={onBarHoverChange}
        />
      </div>
    </RcbOverlayPortal>
  );
}

type VideoHoverPlaybackProps = {
  nodeId: string;
  scenePlate: CSSProperties & { left: number; top: number; width: number; height: number };
  zoom: number;
  angle?: number;
  src: string;
  poster?: string;
  uploadKey?: string | null;
  disabled?: boolean;
  hidden?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  trimStart?: number;
  trimEnd?: number;
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
};

/**
 * World-layer video plate + shared playback bar in screen-space portal.
 *
 * Idle + poster → keep Video.js mounted but invisible so the SVG poster paints
 * (same as images). Avoids flash when selection / canvas chrome re-renders.
 * Hover / playing / no-poster → show the HTML plate.
 */
function VideoHoverPlayback({
  nodeId,
  scenePlate,
  zoom,
  angle = 0,
  src,
  poster,
  uploadKey,
  disabled,
  hidden,
  flipX,
  flipY,
  trimStart,
  trimEnd,
  cropX,
  cropY,
  cropW,
  cropH,
}: VideoHoverPlaybackProps): ReactNode {
  const plateRef = useRef<HTMLDivElement | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playing, setPlaying] = useState(false);
  const playSrc = usePlayableVideoSrc(src, uploadKey);
  const [plateHovered, setPlateHovered] = useState(false);
  const [barHovered, setBarHovered] = useState(false);
  const showUi = !hidden && !disabled;
  const crop = readCrop(cropX, cropY, cropW, cropH);
  const z = Math.max(0.05, zoom || 1);
  const hasPoster = Boolean(poster);
  // Paint HTML only when needed; otherwise SVG poster is the idle surface.
  const paintHtml =
    showUi && (playing || plateHovered || barHovered || !hasPoster);
  const barVisible = showUi && (plateHovered || barHovered);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const plate = plateRef.current;
      if (!plate || hidden) {
        setPlateHovered(false);
        return;
      }
      setPlateHovered(pointInRect(e.clientX, e.clientY, plate.getBoundingClientRect()));
    };
    const onLeave = () => setPlateHovered(false);
    document.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('blur', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', onLeave);
    };
  }, [hidden, scenePlate.left, scenePlate.top, scenePlate.width, scenePlate.height]);

  useEffect(() => {
    if (!player || player.isDisposed()) {
      setPlaying(false);
      return;
    }
    const sync = () => {
      try {
        setPlaying(!player.paused());
      } catch {
        setPlaying(false);
      }
    };
    sync();
    player.on('play', sync);
    player.on('pause', sync);
    player.on('ended', sync);
    return () => {
      player.off('play', sync);
      player.off('pause', sync);
      player.off('ended', sync);
    };
  }, [player]);

  const plateStyle = useMemo(
    (): CSSProperties => ({
      ...scenePlate,
      zIndex: 10,
      // Keep laid out for hit-testing / player mount; hide when SVG poster owns paint.
      visibility: paintHtml ? 'visible' : 'hidden',
    }),
    [scenePlate, paintHtml]
  );

  const counterScaleStyle = useMemo(
    (): CSSProperties => ({
      width: scenePlate.width * z,
      height: scenePlate.height * z,
      transform: `scale(${1 / z})`,
      transformOrigin: '0 0',
    }),
    [scenePlate.width, scenePlate.height, z]
  );

  if (!src || !playSrc) return null;

  const sceneBox = {
    left: scenePlate.left,
    top: scenePlate.top,
    width: scenePlate.width,
    height: scenePlate.height,
  };

  return (
    <>
      <div
        ref={plateRef}
        className="pointer-events-none absolute overflow-hidden"
        style={plateStyle}
        data-video-hover-plate=""
        data-video-node-id={nodeId}
      >
        <div className="absolute left-0 top-0 overflow-hidden" style={counterScaleStyle}>
          <VideoJsPlayer
            src={playSrc}
            poster={poster}
            layout="fill"
            controlsMode="none"
            muted
            videoPointerNone
            crop={crop}
            flipX={flipX}
            flipY={flipY}
            trimStart={trimStart}
            trimEnd={trimEnd}
            className="h-full w-full"
            onReady={setPlayer}
          />
        </div>
      </div>

      {showUi ? (
        <VideoPlaybackBarPortal
          nodeId={nodeId}
          box={sceneBox}
          angle={angle}
          visible={barVisible}
          player={player}
          trimStart={trimStart}
          trimEnd={trimEnd}
          onBarHoverChange={setBarHovered}
        />
      ) : null}
    </>
  );
}

function hoverPlaybackPropsEqual(
  prev: VideoHoverPlaybackProps,
  next: VideoHoverPlaybackProps
): boolean {
  return (
    prev.nodeId === next.nodeId &&
    prev.zoom === next.zoom &&
    prev.angle === next.angle &&
    prev.src === next.src &&
    prev.poster === next.poster &&
    prev.uploadKey === next.uploadKey &&
    prev.disabled === next.disabled &&
    prev.hidden === next.hidden &&
    prev.flipX === next.flipX &&
    prev.flipY === next.flipY &&
    prev.trimStart === next.trimStart &&
    prev.trimEnd === next.trimEnd &&
    prev.cropX === next.cropX &&
    prev.cropY === next.cropY &&
    prev.cropW === next.cropW &&
    prev.cropH === next.cropH &&
    prev.scenePlate.left === next.scenePlate.left &&
    prev.scenePlate.top === next.scenePlate.top &&
    prev.scenePlate.width === next.scenePlate.width &&
    prev.scenePlate.height === next.scenePlate.height &&
    prev.scenePlate.borderRadius === next.scenePlate.borderRadius &&
    prev.scenePlate.transform === next.scenePlate.transform
  );
}

export default memo(VideoHoverPlayback, hoverPlaybackPropsEqual);
