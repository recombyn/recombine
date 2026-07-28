import { cn } from '@/utils/classnames';

/** Shared project / plaza cover frame — fixed 170px tall. */
export const PROJECT_THUMB_HEIGHT = 170;

export const projectThumbFrameClass = (extra?: string) =>
  cn(
    'relative h-[170px] w-full overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)]',
    'shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition',
    'group-hover:shadow-[0_8px_22px_rgba(15,23,42,0.1)]',
    extra
  );

/** Inner cover layer — scale on parent `.group` hover; frame stays fixed (overflow clip). */
export const projectThumbZoomLayerClass =
  'h-full w-full origin-center transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.06]';

const LEGACY_CUSTOM_THUMB_KEY = 'recombyn:custom-project-thumbs';

/** Drop the old sticky localStorage set that blocked auto covers forever. */
export function purgeLegacyCustomThumbCache(): void {
  try {
    localStorage.removeItem(LEGACY_CUSTOM_THUMB_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Pin upload/API thumb URLs to the current page origin (vite proxy), and
 * turn bare storage keys into `/api/v1/uploads/files/…` paths.
 * Public CDN / COS hosts are left unchanged.
 */
export function toBrowserThumbUrl(url: string | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  if (typeof window !== 'undefined' && /^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith('/api/v1/uploads/')) {
        return `${window.location.origin}${u.pathname}${u.search}${u.hash}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }

  if (raw.startsWith('/')) return raw;

  // Local storage.url_for returns bare keys (projects/…, uploads/…).
  if (/^(projects|uploads|assets|font-tasks)\//.test(raw)) {
    return `/api/v1/uploads/files/${raw}`;
  }
  return raw;
}

/**
 * Optional cache-bust for legacy fixed keys (`thumb.webp`).
 * New uploads use `thumb-{ms}.webp` — return as-is (no `?v=` clutter).
 */
export function withThumbCacheBust(
  url: string | null | undefined,
  version?: number | string | null
): string {
  const raw = toBrowserThumbUrl(url);
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  // Content-addressed / timestamped object names do not need query busting.
  if (/\/thumb-\d+\.(webp|png|jpe?g)(?:\?|$)/i.test(raw)) {
    return raw.replace(/[?&]v=[^&]*/g, '').replace(/[?&]$/, '').replace(/\?&/, '?');
  }
  const stripped = raw
    .replace(/([?&])v=[^&]*/g, '$1')
    .replace(/([?&])_=[^&]*/g, '$1')
    .replace(/\?&/g, '?')
    .replace(/[?&]$/g, '')
    .replace(/&&/g, '&');
  const v =
    version != null && String(version).trim() !== ''
      ? String(version).trim()
      : 'fresh';
  return stripped.includes('?')
    ? `${stripped}&v=${encodeURIComponent(v)}`
    : `${stripped}?v=${encodeURIComponent(v)}`;
}

/** Normalize project `thumbnailUrl` (string | string[]) with optional cache-bust. */
export function normalizeProjectThumbnailUrls(
  input: string | string[] | null | undefined,
  version?: number | string | null
): string[] {
  const list = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? [input]
      : [];
  return list
    .map((u) => withThumbCacheBust(u, version))
    .filter(Boolean)
    .slice(0, 4);
}
