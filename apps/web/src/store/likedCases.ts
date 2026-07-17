/**
 * Per-user liked inspiration cases (localStorage).
 */

import type { OfficialCaseMeta } from '@/cases/officialCases';

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
  if (typeof row.id !== 'string') return false;
  // Official cases need a file path; plaza posts are identified by source/id.
  if (row.source === 'plaza') return true;
  return typeof row.file === 'string' && row.file.length > 0;
}

function safeParse(raw: string | null): LikedCaseItem[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as LikedCaseItem[];
    if (!Array.isArray(list)) return [];
    return list.filter(isValidLiked);
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

export function isCaseLiked(caseId: string, userId?: string | null): boolean {
  return loadLikedCases(userId).some((x) => x.id === caseId);
}

export function toggleLikedCase(
  meta: OfficialCaseMeta,
  userId?: string | null
): { liked: boolean; list: LikedCaseItem[] } {
  const prev = loadLikedCases(userId);
  const exists = prev.some((x) => x.id === meta.id);
  const next = exists
    ? prev.filter((x) => x.id !== meta.id)
    : [
        {
          ...meta,
          likedAt: Date.now(),
        },
        ...prev,
      ];
  saveLikedCases(next, userId);
  return { liked: !exists, list: next };
}

/** Deterministic display seed for view / like counts. */
export function seedStat(id: string, min: number, span: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return min + (h >>> 0) % Math.max(1, span);
}

export function formatStatCount(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
