import { useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiHeart, HiOutlineEye, HiOutlineShare, HiOutlineXMark } from 'react-icons/hi2';
import type { OfficialCaseMeta } from '@/utils/officialCases';
import {
  caseAuthorId,
  caseAuthorLabel,
  normalizeCaseCategory,
  resolveCasePrompt,
  resolveCaseTitle,
} from '@/utils/officialCases';
import AuthorFollowAvatar from '@/components/home/AuthorFollowAvatar';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import { formatStatCount } from '@/utils/likedCases';
import {
  extractFrameDocument,
  listArtboardFrames,
  type PlazaCoverFrame,
} from '@/utils/plazaCover';
import { cn } from '@/utils/classnames';

type Props = {
  open: boolean;
  caseMeta: OfficialCaseMeta | null;
  /** Full project document — left rail shows its artboards. */
  projectDocument: unknown | null;
  likedIds: Set<string>;
  likeBusy?: boolean;
  remixing?: boolean;
  onClose: () => void;
  onRemix: (meta: OfficialCaseMeta) => void;
  onToggleLike: (meta: OfficialCaseMeta) => void;
};

/**
 * Plaza case preview:
 * left+center: project title + artboard rail + selected artboard content;
 * right: author / prompt card.
 */
export default function InspirationCasePreview({
  open,
  caseMeta,
  projectDocument,
  likedIds,
  likeBusy,
  remixing,
  onClose,
  onRemix,
  onToggleLike,
}: Props): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entered, setEntered] = useState(false);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, caseMeta?.id]);

  const frames = useMemo(() => listArtboardFrames(projectDocument), [projectDocument]);

  useEffect(() => {
    if (!open) {
      setActiveFrameId(null);
      return;
    }
    if (!frames.length) {
      setActiveFrameId(null);
      return;
    }
    setActiveFrameId((prev) => {
      if (prev && frames.some((f) => f.id === prev)) return prev;
      const active = String(
        (projectDocument as { activeFrameId?: unknown })?.activeFrameId || ''
      ).trim();
      if (active && frames.some((f) => f.id === active)) return active;
      return frames[0]?.id || null;
    });
  }, [open, caseMeta?.id, frames, projectDocument]);

  const activeFrame: PlazaCoverFrame | null = useMemo(() => {
    if (!frames.length) return null;
    return frames.find((f) => f.id === activeFrameId) || frames[0] || null;
  }, [frames, activeFrameId]);

  const frameDocs = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const frame of frames) {
      const id = frame.id || '';
      if (!id) continue;
      const extracted = extractFrameDocument(projectDocument, frame);
      if (extracted) map[id] = extracted;
    }
    return map;
  }, [projectDocument, frames]);

  const previewDoc = useMemo(() => {
    if (activeFrame?.id && frameDocs[activeFrame.id]) return frameDocs[activeFrame.id];
    // No artboards: fall back to full document / nodes.
    return projectDocument;
  }, [activeFrame, frameDocs, projectDocument]);

  const goFrame = (delta: number) => {
    if (!frames.length) return;
    const idx = Math.max(
      0,
      frames.findIndex((f) => f.id === (activeFrame?.id || activeFrameId))
    );
    const next = frames[(idx + delta + frames.length) % frames.length];
    if (next?.id) setActiveFrameId(next.id);
  };

  const wheelLockRef = useRef(0);
  const onPreviewWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (frames.length < 2) return;
    // Prefer vertical wheel; fall back to horizontal trackpad.
    const dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (!dy) return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - wheelLockRef.current < 280) return;
    wheelLockRef.current = now;
    goFrame(dy > 0 ? 1 : -1);
  };

  useEffect(() => {
    if (!open || !activeFrameId) return;
    const el = window.document.querySelector(
      `[data-preview-frame-thumb="${CSS.escape(activeFrameId)}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, activeFrameId]);

  useEffect(() => {
    if (!open || !caseMeta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goFrame(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goFrame(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, caseMeta, activeFrameId, frames, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    return () => {
      window.document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !caseMeta) return null;

  const title = resolveCaseTitle(caseMeta, t);
  const author = caseAuthorLabel(caseMeta, t);
  const authorId = caseAuthorId(caseMeta);
  const liked = likedIds.has(caseMeta.id);
  const likes = Math.max(0, Number(caseMeta.likeCount) || 0);
  const uses = Math.max(0, Number(caseMeta.useCount) || 0);
  const canSwitch = frames.length > 1;
  const prompt = resolveCasePrompt(caseMeta, t);
  const categoryLabel = t(`home.cases.cat.${normalizeCaseCategory(caseMeta.category)}`);
  const hasDoc = Boolean(previewDoc);

  const openProfile = () => {
    onClose();
    navigate(`/u/${encodeURIComponent(authorId)}`, {
      state: {
        authorName: author,
        authorAvatar: caseMeta.authorAvatar || null,
      },
    });
  };

  const onShare = async () => {
    const text = `${title} — ${author}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
    } catch {
      /* user cancelled / denied */
    }
  };

  const frameLabel = (frame: PlazaCoverFrame, i: number) =>
    String(frame.name || '').trim() || `${t('editor.pageExportName')}-${i + 1}`;

  return (
    <FloatingPortal>
      <div
        className={cn(
          'fixed inset-0 z-[850] transition-[background-color] duration-300',
          entered ? 'bg-[rgba(12,12,13,0.8)]' : 'bg-transparent'
        )}
        role="presentation"
        onClick={onClose}
      >
        <button
          type="button"
          aria-label={t('home.cases.previewClose')}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-4 top-2.5 z-[860] inline-flex h-8 w-8 items-center justify-center text-white transition hover:opacity-80"
        >
          <HiOutlineXMark className="h-5 w-5" strokeWidth={2} />
        </button>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            'fixed bottom-0 left-0 right-0 z-[855] flex gap-3 overflow-hidden p-[15px]',
            'top-[50px] rounded-t-[14px] bg-[#F6F6F6]',
            'transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform',
            entered ? 'translate-y-0' : '-translate-y-10'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#F6F6F6]">
            <div className="mb-3 flex shrink-0 items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight text-[var(--ink)]">
                {title}
              </h2>
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                <button
                  type="button"
                  disabled={remixing || !hasDoc}
                  onClick={() => onRemix(caseMeta)}
                  className="inline-flex h-8 items-center justify-center rounded-full bg-[var(--ink)] px-3.5 text-[13px] font-medium text-[var(--on-brand)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {remixing ? t('home.cases.remixing') : t('home.cases.makeSame')}
                </button>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1" onWheel={onPreviewWheel}>
              {canSwitch ? (
                <div className="hidden w-[100px] shrink-0 flex-col gap-2.5 overflow-y-auto py-px md:flex">
                  {frames.map((frame, i) => {
                    const id = frame.id || `frame-${i}`;
                    const active = id === (activeFrame?.id || activeFrameId);
                    const thumb = frameDocs[id];
                    const label = frameLabel(frame, i);
                    return (
                      <button
                        key={id}
                        type="button"
                        data-preview-frame-thumb={id}
                        aria-label={label}
                        aria-current={active ? 'true' : undefined}
                        title={label}
                        onClick={() => setActiveFrameId(id)}
                        className={cn(
                          'relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded border bg-[#ececec] transition',
                          active
                            ? 'border-[var(--ink)]'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        )}
                      >
                        {thumb ? (
                          <TemplateThumbnail document={thumb} fit="cover" />
                        ) : (
                          <div className="skeleton-bone h-full w-full" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center px-3">
                {previewDoc ? (
                  <div className="relative h-full w-full max-h-full overflow-hidden rounded-2xl">
                    <TemplateThumbnail document={previewDoc} fit="contain" />
                  </div>
                ) : (
                  <div
                    className="skeleton-bone h-full w-full max-w-5xl rounded-2xl"
                    aria-busy="true"
                  />
                )}
              </div>
            </div>
          </div>

          <aside className="hidden w-[min(400px,36vw)] shrink-0 flex-col bg-[#F6F6F6] md:flex">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white">
              <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                <AuthorFollowAvatar
                  name={author}
                  avatar={caseMeta.authorAvatar}
                  size={36}
                  onOpenProfile={openProfile}
                />
                <button
                  type="button"
                  onClick={openProfile}
                  className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold text-[var(--ink)] hover:underline"
                >
                  {author}
                </button>
                <div className="flex shrink-0 items-center gap-3.5 text-[12px] tabular-nums text-[#8a8a8a]">
                  <span
                    className="inline-flex items-center gap-1"
                    title={t('home.cases.useCount', { count: uses })}
                  >
                    <HiOutlineEye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {formatStatCount(uses)}
                  </span>
                  <button
                    type="button"
                    aria-pressed={liked}
                    disabled={likeBusy}
                    onClick={() => onToggleLike(caseMeta)}
                    className="inline-flex items-center gap-1 transition hover:text-[#5c5c5c] disabled:opacity-50"
                    title={liked ? t('home.cases.unlike') : t('home.cases.like')}
                  >
                    <HiHeart className="h-4 w-4 fill-current" aria-hidden />
                    {formatStatCount(likes)}
                  </button>
                  <button
                    type="button"
                    aria-label={t('home.cases.share')}
                    onClick={() => void onShare()}
                    className="inline-flex items-center transition hover:text-[#5c5c5c]"
                  >
                    <HiOutlineShare className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <div className="rounded-2xl bg-[#F5F5F5] px-4 py-3.5 text-[14px] leading-[1.7] text-[var(--ink)]">
                  {prompt}
                </div>
                <p className="mt-5 text-[12px] font-medium text-[var(--muted)]">{categoryLabel}</p>
                <p className="mt-1 text-[14px] font-medium text-[var(--ink)]">{title}</p>
              </div>
            </div>
          </aside>

          {/* Mobile: prompt + artboard thumbs + CTA */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col bg-white md:hidden">
            <div className="px-4 pt-3">
              <div className="rounded-2xl bg-[#F5F5F5] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--ink)]">
                {prompt}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={openProfile}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <AuthorFollowAvatar name={author} avatar={caseMeta.authorAvatar} size={28} />
                  <span className="truncate text-[13px] font-medium text-[var(--ink)]">{author}</span>
                </button>
                <div className="flex shrink-0 items-center gap-3 text-[12px] tabular-nums text-[#8a8a8a]">
                  <span
                    className="inline-flex items-center gap-1"
                    title={t('home.cases.useCount', { count: uses })}
                  >
                    <HiOutlineEye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {formatStatCount(uses)}
                  </span>
                  <button
                    type="button"
                    aria-pressed={liked}
                    disabled={likeBusy}
                    onClick={() => onToggleLike(caseMeta)}
                    className="inline-flex items-center gap-1 transition disabled:opacity-50"
                    title={liked ? t('home.cases.unlike') : t('home.cases.like')}
                  >
                    <HiHeart className="h-4 w-4 fill-current" aria-hidden />
                    {formatStatCount(likes)}
                  </button>
                  <button
                    type="button"
                    aria-label={t('home.cases.share')}
                    onClick={() => void onShare()}
                    className="inline-flex items-center"
                  >
                    <HiOutlineShare className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </div>
            {canSwitch ? (
              <div className="px-3 pt-3">
                <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {frames.map((frame, i) => {
                    const id = frame.id || `frame-${i}`;
                    const active = id === (activeFrame?.id || activeFrameId);
                    const thumb = frameDocs[id];
                    const label = frameLabel(frame, i);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-label={label}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => setActiveFrameId(id)}
                        className={cn(
                          'relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded border bg-[#ececec]',
                          active ? 'border-[var(--ink)]' : 'border-transparent opacity-70'
                        )}
                      >
                        {thumb ? (
                          <TemplateThumbnail document={thumb} fit="cover" />
                        ) : (
                          <div className="skeleton-bone h-full w-full" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="px-4 py-3">
              <button
                type="button"
                disabled={remixing || !hasDoc}
                onClick={() => onRemix(caseMeta)}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-[14px] font-semibold text-[var(--on-brand)] transition hover:opacity-90 disabled:opacity-50"
              >
                {remixing ? t('home.cases.remixing') : t('home.cases.remix')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
