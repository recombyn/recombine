import { useEffect, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

export type LogoScheme = 'dark' | 'light';

type Props = {
  /** Outer square size in px — always rendered 1:1. */
  size?: number;
  className?: string;
  bordered?: boolean;
  /** Force dark/light mark; default follows `data-theme`. */
  scheme?: LogoScheme | 'auto';
};

function readResolvedScheme(): LogoScheme {
  if (typeof document === 'undefined') return 'dark';
  // Light UI → dark (black) badge; dark UI → light (white) badge.
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
}

/**
 * Brand mark — raster PNG via `<img src>` (`/logo-mark.png`, `/logo-mark-light.png`).
 * Used by: HomeBody, LoginDialog, EditorBootOverlay.
 */
function AppLogo({
  size = 36,
  className,
  bordered = false,
  scheme = 'auto',
}: Props) {
  const { t } = useTranslation();
  const [resolved, setResolved] = useState<LogoScheme>(() =>
    scheme === 'auto' ? readResolvedScheme() : scheme
  );

  useEffect(() => {
    if (scheme !== 'auto') {
      setResolved(scheme);
      return;
    }
    const sync = () => setResolved(readResolvedScheme());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => obs.disconnect();
  }, [scheme]);

  const src = resolved === 'light' ? '/logo-mark-light.png' : '/logo-mark.png';

  return (
    <img
      src={src}
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
