import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  memo,
} from 'react';
import { useSelector } from 'react-redux';
import { useRcbCamera } from '@/components/rcb';
import {
  isVideoGeneratorNode,
  isVideoNode,
  stackZIndex,
} from '@/components/rcb/scene/sceneDocument';
import { radiiFromAttrs } from '@/components/rcb/scene/sceneRadii';
import { nodeLeftTop } from '@/components/rcb/scene/sceneToSvg';
import VideoHoverPlayback from './VideoHoverPlayback';

export type VideoGeomOverride = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function readOptionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readNodeAngle(node: any) {
  const n = Number(node?.attrs?.angle);
  return Number.isFinite(n) ? n : 0;
}

function plateTransform(angle: number) {
  if (Math.abs(angle) > 0.001) return `rotate(${angle}deg)`;
  return undefined;
}

/** Pan must not re-render every video plate — only push zoom when it changes. */
function VideoZoomSync({ onZoom }: { onZoom: (zoom: number) => void }) {
  const zoom = useRcbCamera().zoom;
  useEffect(() => {
    onZoom(Math.max(0.05, zoom || 1));
  }, [zoom, onZoom]);
  return null;
}

/**
 * Idle = freeze-frame still; playing = stable HTML <video>.
 * Selection must not remount plates (key=nodeId + memo).
 * During move/resize, `geometryOverrides` keeps plates glued to the chrome
 * (Redux document only commits at gesture end).
 */
function VideoNodeOverlay({
  document,
  hidden,
  readOnly,
  geometryOverrides = null,
}: {
  document: any;
  hidden?: boolean;
  readOnly?: boolean;
  /** Live drag/resize boxes — same scene space as selection chrome. */
  geometryOverrides?: Record<string, VideoGeomOverride> | null;
}): ReactNode {
  const [zoom, setZoom] = useState(1);
  const onZoom = useCallback((z: number) => {
    setZoom((prev) => (Math.abs(prev - z) < 1e-6 ? prev : z));
  }, []);
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

  return (
    <>
      <VideoZoomSync onZoom={onZoom} />
      {ids.map((nodeId) => {
        const node = document?.deltaSetLike?.[nodeId];
        if (!node) return null;
        const src = String(node.attrs?.src || '').trim();
        if (!src) return null;
        // Keep mounted during trim — hide only (unmount resets currentTime).
        const trimOpen = videoToolPanel?.nodeId === nodeId;
        const cropSession =
          imageToolPanel?.nodeId === nodeId && imageToolPanel.kind === 'crop';
        const { left, top } = nodeLeftTop(document, node);
        const ov = geometryOverrides?.[nodeId];
        const width = Math.max(1, ov ? ov.width : Number(node.width) || 1);
        const height = Math.max(1, ov ? ov.height : Number(node.height) || 1);
        const angle = readNodeAngle(node);
        const radii = radiiFromAttrs(node.attrs || {});
        const scenePlate: CSSProperties & {
          left: number;
          top: number;
          width: number;
          height: number;
        } = {
          left: ov ? ov.left : left,
          top: ov ? ov.top : top,
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
            stackZ={stackZIndex(document, 'node', nodeId)}
            src={src}
            poster={String(node.attrs?.poster || '').trim() || undefined}
            uploadKey={
              String(node.attrs?.uploadKey || node.attrs?.key || '').trim() || null
            }
            disabled={readOnly || cropSession}
            hidden={Boolean(hidden) || trimOpen}
            trimStart={readOptionalNumber(node.attrs?.trimStart)}
            trimEnd={readOptionalNumber(node.attrs?.trimEnd)}
          />
        );
      })}
    </>
  );
}

export default memo(VideoNodeOverlay);
