import { useState, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowDownTray } from 'react-icons/hi2';
import { message, Tooltip } from '@/components/base';
import { imageSrcToFile } from '@/utils/uploadImage';
import { cn } from '@/utils/classnames';
import { videoToolBtn } from './videoToolbarShared';

type CropFractions = { x: number; y: number; w: number; h: number };

function readCrop(attrs: {
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
}): CropFractions | null {
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
  // Full-frame crop → treat as no crop.
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

function pickRecorderMime(): { mime: string; ext: string } {
  const candidates: { mime: string; ext: string }[] = [
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4', ext: 'mp4' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      return c;
    }
  }
  return { mime: 'video/webm', ext: 'webm' };
}

function waitEvent(el: HTMLMediaElement, type: string) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('media error'));
    };
    const cleanup = () => {
      el.removeEventListener(type, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(type, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

/**
 * Re-encode display crop + flip (+ optional trim) via canvas + MediaRecorder.
 * Crops are fractions of the source frame (same as node attrs).
 */
export async function exportCroppedVideoBlob(opts: {
  file: File;
  crop: CropFractions | null;
  flipX?: boolean;
  flipY?: boolean;
  trimStart?: number;
  trimEnd?: number;
}): Promise<{ blob: Blob; ext: string }> {
  const objectUrl = URL.createObjectURL(opts.file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await waitEvent(video, 'loadedmetadata');
    if (video.readyState < 2) {
      video.load();
      await waitEvent(video, 'loadeddata');
    }

    const duration = Number(video.duration) || 0;
    let start = Number.isFinite(opts.trimStart) ? Math.max(0, Number(opts.trimStart)) : 0;
    let end =
      Number.isFinite(opts.trimEnd) && Number(opts.trimEnd) > 0
        ? Math.min(duration, Number(opts.trimEnd))
        : duration;
    if (!duration || end <= start + 0.05) {
      start = 0;
      end = duration;
    }

    const vw = Math.max(1, video.videoWidth || 1);
    const vh = Math.max(1, video.videoHeight || 1);
    const crop = opts.crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.max(0, Math.min(vw - 1, crop.x * vw));
    const sy = Math.max(0, Math.min(vh - 1, crop.y * vh));
    const sw = Math.max(2, Math.min(vw - sx, crop.w * vw));
    const sh = Math.max(2, Math.min(vh - sy, crop.h * vh));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(sw));
    canvas.height = Math.max(2, Math.round(sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unsupported');

    const canvasStream = canvas.captureStream(30);
    // Prefer live audio from the playing element when the browser allows it.
    try {
      const mediaStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      mediaStream?.getAudioTracks().forEach((track) => {
        canvasStream.addTrack(track);
      });
    } catch {
      /* silent video export is still useful */
    }

    const { mime, ext } = pickRecorderMime();
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(canvasStream, { mimeType: mime });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('recorder error'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    video.currentTime = start;
    await waitEvent(video, 'seeked');

    recorder.start(200);
    await video.play();

    await new Promise<void>((resolve, reject) => {
      let stopped = false;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        try {
          video.pause();
        } catch {
          /* ignore */
        }
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          /* ignore */
        }
        resolve();
      };

      const flipX = opts.flipX === true;
      const flipY = opts.flipY === true;
      const paint = () => {
        if (stopped) return;
        try {
          ctx.save();
          if (flipX || flipY) {
            ctx.translate(flipX ? canvas.width : 0, flipY ? canvas.height : 0);
            ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
          }
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } catch (err) {
          reject(err instanceof Error ? err : new Error('draw failed'));
          finish();
          return;
        }
        if (video.ended || video.currentTime >= end - 0.04) {
          finish();
          return;
        }
        const rvfc = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback;
        if (typeof rvfc === 'function') rvfc.call(video, paint);
        else requestAnimationFrame(paint);
      };

      video.addEventListener(
        'ended',
        () => {
          finish();
        },
        { once: true }
      );
      paint();
    });

    const blob = await done;
    if (!blob.size) throw new Error('empty export');
    return { blob, ext };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function baseName(name?: string) {
  return (name || 'video').replace(/\.[^.]+$/, '') || 'video';
}

/** Download selected video — applies crop/flip/trim when present (re-encode). */
function VideoDownloadButton({
  src,
  name,
  uploadKey,
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
  name?: string;
  uploadKey?: string | null;
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
  const [busy, setBusy] = useState(false);
  const url = String(src || '').trim();
  if (!url) return null;

  const crop = readCrop({ cropX, cropY, cropW, cropH });
  const mirroredX = flipX === true;
  const mirroredY = flipY === true;
  const hasFlip = mirroredX || mirroredY;
  const hasTrim =
    (Number.isFinite(trimStart) && Number(trimStart) > 0) ||
    (Number.isFinite(trimEnd) && Number(trimEnd) > 0);
  const needsExport = Boolean(crop) || hasTrim || hasFlip;

  const onDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await imageSrcToFile(url, `${baseName(name)}.mp4`, {
        uploadKey: uploadKey || null,
      });

      // Unedited → original bytes.
      if (!needsExport) {
        downloadBlob(file, `${baseName(name)}.mp4`);
        return;
      }

      const hideLoading = message.loading(
        t('editor.videoToolbar.exporting', { defaultValue: '正在导出视频…' }),
        0
      );
      try {
        const { blob, ext } = await exportCroppedVideoBlob({
          file,
          crop,
          flipX: mirroredX,
          flipY: mirroredY,
          trimStart,
          trimEnd,
        });
        hideLoading();
        downloadBlob(blob, `${baseName(name)}-edit.${ext}`);
      } catch (exportErr) {
        hideLoading();
        throw exportErr;
      }
    } catch (err) {
      console.warn('[video-download]', err);
      // Fall back to original file so download still works if re-encode fails.
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        downloadBlob(blob, `${baseName(name)}.mp4`);
        message.warning(
          t('editor.videoToolbar.exportFallback', {
            defaultValue: '裁剪导出失败，已下载原视频',
          })
        );
      } catch {
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          message.error(t('editor.videoToolbar.downloadFail', { defaultValue: '下载失败' }));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip tip={t('editor.videoToolbar.download', { defaultValue: '下载' })} placement="top">
      <button
        type="button"
        aria-label={t('editor.videoToolbar.download', { defaultValue: '下载' })}
        disabled={busy}
        className={cn(videoToolBtn, busy && 'opacity-50')}
        onClick={() => void onDownload()}
      >
        <HiOutlineArrowDownTray className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}

export default memo(VideoDownloadButton);
