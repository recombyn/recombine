import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  HiOutlineBolt,
  HiOutlineChevronRight,
  HiOutlineGlobeAlt,
  HiOutlineInformationCircle,
  HiOutlineMoon,
  HiOutlineUserCircle,
} from 'react-icons/hi2';
import { message } from '@/components/base';
import PlansDialog from '@/components/layout/PlansDialog';
import { getMe, logout as logoutRemote } from '@/apis/auth';
import { fetchWallet } from '@/apis/wallet';
import { logout, setSession } from '@/store/modules/auth';
import { formatTokens, planLabelKey, type LedgerEntry, type PlanId } from '@/utils/wallet';
import { clearWallet, syncFromServer } from '@/store/modules/wallet';
import { getToken } from '@/utils/token';
import { SUPPORTED_LANGS } from '@/i18n';
import { applyTheme, getStoredThemeMode, type ThemeMode } from '@/theme';
import { cn } from '@/utils/classnames';

function userInitial(name?: string, email?: string) {
  const raw = (name || email || 'U').trim();
  return (raw[0] || 'U').toUpperCase();
}

/** Shared avatar — same image / brand fallback everywhere (chip + menu). */
function UserAvatar({
  name,
  email,
  avatar,
  size = 40,
  className,
}: {
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  size?: number;
  className?: string;
}) {
  const url = typeof avatar === 'string' && avatar.trim() ? avatar.trim() : null;
  const dim = `${size}px`;
  const isBrandLogo =
    url != null && /\/logo(-mark|192|512)?\.png(?:\?|$)/i.test(url.split('?')[0] || '');
  if (url && isBrandLogo) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-[var(--line)]',
          className
        )}
        style={{ width: dim, height: dim, backgroundColor: '#ffffff' }}
      >
        <img
          src="/logo-mark.png"
          alt=""
          className="h-[86%] w-[86%] object-contain"
          draggable={false}
        />
      </span>
    );
  }
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={cn(
          'shrink-0 rounded-full object-cover ring-1 ring-[var(--line)]',
          className
        )}
        style={{ width: dim, height: dim }}
      />
    );
  }
  const fontSize = Math.max(11, Math.round(size * 0.36));
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-semibold text-[var(--on-brand)]',
        className
      )}
      style={{ width: dim, height: dim, fontSize }}
    >
      {userInitial(name || undefined, email || undefined)}
    </span>
  );
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
  icon?: ReactNode;
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
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]',
        active && 'bg-[var(--accent-soft)]'
      )}
    >
      {icon ? <span className="inline-flex shrink-0 text-[var(--ink)]">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

const MENU_ICON = 'h-[18px] w-[18px] shrink-0';
const MENU_STROKE = 1.6;

/** Prefer opening to the right (chevron direction); flip left only when clipped. */
function SideFlyout({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState<'right' | 'left'>('right');

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const row = el?.parentElement;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const need = 160;
    const spaceRight = window.innerWidth - rect.right - 8;
    setSide(spaceRight >= need ? 'right' : 'left');
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn(
        'absolute top-0 z-10',
        side === 'right'
          ? 'left-full pl-[calc(0.5rem+10px)]'
          : 'right-full pr-[calc(0.5rem+10px)]'
      )}
    >
      <div
        className={cn(
          'min-w-[148px] overflow-hidden rounded-lg bg-white py-1',
          'shadow-[0_12px_40px_rgba(12,12,13,0.16)] ring-1 ring-[var(--line)]'
        )}
        style={{ backgroundColor: 'var(--surface)' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function UserAccountPanel({ open, onOpenChange, children }: Props) {
  const { t, i18n } = useTranslation();
  const user = useSelector((state: any) => state.auth.user);
  const tokens = useSelector((state: any) => state.wallet?.tokens ?? 0);
  const planId = useSelector((state: any) => state.wallet?.planId ?? 'free') as PlanId;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [plansOpen, setPlansOpen] = useState(false);
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

  useEffect(() => {
    if (!open || !user || !getToken()) return;
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
  }, [open, user?.id, dispatch]);

  const close = () => onOpenChange(false);

  const currentLang = i18n.resolvedLanguage || i18n.language || 'zh-CN';
  const currentLangLabel = LANG_LABEL[currentLang] || LANG_LABEL['zh-CN'];

  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'light', label: t('theme.light') },
    { mode: 'dark', label: t('theme.dark') },
    { mode: 'system', label: t('theme.system') },
  ];
  const themeOption =
    themeOptions.find((o) => o.mode === themeMode) || themeOptions[themeOptions.length - 1];
  const themeLabel = themeOption.label;
  const planLabel = t(planLabelKey(planId));

  const doLogout = () => {
    dispatch(logout());
    dispatch(clearWallet());
    void logoutRemote().catch(() => undefined);
    message.success(t('home.loggedOut'));
    close();
    navigate('/login', { replace: true });
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

  const openPlans = () => {
    close();
    setPlansOpen(true);
  };

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
            className="z-[600] w-[250px]"
          >
            <div
              className="overflow-visible rounded-xl shadow-[0_12px_40px_rgba(12,12,13,0.16)] ring-1 ring-[var(--line)]"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-3.5 pb-3 pt-3.5">
                <UserAvatar
                  name={user?.name}
                  email={user?.email}
                  avatar={user?.avatar}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[var(--ink)]">
                    {user?.name || user?.email || t('home.account')}
                  </div>
                  {user?.email ? (
                    <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">
                      {user.email}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Plan + upgrade */}
              <div className="border-t border-[var(--line)] px-3.5 py-3">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    window.open('/account?tab=usage', '_blank', 'noopener,noreferrer');
                  }}
                  className="mb-2.5 flex w-full items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--ink)]">
                    {planLabel}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[13px] tabular-nums text-[var(--muted)]">
                    <HiOutlineBolt className="h-3.5 w-3.5" strokeWidth={MENU_STROKE} aria-hidden />
                    {formatTokens(tokens)}
                    <HiOutlineChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={openPlans}
                  className="flex w-full items-center justify-center rounded-lg bg-[var(--ink)] px-3 py-2.5 text-[13px] font-medium text-[var(--on-brand)] transition hover:opacity-90"
                >
                  {t('wallet.upgrade')}
                </button>
              </div>

              {/* Menu */}
              <div className="border-t border-[var(--line)] px-1.5 py-1.5">
                <div
                  className="relative"
                  onMouseEnter={() => setFlyout('lang')}
                  onMouseLeave={() => setFlyout((v) => (v === 'lang' ? null : v))}
                >
                  <MenuRow
                    icon={
                      <HiOutlineGlobeAlt className={MENU_ICON} strokeWidth={MENU_STROKE} aria-hidden />
                    }
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
                          className={cn(
                            'flex w-full items-center px-3 py-2 text-left text-[13px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]',
                            currentLang === code && 'font-medium'
                          )}
                        >
                          {LANG_LABEL[code]}
                        </button>
                      ))}
                    </SideFlyout>
                  ) : null}
                </div>

                <div
                  className="relative"
                  onMouseEnter={() => setFlyout('theme')}
                  onMouseLeave={() => setFlyout((v) => (v === 'theme' ? null : v))}
                >
                  <MenuRow
                    icon={
                      <HiOutlineMoon className={MENU_ICON} strokeWidth={MENU_STROKE} aria-hidden />
                    }
                    label={`${t('theme.label')} · ${themeLabel}`}
                    active={flyout === 'theme'}
                    onClick={() => setFlyout((v) => (v === 'theme' ? null : 'theme'))}
                    trailing={
                      <HiOutlineChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                    }
                  />
                  {flyout === 'theme' ? (
                    <SideFlyout>
                      {themeOptions.map(({ mode, label }) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => changeTheme(mode)}
                          className={cn(
                            'flex w-full items-center px-3 py-2 text-left text-[13px] text-[var(--ink)] transition hover:bg-[var(--accent-soft)]',
                            themeMode === mode && 'font-medium'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </SideFlyout>
                  ) : null}
                </div>

                <MenuRow
                  icon={
                    <HiOutlineUserCircle className={MENU_ICON} strokeWidth={MENU_STROKE} aria-hidden />
                  }
                  label={t('wallet.menuManageAccount')}
                  onClick={() => {
                    close();
                    window.open('/account', '_blank', 'noopener,noreferrer');
                  }}
                />

                <MenuRow
                  icon={
                    <HiOutlineInformationCircle
                      className={MENU_ICON}
                      strokeWidth={MENU_STROKE}
                      aria-hidden
                    />
                  }
                  label={t('about.title')}
                  onClick={() => {
                    close();
                    window.open('/about', '_blank', 'noopener,noreferrer');
                  }}
                />
              </div>

              {/* Logout */}
              <div className="border-t border-[var(--line)] px-1.5 py-1.5">
                <MenuRow
                  icon={
                    <HiOutlineArrowRightOnRectangle
                      className={MENU_ICON}
                      strokeWidth={MENU_STROKE}
                      aria-hidden
                    />
                  }
                  label={t('home.logout')}
                  onClick={doLogout}
                />
              </div>
            </div>
          </div>
        </FloatingPortal>
      ) : null}

      <PlansDialog open={plansOpen} onClose={() => setPlansOpen(false)} />
    </>
  );
}

export { userInitial, UserAvatar };
