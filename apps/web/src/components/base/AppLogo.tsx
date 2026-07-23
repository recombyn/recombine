import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

export type LogoScheme = 'dark' | 'light';

type Props = {
  /** Outer square size in px. */
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
 * Brand mark 1:1 from static SVG (not Icon sprite — gradients/clipPath break under `<use>`).
 * Files: `/logo-mark.svg`, `/logo-mark-light.svg`
 * Scale: pass `size` (e.g. 48 / 64 / 96).
 */
export default function AppLogo({
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

  const src = resolved === 'light' ? '/logo-mark-light.svg' : '/logo-mark.svg';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        bordered && 'ring-1 ring-[var(--line)]',
        className
      )}
      style={{
        width: size,
        height: size,
        ...(bordered ? { borderRadius: '36%' } : null),
      }}
    >
      <img
        src={src}
        alt={t('app.name')}
        width={size}
        height={size}
        className="block h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
