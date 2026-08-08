/** Custom MIME for dragging agent chat gallery images onto the canvas. */
export const CHAT_IMAGE_DRAG_MIME = 'application/x-recombyn-chat-image';

/** Hosted library assets (image / video / audio) from the Assets dock. */
export const MEDIA_ASSET_DRAG_MIME = 'application/x-recombyn-media-asset';

export type MediaAssetDragPayload = {
  kind: 'image' | 'video' | 'audio';
  src: string;
  uploadKey?: string | null;
  width?: number | null;
  height?: number | null;
  prompt?: string | null;
  name?: string | null;
  duration?: number | null;
};

function dataTransferHasType(dt: DataTransfer, mime: string): boolean {
  if (dt.types?.includes?.(mime)) return true;
  // Some browsers only expose types as a DOMStringList without includes.
  try {
    for (let i = 0; i < dt.types.length; i += 1) {
      if (dt.types[i] === mime) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function setChatImageDragData(dt: DataTransfer, src: string): void {
  const url = String(src || '').trim();
  if (!url) return;
  dt.setData(CHAT_IMAGE_DRAG_MIME, url);
  dt.setData('text/uri-list', url);
  dt.setData('text/plain', url);
  dt.effectAllowed = 'copy';
}

export function readChatImageDragUrl(dt: DataTransfer | null | undefined): string | null {
  if (!dt) return null;
  const fromMime = String(dt.getData(CHAT_IMAGE_DRAG_MIME) || '').trim();
  if (fromMime) return fromMime;
  const uri = String(dt.getData('text/uri-list') || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (uri && (/^https?:\/\//i.test(uri) || uri.startsWith('data:') || uri.startsWith('blob:'))) {
    return uri;
  }
  const plain = String(dt.getData('text/plain') || '').trim();
  if (plain && (/^https?:\/\//i.test(plain) || plain.startsWith('data:') || plain.startsWith('blob:'))) {
    return plain;
  }
  return null;
}

export function dataTransferHasChatImage(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return dataTransferHasType(dt, CHAT_IMAGE_DRAG_MIME);
}

export function setMediaAssetDragData(
  dt: DataTransfer,
  payload: MediaAssetDragPayload
): void {
  const src = String(payload.src || '').trim();
  const kind = payload.kind;
  if (!src || (kind !== 'image' && kind !== 'video' && kind !== 'audio')) return;
  dt.setData(
    MEDIA_ASSET_DRAG_MIME,
    JSON.stringify({
      kind,
      src,
      uploadKey: payload.uploadKey || undefined,
      width: payload.width || undefined,
      height: payload.height || undefined,
      prompt: payload.prompt || undefined,
      name: payload.name || undefined,
      duration: payload.duration || undefined,
    })
  );
  dt.setData('text/uri-list', src);
  dt.setData('text/plain', src);
  dt.effectAllowed = 'copy';
}

export function readMediaAssetDragPayload(
  dt: DataTransfer | null | undefined
): MediaAssetDragPayload | null {
  if (!dt) return null;
  const raw = String(dt.getData(MEDIA_ASSET_DRAG_MIME) || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MediaAssetDragPayload;
    const src = String(parsed?.src || '').trim();
    const kind = String(parsed?.kind || '').trim();
    if (!src || (kind !== 'image' && kind !== 'video' && kind !== 'audio')) return null;
    return {
      kind,
      src,
      uploadKey: parsed.uploadKey,
      width: parsed.width,
      height: parsed.height,
      prompt: parsed.prompt,
      name: parsed.name,
      duration: parsed.duration,
    };
  } catch {
    return null;
  }
}

export function dataTransferHasMediaAsset(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return dataTransferHasType(dt, MEDIA_ASSET_DRAG_MIME);
}
