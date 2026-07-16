import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { HiOutlineArrowUpTray } from 'react-icons/hi2';
import { message } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import {
  CameraOverlayPortal,
  useCamera,
  useCameraOverlayRoot,
  worldToStage,
} from '@/components/editor/Canvas/stage/CameraContext';
import { measureImageNaturalSize } from '@/store/scene/sceneDocument';
import { patchDocumentNode } from '@/store/modules/editor';

type SceneBox = { left: number; top: number; width: number; height: number };

type Props = {
  nodeId: string;
  box: SceneBox;
  /** Degrees — kept for API compat; button uses AABB ∩ viewport center. */
  angle?: number;
};

/** Simulated upload latency until a real server endpoint is wired. */
const UPLOAD_SIM_MS = 900;
/** Inset from the visible image edge to the button outer edge (screen px). */
const EDGE_PAD = 10;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Top-right of (image AABB ∩ viewport) in stage space, inset by EDGE_PAD.
 * Falls back to image NE when the image is fully off-screen.
 */
function visibleTopRightStage(
  box: SceneBox,
  camera: { x: number; y: number; zoom: number },
  viewport: { width: number; height: number }
) {
  const tl = worldToStage(camera, box.left, box.top);
  const br = worldToStage(camera, box.left + box.width, box.top + box.height);
  const imgLeft = Math.min(tl.x, br.x);
  const imgRight = Math.max(tl.x, br.x);
  const imgTop = Math.min(tl.y, br.y);
  const imgBottom = Math.max(tl.y, br.y);

  const viewLeft = 0;
  const viewTop = 0;
  const viewRight = Math.max(1, viewport.width);
  const viewBottom = Math.max(1, viewport.height);

  const left = Math.max(imgLeft, viewLeft);
  const top = Math.max(imgTop, viewTop);
  const right = Math.min(imgRight, viewRight);
  const bottom = Math.min(imgBottom, viewBottom);

  if (right - left < 4 || bottom - top < 4) {
    return { x: imgRight - EDGE_PAD, y: imgTop + EDGE_PAD };
  }

  return {
    x: Math.min(viewRight - EDGE_PAD, Math.max(viewLeft + EDGE_PAD, right - EDGE_PAD)),
    y: Math.min(viewBottom - EDGE_PAD, Math.max(viewTop + EDGE_PAD, top + EDGE_PAD)),
  };
}

/**
 * Replace control for selected image nodes — top-right of the visible image area.
 * Keeps node width; height follows the new image aspect ratio.
 */
export default function ImageReplaceCornerButton({
  nodeId,
  box,
}: Props): ReactNode {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeIdRef = useRef(nodeId);
  const boxRef = useRef(box);
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const camera = useCamera();
  const overlayRoot = useCameraOverlayRoot();
  const viewport = {
    width: overlayRoot?.clientWidth || window.innerWidth,
    height: overlayRoot?.clientHeight || window.innerHeight,
  };
  const { x, y } = visibleTopRightStage(box, camera, viewport);

  useEffect(() => {
    nodeIdRef.current = nodeId;
  }, [nodeId]);

  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Anchor top-right of the button at (x, y) so EDGE_PAD is true outer margin.
  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    transform: 'translate(-100%, 0%)',
  };

  const onFile = (file: File | null) => {
    if (!file || !file.type.startsWith('image/') || loading) return;
    const targetId = nodeId;
    const keepWidth = Math.max(1, Math.round(boxRef.current.width));
    setLoading(true);

    void (async () => {
      try {
        const src = await readFileAsDataUrl(file);
        if (!src) throw new Error('empty');

        // Placeholder for future server upload.
        await delay(UPLOAD_SIM_MS);

        if (!aliveRef.current || nodeIdRef.current !== targetId) return;

        const natural = await measureImageNaturalSize(src);
        const height = Math.max(
          1,
          Math.round((keepWidth * natural.height) / Math.max(1, natural.width))
        );

        const assetKind =
          file.type === 'image/svg+xml' || src.startsWith('data:image/svg+xml')
            ? 'icon'
            : 'image';

        dispatch(
          patchDocumentNode({
            nodeId: targetId,
            patch: {
              width: keepWidth,
              height,
              attrs: { src, assetKind },
            },
          })
        );
      } catch {
        if (aliveRef.current) message.error('替换图片失败');
      } finally {
        if (aliveRef.current && nodeIdRef.current === targetId) setLoading(false);
      }
    })();
  };

  return (
    <CameraOverlayPortal>
      <div
        data-sel-toolbar
        data-image-replace
        className="pointer-events-auto absolute z-[35]"
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Tooltip title={loading ? '上传中…' : '替换图片'} placement="top">
          <button
            type="button"
            disabled={loading}
            aria-label={loading ? '上传中…' : '替换图片'}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[#1a1a1a] text-white shadow-[0_2px_8px_rgba(15,23,42,0.2)] transition hover:bg-[#2a2a2a] disabled:cursor-wait disabled:opacity-80"
            aria-busy={loading}
            onClick={() => {
              if (!loading) inputRef.current?.click();
            }}
          >
            {loading ? (
              <span
                className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white"
                aria-hidden
              />
            ) : (
              <HiOutlineArrowUpTray className="h-3 w-3" />
            )}
          </button>
        </Tooltip>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            onFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
      </div>
    </CameraOverlayPortal>
  );
}
