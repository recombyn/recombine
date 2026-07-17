import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiChevronLeft,
  HiChevronRight,
  HiHeart,
  HiOutlineDocumentDuplicate,
  HiOutlineXMark,
} from 'react-icons/hi2';
import type { OfficialCaseMeta } from '@/cases/officialCases';
import { caseAuthorId, caseAuthorLabel, resolveCaseTitle } from '@/cases/officialCases';
import AuthorFollowAvatar from '@/components/home/AuthorFollowAvatar';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import {
  isFollowingUser,
  loadFollowedUsers,
  toggleFollowUser,
} from '@/store/followedUsers';
import { formatStatCount, seedStat } from '@/store/likedCases';
import { cn } from '@/utils/classnames';
import { message } from '@/components/base';

type Props = {
  open: boolean;
  caseMeta: OfficialCaseMeta | null;
  cases: OfficialCaseMeta[];
  docs: Record<string, unknown>;
  likedIds: Set<string>;
  remixing?: boolean;
  onClose: () => void;
  onSelect: (meta: OfficialCaseMeta) => void;
  onRemix: (meta: OfficialCaseMeta) => void;
  onToggleLike: (meta: OfficialCaseMeta) => void;
  onFollowChange?: () => void;
};

/**
 * Plaza case preview — full-width modal, side arrows + bottom strip to switch,
 * close button outside on the overlay (ref fig.2).
 */
