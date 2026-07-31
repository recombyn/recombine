import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
} from 'react';
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

/** Shared control surface for native `<video>`. */
export type VideoMediaControl = {
  getCurrentTime: () => number;
  setCurrentTime: (t: number) => void;
  getDuration: () => number;
  isPaused: () => boolean;
  play: () => void;
  pause: () => void;
  isMuted: () => boolean;
  setMuted: (v: boolean) => void;
  getVolume: () => number;
  setVolume: (v: number) => void;
  on: (type: string, fn: () => void) => void;
  off: (type: string, fn: () => void) => void;
  isDead: () => boolean;
};

export function videoMediaFromElement(el: HTMLVideoElement): VideoMediaControl {
  return {
    getCurrentTime: () => Number(el.currentTime) || 0,
    setCurrentTime: (t) => {
      if (!Number.isFinite(t) || t < 0) return;
      try {
        el.currentTime = t;
      } catch {
        /* ignore non-seekable */
      }
    },
    getDuration: () => {
      const d = Number(el.duration);
      if (Number.isFinite(d) && d > 0) return d;
      try {
        if (el.seekable && el.seekable.length > 0) {
          const end = Number(el.seekable.end(el.seekable.length - 1));
          if (Number.isFinite(end) && end > 0) return end;
        }
        if (el.buffered && el.buffered.length > 0) {
          const end = Number(el.buffered.end(el.buffered.length - 1));
          if (Number.isFinite(end) && end > 0) return end;
        }
      } catch {
        /* ignore */
      }
      return 0;
    },
    isPaused: () => el.paused,
    play: () => {
      void el.play()?.catch(() => undefined);
    },
    pause: () => el.pause(),
    isMuted: () => el.muted,
    setMuted: (v) => {
      el.muted = v;
    },
    getVolume: () => Number(el.volume) || 0,
    setVolume: (v) => {
      el.volume = v;
    },
    on: (type, fn) => el.addEventListener(type, fn),
    off: (type, fn) => el.removeEventListener(type, fn),
    isDead: () => !el.isConnected,
  };
}

/** Chrome scale from node screen width so the bar shrinks/grows with the node. */
export function videoPlaybackBarScale(screenWidth: number): number {
  const w = Math.max(1, screenWidth);
  return Math.min(1.25, Math.max(0.85, w / 280));
}

/**
 * Shared playback chrome — play · time · scrub · volume + bottom gradient.
 */
