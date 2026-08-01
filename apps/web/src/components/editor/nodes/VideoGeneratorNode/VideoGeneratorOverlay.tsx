import { useMemo, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { RcbOverlayPortal } from '@/components/rcb';
import { isVideoGeneratorNode } from '@/components/rcb/scene/document/sceneDocument';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import VideoGeneratorCard from '@/components/editor/nodes/VideoGeneratorNode/VideoGeneratorCard';

/**
 * Screen-space Video Generator composers for every generator plate on the canvas.
 * SVG keeps the hit target; the title row comes from the shared selection label.
 */
function VideoGeneratorOverlay({
  document,
  hidden,
  readOnly,
}: {
  document: any;
  /** Hide while move / resize / rotate is in progress. */
  hidden?: boolean;
  readOnly?: boolean;
}): ReactNode {
  const selectedNodeIds: string[] = useSelector(
    (state: any) => state.editor.selectedNodeIds || []
  );
  const canvasAttachPick = useSelector(
    (state: any) => state.editor.canvasAttachPick as null | { target: string }
  );
  const pendingCanvasAttach = useSelector(
    (state: any) =>
      state.editor.pendingCanvasAttach as null | { target: string; payload: string | string[] }
  );
  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => isVideoGeneratorNode(document?.deltaSetLike?.[id]));
  }, [document]);

  if (!ids.length) return null;

  // Keep cards mounted while transforming — local + attr state must survive hide.
  return (
    <RcbOverlayPortal>
      <div
        className={hidden ? 'pointer-events-none invisible' : undefined}
        aria-hidden={hidden || undefined}
      >
        {ids.map((nodeId) => {
          const node = document?.deltaSetLike?.[nodeId];
          if (!node) return null;
          const { left, top } = nodeLeftTop(document, node);
          const width = Math.max(1, Number(node.width) || 1);
          const height = Math.max(1, Number(node.height) || 1);
          return (
            <VideoGeneratorCard
              key={nodeId}
              nodeId={nodeId}
              sceneBox={{ x: left, y: top, width, height }}
              // Title comes from the shared selection label; composer follows it.
              showComposer={
                !hidden &&
                ((selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId) ||
                  canvasAttachPick?.target === `node:${nodeId}` ||
                  pendingCanvasAttach?.target === `node:${nodeId}`)
              }
              disabled={readOnly}
            />
          );
        })}
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(VideoGeneratorOverlay);
