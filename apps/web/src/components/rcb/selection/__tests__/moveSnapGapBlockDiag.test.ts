import { describe, expect, it } from 'vitest';
import {
  SMART_SNAP_PX,
  collectMoveSnapIndicators,
  GUIDE_COINCIDE_EPS,
  smartSnapThreshold,
  snapBoxToGrid,
  snapMoveToSmartGuides,
} from '../alignGuides';

/** Production settle used by move (smart → grid). */
function settle(opts: {
  box: { left: number; top: number; width: number; height: number };
  targets: Array<{ left: number; top: number; width: number; height: number }>;
  zoom: number;
  gridSize?: number;
}) {
  const gridSize = opts.gridSize ?? 1;
  const threshold = smartSnapThreshold(opts.zoom);
  let next = { ...opts.box };
  let guides = [] as ReturnType<typeof snapMoveToSmartGuides>['guides'];
  const beforeLeft = next.left;
  if (threshold > 0 && opts.targets.length) {
    const smart = snapMoveToSmartGuides({
      box: next,
      targets: opts.targets,
      threshold,
    });
    next = smart.box;
    guides = smart.guides;
  }
  if (gridSize > 0) {
    next = snapBoxToGrid(next, gridSize);
    guides = collectMoveSnapIndicators(next, opts.targets, GUIDE_COINCIDE_EPS);
  }
  return {
    after: next,
    guides,
    threshold,
    pulledX: Math.abs(next.left - beforeLeft) > 1e-9,
  };
}

describe('move snap gap block (8/zoom magnet)', () => {
  it('X flush magnet engages at gap ≈ threshold (proven zoom-varying 拦住)', () => {
    const left = { left: 0, top: 20, width: 200, height: 80 };
    const zooms = [0.25, 0.4, 0.5, 0.7, 1, 2, 4] as const;
    const rows: string[] = [];

    for (const zoom of zooms) {
      const threshold = smartSnapThreshold(zoom);
      expect(threshold).toBeCloseTo(SMART_SNAP_PX / zoom, 6);

      let firstPullGap: number | null = null;
      // 0.25 scene steps so sub-cell thresholds (high zoom) still register.
      for (let gap = 40; gap >= 0; gap -= 0.25) {
        const r = settle({
          box: { left: 200 + gap, top: 20, width: 80, height: 100 },
          targets: [left],
          zoom,
          gridSize: 0, // measure magnet only — grid is separate
        });
        if (r.pulledX && firstPullGap == null) firstPullGap = gap;
      }

      rows.push(
        `zoom=${zoom} threshold=${threshold.toFixed(2)} firstXPullAtGap=${firstPullGap}`
      );
      expect(firstPullGap).not.toBeNull();
      // First yank == SMART_SNAP_PX/zoom (e.g. gap≈20 @ 40% with 8px).
      expect(firstPullGap!).toBeGreaterThanOrEqual(threshold - 0.26);
      expect(firstPullGap!).toBeLessThanOrEqual(threshold + 0.01);
    }

    // Keep a readable failure dump when the magnet radius drifts.
    expect(rows.join('\n')).toMatch(/firstXPullAtGap=/);
  });

  it('while gap is outside magnet, move indicators have no gap badge and no false align', () => {
    const left = { left: 0, top: 20, width: 200, height: 80 };
    const zoom = 1;
    const threshold = smartSnapThreshold(zoom);
    const gap = threshold + 3;
    const r = settle({
      box: { left: 200 + gap, top: 20, width: 80, height: 100 },
      targets: [left],
      zoom,
      gridSize: 0,
    });
    expect(r.pulledX).toBe(false);
    expect(r.guides.some((g) => g.kind === 'gap')).toBe(false);
    // Tops coincide → Y align indicator is valid (exact), not a false X flush.
    expect(r.guides.some((g) => g.kind === 'align' && g.axis === 'x')).toBe(false);
    expect(r.guides.some((g) => g.kind === 'align' && g.axis === 'y')).toBe(true);
  });
});
