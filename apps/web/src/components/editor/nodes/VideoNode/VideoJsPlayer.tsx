import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import { cn } from '@/utils/classnames';
import { imageSrcToFile, isOurStoredImageUrl } from '@/utils/uploadImage';
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
 */
export function usePlayableVideoSrc(src: string, uploadKey?: string | null): string {
  const [playSrc, setPlaySrc] = useState(() =>
    videoSrcNeedsAuthFetch(src) ? '' : String(src || '').trim()
  );

  useEffect(() => {
    const s = String(src || '').trim();
    if (!s) {
      setPlaySrc('');
      return;
    }
    if (!videoSrcNeedsAuthFetch(s)) {
      setPlaySrc(s);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    setPlaySrc('');
    void imageSrcToFile(s, 'play.mp4', { uploadKey })
      .then((file) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(file);
        setPlaySrc(blobUrl);
      })
      .catch((err) => {
        console.warn('[video] auth src resolve failed', err);
        if (!cancelled) setPlaySrc('');
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src, uploadKey]);

  return playSrc;
}

function guessSourceType(src: string): string | undefined {
  const s = src.toLowerCase();
  if (s.startsWith('data:video/')) {
    const m = /^data:(video\/[^;]+)/i.exec(src);
    return m?.[1];
  }
  // Auth-resolved uploads become blob: — browsers often need an explicit type.
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
   * `always` — Video.js control bar (upload preview / fullscreen / chat).
   * `hover` — Video.js bar toggled by `controlsVisible`.
   * `none` — no Video.js chrome (canvas uses a separate portal bar).
   */
  controlsMode?: 'always' | 'hover' | 'none';
  /** Force control bar visible when `controlsMode === 'hover'`. */
  controlsVisible?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Keep playback inside [trimStart, trimEnd]. */
  trimStart?: number;
  trimEnd?: number;
  /** Normalized crop — applied to tech/poster only so the control bar stays in-frame. */
  crop?: VideoCropNorm | null;
  flipX?: boolean;
  flipY?: boolean;
  /** When true, video surface ignores pointer (canvas selection). Control bar stays clickable. */
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
 * Video element is created imperatively so `player.dispose()` does not fight React DOM.
 */
export default function VideoJsPlayer({
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
  const playerRef = useRef<Player | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  trimStartRef.current = trimStart;
  trimEndRef.current = trimEnd;
  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;

  const playable = String(src || '').trim();
  const cropVars = cropCssVars(crop);
  const hasCrop = Boolean(cropVars);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !playable) return;
    // Wait until the host is actually in the document (portals / conditional mount).
    if (!host.isConnected) return;

    const videoEl = document.createElement('video');
    videoEl.className = cn(
      'video-js vjs-big-play-centered',
      layout === 'fill' ? 'vjs-fill' : 'vjs-fluid'
    );
    videoEl.setAttribute('playsinline', 'true');
    host.appendChild(videoEl);

    const sourceType = guessSourceType(playable);
    const showChrome = controlsMode !== 'none';
    const player = videojs(videoEl, {
      controls: showChrome,
      autoplay,
      muted,
      loop,
      preload: 'auto',
      poster: poster || undefined,
      fill: layout === 'fill',
      fluid: layout === 'fluid',
      playsinline: true,
      bigPlayButton: showChrome,
      inactivityTimeout: controlsMode === 'hover' ? 0 : showChrome ? 3000 : 0,
      ...(showChrome
        ? {
            controlBar: {
              children: [
                'playToggle',
                'currentTimeDisplay',
                'progressControl',
                'volumePanel',
              ],
              volumePanel: { inline: false },
              pictureInPictureToggle: false,
              remainingTimeDisplay: false,
              durationDisplay: false,
              fullscreenToggle: false,
            },
          }
        : {}),
      sources: [
        {
          src: playable,
          ...(sourceType ? { type: sourceType } : {}),
        },
      ],
    });
    playerRef.current = player;

    const clampTrim = () => {
      const d = Number(player.duration()) || 0;
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
      const t = Number(player.currentTime()) || 0;
      if (t < start) player.currentTime(start);
      else if (t >= end - 0.04) {
        if (player.paused()) player.currentTime(end);
        else player.currentTime(start);
      }
    };

    player.ready(() => {
      onReadyRef.current?.(player);
      if (controlsMode === 'hover') {
        player.userActive(Boolean(controlsVisibleRef.current));
      }
      clampTrim();
      if (autoplay) void player.play()?.catch(() => undefined);
    });

    player.on('timeupdate', clampTrim);
    player.on('loadedmetadata', clampTrim);

    return () => {
      player.off('timeupdate', clampTrim);
      player.off('loadedmetadata', clampTrim);
      try {
        if (!player.isDisposed()) player.dispose();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      // dispose removes the player DOM; clear any leftover nodes React does not own.
      while (host.firstChild) host.removeChild(host.firstChild);
    };
    // Recreate when the playable URL or layout shell changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poster/muted toggles handled below
  }, [playable, layout, controlsMode]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    if (controlsMode !== 'hover') return;
    player.userActive(Boolean(controlsVisible));
    try {
      (player as any).options_.inactivityTimeout = controlsVisible ? 0 : 2000;
    } catch {
      /* ignore */
    }
  }, [controlsVisible, controlsMode]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    player.muted(Boolean(muted));
  }, [muted]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    if (poster) player.poster(poster);
  }, [poster]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    player.autoplay(Boolean(autoplay));
    if (autoplay) void player.play()?.catch(() => undefined);
  }, [autoplay]);

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
      ref={hostRef}
      className={cn(
        'rcb-videojs relative min-h-0 min-w-0 overflow-hidden',
        layout === 'fill' && 'h-full w-full',
        controlsMode === 'hover' && 'rcb-videojs--hover-controls',
        controlsMode === 'hover' && controlsVisible && 'rcb-videojs--controls-on',
        controlsMode === 'none' && 'rcb-videojs--no-chrome',
        hasCrop && 'rcb-videojs--cropped',
        flipX && 'rcb-videojs--flip-x',
        flipY && 'rcb-videojs--flip-y',
        videoPointerNone && 'pointer-events-none rcb-videojs--video-pe-none',
        className
      )}
      style={{ ...cropVars, ...style }}
      onPointerDown={(e) => {
        if (videoPointerNone) return;
        e.stopPropagation();
      }}
    />
  );
}
