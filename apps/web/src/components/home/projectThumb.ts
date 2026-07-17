import { cn } from '@/utils/classnames';

/** Shared project / plaza cover frame — fixed 170px tall. */
export const PROJECT_THUMB_HEIGHT = 170;

export const projectThumbFrameClass = (extra?: string) =>
  cn(
    'relative h-[170px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]',
    'shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition',
    'group-hover:shadow-[0_8px_22px_rgba(15,23,42,0.1)]',
    extra
  );
