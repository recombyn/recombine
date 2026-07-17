/**
 * Auth API — Google Sign-In + email/password (Tencent SES) + session.
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
  emailEnabled?: boolean;
};

/** Whether Google / email login is configured on the API. */
export const fetchAuthConfig = () =>
  request<AuthConfig>({
    url: '/api/v1/auth/config',
    method: 'get',
  });

/** Login with Google — full-page redirect auth-code, or GIS ID token. */
export const loginGoogle = (payload: {
  code?: string;
  credential?: string;
  /** Must match the redirect_uri used in the authorize request. */
  redirectUri?: string;
}) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/google',
    method: 'post',
    data: payload,
  });

/** Send registration verification code via Tencent SES. */
export const sendEmailCode = (email: string) =>
  request<{ ok: boolean; expiresIn: number }>({
    url: '/api/v1/auth/email/send-code',
    method: 'post',
    data: { email },
  });

/** Verify code → short-lived registration ticket. */
export const verifyEmailCode = (email: string, code: string) =>
  request<{ ticket: string }>({
    url: '/api/v1/auth/email/verify-code',
    method: 'post',
    data: { email, code },
  });

/** Complete email registration after ticket verification. */
export const completeEmailRegister = (payload: {
  email: string;
  ticket: string;
  password: string;
  name?: string;
}) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/email/complete',
    method: 'post',
    data: payload,
  });

/** Login with email + password. */
export const loginEmail = (email: string, password: string) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/email/login',
    method: 'post',
    data: { email, password },
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
