/**
 * Regression: full-bleed inset-0 chrome layer painted knobs but dropped resize hits.
 * Keep the same 0×0 + overflow-visible shell as SelectionFeature / SvgCanvas overlays.
 */
import { describe, expect, it } from 'vitest';
import { selChromeLayerShell } from '../HostPathChrome';

describe('selChromeLayerShell', () => {
  it('is a 0×0 left-top overflow shell (not full-bleed inset-0)', () => {
    const shell = selChromeLayerShell();
    expect(shell.width).toBe('0');
    expect(shell.height).toBe('0');
    expect(shell.pointerEvents).toBe('none');
    expect(shell.className).toContain('left-0');
    expect(shell.className).toContain('top-0');
    expect(shell.className).toContain('overflow-visible');
    expect(shell.className).toContain('pointer-events-none');
    expect(shell.className).not.toContain('inset-0');
  });

  it('stays under SelectionFeature overlay z (1e6 < 1000001)', () => {
    expect(Number(selChromeLayerShell().zIndex)).toBe(1_000_000);
  });
});
