import { memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Tooltip from '@/components/base/tooltip';
import { FloatingToolbar } from '@/components/editor/chrome/FloatingToolbar';
import {
  FillPanelPopover,
  fillPanelPreview,
  type FillPanelValue,
} from '@/components/editor/panels/FillPanel';
import { setBucketFill } from '@/store/modules/editor';
import { cn } from '@/utils/classnames';

/**
 * Paint-bucket options: same FillPanel as shape fill (solid / gradient / image).
 */
function BucketFillToolbar({ className }: { className?: string }) {
  const dispatch = useDispatch();
  const value = useSelector((s: any) => {
    const raw = s.editor.bucketFill || {};
    return {
      fillType: raw.fillType || 'solid',
      fillColor: String(raw.fillColor || '#333333'),
      fillOpacity: Number.isFinite(Number(raw.fillOpacity)) ? Number(raw.fillOpacity) : 100,
      fillGradient: raw.fillGradient != null ? String(raw.fillGradient) : undefined,
      fillImageSrc: raw.fillImageSrc != null ? String(raw.fillImageSrc) : undefined,
      fillImageFit: raw.fillImageFit,
      fillImageRotate: raw.fillImageRotate,
      fillImageAdjust: raw.fillImageAdjust,
    } as FillPanelValue;
  });
  const preview = fillPanelPreview(value);

  return (
    <div className={cn('pointer-events-auto', className)}>
      <FloatingToolbar className="gap-1 px-2">
        <FillPanelPopover
          value={value}
          onChange={(next) => dispatch(setBucketFill(next))}
          title="颜色"
          placement="bottom"
          offset={10}
          shiftMainAxis={false}
          className="inline-flex"
        >
          {({ open }) => (
            <Tooltip tip="填充颜色" placement="bottom" disabled={open}>
              <span
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-[4px] transition-colors',
                  open ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--accent-soft)]'
                )}
              >
                <span
                  className="relative h-4 w-4 overflow-hidden rounded-full border border-black/15"
                  style={{ background: preview }}
                />
              </span>
            </Tooltip>
          )}
        </FillPanelPopover>
      </FloatingToolbar>
    </div>
  );
}

export default memo(BucketFillToolbar);
