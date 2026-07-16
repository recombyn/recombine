import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowDownTray, HiOutlineChevronDown, HiOutlineInformationCircle } from 'react-icons/hi2';
import { Checkbox } from '@/components/base/checkbox';
import Select from '@/components/base/select';
import Tooltip from '@/components/base/tooltip';
import { message } from '@/components/base/message';
import { useAppSelector } from '@/hooks/redux';
import {
  downloadSelectionImagesDirect,
  exportSelectionSlots,
  exportCropSlots,
  selectionIsDirectImageExport,
  selectionSupportsSvgExport,
  type ExportAffixMode,
  type ExportImageFormat,
  type ExportSlotConfig,
} from '@/store/scene/exportImage';
import { cn } from '@/utils/classnames';
import { SEL_ICON_BTN } from '@/components/editor/Canvas/selection/ToolbarValueSlider';

const SCALE_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
];

const RASTER_FORMAT_OPTIONS: { value: ExportImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPG' },
];

const VECTOR_FORMAT_OPTIONS: { value: ExportImageFormat; label: string }[] = [
  ...RASTER_FORMAT_OPTIONS,
  { value: 'svg', label: 'SVG' },
];

const selectFieldClass =
  '!box-border !flex !h-7 !w-full !min-w-0 !rounded-md !border-0 !bg-[color-mix(in_srgb,var(--muted)_12%,var(--surface))] !px-1.5 !pr-5 !text-[11px] !ring-1 !ring-[var(--line)]';

export type ExportCropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: string;
};

function defaultSlot(format: ExportImageFormat = 'png'): ExportSlotConfig {
  return {
    id: 'default',
    scale: 1,
    affixMode: 'suffix',
    affix: '',
    format,
  };
}

