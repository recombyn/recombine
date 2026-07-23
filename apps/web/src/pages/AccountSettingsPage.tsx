import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft, HiOutlinePencil } from 'react-icons/hi2';
import { getMe, updateProfile, changeEmailPassword } from '@/apis/auth';
import { fetchWallet } from '@/apis/wallet';
import { Button, Input, message } from '@/components/base';
import PlansDialog from '@/components/layout/PlansDialog';
import WalletLedgerPanel from '@/components/layout/WalletLedgerPanel';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import AgentModelsPanel from '@/components/editor/panels/agent/AgentModelsPanel';
import { setSession, setUser, type AuthUser } from '@/store/modules/auth';
import { syncFromServer } from '@/store/modules/wallet';
import { formatTokens, type LedgerEntry } from '@/utils/wallet';
import { getToken } from '@/utils/token';
import { readReturnToParam } from '@/utils/authReturnTo';
import { cn } from '@/utils/classnames';

const NAME_RE = /^[\p{L}\p{N}\s.'\-_]{1,40}$/u;
const MAX_BIO = 200;
const MAX_AVATAR_MB = 2;

type AccountTab = 'profile' | 'usage' | 'agent';

function parseTab(raw: string | null): AccountTab {
  if (raw === 'usage') return 'usage';
  if (raw === 'agent') return 'agent';
  return 'profile';
}

function accountPageTitle(tab: AccountTab, t: (key: string) => string): string {
  switch (tab) {
    case 'usage':
      return t('wallet.billingTitle');
    case 'agent':
      return t('account.agentTitle');
    default:
      return t('account.title');
  }
}

function accountPageSubtitle(tab: AccountTab, t: (key: string) => string): string {
  switch (tab) {
    case 'usage':
      return t('wallet.billingHint');
    case 'agent':
      return t('account.agentSubtitle');
    default:
      return t('account.subtitle');
  }
}

function accountShowsSubtitle(tab: AccountTab): boolean {
  return tab === 'profile' || tab === 'agent';
}

/** Account hub — left nav + centered profile / usage & billing. */
export default function AccountSettingsPage(): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const user = useSelector((s: any) => s.auth.user as AuthUser | null);
  const tokens = useSelector((s: any) => s.wallet?.tokens ?? 0);
  const creditsIncluded = useSelector((s: any) => s.wallet?.creditsIncluded ?? 150);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const setTab = (next: AccountTab) => {
    const from = searchParams.get('from');
    const nextParams = new URLSearchParams();
    if (next !== 'profile') nextParams.set('tab', next);
    if (from) nextParams.set('from', from);
    setSearchParams(nextParams, { replace: true });
  };

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
              hasPassword: res.user.hasPassword,
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
            ledger: (res.ledger || []) as LedgerEntry[],
          })
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    setName(user?.name || '');
    setBio(user?.bio || '');
    setAvatar(user?.avatar || null);
  }, [user]);

  const creditCap = Math.max(1, Number(creditsIncluded) || 150);
  const balance = Math.max(0, Number(tokens) || 0);
  /** Against monthly allotment only (extra card-key credits sit above the bar). */
  const planRemaining = Math.min(balance, creditCap);
  const planUsed = Math.max(0, creditCap - planRemaining);
  const usedPct = Math.min(100, Math.round((planUsed / creditCap) * 100));
  const remainPct = 100 - usedPct;

  const onAvatarFile = (file: File | null) => {
    if (!file || saving) return;
    if (!file.type.startsWith('image/')) {
      message.warning(t('me.avatarTypeError'));
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      message.warning(t('me.avatarSizeError', { mb: MAX_AVATAR_MB }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (url.startsWith('data:image/')) setAvatar(url);
    };
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning(t('me.nameRequired'));
      return;
    }
    if (trimmed.length > 40 || !NAME_RE.test(trimmed)) {
      message.warning(t('me.nameHint'));
      return;
    }
    if (!user) {
      message.warning(t('me.needLogin'));
      return;
    }
    if (saving) return;
    const nextBio = bio.trim().slice(0, MAX_BIO) || null;
    setSaving(true);
    try {
      const res = await updateProfile({ name: trimmed, bio: nextBio, avatar });
      dispatch(
        setUser({
          ...user,
          id: res.user.id || user.id,
          name: res.user.name,
          bio: res.user.bio ?? nextBio,
          avatar: res.user.avatar ?? avatar,
          email: res.user.email || user.email,
          provider: res.user.provider || user.provider,
          hasPassword: res.user.hasPassword ?? user.hasPassword,
        })
      );
      message.success(t('me.profileSaved'));
    } catch {
      message.error(t('home.casesLoadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onChangePassword = async () => {
    if (!user) {
      message.warning(t('me.needLogin'));
      return;
    }
    if (currentPassword.length < 6 || newPassword.length < 6) {
      message.warning(t('auth.passwordShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      message.warning(t('account.passwordMismatch'));
      return;
    }
    if (currentPassword === newPassword) {
      message.warning(t('account.passwordSame'));
      return;
    }
    if (passwordSaving) return;
    setPasswordSaving(true);
    try {
      const res = await changeEmailPassword({
        currentPassword,
        newPassword,
      });
      dispatch(
        setUser({
          ...user,
          hasPassword: res.user.hasPassword ?? true,
        })
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      message.success(t('account.passwordChanged'));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      const msg = typeof detail === 'string' ? detail : null;
      message.error(msg || t('account.passwordChangeFailed'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const providerLabel =
    user?.provider === 'google' ? t('account.loginGoogle') : t('account.loginEmail');
  const canChangePassword = Boolean(user?.hasPassword);

  const navItems: { id: AccountTab; label: string }[] = [
    { id: 'profile', label: t('account.navProfile') },
    { id: 'agent', label: t('account.navAgent') },
    { id: 'usage', label: t('account.navUsage') },
  ];

  const pageTitle = accountPageTitle(tab, t);
  const pageSubtitle = accountPageSubtitle(tab, t);

  const returnTo = readReturnToParam(searchParams);
  const backLabel = returnTo === '/home' ? t('account.backHome') : t('account.back');

  return (
    <div className="flex h-full min-h-0 bg-[var(--account-main)]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--account-rail)]">
        <div className="px-3 pt-4 pb-2">
          <Link
            to={returnTo}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--ink)]"
          >
            <HiOutlineArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4" aria-label={t('account.title')}>
          {navItems.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex w-full items-center rounded-lg px-3 py-2 text-left text-[14px] transition',
                  active
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--ink)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                )}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={user?.name} email={user?.email} avatar={user?.avatar} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[var(--ink)]">
                {user?.name || user?.email}
              </div>
              <div className="truncate text-[11px] text-[var(--muted)]">{user?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[var(--account-main)]">
        <div className="mx-auto w-full max-w-[1400px] px-6 py-8 pb-16 sm:px-8">
          <header className="mb-6">
            <h1 className="text-[24px] font-medium leading-tight tracking-tight text-[var(--ink)]">
              {pageTitle}
            </h1>
            {accountShowsSubtitle(tab) ? (
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">{pageSubtitle}</p>
            ) : null}
          </header>

          {tab === 'usage' ? <WalletLedgerPanel /> : null}
          {tab === 'agent' ? <AgentModelsPanel /> : null}
          {tab === 'profile' ? (
            <div className="space-y-5">
              <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
                <h2 className="mb-5 text-[15px] font-semibold text-[var(--ink)]">
                  {t('account.profileSection')}
                </h2>

                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div className="relative shrink-0">
                    <UserAvatar
                      name={name || user?.name}
                      email={user?.email}
                      avatar={avatar}
                      size={72}
                    />
                    <button
                      type="button"
                      aria-label={t('me.changeAvatar')}
                      disabled={saving}
                      onClick={() => fileRef.current?.click()}
                      className="absolute -bottom-0.5 -right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--account-card)] text-[var(--ink)] shadow ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
                    >
                      <HiOutlinePencil className="h-3.5 w-3.5" />
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        onAvatarFile(e.target.files?.[0] || null);
                        e.target.value = '';
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-5">
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">
                        {t('me.username')}
                        <span className="ml-0.5 text-red-500">*</span>
                      </span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={40}
                        disabled={saving}
                        className={cn(
                          'h-10 w-full rounded-lg border-0 bg-[var(--account-main)] px-3 text-[14px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)]',
                          'placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/25 disabled:opacity-60'
                        )}
                        placeholder={t('me.usernamePlaceholder')}
                      />
                      <span className="mt-2 block text-[12px] leading-relaxed text-[var(--muted)]">
                        {t('me.nameHint')}
                      </span>
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-[13px] font-medium text-[var(--ink)]">
                        {t('me.bio')}
                      </span>
                      <div className="relative">
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                          rows={3}
                          maxLength={MAX_BIO}
                          disabled={saving}
                          placeholder={t('me.bioPlaceholder')}
                          className={cn(
                            'w-full resize-none rounded-lg border-0 bg-[var(--account-main)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--ink)] outline-none ring-1 ring-[var(--line)]',
                            'placeholder:text-[var(--muted)] focus:ring-[var(--ink)]/25 disabled:opacity-60'
                          )}
                        />
                        <span className="pointer-events-none absolute bottom-2.5 right-3 text-[12px] text-[var(--muted)]">
                          {bio.length}/{MAX_BIO}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex justify-end border-t border-[var(--line)] pt-5">
                  <Button
                    type="primary"
                    shape="round"
                    loading={saving}
                    disabled={saving}
                    onClick={() => void onSave()}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </section>

              <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
                <h2 className="mb-5 text-[15px] font-semibold text-[var(--ink)]">
                  {t('account.accountSection')}
                </h2>
                <dl className="max-w-lg space-y-4 text-[14px]">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="shrink-0 text-[var(--muted)]">{t('account.email')}</dt>
                    <dd className="min-w-0 truncate text-right font-medium text-[var(--ink)]">
                      {user?.email || '—'}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="shrink-0 text-[var(--muted)]">{t('account.loginMethod')}</dt>
                    <dd className="text-right font-medium text-[var(--ink)]">{providerLabel}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
                <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
                  {t('account.passwordSection')}
                </h2>
                <p className="mb-5 text-[13px] text-[var(--muted)]">
                  {canChangePassword
                    ? t('account.passwordSectionHint')
                    : t('account.passwordGoogleOnly')}
                </p>
                {canChangePassword ? (
                  <div className="max-w-md space-y-3">
                    <Input
                      size="large"
                      type="outlined"
                      inputType="password"
                      placeholder={t('account.currentPassword')}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="!h-11 !rounded-lg !bg-[var(--account-main)]"
                    />
                    <Input
                      size="large"
                      type="outlined"
                      inputType="password"
                      placeholder={t('account.newPassword')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="!h-11 !rounded-lg !bg-[var(--account-main)]"
                    />
                    <Input
                      size="large"
                      type="outlined"
                      inputType="password"
                      placeholder={t('account.confirmPassword')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void onChangePassword();
                      }}
                      className="!h-11 !rounded-lg !bg-[var(--account-main)]"
                    />
                    <div className="flex justify-end pt-1">
                      <Button
                        type="primary"
                        shape="round"
                        loading={passwordSaving}
                        disabled={passwordSaving}
                        onClick={() => void onChangePassword()}
                      >
                        {t('account.changePassword')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl bg-[var(--account-card)] p-6 ring-1 ring-[var(--line)]">
                <h2 className="mb-5 text-[15px] font-semibold text-[var(--ink)]">
                  {t('account.billingSection')}
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-[200px] flex-1 items-center gap-3 rounded-lg bg-[var(--account-main)] px-3.5 py-3">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ink)]">
                      {t('wallet.goPro')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlansOpen(true)}
                      className="shrink-0 rounded-full bg-[var(--ink)] px-3 py-1.5 text-[13px] font-medium text-[var(--on-brand)] transition hover:opacity-90"
                    >
                      {t('wallet.upgrade')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('usage')}
                    className="min-w-[200px] flex-1 rounded-lg bg-[var(--account-main)] px-3.5 py-3 text-left transition hover:opacity-90"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-[var(--ink)]">
                        {t('wallet.credits')}
                      </span>
                      <span className="text-[12px] tabular-nums text-[var(--muted)]">
                        {t('wallet.creditsRemaining', { count: formatTokens(tokens) })}
                      </span>
                    </div>
                    <div
                      className="flex h-1.5 overflow-hidden rounded-full"
                      role="img"
                      aria-label={t('wallet.creditsBarAria', {
                        used: formatTokens(planUsed),
                        remain: formatTokens(planRemaining),
                        total: formatTokens(creditCap),
                      })}
                    >
                      <div
                        className="h-full bg-[var(--ink)] transition-[width]"
                        style={{ width: `${usedPct}%` }}
                      />
                      <div
                        className="h-full bg-[color-mix(in_srgb,var(--ink)_22%,transparent)] transition-[width]"
                        style={{ width: `${remainPct}%` }}
                      />
                    </div>
                  </button>
                </div>
              </section>

              <p className="pt-1 text-[12px] text-[var(--muted)]">
                <Link
                  to="/privacy"
                  className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
                >
                  {t('auth.privacy')}
                </Link>
                <span className="mx-2 text-[var(--line)]">|</span>
                <Link
                  to="/terms"
                  className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
                >
                  {t('auth.terms')}
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </main>

      <PlansDialog open={plansOpen} onClose={() => setPlansOpen(false)} />
    </div>
  );
}
