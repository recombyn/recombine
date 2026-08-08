import { memo } from 'react';
import { HiOutlineArrowPath } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import Slider from '@/components/base/slider';
import ImageToolPanelShell, {
  PanelFooterActions,
  PanelIconBtn,
} from './ImageToolPanelShell';

/** Opacity: slider + cancel / use-now (docked like Eraser). */
function OpacityToolPanel({
  opacityPct,
  onOpacityPctChange,
  onReset,
  onCancel,
  onConfirm,
}: {
  opacityPct: number;
  onOpacityPctChange: (v: number) => void;
  onReset: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const safe = Math.min(100, Math.max(0, Math.round(opacityPct)));
  return (
    <ImageToolPanelShell
      title={t('editor.imageToolbar.opacity')}
      width={240}
      onClose={onCancel}
      headerRight={
        <PanelIconBtn title={t('editor.imageToolbar.reset')} onClick={onReset}>
          <HiOutlineArrowPath className="h-4 w-4" />
        </PanelIconBtn>
      }
      footer={
        <PanelFooterActions
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel={t('editor.imageToolbar.useNow')}
        />
      }
    >
      <div className="flex flex-col items-stretch gap-3 py-3">
        <Slider
          min={0}
          max={100}
          step={1}
          value={safe}
          onChange={onOpacityPctChange}
          trackHeight={6}
          thumbWidth={10}
          thumbHeight={18}
        />
      </div>
    </ImageToolPanelShell>
  );
}

export default memo(OpacityToolPanel);
