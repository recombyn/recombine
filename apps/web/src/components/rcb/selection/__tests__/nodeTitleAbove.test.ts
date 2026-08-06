import { describe, expect, it } from 'vitest';
import {
  NODE_TITLE_LABEL_GAP_PX,
  NODE_TITLE_LABEL_LINE_PX,
  SELECTION_HANDLE_CLEARANCE_PX,
  SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX,
  SELECTION_TOOLBAR_ABOVE_LABEL_GAP_PX,
  SELECTION_TOOLBAR_BELOW_BOX_GAP_PX,
  selectionToolbarAboveAnchorScene,
  toolbarAboveClearancePx,
  toolbarAboveScreenGapPx,
} from '../chrome/SelectionToolbarShell';
import {
  nodeTitleLabelWorldPlacement,
  nodeTitleScreenGapPx,
} from '../chrome/NodeTitleLabel';
import { expandInfiniteSvgPad } from '../../scene/paint/sceneToSvg';
import {
  CHROME_HANDLE_HIT_PX,
  CHROME_STROKE_PX,
  cursorForResize,
  selectionChromeSurfaceProps,
} from '../SelectionChrome';
import { rcbScreenPxToScene } from '../../core/math';

const CANVAS_ZOOMS = [0.5, 1, 2.247, 10, 71.61, 80, 100] as const;
const VIEWPORT_SCALES = [0.75, 0.9, 1, 1.1, 1.25] as const;

describe('nodeTitleLabelWorldPlacement — SVG knob contract', () => {
  it('clips the name so it cannot overlap the size column on a narrow plate', () => {
    const box = { left: 0, top: 10, width: 32, height: 32 };
    const zoom = 12.84;
    const place = nodeTitleLabelWorldPlacement(box, zoom, {
      sizeText: '32 × 32',
    });
    expect(place.nameMaxWidth).toBeGreaterThanOrEqual(0);
    expect(place.nameX + place.nameMaxWidth).toBeLessThanOrEqual(
      place.sizeX - place.sizeReserve + 1e-9
    );
    // eslint-disable-next-line no-console
    console.log('[test:title-overflow]', {
      zoom,
      nameMaxWidth: place.nameMaxWidth,
      sizeReserve: place.sizeReserve,
      boxWidth: box.width,
    });
  });

  it('uses scene = screenPx/zoom like SelectionChrome handles (no CSS counter-scale)', () => {
    const box = { left: 2, top: 4, width: 11, height: 15 };
    const zoom = 80;
    const place = nodeTitleLabelWorldPlacement(box, zoom);
    const inv = 1 / zoom;

    expect(place.fontSize).toBeCloseTo(11 * inv, 10);
    expect(place.iconSize).toBeCloseTo(12 * inv, 10);
    expect(place.gapScene).toBeCloseTo(NODE_TITLE_LABEL_GAP_PX * inv, 10);
    expect(place.lineScene).toBeCloseTo(NODE_TITLE_LABEL_LINE_PX * inv, 10);
    expect(place.labelBottomScene).toBeLessThan(box.top);
    expect(place.labelTopScene).toBeLessThan(place.labelBottomScene);
    // Title lives fully above the plate.
    expect(place.labelTopScene + place.lineScene).toBeCloseTo(place.labelBottomScene, 10);
    // eslint-disable-next-line no-console
    console.log('[test:title-svg@8000%]', {
      zoom,
      fontSize: place.fontSize,
      handleVisLike: 8 * inv,
      labelTopScene: place.labelTopScene,
      boxTop: box.top,
      gapScreen: (box.top - place.labelBottomScene) * zoom,
    });
  });

  it.each([...CANVAS_ZOOMS])(
    'keeps a 10 layout-px gap above the plate at canvas zoom %s',
    (zoom) => {
      const box = { left: 0, top: 24, width: 15, height: 24 };
      const place = nodeTitleLabelWorldPlacement(box, zoom);
      const gap = nodeTitleScreenGapPx(place, box.top, zoom, 1);
      expect(gap).toBeCloseTo(NODE_TITLE_LABEL_GAP_PX, 6);
      expect(place.labelBottomScene).toBeLessThan(box.top);
      expect(place.labelTopScene).toBeLessThan(box.top);
      // Screen-constant type: font * zoom === 11
      expect(place.fontSize * zoom).toBeCloseTo(11, 6);
      // eslint-disable-next-line no-console
      console.log('[test:title-gap@canvas]', {
        zoom,
        gapLayoutPx: gap,
        fontScreenPx: place.fontSize * zoom,
      });
    }
  );

  it.each([...VIEWPORT_SCALES])(
    'scales the 10px title gap with viewportScale %s',
    (viewportScale) => {
      const box = { left: 0, top: 24, width: 15, height: 24 };
      const zoom = 71.61;
      const place = nodeTitleLabelWorldPlacement(box, zoom);
      const visual = nodeTitleScreenGapPx(place, box.top, zoom, viewportScale);
      expect(visual).toBeCloseTo(NODE_TITLE_LABEL_GAP_PX * viewportScale, 6);
      // eslint-disable-next-line no-console
      console.log('[test:title-gap@viewport]', {
        zoom,
        viewportScale,
        visualGapPx: visual,
      });
    }
  );
});

