/**
 * Post-login / settings return path lives in the URL (`?from=...`), not Redux / sessionStorage.
 */

const BLOCKED_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/account',
  '/about',
  '/terms',
  '/privacy',
];

/** Same-origin app path only; falls back to /home. */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/home';
  let path = raw.trim();
  try {
    // Allow accidental absolute same-origin URLs.
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      if (typeof window !== 'undefined' && u.origin !== window.location.origin) return '/home';
      path = u.pathname + u.search + u.hash;
    }
  } catch {
    return '/home';
  }
  if (!path.startsWith('/') || path.startsWith('//')) return '/home';
  const pathname = path.split('?')[0].split('#')[0];
  if (BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return '/home';
  }
  return path || '/home';
}

/** `/login` or `/login?from=/editor/...` */
export function buildLoginUrl(from?: string | null): string {
  const dest = sanitizeReturnTo(from);
  if (dest === '/home') return '/login';
  return `/login?from=${encodeURIComponent(dest)}`;
}

/**
 * Append `?from=` (or `&from=`) so settings / about can return to the page the user left.
 * Omits the param when destination is already `/home`.
 */
export function withReturnTo(path: string, from?: string | null): string {
  const dest = sanitizeReturnTo(from);
  if (dest === '/home') return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}from=${encodeURIComponent(dest)}`;
}

export function readReturnToParam(
  search: string | URLSearchParams | null | undefined
): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search instanceof URLSearchParams
        ? search
        : null;
  return sanitizeReturnTo(params?.get('from'));
}
