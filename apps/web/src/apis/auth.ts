/**
 * Auth API — Google Sign-In + session (public endpoints only).
 */

import { request } from '@/utils/request';

export type AuthUserDto = {
  id?: string;
  email: string;
  name: string;
  avatar?: string | null;
  provider: 'email' | 'google';
};

export type AuthConfig = {
  googleEnabled: boolean;
  googleClientId?: string | null;
};

/** Whether Google login is configured on the API. */
export const fetchAuthConfig = () =>
  request<AuthConfig>({
    url: '/api/v1/auth/config',
    method: 'get',
  });

/** Login with Google OAuth credential (ID token from Google Sign-In). */
export const loginGoogle = (credential: string) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/google',
    method: 'post',
    data: { credential },
  });

/** Get the current authenticated user. */
export const getMe = () =>
  request<{ user: AuthUserDto }>({
    url: '/api/v1/auth/me',
    method: 'get',
  });

/** Logout and invalidate the session. */
export const logout = () =>
  request<{ message: string }>({
    url: '/api/v1/auth/logout',
    method: 'post',
  });
