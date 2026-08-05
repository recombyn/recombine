import { useEffect, useState, type ReactNode, memo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { getMe } from '@/apis/auth';
import { fetchWallet } from '@/apis/wallet';
import AccountSettingsDialog from '@/components/layout/AccountSettingsDialog';
import WalletLedgerPanel from '@/components/layout/WalletLedgerPanel';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import AgentModelsPanel from '@/components/editor/panels/agent/AgentModelsPanel';
import AccountProfileTab from '@/components/account/AccountProfileTab';
import { setSession, type AuthUser } from '@/store/modules/auth';
import { syncFromServer } from '@/store/modules/wallet';
import type { LedgerEntry } from '@/utils/wallet';
import { getToken } from '@/utils/token';
import { readReturnToParam } from '@/utils/authReturnTo';
import { cn } from '@/utils/classnames';

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

/** Account hub — left nav + profile / usage / agent panels. */
function AccountSettingsPage(): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const user = useSelector((s: any) => s.auth.user as AuthUser | null);
  const tokens = useSelector((s: any) => s.wallet?.tokens ?? 0);
  const creditsIncluded = useSelector((s: any) => s.wallet?.creditsIncluded ?? 150);
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

  const creditCap = Math.max(1, Number(creditsIncluded) || 150);
  const balance = Math.max(0, Number(tokens) || 0);
  const planRemaining = Math.min(balance, creditCap);
  const planUsed = Math.max(0, creditCap - planRemaining);
  const usedPct = Math.min(100, Math.round((planUsed / creditCap) * 100));

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
            <AccountProfileTab
              user={user}
              tokens={tokens}
              creditCap={creditCap}
              planUsed={planUsed}
              planRemaining={planRemaining}
              usedPct={usedPct}
              onOpenPlans={() => setSettingsOpen(true)}
              onGoUsage={() => setTab('usage')}
            />
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

export default memo(AccountSettingsPage);
