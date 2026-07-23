import { useMemo } from 'react';
import RcbShapeHost from './RcbShapeHost';

type Props = {
  document: any;
  reloadToken?: number | string;
  /** Bumps paint for nodes touched by the latest document patch. */
  documentPatchToken?: number;
  lastPatchedNodeIds?: string[];
  /** Hide this node's SVG paint (e.g. while inline text editor is open). */
  hiddenNodeId?: string | null;
};

/**
 * Renders each ROOT child as its own shape host (per-shape paint layer).
 * No CSS isolation here — layer mix-blend-mode must composite with siblings
 * and artboard fills below (Figma-like).
 */
export default function RcbShapesLayer({
  document,
  reloadToken = 0,
  documentPatchToken = 0,
  lastPatchedNodeIds = [],
  hiddenNodeId = null,
}: Props) {
  const ids = useMemo(() => {
    const children = document?.deltaSetLike?.ROOT?.children;
    return Array.isArray(children) ? (children as string[]) : [];
  }, [document]);

  const patched = useMemo(() => new Set(lastPatchedNodeIds.filter(Boolean)), [lastPatchedNodeIds]);

  if (!document || !ids.length) return null;

  return (
    <div
      data-rcb-shapes-layer="1"
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      style={{ zIndex: 1 }}
    >
      {ids.map((id, i) => (
        <RcbShapeHost
          key={id}
          nodeId={id}
          document={document}
          zIndex={i + 1}
          reloadToken={patched.has(id) ? `${reloadToken}:${documentPatchToken}` : reloadToken}
          forceHidden={hiddenNodeId === id}
        />
      ))}
    </div>
  );
}
