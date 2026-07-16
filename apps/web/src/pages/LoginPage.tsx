import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { Button, Input, message } from '@/components/base';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';
import GitHubLink from '@/components/layout/GitHubLink';
import { loginGoogle } from '@/apis/auth';
import { setSession, setUser } from '@/store/modules/auth';
import { cn } from '@/utils/classnames';

type Step = 'entry' | 'code' | 'password';

const CODE_KEY = 'resume-scene-email-code-v1';
const MOCK_CODE_TTL_MS = 10 * 60 * 1000;

declare const __GOOGLE_CLIENT_ID__: string;
const GOOGLE_CLIENT_ID =
  typeof __GOOGLE_CLIENT_ID__ !== 'undefined' ? __GOOGLE_CLIENT_ID__ : '';

function savePendingCode(email: string, code: string) {
  sessionStorage.setItem(
    CODE_KEY,
    JSON.stringify({ email, code, expiresAt: Date.now() + MOCK_CODE_TTL_MS })
  );
}

function readPendingCode(): { email: string; code: string; expiresAt: number } | null {
  try {
    const raw = sessionStorage.getItem(CODE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPendingCode() {
  sessionStorage.removeItem(CODE_KEY);
}

async function sendVerificationEmail(email: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 450));
  const code = String(Math.floor(100000 + Math.random() * 900000));
  savePendingCode(email, code);
  console.info(`[mock Tencent SES] verification code for ${email}: ${code}`);
  return code;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.3 5.2C39.3 36.8 44 31.5 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}

export default function LoginPage({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>('entry');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const isRegisterHint = initialMode === 'register';
  const redirectTo = (() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from && from !== '/login' && from !== '/register') return from;
    return '/home';
  })();

  const finishSession = (payload: {
    email: string;
    name: string;
    provider: 'email' | 'google';
    avatar?: string | null;
    id?: string;
    token?: string;
  }) => {
    if (payload.token) {
      dispatch(
        setSession({
          user: {
            email: payload.email,
            name: payload.name,
            provider: payload.provider,
            avatar: payload.avatar,
            id: payload.id,
          },
          token: payload.token,
        })
      );
    } else {
      dispatch(
        setUser({
          email: payload.email,
          name: payload.name,
          provider: payload.provider,
          avatar: payload.avatar,
          id: payload.id,
        })
      );
    }
    clearPendingCode();
    message.success(t('auth.success'));
    navigate(redirectTo, { replace: true });
  };

  const onGoogleCredential = async (credential?: string) => {
    if (!credential) {
      message.error(t('auth.googleFailed') || 'Google login failed');
      return;
    }
    setBusy(true);
    try {
      const res = await loginGoogle(credential);
      finishSession({
        email: res.user.email,
        name: res.user.name,
        provider: 'google',
        avatar: res.user.avatar,
        id: res.user.id,
        token: res.token,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Google login failed';
      message.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setBusy(false);
    }
  };

  const onContinueEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      message.error(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    try {
      const sent = await sendVerificationEmail(trimmed);
      setDevCodeHint(sent);
      setEmail(trimmed);
      setStep('code');
      message.success(t('auth.codeSent'));
    } catch {
      message.error(t('auth.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = () => {
    const pending = readPendingCode();
    if (!pending || pending.email !== email.trim().toLowerCase()) {
      message.error(t('auth.codeMissing'));
      setStep('entry');
      return;
    }
    if (Date.now() > pending.expiresAt) {
      message.error(t('auth.codeExpired'));
      clearPendingCode();
      setStep('entry');
      return;
    }
    if (code.trim() !== pending.code) {
      message.error(t('auth.codeInvalid'));
      return;
    }
    setStep('password');
  };

  const onCompleteEmail = () => {
    if (password.length < 6) {
      message.error(t('auth.passwordShort'));
      return;
    }
    finishSession({
      email: email.trim().toLowerCase(),
      name: name.trim() || email.split('@')[0],
      provider: 'email',
    });
  };

  const resendCode = async () => {
    setBusy(true);
    try {
      const sent = await sendVerificationEmail(email);
      setDevCodeHint(sent);
      setCode('');
      message.success(t('auth.resent'));
    } finally {
      setBusy(false);
    }
  };

  const titleByStep: Record<Step, string> = {
    entry: t('auth.title'),
    code: t('auth.codeTitle'),
    password: t('auth.passwordTitle'),
  };
  const subtitleByStep: Record<Step, string> = {
    entry: isRegisterHint ? t('auth.subtitleRegister') : t('auth.subtitle'),
    code: t('auth.codeSentTo', { email }),
    password: t('auth.passwordSubtitle'),
  };
  const title = titleByStep[step];
  const subtitle = subtitleByStep[step];

  return (
    <div className="relative flex h-full flex-col overflow-auto bg-[var(--surface)]">
      <header className="flex shrink-0 items-center justify-between px-6 py-5">
        <Link to="/home" className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[12px] font-bold text-[var(--on-brand)]">
            RC
          </span>
          <span className="text-[15px] font-semibold text-[var(--ink)]">{t('app.name')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher variant="light" />
          <ThemeSwitcher />
          <GitHubLink />
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-[16px] font-bold text-[var(--on-brand)] shadow-sm">
              RC
            </span>
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
            <p className="mt-2 text-[14px] text-[var(--muted)]">{subtitle}</p>
          </div>

          {step === 'entry' ? (
            <>
              {GOOGLE_CLIENT_ID ? (
                <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                  <div className="flex w-full justify-center [&_div]:w-full [&_iframe]:mx-auto">
                    <GoogleLogin
                      onSuccess={(res) => void onGoogleCredential(res.credential)}
                      onError={() => message.error(t('auth.googleFailed') || 'Google login failed')}
                      useOneTap={false}
                      theme="outline"
                      size="large"
                      width="380"
                      text="continue_with"
                      shape="pill"
                    />
                  </div>
                </GoogleOAuthProvider>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Set GOOGLE_CLIENT_ID in apps/web/.env and apps/api/.env"
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[14px] font-medium text-[var(--muted)] opacity-70"
                >
                  <GoogleIcon />
                  {t('auth.google')}（未配置）
                </button>
              )}

              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <span className="h-px flex-1 bg-[var(--line)]" />
                {t('auth.or')}
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>

              <Input
                size="large"
                type="outlined"
                inputType="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onContinueEmail();
                }}
                className="!h-12 !rounded-full !px-5 !bg-white"
              />

              <Button
                type="primary"
                className="!mt-4 !h-12 !w-full !rounded-full !text-[15px]"
                disabled={busy}
                onClick={() => void onContinueEmail()}
              >
                {busy ? t('auth.sending') : t('auth.continue')}
              </Button>
            </>
          ) : null}

          {step === 'code' ? (
            <div className="space-y-4">
              <Input
                size="large"
                type="outlined"
                placeholder={t('auth.codePlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onVerifyCode();
                }}
                className="!h-12 !rounded-full !px-5 !tracking-[0.2em] !bg-white"
              />
              {devCodeHint ? (
                <p className="rounded-xl bg-[#e8f0ff] px-3 py-2 text-center text-[12px] text-[var(--accent)]">
                  {t('auth.devCodeHint', { code: devCodeHint })}
                </p>
              ) : null}
              <Button
                type="primary"
                className="!h-12 !w-full !rounded-full !text-[15px]"
                onClick={onVerifyCode}
              >
                {t('auth.verify')}
              </Button>
              <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
                <button
                  type="button"
                  className="hover:text-[var(--ink)]"
                  onClick={() => {
                    setStep('entry');
                    setCode('');
                    setDevCodeHint(null);
                  }}
                >
                  {t('auth.backEmail')}
                </button>
                <button
                  type="button"
                  className={cn('hover:text-[var(--accent)]', busy && 'opacity-50')}
                  disabled={busy}
                  onClick={() => void resendCode()}
                >
                  {t('auth.resend')}
                </button>
              </div>
            </div>
          ) : null}

          {step === 'password' ? (
            <div className="space-y-3">
              <Input
                size="large"
                type="outlined"
                placeholder={t('auth.nickname')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="!h-12 !rounded-full !px-5 !bg-white"
              />
              <Input
                size="large"
                type="outlined"
                inputType="password"
                placeholder={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCompleteEmail();
                }}
                className="!h-12 !rounded-full !px-5 !bg-white"
              />
              <Button
                type="primary"
                className="!mt-1 !h-12 !w-full !rounded-full !text-[15px]"
                onClick={onCompleteEmail}
              >
                {t('auth.done')}
              </Button>
            </div>
          ) : null}

          <p className="mt-10 text-center text-[12px] text-[var(--muted)]">
            <Link to="/home" className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]">
              {t('auth.backHome')}
            </Link>
            <span className="mx-2 text-[#d0d3d6]">|</span>
            <span>{t('auth.terms')}</span>
            <span className="mx-2 text-[#d0d3d6]">|</span>
            <span>{t('auth.privacy')}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
