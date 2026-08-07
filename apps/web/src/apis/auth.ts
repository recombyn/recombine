/**
 * Auth API — Google Sign-In + email verification-code login + session.
 */

import { request } from '@/utils/request';

export type AuthUserDto = {
  id?: string;
  email: string;
  name: string;
  avatar?: string | null;
  provider: 'email' | 'google';
  bio?: string | null;
  /** Present when signed in; admin can use main-site training mode. */
  role?: 'user' | 'admin' | string;
};

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

/** Send 6-digit email verification code via Tencent SES. */
export const sendEmailCode = (data: { email: string; captchaToken?: string }) =>
  request<{ ok: boolean; expiresIn: number; mode?: string }>({
    url: '/api/v1/auth/email/send-code',
    method: 'post',
    data,
  });

/** Consume /activate/:id one-time link → session (legacy magic-link mails). */
export const activateEmailLink = (data: { id: string }) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/email/activate',
    method: 'post',
    data,
  });

/** Verify 6-digit code → session. */
export const verifyEmailCode = (data: {
  email: string;
  code: string;
  captchaToken?: string;
}) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/email/verify-code',
    method: 'post',
    data,
  });

export type SliderCaptchaChallenge = {
  captchaId: string;
  bg: string;
  piece: string;
  pieceY: number;
  bgWidth: number;
  bgHeight: number;
  pieceSize: number;
  pieceWidth?: number;
  pieceHeight?: number;
  expiresIn: number;
};

/** Create a slider captcha challenge (self-hosted). */
export const createSliderCaptcha = () =>
  request<SliderCaptchaChallenge>({
    url: '/api/v1/auth/captcha/create',
    method: 'post',
  });

/** Verify slider position → one-time captchaToken for login. */
export const verifySliderCaptcha = (payload: {
  captchaId: string;
  x: number;
  email: string;
  trajectory?: Array<{ t: number; x: number }>;
}) =>
  request<{ captchaToken: string; beatPercent?: number; expiresIn: number }>({
    url: '/api/v1/auth/captcha/verify',
    method: 'post',
    data: payload,
  });

/** Get the current authenticated user (+ credit balance). */
export const getMe = () =>
  request<{ user: AuthUserDto; tokens?: number }>({
    url: '/api/v1/auth/me',
    method: 'get',
  });

/** Update name / bio / avatar for the signed-in user. */
export const updateProfile = (payload: {
  name?: string;
  bio?: string | null;
  avatar?: string | null;
}) =>
  request<{ user: AuthUserDto }>({
    url: '/api/v1/auth/profile',
    method: 'patch',
    data: payload,
  });

/** Logout and invalidate the session. */
export const logout = () =>
  request<{ message: string }>({
    url: '/api/v1/auth/logout',
    method: 'post',
  });

/**
 * Desktop-local auto login (OS user → local SQLite account).
 * Only when API has DESKTOP_LOCAL_AUTO_LOGIN=true (Tauri local sidecar).
 */
export const loginDesktopLocal = (payload?: { username?: string }) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/desktop-local',
    method: 'post',
    data: payload || {},
  });
