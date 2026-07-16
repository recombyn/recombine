import type { ReactNode } from 'react';

export const imageToolBtn =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)]';

export function ImageToolSep() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />;
}

export function ImageToolBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={imageToolBtn} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

export function imageMoreRow(icon: ReactNode, label: string, extra?: ReactNode) {
  return (
    <span className="flex w-full items-center gap-2.5 text-[var(--ink)]">
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 text-left text-[13px] font-medium">{label}</span>
      {extra}
    </span>
  );
}
