import { useState } from 'react';
import { HiOutlineArrowUturnLeft } from 'react-icons/hi2';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';
import AngleEditorScene, {
  type AngleCubeScale,
  type AngleEditorMode,
} from './AngleEditorScene';
import ImageToolPanelShell, {
  PanelFooterActions,
  PanelIconBtn,
  PanelSliderRow,
} from './ImageToolPanelShell';

const scaleIndexToValue = (i: number): AngleCubeScale => (i === 0 ? 1 : i === 2 ? 10 : 5);
const scaleValueToIndex = (s: AngleCubeScale): number => (s === 1 ? 0 : s === 10 ? 2 : 1);

/** Common one-click camera angles (within rotate −90…90 / tilt −30…60). */
const ANGLE_PRESETS: { key: string; label: string; rotate: number; tilt: number }[] = [
  { key: 'front', label: '正面', rotate: 0, tilt: 0 },
  { key: 'side', label: '侧面', rotate: 90, tilt: 0 },
  { key: 'reverse', label: '反打', rotate: -90, tilt: 0 },
  { key: 'threeQuarter', label: '斜侧', rotate: 45, tilt: 0 },
  { key: 'top', label: '俯视', rotate: 0, tilt: 60 },
  { key: 'low', label: '仰视', rotate: 0, tilt: -30 },
];

const ROTATE_MIN = -90;
const ROTATE_MAX = 90;
const TILT_MIN = -30;
const TILT_MAX = 60;

const clampInt = (v: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, v)));

/** Multi-angle: 天空盒 / 摄像头 — scene ported AngleEditorV3. */
export default function MultiAngleToolPanel({
  imageSrc,
  onCancel,
  onConfirm,
}: {
  imageSrc?: string;
  onCancel: () => void;
  onConfirm: (opts: { rotate: number; tilt: number; zoom: number; mode: AngleEditorMode }) => void;
}) {
  const [tab, setTab] = useState<AngleEditorMode>('camera');
  const [rotate, setRotate] = useState(45);
  const [tilt, setTilt] = useState(-30);
  const [scale, setScale] = useState<AngleCubeScale>(5);
  const [busy, setBusy] = useState(false);

  const setRotateInt = (v: number) => setRotate(clampInt(v, ROTATE_MIN, ROTATE_MAX));
  const setTiltInt = (v: number) => setTilt(clampInt(v, TILT_MIN, TILT_MAX));

  const reset = () => {
    setRotate(0);
    setTilt(0);
    setScale(5);
  };

  const applyPreset = (preset: (typeof ANGLE_PRESETS)[number]) => {
    setRotateInt(preset.rotate);
    setTiltInt(preset.tilt);
  };

  const activePresetKey =
    ANGLE_PRESETS.find((p) => p.rotate === rotate && p.tilt === tilt)?.key ?? null;

  const scaleLabel = scale === 1 ? '近' : scale === 10 ? '远' : '中等';

  return (
    <ImageToolPanelShell
      title={'多角度'}
      width={268}
      onClose={onCancel}
      headerRight={
        <PanelIconBtn title={'重置'} onClick={reset}>
          <HiOutlineArrowUturnLeft className="h-4 w-4" />
        </PanelIconBtn>
      }
      footer={
        <PanelFooterActions
          onCancel={onCancel}
          confirmBusy={busy}
          onConfirm={() => {
            setBusy(true);
            onConfirm({
              rotate,
              tilt,
              zoom: scaleValueToIndex(scale) * 50,
              mode: tab,
            });
          }}
          confirmLabel={'立即使用'}
        />
      }
    >
      <div className="mb-3 flex rounded bg-[var(--accent-soft)] p-0.5">
        {(
          [
            ['skybox', '天空盒'],
            ['camera', '摄像头'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={cn(
              'h-7 flex-1 rounded text-[12px] font-medium transition-colors',
              tab === key
                ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            )}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'relative mb-3 aspect-square overflow-hidden rounded',
          tab === 'skybox' ? 'bg-white ring-1 ring-[var(--line)]' : 'bg-[#f3f3f3]'
        )}
      >
        <AngleEditorScene
          className="h-full w-full"
          mode={tab}
          rotate={rotate}
          tilt={tilt}
          cubeScale={scale}
          imageSrc={imageSrc}
          onRotateChange={setRotateInt}
          onTiltChange={setTiltInt}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[12px] text-[var(--muted)]">{'常用角度'}</div>
        <div className="flex flex-wrap gap-1.5">
          {ANGLE_PRESETS.map((preset) => {
            const active = activePresetKey === preset.key;
            const tip = `${preset.label}  ${preset.rotate}° / ${preset.tilt}°`;
            return (
              <Tooltip key={preset.key} title={tip} placement="top">
                <button
                  type="button"
                  aria-label={tip}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'h-7 rounded px-2.5 text-[12px] font-medium transition-colors',
                    active
                      ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                      : 'bg-[var(--accent-soft)] text-[var(--ink)] hover:bg-[var(--line)]'
                  )}
                >
                  {preset.label}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <PanelSliderRow
        label={'旋转'}
        value={rotate}
        min={ROTATE_MIN}
        max={ROTATE_MAX}
        step={1}
        display={String(rotate)}
        onChange={setRotateInt}
        fillFromZero
      />
      <PanelSliderRow
        label={'倾斜'}
        value={tilt}
        min={TILT_MIN}
        max={TILT_MAX}
        step={1}
        display={String(tilt)}
        onChange={setTiltInt}
        fillFromZero
      />
      <PanelSliderRow
        label={'缩放'}
        value={scaleValueToIndex(scale)}
        min={0}
        max={2}
        step={1}
        display={scaleLabel}
        onChange={(v) => setScale(scaleIndexToValue(v))}
      />
    </ImageToolPanelShell>
  );
}
