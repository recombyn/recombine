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
  bio?: string | null;
  /** Present when signed in; admin can use main-site training mode. */
  role?: 'user' | 'admin' | string;
  /** True when the account can sign in with email + password. */
  hasPassword?: boolean;
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
export const sendEmailCode = (email: string, captchaToken?: string | null) =>
  request<{ ok: boolean; expiresIn: number }>({
    url: '/api/v1/auth/email/send-code',
    method: 'post',
    data: {
      email,
      ...(captchaToken ? { captchaToken } : {}),
    },
  });

/** Send forgot-password verification code (always ok; only emails accounts with a password). */
export const sendForgotPasswordCode = (email: string, captchaToken?: string | null) =>
  request<{ ok: boolean; expiresIn: number }>({
    url: '/api/v1/auth/email/forgot/send-code',
    method: 'post',
    data: {
      email,
      ...(captchaToken ? { captchaToken } : {}),
    },
  });

/** Verify code → short-lived registration ticket. */
export const verifyEmailCode = (email: string, code: string, captchaToken?: string | null) =>
  request<{ ticket: string }>({
    url: '/api/v1/auth/email/verify-code',
    method: 'post',
    data: {
      email,
      code,
      ...(captchaToken ? { captchaToken } : {}),
    },
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

/** Reset password after forgot-password ticket verification; signs the user in. */
export const resetEmailPassword = (payload: {
  email: string;
  ticket: string;
  password: string;
}) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/email/reset-password',
    method: 'post',
    data: payload,
  });

/** Change password while signed in (email accounts with an existing password). */
export const changeEmailPassword = (payload: {
  currentPassword: string;
  newPassword: string;
}) =>
  request<{ user: AuthUserDto }>({
    url: '/api/v1/auth/email/change-password',
    method: 'post',
    data: payload,
  });

/** Login with email + password (optional slider captcha token after failed attempts). */
export const loginEmail = (email: string, password: string, captchaToken?: string | null) =>
  request<{ user: AuthUserDto; token: string }>({
    url: '/api/v1/auth/email/login',
    method: 'post',
    data: {
      email,
      password,
      ...(captchaToken ? { captchaToken } : {}),
    },
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

export type PublicUserDto = {
  id: string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
};

/** Public creator profile (no email). */
export const fetchPublicUser = (userId: string) =>
  request<{ user: PublicUserDto }>({
    url: `/api/v1/auth/users/${encodeURIComponent(userId)}`,
    method: 'get',
  });

/** Logout and invalidate the session. */
export const logout = () =>
  request<{ message: string }>({
    url: '/api/v1/auth/logout',
    method: 'post',
  });
