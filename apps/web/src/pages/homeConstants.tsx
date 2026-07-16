import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowUpTray,
  HiOutlineClock,
  HiOutlineCodeBracket,
  HiOutlineDocumentPlus,
  HiOutlineFolder,
  HiOutlineHome,
} from 'react-icons/hi2';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';

export function useHomeNavItems() {
  const { t } = useTranslation();
  return [
    { id: 'home', label: t('home.navHome'), icon: HiOutlineHome },
    { id: 'recent', label: t('home.recent'), icon: HiOutlineClock },
    { id: 'mine', label: t('home.mine'), icon: HiOutlineFolder },
  ];
}

export function useHomeCreateMenu(): MenuItemType[] {
  const { t } = useTranslation();
  return [
    {
      key: 'create',
      label: (
        <span className="inline-flex items-center gap-2 text-[12px]">
          <HiOutlineDocumentPlus className="h-3.5 w-3.5" />
          {t('home.createFile')}
        </span>
      ),
    },
    {
      key: 'json',
      label: (
        <span className="inline-flex items-center gap-2 text-[12px]">
          <HiOutlineCodeBracket className="h-3.5 w-3.5" />
          {t('home.importJson')}
        </span>
      ),
    },
    {
      key: 'file',
      label: (
        <span className="inline-flex items-center gap-2 text-[12px]">
          <HiOutlineArrowUpTray className="h-3.5 w-3.5" />
          {t('home.importFile')}
        </span>
      ),
    },
  ];
}
