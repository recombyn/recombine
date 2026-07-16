import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type IconComponent = ComponentType<{ size?: number | string; color?: string; className?: string }>;

/** Render a react-icons component to an SVG data URL for canvas image nodes. */
export function iconToSvgDataUrl(
  Icon: IconComponent,
  opts?: { size?: number; color?: string }
): string {
  const size = opts?.size ?? 128;
  const color = opts?.color ?? '#333333';
  let svg = renderToStaticMarkup(createElement(Icon, { size, color }));
  if (!svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  svg = svg
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/fill="currentColor"/g, `fill="${color}"`);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
