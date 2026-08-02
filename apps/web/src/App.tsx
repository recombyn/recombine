import { useEffect, memo } from 'react';
import { useDispatch } from 'react-redux';
import { getMe } from '@/apis/auth';
import { fetchWallet } from '@/apis/wallet';
import AppRouter from '@/router';
import { logout, setSession, clearSessionCaches } from '@/store/modules/auth';
import { clearProjectsLibrary } from '@/store/modules/editor';
import { clearWallet } from '@/store/modules/wallet';
import type { LedgerEntry } from '@/utils/wallet';
import { syncFromServer } from '@/store/modules/wallet';
import { getToken } from '@/utils/token';

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

  // Logged-in boot: refresh user + credit balance from API (not localStorage alone).
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void getMe()
      .then((res) => {
        if (cancelled || !getToken()) return;
        dispatch(
          setSession({
            user: {
              id: res.user.id,
              email: res.user.email,
              name: res.user.name,
              avatar: res.user.avatar,
              provider: res.user.provider,
              bio: res.user.bio,
              role: res.user.role,
            },
            token: getToken() || undefined,
          })
        );
        if (typeof res.tokens === 'number') {
          dispatch(syncFromServer({ tokens: res.tokens }));
        }
      })
      .catch(() => undefined);
    void fetchWallet()
      .then((res) => {
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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  return <AppRouter />;
}

export default memo(App);