export function ExportSelectionPanel({
  nodeIds,
  crop,
  baseName,
  onClose,
  className,
  /** Flat embed (inspect sidebar) — no floating card chrome / title. */
  variant = 'popover',
}: {
  nodeIds?: string[];
  /** Artboard / frame region export (scene crop). */
  crop?: ExportCropRegion | null;
  baseName?: string;
  onClose?: () => void;
  className?: string;
  variant?: 'popover' | 'inline';
}) {
  const { t } = useTranslation();
  const tipId = useId();
  const document = useAppSelector((s) => s.editor.document);
  const ids = nodeIds || [];
  const allowSvg = Boolean(crop) || selectionSupportsSvgExport(document, ids);
  const formatOptions = allowSvg ? VECTOR_FORMAT_OPTIONS : RASTER_FORMAT_OPTIONS;
  const [slot, setSlot] = useState<ExportSlotConfig>(() => defaultSlot());
  const [compress, setCompress] = useState(false);
  const [busy, setBusy] = useState(false);
  const inline = variant === 'inline';
  const canExport = Boolean(crop) || ids.length > 0;
  const isSvg = slot.format === 'svg';

  const name = baseName || t('editor.selectionExportName');
  const affixOptions = [
    { value: 'prefix', label: t('editor.exportPrefix') },
    { value: 'suffix', label: t('editor.exportSuffix') },
  ];

  const runExport = async () => {
    if (!canExport) {
      message.warning(t('editor.noSelectionExport'));
      return;
    }
    setBusy(true);
    try {
      const resolved: ExportSlotConfig = {
        ...slot,
        scale: isSvg ? 1 : slot.scale,
        affix:
          slot.affix ||
          (isSvg || slot.scale === 1
            ? ''
            : `@${Number.isInteger(slot.scale) ? slot.scale : slot.scale}x`),
      };
      const n = crop
        ? await exportCropSlots({
            crop,
            backgroundColor: crop.backgroundColor,
            baseName: name,
            compress: isSvg ? false : compress,
            slots: [resolved],
          })
        : await exportSelectionSlots({
            nodeIds: ids,
            baseName: name,
            compress: isSvg ? false : compress,
            slots: [resolved],
            document,
          });
      if (n > 0) {
        message.success(t(isSvg ? 'editor.exportedSvg' : 'editor.exportedImage'));
        onClose?.();
      } else {
        message.error(t('editor.canvasMissing'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-export-panel
      className={cn(
        inline
          ? 'w-full'
          : 'w-[280px] rounded-[4px] bg-[var(--surface)] p-3 shadow-lg ring-1 ring-[var(--line)]',
        className
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {!inline ? (
        <div className="mb-2.5">
          <span className="text-[13px] font-medium text-[var(--ink)]">{t('editor.export')}</span>
        </div>
      ) : null}

      <div className={cn('grid grid-cols-3 gap-1.5', inline && 'gap-2')}>
        <Select
          size="small"
          type="filled"
          value={isSvg ? 1 : slot.scale}
          options={SCALE_OPTIONS}
          disabled={isSvg}
          onChange={(v) => setSlot((s) => ({ ...s, scale: Number(v) || 1 }))}
          className={selectFieldClass}
          placement="bottom-start"
        />
        <Select
          size="small"
          type="filled"
          value={slot.affixMode}
          options={affixOptions}
          onChange={(v) =>
            setSlot((s) => ({
              ...s,
              affixMode: (v === 'prefix' ? 'prefix' : 'suffix') as ExportAffixMode,
            }))
          }
          className={selectFieldClass}
          placement="bottom-start"
        />
        <Select
          size="small"
          type="filled"
          value={slot.format}
          options={formatOptions}
          onChange={(v) => {
            const next =
              v === 'svg' ? 'svg' : v === 'jpeg' ? 'jpeg' : ('png' as ExportImageFormat);
            setSlot((s) => ({ ...s, format: next }));
          }}
          className={selectFieldClass}
          placement="bottom-start"
        />
      </div>

      {!isSvg ? (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--ink)]">
          <Checkbox
            size="small"
            checked={compress}
            onChange={(e) => setCompress(e.target.checked)}
          >
            {t('editor.exportCompress')}
          </Checkbox>
          <Tooltip title={t('editor.exportCompressTip')} placement="top">
            <button
              type="button"
              id={tipId}
              className="inline-flex text-[var(--muted)]"
              aria-label={t('editor.exportCompressTip')}
            >
              <HiOutlineInformationCircle className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy || !canExport}
        onClick={() => void runExport()}
        className="mt-3 flex h-7 w-full items-center justify-center gap-1.5 rounded bg-[var(--ink)] text-[12px] font-medium text-[var(--surface)] disabled:opacity-40"
      >
        <HiOutlineArrowDownTray className="h-3.5 w-3.5" />
        {t('editor.export')}
      </button>
    </div>
  );
}

export type ExportSelectionPopoverProps = {
  nodeIds?: string[];
  /** Artboard / frame region — opens scale/format panel (not direct image download). */
  crop?: ExportCropRegion | null;
  baseName?: string;
  placement?: Placement;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** Optional trigger chrome (e.g. group toolbar: icon + red badge + chevron). */
  showChevron?: boolean;
  showBadge?: boolean;
  children?: ReactNode;
};

/** Download: images go straight to file; vectors / frames open the scale/format panel. */
export function ExportSelectionPopover({
  nodeIds,
  crop,
  baseName,
  placement = 'bottom-end',
  disabled = false,
  className,
  triggerClassName,
  showChevron = false,
  showBadge = false,
  children,
}: ExportSelectionPopoverProps) {
  const { t } = useTranslation();
  const document = useAppSelector((s) => s.editor.document);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = nodeIds || [];
  const canExport = Boolean(crop) || ids.length > 0;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        padding: 12,
        fallbackPlacements: ['top-end', 'bottom-start', 'top-start'],
      }),
      shift({ padding: 12 }),
    ],
  });
  const dismiss = useDismiss(context, {
    outsidePress: (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-export-panel]')) return false;
      // Select dropdown portals to body — keep export panel open.
      if (target?.closest?.('[data-select-dropdown]')) return false;
      return true;
    },
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const onTriggerClick = useCallback(async () => {
    if (disabled || !canExport || busy) return;

    if (!crop && selectionIsDirectImageExport(document, ids)) {
      setBusy(true);
      try {
        const n = await downloadSelectionImagesDirect({
          document,
          nodeIds: ids,
          baseName: baseName || t('editor.selectionExportName'),
        });
        if (n > 0) message.success(t('editor.exportedImage'));
        else message.error(t('editor.canvasMissing'));
      } finally {
        setBusy(false);
      }
      return;
    }

    setOpen((v) => !v);
  }, [baseName, busy, canExport, crop, disabled, document, ids, t]);

  return (
    <>
      <Tooltip
        title={t('editor.exportImage')}
        placement="top"
        disabled={disabled || !canExport || busy || open}
      >
        <button
          type="button"
          ref={refs.setReference}
          disabled={disabled || !canExport || busy}
          aria-label={t('editor.exportImage')}
          aria-expanded={open}
          className={cn(
            triggerClassName || SEL_ICON_BTN,
            showChevron &&
              'inline-flex h-8 items-center gap-0.5 rounded-lg px-2 text-[var(--ink)] hover:bg-[var(--accent-soft)]',
            className
          )}
          {...getReferenceProps({
            onClick: () => void onTriggerClick(),
          })}
        >
          {children ?? (
            <span className="relative inline-flex">
              <HiOutlineArrowDownTray className="h-3.5 w-3.5" />
              {showBadge ? (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#ef4444] ring-1 ring-[var(--surface)]"
                />
              ) : null}
            </span>
          )}
          {showChevron ? (
            <HiOutlineChevronDown className="h-3 w-3 text-[var(--muted)]" aria-hidden />
          ) : null}
        </button>
      </Tooltip>

      <FloatingPortal>
        {open ? (
          <div
            ref={refs.setFloating}
            style={floatingStyles as CSSProperties}
            className="z-[80]"
            {...getFloatingProps()}
          >
            <ExportSelectionPanel
              nodeIds={ids}
              crop={crop}
              baseName={baseName}
              onClose={() => setOpen(false)}
            />
          </div>
        ) : null}
      </FloatingPortal>
    </>
  );
}

export default ExportSelectionPanel;
