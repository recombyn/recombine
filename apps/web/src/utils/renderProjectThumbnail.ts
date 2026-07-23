/**
 * Rasterize a project artboard into a small PNG data URL for list cards / cloud sync.
 */

import { createSvgBoard, loadSceneOntoSvg } from '@/components/rcb/scene/sceneToSvg';
import {
  coverDocumentHasContent,
  extractPlazaCoverDocument,
} from '@/utils/plazaCover';

const MAX_EDGE = 480;

function paperBackground(document: any): string {
  const frame = Array.isArray(document?.frames) ? document.frames[0] : null;
  const fromFrame = String(frame?.backgroundColor || '').trim();
  if (fromFrame && fromFrame !== 'none' && fromFrame !== 'transparent') return fromFrame;
  const fromDoc = String(document?.backgroundColor || '').trim();
  if (fromDoc && fromDoc !== 'none' && fromDoc !== 'transparent') return fromDoc;
  return '#ffffff';
}

/** Build a centered, content-fitted PNG for project list thumbnails. */
export async function renderProjectThumbnail(document: unknown): Promise<string | null> {
  if (!document || typeof document !== 'object') return null;
  const cover = extractPlazaCoverDocument(document, { contentFit: true });
  if (!cover || !coverDocumentHasContent(cover)) return null;

  const doc = cover as {
    width?: number;
    height?: number;
    frames?: Array<{ width?: number; height?: number }>;
  };
  const frame = Array.isArray(doc.frames) ? doc.frames[0] : null;
  const docW = Math.max(1, Math.round(Number(frame?.width || doc.width) || 794));
  const docH = Math.max(1, Math.round(Number(frame?.height || doc.height) || 1123));
  const scale = Math.min(1, MAX_EDGE / Math.max(docW, docH));
  const outW = Math.max(32, Math.round(docW * scale));
  const outH = Math.max(32, Math.round(docH * scale));
  const bg = paperBackground(cover);

  const host = window.document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  window.document.body.appendChild(host);

  try {
    const previewDoc = {
      ...(cover as object),
      width: docW,
      height: docH,
      backgroundColor: bg,
      backgroundFillType: 'solid',
    };
    const { root, layer } = createSvgBoard(host, docW, docH);
    await loadSceneOntoSvg(root, layer, previewDoc);

    const xml = new XMLSerializer().serializeToString(root);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('thumb_raster_failed'));
        el.src = url;
      });
      const canvas = window.document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  } finally {
    host.remove();
  }
}
