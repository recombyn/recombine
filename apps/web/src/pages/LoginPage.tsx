import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Input, message } from '@/components/base';
import AppLogo from '@/components/base/AppLogo';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import ThemeSwitcher from '@/components/layout/ThemeSwitcher';
import GitHubLink from '@/components/layout/GitHubLink';
import {
  completeEmailRegister,
  createSliderCaptcha,
  loginEmail,
  resetEmailPassword,
  sendEmailCode,
  sendForgotPasswordCode,
  verifyEmailCode,
  verifySliderCaptcha,
  type SliderCaptchaChallenge,
} from '@/apis/auth';
import { setSession } from '@/store/modules/auth';
import { cn } from '@/utils/classnames';
import { readReturnToParam } from '@/utils/authReturnTo';
import { GOOGLE_CLIENT_ID, startGoogleOAuthRedirect } from '@/utils/googleOAuth';
import { HiArrowPath, HiCheck, HiChevronDoubleRight } from 'react-icons/hi2';

type Step = 'entry' | 'code' | 'password';

function apiDetail(err: unknown): string | null {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const msg = (detail as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return null;
}

function isNeedCaptcha(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 428) return true;
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (detail && typeof detail === 'object' && (detail as { code?: string }).code === 'need_captcha') {
    return true;
  }
  return false;
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

/** Self-hosted puzzle slider — UX mirrors rc-slider-captcha (embed mode). */
function LoginSliderCaptcha({
  email,
  onVerified,
  onCancel,
}: {
  email: string;
  onVerified: (captchaToken: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<SliderCaptchaChallenge | null>(null);
  /** Slider button offset in display px (0 → buttonMax). */
  const [sliderX, setSliderX] = useState(0);
  const [status, setStatus] = useState<
    'default' | 'loading' | 'moving' | 'verify' | 'success' | 'error'
  >('loading');
  const [beatPercent, setBeatPercent] = useState<number | null>(null);
  const puzzleRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const startClientXRef = useRef(0);
  const startSliderXRef = useRef(0);
  const pressedRef = useRef(false);
  const trajRef = useRef<Array<{ t: number; x: number }>>([]);
  const t0Ref = useRef(0);
  const [displayW, setDisplayW] = useState(0);
  const [trackW, setTrackW] = useState(0);

  const BTN = 36;
  const TRACK_PAD = 2;

  const reload = async () => {
    setStatus('loading');
    setBeatPercent(null);
    setSliderX(0);
    trajRef.current = [];
    // Keep previous challenge mounted so modal height does not collapse while loading.
    try {
      const ch = await createSliderCaptcha();
      setChallenge(ch);
      setStatus('default');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = puzzleRef.current;
    if (!el) return;
    const sync = () => setDisplayW(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => setTrackW(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pieceW = challenge?.pieceWidth ?? challenge?.pieceSize ?? 44;
  const pieceH = challenge?.pieceHeight ?? challenge?.pieceSize ?? 44;
  const scale = challenge && displayW > 0 ? Math.max(0.01, displayW / challenge.bgWidth) : 1;
  const puzzleMax = challenge ? Math.max(0, (challenge.bgWidth - pieceW) * scale) : 0;
  const buttonMax = Math.max(0, (trackW || displayW) - BTN - TRACK_PAD * 2);
  const ratio = buttonMax > 0 ? puzzleMax / buttonMax : 1;
  const pieceX = sliderX * ratio;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!challenge || status !== 'default') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pressedRef.current = true;
    startClientXRef.current = e.clientX;
    startSliderXRef.current = sliderX;
    t0Ref.current = performance.now();
    trajRef.current = [{ t: 0, x: pieceX / scale }];
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pressedRef.current || !challenge) return;
    if (status !== 'default' && status !== 'moving') return;
    const dx = e.clientX - startClientXRef.current;
    const next = Math.max(0, Math.min(buttonMax, startSliderXRef.current + dx));
    if (next > 0 && status === 'default') setStatus('moving');
    setSliderX(next);
    trajRef.current.push({
      t: performance.now() - t0Ref.current,
      x: (next * ratio) / scale,
    });
  };

  const onPointerUp = async () => {
    if (!pressedRef.current || !challenge) return;
    pressedRef.current = false;
    if (status !== 'moving' && sliderX <= 0) {
      t0Ref.current = 0;
      return;
    }
    setStatus('verify');
    try {
      const res = await verifySliderCaptcha({
        captchaId: challenge.captchaId,
        x: pieceX / scale,
        email,
        trajectory: trajRef.current.slice(-40),
      });
      const pct =
        typeof res.beatPercent === 'number'
          ? Math.max(1, Math.min(99, Math.round(res.beatPercent)))
          : 80;
      setBeatPercent(pct);
      setStatus('success');
      window.setTimeout(() => onVerified(res.captchaToken), 700);
    } catch {
      setStatus('error');
      window.setTimeout(() => void reload(), 500);
    } finally {
      t0Ref.current = 0;
    }
  };

  const tipInside =
    status === 'loading'
      ? t('auth.captchaLoading')
      : status === 'success' && beatPercent != null
        ? t('auth.captchaBeat', { percent: beatPercent })
        : status === 'success'
          ? t('auth.captchaOk')
          : status === 'error'
            ? t('auth.captchaFail')
            : status === 'verify'
              ? t('auth.captchaVerifying')
              : status === 'moving'
                ? ''
                : t('auth.captchaHint');

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-[360px] overflow-hidden rounded-2xl bg-[var(--surface)] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.18)] ring-1 ring-[var(--line)]"
        role="dialog"
        aria-modal
        aria-label={t('auth.captchaTitle')}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">{t('auth.captchaTitle')}</h2>
          <button
            type="button"
            className="shrink-0 text-[13px] text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={onCancel}
          >
            {t('common.cancel') || '取消'}
          </button>
        </div>

        {/* Fixed 320×160 aspect so loading never changes modal height. */}
        <div
          ref={puzzleRef}
          className="relative w-full overflow-hidden rounded-md bg-[#f0f1f3] ring-1 ring-[var(--line)]"
          style={{ aspectRatio: '320 / 160' }}
        >
          {challenge ? (
            <>
              <img
                src={challenge.bg}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
                draggable={false}
              />
              <img
                src={challenge.piece}
                alt=""
                className="pointer-events-none absolute left-0 select-none"
                style={{
                  width: pieceW * scale,
                  height: pieceH * scale,
                  top: challenge.pieceY * scale,
                  transform: `translateX(${pieceX}px)`,
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.45))',
                }}
                draggable={false}
              />
            </>
          ) : null}
          <button
            type="button"
            className="absolute right-1.5 top-1.5 z-[2] rounded bg-black/35 px-1.5 py-0.5 text-[11px] text-white hover:bg-black/50 disabled:opacity-40"
            onClick={() => void reload()}
            disabled={status === 'verify' || status === 'success' || status === 'loading'}
            aria-label={t('auth.captchaRefresh')}
          >
            <HiArrowPath className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {/* Capsule slider — circular knob (style ref 2). Tip sits below, not under the knob. */}
        <div
          ref={trackRef}
          className={cn(
            'relative mt-3 h-10 w-full select-none overflow-hidden rounded-full ring-1',
            status === 'success'
              ? 'bg-emerald-50 ring-emerald-300'
              : status === 'error'
                ? 'bg-red-50 ring-red-300'
                : 'bg-[#f0f1f3] ring-[#d8dbe0]'
          )}
        >
          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 rounded-full',
              status === 'success'
                ? 'bg-emerald-200/70'
                : status === 'error'
                  ? 'bg-red-200/60'
                  : 'bg-[#e4e6ea]'
            )}
            style={{
              width: Math.min(
                TRACK_PAD + sliderX + BTN / 2,
                trackW || TRACK_PAD + sliderX + BTN / 2
              ),
            }}
          />
          <button
            type="button"
            disabled={!challenge || status === 'verify' || status === 'success' || status === 'loading'}
            className={cn(
              'absolute top-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm',
              'disabled:opacity-60',
              status === 'success'
                ? 'bg-emerald-500'
                : status === 'error'
                  ? 'bg-red-400'
                  : 'bg-[#3d3f44] hover:bg-[#2c2e32]'
            )}
            style={{ left: TRACK_PAD + sliderX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => void onPointerUp()}
            onPointerCancel={() => {
              pressedRef.current = false;
              t0Ref.current = 0;
              if (status === 'moving') {
                setSliderX(0);
                setStatus('default');
              }
            }}
            aria-label={t('auth.captchaHint')}
          >
            {status === 'success' ? (
              <HiCheck className="h-5 w-5" aria-hidden />
            ) : (
              <HiChevronDoubleRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {/* Fixed tip row under the track — always reserved height, left-aligned with knob. */}
        <p
          className={cn(
            'mt-2 min-h-[18px] text-left text-[12px] leading-[18px]',
            status === 'success'
              ? 'text-emerald-600'
              : status === 'error'
                ? 'text-red-500'
                : status === 'loading' || status === 'verify' || status === 'default'
                  ? 'text-[#8b8f96]'
                  : 'invisible'
          )}
          aria-hidden={status === 'moving'}
        >
          {status === 'moving' ? '\u00a0' : tipInside || '\u00a0'}
        </p>

        <button
          type="button"
          className="mt-3 text-[12px] text-[var(--muted)] underline-offset-2 hover:underline"
          onClick={() => void reload()}
          disabled={status === 'verify' || status === 'success' || status === 'loading'}
        >
          {t('auth.captchaRefresh') || '换一张'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage({
  initialMode = 'login',
}: {
  initialMode?: 'login' | 'register' | 'forgot';
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = readReturnToParam(searchParams);
  const [step, setStep] = useState<Step>('entry');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingCaptchaToken, setPendingCaptchaToken] = useState<string | null>(null);
  /** What to retry after slider succeeds. */
  const [captchaResume, setCaptchaResume] = useState<'login' | 'send-code' | 'verify-code' | null>(
    null
  );
  const isRegisterHint = initialMode === 'register';
  const isForgot = initialMode === 'forgot';

  const finishSession = (payload: {
    email: string;
    name: string;
    provider: 'email' | 'google';
    avatar?: string | null;
    id?: string;
    token: string;
  }) => {
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
    message.success(t('auth.success'));
    navigate(returnTo, { replace: true });
  };

  const openCaptcha = (resume: 'login' | 'send-code' | 'verify-code') => {
    setCaptchaResume(resume);
    setShowCaptcha(true);
    message.warning(t('auth.captchaNeed'));
  };

  const tryPasswordLogin = async (captchaToken?: string | null) => {
    const trimmed = email.trim().toLowerCase();
    const res = await loginEmail(trimmed, password, captchaToken);
    setPendingCaptchaToken(null);
    setShowCaptcha(false);
    setCaptchaResume(null);
    finishSession({
      email: res.user.email,
      name: res.user.name,
      provider: 'email',
      avatar: res.user.avatar,
      id: res.user.id,
      token: res.token,
    });
  };

  const trySendCode = async (captchaToken?: string | null) => {
    const trimmed = email.trim().toLowerCase();
    if (isForgot) {
      await sendForgotPasswordCode(trimmed, captchaToken);
    } else {
      await sendEmailCode(trimmed, captchaToken);
    }
    setPendingCaptchaToken(null);
    setShowCaptcha(false);
    setCaptchaResume(null);
    setEmail(trimmed);
    setTicket(null);
    setStep('code');
    message.success(t('auth.codeSent'));
  };

  const tryVerifyCode = async (captchaToken?: string | null) => {
    const res = await verifyEmailCode(email.trim().toLowerCase(), code.trim(), captchaToken);
    setPendingCaptchaToken(null);
    setShowCaptcha(false);
    setCaptchaResume(null);
    setTicket(res.ticket);
    setStep('password');
  };

  const onGoogleContinue = () => {
    try {
      startGoogleOAuthRedirect(returnTo);
    } catch {
      message.error(t('auth.googleFailed') || 'Google login failed');
    }
  };

  const onContinueEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      message.error(t('auth.invalidEmail'));
      return;
    }

    // Forgot password: email only → send reset code.
    if (isForgot) {
      setBusy(true);
      try {
        await trySendCode(pendingCaptchaToken);
      } catch (err) {
        if (isNeedCaptcha(err)) openCaptcha('send-code');
        else message.error(apiDetail(err) || t('auth.sendFailed'));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Login page: any password input → password login only (never SES send-code).
    if (!isRegisterHint && password.length > 0) {
      if (password.length < 6) {
        message.error(t('auth.passwordShort'));
        return;
      }
      setBusy(true);
      try {
        await tryPasswordLogin(pendingCaptchaToken);
      } catch (err) {
        if (isNeedCaptcha(err)) openCaptcha('login');
        else message.error(apiDetail(err) || t('auth.loginFailed'));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Register / email-only continue → send verification code.
    setBusy(true);
    try {
      await trySendCode(pendingCaptchaToken);
    } catch (err) {
      if (isNeedCaptcha(err)) openCaptcha('send-code');
      else message.error(apiDetail(err) || t('auth.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    if (code.trim().length < 4) {
      message.error(t('auth.codeInvalid'));
      return;
    }
    setBusy(true);
    try {
      await tryVerifyCode(pendingCaptchaToken);
    } catch (err) {
      if (isNeedCaptcha(err)) openCaptcha('verify-code');
      else message.error(apiDetail(err) || t('auth.codeInvalid'));
    } finally {
      setBusy(false);
    }
  };

  const onCompleteEmail = async () => {
    if (password.length < 6) {
      message.error(t('auth.passwordShort'));
      return;
    }
    if (!ticket) {
      message.error(t('auth.codeMissing'));
      setStep('entry');
      return;
    }
    setBusy(true);
    try {
      const trimmed = email.trim().toLowerCase();
      const res = isForgot
        ? await resetEmailPassword({
            email: trimmed,
            ticket,
            password,
          })
        : await completeEmailRegister({
            email: trimmed,
            ticket,
            password,
            name: name.trim() || undefined,
          });
      finishSession({
        email: res.user.email,
        name: res.user.name,
        provider: 'email',
        avatar: res.user.avatar,
        id: res.user.id,
        token: res.token,
      });
    } catch (err) {
      message.error(apiDetail(err) || (isForgot ? t('auth.resetFailed') : t('auth.sendFailed')));
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    setBusy(true);
    try {
      if (isForgot) {
        await sendForgotPasswordCode(email.trim().toLowerCase(), pendingCaptchaToken);
      } else {
        await sendEmailCode(email.trim().toLowerCase(), pendingCaptchaToken);
      }
      setPendingCaptchaToken(null);
      setShowCaptcha(false);
      setCaptchaResume(null);
      setCode('');
      message.success(t('auth.resent'));
    } catch (err) {
      if (isNeedCaptcha(err)) openCaptcha('send-code');
      else message.error(apiDetail(err) || t('auth.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  const titleByStep: Record<Step, string> = {
    entry: isForgot ? t('auth.forgotTitle') : t('auth.title'),
    code: t('auth.codeTitle'),
    password: isForgot ? t('auth.resetPasswordTitle') : t('auth.passwordTitle'),
  };
  const subtitleByStep: Record<Step, string> = {
    entry: isForgot
      ? t('auth.forgotSubtitle')
      : isRegisterHint
        ? t('auth.subtitleRegister')
        : t('auth.subtitle'),
    code: t('auth.codeSentTo', { email }),
    password: isForgot ? t('auth.resetPasswordSubtitle') : t('auth.passwordSubtitle'),
  };
  const title = titleByStep[step];
  const subtitle = subtitleByStep[step];

  return (
    <div className="relative flex h-full flex-col overflow-auto bg-[var(--surface)]">
      {showCaptcha ? (
        <LoginSliderCaptcha
          email={email.trim().toLowerCase()}
          onCancel={() => {
            setShowCaptcha(false);
            setCaptchaResume(null);
          }}
          onVerified={(token) => {
            setPendingCaptchaToken(token);
            setShowCaptcha(false);
            const resume = captchaResume;
            setCaptchaResume(null);
            setBusy(true);
            const run =
              resume === 'send-code'
                ? step === 'code'
                  ? () => {
                      const send = isForgot ? sendForgotPasswordCode : sendEmailCode;
                      return send(email.trim().toLowerCase(), token).then(() => {
                        setPendingCaptchaToken(null);
                        setCode('');
                        message.success(t('auth.resent'));
                      });
                    }
                  : () => trySendCode(token)
                : resume === 'verify-code'
                  ? () => tryVerifyCode(token)
                  : () => tryPasswordLogin(token);
            void run()
              .catch((err) => {
                if (isNeedCaptcha(err)) {
                  openCaptcha(
                    resume === 'send-code'
                      ? 'send-code'
                      : resume === 'verify-code'
                        ? 'verify-code'
                        : 'login'
                  );
                } else if (resume === 'send-code') {
                  message.error(apiDetail(err) || t('auth.sendFailed'));
                } else if (resume === 'verify-code') {
                  message.error(apiDetail(err) || t('auth.codeInvalid'));
                } else {
                  message.error(apiDetail(err) || t('auth.loginFailed'));
                }
              })
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      <header className="flex shrink-0 items-center justify-between px-6 py-5">
        <Link to="/home" className="inline-flex items-center gap-2">
          <AppLogo size={32} />
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
            <AppLogo size={48} className="mb-4 shadow-sm" />
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
            <p className="mt-2 text-[14px] text-[var(--muted)]">{subtitle}</p>
          </div>

          {step === 'entry' ? (
            <>
              {!isForgot && GOOGLE_CLIENT_ID ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onGoogleContinue}
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[14px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-60"
                >
                  <GoogleIcon />
                  {t('auth.google')}
                </button>
              ) : null}
              {!isForgot && !GOOGLE_CLIENT_ID ? (
                <button
                  type="button"
                  disabled
                  title="Set GOOGLE_CLIENT_ID in apps/web/.env and apps/api/.env"
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] text-[14px] font-medium text-[var(--muted)] opacity-70"
                >
                  <GoogleIcon />
                  {t('auth.google')}
                </button>
              ) : null}

              {!isForgot ? (
                <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <span className="h-px flex-1 bg-[var(--line)]" />
                  {t('auth.or')}
                  <span className="h-px flex-1 bg-[var(--line)]" />
                </div>
              ) : null}

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
                className={cn('!h-12 !rounded-full !px-5 !bg-white', isForgot && '!mt-0')}
              />

              {!isRegisterHint && !isForgot ? (
                <Input
                  size="large"
                  type="outlined"
                  inputType="password"
                  placeholder={t('auth.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onContinueEmail();
                  }}
                  className="!mt-3 !h-12 !rounded-full !px-5 !bg-white"
                />
              ) : null}

              {!isRegisterHint && !isForgot ? (
                <div className="mt-2 flex justify-end">
                  <Link
                    to={
                      returnTo === '/home'
                        ? '/forgot-password'
                        : `/forgot-password?from=${encodeURIComponent(returnTo)}`
                    }
                    className="text-[12px] text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
                  >
                    {t('auth.forgotLink')}
                  </Link>
                </div>
              ) : null}

              <Button
                type="primary"
                className="!mt-4 !h-12 !w-full !rounded-full !text-[15px]"
                disabled={busy}
                onClick={() => void onContinueEmail()}
              >
                {busy
                  ? t('auth.sending')
                  : !isRegisterHint && !isForgot && password.length > 0
                    ? t('auth.login')
                    : t('auth.continue')}
              </Button>

              {isForgot ? (
                <p className="mt-3 text-center text-[12px] text-[var(--muted)]">
                  <Link
                    to={returnTo === '/home' ? '/login' : `/login?from=${encodeURIComponent(returnTo)}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {t('auth.backToLogin')}
                  </Link>
                </p>
              ) : !isRegisterHint ? (
                <p className="mt-3 text-center text-[12px] text-[var(--muted)]">
                  {t('auth.noAccount')}{' '}
                  <Link
                    to={returnTo === '/home' ? '/register' : `/register?from=${encodeURIComponent(returnTo)}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {t('auth.goRegister')}
                  </Link>
                </p>
              ) : (
                <p className="mt-3 text-center text-[12px] text-[var(--muted)]">
                  {t('auth.hasAccount')}{' '}
                  <Link
                    to={returnTo === '/home' ? '/login' : `/login?from=${encodeURIComponent(returnTo)}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {t('auth.goLogin')}
                  </Link>
                </p>
              )}
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
                  if (e.key === 'Enter') void onVerifyCode();
                }}
                className="!h-12 !rounded-full !px-5 !tracking-[0.2em] !bg-white"
              />
              <Button
                type="primary"
                className="!h-12 !w-full !rounded-full !text-[15px]"
                disabled={busy}
                onClick={() => void onVerifyCode()}
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
                    setTicket(null);
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
              {!isForgot ? (
                <Input
                  size="large"
                  type="outlined"
                  placeholder={t('auth.nickname')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="!h-12 !rounded-full !px-5 !bg-white"
                />
              ) : null}
              <Input
                size="large"
                type="outlined"
                inputType="password"
                placeholder={isForgot ? t('auth.newPassword') : t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onCompleteEmail();
                }}
                className="!h-12 !rounded-full !px-5 !bg-white"
              />
              <Button
                type="primary"
                className="!mt-1 !h-12 !w-full !rounded-full !text-[15px]"
                disabled={busy}
                onClick={() => void onCompleteEmail()}
              >
                {isForgot ? t('auth.resetPasswordSubmit') : t('auth.done')}
              </Button>
            </div>
          ) : null}

          <p className="mt-10 text-center text-[12px] text-[var(--muted)]">
            <Link to="/home" className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]">
              {t('auth.backHome')}
            </Link>
            <span className="mx-2 text-[#d0d3d6]">|</span>
            <Link to="/terms" className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]">
              {t('auth.terms')}
            </Link>
            <span className="mx-2 text-[#d0d3d6]">|</span>
            <Link to="/privacy" className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]">
              {t('auth.privacy')}
            </Link>
          </p>
        </div>
      </div>

      <p className="shrink-0 pb-6 text-center text-[12px] text-[var(--muted)]">
        {t('legal.footer', { year: new Date().getFullYear() })}
      </p>
    </div>
  );
}
