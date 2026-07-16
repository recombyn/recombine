import React, { useState, useCallback, useEffect } from 'react';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import { cva } from 'class-variance-authority';
import { cn } from '@/utils/classnames';
import Input from '@/components/base/input';
import { HueSlider } from './HueSlider';
import { SaturationValueArea } from './SaturationValueArea';
import { AlphaSlider } from './AlphaSlider';

/**
 * Trigger and panel sizing token.
 */
export type ColorPickerSize = 'small' | 'middle' | 'large';

/**
 * RGB 0–255 and alpha 0–1.
 */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * HSV: hue degrees 0–360; saturation and value 0–1.
 */
export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

/**
 * ColorPicker props
 */
export interface ColorPickerProps {
  /**
   * Controlled hex string (e.g. `#ffffff`).
   */
  value?: string;
  /**
   * Emits updated hex when the user changes the color.
   */
  onChange?: (color: string) => void;
  /**
   * Disable opening the panel and all controls.
   * @default false
   */
  disabled?: boolean;
  /**
   * Trigger size token.
   * @default 'middle'
   */
  size?: ColorPickerSize;
  /**
   * Show the hex string next to the swatch.
   * @default false
   */
  showText?: boolean;
  /**
   * Extra class on the trigger.
   */
  className?: string;
  /**
   * Inline styles on the trigger.
   */
  style?: React.CSSProperties;
  /**
   * Optional quick-pick swatches (hex values).
   */
  presets?: string[];
  /**
   * Element used for popover positioning (defaults to the swatch trigger).
   * Use the full color input row so the panel opens below it, left-aligned.
   */
  positionReference?: React.RefObject<HTMLElement | null>;
}

/**
 * Parses `#RRGGBB` into RGBA (alpha 1).
 */
const hexToRgba = (hex: string): RgbaColor => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
      a: 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
};

/**
 * Drops alpha; returns `#RRGGBB`.
 */
