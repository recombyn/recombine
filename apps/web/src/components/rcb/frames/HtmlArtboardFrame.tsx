/** Artboard: SVG plate + HTML title / process chrome. */
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode, memo } from 'react';
import { RcbOverlayPortal, useRcbCamera } from '../camera/context';
import { rcbSceneToScreen } from '../core/math';
import {
  createSvgBoard,
  fitInfiniteSvgToContent,
  seedInfiniteSvgViewport,
} from '@/components/rcb/scene/paint/sceneToSvg';
import { append, setAttrs, setFill, setStroke, svgEl } from '@/components/rcb/scene/paint/svgDom';
import {
  registerShapeHost,
  unregisterShapeHost,
  updateShapeHostElement,
} from '@/components/rcb/shapes/shapeHostRegistry';
import NodeTitleLabel from '../selection/chrome/NodeTitleLabel';
import type { ArtboardFrame } from '@/components/rcb/frames/types';

type HtmlArtboardFrameProps = {
  frame: ArtboardFrame;
  selected?: boolean;
  onSelect?: () => void;
  onRename?: (name: string) => void;
  /** Drag the label to move the artboard. */
  onMove?: (x: number, y: number, opts?: { skipGrid?: boolean }) => void;
  onMoveStart?: () => void;
  /** Label drag ended (clear guides, etc.). */
  onMoveEnd?: () => void;
  /** Hide title while the frame is being moved. */
  hideTitle?: boolean;
  /** body under world canvas; label above so it stays clickable */
  layer?: 'body' | 'label';
  /** Unified stack z-index (interleaves with shapes). */
  zIndex?: number;
};

function paintFramePlate(
  layer: SVGGElement,
  frame: ArtboardFrame,
  selected: boolean,
  generating: boolean
): SVGGElement {
  while (layer.firstChild) layer.removeChild(layer.firstChild);

  const x = Number(frame.x) || 0;
  const y = Number(frame.y) || 0;
  const w = Math.max(1, Number(frame.width) || 1);
  const h = Math.max(1, Number(frame.height) || 1);
  const bg =
    generating
      ? '#e4ecf4'
      : frame.backgroundColor && frame.backgroundColor !== 'transparent'
        ? frame.backgroundColor
        : '#FFFFFF';

  const g = svgEl('g');
  append(layer, g);
  setAttrs(g, {
    transform: `translate(${x} ${y})`,
    'data-frame-id': frame.id,
    'data-scene-node-id': frame.id,
    'data-rcb-frame-plate': '1',
  });
  const anyG = g as unknown as {
    __sceneLeft?: number;
    __sceneTop?: number;
    sceneWidth?: number;
    sceneHeight?: number;
  };
  anyG.__sceneLeft = x;
  anyG.__sceneTop = y;
  anyG.sceneWidth = w;
  anyG.sceneHeight = h;

  const plate = svgEl('rect', {
    x: 0,
    y: 0,
    width: w,
    height: h,
    'data-baseline': '1',
    'data-radius-body': '1',
  });
  append(g, plate);
  setFill(plate, bg);
  // Idle: hairline. Selected: host chrome owns the blue box.
  if (selected) {
    setStroke(plate, 'none');
  } else {
    setStroke(plate, {
      color: 'color-mix(in srgb, var(--ink) 12%, transparent)',
      width: 1,
    });
    setAttrs(plate, { 'vector-effect': 'non-scaling-stroke' });
  }
  return g;
}

