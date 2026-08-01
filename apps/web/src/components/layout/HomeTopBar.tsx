import { useMemo, memo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBars3,
  HiOutlineFolder,
  HiOutlineHome,
  HiOutlineUser,
} from 'react-icons/hi2';
import { Dropdown } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import AuthHeader from '@/components/layout/AuthHeader';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { getToken } from '@/utils/token';

type Props = {
  setNav: (id: string) => void;
};

/** Floating top-right — account chip; mobile also has nav menu after avatar. */
function HomeTopBar({ setNav }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useSelector((state: any) => state.auth?.user?.id) as string | undefined;
  const authed = Boolean(userId && getToken());

  const goNav = (id: 'home' | 'mine' | 'account') => {
    if ((id === 'mine' || id === 'account') && !authed) {
      navigate(buildLoginUrl('/home'));
      return;
    }
    setNav(id);
  };

  const mobileNavItems: MenuItemType[] = useMemo(
    () => [
      {
        key: 'home',
        label: (
          <span className="inline-flex items-center gap-2">
            <HiOutlineHome className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.5} />
            {t('home.navHome')}
          </span>
        ),
      },
      {
        key: 'account',
        label: (
          <span className="inline-flex items-center gap-2">
            <HiOutlineUser className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.5} />
            {t('home.account')}
          </span>
        ),
      },
      {
        key: 'mine',
        label: (
          <span className="inline-flex items-center gap-2">
            <HiOutlineFolder className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.5} />
            {t('home.mine')}
          </span>
        ),
      },
    ],
    [t]
  );

  return (
    <div className="pointer-events-none fixed right-0 top-0 z-40 flex h-14 items-center justify-end px-4 md:absolute md:z-10 md:h-auto md:p-5">
      <div className="pointer-events-auto flex items-center gap-1.5">
        <AuthHeader />
        <Dropdown
          trigger="click"
          placement="bottom-end"
          strategy="fixed"
          offset={8}
          items={mobileNavItems}
          onClick={(key) => {
            if (key === 'home' || key === 'mine' || key === 'account') {
              goNav(key);
            }
          }}
          floatingClassName="z-[600]"
          popupClassName="min-w-[10rem] rounded-xl !bg-[var(--surface)] p-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-[var(--line)]"
        >
          <button
            type="button"
            aria-label={t('home.navHome')}
            aria-haspopup="menu"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] md:hidden"
          >
            <HiOutlineBars3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </Dropdown>
      </div>
    </div>
  );
}

export default memo(HomeTopBar);
