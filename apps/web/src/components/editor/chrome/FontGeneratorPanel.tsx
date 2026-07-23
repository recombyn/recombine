import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { HiOutlineArrowDownTray, HiOutlineBolt, HiOutlineXMark } from 'react-icons/hi2';
import { LuDice5 } from 'react-icons/lu';
import { message } from '@/components/base';
import {
  FONT_GENERATE_CREDITS,
  fetchFontStyleSamples,
  fetchMyGeneratedFonts,
  generateFont,
  waitForFontTask,
  type FontTaskDto,
  type GeneratedFontAsset,
} from '@/apis/fonts';
import { uploadImageFile } from '@/apis/upload';
import { setActiveTool, setPendingImageSrc } from '@/store/modules/editor';
import { cn } from '@/utils/classnames';
import { getToken } from '@/utils/token';

type TabId = 'generate' | 'mine';

const REF_PLACEHOLDERS = ['a', 'G', '&'];

async function downloadTtf(url: string, filename: string) {
  const raw = String(url || '').trim();
  if (!raw) return;
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(raw, { headers });
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename.endsWith('.ttf') ? filename : `${filename}.ttf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function FontGeneratorPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const refInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>('generate');
  const [description, setDescription] = useState('');
  const [samples, setSamples] = useState<string[]>([]);
  const [sampleIdx, setSampleIdx] = useState(-1);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [myFonts, setMyFonts] = useState<GeneratedFontAsset[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchFontStyleSamples()
      .then((res) => setSamples(res.items || []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'mine') return;
    setLoadingMine(true);
    fetchMyGeneratedFonts()
      .then((res) => setMyFonts(res.items || []))
      .catch((err: any) => {
        const detail = err?.response?.data?.detail || err?.message || '加载字体失败';
        message.error(typeof detail === 'string' ? detail : '加载字体失败');
      })
      .finally(() => setLoadingMine(false));
  }, [open, tab]);

  useEffect(() => {
    if (open) return;
    setTab('generate');
    setDescription('');
    setSampleIdx(-1);
    setRefPreview(null);
    setRefFile(null);
    setGenerating(false);
    setProgress(0);
    setStatusLabel('');
  }, [open]);

  const placeOnCanvas = (url: string) => {
    dispatch(setPendingImageSrc(url));
    dispatch(setActiveTool('image'));
    onClose();
  };

  const onPickRef = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefFile(file);
    setRefPreview(URL.createObjectURL(file));
  };

  const clearRef = () => {
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefPreview(null);
    setRefFile(null);
  };

  const cycleStyle = () => {
    if (!samples.length) return;
    const next = (sampleIdx + 1) % samples.length;
    setSampleIdx(next);
    setDescription(samples[next] || '');
  };

  const statusText = (task: FontTaskDto) => {
    const map: Record<string, string> = {
      queued: '排队中',
      preprocessing: '预处理风格图',
      inferring: 'AI 生成字形',
      vectorizing: '矢量化',
      calibrating: '校准度量',
      compiling: '编译 TTF',
      done: '完成',
      failed: '失败',
    };
    return map[task.status] || task.status;
  };

  const handleGenerate = async () => {
    if (generating) return;
    const trimmed = description.trim();
    if (!trimmed && !refFile) {
      message.warning('请填写风格描述或上传参考图');
      return;
    }
    setGenerating(true);
    setProgress(0);
    setStatusLabel('上传中');
    try {
      let referenceImage: string | null = null;
      if (refFile) {
        const uploaded = await uploadImageFile(refFile);
        referenceImage = uploaded.url;
      }
      const res = await generateFont({
        description: trimmed || undefined,
        reference_image: referenceImage,
      });
      const taskId = res.taskId || res.task?.id;
      if (!taskId) throw new Error('未返回任务 ID');

      setStatusLabel('排队中');
      const task = await waitForFontTask(taskId, {
        onProgress: (t) => {
          setProgress(t.progress || 0);
          setStatusLabel(statusText(t));
        },
      });

      if (task.status === 'failed') {
        message.error(task.error || '字体生成失败');
        return;
      }

      message.success(task.familyName ? `已生成 ${task.familyName}` : '字体生成成功');
      if (task.ttfUrl) {
        try {
          await downloadTtf(task.ttfUrl, `${task.familyName || 'font'}.ttf`);
        } catch {
          /* preview still available */
        }
      }
      if (task.previewUrl) placeOnCanvas(task.previewUrl);
      else if (task.ttfUrl) onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || '字体生成失败';
      message.error(typeof detail === 'string' ? detail : '字体生成失败');
    } finally {
      setGenerating(false);
      setProgress(0);
      setStatusLabel('');
    }
  };

  const onMineClick = async (font: GeneratedFontAsset) => {
    const ttf = font.meta?.ttfUrl;
    if (ttf) {
      try {
        await downloadTtf(ttf, `${font.meta?.familyName || font.prompt || 'font'}.ttf`);
        message.success('TTF 已下载');
      } catch {
        message.error('TTF 下载失败');
      }
    }
    placeOnCanvas(font.url);
  };

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-[calc(100%+12px)] left-1/2 z-50 w-[320px] -translate-x-1/2"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation?.();
      }}
    >
      <div className="overflow-hidden rounded-lg bg-[var(--surface)] shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-[var(--line)]">
        <div className="flex items-center gap-2 px-3.5 pb-1 pt-3">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--ink)]">
            字体生成器
          </h3>
          <span className="shrink-0 rounded bg-[#2563eb]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563eb]">
            Beta
          </span>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-3.5 mb-2.5 flex rounded bg-[var(--accent-soft)] p-0.5">
          {(
            [
              ['generate', '生成'],
              ['mine', '我的字体'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'h-7 flex-1 rounded text-[12px] font-medium transition-colors',
                tab === key
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              )}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'generate' ? (
          <div className="px-3.5 pb-3.5">
            <button
              type="button"
              onClick={() => refInputRef.current?.click()}
              className="relative mb-2.5 flex h-[72px] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-[var(--line)] bg-[var(--accent-soft)]/40 transition-colors hover:border-[var(--muted)] hover:bg-[var(--accent-soft)]"
            >
              {refPreview ? (
                <>
                  <img src={refPreview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="移除参考图"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRef();
                    }}
                    className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  >
                    <HiOutlineXMark className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3 text-[22px] font-serif text-[var(--muted)]">
                  {REF_PLACEHOLDERS.map((ch) => (
                    <span key={ch}>{ch}</span>
                  ))}
                </div>
              )}
            </button>

            <div className="relative mb-2.5">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="描述字体风格，或上传风格参考图"
                className="w-full resize-none rounded-lg border border-[var(--line)] px-2.5 py-2 pr-9 text-[12px]"
              />
              <button
                type="button"
                aria-label="随机风格"
                title="随机风格"
                onClick={cycleStyle}
                disabled={!samples.length}
                className="absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] disabled:opacity-40"
              >
                <LuDice5 className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate()}
              className="mb-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--ink)] text-[12px] font-medium text-[var(--on-brand)] hover:opacity-90 disabled:opacity-60"
            >
              {generating ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              <span>{generating ? statusLabel || '生成中' : '生成 TTF'}</span>
              <span className="inline-flex items-center gap-0.5 text-white/55">
                <HiOutlineBolt className="h-3.5 w-3.5" aria-hidden />
                <span className="tabular-nums">{FONT_GENERATE_CREDITS}</span>
              </span>
            </button>

            {generating ? (
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--accent-soft)]">
                <div
                  className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-300"
                  style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
                />
              </div>
            ) : null}

            <p className="text-center text-[10px] leading-relaxed text-[var(--muted)]">
              上传风格图 → AI 造字 → 矢量化 → 编译可安装 TTF（当前仅西文）
            </p>
          </div>
        ) : (
          <div className="max-h-[280px] overflow-y-auto px-3.5 pb-3.5">
            {loadingMine ? (
              <div className="flex h-24 items-center justify-center">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--ink)]" />
              </div>
            ) : myFonts.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-[var(--muted)]">暂无生成的字体</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {myFonts.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => void onMineClick(font)}
                    className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-[var(--line)] hover:shadow-md"
                    title={font.meta?.familyName || font.prompt || undefined}
                  >
                    <img
                      src={font.url}
                      alt=""
                      className="h-full w-full bg-white object-contain p-1"
                      loading="lazy"
                    />
                    {font.meta?.ttfUrl ? (
                      <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                        <HiOutlineArrowDownTray className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <input
          ref={refInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickRef}
        />
      </div>
    </div>
  );
}
