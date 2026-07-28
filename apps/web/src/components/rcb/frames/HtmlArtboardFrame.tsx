import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { RcbOverlayPortal, useRcbCamera } from '../camera/context';
import { rcbSceneToScreen } from '../core/math';
import NodeTitleLabel from '../selection/NodeTitleLabel';
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

/**
 * Frame chrome only. Draw/select content lives on the world SvgCanvas.
 * Body z-index comes from document.stackOrder (interleaves with shapes).
 * Label stays above via screen overlay.
 * Double-click the name to rename.
 */
export default function HtmlArtboardFrame({
  frame,
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

  const stageBox = useMemo(() => {
    const origin = rcbSceneToScreen(camera, frame.x, frame.y);
    return {
      left: origin.x,
      top: origin.y,
      width: frame.width * z,
      height: frame.height * z,
    };
  }, [camera, frame.x, frame.y, frame.width, frame.height, z]);

  const generating = String(frame.processStatus || '') === 'running';
  const processLabel = String(frame.processLabel || 'Preparing…');

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

  if (layer === 'label') {
    return (
      <>
        <RcbOverlayPortal>
          {/* Screen-fixed frame edge. Selection blue comes from FrameSelectionChrome
              (same 1.5px as shape chrome) — do not double-draw a thick inset here. */}
          <div
            className="pointer-events-none absolute z-[5]"
            style={{
              left: stageBox.left,
              top: stageBox.top,
              width: stageBox.width,
              height: stageBox.height,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
            }}
            aria-hidden
          />
        </RcbOverlayPortal>
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

  const bg =
    frame.backgroundColor && frame.backgroundColor !== 'transparent'
      ? frame.backgroundColor
      : '#FFFFFF';

  return (
    <>
      <div
        className="pointer-events-none absolute overflow-hidden"
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
          zIndex,
          // While generating, screen-space shimmer covers the plate; keep a neutral fill underneath.
          backgroundColor: generating ? '#e4ecf4' : bg,
        }}
        data-frame-id={frame.id}
      />
      {generating ? (
        <RcbOverlayPortal>
          <div
            data-artboard-process-shimmer
            data-frame-id={frame.id}
            className="artboard-process-shimmer pointer-events-none absolute z-[29] overflow-hidden"
            style={processOverlayStyle}
            aria-hidden
          />
          <div
            data-artboard-process-label
            data-frame-id={frame.id}
            className="pointer-events-none absolute z-[30] whitespace-nowrap rounded-full bg-[rgba(55,55,55,0.72)] px-2.5 py-1 text-[11px] font-medium leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]"
            style={processPillStyle}
          >
            {processLabel}
          </div>
        </RcbOverlayPortal>
      ) : null}
    </>
  );
}
