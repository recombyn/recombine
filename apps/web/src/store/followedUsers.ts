/**
 * Per-user followed creators (localStorage) — plaza / inspiration.
 */

export type FollowedUser = {
  id: string;
  name: string;
  avatar?: string | null;
  followedAt: number;
};

const PREFIX = 'recombyn-followed-users-v1:';

function scopeKey(viewerId?: string | null): string {
  const id = (viewerId || '').trim();
  return `${PREFIX}${id || '__guest__'}`;
}

function isValid(x: unknown): x is FollowedUser {
  if (!x || typeof x !== 'object') return false;
  const row = x as FollowedUser;
  return typeof row.id === 'string' && row.id.length > 0 && typeof row.name === 'string';
}

function safeParse(raw: string | null): FollowedUser[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as FollowedUser[];
    if (!Array.isArray(list)) return [];
    return list.filter(isValid);
  } catch {
    return [];
  }
}

export function loadFollowedUsers(viewerId?: string | null): FollowedUser[] {
  return safeParse(localStorage.getItem(scopeKey(viewerId))).sort(
    (a, b) => (b.followedAt || 0) - (a.followedAt || 0)
  );
}

export function saveFollowedUsers(items: FollowedUser[], viewerId?: string | null) {
  localStorage.setItem(scopeKey(viewerId), JSON.stringify(items.slice(0, 200)));
}

export function isFollowingUser(authorId: string, viewerId?: string | null): boolean {
  return loadFollowedUsers(viewerId).some((x) => x.id === authorId);
}

export function toggleFollowUser(
  author: { id: string; name: string; avatar?: string | null },
  viewerId?: string | null
): { following: boolean; list: FollowedUser[] } {
  const prev = loadFollowedUsers(viewerId);
  const exists = prev.some((x) => x.id === author.id);
  const next = exists
    ? prev.filter((x) => x.id !== author.id)
    : [{ ...author, followedAt: Date.now() }, ...prev];
  saveFollowedUsers(next, viewerId);
  return { following: !exists, list: next };
}
