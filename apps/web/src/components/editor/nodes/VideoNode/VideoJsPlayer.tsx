import { useEffect, useRef, useState, type CSSProperties, type ReactNode, memo } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { cn } from '@/utils/classnames';
import { imageSrcToFile, isOurStoredImageUrl } from '@/utils/uploadImage';
import VideoPlaybackBar, {
  videoPlaybackBarScale,
} from '@/components/editor/nodes/VideoNode/VideoPlaybackBar';
import './VideoJsPlayer.css';

/** Local `/api/v1/uploads/…` needs Bearer — `<video src>` cannot send it. */
function videoSrcNeedsAuthFetch(src: string): boolean {
  const s = String(src || '').trim();
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return false;
  return isOurStoredImageUrl(s);
}

/**
 * Resolve a canvas / upload video `src` into something the player can play.
 * Auth-gated uploads → blob URL; public / data / blob URLs pass through.
 * Keeps the last good URL while re-resolving so the player is not unmounted.
 */
export function usePlayableVideoSrc(src: string, uploadKey?: string | null): string {
  const [playSrc, setPlaySrc] = useState(() =>
    videoSrcNeedsAuthFetch(src) ? '' : String(src || '').trim()
  );
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    const s = String(src || '').trim();
    if (!s) {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      setPlaySrc('');
      return;
    }
    if (!videoSrcNeedsAuthFetch(s)) {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      setPlaySrc(s);
      return;
    }
    let cancelled = false;
    void imageSrcToFile(s, 'play.mp4', { uploadKey })
      .then((file) => {
        if (cancelled) return;
        const next = URL.createObjectURL(file);
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = next;
        setPlaySrc(next);
      })
      .catch((err) => {
        console.warn('[video] auth src resolve failed', err);
        // Keep previous playSrc on failure — blanking would flash/unmount the plate.
      });
    return () => {
      cancelled = true;
    };
  }, [src, uploadKey]);

  useEffect(
    () => () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    },
    []
  );

  return playSrc;
}

