import { describe, expect, it } from 'vitest';
import { matchAspectPresetKey } from '../resizeGeometry';

const PRESETS = [
  { id: 'original', w: 0, h: 0 },
  { id: '1:1', w: 1, h: 1 },
  { id: '16:9', w: 16, h: 9 },
];

describe('matchAspectPresetKey', () => {
  it('matches true 1:1', () => {
    expect(matchAspectPresetKey(400, 400, PRESETS)).toBe('1:1');
  });

  it('does not label near-square chrome as 1:1', () => {
    expect(matchAspectPresetKey(449, 457, PRESETS)).toBe('original');
  });

  it('matches 16:9 within slack', () => {
    expect(matchAspectPresetKey(1600, 900, PRESETS)).toBe('16:9');
  });
});