describe('toolbar 20px outside node @ canvas + browser zoom', () => {
  it('uses a 10px title gap and 20px toolbar gaps from the node', () => {
    expect(NODE_TITLE_LABEL_GAP_PX).toBe(10);
    expect(SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX).toBe(20);
    expect(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX).toBe(20);
    expect(toolbarAboveClearancePx(false)).toBe(20);
    expect(toolbarAboveClearancePx(true)).toBe(
      NODE_TITLE_LABEL_GAP_PX +
        NODE_TITLE_LABEL_LINE_PX +
        SELECTION_TOOLBAR_ABOVE_LABEL_GAP_PX
    );
  });

  it.each([...CANVAS_ZOOMS])(
    'untitled toolbar bottom stays 20px + handle clear above plate at zoom %s',
    (zoom) => {
      const boxTop = 40;
      const gap = toolbarAboveScreenGapPx(boxTop, zoom, false);
      expect(gap).toBeCloseTo(
        SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX + SELECTION_HANDLE_CLEARANCE_PX,
        6
      );
      const anchor = selectionToolbarAboveAnchorScene(boxTop, zoom, false);
      expect(anchor).toBeLessThan(boxTop);
      expect(rcbScreenPxToScene(SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX, zoom)).toBeCloseTo(
        SELECTION_TOOLBAR_ABOVE_BOX_GAP_PX / zoom,
        8
      );
      // eslint-disable-next-line no-console
      console.log('[test:toolbar-gap@canvas]', { zoom, gapLayoutPx: gap, anchor });
    }
  );

  it.each([...CANVAS_ZOOMS])(
    'titled toolbar clears title (10+16+8) + handle at zoom %s',
    (zoom) => {
      const boxTop = 40;
      const gap = toolbarAboveScreenGapPx(boxTop, zoom, true);
      expect(gap).toBeCloseTo(
        toolbarAboveClearancePx(true) + SELECTION_HANDLE_CLEARANCE_PX,
        6
      );
      const box = { left: 0, top: boxTop, width: 15, height: 24 };
      const title = nodeTitleLabelWorldPlacement(box, zoom);
      const toolbarAnchor = selectionToolbarAboveAnchorScene(boxTop, zoom, true);
      expect(toolbarAnchor).toBeLessThan(title.labelTopScene);
      // eslint-disable-next-line no-console
      console.log('[test:toolbar-above-title@canvas]', {
        zoom,
        toolbarAnchor,
        titleTop: title.labelTopScene,
      });
    }
  );

  it.each([...VIEWPORT_SCALES])(
    'toolbar gap tracks viewportScale %s',
    (viewportScale) => {
      const boxTop = 40;
      const zoom = 2.247;
      const visual = toolbarAboveScreenGapPx(boxTop, zoom, true, 0, viewportScale);
      const expected =
        (toolbarAboveClearancePx(true) + SELECTION_HANDLE_CLEARANCE_PX) *
        viewportScale;
      expect(visual).toBeCloseTo(expected, 6);
    }
  );
});

describe('selectionChromeSurfaceProps (no handle-pad drift)', () => {
  it('fallback surface at 8000% is stroke-padded only — not handle-hit padded', () => {
    const box = { left: 2, top: 4, width: 11, height: 15 };
    const zoom = 80;
    const stroke = CHROME_STROKE_PX / zoom;
    const handleHit = CHROME_HANDLE_HIT_PX / zoom;
    const surf = selectionChromeSurfaceProps(
      box,
      0,
      stroke,
      { x: 0, y: 0, zoom },
      1
    );
    const vb = (surf.viewBox || '').split(/[\s,]+/).map(Number);
    const [, , vw, vh] = vb;
    expect(vw).toBeLessThan(box.width + 2 * handleHit);
    expect(vh).toBeLessThan(box.height + 2 * handleHit);
    expect(vw).toBeLessThanOrEqual(box.width + 2 * stroke + 1);
    expect(vh).toBeLessThanOrEqual(box.height + 2 * stroke + 1);
  });
});

describe('expandInfiniteSvgPad (private host handle hits only)', () => {
  it('grows viewBox + CSS box so corner hits outside path still lie inside the SVG', () => {
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    root.setAttribute('viewBox', '10 20 11 15');
    root.setAttribute('width', '11');
    root.setAttribute('height', '15');
    root.style.left = '10px';
    root.style.top = '20px';
    root.style.width = '11px';
    root.style.height = '15px';

    const zoom = 80;
    const inv = 1 / zoom;
    const pad = CHROME_HANDLE_HIT_PX * inv;
    expect(expandInfiniteSvgPad(root, pad)).toBe(true);

    const vb = (root.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    expect(vb[0]).toBeCloseTo(10 - pad, 8);
    expect(vb[1]).toBeCloseTo(20 - pad, 8);
    expect(vb[2]).toBeCloseTo(11 + pad * 2, 8);
    expect(vb[3]).toBeCloseTo(15 + pad * 2, 8);
  });
});

describe('cursorForResize still direction-correct', () => {
  it('edge handles stay axis cursors at angle 0', () => {
    expect(cursorForResize('n', 0)).toBe('n-resize');
    expect(cursorForResize('e', 0)).toBe('e-resize');
    expect(cursorForResize('se', 0)).toBe('se-resize');
  });
});