function HtmlArtboardFrame({
  frame,
  selected = false,
  onSelect,
  onRename,
  onMove,
  onMoveStart,
  onMoveEnd,
  hideTitle = false,
  layer = 'body',
  zIndex = 0,
}: HtmlArtboardFrameProps): ReactNode {
  const camera = useRcbCamera();
  const z = Math.max(0.05, camera.zoom || 1);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const generating = String(frame.processStatus || '') === 'running';
  const processLabel = String(frame.processLabel || 'Preparing…');

  const stageBox = useMemo(() => {
    const origin = rcbSceneToScreen(camera, frame.x, frame.y);
    return {
      left: origin.x,
      top: origin.y,
      width: frame.width * z,
      height: frame.height * z,
    };
  }, [camera, frame.x, frame.y, frame.width, frame.height, z]);

  const processOverlayStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: stageBox.left,
      top: stageBox.top,
      width: stageBox.width,
      height: stageBox.height,
    }),
    [stageBox.left, stageBox.top, stageBox.width, stageBox.height]
  );

  const processPillStyle = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: stageBox.left + stageBox.width / 2,
      top: stageBox.top + stageBox.height - 14,
      transform: 'translate(-50%, -100%)',
    }),
    [stageBox.left, stageBox.top, stageBox.width, stageBox.height]
  );

  const paintKey = [
    frame.id,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    frame.backgroundColor,
    frame.processStatus,
    selected ? 1 : 0,
    generating ? 1 : 0,
  ].join('|');

  useLayoutEffect(() => {
    if (layer !== 'body') return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    const x = Number(frame.x) || 0;
    const y = Number(frame.y) || 0;
    const w = Math.max(1, Number(frame.width) || 1);
    const h = Math.max(1, Number(frame.height) || 1);
    const { root, layer: sceneLayer } = createSvgBoard(host, 1, 1, { infinite: true });
    seedInfiniteSvgViewport(root, { left: x, top: y, width: w, height: h });
    setAttrs(root, { 'data-frame-id': frame.id, 'data-rcb-frame-svg': '1' });
    const el = paintFramePlate(sceneLayer, frame, selected, generating);
    registerShapeHost({ nodeId: frame.id, root, layer: sceneLayer, el, kind: 'svg' });
    updateShapeHostElement(frame.id, el);
    try {
      fitInfiniteSvgToContent(root, sceneLayer);
    } catch {
      /* seeded viewport is enough */
    }

    return () => {
      unregisterShapeHost(frame.id);
      try {
        root.remove();
      } catch {
        /* ignore */
      }
      host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, paintKey]);

  if (layer === 'label') {
    return (
      <>
        <NodeTitleLabel
          box={{
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
          }}
          name={frame.name || 'Frame'}
          sizeWidth={frame.width}
          sizeHeight={frame.height}
          dataAttr="frame-label"
          icon="frame"
          dataProps={{ 'data-frame-id': frame.id }}
          hidden={hideTitle}
          onSelect={onSelect}
          onRename={onRename}
          onMove={onMove}
          onMoveStart={onMoveStart}
          onMoveEnd={onMoveEnd}
          originX={frame.x}
          originY={frame.y}
          renameAriaLabel="Frame name"
        />
      </>
    );
  }

  return (
    <>
      <div
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        style={{ zIndex }}
        data-rcb-frame={frame.id}
        data-frame-id={frame.id}
      >
        <div
          ref={hostRef}
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          data-rcb-shape-host={frame.id}
          style={{ width: 0, height: 0, overflow: 'visible' }}
        />
      </div>
      {generating ? (
        <RcbOverlayPortal>
          <div
            data-artboard-process-shimmer
            data-frame-id={frame.id}
            className="rcb-artboard-process-shimmer pointer-events-none absolute z-[1] overflow-hidden"
            style={processOverlayStyle}
            aria-hidden
          />
          <div
            data-artboard-process-label
            data-frame-id={frame.id}
            className="pointer-events-none absolute z-[2] whitespace-nowrap rounded-full bg-[rgba(55,55,55,0.72)] px-2.5 py-1 text-[11px] font-medium leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]"
            style={processPillStyle}
          >
            {processLabel}
          </div>
        </RcbOverlayPortal>
      ) : null}
    </>
  );
}

export default memo(HtmlArtboardFrame);