export default function InspirationCasePreview({
  open,
  caseMeta,
  cases,
  docs,
  likedIds,
  remixing,
  onClose,
  onSelect,
  onRemix,
  onToggleLike,
  onFollowChange,
}: Props): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewerId = useSelector((s: any) => s.auth?.user?.id as string | undefined);
  const [followingIds, setFollowingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setFollowingIds(new Set(loadFollowedUsers(viewerId).map((x) => x.id)));
  }, [open, viewerId, caseMeta?.id]);

  const rail = useMemo(() => cases, [cases]);

  const index = useMemo(() => {
    if (!caseMeta) return -1;
    return rail.findIndex((c) => c.id === caseMeta.id);
  }, [rail, caseMeta]);

  const go = (delta: number) => {
    if (!rail.length || index < 0) return;
    const next = rail[(index + delta + rail.length) % rail.length];
    if (next) onSelect(next);
  };

  useEffect(() => {
    if (!open || !caseMeta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go uses latest index via closure on key
  }, [open, caseMeta, index, rail, onClose, onSelect]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !caseMeta) return null;

  const title = resolveCaseTitle(caseMeta, t);
  const author = caseAuthorLabel(caseMeta, t);
  const authorId = caseAuthorId(caseMeta);
  const isSelf = Boolean(viewerId && viewerId === authorId);
  const following = followingIds.has(authorId) || isFollowingUser(authorId, viewerId);
  const liked = likedIds.has(caseMeta.id);
  const likes = seedStat(caseMeta.id, 40, 900) + (liked ? 1 : 0);
  const uses = seedStat(caseMeta.id, 80, 1200);
  const doc = docs[caseMeta.id];
  const canSwitch = rail.length > 1;

  const openProfile = () => {
    onClose();
    navigate(`/u/${encodeURIComponent(authorId)}`, {
      state: {
        authorName: author,
        authorAvatar: caseMeta.authorAvatar || null,
      },
    });
  };

  const onToggleFollow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!viewerId) {
      message.warning(t('home.cases.followUserNeedLogin'));
      navigate('/login', { state: { from: '/home' } });
      return;
    }
    if (isSelf) return;
    const { following: next, list } = toggleFollowUser(
      {
        id: authorId,
        name: author,
        avatar: caseMeta.authorAvatar || null,
      },
      viewerId
    );
    setFollowingIds(new Set(list.map((x) => x.id)));
    message.success(next ? t('home.cases.followedToast') : t('home.cases.unfollowedToast'));
    onFollowChange?.();
  };

  return (
    <FloatingPortal>
      <div
        className="fixed inset-0 z-[850] bg-[rgba(12,12,13,0.55)] backdrop-blur-[8px]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          aria-label={t('home.cases.previewClose')}
          onClick={onClose}
          className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white transition hover:bg-black/50 sm:right-6 sm:top-5"
        >
          <HiOutlineXMark className="h-5 w-5" strokeWidth={2} />
        </button>

        {canSwitch ? (
          <button
            type="button"
            aria-label={t('home.cases.prev')}
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--ink)] shadow-md transition hover:bg-white sm:left-4 lg:left-6"
          >
            <HiChevronLeft className="h-6 w-6" />
          </button>
        ) : null}

        {canSwitch ? (
          <button
            type="button"
            aria-label={t('home.cases.next')}
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--ink)] shadow-md transition hover:bg-white sm:right-4 lg:right-6"
          >
            <HiChevronRight className="h-6 w-6" />
          </button>
        ) : null}

        <div
          className="flex h-full w-full items-stretch justify-center px-12 py-14 sm:px-16 sm:py-12 lg:px-20"
          onClick={onClose}
        >
          <div
            className="flex w-full max-w-[1280px] flex-col overflow-hidden rounded-[12px] bg-[var(--surface)] shadow-[0_28px_80px_rgba(12,12,13,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-start gap-3">
                <AuthorFollowAvatar
                  name={author}
                  avatar={caseMeta.authorAvatar}
                  size={40}
                  showFollow={!isSelf}
                  following={following}
                  onOpenProfile={openProfile}
                  onToggleFollow={onToggleFollow}
                  followLabel={t('home.cases.followUser')}
                  unfollowLabel={t('home.cases.unfollowUser')}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold tracking-tight text-[var(--ink)] sm:text-[17px]">
                    {title}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--muted)]">
                    <button
                      type="button"
                      onClick={openProfile}
                      className="font-medium text-[var(--ink)]/80 transition hover:underline"
                    >
                      {author}
                    </button>
                    <span>·</span>
                    <span>{t(`home.cases.cat.${caseMeta.category}`)}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-pressed={liked}
                  onClick={() => onToggleLike(caseMeta)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-medium ring-1 transition',
                    liked
                      ? 'bg-[#fff1f2] text-[#e11d48] ring-[#fecdd3]'
                      : 'bg-[var(--surface)] text-[var(--ink)] ring-[var(--line)] hover:bg-[var(--accent-soft)]'
                  )}
                >
                  <HiHeart className={cn('h-4 w-4', liked && 'fill-current')} />
                  <span className="tabular-nums">{formatStatCount(likes)}</span>
                </button>
                <button
                  type="button"
                  disabled={remixing || !doc}
                  onClick={() => onRemix(caseMeta)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-[var(--accent)] px-3.5 text-[13px] font-semibold text-[var(--on-brand)] transition hover:opacity-90 disabled:opacity-50"
                >
                  <HiOutlineDocumentDuplicate className="h-4 w-4" />
                  {remixing ? t('home.cases.remixing') : t('home.cases.use')}
                  <span className="tabular-nums opacity-80">{formatStatCount(uses)}</span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 px-5 sm:px-6">
              <div className="flex h-[min(520px,calc(100vh-280px))] items-center justify-center overflow-hidden rounded-[12px] bg-[var(--canvas)]">
                {doc ? (
                  <div className="relative h-full w-full">
                    <TemplateThumbnail document={doc} fit="contain" />
                  </div>
                ) : (
                  <div className="text-[13px] text-[var(--muted)]">—</div>
                )}
              </div>
            </div>

            {canSwitch ? (
              <div className="shrink-0 border-t border-[var(--line)] px-4 py-3 sm:px-5">
                <div className="mb-2 text-[11px] font-medium text-[var(--muted)]">
                  {t('home.cases.switchHint')}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {rail.map((c, i) => {
                    const active = c.id === caseMeta.id;
                    // Only mount nearby SVG thumbs — full rail would freeze the modal.
                    const near = Math.abs(i - index) <= 6;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={resolveCaseTitle(c, t)}
                        onClick={() => onSelect(c)}
                        className={cn(
                          'relative h-14 w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--canvas)] transition',
                          active
                            ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]'
                            : 'opacity-70 hover:opacity-100'
                        )}
                      >
                        {near && docs[c.id] ? (
                          <TemplateThumbnail document={docs[c.id]} fit="cover" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-4 shrink-0" />
            )}
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
