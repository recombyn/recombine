import { useState } from 'react';
import { HiOutlineBolt, HiOutlineCheck } from 'react-icons/hi2';
import { cn } from '@/utils/classnames';
import ImageToolPanelShell, {
  PanelClickSelect,
  PanelFooterActions,
} from './ImageToolPanelShell';

const SCALE_OPTS = [
  { value: '1x', label: '1x' },
  { value: '1.5x', label: '1.5x' },
  { value: '2x', label: '2x' },
];

const PRESET_OPTS = [
  { value: 'general', label: '通用' },
  { value: 'portrait', label: '人像' },
  { value: 'product', label: '商品' },
];

const RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'original', label: '原始', w: 0, h: 0 },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '2:3', label: '2:3', w: 2, h: 3 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '3:2', label: '3:2', w: 3, h: 2 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '4:5', label: '4:5', w: 4, h: 5 },
  { id: '5:4', label: '5:4', w: 5, h: 4 },
];

function RatioIcon({ w, h }: { w: number; h: number }) {
  const max = Math.max(w, h, 1);
  const pw = w <= 0 || h <= 0 ? 14 : Math.max(6, Math.round((w / max) * 14));
  const ph = w <= 0 || h <= 0 ? 14 : Math.max(6, Math.round((h / max) * 14));
  return (
    <span
      className="inline-block rounded-[2px] border border-[var(--muted)]"
      style={{ width: pw, height: ph }}
      aria-hidden
    />
  );
}

/** Fig.4 — Expand (扩图): scale, preset, aspect ratios. */
export default function ExpandToolPanel({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (opts: { scale: string; preset: string; ratio: string }) => void;
}) {
  const [scale, setScale] = useState('1x');
  const [preset, setPreset] = useState('general');
  const [ratio, setRatio] = useState('original');
  const [busy, setBusy] = useState(false);

  return (
    <ImageToolPanelShell
      title={'扩图'}
      width={268}
      onClose={onCancel}
      footer={
        <PanelFooterActions
          onCancel={onCancel}
          confirmBusy={busy}
          onConfirm={() => {
            setBusy(true);
            onConfirm({ scale, preset, ratio });
          }}
          confirmLabel={'生成'}
          confirmExtra={
            <span className="inline-flex items-center gap-0.5 text-[12px] opacity-90">
              <HiOutlineBolt className="h-3.5 w-3.5" />
              8
            </span>
          }
        />
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[13px] text-[var(--ink)]">{'缩放比例'}</span>
        <PanelClickSelect value={scale} options={SCALE_OPTS} onChange={setScale} />
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[13px] text-[var(--ink)]">{'预设'}</span>
        <PanelClickSelect value={preset} options={PRESET_OPTS} onChange={setPreset} />
      </div>

      <div className="max-h-[220px] overflow-y-auto rounded border border-[var(--line)]">
        {RATIOS.map((r) => {
          const selected = ratio === r.id;
          return (
            <button
              key={r.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors',
                selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]/60'
              )}
              onClick={() => setRatio(r.id)}
            >
              <span
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded-[4px] border',
                  selected
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--on-brand)]'
                    : 'border-[var(--line)]'
                )}
              >
                {selected ? <HiOutlineCheck className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="flex-1 font-medium text-[var(--ink)]">{r.label}</span>
              <RatioIcon w={r.w} h={r.h} />
            </button>
          );
        })}
      </div>
    </ImageToolPanelShell>
  );
}
