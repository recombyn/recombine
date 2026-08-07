import { useEffect, memo } from 'react';
import { useDispatch } from 'react-redux';
import { getMe, loginDesktopLocal } from '@/apis/auth';
import { fetchWallet } from '@/apis/wallet';
import AppRouter from '@/router';
import { logout, setSession, clearSessionCaches } from '@/store/modules/auth';
import { clearProjectsLibrary } from '@/store/modules/editor';
import { clearWallet } from '@/store/modules/wallet';
import type { LedgerEntry } from '@/utils/wallet';
import { syncFromServer } from '@/store/modules/wallet';
import { getDesktopMode } from '@/utils/apiBase';
import { getToken, setToken } from '@/utils/token';

function applySessionUser(
  dispatch: ReturnType<typeof useDispatch>,
  user: {
    id?: string;
    email: string;
    name: string;
    avatar?: string | null;
    provider: string;
    bio?: string | null;
    role?: string;
  },
  token?: string
) {
  dispatch(
    setSession({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
        bio: user.bio,
        role: user.role,
      },
      token,
    })
  );
}

function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    const onUnauthorized = () => {
      dispatch(logout());
      dispatch(clearWallet());
      dispatch(clearProjectsLibrary());
      clearSessionCaches();
    };
    window.addEventListener('recombine:auth-unauthorized', onUnauthorized);
    return () => window.removeEventListener('recombine:auth-unauthorized', onUnauthorized);
  }, [dispatch]);

  // Boot: desktop-local auto-login as OS user; then refresh me + wallet.
  useEffect(() => {
    let cancelled = false;

    async function refreshWallet() {
      if (!getToken()) return;
      try {
        const res = await fetchWallet();
        if (cancelled || !getToken()) return;
        dispatch(
          syncFromServer({
            tokens: res.tokens,
            planId: res.planId,
            planExpiresAt: res.planExpiresAt ?? null,
            planLocked: Boolean(res.planLocked),
            ledger: (res.ledger || []) as LedgerEntry[],
          })
        );
      } catch {
        /* ignore */
      }
    }

    async function refreshMe() {
      if (!getToken()) return false;
      try {
        const res = await getMe();
        if (cancelled || !getToken()) return false;
        applySessionUser(dispatch, res.user, getToken() || undefined);
        if (typeof res.tokens === 'number') {
          dispatch(syncFromServer({ tokens: res.tokens }));
        }
        return true;
      } catch {
        return false;
      }
    }

    async function ensureDesktopLocalSession() {
      if (getDesktopMode() !== 'local') return;
      if (getToken()) {
        const ok = await refreshMe();
        if (ok || cancelled) return;
        // Stale cloud / old-DB token — drop and auto-provision local OS user.
        setToken(null);
        dispatch(logout());
        clearSessionCaches();
      }
      if (getToken() || cancelled) return;
      try {
        const res = await loginDesktopLocal();
        if (cancelled) return;
        applySessionUser(dispatch, res.user, res.token);
      } catch {
        /* flag off or API not ready */
      }
    }

    async function boot() {
      await ensureDesktopLocalSession();
      if (cancelled) return;
      if (getDesktopMode() !== 'local') {
        await refreshMe();
      }
      await refreshWallet();
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return <AppRouter />;
}

export default memo(App);
