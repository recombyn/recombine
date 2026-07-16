import { useEffect, useRef, useState, type RefObject } from 'react';
import { createSvgBoard } from '@/store/scene/sceneToSvg';
import {
  setSvgBoard,
  type SvgBoardHandle,
} from '@/store/scene/svgCanvasRegistry';

/**
 * Mount SVG.js board onto a host element and register it globally for export.
 */
export function useSvgBoard(
  hostRef: RefObject<HTMLElement | null>,
  paperW: number,
  paperH: number
) {
  const boardRef = useRef<SvgBoardHandle | null>(null);
  const [boardEpoch, setBoardEpoch] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const { root, layer } = createSvgBoard(host, paperW, paperH);
    const handle: SvgBoardHandle = {
      root,
      layer,
      nodeEls: new Map(),
      getSvgElement: () => root.node as unknown as SVGSVGElement,
      toSvgString: () => {
        const clone = root.node.cloneNode(true) as SVGSVGElement;
        return new XMLSerializer().serializeToString(clone);
      },
    };
    boardRef.current = handle;
    setSvgBoard(handle);
    setBoardEpoch((n) => n + 1);

    return () => {
      if (boardRef.current === handle) {
        setSvgBoard(null);
        boardRef.current = null;
      }
      root.remove();
    };
    // Host dimensions are applied via later effects; mount board once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { boardRef, boardEpoch };
}
