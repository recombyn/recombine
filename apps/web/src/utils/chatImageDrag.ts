/** Custom MIME for dragging agent chat gallery images onto the canvas. */
export const CHAT_IMAGE_DRAG_MIME = 'application/x-recombyn-chat-image';

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
  if (dt.types?.includes?.(CHAT_IMAGE_DRAG_MIME)) return true;
  // Some browsers only expose types as a DOMStringList without includes.
  try {
    for (let i = 0; i < dt.types.length; i += 1) {
      if (dt.types[i] === CHAT_IMAGE_DRAG_MIME) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
