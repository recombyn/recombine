import { useEffect, type RefObject } from 'react';
import { useDispatch } from 'react-redux';
import { measureImageNaturalSize } from '@/components/rcb/scene/document/sceneDocument';
import { sceneToDocumentCoords } from '@/components/rcb/scene/paint/svgToScene';
import { rcbCenterOnPoint, type RcbCamera } from '@/components/rcb';
import {
  beginNodeUpload,
  finishNodeUpload,
  isUploadAbortError,
  uploadImageFromSrc,
  waitForImageReady,
} from '@/utils/uploadImage';
import {
  dataTransferHasChatImage,
  readChatImageDragUrl,
} from '@/utils/chatImageDrag';
import { message } from '@/components/base';
import store from '@/store';
import {
  failImageProcess,
  finishImageProcess,
  startImageUploadPlaceholder,
} from '@/store/modules/editor';
import { pointerToWorld, type ArtboardRect } from '../pointerToWorld';

type UseChatImageDropArgs = {
  readOnly: boolean;
  camera: RcbCamera;
  artboard?: ArtboardRect;
  viewportEl: HTMLElement | null;
  stageEl: HTMLElement | null;
  paperEl: HTMLElement | null;
  documentRef: RefObject<any>;
  imageSizeForViewport: (natural: { width: number; height: number }) => {
    width: number;
    height: number;
  };
  finishToSelect: () => void;
};

/** Drag chat gallery images onto the canvas → placeholder + upload. */
export function useChatImageDrop(args: UseChatImageDropArgs) {
  const {
    readOnly,
    camera,
    artboard,
    viewportEl,
    stageEl,
    paperEl,
    documentRef,
    imageSizeForViewport,
    finishToSelect,
  } = args;
  const dispatch = useDispatch();

  useEffect(() => {
    const hitEl = stageEl || paperEl;
    if (readOnly || !hitEl) return undefined;

    const onDragOver = (e: DragEvent) => {
      if (!dataTransferHasChatImage(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = async (e: DragEvent) => {
      const url = readChatImageDragUrl(e.dataTransfer);
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const natural = await measureImageNaturalSize(url);
        const { width, height } = imageSizeForViewport(natural);
        const world = pointerToWorld(
          camera,
          { viewportEl, stageEl, paperEl, artboard },
          e.clientX,
          e.clientY
        );
        const placed = rcbCenterOnPoint(world, { width, height });
        const latest = documentRef.current;
        if (!latest) return;
        const origin = sceneToDocumentCoords(latest, placed.left, placed.top);
        dispatch(
          startImageUploadPlaceholder({
            src: url,
            width,
            height,
            x: origin.x,
            y: origin.y,
            label: '上传中',
            name: 'Image',
          })
        );
        finishToSelect();
        const spawnedId = String(
          (store.getState() as any).editor?.pendingImageProcessId || ''
        );
        const signal = spawnedId ? beginNodeUpload(spawnedId) : undefined;
        try {
          const uploaded = await uploadImageFromSrc(url, 'chat-image.png', { signal });
          if (signal?.aborted) return;
          const remoteReady = await waitForImageReady(uploaded.url, { signal });
          if (signal?.aborted) return;
          dispatch(
            finishImageProcess({
              nodeId: spawnedId || undefined,
              ...(remoteReady ? { src: uploaded.url } : {}),
              attrs: uploaded.key ? { uploadKey: uploaded.key } : undefined,
            })
          );
        } finally {
          finishNodeUpload(spawnedId);
        }
      } catch (err: any) {
        if (isUploadAbortError(err)) return;
        dispatch(failImageProcess({}));
        const detail = err?.response?.data?.detail || err?.message || '图片上传失败';
        message.error(typeof detail === 'string' ? detail : '图片上传失败');
      }
    };

    hitEl.addEventListener('dragover', onDragOver);
    hitEl.addEventListener('drop', onDrop);
    return () => {
      hitEl.removeEventListener('dragover', onDragOver);
      hitEl.removeEventListener('drop', onDrop);
    };
  }, [
    artboard,
    camera,
    dispatch,
    documentRef,
    finishToSelect,
    imageSizeForViewport,
    paperEl,
    readOnly,
    stageEl,
    viewportEl,
  ]);
}
