import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowsPointingOut, HiOutlineXMark } from 'react-icons/hi2';
import Tooltip from '@/components/base/tooltip';
import PreviewToolbar from '@/components/base/image/PreviewToolbar';
import VideoJsPlayer, {
  usePlayableVideoSrc,
  type VideoCropNorm,
} from '@/components/editor/nodes/VideoNode/VideoJsPlayer';
import { videoToolBtn } from './videoToolbarShared';

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
/** Same default box as Image lightbox (`Image.tsx` preview). */
const PREVIEW_MAX_PX = 700;

function readCrop(attrs: {
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}): VideoCropNorm | null {
  const x = Number(attrs.cropX);
  const y = Number(attrs.cropY);
  const w = Number(attrs.cropW);
  const h = Number(attrs.cropH);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return null;
  }
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

/**
 * Fullscreen video preview — same VideoJsPlayer + same default size as image lightbox
 * (max 700×700). Zoom changes width/height (no CSS transform on the video ancestor).
 */
export default function VideoFullscreenPreviewButton({
  src,
  poster,
  uploadKey,
  aspectWidth,
  aspectHeight,
  cropX,
  cropY,
  cropW,
  cropH,
  trimStart,
  trimEnd,
  flipX,
  flipY,
}: {
  src?: string | null;
  poster?: string | null;
  uploadKey?: string | null;
  /** Node display size — drives lightbox aspect (not 16:9 default). */
  aspectWidth?: number;
  aspectHeight?: number;
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  trimStart?: number;
  trimEnd?: number;
  flipX?: boolean;
  flipY?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const url = String(src || '').trim();
  const playSrc = usePlayableVideoSrc(url, uploadKey);
  const crop = readCrop({ cropX, cropY, cropW, cropH });
  const posterUrl = String(poster || '').trim() || undefined;

  const aw = Math.max(1, Number(aspectWidth) || 9);
  const ah = Math.max(1, Number(aspectHeight) || 16);

  const close = useCallback(() => {
    setOpen(false);
    setScale(1);
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s * 1.2, MAX_SCALE));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(s / 1.2, MIN_SCALE));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta)));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [open, close]);

  if (!url) return null;

  // Fit inside 700×700 like image preview, then apply zoom via size (not transform).
  const fit = Math.min(PREVIEW_MAX_PX / aw, PREVIEW_MAX_PX / ah);
  const frameStyle: CSSProperties = {
    width: aw * fit * scale,
    height: ah * fit * scale,
    maxWidth: 'min(90vw, 700px)',
    maxHeight: 'min(90vh, 700px)',
  };

  return (
    <>
      <Tooltip tip={t('editor.videoToolbar.fullscreen', { defaultValue: '全屏' })} placement="top">
        <button
          type="button"
          aria-label={t('editor.videoToolbar.fullscreen', { defaultValue: '全屏' })}
          className={videoToolBtn}
          onClick={() => setOpen(true)}
        >
          <HiOutlineArrowsPointingOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        </button>
      </Tooltip>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[2500]"
              onClick={close}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation?.();
              }}
            >
              <div className="fixed inset-0 bg-black/50" />
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={close}
              >
                <HiOutlineXMark className="h-5 w-5" />
              </button>
              <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
                <div
                  className="pointer-events-auto relative overflow-hidden rounded-lg bg-black shadow-2xl"
                  style={frameStyle}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute inset-0 overflow-hidden">
                    {playSrc ? (
                      <VideoJsPlayer
                        src={playSrc}
                        poster={posterUrl}
                        layout="fill"
                        controlsMode="always"
                        autoplay
                        muted
                        crop={crop}
                        flipX={flipX === true}
                        flipY={flipY === true}
                        trimStart={Number.isFinite(Number(trimStart)) ? Number(trimStart) : undefined}
                        trimEnd={Number.isFinite(Number(trimEnd)) ? Number(trimEnd) : undefined}
                        className="absolute inset-0 h-full w-full"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[12px] text-white/60">
                        …
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <PreviewToolbar scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
