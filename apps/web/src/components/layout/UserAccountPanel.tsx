import { useEffect, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineCheck,
  HiOutlineChevronRight,
  HiOutlineComputerDesktop,
  HiOutlineCreditCard,
  HiOutlineDocumentText,
  HiOutlineMoon,
  HiOutlineQuestionMarkCircle,
  HiOutlineSun,
  HiOutlineUser,
} from 'react-icons/hi2';
import { MdLanguage } from 'react-icons/md';
import { FaCoins } from 'react-icons/fa6';
import { message } from '@/components/base';
import BillingDialog from '@/components/layout/BillingDialog';
import RechargeDialog from '@/components/layout/RechargeDialog';
import { logout as logoutRemote } from '@/apis/auth';
import { logout } from '@/store/modules/auth';
import { SUPPORTED_LANGS } from '@/i18n';
import { applyTheme, getStoredThemeMode, type ThemeMode } from '@/theme';
import { cn } from '@/utils/classnames';

function userInitial(name?: string, email?: string) {
  const raw = (name || email || 'U').trim();
  return (raw[0] || 'U').toUpperCase();
}

function formatCny(n: number, opts?: { compact?: boolean }) {
  const value = Number.isFinite(n) ? n : 0;
  if (opts?.compact && Math.abs(value) >= 1_000_000) {
    return value.toLocaleString('zh-CN', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const LANG_LABEL: Record<string, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

type FlyoutKind = 'lang' | 'theme' | null;

function MenuRow({
  icon,
  label,
  onClick,
  trailing,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]',
        active && 'bg-[var(--accent-soft)]'
      )}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--muted)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

function SideFlyout({ children }: { children: ReactNode }) {
  return (
    // Anchored to the menu row (inset by parent px-2 / 0.5rem). Padding =
    // that inset + ≥10px gap to the panel edge; also a hover bridge so the
    // flyout stays open while the pointer crosses the gap.
    <div className="absolute right-full top-0 z-10 pr-[calc(0.5rem+10px)]">
      <div
        className={cn(
          'min-w-[148px] overflow-hidden rounded-xl bg-[var(--surface)] py-1',
          'shadow-[0_12px_40px_rgba(12,12,13,0.16)] ring-1 ring-[var(--line)]'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default function UserAccountPanel({ open, onOpenChange, children }: Props) {
  const { t, i18n } = useTranslation();
  const user = useSelector((state: any) => state.auth.user);
  const balance = useSelector((state: any) => state.wallet?.balance ?? 0);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [billingOpen, setBillingOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [flyout, setFlyout] = useState<FlyoutKind>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  useEffect(() => {
    if (!open) setFlyout(null);
  }, [open]);

  const close = () => onOpenChange(false);

  const currentLang = i18n.resolvedLanguage || i18n.language || 'zh-CN';
  const currentLangLabel = LANG_LABEL[currentLang] || LANG_LABEL['zh-CN'];

  const themeOptions: { mode: ThemeMode; Icon: typeof HiOutlineSun; label: string }[] = [
    { mode: 'light', Icon: HiOutlineSun, label: t('theme.light') },
    { mode: 'dark', Icon: HiOutlineMoon, label: t('theme.dark') },
    { mode: 'system', Icon: HiOutlineComputerDesktop, label: t('theme.system') },
  ];
  const themeOption =
    themeOptions.find((o) => o.mode === themeMode) || themeOptions[themeOptions.length - 1];
  const themeLabel = themeOption.label;
  const ThemeIcon = themeOption.Icon;

  const doLogout = () => {
    void logoutRemote().catch(() => undefined);
    dispatch(logout());
    message.success(t('home.loggedOut'));
    close();
    navigate('/login');
  };

  const soon = (key: string) => {
    message.loading(t(key), 2);
  };

  const changeLang = (code: string) => {
    void i18n.changeLanguage(code).then(() => {
      document.documentElement.lang = code;
    });
    setFlyout(null);
  };

  const changeTheme = (next: ThemeMode) => {
    applyTheme(next);
    setThemeMode(next);
    setFlyout(null);
  };

  const menu = [
    {
      key: 'profile',
      icon: HiOutlineUser,
      label: t('wallet.menuProfile'),
      onClick: () => soon('wallet.comingSoon'),
    },
    {
      key: 'billing',
      icon: HiOutlineCreditCard,
      label: t('wallet.menuBilling'),
      onClick: () => {
        close();
        setBillingOpen(true);
      },
    },
    {
      key: 'feedback',
      icon: HiOutlineChatBubbleBottomCenterText,
      label: t('wallet.menuFeedback'),
      onClick: () => soon('wallet.comingSoon'),
    },
    {
      key: 'docs',
      icon: HiOutlineDocumentText,
      label: t('wallet.menuDocs'),
      onClick: () => soon('wallet.comingSoon'),
    },
    {
      key: 'faq',
      icon: HiOutlineQuestionMarkCircle,
      label: t('wallet.menuFaq'),
      onClick: () => soon('wallet.comingSoon'),
    },
  ];

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()} className="inline-flex">
        {children}
      </div>
      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[600] w-[300px]"
          >
            <div className="overflow-visible rounded-xl bg-[var(--surface)] shadow-[0_12px_40px_rgba(12,12,13,0.18)] ring-1 ring-[var(--line)]">
              <div className="overflow-hidden rounded-t-xl">
                <div className="flex items-start gap-3 px-4 pb-3 pt-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[14px] font-semibold text-[var(--on-brand)]">
                    {userInitial(user?.name, user?.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[var(--ink)]">
                      {user?.name || user?.email || t('home.account')}
                    </div>
                    {user?.email ? (
                      <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{user.email}</div>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] ring-1 ring-[var(--line)]">
                    {t('wallet.planFree')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setRechargeOpen(true);
                    }}
                    className="rounded-lg bg-[var(--accent)] px-2 py-2 text-[12px] font-medium text-[var(--on-brand)] transition hover:opacity-90"
                  >
                    {t('wallet.topUp')}
                  </button>
                  <button
                    type="button"
                    onClick={() => soon('wallet.comingSoon')}
                    className="rounded-lg bg-[var(--canvas)] px-2 py-2 text-[12px] font-medium text-[var(--ink)] ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)]"
                  >
                    {t('wallet.upgrade')}
                  </button>
                </div>

                <div className="px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setRechargeOpen(true);
                    }}
                    className="w-full overflow-hidden rounded-xl bg-[var(--canvas)] px-3 py-3 text-left transition hover:bg-[var(--accent-soft)]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FaCoins className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                      <span
                        className="min-w-0 flex-1 truncate text-[15px] font-semibold tabular-nums text-[var(--ink)]"
                        title={`¥${formatCny(balance)}`}
                      >
                        ¥{formatCny(balance)}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] text-[var(--muted)]">
                        {t('wallet.balance')}
                        <HiOutlineChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="mt-2 break-words text-[11px] leading-snug text-[var(--muted)]">
                      {t('wallet.balanceTip')}
                    </p>
                  </button>
                </div>
              </div>

              <div className="border-t border-[var(--line)] px-2 py-1.5">
                {menu.map(({ key, icon: Icon, label, onClick }) => (
                  <MenuRow
                    key={key}
                    icon={<Icon className="h-4 w-4" />}
                    label={label}
                    onClick={onClick}
                  />
                ))}

                {/* Language — fig.2 list + side flyout */}
                <div
                  className="relative"
                  onMouseEnter={() => setFlyout('lang')}
                  onMouseLeave={() => setFlyout((v) => (v === 'lang' ? null : v))}
                >
                  <MenuRow
                    icon={<MdLanguage className="h-4 w-4" />}
                    label={currentLangLabel}
                    active={flyout === 'lang'}
                    onClick={() => setFlyout((v) => (v === 'lang' ? null : 'lang'))}
                    trailing={
                      <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                    }
                  />
                  {flyout === 'lang' ? (
                    <SideFlyout>
                      {SUPPORTED_LANGS.map(({ code }) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => changeLang(code)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
                        >
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                            {currentLang === code ? (
                              <HiOutlineCheck className="h-4 w-4 text-[var(--ink)]" strokeWidth={2.5} />
                            ) : null}
                          </span>
                          <span>{LANG_LABEL[code]}</span>
                        </button>
                      ))}
                    </SideFlyout>
                  ) : null}
                </div>

                {/* Theme — same list style + side flyout */}
                <div
                  className="relative"
                  onMouseEnter={() => setFlyout('theme')}
                  onMouseLeave={() => setFlyout((v) => (v === 'theme' ? null : v))}
                >
                  <MenuRow
                    icon={<ThemeIcon className="h-4 w-4" />}
                    label={`${t('theme.label')} · ${themeLabel}`}
                    active={flyout === 'theme'}
                    onClick={() => setFlyout((v) => (v === 'theme' ? null : 'theme'))}
                    trailing={
                      <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                    }
                  />
                  {flyout === 'theme' ? (
                    <SideFlyout>
                      {themeOptions.map(({ mode, Icon, label }) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => changeTheme(mode)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
                        >
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                            {themeMode === mode ? (
                              <HiOutlineCheck className="h-4 w-4 text-[var(--ink)]" strokeWidth={2.5} />
                            ) : null}
                          </span>
                          <Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </SideFlyout>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[var(--line)] px-2 py-1.5">
                <button
                  type="button"
                  onClick={doLogout}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-[var(--accent-soft)]',
                    'text-red-500'
                  )}
                >
                  <HiOutlineArrowRightOnRectangle className="h-4 w-4 shrink-0" />
                  {t('home.logout')}
                </button>
              </div>
            </div>
          </div>
        </FloatingPortal>
      ) : null}

      <RechargeDialog open={rechargeOpen} onClose={() => setRechargeOpen(false)} />
      <BillingDialog open={billingOpen} onClose={() => setBillingOpen(false)} />
    </>
  );
}

export { formatCny, userInitial };