function VideoPlaybackBar({
  media,
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
  media: VideoMediaControl | null;
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
  const pendingSeekRef = useRef<number | null>(null);
  const seekRafRef = useRef(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [volOpen, setVolOpen] = useState(false);

  const s = Math.max(0.85, Number(scale) || 1);
  const trimWindow = resolveTrimWindow(mediaDuration, trimStart, trimEnd);
  const playable = Math.max(0, trimWindow.end - trimWindow.start);
  trimWindowRef.current = trimWindow;
  playableRef.current = playable;
  const displayCurrent = Math.max(0, current - trimWindow.start);
  const ratio =
    scrubRatio != null ? scrubRatio : progressRatio(displayCurrent, playable);
  const volPct = muted ? 0 : volume;
  // Keep hit-testing while scrubbing even if hover briefly drops.
  const interactive = visible || scrubbing;

  useEffect(() => {
    if (!media || media.isDead()) return;
    const syncMeta = () => {
      setPaused(media.isPaused());
      setMediaDuration(media.getDuration());
      setMuted(media.isMuted());
      setVolume(media.getVolume());
    };
    const syncTime = () => {
      // Don't fight the thumb while dragging — avoids seek↔timeupdate lag.
      if (scrubbingRef.current) return;
      setCurrent(media.getCurrentTime());
      setMediaDuration(media.getDuration());
    };
    syncMeta();
    syncTime();
    media.on('timeupdate', syncTime);
    media.on('seeked', syncTime);
    media.on('play', syncMeta);
    media.on('pause', syncMeta);
    const onMeta = () => {
      syncMeta();
      syncTime();
    };
    media.on('loadedmetadata', onMeta);
    media.on('durationchange', syncMeta);
    media.on('volumechange', syncMeta);
    return () => {
      media.off('timeupdate', syncTime);
      media.off('seeked', syncTime);
      media.off('play', syncMeta);
      media.off('pause', syncMeta);
      media.off('loadedmetadata', onMeta);
      media.off('durationchange', syncMeta);
      media.off('volumechange', syncMeta);
    };
  }, [media]);

  const flushSeek = () => {
    seekRafRef.current = 0;
    const t = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (t == null || !media || media.isDead()) return;
    media.setCurrentTime(t);
    setCurrent(t);
  };

  const seekFromClientX = (clientX: number) => {
    if (!media || media.isDead() || !trackRef.current) return;
    let span = playableRef.current;
    if (!(span > 0)) {
      const d = media.getDuration();
      if (d > 0) {
        const win = resolveTrimWindow(d, trimStart, trimEnd);
        trimWindowRef.current = win;
        span = Math.max(0, win.end - win.start);
        playableRef.current = span;
        setMediaDuration(d);
      }
    }
    if (!(span > 0)) return;
    const r = trackRef.current.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const ratioT = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const next = trimWindowRef.current.start + ratioT * span;
    setScrubRatio(ratioT);
    setCurrent(next);
    pendingSeekRef.current = next;
    if (!seekRafRef.current) {
      seekRafRef.current = requestAnimationFrame(flushSeek);
    }
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
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      setScrubbing(false);
      if (seekRafRef.current) {
        cancelAnimationFrame(seekRafRef.current);
        seekRafRef.current = 0;
      }
      flushSeek();
      if (media && !media.isDead()) {
        setCurrent(media.getCurrentTime());
      }
      setScrubRatio(null);
    };
    root.addEventListener('pointermove', onMove, { capture: true, passive: false });
    root.addEventListener('pointerup', onUp, { capture: true });
    root.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      root.removeEventListener('pointermove', onMove, true);
      root.removeEventListener('pointerup', onUp, true);
      root.removeEventListener('pointercancel', onUp, true);
      if (seekRafRef.current) cancelAnimationFrame(seekRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seek helpers close over latest media via refs/state setters
  }, [media, trimStart, trimEnd]);

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.nativeEvent as any).stopImmediatePropagation?.();
    scrubbingRef.current = true;
    setScrubbing(true);
    onHoverChange?.(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    seekFromClientX(e.clientX);
  };

  const togglePlay = () => {
    if (!media || media.isDead()) return;
    if (media.isPaused()) media.play();
    else media.pause();
  };

  const toggleMute = () => {
    if (!media || media.isDead()) return;
    const next = !media.isMuted();
    media.setMuted(next);
    if (!next && media.getVolume() <= 0.01) media.setVolume(1);
  };

  const onVolumePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!media || media.isDead()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (r.bottom - e.clientY) / Math.max(1, r.height)));
    media.setMuted(t <= 0.01);
    media.setVolume(t);
  };

  const pad = EDGE_PAD * s;
  const gap = ITEM_GAP * s;
  const btn = 28 * s;
  const icon = 16 * s;
  const timeSize = 12 * s;
  const trackH = 36 * s;
  const rail = Math.max(4, 4 * s);
  const thumb = Math.max(14, 14 * s);
  // Thumb overhang so left/right of the rail keep equal inset from neighbors.
  const trackInset = thumb / 2;

  return (
    <div
      data-sel-toolbar
      data-video-playback-bar
      data-video-node-id={nodeId}
      className={cn(
        'flex items-center text-white transition-opacity duration-150',
        interactive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
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
        if (scrubbingRef.current) return;
        onHoverChange?.(false);
        setVolOpen(false);
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
        {formatTime(scrubRatio != null ? scrubRatio * playable : displayCurrent)}
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
