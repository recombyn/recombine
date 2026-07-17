import { cn } from '@/utils/classnames';

/**
 * Shared project / plaza cover frame (fig.3):
 * landscape 4:3, rounded, border, soft shadow — home + me page.
 */
export const PROJECT_THUMB_ASPECT = '4 / 3' as const;

export const projectThumbFrameClass = (extra?: string) =>
  cn(
    'relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]',
    'shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition',
    'group-hover:shadow-[0_8px_22px_rgba(15,23,42,0.1)]',
    extra
  );
