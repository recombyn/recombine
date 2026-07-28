import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft, HiOutlinePencil } from 'react-icons/hi2';
import { getMe, updateProfile } from '@/apis/auth';
import { fetchWallet } from '@/apis/wallet';
import { Button, Input, message, ProgressBar } from '@/components/base';
import AccountSettingsDialog from '@/components/layout/AccountSettingsDialog';
import WalletLedgerPanel from '@/components/layout/WalletLedgerPanel';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import AgentModelsPanel from '@/components/editor/panels/agent/AgentModelsPanel';
import { setSession, setUser, type AuthUser } from '@/store/modules/auth';
import { syncFromServer } from '@/store/modules/wallet';
import { formatTokens, type LedgerEntry } from '@/utils/wallet';
import { getToken } from '@/utils/token';
import { readReturnToParam } from '@/utils/authReturnTo';
import { docsUrl } from '@/utils/docsUrl';
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

type ProfileValidateResult =
  | { ok: true; name: string; bio: string | null }
  | { ok: false; warnKey: string };

function validateProfileFields(opts: {
  name: string;
  bio: string;
  hasUser: boolean;
}): ProfileValidateResult {
  const trimmed = opts.name.trim();
  if (!trimmed) return { ok: false, warnKey: 'me.nameRequired' };
  if (trimmed.length > 40 || !NAME_RE.test(trimmed)) return { ok: false, warnKey: 'me.nameHint' };
  if (!opts.hasUser) return { ok: false, warnKey: 'me.needLogin' };
  return { ok: true, name: trimmed, bio: opts.bio.trim().slice(0, MAX_BIO) || null };
}

function avatarFileRejectReason(file: File): 'type' | 'size' | null {
  if (!file.type.startsWith('image/')) return 'type';
  if (file.size > MAX_AVATAR_MB * 1024 * 1024) return 'size';
  return null;
}

function readAvatarDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      resolve(url.startsWith('data:image/') ? url : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            },
            token: getToken() || undefined,
          })
        );
        if (typeof res.tokens === 'number') {
          dispatch(syncFromServer({ tokens: res.tokens, planId: (res as any).planId }));
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

  const onAvatarFile = (file: File | null) => {
    if (!file || saving) return;
    const reject = avatarFileRejectReason(file);
    if (reject === 'type') {
      message.warning(t('me.avatarTypeError'));
      return;
    }
    if (reject === 'size') {
      message.warning(t('me.avatarSizeError', { mb: MAX_AVATAR_MB }));
      return;
    }
    void readAvatarDataUrl(file).then((url) => {
      if (url) setAvatar(url);
    });
  };

  const onSave = async () => {
    const checked = validateProfileFields({ name, bio, hasUser: Boolean(user) });
    if (checked.ok === false) {
      message.warning(t(checked.warnKey));
      return;
    }
    if (!user || saving) return;
    setSaving(true);
    try {
      const res = await updateProfile({ name: checked.name, bio: checked.bio, avatar });
      dispatch(
        setUser({
          ...user,
          id: res.user.id || user.id,
          name: res.user.name,
          bio: res.user.bio ?? checked.bio,
          avatar: res.user.avatar ?? avatar,
          email: res.user.email || user.email,
          provider: res.user.provider || user.provider,
        })
      );
      message.success(t('me.profileSaved'));
    } catch {
      message.error(t('home.casesLoadFailed'));
    } finally {
      setSaving(false);
    }
  };


  const providerLabel =
    user?.provider === 'google' ? t('account.loginGoogle') : t('account.loginEmail');

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
                      onClick={() => setSettingsOpen(true)}
                      className="shrink-0 rounded-xl bg-[var(--ink)] px-3 py-1.5 text-[13px] font-medium text-[var(--on-brand)] transition hover:opacity-90"
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
                    <ProgressBar
                      percent={usedPct}
                      active
                      height={8}
                      aria-label={t('wallet.creditsBarAria', {
                        used: formatTokens(planUsed),
                        remain: formatTokens(planRemaining),
                        total: formatTokens(creditCap),
                      })}
                    />
                  </button>
                </div>
              </section>

              <p className="pt-1 text-[12px] text-[var(--muted)]">
                <a
                  href={docsUrl('/legal/privacy')}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
                >
                  {t('auth.privacy')}
                </a>
                <span className="mx-2 text-[var(--line)]">|</span>
                <a
                  href={docsUrl('/legal/terms')}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--ink)]"
                >
                  {t('auth.terms')}
                </a>
              </p>
            </div>
          ) : null}
        </div>
      </main>

      <AccountSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab="plans"
      />
    </div>
  );
}
