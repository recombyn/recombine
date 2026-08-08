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
  dataTransferHasMediaAsset,
  readChatImageDragUrl,
  readMediaAssetDragPayload,
  type MediaAssetDragPayload,
} from '@/utils/chatImageDrag';
import { message } from '@/components/base';
import store from '@/store';
import {
  failImageProcess,
  finishImageProcess,
  placeMediaAsset,
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

function resolveAssetPlaceSize(
  payload: MediaAssetDragPayload,
  imageSizeForViewport: (natural: { width: number; height: number }) => {
    width: number;
    height: number;
  }
): Promise<{ width: number; height: number }> {
  const kind = payload.kind;
  if (kind === 'audio') {
    const width = Math.max(1, Math.round(Number(payload.width) || 360));
    const height = Math.max(1, Math.round(Number(payload.height) || 200));
    return Promise.resolve({ width, height });
  }
  const ow = Math.max(0, Math.round(Number(payload.width) || 0));
  const oh = Math.max(0, Math.round(Number(payload.height) || 0));
  if (ow > 0 && oh > 0) {
    return Promise.resolve(imageSizeForViewport({ width: ow, height: oh }));
  }
  if (kind === 'video') {
    return Promise.resolve(imageSizeForViewport({ width: 640, height: 360 }));
  }
  return measureImageNaturalSize(payload.src).then((natural) =>
    imageSizeForViewport(natural)
  );
}

/** Drag chat gallery images / Assets dock media onto the canvas. */
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
      if (
        !dataTransferHasMediaAsset(e.dataTransfer) &&
        !dataTransferHasChatImage(e.dataTransfer)
      ) {
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const placeHostedAsset = async (
      payload: MediaAssetDragPayload,
      clientX: number,
      clientY: number
    ) => {
      const { width, height } = await resolveAssetPlaceSize(
        payload,
        imageSizeForViewport
      );
      const world = pointerToWorld(
        camera,
        { viewportEl, stageEl, paperEl, artboard },
        clientX,
        clientY
      );
      const placed = rcbCenterOnPoint(world, { width, height });
      const latest = documentRef.current;
      if (!latest) return;
      const origin = sceneToDocumentCoords(latest, placed.left, placed.top);
      const prompt = String(payload.prompt || '').trim();
      dispatch(
        placeMediaAsset({
          kind: payload.kind,
          src: payload.src,
          uploadKey: payload.uploadKey || undefined,
          width,
          height,
          prompt: prompt || undefined,
          name:
            String(payload.name || '').trim() ||
            prompt.slice(0, 40) ||
            undefined,
          duration: payload.duration,
          x: origin.x,
          y: origin.y,
        })
      );
      finishToSelect();
    };

    const placeChatImage = async (url: string, clientX: number, clientY: number) => {
      const natural = await measureImageNaturalSize(url);
      const { width, height } = imageSizeForViewport(natural);
      const world = pointerToWorld(
        camera,
        { viewportEl, stageEl, paperEl, artboard },
        clientX,
        clientY
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
    };

    const onDrop = async (e: DragEvent) => {
      const asset = readMediaAssetDragPayload(e.dataTransfer);
      if (asset) {
        e.preventDefault();
        e.stopPropagation();
        try {
          await placeHostedAsset(asset, e.clientX, e.clientY);
        } catch (err: any) {
          const detail = err?.response?.data?.detail || err?.message || '放置失败';
          message.error(typeof detail === 'string' ? detail : '放置失败');
        }
        return;
      }

      const url = readChatImageDragUrl(e.dataTransfer);
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        await placeChatImage(url, e.clientX, e.clientY);
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
