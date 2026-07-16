import { COLOR_PANEL_WIDTH, INPUT_NO_SPIN } from '@/components/base/colorPanel';
import Slider from '@/components/base/slider';
import { StylePanelShell } from '@/components/editor/panels/StylePanelChrome';
import { cn } from '@/utils/classnames';
import { useTranslation } from 'react-i18next';

export type CornerRadiiValue = { tl: number; tr: number; br: number; bl: number; linked: boolean };

function CornerGlyph({
  corner,
  className,
}: {
  corner: 'tl' | 'tr' | 'br' | 'bl';
  className?: string;
}) {
  const d =
    corner === 'tl'
      ? 'M4 12V6a2 2 0 0 1 2-2h6'
      : corner === 'tr'
        ? 'M4 4h6a2 2 0 0 1 2 2v6'
        : corner === 'br'
          ? 'M12 4v6a2 2 0 0 1-2 2H4'
          : 'M12 12H6a2 2 0 0 1-2-2V4';
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLink({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.5 9.5l3-3M5 8.5H4a2 2 0 1 1 0-4h3M11 7.5h1a2 2 0 1 1 0 4H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Dedicated corner-radius panel (not nested under stroke).
 * Uniform slider when linked; 4 independent inputs when unlinked.
 */
export function CornerRadiusPanel({
  value,
  onChange,
  title = '圆角',
  onClose,
  max = 999,
  className,
}: {
  value: CornerRadiiValue;
  onChange: (next: CornerRadiiValue) => void;
  title?: string;
  onClose?: () => void;
  max?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const clamp = (n: number) => Math.max(0, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));
  const uniform = Math.round((value.tl + value.tr + value.br + value.bl) / 4) || value.tl || 0;

  const setUniform = (n: number) => {
    const v = clamp(n);
    onChange({ tl: v, tr: v, br: v, bl: v, linked: true });
  };

  const setCorner = (key: keyof Omit<CornerRadiiValue, 'linked'>, raw: number) => {
    const v = clamp(raw);
    if (value.linked) {
      onChange({ tl: v, tr: v, br: v, bl: v, linked: true });
      return;
    }
    onChange({ ...value, [key]: v });
  };

  const cells: Array<{ key: 'tl' | 'tr' | 'bl' | 'br'; tip: string; iconEnd?: boolean }> = [
    { key: 'tl', tip: t('editor.cornerRadiusTL'), iconEnd: true },
    { key: 'tr', tip: t('editor.cornerRadiusTR') },
    { key: 'bl', tip: t('editor.cornerRadiusBL'), iconEnd: true },
    { key: 'br', tip: t('editor.cornerRadiusBR') },
  ];

  return (
    <StylePanelShell
      title={title}
      onClose={onClose}
      width={COLOR_PANEL_WIDTH}
      dataAttr="data-radius-panel"
      className={className}
    >
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-[12px] text-[var(--muted)]">R</span>
        <div className="min-w-0 flex-1">
          <Slider
            min={0}
            max={max}
            step={1}
            value={Math.min(max, Math.max(0, uniform))}
            onChange={setUniform}
          />
        </div>
        <input
          type="number"
          min={0}
          max={max}
          aria-label={title}
          value={uniform}
          onChange={(e) => setUniform(Number(e.target.value))}
          className={cn(
            'h-7 w-12 shrink-0 rounded bg-[var(--accent-soft)] px-1.5 text-center text-[12px] tabular-nums outline-none',
            INPUT_NO_SPIN
          )}
        />
        <button
          type="button"
          aria-label={value.linked ? '解锁四角' : '锁定四角'}
          aria-pressed={value.linked}
          title={value.linked ? '解锁四角' : '锁定四角'}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors',
            value.linked
              ? 'bg-[var(--surface)] text-[var(--accent)] ring-1 ring-[var(--line)]'
              : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
          )}
          onClick={() => {
            if (!value.linked) {
              setUniform(uniform);
              return;
            }
            onChange({ ...value, linked: false });
          }}
        >
          <IconLink className="h-4 w-4" />
        </button>
      </div>

      <div className="grid w-full grid-cols-2 gap-1.5">
        {cells.map(({ key, tip, iconEnd }) => (
          <label
            key={key}
            title={tip}
            className={cn(
              'flex h-8 min-w-0 items-center gap-1 rounded bg-[var(--accent-soft)] px-2 text-[12px] text-[var(--ink)]',
              iconEnd ? 'justify-between' : 'flex-row-reverse justify-between'
            )}
          >
            <input
              type="number"
              min={0}
              max={max}
              aria-label={tip}
              value={Math.round(value[key] || 0)}
              onChange={(e) => setCorner(key, Number(e.target.value))}
              className={cn(
                'min-w-0 flex-1 bg-transparent text-[12px] tabular-nums outline-none',
                iconEnd ? 'text-left' : 'text-right',
                INPUT_NO_SPIN
              )}
            />
            <CornerGlyph corner={key} className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          </label>
        ))}
      </div>
    </StylePanelShell>
  );
}

export default CornerRadiusPanel;
