import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowPath } from 'react-icons/hi2';
import { SegmentedControl } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import { cn } from '@/utils/classnames';
import AngleEditorScene, {
  type AngleCubeScale,
  type AngleEditorMode,
} from './AngleEditorScene';
import ImageToolPanelShell, {
  IMAGE_TOOL_TOKEN_COST,
  PanelFooterActions,
  PanelIconBtn,
  PanelSliderRow,
} from './ImageToolPanelShell';

const scaleIndexToValue = (i: number): AngleCubeScale => (i === 0 ? 1 : i === 2 ? 10 : 5);
const scaleValueToIndex = (s: AngleCubeScale): number => (s === 1 ? 0 : s === 10 ? 2 : 1);

const ANGLE_PRESET_KEYS = [
  { key: 'front', rotate: 0, tilt: 0 },
  { key: 'side', rotate: 90, tilt: 0 },
  { key: 'reverse', rotate: -90, tilt: 0 },
  { key: 'threeQuarter', rotate: 45, tilt: 0 },
  { key: 'top', rotate: 0, tilt: 60 },
  { key: 'low', rotate: 0, tilt: -60 },
] as const;

const ROTATE_MIN = -90;
const ROTATE_MAX = 90;
const TILT_MIN = -60;
const TILT_MAX = 60;

/** Preview column edge — matches the orbit globe stage. */
const PREVIEW_SIZE = 280;

const clampInt = (v: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, v)));

/** Multi-angle tool: left preview + right controls (fig. 2 style). */
function MultiAngleToolPanel({
  imageSrc,
  onCancel,
  onConfirm,
}: {
  imageSrc?: string;
  onCancel: () => void;
  onConfirm: (opts: { rotate: number; tilt: number; zoom: number; mode: AngleEditorMode }) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AngleEditorMode>('camera');
  const [rotate, setRotate] = useState(45);
  const [tilt, setTilt] = useState(0);
  const [scale, setScale] = useState<AngleCubeScale>(5);
  const [busy, setBusy] = useState(false);

  const setRotateInt = (v: number) => setRotate(clampInt(v, ROTATE_MIN, ROTATE_MAX));
  const setTiltInt = (v: number) => setTilt(clampInt(v, TILT_MIN, TILT_MAX));

  const reset = () => {
    setRotate(0);
    setTilt(0);
    setScale(5);
  };

  const angleLabel = (key: (typeof ANGLE_PRESET_KEYS)[number]['key']) => {
    const map = {
      front: 'editor.imageToolbar.angleFront',
      side: 'editor.imageToolbar.angleSide',
      reverse: 'editor.imageToolbar.angleReverse',
      threeQuarter: 'editor.imageToolbar.angleThreeQuarter',
      top: 'editor.imageToolbar.angleTop',
      low: 'editor.imageToolbar.angleLow',
    } as const;
    return t(map[key]);
  };

  const applyPreset = (preset: (typeof ANGLE_PRESET_KEYS)[number]) => {
    setRotateInt(preset.rotate);
    setTiltInt(preset.tilt);
  };

  const activePresetKey =
    ANGLE_PRESET_KEYS.find((p) => p.rotate === rotate && p.tilt === tilt)?.key ?? null;

  const scaleLabel =
    scale === 1
      ? t('editor.imageToolbar.distanceNear')
      : scale === 10
        ? t('editor.imageToolbar.distanceFar')
        : t('editor.imageToolbar.distanceMid');

  return (
    <ImageToolPanelShell
      title={t('editor.imageToolbar.multiAngle')}
      width={PREVIEW_SIZE + 220 + 32}
      onClose={onCancel}
      headerRight={
        <PanelIconBtn title={t('editor.imageToolbar.reset')} onClick={reset}>
          <HiOutlineArrowPath className="h-4 w-4" />
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
          confirmLabel={t('editor.imageToolbar.useNow')}
          confirmCost={IMAGE_TOOL_TOKEN_COST.multiAngle}
        />
      }
    >
      <div className="flex items-stretch gap-3">
        {/* Left — orbit / skybox preview */}
        <div
          className="relative shrink-0 overflow-hidden rounded bg-[var(--canvas)] ring-1 ring-[var(--line)]"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
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

        {/* Right — mode, presets, fine-tune */}
        <div className="flex min-w-0 flex-1 flex-col">
          <SegmentedControl
            className="mb-3 shrink-0"
            size="sm"
            fullWidth
            value={tab}
            onChange={setTab}
            options={[
              { value: 'skybox', label: t('editor.imageToolbar.skybox') },
              { value: 'camera', label: t('editor.imageToolbar.camera') },
            ]}
          />

          <div className="mb-3 min-h-0 flex-1">
            <div className="mb-1.5 text-[12px] text-[var(--muted)]">
              {t('editor.imageToolbar.commonAngles')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ANGLE_PRESET_KEYS.map((preset) => {
                const active = activePresetKey === preset.key;
                const label = angleLabel(preset.key);
                const tip = `${label}  ${preset.rotate}° / ${preset.tilt}°`;
                return (
                  <Tooltip key={preset.key} title={tip} placement="top">
                    <button
                      type="button"
                      aria-label={tip}
                      onClick={() => applyPreset(preset)}
                      className={cn(
                        'h-8 w-full rounded-xl px-2 text-[12px] font-medium transition-colors',
                        active
                          ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                          : 'bg-[var(--accent-soft)] text-[var(--ink)] hover:bg-[var(--line)]'
                      )}
                    >
                      {label}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <div className="mt-auto shrink-0 space-y-0.5">
            <PanelSliderRow
              label={t('editor.imageToolbar.rotate')}
              value={rotate}
              min={ROTATE_MIN}
              max={ROTATE_MAX}
              step={1}
              display={`${rotate}°`}
              onChange={setRotateInt}
              fillFromZero
            />
            <PanelSliderRow
              label={t('editor.imageToolbar.tilt')}
              value={tilt}
              min={TILT_MIN}
              max={TILT_MAX}
              step={1}
              display={`${tilt}°`}
              onChange={setTiltInt}
              fillFromZero
            />
            <PanelSliderRow
              label={t('editor.imageToolbar.zoom')}
              value={scaleValueToIndex(scale)}
              min={0}
              max={2}
              step={1}
              display={scaleLabel}
              onChange={(v) => setScale(scaleIndexToValue(v))}
            />
          </div>
        </div>
      </div>
    </ImageToolPanelShell>
  );
}

export default memo(MultiAngleToolPanel);
