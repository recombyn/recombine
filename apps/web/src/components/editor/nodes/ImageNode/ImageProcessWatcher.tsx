import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { message } from '@/components/base';
import { processImageTool } from '@/apis/imageTools';
import { failImageProcess, finishImageProcess } from '@/store/modules/editor';

const AI_KINDS = new Set([
  'upscale',
  'removeBg',
  'multiAngle',
  'expand',
  'editElements',
  'editText',
  'vector',
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

/**
 * Completes spawned image process jobs via backend AI (`POST /api/v1/image/process`).
 * Import placeholders are finished by the import flow.
 */
export default function ImageProcessWatcher() {
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
    if (kind === 'import') return undefined;

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
        const res = await processImageTool({
          kind,
          image,
          meta,
          aspect_ratio: aspectFromBox(w, h),
          quality: 'high',
          resolution: resolutionFor(kind, liveNode),
        });
        if (cancelled) return;
        if (!res?.image) {
          fail('图片处理未返回结果');
          return;
        }
        dispatch(finishImageProcess({ nodeId: pendingId, src: res.image }));
        const labels: Record<string, string> = {
          removeBg: '去背景完成',
          upscale: '高清放大完成',
          multiAngle: '多角度生成完成',
          expand: '扩展完成',
          editElements: '编辑元素完成',
          editText: '编辑文字完成',
          vector: '矢量化完成',
          adjust: '调整完成',
        };
        message.success(labels[kind] || '处理完成');
      } catch (err: any) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail || err?.message || '图片处理失败';
        fail(typeof detail === 'string' ? detail : '图片处理失败');
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
