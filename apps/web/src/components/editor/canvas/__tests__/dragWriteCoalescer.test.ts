import { describe, expect, it, vi } from 'vitest';
import { createDragWriteCoalescer } from '../dragWriteCoalescer';

describe('createDragWriteCoalescer', () => {
  it('applies video live geom synchronously (no rAF lag vs SVG preview)', () => {
    const apply = vi.fn();
    const c = createDragWriteCoalescer(apply);

    const geom = {
      v1: { left: 10, top: 20, width: 100, height: 200, angle: 0 },
    };
    c.queueVideoGeom(geom);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ frames: [], videoGeom: geom });
    expect(c.getPendingVideoGeom()).toEqual(geom);
  });

  it('still coalesces frame writes to one rAF', async () => {
    const apply = vi.fn();
    const c = createDragWriteCoalescer(apply);

    c.queueFrames([{ id: 'f1', x: 1, y: 2, width: 3, height: 4 }]);
    c.queueFrames([{ id: 'f1', x: 5, y: 6, width: 7, height: 8 }]);
    expect(apply).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({
      frames: [{ id: 'f1', x: 5, y: 6, width: 7, height: 8 }],
    });
  });
});