const rgbaToHex = (rgba: RgbaColor): string => {
  const r = Math.round(rgba.r).toString(16).padStart(2, '0');
  const g = Math.round(rgba.g).toString(16).padStart(2, '0');
  const b = Math.round(rgba.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

/**
 * RGB 0–255 → HSV.
 */
const rgbToHsv = (rgb: RgbaColor): HsvColor => {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
};

/**
 * HSV → RGB 0–255, alpha 1.
 */
const hsvToRgb = (hsv: HsvColor): RgbaColor => {
  const h = hsv.h / 360;
  const s = hsv.s;
  const v = hsv.v;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = 0;
  let g = 0;
  let b = 0;

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: 1,
  };
};

/**
 * Trigger appearance (size + disabled).
 */
const colorPickerVariants = cva(
  'inline-flex items-center gap-2 rounded cursor-pointer',
  {
    variants: {
      size: {
        small: 'h-6 px-2 text-xs',
        middle: 'h-8 px-3 text-sm',
        large: 'h-10 px-4 text-base',
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: '',
      },
    },
    defaultVariants: {
      size: 'middle',
      disabled: false,
    },
  }
);

/**
 * Popover color editor: SV pad, hue, alpha, hex input, optional presets.
 */
export const ColorPicker = ({
  value = '#000000',
  onChange,
  disabled = false,
  size = 'middle',
  showText = false,
  className,
  style,
  presets,
  positionReference,
}: ColorPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rgbaColor, setRgbaColor] = useState<RgbaColor>(hexToRgba(value));
  const [hsvColor, setHsvColor] = useState<HsvColor>(rgbToHsv(hexToRgba(value)));

  // Keep internal state in sync when `value` prop changes
  useEffect(() => {
    const rgba = hexToRgba(value);
    setRgbaColor(rgba);
    setHsvColor(rgbToHsv(rgba));
  }, [value]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    // Prefer under the field, left-aligned — never flip to the side of the panel.
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({
        fallbackPlacements: ['top-start'],
        padding: 8,
      }),
      shift({ padding: 8, crossAxis: true }),
    ],
  });

  useEffect(() => {
    const el = positionReference?.current;
    if (el) refs.setPositionReference(el);
  }, [positionReference, refs, isOpen]);

  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const handleColorChange = useCallback(
    (newRgba: RgbaColor) => {
      setRgbaColor(newRgba);
      setHsvColor(rgbToHsv(newRgba));
      const hex = rgbaToHex(newRgba);
      onChange?.(hex);
    },
    [onChange]
  );

  const handleHueChange = useCallback(
    (hue: number) => {
      const newHsv = { ...hsvColor, h: hue };
      setHsvColor(newHsv);
      const newRgba = hsvToRgb(newHsv);
      handleColorChange({ ...newRgba, a: rgbaColor.a });
    },
    [hsvColor, rgbaColor.a, handleColorChange]
  );

  const handleSaturationValueChange = useCallback(
    (s: number, v: number) => {
      const newHsv = { ...hsvColor, s, v };
      setHsvColor(newHsv);
      const newRgba = hsvToRgb(newHsv);
      handleColorChange({ ...newRgba, a: rgbaColor.a });
    },
    [hsvColor, rgbaColor.a, handleColorChange]
  );

  const handleAlphaChange = useCallback(
    (alpha: number) => {
      handleColorChange({ ...rgbaColor, a: alpha });
    },
    [rgbaColor, handleColorChange]
  );

  const handlePresetClick = useCallback(
    (presetColor: string) => {
      if (disabled) return;
      const rgba = hexToRgba(presetColor);
      handleColorChange(rgba);
    },
    [disabled, handleColorChange]
  );

  const togglePicker = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const currentHex = rgbaToHex(rgbaColor);

  return (
    <>
      <div
        ref={refs.setReference}
        className={cn(
          colorPickerVariants({ size: showText ? size : undefined, disabled }),
          showText
            ? 'inline-flex h-7 min-h-7 items-center gap-1.5 border border-[var(--line)] bg-[var(--accent-soft)] px-1'
            : 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border-0 bg-[var(--accent-soft)] p-1',
          className
        )}
        style={style}
        {...getReferenceProps({
          onClick: togglePicker,
        })}
      >
        <div
          className="h-full w-full rounded-[4px]"
          style={{ backgroundColor: currentHex }}
        />
        {showText && (
          <span className='text-text-default-base flex-1 min-w-0 truncate'>
            {currentHex.toUpperCase()}
          </span>
        )}
      </div>
      <FloatingPortal>
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            visibility: isOpen ? 'visible' : 'hidden',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
          className='z-[100]'
          {...getFloatingProps()}
        >
          <div
            className={cn(
              '!bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg p-2 min-w-[240px]',
              isOpen
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-2'
            )}
          >
            <div className='mb-3 space-y-3'>
              <SaturationValueArea
                hsv={hsvColor}
                onChange={handleSaturationValueChange}
                disabled={disabled}
              />
              <HueSlider
                value={hsvColor.h}
                onChange={handleHueChange}
                disabled={disabled}
              />
              <AlphaSlider
                value={rgbaColor.a}
                color={rgbaColor}
                onChange={handleAlphaChange}
                disabled={disabled}
              />
            </div>
            <div className='mb-3 space-y-2'>
              <div className='flex items-center gap-2'>
                <span className='text-xs text-text-default-secondary w-8'>HEX</span>
                <Input
                  inputType='text'
                  value={currentHex.toUpperCase()}
                  onChange={(e) => {
                    const newColor = e.target.value;
                    if (/^#[0-9A-F]{6}$/i.test(newColor)) {
                      const rgba = hexToRgba(newColor);
                      handleColorChange(rgba);
                    }
                  }}
                  onBlur={(e) => {
                    const newColor = e.target.value;
                    if (!/^#[0-9A-F]{6}$/i.test(newColor)) {
                      const rgba = hexToRgba(value);
                      setRgbaColor(rgba);
                      setHsvColor(rgbToHsv(rgba));
                    }
                  }}
                  disabled={disabled}
                  size='small'
                  type='outlined'
                  className='flex-1'
                  placeholder='#000000'
                />
              </div>
              <div className='flex items-center gap-2'>
                <span className='text-xs text-text-default-secondary w-8'>A</span>
                <Input
                  inputType='number'
                  min='0'
                  max='100'
                  value={Math.round(rgbaColor.a * 100).toString()}
                  onChange={(e) => {
                    const alpha = Math.max(0, Math.min(100, Number(e.target.value))) / 100;
                    handleAlphaChange(alpha);
                  }}
                  disabled={disabled}
                  size='small'
                  type='outlined'
                  className='flex-1'
                />
                <span className='text-xs text-text-default-secondary'>%</span>
              </div>
            </div>
            {presets && presets.length > 0 && (
              <div className='pt-3 border-t border-[var(--color-border-default-base)]'>
                <div className='text-xs text-text-default-secondary mb-2'>Presets</div>
                <div className='flex flex-wrap gap-2'>
                  {presets.map((presetColor, index) => (
                    <button
                      key={index}
                      type='button'
                      className={cn(
                        'w-6 h-6 rounded border border-[var(--color-border-default-base)] hover:scale-110',
                        currentHex === presetColor && 'ring-2 ring-brand-base'
                      )}
                      style={{ backgroundColor: presetColor }}
                      onClick={() => handlePresetClick(presetColor)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </FloatingPortal>
    </>
  );
};

export default ColorPicker;
