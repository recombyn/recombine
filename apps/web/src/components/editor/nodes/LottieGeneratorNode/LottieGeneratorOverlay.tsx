import { useMemo, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { isLottieGeneratorNode } from '@/components/rcb/scene/document/sceneDocument';
import { nodeLeftTop } from '@/components/rcb/scene/paint/sceneToSvg';
import LottieGeneratorCard from '@/components/editor/nodes/LottieGeneratorNode/LottieGeneratorCard';
import { EMPTY_ID_LIST } from '@/store/modules/editor';

/**
 * World-layer Lottie Generator composers (same lattice as video/image generators).
 * SVG keeps the hit target; the title row comes from the shared selection label.
 */
function LottieGeneratorOverlay({
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
    (state: any) => (state.editor.selectedNodeIds as string[]) ?? EMPTY_ID_LIST
  );
  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => isLottieGeneratorNode(document?.deltaSetLike?.[id]));
  }, [document]);

  if (!ids.length) return null;

  return (
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
          <LottieGeneratorCard
            key={nodeId}
            nodeId={nodeId}
            sceneBox={{ x: left, y: top, width, height }}
            showComposer={!hidden && selectedNodeIds.length === 1 && selectedNodeIds[0] === nodeId}
            disabled={readOnly}
          />
        );
      })}
    </div>
  );
}

export default memo(LottieGeneratorOverlay);
