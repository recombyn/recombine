/**
 * Per-user liked inspiration cases (localStorage bridge for Me sync).
 * Documents load via plaza API.
 */

import type { OfficialCaseMeta } from '@/utils/officialCases';

export type LikedCaseItem = OfficialCaseMeta & {
  likedAt: number;
};

const PREFIX = 'recombyn-liked-cases-v1:';

function scopeKey(userId?: string | null): string {
  const id = (userId || '').trim();
  return `${PREFIX}${id || '__guest__'}`;
}

function isValidLiked(x: unknown): x is LikedCaseItem {
  if (!x || typeof x !== 'object') return false;
  const row = x as LikedCaseItem;
  return typeof row.id === 'string' && row.id.length > 0;
}

function safeParse(raw: string | null): LikedCaseItem[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as LikedCaseItem[];
    if (!Array.isArray(list)) return [];
    return list
      .filter(isValidLiked)
      .map((row) => ({
        ...row,
        source: 'plaza' as const,
        likedAt: Number(row.likedAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

export function loadLikedCases(userId?: string | null): LikedCaseItem[] {
  return safeParse(localStorage.getItem(scopeKey(userId))).sort(
    (a, b) => (b.likedAt || 0) - (a.likedAt || 0)
  );
}

export function saveLikedCases(items: LikedCaseItem[], userId?: string | null) {
  localStorage.setItem(scopeKey(userId), JSON.stringify(items.slice(0, 200)));
}

/** Clear local likes after migrating to GET /api/v1/me/liked. */
export function clearLikedCases(userId?: string | null) {
  try {
    localStorage.removeItem(scopeKey(userId));
  } catch {
    /* ignore */
  }
}

export function formatStatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
