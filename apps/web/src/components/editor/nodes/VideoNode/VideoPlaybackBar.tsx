import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, memo } from 'react';
import type Player from 'video.js/dist/types/player';
import {
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
} from 'react-icons/hi2';
import { cn } from '@/utils/classnames';

/** Horizontal padding; bar is full-bleed with bottom gradient. */
const EDGE_PAD = 10;
const BAR_H = 44;
/** Uniform gap between play · time · track · volume. */
const ITEM_GAP = 10;

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

/** Chrome scale from node screen width so the bar shrinks/grows with the node. */
export function videoPlaybackBarScale(screenWidth: number): number {
  const w = Math.max(1, screenWidth);
  return Math.min(1.2, Math.max(0.5, w / 300));
}

/**
 * Shared playback chrome — play · time · scrub · volume + bottom gradient.
 * Used by VideoJsPlayer overlay and by canvas hover (screen-space portal).
 */
function VideoPlaybackBar({
  player,
  visible,
  trimStart,
  trimEnd,
  className,
  style,
  onHoverChange,
  nodeId,
  /** Visual scale (node resize / camera). Default 1. */
  scale = 1,
}: {
  player: Player | null;
  visible: boolean;
  trimStart?: number;
  trimEnd?: number;
  className?: string;
  style?: CSSProperties;
  onHoverChange?: (hovered: boolean) => void;
  nodeId?: string;
  scale?: number;
}): ReactNode {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const trimWindowRef = useRef({ start: 0, end: 0 });
  const playableRef = useRef(0);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [volOpen, setVolOpen] = useState(false);

  const s = Math.max(0.4, Number(scale) || 1);
  const trimWindow = resolveTrimWindow(mediaDuration, trimStart, trimEnd);
  const playable = Math.max(0, trimWindow.end - trimWindow.start);
  trimWindowRef.current = trimWindow;
  playableRef.current = playable;
  const displayCurrent = Math.max(0, current - trimWindow.start);
  const ratio = progressRatio(displayCurrent, playable);
  const volPct = muted ? 0 : volume;

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
    player.on('durationchange', sync);
    player.on('volumechange', sync);
    return () => {
      player.off('timeupdate', sync);
      player.off('play', sync);
      player.off('pause', sync);
      player.off('loadedmetadata', sync);
      player.off('durationchange', sync);
      player.off('volumechange', sync);
    };
  }, [player]);

  const seekFromClientX = (clientX: number) => {
    if (!player || player.isDisposed() || !trackRef.current) return;
    const span = playableRef.current;
    if (!(span > 0)) return;
    const r = trackRef.current.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    player.currentTime(trimWindowRef.current.start + t * span);
  };

  useEffect(() => {
    const root = window.document;
    const onMove = (e: PointerEvent) => {
      if (!scrubbingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      seekFromClientX(e.clientX);
    };
    const onUp = () => {
      scrubbingRef.current = false;
    };
    root.addEventListener('pointermove', onMove, { capture: true, passive: false });
    root.addEventListener('pointerup', onUp, { capture: true });
    root.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      root.removeEventListener('pointermove', onMove, true);
      root.removeEventListener('pointerup', onUp, true);
      root.removeEventListener('pointercancel', onUp, true);
    };
  }, [player]);

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.nativeEvent as any).stopImmediatePropagation?.();
    scrubbingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    seekFromClientX(e.clientX);
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

  const pad = EDGE_PAD * s;
  const gap = ITEM_GAP * s;
  const btn = 28 * s;
  const icon = 16 * s;
  const timeSize = 11 * s;
  const trackH = 28 * s;
  const rail = 3 * s;
  const thumb = 10 * s;
  // Thumb overhang so left/right of the rail keep equal inset from neighbors.
  const trackInset = thumb / 2;

  return (
    <div
      data-sel-toolbar
      data-video-playback-bar
      data-video-node-id={nodeId}
      className={cn(
        'pointer-events-auto flex items-center text-white transition-opacity duration-150',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        className
      )}
      style={{
        height: BAR_H * s,
        paddingLeft: pad,
        paddingRight: pad,
        gap,
        background:
          'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 55%, rgba(0,0,0,0) 100%)',
        ...style,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.nativeEvent as any).stopImmediatePropagation?.();
      }}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => {
        onHoverChange?.(false);
        if (!scrubbingRef.current) setVolOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={paused ? '播放' : '暂停'}
        className="inline-flex shrink-0 items-center justify-center rounded-md hover:bg-white/10"
        style={{ width: btn, height: btn }}
        onClick={togglePlay}
      >
        {paused ? (
          <HiOutlinePlay style={{ width: icon, height: icon }} />
        ) : (
          <HiOutlinePause style={{ width: icon, height: icon }} />
        )}
      </button>

      <span
        className="shrink-0 tabular-nums leading-none text-white/90"
        style={{ fontSize: timeSize, minWidth: `${3.2 * timeSize}px` }}
      >
        {formatTime(displayCurrent)}
      </span>

      <div
        ref={trackRef}
        className="relative z-[1] min-w-[24px] flex-1 cursor-pointer touch-none"
        style={{ height: trackH, paddingLeft: trackInset, paddingRight: trackInset }}
        onPointerDown={onTrackPointerDown}
      >
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-white/30"
          style={{ left: trackInset, right: trackInset, height: rail }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{
            left: trackInset,
            height: rail,
            width: `calc((100% - ${trackInset * 2}px) * ${ratio})`,
          }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm"
          style={{
            left: `calc(${trackInset}px + (100% - ${trackInset * 2}px) * ${ratio})`,
            width: thumb,
            height: thumb,
          }}
        />
      </div>

      {/* Volume: panel + mute share one hover zone (bridge closes the gap). */}
      <div
        className="relative shrink-0"
        onPointerEnter={() => setVolOpen(true)}
        onPointerLeave={() => {
          if (!scrubbingRef.current) setVolOpen(false);
        }}
      >
        {volOpen ? (
          <div className="absolute bottom-full left-1/2 z-10 flex -translate-x-1/2 flex-col items-center">
            <div
              className="flex items-center justify-center rounded-md bg-black/70 shadow-md"
              style={{ height: 88 * s, width: 32 * s, paddingTop: 10 * s, paddingBottom: 10 * s }}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.nativeEvent as any).stopImmediatePropagation?.();
              }}
            >
              <div
                className="relative cursor-pointer touch-none"
                style={{ height: '100%', width: 28 * s }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.nativeEvent as any).stopImmediatePropagation?.();
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
                <div
                  className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full bg-white/30"
                  style={{ width: rail }}
                />
                <div
                  className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-white"
                  style={{ width: rail, height: `${volPct * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-sm"
                  style={{ bottom: `${volPct * 100}%`, width: thumb, height: thumb }}
                />
              </div>
            </div>
            <div style={{ height: 8 * s, width: 32 * s }} aria-hidden />
          </div>
        ) : null}
        <button
          type="button"
          aria-label={muted || volume <= 0.01 ? '取消静音' : '静音'}
          className="inline-flex items-center justify-center rounded-md hover:bg-white/10"
          style={{ width: btn, height: btn }}
          onClick={toggleMute}
        >
          {muted || volume <= 0.01 ? (
            <HiOutlineSpeakerXMark style={{ width: icon, height: icon }} />
          ) : (
            <HiOutlineSpeakerWave style={{ width: icon, height: icon }} />
          )}
        </button>
      </div>
    </div>
  );
}

export default memo(VideoPlaybackBar);
