/**
 * Full-page Google OAuth (authorization code + redirect).
 * Navigates the current tab to accounts.google.com — not popup / iframe.
 */

declare const __GOOGLE_CLIENT_ID__: string;

export const GOOGLE_CLIENT_ID =
  typeof __GOOGLE_CLIENT_ID__ !== 'undefined' ? __GOOGLE_CLIENT_ID__ : '';

const STATE_KEY = 'recombyn-google-oauth-state-v1';

export function getGoogleRedirectUri(): string {
  return `${window.location.origin}/login/google/callback`;
}

type OAuthState = { state: string; returnTo: string };

export function startGoogleOAuthRedirect(returnTo = '/home') {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  const state =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload: OAuthState = {
    state,
    returnTo: returnTo && returnTo !== '/login' && returnTo !== '/register' ? returnTo : '/home',
  };
  sessionStorage.setItem(STATE_KEY, JSON.stringify(payload));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export function consumeGoogleOAuthState(stateFromQuery: string | null): OAuthState | null {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    if (!raw || !stateFromQuery) return null;
    const parsed = JSON.parse(raw) as OAuthState;
    if (!parsed?.state || parsed.state !== stateFromQuery) return null;
    return parsed;
  } catch {
    return null;
  }
}
