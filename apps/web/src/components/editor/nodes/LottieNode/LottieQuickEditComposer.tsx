/**
 * Floating adjust panel under a selected Lottie (toolbar → 调整).
 * FE-only: loop/speed/replace JSON; Agent generation comes later via backend seed.
 */
import { memo, useRef, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import { message } from '@/components/base';
import {
  RcbOverlayPortal,
  rcbScreenPxToScene,
  useRcbCamera,
  useRcbScreenToolbarStyle,
} from '@/components/rcb';
import { SELECTION_TOOLBAR_BELOW_BOX_GAP_PX } from '@/components/rcb/selection/chrome/SelectionToolbarShell';
import {
  parseLottieAnimationData,
  serializeLottieAnimationData,
} from '@/components/rcb/scene/document/sceneDocument';
import { getLottieHost } from '@/components/editor/nodes/LottieNode/LottieNodeOverlay';
import { closeImageToolPanel, patchDocumentNode } from '@/store/modules/editor';
import { cn } from '@/utils/classnames';

type SceneBox = { left: number; top: number; width: number; height: number };

function LottieQuickEditComposer({
  document,
  nodeId,
  box,
}: {
  document: any;
  nodeId: string;
  box: SceneBox;
}): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const camera = useRcbCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  const node = document?.deltaSetLike?.[nodeId];
  const loopRaw = node?.attrs?.lottieLoop;
  const loop = !(loopRaw === false || loopRaw === 'false' || loopRaw === 0 || loopRaw === '0');
  const speed = Math.max(0.25, Number(node?.attrs?.lottieSpeed) || 1);
  const [paste, setPaste] = useState('');

  const style = useRcbScreenToolbarStyle({
    left: box.left + box.width / 2,
    top: box.top + box.height + rcbScreenPxToScene(SELECTION_TOOLBAR_BELOW_BOX_GAP_PX + 8, zoom),
    anchor: 'top',
  });

  const close = () => dispatch(closeImageToolPanel());

  const setLoop = (next: boolean) => {
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: { attrs: { lottieLoop: next ? 'true' : 'false' } },
      })
    );
    getLottieHost(nodeId)?.setLoop(next);
  };

  const setSpeed = (next: number) => {
    const v = Math.max(0.25, Math.min(4, next));
    dispatch(patchDocumentNode({ nodeId, patch: { attrs: { lottieSpeed: v } } }));
    getLottieHost(nodeId)?.setSpeed(v);
  };

  const applyJson = (raw: string) => {
    const parsed = parseLottieAnimationData(raw);
    const json = serializeLottieAnimationData(parsed);
    if (!parsed || !json) {
      message.error(t('editor.lottieToolbar.replaceFail', { defaultValue: '无效的 Lottie JSON' }));
      return;
    }
    const w = Math.max(1, Math.round(Number(parsed.w) || 0));
    const h = Math.max(1, Math.round(Number(parsed.h) || 0));
    dispatch(
      patchDocumentNode({
        nodeId,
        patch: {
          ...(w > 0 && h > 0 ? { width: w, height: h } : {}),
          attrs: { animationData: json },
        },
      })
    );
    message.success(t('editor.lottieToolbar.replaced', { defaultValue: '已替换 Lottie' }));
    setPaste('');
  };

  if (!node) return null;

  return (
    <RcbOverlayPortal>
      <div
        data-lottie-edit-composer
        className="pointer-events-auto absolute z-[1000002] w-[min(360px,70vw)]"
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-2xl bg-[var(--surface)] shadow-lg ring-1 ring-[var(--line)]">
          <header className="flex h-10 items-center justify-between gap-2 border-b border-[var(--line)] px-3">
            <h3 className="text-[13px] font-medium text-[var(--ink)]">
              {t('editor.lottieToolbar.adjust', { defaultValue: '调整 Lottie' })}
            </h3>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--accent-soft)]"
              aria-label={t('common.close', { defaultValue: '关闭' })}
              onClick={close}
            >
              <HiOutlineXMark className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-3 p-3">
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              {t('editor.lottieToolbar.adjustHint', {
                defaultValue:
                  '可改循环与速度，或粘贴 / 上传 JSON。裁剪与删帧需时间轴（后续）；生成动画请用 Agent（后端接入后）。',
              })}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(
                  'h-7 rounded-lg px-2.5 text-[12px]',
                  loop
                    ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                    : 'bg-[var(--accent-soft)] text-[var(--ink)]'
                )}
                onClick={() => setLoop(!loop)}
              >
                {t('editor.lottieToolbar.loop', { defaultValue: '循环' })}
              </button>
              {[0.5, 1, 1.5, 2].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    'h-7 rounded-lg px-2.5 text-[12px] tabular-nums',
                    Math.abs(speed - v) < 0.01
                      ? 'bg-[var(--ink)] text-[var(--on-brand)]'
                      : 'bg-[var(--accent-soft)] text-[var(--ink)]'
                  )}
                  onClick={() => setSpeed(v)}
                >
                  {v}×
                </button>
              ))}
            </div>

            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={t('editor.lottieToolbar.pastePlaceholder', {
                defaultValue: '粘贴 Lottie JSON…',
              })}
              rows={5}
              className="w-full resize-y rounded-xl bg-[var(--canvas)] p-2.5 font-mono text-[11px] text-[var(--ink)] outline-none ring-1 ring-[var(--line)]"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 flex-1 rounded-xl bg-[var(--ink)] text-[12px] font-medium text-[var(--on-brand)] disabled:opacity-40"
                disabled={!paste.trim()}
                onClick={() => applyJson(paste)}
              >
                {t('editor.lottieToolbar.applyJson', { defaultValue: '应用 JSON' })}
              </button>
              <button
                type="button"
                className="h-8 rounded-xl bg-[var(--accent-soft)] px-3 text-[12px] text-[var(--ink)]"
                onClick={() => fileRef.current?.click()}
              >
                {t('editor.lottieToolbar.uploadJson', { defaultValue: '上传' })}
              </button>
            </div>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              applyJson(await file.text());
            } catch {
              message.error(
                t('editor.lottieToolbar.replaceFail', { defaultValue: '无效的 Lottie JSON' })
              );
            }
          }}
        />
      </div>
    </RcbOverlayPortal>
  );
}

export default memo(LottieQuickEditComposer);