function guessSourceType(src: string): string | undefined {
  const s = src.toLowerCase();
  if (s.startsWith('data:video/')) {
    const m = /^data:(video\/[^;]+)/i.exec(src);
    return m?.[1];
  }
  if (s.startsWith('blob:')) return 'video/mp4';
  if (/\.webm(\?|#|$)/i.test(s)) return 'video/webm';
  if (/\.mov(\?|#|$)/i.test(s)) return 'video/mp4';
  if (/\.m4v(\?|#|$)/i.test(s)) return 'video/mp4';
  if (/\.mp4(\?|#|$)/i.test(s)) return 'video/mp4';
  if (s.includes('/api/v1/uploads/')) return 'video/mp4';
  return undefined;
}

export type VideoCropNorm = { x: number; y: number; w: number; h: number };

export type VideoJsPlayerProps = {
  src: string;
  poster?: string;
  className?: string;
  style?: CSSProperties;
  /** Fill parent box (canvas node). Default fluid for previews. */
  layout?: 'fill' | 'fluid';
  /**
   * `always` / `hover` — shared React playback bar.
   * `none` — no bar (caller may portal `VideoPlaybackBar`, e.g. canvas hover).
   */
  controlsMode?: 'always' | 'hover' | 'none';
  /** Force bar visible when `controlsMode === 'hover'`. */
  controlsVisible?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Keep playback inside [trimStart, trimEnd]. */
  trimStart?: number;
  trimEnd?: number;
  /** Normalized crop — applied to tech/poster only so the bar stays in-frame. */
  crop?: VideoCropNorm | null;
  flipX?: boolean;
  flipY?: boolean;
  /** When true, video surface ignores pointer (canvas selection). Bar stays clickable. */
  videoPointerNone?: boolean;
  onReady?: (player: Player) => void;
};

function cropCssVars(crop?: VideoCropNorm | null): CSSProperties | undefined {
  if (!crop || !(crop.w > 0) || !(crop.h > 0)) return undefined;
  return {
    ['--rcb-crop-left' as string]: `${(-crop.x / crop.w) * 100}%`,
    ['--rcb-crop-top' as string]: `${(-crop.y / crop.h) * 100}%`,
    ['--rcb-crop-w' as string]: `${(1 / crop.w) * 100}%`,
    ['--rcb-crop-h' as string]: `${(1 / crop.h) * 100}%`,
  };
}

/**
 * Shared Video.js player — canvas nodes, attachment hover preview, fullscreen.
 * Chrome uses `VideoPlaybackBar` (never Video.js control bar).
 */
function VideoJsPlayer({
  src,
  poster,
  className,
  style,
  layout = 'fluid',
  controlsMode = 'always',
  controlsVisible = false,
  autoplay = false,
  muted = false,
  loop = false,
  trimStart,
  trimEnd,
  crop,
  flipX = false,
  flipY = false,
  videoPointerNone = false,
  onReady,
}: VideoJsPlayerProps): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [shellHovered, setShellHovered] = useState(false);
  const [barScale, setBarScale] = useState(1);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  trimStartRef.current = trimStart;
  trimEndRef.current = trimEnd;

  const playable = String(src || '').trim();
  const cropVars = cropCssVars(crop);
  const hasCrop = Boolean(cropVars);
  const showBar = controlsMode !== 'none';
  const barVisible =
    controlsMode === 'always' ||
    (controlsMode === 'hover' && (controlsVisible || shellHovered));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !playable) return;
    if (!host.isConnected) return;

    const videoEl = document.createElement('video');
    videoEl.className = cn(
      'video-js vjs-big-play-centered',
      layout === 'fill' ? 'vjs-fill' : 'vjs-fluid'
    );
    videoEl.setAttribute('playsinline', 'true');
    host.appendChild(videoEl);

    const sourceType = guessSourceType(playable);
    const instance = videojs(videoEl, {
      controls: false,
      autoplay,
      muted,
      loop,
      preload: 'auto',
      poster: poster || undefined,
      fill: layout === 'fill',
      fluid: layout === 'fluid',
      playsinline: true,
      bigPlayButton: false,
      inactivityTimeout: 0,
      sources: [
        {
          src: playable,
          ...(sourceType ? { type: sourceType } : {}),
        },
      ],
    });
    playerRef.current = instance;

    const clampTrim = () => {
      const d = Number(instance.duration()) || 0;
      const hasStart = Number.isFinite(trimStartRef.current);
      const hasEnd = Number.isFinite(trimEndRef.current);
      if (!hasStart && !hasEnd) return;
      let start = hasStart ? Math.max(0, Number(trimStartRef.current)) : 0;
      let end = hasEnd ? Math.min(d || Number(trimEndRef.current), Number(trimEndRef.current)) : d;
      if (d > 0) {
        start = Math.max(0, Math.min(start, d));
        end = Math.max(0, Math.min(end, d));
      }
      if (end <= start) return;
      const t = Number(instance.currentTime()) || 0;
      if (t < start) instance.currentTime(start);
      else if (t >= end - 0.04) {
        if (instance.paused()) instance.currentTime(end);
        else instance.currentTime(start);
      }
    };

    instance.ready(() => {
      setPlayer(instance);
      onReadyRef.current?.(instance);
      clampTrim();
      if (autoplay) void instance.play()?.catch(() => undefined);
    });

    instance.on('timeupdate', clampTrim);
    instance.on('loadedmetadata', clampTrim);

    return () => {
      instance.off('timeupdate', clampTrim);
      instance.off('loadedmetadata', clampTrim);
      setPlayer(null);
      try {
        if (!instance.isDisposed()) instance.dispose();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      while (host.firstChild) host.removeChild(host.firstChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poster/muted toggles handled below
  }, [playable, layout]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || p.isDisposed()) return;
    p.muted(Boolean(muted));
  }, [muted]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || p.isDisposed()) return;
    if (poster) p.poster(poster);
  }, [poster]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || p.isDisposed()) return;
    p.autoplay(Boolean(autoplay));
    if (autoplay) void p.play()?.catch(() => undefined);
  }, [autoplay]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el || controlsMode === 'none') return;
    const sync = () => setBarScale(videoPlaybackBarScale(el.getBoundingClientRect().width));
    sync();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [controlsMode, playable]);

  if (!playable) {
    return (
      <div
        className={cn('flex items-center justify-center bg-black/80 text-[11px] text-white/60', className)}
        style={style}
      >
        …
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={cn(
        'rcb-videojs relative min-h-0 min-w-0 overflow-hidden',
        layout === 'fill' && 'h-full w-full',
        hasCrop && 'rcb-videojs--cropped',
        flipX && 'rcb-videojs--flip-x',
        flipY && 'rcb-videojs--flip-y',
        className
      )}
      style={{ ...cropVars, ...style }}
      onPointerEnter={() => {
        if (controlsMode === 'hover') setShellHovered(true);
      }}
      onPointerLeave={() => setShellHovered(false)}
      onPointerDown={(e) => {
        if (videoPointerNone) return;
        e.stopPropagation();
      }}
    >
      <div
        ref={hostRef}
        className={cn(
          'absolute inset-0 min-h-0 min-w-0',
          videoPointerNone && 'pointer-events-none'
        )}
      />
      {/* When video is pe-none, this layer makes the shell receive hover. */}
      {controlsMode === 'hover' && videoPointerNone ? (
        <div className="absolute inset-0 z-[1]" aria-hidden />
      ) : null}
      {showBar ? (
        <VideoPlaybackBar
          player={player}
          visible={barVisible}
          trimStart={trimStart}
          trimEnd={trimEnd}
          scale={barScale}
          className="absolute inset-x-0 bottom-0 z-[2]"
        />
      ) : null}
    </div>
  );
}

export default memo(VideoJsPlayer);
