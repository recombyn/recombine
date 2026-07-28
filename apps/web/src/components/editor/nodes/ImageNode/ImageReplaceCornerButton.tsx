import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { HiOutlineArrowUpTray } from 'react-icons/hi2';
import { message } from '@/components/base';
import Tooltip from '@/components/base/tooltip';
import { uploadImageFile, readFileAsDataUrl } from '@/utils/uploadImage';
import {
  RcbOverlayPortal,
  useRcbCamera,
  rcbSceneToScreen,
  rcbAlignInBox,
  type RcbAlign,
} from '@/components/rcb';
import { measureImageNaturalSize } from '@/components/rcb/scene/sceneDocument';
import { finishImageProcess, patchDocumentNode } from '@/store/modules/editor';

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
const EDGE_PAD = 10;

/**
 * Bare replace control (button + file input) for embedding in a shared corner bar.
 */
export function ImageReplaceUploadControl({
  nodeId,
  sceneBox,
  onLoadingChange,
}: {
  nodeId: string;
  /** Scene-space box — width kept when replacing. */
  sceneBox: SceneBox;
  onLoadingChange?: (loading: boolean) => void;
}): ReactNode {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeIdRef = useRef(nodeId);
  const boxRef = useRef(sceneBox);
  const aliveRef = useRef(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    nodeIdRef.current = nodeId;
  }, [nodeId]);

  useEffect(() => {
    boxRef.current = sceneBox;
  }, [sceneBox]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const onFile = (file: File | null) => {
    if (!file || !file.type.startsWith('image/') || loading) return;
    const targetId = nodeId;
    const keepWidth = Math.max(1, Math.round(boxRef.current.width));
    setLoading(true);

    void (async () => {
      try {
        const preview = await readFileAsDataUrl(file);
        const naturalPreview = await measureImageNaturalSize(preview);
        const previewH = Math.max(
          1,
          Math.round((keepWidth * naturalPreview.height) / Math.max(1, naturalPreview.width))
        );
        if (!aliveRef.current || nodeIdRef.current !== targetId) return;
        dispatch(
          patchDocumentNode({
            nodeId: targetId,
            patch: {
              width: keepWidth,
              height: previewH,
              attrs: {
                src: preview,
                processStatus: 'running',
                processKind: 'upload',
                processLabel: '上传中',
              },
            },
          })
        );

        const uploaded = await uploadImageFile(file);
        const src = uploaded.url;
        if (!aliveRef.current || nodeIdRef.current !== targetId) return;

        let naturalW = Number(uploaded.width) || 0;
        let naturalH = Number(uploaded.height) || 0;
        if (!(naturalW > 0 && naturalH > 0)) {
          const natural = await measureImageNaturalSize(src);
          naturalW = natural.width;
          naturalH = natural.height;
        }
        const height = Math.max(
          1,
          Math.round((keepWidth * naturalH) / Math.max(1, naturalW))
        );
        const assetKind =
          file.type === 'image/svg+xml' || String(uploaded.mime || '').includes('svg')
            ? 'icon'
            : 'image';

        dispatch(
          finishImageProcess({
            nodeId: targetId,
            src,
            attrs: {
              assetKind,
              ...(uploaded.key ? { uploadKey: uploaded.key } : {}),
            },
          })
        );
        dispatch(
          patchDocumentNode({
            nodeId: targetId,
            patch: { width: keepWidth, height },
            skipHistory: true,
          })
        );
      } catch (err: any) {
        if (aliveRef.current) {
          dispatch(finishImageProcess({ nodeId: targetId }));
          const detail = err?.response?.data?.detail || err?.message || '替换图片失败';
          message.error(typeof detail === 'string' ? detail : '替换图片失败');
        }
      } finally {
        if (aliveRef.current && nodeIdRef.current === targetId) setLoading(false);
      }
    })();
  };

  return (
    <>
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
    </>
  );
}

/**
 * Replace control for selected image nodes — top-right corner, 10px inset.
 * Uploads via backend COS; keeps node width; height follows new image aspect.
 */
export default function ImageReplaceCornerButton({
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
  const BTN = 20;
  const { x, y } =
    align === 'top-right'
      ? {
          x: Math.max(0, stageBox.width - EDGE_PAD - BTN),
          y: EDGE_PAD,
        }
      : rcbAlignInBox(
          { left: 0, top: 0, width: stageBox.width, height: stageBox.height },
          { width: BTN, height: BTN },
          align,
          EDGE_PAD
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
              : 'pointer-events-auto absolute opacity-0 transition-opacity duration-150'
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
