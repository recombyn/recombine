/** Hardcoded bootstrap admin — mirrors apps/api/api/v1/auth.py */
export const SUPER_ADMIN_EMAIL = 'admin@recombyn.com';
export const SUPER_ADMIN_ID = 'user_super_admin';

export function isSuperAdmin(user?: { email?: string | null; id?: string | null } | null) {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  if (email === SUPER_ADMIN_EMAIL) return true;
  return (user.id || '') === SUPER_ADMIN_ID;
}
