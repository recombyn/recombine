import { useEffect, useRef, useState, type CSSProperties, type ReactNode, memo } from 'react';
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
import {
  captureVideoPosterFrame,
  measureVideoNaturalSize,
} from '@/components/rcb/scene/document/sceneDocument';
import { finishImageProcess, patchDocumentNode } from '@/store/modules/editor';

type SceneBox = { left: number; top: number; width: number; height: number };

type Props = {
  nodeId: string;
  box: SceneBox;
  align?: RcbAlign;
  angle?: number;
  /** True while the pointer is over this video (selection hover). */
  videoHovered?: boolean;
};

/** Inset from the visible edge to the button outer edge (screen px). */
const EDGE_PAD = 10;

/**
 * Bare replace control (button + file input) for embedding in a shared corner bar.
 */
function VideoReplaceUploadControl({
  nodeId,
  sceneBox,
  onLoadingChange,
}: {
  nodeId: string;
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
    if (!file || !file.type.startsWith('video/') || loading) return;
    const targetId = nodeId;
    const keepWidth = Math.max(1, Math.round(boxRef.current.width));
    setLoading(true);

    void (async () => {
      try {
        const preview = await readFileAsDataUrl(file);
        const naturalPreview = await measureVideoNaturalSize(preview);
        const previewH = Math.max(
          1,
          Math.round((keepWidth * naturalPreview.height) / Math.max(1, naturalPreview.width))
        );
        let previewPoster = '';
        try {
          previewPoster = await captureVideoPosterFrame(preview);
        } catch {
          /* optional */
        }
        if (!aliveRef.current || nodeIdRef.current !== targetId) return;
        dispatch(
          patchDocumentNode({
            nodeId: targetId,
            patch: {
              width: keepWidth,
              height: previewH,
              attrs: {
                src: preview,
                ...(previewPoster ? { poster: previewPoster } : {}),
                processStatus: 'running',
                processKind: 'upload',
                processLabel: '上传中',
                // New media — drop prior display crop / trim.
                cropX: 0,
                cropY: 0,
                cropW: 1,
                cropH: 1,
                trimStart: '',
                trimEnd: '',
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
          const natural = await measureVideoNaturalSize(src);
          naturalW = natural.width;
          naturalH = natural.height;
        }
        const height = Math.max(1, Math.round((keepWidth * naturalH) / Math.max(1, naturalW)));

        let poster = previewPoster;
        if (!poster) {
          try {
            poster = await captureVideoPosterFrame(src);
          } catch {
            /* optional */
          }
        }

        dispatch(
          finishImageProcess({
            nodeId: targetId,
            src,
            attrs: {
              assetKind: 'video',
              ...(uploaded.key ? { uploadKey: uploaded.key } : {}),
            },
          })
        );
        dispatch(
          patchDocumentNode({
            nodeId: targetId,
            patch: {
              width: keepWidth,
              height,
              attrs: {
                ...(poster ? { poster } : { poster: '' }),
                cropX: 0,
                cropY: 0,
                cropW: 1,
                cropH: 1,
                trimStart: '',
                trimEnd: '',
              },
            },
            skipHistory: true,
          })
        );
      } catch (err: any) {
        if (aliveRef.current) {
          dispatch(finishImageProcess({ nodeId: targetId }));
          const detail = err?.response?.data?.detail || err?.message || '替换视频失败';
          message.error(typeof detail === 'string' ? detail : '替换视频失败');
        }
      } finally {
        if (aliveRef.current && nodeIdRef.current === targetId) setLoading(false);
      }
    })();
  };

  return (
    <>
      <Tooltip tip={loading ? '上传中…' : '替换视频'} placement="top">
        <button
          type="button"
          disabled={loading}
          aria-label={loading ? '上传中…' : '替换视频'}
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
        accept="video/*"
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
 * Replace control for selected video nodes — top-right corner, 10px inset.
 * Uploads via backend COS; keeps node width; height follows new video aspect.
 */
function VideoReplaceCornerButton({
  nodeId,
  box,
  align = 'top-right',
  angle = 0,
  videoHovered = false,
}: Props): ReactNode {
  const [loading, setLoading] = useState(false);
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
  const visible = loading || videoHovered || btnHovered;

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
      <div className="pointer-events-none absolute z-[40]" style={frameStyle}>
        <div
          data-sel-toolbar
          data-video-replace
          data-video-node-id={nodeId}
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
          <VideoReplaceUploadControl
            nodeId={nodeId}
            sceneBox={box}
            onLoadingChange={setLoading}
          />
        </div>
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(VideoReplaceCornerButton);
