import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type Player from 'video.js/dist/types/player';
import {
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
} from 'react-icons/hi2';
import { RcbOverlayPortal, rcbSceneToScreen, useRcbCamera } from '@/components/rcb';
import { cn } from '@/utils/classnames';
import VideoJsPlayer, {
  usePlayableVideoSrc,
  type VideoCropNorm,
} from '@/components/editor/nodes/VideoNode/VideoJsPlayer';

export { usePlayableVideoSrc };

/** Inset from the video edge to the playback bar (screen px) — same as replace button. */
const EDGE_PAD = 10;
const BAR_H = 36;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function progressRatio(current: number, duration: number) {
  if (!duration || duration <= 0) return 0;
  return Math.max(0, Math.min(1, current / duration));
}

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

function resolveTrimWindow(
  mediaDuration: number,
  trimStart?: number,
  trimEnd?: number
) {
  const d = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : 0;
  let start = Number.isFinite(trimStart) ? Math.max(0, Number(trimStart)) : 0;
  let end = Number.isFinite(trimEnd) ? Number(trimEnd) : d || 0;
  if (d > 0) {
    start = Math.max(0, Math.min(start, d));
    end = Math.max(0, Math.min(end || d, d));
  }
  if (end <= start) end = d > 0 ? d : start;
  return { start, end };
}

