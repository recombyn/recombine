import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

export type LogoScheme = 'dark' | 'light';

type Props = {
  /** Outer square size in px — always rendered 1:1. */
  size?: number;
  className?: string;
  bordered?: boolean;
  /**
   * Kept for call-site compat. Mark asset is the dark-plate PNG (readable on light and dark rails).
   * @deprecated Prefer omitting — both themes use `/logo-mark.png`.
   */
  scheme?: LogoScheme | 'auto';
};

/**
 * Brand mark — `/logo-mark.png` (white feather on dark plate).
 * Used by: HomeBody, LoginDialog, EditorBootOverlay.
 */
function AppLogo({
  size = 36,
  className,
  bordered = false,
}: Props) {
  const { t } = useTranslation();

  return (
    <img
      src="/logo-mark.png"
      alt={t('app.name')}
      width={size}
      height={size}
      draggable={false}
      className={cn('block shrink-0', className)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
        aspectRatio: '1 / 1',
        objectFit: 'contain',
        flex: '0 0 auto',
        // Beat Tailwind preflight `img { height: auto }`
        // so flex parents cannot stretch the bitmap.
        ...(bordered
          ? { borderRadius: '36%', boxShadow: 'inset 0 0 0 1px var(--line)' }
          : null),
      }}
    />
  );
}

export default memo(AppLogo);
