import { useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

/** Protects editor (and any other auth-only routes). Guests → login, then return. */
export function RequireAuth() {
  const user = useSelector((state: any) => state.auth.user);
  const location = useLocation();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}

/** Login / register only. Already signed-in users go back to `from` or home. */
export function GuestOnly() {
  const user = useSelector((state: any) => state.auth.user);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (user) {
    const dest =
      from && from !== '/login' && from !== '/register' && !from.startsWith('/login/')
        ? from
        : '/home';
    return <Navigate to={dest} replace />;
  }

  return <Outlet />;
}
