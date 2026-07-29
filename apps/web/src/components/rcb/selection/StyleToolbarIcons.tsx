import { cn } from '@/utils/classnames';
import type { CSSProperties } from 'react';

const CHECKER: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)',
  backgroundSize: '6px 6px',
  backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
};

/** 16×16 circular fill swatch — darker ring so white/near-white fills stay visible. */
export function FillColorSwatch({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-[#b3b3b3]',
        className
      )}
    >
      <span aria-hidden className="absolute inset-0" style={CHECKER} />
      <span className="absolute inset-0" style={{ background: color }} />
    </span>
  );
}

/** 16×16 circular stroke ring — same outer size as FillColorSwatch. */
export function StrokeColorSwatch({
  color = 'currentColor',
  className,
}: {
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 rounded-full border-[3.5px] bg-transparent',
        className
      )}
      style={{ borderColor: color }}
      aria-hidden
    />
  );
}

/** Corner-radius mark. */
export function IconCornerRadius({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 12.5V7.25A3.75 3.75 0 0 1 7.25 3.5H12.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
