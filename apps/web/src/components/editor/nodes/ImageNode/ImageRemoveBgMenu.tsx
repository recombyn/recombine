import { useState, type ReactNode, memo } from 'react';
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

export type RemoveBgMode = 'hair' | 'product';

/** Remove-bg mode menu: hair/portrait (default) vs product hard edge. */
function ImageRemoveBgMenu({
  onPick,
}: {
  onPick: (mode: RemoveBgMode) => void;
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

  const modes: { key: RemoveBgMode; titleKey: string; hintKey: string }[] = [
    {
      key: 'hair',
      titleKey: 'editor.imageToolbar.removeBgHair',
      hintKey: 'editor.imageToolbar.removeBgHairHint',
    },
    {
      key: 'product',
      titleKey: 'editor.imageToolbar.removeBgProduct',
      hintKey: 'editor.imageToolbar.removeBgProductHint',
    },
  ];

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={cn(imageToolBtn, open && 'bg-[var(--accent-soft)]')}
        {...getReferenceProps()}
      >
        <Icon
          name="editor-remove_bg"
          width={TOOL_ICON_SIZE}
          height={TOOL_ICON_SIZE}
          className="text-current"
        />
        <span>{t('editor.imageToolbar.removeBg')}</span>
      </button>
      <FloatingPortal>
        {open ? (
          <DropdownPanel
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[80] min-w-[11.5rem]"
            {...getFloatingProps()}
          >
            {modes.map((m) => (
              <DropdownPanelItem
                key={m.key}
                className="h-auto min-h-8 items-start py-1.5"
                onClick={() => {
                  onPick(m.key);
                  setOpen(false);
                }}
              >
                <span className="flex flex-col gap-0.5 text-left">
                  <span className="text-[13px] font-semibold text-[var(--ink)]">
                    {t(m.titleKey)}
                  </span>
                  <span className="text-[11px] font-normal leading-snug text-[var(--muted)]">
                    {t(m.hintKey)}
                  </span>
                </span>
              </DropdownPanelItem>
            ))}
          </DropdownPanel>
        ) : null}
      </FloatingPortal>
    </>
  );
}

export default memo(ImageRemoveBgMenu);
