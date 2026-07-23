import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  RcbOverlayPortal,
  useRcbCamera,
  rcbSceneToScreen,
} from '@/components/rcb';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';

const PILL_BOTTOM_PAD_PX = 14;

function useProcessStageBox(document: any, node: any) {
  const camera = useRcbCamera();
  const { left, top } = nodeLeftTop(document, node);
  const width = Math.max(1, Number(node.width) || 1);
  const height = Math.max(1, Number(node.height) || 1);
  const z = Math.max(0.05, camera.zoom || 1);
  const origin = rcbSceneToScreen(camera, left, top);
  const stageW = width * z;
  const stageH = height * z;
  const radii = radiiFromAttrs(node.attrs || {});
  return {
    camera,
    left,
    top,
    width,
    height,
    z,
    origin,
    stageW,
    stageH,
    borderRadius: `${radii.tl * z}px ${radii.tr * z}px ${radii.br * z}px ${radii.bl * z}px`,
  };
}

/** Sweeping highlight over the SVG loading plate. */
function ProcessShimmerPlate({
  nodeId,
  node,
  document,
}: {
  nodeId: string;
  node: any;
  document: any;
}): ReactNode {
  const { origin, stageW, stageH, borderRadius } = useProcessStageBox(document, node);

  const style = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: origin.x,
      top: origin.y,
      width: stageW,
      height: stageH,
      borderRadius,
    }),
    [origin.x, origin.y, stageW, stageH, borderRadius]
  );

  return (
    <div
      data-image-process-shimmer
      data-scene-node-id={nodeId}
      className="image-process-shimmer pointer-events-none absolute z-[29] overflow-hidden"
      style={style}
      aria-hidden
    />
  );
}

function ProcessStatusPill({
  nodeId,
  node,
  document,
}: {
  nodeId: string;
  node: any;
  document: any;
}): ReactNode {
  const { origin, stageW, stageH } = useProcessStageBox(document, node);
  const label = String(node.attrs?.processLabel || '处理中');

  const style = useMemo(
    (): CSSProperties => ({
      position: 'absolute',
      left: origin.x + stageW / 2,
      top: origin.y + stageH - PILL_BOTTOM_PAD_PX,
      transform: 'translate(-50%, -100%)',
    }),
    [origin.x, origin.y, stageW, stageH]
  );

  return (
    <div
      data-image-process-label
      data-scene-node-id={nodeId}
      className="pointer-events-none absolute z-[30] whitespace-nowrap rounded-full bg-[rgba(55,55,55,0.72)] px-2.5 py-1 text-[11px] font-medium leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]"
      style={style}
    >
      {label}
    </div>
  );
}

/**
 * Screen-fixed shimmer + status pills for image process jobs.
 * The SVG plate stays in world space; shimmer/label are portaled so zoom
 * does not enlarge the sweep animation typography.
 */
export default function ImageProcessOverlay({
  document,
  hidden,
}: {
  document: any;
  /** Hide while move / resize / rotate is in progress. */
  hidden?: boolean;
}): ReactNode {
  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => {
      const node = document?.deltaSetLike?.[id];
      if (node?.key !== 'image') return false;
      return String(node?.attrs?.processStatus || '') === 'running';
    });
  }, [document]);

  if (hidden || !ids.length) return null;

  return (
    <RcbOverlayPortal>
      {ids.map((id) => {
        const node = document.deltaSetLike[id];
        if (!node) return null;
        return (
          <div key={id}>
            <ProcessShimmerPlate nodeId={id} node={node} document={document} />
            <ProcessStatusPill nodeId={id} node={node} document={document} />
          </div>
        );
      })}
    </RcbOverlayPortal>
  );
}
