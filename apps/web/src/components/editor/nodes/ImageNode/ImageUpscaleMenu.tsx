import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import { Icon, DropdownPanel, DropdownPanelItem } from '@/components/base';
import { cn } from '@/utils/classnames';
import { imageToolBtn } from './imageToolbarShared';

const TOOL_ICON_SIZE = 16;

export type UpscalePreset = {
  key: string;
  title: string;
  width: number;
  height: number;
};

export const UPSCALE_PRESETS: UpscalePreset[] = [
  { key: '4k', title: '4K', width: 2896, height: 4096 },
  { key: '8k', title: '8K', width: 5792, height: 8192 },
];

/** Upscale preset menu under the image toolbar. */
export default function ImageUpscaleMenu({
  onPick,
}: {
  onPick: (preset: UpscalePreset) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12, mainAxis: false })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={cn(imageToolBtn, open && 'bg-[var(--accent-soft)]')}
        {...getReferenceProps()}
      >
        <Icon name="editor-upscale" width={TOOL_ICON_SIZE} height={TOOL_ICON_SIZE} className="text-current" />
        <span>{t('editor.imageToolbar.upscale')}</span>
      </button>
      <FloatingPortal>
        {open ? (
          <DropdownPanel
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[80] min-w-[10.5rem]"
            {...getFloatingProps()}
          >
            {UPSCALE_PRESETS.map((p) => (
              <DropdownPanelItem
                key={p.key}
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
              >
                <span className="text-[13px] font-semibold text-[var(--ink)]">{p.title}</span>
                <span className="text-[12px] tabular-nums text-[var(--muted)]">
                  {p.width}x{p.height}
                </span>
              </DropdownPanelItem>
            ))}
          </DropdownPanel>
        ) : null}
      </FloatingPortal>
    </>
  );
}
