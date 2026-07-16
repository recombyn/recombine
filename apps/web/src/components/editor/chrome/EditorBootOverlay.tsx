import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/classnames';

type Props = {
  progress: number;
  exiting?: boolean;
};

/** Boot loader only — no skeleton chrome. */
export default function EditorBootOverlay({ progress, exiting = false }: Props) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex items-center justify-center bg-[var(--canvas)] transition-opacity duration-300',
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      aria-busy="true"
      aria-label={t('editor.initializing')}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)] text-[15px] font-bold text-[var(--on-brand)] shadow-sm">
          RC
        </div>
        <div className="h-1.5 w-44 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[12px] text-[var(--muted)]">{t('editor.initializing')}</p>
      </div>
    </div>
  );
}
