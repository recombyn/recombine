import { useTranslation } from 'react-i18next';
import { MdLanguage } from 'react-icons/md';
import { HiOutlineCheck } from 'react-icons/hi2';
import { Dropdown } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { SUPPORTED_LANGS } from '@/i18n';
import { cn } from '@/utils/classnames';

const LABEL: Record<string, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
};

type Props = {
  className?: string;
  variant?: 'light' | 'ghost';
};

export default function LanguageSwitcher({ className, variant = 'light' }: Props) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage || i18n.language || 'zh-CN';
  const currentLabel = LABEL[current] || LABEL['zh-CN'];

  const items: MenuItemType[] = SUPPORTED_LANGS.map(({ code }) => ({
    key: code,
    label: (
      <span className="flex w-full items-center justify-between gap-6">
        <span>{LABEL[code]}</span>
        {current === code ? (
          <HiOutlineCheck className="h-4 w-4 text-[var(--ink)]" strokeWidth={2.5} />
        ) : null}
      </span>
    ),
  }));

  return (
    <Dropdown
      trigger="click"
      placement="bottom-end"
      offset={6}
      items={items}
      onClick={(key) => {
        void i18n.changeLanguage(key).then(() => {
          document.documentElement.lang = key;
        });
      }}
      popupClassName="rounded-lg min-w-[160px] !bg-[var(--surface)] py-1 shadow-[0_8px_28px_rgba(31,35,41,0.16)] ring-1 ring-[var(--line)]"
      itemClassName="!rounded-md"
      floatingClassName="z-[80]"
    >
      <button
        type="button"
        title={t('lang.label')}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition',
          variant === 'light' &&
            'bg-[var(--color-background-default-secondary)] text-[var(--ink)] hover:bg-[var(--accent-soft)]',
          variant === 'ghost' &&
            'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]',
          className
        )}
      >
        <MdLanguage className="h-4 w-4 shrink-0" />
        <span>{currentLabel}</span>
      </button>
    </Dropdown>
  );
}
