import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { finishImageProcess } from '@/store/modules/editor';
import { upscaleImageDataUrl } from '@/store/scene/sceneDocument';

const PROCESS_MS = 3000;

/** Auto-complete spawned image process jobs after a short loading period.
 * Skips PDF/DOCX import placeholders (finished by the import flow).
 * Upscale: raises bitmap resolution only — node width/height stay the same. */
export default function ImageProcessWatcher() {
  const dispatch = useDispatch();
  const pendingId = useSelector((s: any) => s.editor.pendingImageProcessId as string | null);
  const document = useSelector((s: any) => s.editor.document);

  useEffect(() => {
    if (!pendingId) return undefined;
    const node = document?.deltaSetLike?.[pendingId];
    const kind = node?.attrs?.processKind;
    if (kind === 'import') return undefined;

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        if (kind === 'upscale') {
          const src = String(node?.attrs?.src || '');
          const tw = Number(node?.attrs?.processTargetWidth) || 2896;
          const th = Number(node?.attrs?.processTargetHeight) || 4096;
          try {
            const nextSrc = src ? await upscaleImageDataUrl(src, tw, th) : '';
            if (cancelled) return;
            dispatch(
              finishImageProcess({
                nodeId: pendingId,
                ...(nextSrc ? { src: nextSrc } : {}),
              })
            );
            return;
          } catch {
            if (cancelled) return;
            dispatch(finishImageProcess({ nodeId: pendingId }));
            return;
          }
        }
        if (cancelled) return;
        dispatch(finishImageProcess({ nodeId: pendingId }));
      })();
    }, PROCESS_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pendingId, dispatch, document]);

  return null;
}
