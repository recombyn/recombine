import type { Svg } from '@svgdotjs/svg.js';

export type SvgBoardHandle = {
  root: Svg;
  /** Layer that holds scene nodes (excludes chrome). */
  layer: ReturnType<Svg['group']>;
  /** nodeId → SVG element */
  nodeEls: Map<string, any>;
  getSvgElement: () => SVGSVGElement | null;
  /** Serialize scene layer for export (no UI chrome). */
  toSvgString: () => string;
};

let board: SvgBoardHandle | null = null;

export function setSvgBoard(next: SvgBoardHandle | null) {
  board = next;
}

export function getSvgBoard() {
  return board;
}
