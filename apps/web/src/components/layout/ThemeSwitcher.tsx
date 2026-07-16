import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { HiOutlineComputerDesktop, HiOutlineMoon, HiOutlineSun } from 'react-icons/hi2';
import { applyTheme, getStoredThemeMode, type ThemeMode } from '@/theme';
import { cn } from '@/utils/classnames';

/** Segmented theme switcher — style aligned ThemeSwitcher */
export default function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ThemeMode>(() => getStoredThemeMode());

  const options: { mode: ThemeMode; Icon: typeof HiOutlineSun; title: string }[] = [
    { mode: 'system', Icon: HiOutlineComputerDesktop, title: t('theme.system') },
    { mode: 'dark', Icon: HiOutlineMoon, title: t('theme.dark') },
    { mode: 'light', Icon: HiOutlineSun, title: t('theme.light') },
  ];

  const selectMode = (next: ThemeMode) => {
    if (next === mode) return;
    // Apply CSS tokens in the same tick as the UI state — avoid one-frame lag flash.
    applyTheme(next);
    setMode(next);
  };

  return (
    <div
      className={cn(
        'flex h-8 items-center justify-center gap-1 rounded-full bg-[var(--color-background-default-secondary)] px-1',
        className
      )}
      role="group"
      aria-label={t('theme.label')}
    >
      {options.map(({ mode: m, Icon, title }) => {
        const selected = mode === m;
        return (
          <button
            key={m}
            type="button"
            title={title}
            aria-pressed={selected}
            onClick={() => selectMode(m)}
            className={cn(
              // Only shadow/opacity — not background/color (those flash on CSS-var theme swaps)
              'flex h-7 w-8 items-center justify-center rounded-2xl transition-[box-shadow,opacity]',
              selected
                ? 'bg-[var(--color-background-default-base)] text-[var(--color-icon-base)] shadow-[0_1px_4px_rgba(12,12,13,0.08)]'
                : 'text-[var(--color-icon-secondary)] hover:bg-[var(--color-background-default-base)]/60 hover:text-[var(--color-icon-secondary-hover)]'
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
