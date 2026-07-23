import SelectionChrome from '@/components/rcb/selection/SelectionChrome';
import type { ArtboardFrame } from '@/components/rcb/frames/types';

/** Artboard selection control box: border + resize handles (no rotate; box is non-blocking). */
export default function FrameSelectionChrome({
  frame,
  showHandles = true,
}: {
  frame: ArtboardFrame;
  showHandles?: boolean;
}) {
  const locked = Boolean(frame.locked);
  return (
    <SelectionChrome
      box={{
        left: frame.x,
        top: frame.y,
        width: Math.max(1, frame.width),
        height: Math.max(1, frame.height),
      }}
      showHandles={showHandles && !locked}
      showRotate={false}
      interactiveBox={false}
      boxDataAttr="data-frame-sel-box"
      handleDataAttr="data-frame-handle"
      handleDataValue="resize"
    />
  );
}
