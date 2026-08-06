import { useState, type CSSProperties, type ReactNode, memo } from 'react';
import {
  RcbOverlayPortal,
  useRcbCamera,
  rcbSceneToScreen,
  rcbAlignInBox,
  type RcbAlign,
} from '@/components/rcb';
import ImageReplaceUploadControl from '@/components/editor/nodes/ImageNode/ImageReplaceUploadControl';

type SceneBox = { left: number; top: number; width: number; height: number };

type Props = {
  nodeId: string;
  box: SceneBox;
  /**
   * Where to park the replace control on the image box (stage/screen space).
   * Default `top-right` — 10px inset from the image edges.
   */
  align?: RcbAlign;
  /** Node rotation (deg) — button sits on the rotated top-right corner. */
  angle?: number;
  /** True while the pointer is over this image (selection hover). */
  imageHovered?: boolean;
};

/** Inset from the visible image edge to the button outer edge (screen px). */
const EDGE_PAD_MAX = 10;
const BTN_MAX = 20;
/** Hide replace control when the scaled size would be smaller than this (screen px). */
const BTN_HIDE = 12;

/** Cap at BTN_MAX; shrink with the node; null → hide. */
function replaceBtnScale(stageW: number, stageH: number): { scale: number; pad: number } | null {
  const minSide = Math.min(stageW, stageH);
  const btn = Math.min(BTN_MAX, minSide * 0.28);
  if (btn < BTN_HIDE) return null;
  return {
    scale: btn / BTN_MAX,
    pad: Math.min(EDGE_PAD_MAX, Math.max(2, btn * 0.45)),
  };
}

/**
 * Replace control for selected image nodes — top-right corner, 10px inset.
 * Uploads via backend COS; keeps node width; height follows new image aspect.
 */
function ImageReplaceCornerButton({
  nodeId,
  box,
  align = 'top-right',
  angle = 0,
  imageHovered = false,
}: Props): ReactNode {
  const [loading, setLoading] = useState(false);
  /** Keep visible while the pointer is on the button (image hover clears over toolbar). */
  const [btnHovered, setBtnHovered] = useState(false);
  const camera = useRcbCamera();
  const tl = rcbSceneToScreen(camera, box.left, box.top);
  const br = rcbSceneToScreen(camera, box.left + box.width, box.top + box.height);
  const stageBox = {
    left: Math.min(tl.x, br.x),
    top: Math.min(tl.y, br.y),
    width: Math.abs(br.x - tl.x),
    height: Math.abs(br.y - tl.y),
  };
  const sized = replaceBtnScale(stageBox.width, stageBox.height);
  // Keep on screen while uploading even if the node is tiny.
  if (!sized && !loading) return null;
  const scale = sized?.scale ?? BTN_HIDE / BTN_MAX;
  const pad = sized?.pad ?? 2;
  const { x, y } =
    align === 'top-right'
      ? {
          x: Math.max(0, stageBox.width - pad - BTN_MAX),
          y: pad,
        }
      : rcbAlignInBox(
          { left: 0, top: 0, width: stageBox.width, height: stageBox.height },
          { width: BTN_MAX, height: BTN_MAX },
          align,
          pad
        );
  const visible = loading || imageHovered || btnHovered;

  const frameStyle: CSSProperties = {
    position: 'absolute',
    left: stageBox.left,
    top: stageBox.top,
    width: stageBox.width,
    height: stageBox.height,
    transform: Math.abs(angle) > 0.001 ? `rotate(${angle}deg)` : undefined,
    transformOrigin: 'center center',
  };

  const btnWrapStyle: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: BTN_MAX,
    height: BTN_MAX,
    transform: scale < 0.999 ? `scale(${scale})` : undefined,
    transformOrigin: align === 'top-right' ? 'top right' : 'top left',
  };

  return (
    <RcbOverlayPortal>
      <div className="pointer-events-none absolute z-[35]" style={frameStyle}>
        <div
          data-sel-toolbar
          data-image-replace
          data-image-node-id={nodeId}
          className={
            visible
              ? 'pointer-events-auto absolute opacity-100 transition-opacity duration-150'
              : 'pointer-events-none absolute opacity-0 transition-opacity duration-150'
          }
          style={btnWrapStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => setBtnHovered(true)}
          onPointerLeave={() => setBtnHovered(false)}
        >
          <ImageReplaceUploadControl
            nodeId={nodeId}
            sceneBox={box}
            onLoadingChange={setLoading}
          />
        </div>
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(ImageReplaceCornerButton);
