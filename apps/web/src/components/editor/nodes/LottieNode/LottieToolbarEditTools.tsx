/**
 * Selection toolbar for Lottie plates — play/loop/speed, replace JSON, download.
 */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import { LuFileJson2 } from 'react-icons/lu';
import { Dropdown, message } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown';
import Tooltip from '@/components/base/tooltip';
import { ExportSelectionPopover } from '@/components/editor/panels/ExportSelectionPanel';
import { imageToolBtn, ImageToolSep } from '@/components/editor/nodes/ImageNode/imageToolbarShared';
import {
  parseLottieAnimationData,
  serializeLottieAnimationData,
} from '@/components/rcb/scene/document/sceneDocument';
import { getLottieHost } from '@/components/editor/nodes/LottieNode/LottieNodeOverlay';
import { openImageToolPanel, patchDocumentNode } from '@/store/modules/editor';
import { cn } from '@/utils/classnames';

const TOOL_ICON_SLOT =
  'pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full';

function ToolIconSlot({ children }: { children: ReactNode }) {
  return <span className={TOOL_ICON_SLOT}>{children}</span>;
}

function Tool({
  label,
  onClick,
  children,
  active,
  tip,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  tip?: string;
}) {
  const btn = (
    <button
      type="button"
      className={cn(imageToolBtn, active && 'bg-[var(--accent-soft)]')}
      onClick={onClick}
    >
      <ToolIconSlot>{children}</ToolIconSlot>
      <span>{label}</span>
    </button>
  );
  if (!tip) return btn;
  return (
    <Tooltip tip={tip} placement="top">
      {btn}
    </Tooltip>
  );
}

function downloadLottieJson(animationData: unknown, name: string) {
  const raw = serializeLottieAnimationData(animationData);
  if (!raw) throw new Error('invalid lottie');
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = String(name || 'lottie')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || 'lottie';
  a.href = url;
  a.download = base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LottieToolbarEditTools({
  nodeId,
  animationData,
  name,
  loop,
  speed,
}: {
  nodeId: string;
  animationData: unknown;
  name: string;
  loop: boolean;
  speed: number;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const sync = () => {
      const host = getLottieHost(nodeId);
      setPaused(Boolean(host?.isPaused()));
    };
    sync();
    const id = window.setInterval(sync, 400);
    return () => window.clearInterval(id);
  }, [nodeId]);

  const speedItems: MenuItemType[] = [
    { key: '0.5', label: '0.5×' },
    { key: '1', label: '1×' },
    { key: '1.5', label: '1.5×' },
    { key: '2', label: '2×' },
  ];

  const onTogglePlay = () => {
    const host = getLottieHost(nodeId);
    if (!host) return;
    if (host.isPaused()) {
      host.play();
      setPaused(false);
    } else {
      host.pause();
      setPaused(true);
    }
  };

  const onToggleLoop = () => {
    const next = !loop;
    dispatch(patchDocumentNode({ nodeId, patch: { attrs: { lottieLoop: next ? 'true' : 'false' } } }));
    getLottieHost(nodeId)?.setLoop(next);
  };

  const onSpeed = (key: string) => {
    const next = Number(key) || 1;
    dispatch(patchDocumentNode({ nodeId, patch: { attrs: { lottieSpeed: next } } }));
    getLottieHost(nodeId)?.setSpeed(next);
  };

  const onReplaceFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseLottieAnimationData(text);
      if (!parsed) throw new Error('invalid');
      const json = serializeLottieAnimationData(parsed);
      if (!json) throw new Error('invalid');
      const w = Math.max(1, Math.round(Number(parsed.w) || 0));
      const h = Math.max(1, Math.round(Number(parsed.h) || 0));
      dispatch(
        patchDocumentNode({
          nodeId,
          patch: {
            ...(w > 0 && h > 0 ? { width: w, height: h } : {}),
            attrs: {
              animationData: json,
              ...(file.name ? { name: file.name.replace(/\.json$/i, '') } : {}),
            },
          },
        })
      );
      message.success(t('editor.lottieToolbar.replaced', { defaultValue: '已替换 Lottie' }));
    } catch {
      message.error(t('editor.lottieToolbar.replaceFail', { defaultValue: '无效的 Lottie JSON' }));
    }
  };

  const onDownload = () => {
    try {
      downloadLottieJson(animationData, name);
    } catch {
      message.error(t('editor.exportFailed'));
    }
  };

  const speedLabel = `${Number.isFinite(speed) && speed > 0 ? speed : 1}×`;

  return (
    <>
      <Tool
        label={t('editor.lottieToolbar.adjust', { defaultValue: '调整' })}
        tip={t('editor.lottieToolbar.adjustTip', { defaultValue: '循环 / 速度 / 替换 JSON' })}
        onClick={() => dispatch(openImageToolPanel({ nodeId, kind: 'lottieEdit' }))}
      >
        <HiOutlineSparkles className="h-4 w-4" strokeWidth={2} />
      </Tool>
      <ImageToolSep />
      <Tool
        label={
          paused
            ? t('editor.lottieToolbar.play', { defaultValue: '播放' })
            : t('editor.lottieToolbar.pause', { defaultValue: '暂停' })
        }
        onClick={onTogglePlay}
      >
        {paused ? (
          <HiOutlinePlay className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <HiOutlinePause className="h-4 w-4" strokeWidth={1.75} />
        )}
      </Tool>
      <Tool
        label={t('editor.lottieToolbar.loop', { defaultValue: '循环' })}
        active={loop}
        onClick={onToggleLoop}
      >
        <HiOutlineArrowPath className="h-4 w-4" strokeWidth={1.75} />
      </Tool>
      <Dropdown
        trigger="click"
        placement="top"
        strategy="fixed"
        items={speedItems}
        onClick={(key) => onSpeed(String(key))}
        floatingClassName="z-[520]"
        referenceClassName="inline-flex"
      >
        <button type="button" className={imageToolBtn}>
          <span className="tabular-nums">{speedLabel}</span>
        </button>
      </Dropdown>
      <ImageToolSep />
      <Tool
        label={t('editor.lottieToolbar.replace', { defaultValue: '替换' })}
        tip={t('editor.lottieToolbar.replaceTip', { defaultValue: '上传 .json 替换动画' })}
        onClick={() => fileRef.current?.click()}
      >
        <LuFileJson2 className="h-4 w-4" strokeWidth={1.75} />
      </Tool>
      <Tool
        label={t('editor.lottieToolbar.download', { defaultValue: '下载' })}
        onClick={onDownload}
      >
        <HiOutlineArrowDownTray className="h-4 w-4" strokeWidth={1.75} />
      </Tool>
      <ExportSelectionPopover nodeIds={[nodeId]} triggerClassName={imageToolBtn} />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          e.target.value = '';
          void onReplaceFile(file);
        }}
      />
    </>
  );
}

export default memo(LottieToolbarEditTools);
