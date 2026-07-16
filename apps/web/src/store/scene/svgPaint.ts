import type { Element, Svg } from '@svgdotjs/svg.js';
import {
  resolveLinearCoords,
  stopsWithOpacity,
  type FillImageFit,
  type SvgPaint,
} from '@/store/scene/sceneFill';
import { resolveShadow, type ShadowSpec } from '@/store/scene/sceneEffects';

let paintSeq = 0;

function nextPaintId(prefix: string) {
  paintSeq += 1;
  return `${prefix}-${paintSeq}`;
}

function preserveAspectForFit(fit: FillImageFit) {
  if (fit === 'fit') return 'xMidYMid meet';
  if (fit === 'crop' || fit === 'fill') return 'xMidYMid slice';
  return 'none';
}

function tileSize(width: number, height: number) {
  return {
    w: Math.max(24, Math.round(width / 3)),
    h: Math.max(24, Math.round(height / 3)),
  };
}

/** Apply fill paint (solid / gradient / diffuse pattern) onto an SVG.js element. */
export function applySvgFill(draw: Svg, el: Element, paint: SvgPaint, idHint = 'fill') {
  if (paint.kind === 'none') {
    el.fill('none');
    return;
  }
  if (paint.kind === 'solid') {
    el.fill(paint.color);
    return;
  }
  if (paint.kind === 'pattern') {
    const id = nextPaintId(idHint);
    const fit = paint.imageFit ?? 'fill';
    const rotate = paint.imageRotate ?? 0;
    const filter = paint.imageFilter;
    const opacityPct = paint.opacityPct ?? 100;
    const tile = fit === 'tile' ? tileSize(paint.width, paint.height) : null;
    const patternW = tile?.w ?? paint.width;
    const patternH = tile?.h ?? paint.height;

    const pattern = draw.defs().pattern(patternW, patternH, (add) => {
      const img = add.image(paint.dataUrl);
      const imgW = tile?.w ?? paint.width;
      const imgH = tile?.h ?? paint.height;
      img.size(imgW, imgH).attr({
        preserveAspectRatio: preserveAspectForFit(fit),
        ...(filter ? { style: `filter:${filter}` } : {}),
      });
      if (rotate) {
        img.transform({
          rotate,
          origin: [imgW / 2, imgH / 2],
        });
      }
    });
    pattern.id(id);
    if (tile) {
      pattern.attr({
        patternUnits: 'userSpaceOnUse',
        width: tile.w,
        height: tile.h,
      });
    }
    el.fill(pattern);
    el.attr('fill-opacity', Math.max(0, Math.min(1, opacityPct / 100)));
    return;
  }

  const id = nextPaintId(idHint);
  const stops = stopsWithOpacity(paint.gradient.colorStops, paint.opacityPct);
  if (paint.kind === 'linear') {
    const c = resolveLinearCoords(paint.gradient);
    const grad = draw.defs().gradient('linear', (add) => {
      stops.forEach((s) => add.stop(s.offset, s.color));
    });
    grad.attr({
      id,
      x1: `${c.x1 * 100}%`,
      y1: `${c.y1 * 100}%`,
      x2: `${c.x2 * 100}%`,
      y2: `${c.y2 * 100}%`,
      gradientUnits: 'objectBoundingBox',
    });
    el.fill(grad);
    return;
  }

  const cx = (paint.gradient.cx ?? 50) / 100;
  const cy = (paint.gradient.cy ?? 50) / 100;
  const r = Math.max(0.01, (paint.gradient.r ?? 50) / 100);
  const grad = draw.defs().gradient('radial', (add) => {
    stops.forEach((s) => add.stop(s.offset, s.color));
  });
  grad.attr({
    id,
    cx: `${cx * 100}%`,
    cy: `${cy * 100}%`,
    r: `${r * 100}%`,
    fx: `${cx * 100}%`,
    fy: `${cy * 100}%`,
    gradientUnits: 'objectBoundingBox',
  });
  el.fill(grad);
}

export function applySvgShadow(_draw: Svg, el: Element, shadow: ShadowSpec) {
  if (!shadow) {
    el.css('filter', null as any);
    return;
  }
  el.css(
    'filter',
    `drop-shadow(${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color})`
  );
}

export function applyNodeShadow(draw: Svg, el: Element, node: any) {
  applySvgShadow(draw, el, resolveShadow(node));
}
