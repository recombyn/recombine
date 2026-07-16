import { HiOutlineArrowUturnLeft } from 'react-icons/hi2';
import Slider from '@/components/base/slider';
import ImageToolPanelShell, {
  PanelFooterActions,
  PanelIconBtn,
} from './ImageToolPanelShell';

/** Fig.2 — Eraser: brush-size slider + cancel / use-now (paints on-image). */
export default function EraserToolPanel({
  brushSize,
  onBrushSizeChange,
  hasStrokes,
  onReset,
  onCancel,
  onConfirm,
  confirmBusy,
}: {
  brushSize: number;
  onBrushSizeChange: (v: number) => void;
  hasStrokes: boolean;
  onReset: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmBusy?: boolean;
}) {
  return (
    <ImageToolPanelShell
      title={'橡皮工具'}
      width={240}
      onClose={onCancel}
      headerRight={
        <PanelIconBtn title={'重置'} onClick={onReset}>
          <HiOutlineArrowUturnLeft className="h-4 w-4" />
        </PanelIconBtn>
      }
      footer={
        <PanelFooterActions
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmLabel={'立即使用'}
          confirmDisabled={!hasStrokes}
          confirmBusy={confirmBusy}
        />
      }
    >
      <div className="flex flex-col items-stretch gap-3 py-3">
        <Slider
          min={8}
          max={100}
          step={1}
          value={brushSize}
          onChange={onBrushSizeChange}
        />
      </div>
    </ImageToolPanelShell>
  );
}
