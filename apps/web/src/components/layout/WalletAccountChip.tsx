import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaCoins } from 'react-icons/fa6';
import { HiOutlineUser, HiOutlineUserPlus } from 'react-icons/hi2';
import { Dropdown } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import UserAccountPanel, {
  formatCny,
  userInitial,
} from '@/components/layout/UserAccountPanel';
import { cn } from '@/utils/classnames';

type Props = {
  className?: string;
};

/** Balance + avatar pill (home header / editor chrome). */
export default function WalletAccountChip({ className }: Props) {
  const { t } = useTranslation();
  const user = useSelector((state: any) => state.auth.user);
  const balance = useSelector((state: any) => state.wallet?.balance ?? 0);
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);

  const guestMenu: MenuItemType[] = [
    {
      key: 'login',
      label: (
        <span className="inline-flex items-center gap-2">
          <HiOutlineUser className="h-4 w-4" />
          {t('home.login')}
        </span>
      ),
    },
    {
      key: 'register',
      label: (
        <span className="inline-flex items-center gap-2">
          <HiOutlineUserPlus className="h-4 w-4" />
          {t('home.register')}
        </span>
      ),
    },
  ];

  if (user) {
    return (
      <UserAccountPanel open={accountOpen} onOpenChange={setAccountOpen}>
        <button
          type="button"
          className={cn(
            'pointer-events-auto flex h-8 max-w-[11rem] items-center gap-2 rounded-full bg-[var(--accent-soft)] pl-2.5 pr-0.5 transition hover:opacity-90',
            className
          )}
          title={`${user.name || user.email} · ¥${formatCny(balance)}`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--ink)]">
            <FaCoins className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" aria-hidden />
            <span className="min-w-0 truncate text-[12px] font-medium tabular-nums">
              ¥{formatCny(balance, { compact: true })}
            </span>
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-[12px] font-semibold text-[var(--on-brand)]">
            {userInitial(user.name, user.email)}
          </span>
        </button>
      </UserAccountPanel>
    );
  }

  return (
    <Dropdown
      trigger="click"
      placement="bottom-end"
      offset={6}
      items={guestMenu}
      onClick={(key) => {
        if (key === 'login') navigate('/login');
        if (key === 'register') navigate('/register');
      }}
      popupClassName="rounded-lg min-w-[140px] !bg-[var(--surface)] shadow-[0_8px_28px_rgba(12,12,13,0.12)] ring-1 ring-[var(--line)]"
      floatingClassName="z-50"
    >
      <button
        type="button"
        title={t('home.account')}
        className={cn(
          'pointer-events-auto flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-[12px] font-semibold text-[var(--on-brand)] transition hover:opacity-90',
          className
        )}
      >
        <HiOutlineUser className="h-4 w-4" />
      </button>
    </Dropdown>
  );
}
