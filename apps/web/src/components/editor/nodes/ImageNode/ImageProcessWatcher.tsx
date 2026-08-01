import { useEffect, useRef, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { message } from '@/components/base';
import { processImageTool } from '@/apis/imageTools';
import { uploadImageFromSrc } from '@/utils/uploadImage';
import { fetchWallet } from '@/apis/wallet';
import { failImageProcess, finishImageProcess } from '@/store/modules/editor';
import { syncFromServer } from '@/store/modules/wallet';

const AI_KINDS = new Set([
  'upscale',
  'removeBg',
  'multiAngle',
  'expand',
  'editText',
  'adjust',
]);

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function aspectFromBox(w: number, h: number): string {
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(rw, rh) || 1;
  return `${Math.round(rw / d)}:${Math.round(rh / d)}`;
}

function resolutionFor(kind: string, node: any): string | undefined {
  if (kind === 'upscale') {
    const tw = Number(node?.attrs?.processTargetWidth) || 0;
    if (tw >= 3500) return '4K';
    if (tw >= 1800) return '2K';
    return '2K';
  }
  return undefined;
}

/** Persist tool output on our file server; fall back to original src if upload fails. */
async function persistProcessedSrc(src: string, filename: string): Promise<string> {
  const raw = String(src || '').trim();
  if (!raw) return raw;
  try {
    const uploaded = await uploadImageFromSrc(raw, filename);
    return uploaded.url || raw;
  } catch (err) {
    console.warn('[image-process] upload failed, keeping inline/remote src', err);
    return raw;
  }
}

function refreshWallet(dispatch: (action: unknown) => void) {
  void fetchWallet()
    .then((res) => {
      dispatch(syncFromServer({ tokens: res.tokens }));
    })
    .catch(() => {
      /* ignore wallet refresh errors */
    });
}

function processFailMessage(err: any): string {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail || err?.message;
  if (status === 402 || detail === 'Insufficient credits' || detail === 'Insufficient tokens')
    return 'Token 不足，请充值后再试';
  if (status === 401) return '请先登录后再使用 AI 工具';
  const msg = typeof detail === 'string' ? detail : '';
  if (/timeout/i.test(msg) || err?.code === 'ECONNABORTED')
    return '图片分层超时，请稍后重试（大图首次加载模型会更慢）';
  if (msg.trim()) return msg;
  return '图片处理失败';
}

/**
 * Completes spawned image process jobs via backend AI (`POST /api/v1/image/process`).
 * Results are uploaded to our file server so the canvas / export use our URLs.
 * Import / upload placeholders are finished by their own flows.
 */
function ImageProcessWatcher() {
  const dispatch = useDispatch();
  const pendingId = useSelector((s: any) => s.editor.pendingImageProcessId as string | null);
  const document = useSelector((s: any) => s.editor.document);
  const documentRef = useRef(document);
  documentRef.current = document;

  useEffect(() => {
    if (!pendingId) return undefined;
    const doc = documentRef.current;
    const node = doc?.deltaSetLike?.[pendingId];
    const kind = String(node?.attrs?.processKind || '');
    if (kind === 'import' || kind === 'upload') return undefined;

    let cancelled = false;

    const fail = (msg: string) => {
      if (cancelled) return;
      message.error(msg);
      dispatch(failImageProcess({ nodeId: pendingId }));
    };

    const run = async () => {
      if (!AI_KINDS.has(kind)) {
        // Local-only kinds (eraser etc.) should not land here.
        await new Promise((r) => window.setTimeout(r, 400));
        if (!cancelled) dispatch(finishImageProcess({ nodeId: pendingId }));
        return;
      }

      const latest = documentRef.current;
      const liveNode = latest?.deltaSetLike?.[pendingId] || node;
      const sourceId = String(liveNode?.attrs?.processSourceId || '');
      const sourceNode = sourceId ? latest?.deltaSetLike?.[sourceId] : null;
      const image = String(sourceNode?.attrs?.src || liveNode?.attrs?.src || '');
      if (!image) {
        fail('未找到图片');
        return;
      }

      const w = Number(liveNode?.width) || Number(sourceNode?.width) || 1024;
      const h = Number(liveNode?.height) || Number(sourceNode?.height) || 1024;
      const meta = parseMeta(liveNode?.attrs?.processMeta);

      try {
        const processBody: {
          kind: string;
          image: string;
          meta?: Record<string, unknown>;
          aspect_ratio?: string;
          quality?: string;
          resolution?: string;
        } = {
          kind,
          image,
          quality: 'high',
        };
        if (meta) processBody.meta = meta;
        const aspect = aspectFromBox(w, h);
        if (aspect) processBody.aspect_ratio = aspect;
        const resolution = resolutionFor(kind, liveNode);
        if (resolution) processBody.resolution = resolution;
        const res = await processImageTool(processBody);
        if (cancelled) return;

        const layers = Array.isArray(res?.layers) ? res.layers : [];
        if (layers.length > 0 && kind === 'editText') {
          const persisted = await Promise.all(
            layers.map(async (layer: any, i: number) => {
              const src = String(layer?.src || '').trim();
              if (!src || String(layer?.type) === 'text') return layer;
              const url = await persistProcessedSrc(src, `${kind}-layer-${i + 1}.png`);
              return { ...layer, src: url };
            })
          );
          if (cancelled) return;
          dispatch(
            finishImageProcess({
              nodeId: pendingId,
              layers: persisted,
              sourceWidth: Number(res.width) || undefined,
              sourceHeight: Number(res.height) || undefined,
            })
          );
          const warn = Array.isArray(res.warnings) ? res.warnings.filter(Boolean) : [];
          if (warn.length) message.warning(warn[0]);
          else message.success('文字识别完成');
          refreshWallet(dispatch);
          return;
        }

        if (!res?.image) {
          fail('图片处理未返回结果');
          return;
        }
        const storedUrl = await persistProcessedSrc(res.image, `${kind}.png`);
        if (cancelled) return;
        dispatch(
          finishImageProcess({
            nodeId: pendingId,
            src: storedUrl,
            ...(kind === 'removeBg'
              ? { attrs: { cutout: 'true', name: '抠图' } }
              : {}),
          })
        );
        const labels: Record<string, string> = {
          removeBg: '抠图完成（透明 PNG）',
          upscale: '高清放大完成',
          multiAngle: '多角度生成完成',
          expand: '扩展完成',
          editText: '编辑文字完成',
          vector: '矢量化完成',
          adjust: '调整完成',
        };
        message.success(labels[kind] || '处理完成');
        refreshWallet(dispatch);
      } catch (err: any) {
        if (cancelled) return;
        fail(processFailMessage(err));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Only re-run when a new job id is pending — not on every document edit.
  }, [pendingId, dispatch]);

  return null;
}

export default memo(ImageProcessWatcher);
