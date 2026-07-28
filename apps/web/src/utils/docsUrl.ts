/**
 * External docs site (help guides + standalone legal). Not served by the main app.
 *
 * - Production: https://docs.recombyn.com (or VITE_DOCS_URL)
 * - Local app (localhost / 127.0.0.1): local docs on :5175 unless VITE_DOCS_URL
 *   already points at a local origin (custom port).
 */

declare const __DOCS_URL__: string;

const PROD_DOCS = 'https://docs.recombyn.com';
const LOCAL_DOCS_PORT = 5175;

function bakedOrigin(): string {
  if (typeof __DOCS_URL__ === 'undefined' || !__DOCS_URL__) return '';
  return String(__DOCS_URL__).replace(/\/$/, '');
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isLocalOrigin(origin: string): boolean {
  try {
    return isLocalHost(new URL(origin).hostname);
  } catch {
    return /localhost|127\.0\.0\.1/.test(origin);
  }
}

export function docsOrigin(): string {
  const baked = bakedOrigin();

  if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) {
    // Explicit local override (e.g. http://127.0.0.1:5180) wins.
    if (baked && isLocalOrigin(baked)) return baked;
    return `${window.location.protocol}//${window.location.hostname}:${LOCAL_DOCS_PORT}`;
  }

  return baked || PROD_DOCS;
}

/** @deprecated Prefer docsOrigin() — kept for existing imports. */
export const DOCS_ORIGIN = bakedOrigin() || PROD_DOCS;

export function docsUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${docsOrigin()}${p}`;
}