function pointInRect(x: number, y: number, r: DOMRect) {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * Custom playback chrome — screen-space portal, same positioning model as
 * VideoReplaceCornerButton (stage box + EDGE_PAD), not Video.js control bar.
 */
function VideoPlaybackBar({
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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [volOpen, setVolOpen] = useState(false);
  const scrubbingRef = useRef(false);

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

  const barStyle: CSSProperties = {
    position: 'absolute',
    left: EDGE_PAD,
    right: EDGE_PAD,
    bottom: EDGE_PAD,
    height: BAR_H,
  };

  const trimWindow = resolveTrimWindow(mediaDuration, trimStart, trimEnd);
  const playable = Math.max(0, trimWindow.end - trimWindow.start);
  const displayCurrent = Math.max(0, current - trimWindow.start);
  const ratio = progressRatio(displayCurrent, playable);

  useEffect(() => {
    if (!player || player.isDisposed()) return;
    const sync = () => {
      setPaused(Boolean(player.paused()));
      setCurrent(Number(player.currentTime()) || 0);
      setMediaDuration(Number(player.duration()) || 0);
      setMuted(Boolean(player.muted()));
      setVolume(Number(player.volume()) || 0);
    };
    sync();
    player.on('timeupdate', sync);
    player.on('play', sync);
    player.on('pause', sync);
    player.on('loadedmetadata', sync);
    player.on('volumechange', sync);
    return () => {
      player.off('timeupdate', sync);
      player.off('play', sync);
      player.off('pause', sync);
      player.off('loadedmetadata', sync);
      player.off('volumechange', sync);
    };
  }, [player]);

  const seekFromClientX = (clientX: number) => {
    if (!player || player.isDisposed() || !trackRef.current || !(playable > 0)) return;
    const r = trackRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    player.currentTime(trimWindow.start + t * playable);
  };

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    scrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    seekFromClientX(e.clientX);
  };

  const onTrackPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    scrubbingRef.current = false;
  };

  const togglePlay = () => {
    if (!player || player.isDisposed()) return;
    if (player.paused()) void player.play()?.catch(() => undefined);
    else player.pause();
  };

  const toggleMute = () => {
    if (!player || player.isDisposed()) return;
    const next = !player.muted();
    player.muted(next);
    if (!next && (Number(player.volume()) || 0) <= 0.01) player.volume(1);
  };

  const onVolumePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!player || player.isDisposed()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (r.bottom - e.clientY) / Math.max(1, r.height)));
    player.muted(t <= 0.01);
    player.volume(t);
  };

  return (
    <RcbOverlayPortal>
      <div className="pointer-events-none absolute z-[39]" style={frameStyle}>
        <div
          data-sel-toolbar
          data-video-playback-bar
          data-video-node-id={nodeId}
          className={cn(
            'pointer-events-auto absolute flex items-center gap-1.5 rounded-lg bg-black/55 px-2 text-white shadow-[0_2px_8px_rgba(15,23,42,0.2)] backdrop-blur-[2px] transition-opacity duration-150',
            visible ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
          style={barStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => onBarHoverChange(true)}
          onPointerLeave={() => {
            onBarHoverChange(false);
            if (!scrubbingRef.current) setVolOpen(false);
          }}
        >
          <button
            type="button"
            aria-label={paused ? '播放' : '暂停'}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-white/10"
            onClick={togglePlay}
          >
            {paused ? (
              <HiOutlinePlay className="h-4 w-4" />
            ) : (
              <HiOutlinePause className="h-4 w-4" />
            )}
          </button>

          <span className="shrink-0 tabular-nums text-[11px] leading-none text-white/90">
            {formatTime(displayCurrent)}
          </span>

          <div
            ref={trackRef}
            className="relative mx-0.5 h-7 min-w-0 flex-1 cursor-pointer touch-none"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
            onPointerCancel={onTrackPointerUp}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/30" />
            <div
              className="pointer-events-none absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white"
              style={{ width: `${ratio * 100}%` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm"
              style={{ left: `${ratio * 100}%` }}
            />
          </div>

          <div
            className="relative shrink-0"
            onPointerEnter={() => setVolOpen(true)}
            onPointerLeave={() => {
              if (!scrubbingRef.current) setVolOpen(false);
            }}
          >
            {volOpen ? (
              <div
                className="absolute bottom-[calc(100%+6px)] left-1/2 z-10 flex h-[88px] w-8 -translate-x-1/2 items-center justify-center rounded-md bg-black/70 py-2.5 shadow-md"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div
                  className="relative h-full w-7 cursor-pointer touch-none"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    onVolumePointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    onVolumePointer(e);
                  }}
                  onPointerUp={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                >
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-white/30" />
                  <div
                    className="pointer-events-none absolute bottom-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-white"
                    style={{ height: `${(muted ? 0 : volume) * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-sm"
                    style={{ bottom: `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
            <button
              type="button"
              aria-label={muted || volume <= 0.01 ? '取消静音' : '静音'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10"
              onClick={toggleMute}
            >
              {muted || volume <= 0.01 ? (
                <HiOutlineSpeakerXMark className="h-4 w-4" />
              ) : (
                <HiOutlineSpeakerWave className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </RcbOverlayPortal>
  );
}

/**
 * World-layer video plate + screen-space playback bar (same portal model as replace button).
 */
export default function VideoHoverPlayback({
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
}: {
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
}): ReactNode {
  const plateRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const playSrc = usePlayableVideoSrc(src, uploadKey);
  const [plateHovered, setPlateHovered] = useState(false);
  const [barHovered, setBarHovered] = useState(false);
  const showUi = !hidden && !disabled;
  const crop = readCrop(cropX, cropY, cropW, cropH);
  const z = Math.max(0.05, zoom || 1);
  const barVisible = plateHovered || barHovered;

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

  if (!src || !showUi || !playSrc) return null;

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
        style={{
          ...scenePlate,
          zIndex: 10,
        }}
        data-video-hover-plate=""
        data-video-node-id={nodeId}
      >
        <div
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: scenePlate.width * z,
            height: scenePlate.height * z,
            transform: `scale(${1 / z})`,
            transformOrigin: '0 0',
          }}
        >
          <VideoJsPlayer
            key={playSrc}
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
            onReady={(p) => {
              playerRef.current = p;
              setPlayer(p);
            }}
          />
        </div>
      </div>

      <VideoPlaybackBar
        nodeId={nodeId}
        box={sceneBox}
        angle={angle}
        visible={barVisible}
        player={player}
        trimStart={trimStart}
        trimEnd={trimEnd}
        onBarHoverChange={setBarHovered}
      />
    </>
  );
}
