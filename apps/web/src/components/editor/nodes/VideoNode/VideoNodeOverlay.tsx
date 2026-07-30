import { useMemo, type CSSProperties, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { useRcbCamera } from '@/components/rcb';
import { isVideoGeneratorNode, isVideoNode } from '@/components/rcb/scene/sceneDocument';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import VideoHoverPlayback from './VideoHoverPlayback';

function readOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readNodeAngle(node: any) {
  const n = Number(node?.attrs?.angle);
  return Number.isFinite(n) ? n : 0;
}

function readNodeFlip(node: any) {
  const flipX = node?.attrs?.flipX === true || node?.attrs?.flipX === 'true';
  const flipY = node?.attrs?.flipY === true || node?.attrs?.flipY === 'true';
  return { flipX, flipY };
}

function plateTransform(angle: number) {
  if (Math.abs(angle) > 0.001) return `rotate(${angle}deg)`;
  return undefined;
}

/**
 * World-layer video plates (under selection chrome — same stacking as images).
 * Counter-scale cancels camera zoom so <video> is not blacked out.
 */
function VideoNodeOverlay({
  document,
  hidden,
  readOnly,
}: {
  document: any;
  hidden?: boolean;
  readOnly?: boolean;
}): ReactNode {
  const camera = useRcbCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  const videoToolPanel = useSelector(
    (state: any) => state.editor.videoToolPanel as null | { nodeId: string; kind: string }
  );
  const imageToolPanel = useSelector(
    (state: any) => state.editor.imageToolPanel as null | { nodeId: string; kind: string }
  );
  const ids = useMemo(() => {
    const children: string[] = document?.deltaSetLike?.ROOT?.children || [];
    return children.filter((id) => {
      const node = document?.deltaSetLike?.[id];
      if (!node || isVideoGeneratorNode(node)) return false;
      if (!isVideoNode(node) && node.key !== 'video') return false;
      return Boolean(String(node?.attrs?.src || '').trim());
    });
  }, [document]);

  if (!ids.length) return null;
  if (hidden) return null;

  return (
    <>
      {ids.map((nodeId) => {
        const node = document?.deltaSetLike?.[nodeId];
        if (!node) return null;
        const src = String(node.attrs?.src || '').trim();
        if (!src) return null;
        if (videoToolPanel?.nodeId === nodeId) return null;
        const cropSession =
          imageToolPanel?.nodeId === nodeId && imageToolPanel.kind === 'crop';
        const { left, top } = nodeLeftTop(document, node);
        const width = Math.max(1, Number(node.width) || 1);
        const height = Math.max(1, Number(node.height) || 1);
        const angle = readNodeAngle(node);
        const { flipX, flipY } = readNodeFlip(node);
        const radii = radiiFromAttrs(node.attrs || {});
        const scenePlate: CSSProperties & {
          left: number;
          top: number;
          width: number;
          height: number;
        } = {
          left,
          top,
          width,
          height,
          borderRadius: `${radii.tl}px ${radii.tr}px ${radii.br}px ${radii.bl}px`,
          transform: plateTransform(angle),
          transformOrigin: 'center center',
        };
        return (
          <VideoHoverPlayback
            key={nodeId}
            nodeId={nodeId}
            scenePlate={scenePlate}
            zoom={zoom}
            angle={angle}
            src={src}
            poster={String(node.attrs?.poster || '').trim() || undefined}
            uploadKey={
              String(node.attrs?.uploadKey || node.attrs?.key || '').trim() || null
            }
            disabled={readOnly || cropSession}
            hidden={hidden}
            flipX={flipX}
            flipY={flipY}
            trimStart={readOptionalNumber(node.attrs?.trimStart)}
            trimEnd={readOptionalNumber(node.attrs?.trimEnd)}
            cropX={cropSession ? undefined : readOptionalNumber(node.attrs?.cropX)}
            cropY={cropSession ? undefined : readOptionalNumber(node.attrs?.cropY)}
            cropW={cropSession ? undefined : readOptionalNumber(node.attrs?.cropW)}
            cropH={cropSession ? undefined : readOptionalNumber(node.attrs?.cropH)}
          />
        );
      })}
    </>
  );
}

export default memo(VideoNodeOverlay);
