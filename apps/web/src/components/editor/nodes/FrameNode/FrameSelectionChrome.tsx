import SelectionChrome from '@/components/editor/Canvas/selection/SelectionChrome';
import type { ArtboardFrame } from '@/store/modules/editor';

/** Artboard selection control box: border + resize handles (no rotate; box is non-blocking). */
export default function FrameSelectionChrome({ frame }: { frame: ArtboardFrame }) {
  return (
    <SelectionChrome
      box={{
        left: frame.x,
        top: frame.y,
        width: Math.max(1, frame.width),
        height: Math.max(1, frame.height),
      }}
      showRotate={false}
      interactiveBox={false}
      boxDataAttr="data-frame-sel-box"
      handleDataAttr="data-frame-handle"
      handleDataValue="resize"
    />
  );
}
