import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiHeart } from 'react-icons/hi2';
import {
  fetchMyLikedIds,
  likePlazaItem,
  unlikePlazaItem,
} from '@/apis/me';
import {
  fetchPlazaFeed,
  fetchPlazaItem,
  recordPlazaUse,
  type PlazaCategoryFilter,
} from '@/apis/plaza';
import {
  caseAuthorLabel,
  resolveCaseTitle,
  resolveCasePrompt,
  type OfficialCaseCategory,
  type OfficialCaseMeta,
  normalizeCaseCategory,
} from '@/utils/officialCases';
import InspirationCasePreview from '@/components/home/InspirationCasePreview';
import EmptyState from '@/components/home/EmptyState';
import PlazaCoverThumb from '@/components/home/PlazaCoverThumb';
import { projectThumbFrameClass } from '@/utils/projectThumb';
import SegmentTabs from '@/components/home/SegmentTabs';
import { formatStatCount } from '@/utils/likedCases';
import { nearestScrollRoot } from '@/utils/useInfiniteList';
import { cn } from '@/utils/classnames';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { message } from '@/components/base';

type Props = {
  onOpenCase: (meta: OfficialCaseMeta, document: unknown, opts?: { prompt?: string }) => void;
  disabled?: boolean;
};

type PlazaTab = PlazaCategoryFilter;

const TABS: PlazaTab[] = ['all', 'website', 'mobile', 'image', 'poster'];
const PAGE_SIZE = 12;

function feedToMeta(item: {
  id: string;
  userId?: string;
  title: string;
  category: string;
  authorName: string;
  authorAvatar?: string | null;
  coverDocument?: unknown | null;
  createdAt: number;
  likeCount?: number;
  useCount?: number;
}): OfficialCaseMeta {
  return {
    id: item.id,
    name: item.title,
    category: normalizeCaseCategory(item.category) as OfficialCaseCategory,
    source: 'plaza',
    authorName: item.authorName,
    authorAvatar: item.authorAvatar,
    coverDocument: item.coverDocument ?? null,
    authorUserId: item.userId,
    createdAt: item.createdAt,
    likeCount: Number(item.likeCount) || 0,
    useCount: Number(item.useCount) || 0,
  };
}

async function loadCaseDocument(
  meta: OfficialCaseMeta,
  cache: Record<string, unknown>
): Promise<unknown> {
  if (cache[meta.id]) return cache[meta.id];
  const res = await fetchPlazaItem(meta.id);
  return res.item.document;
}

export default function InspirationSection({ onOpenCase, disabled }: Props): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSelector((s: any) => s.auth?.user);
  const userId = user?.id as string | undefined;
  const [tab, setTab] = useState<PlazaTab>('all');
  const [cases, setCases] = useState<OfficialCaseMeta[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchGen = useRef(0);

  useEffect(() => {
    if (!userId) {
      setLikedIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchMyLikedIds()
      .then((likedRes) => {
        if (cancelled) return;
        setLikedIds(new Set(likedRes.ids || []));
      })
      .catch(() => {
        if (!cancelled) setLikedIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadPage = useCallback(
    async (nextTab: PlazaTab, nextPage: number, append: boolean) => {
      const gen = ++fetchGen.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const feed = await fetchPlazaFeed({
          page: nextPage,
          pageSize: PAGE_SIZE,
          tab: 'latest',
          category: nextTab,
        });
        if (gen !== fetchGen.current) return;
        const mapped = (feed.items || []).map(feedToMeta);
        setCases((prev) => (append ? [...prev, ...mapped] : mapped));
        setPage(nextPage);
        setHasMore(Boolean(feed.hasMore));
        if (!append) setDocs({});
      } catch {
        if (gen === fetchGen.current) message.error(t('home.casesLoadFailed'));
      } finally {
        if (gen === fetchGen.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [t]
  );

  // Tab change / first mount → single feed page (no per-item document calls).
  useEffect(() => {
    void loadPage(tab, 1, false);
  }, [tab, loadPage]);

  // Server-side infinite scroll → next feed page only.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return undefined;
    const root = nearestScrollRoot(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        void loadPage(tab, page + 1, true);
      },
      { root, rootMargin: '320px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadPage, page, tab]);

  // Document JSON only when preview opens (not for list thumbnails).
  useEffect(() => {
    if (!previewId) return;
    if (docs[previewId] !== undefined) return;
    let cancelled = false;
    const meta = cases.find((c) => c.id === previewId);
    if (!meta) return;
    void loadCaseDocument(meta, docs)
      .then((doc) => {
        if (cancelled) return;
        setDocs((prev) => (prev[previewId] !== undefined ? prev : { ...prev, [previewId]: doc }));
      })
      .catch(() => {
        if (cancelled) return;
        setDocs((prev) => (prev[previewId] !== undefined ? prev : { ...prev, [previewId]: null }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewId]);

  const previewMeta = useMemo(
    () => (previewId ? cases.find((c) => c.id === previewId) || null : null),
    [cases, previewId]
  );

  const openPreview = (meta: OfficialCaseMeta) => {
    if (disabled) return;
    setPreviewId(meta.id);
  };

  const remix = async (meta: OfficialCaseMeta) => {
    if (disabled || openingId) return;
    setOpeningId(meta.id);
    try {
      const document = docs[meta.id] || (await loadCaseDocument(meta, docs));
      void recordPlazaUse(meta.id)
        .then((res) => {
          const n = Number(res.useCount);
          if (!Number.isFinite(n)) return;
          setCases((prev) =>
            prev.map((c) => (c.id === meta.id ? { ...c, useCount: n } : c))
          );
        })
        .catch(() => undefined);
      setPreviewId(null);
      onOpenCase(meta, document, { prompt: resolveCasePrompt(meta, t) });
    } catch {
      message.error(t('home.casesOpenFailed'));
    } finally {
      setOpeningId(null);
    }
  };

  const onToggleLike = async (meta: OfficialCaseMeta, e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!userId) {
      message.warning(t('home.cases.likeNeedLogin'));
      navigate(buildLoginUrl('/home'));
      return;
    }
    if (likeBusyId === meta.id) return;
    const wasLiked = likedIds.has(meta.id);
    setLikeBusyId(meta.id);
    try {
      const res = await (wasLiked ? unlikePlazaItem(meta.id) : likePlazaItem(meta.id));
      const nowLiked = Boolean(res?.liked);
      const serverCount = Number(res?.likeCount);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (nowLiked) next.add(meta.id);
        else next.delete(meta.id);
        return next;
      });
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== meta.id) return c;
          const nextCount = Number.isFinite(serverCount)
            ? Math.max(0, serverCount)
            : (() => {
                const base = Number(c.likeCount) || 0;
                if (nowLiked) return wasLiked ? base : base + 1;
                return wasLiked ? Math.max(0, base - 1) : base;
              })();
          return { ...c, likeCount: nextCount };
        })
      );
      message.success(nowLiked ? t('home.cases.likedToast') : t('home.cases.unlikedToast'));
    } catch {
      message.error(t('home.casesLoadFailed'));
    } finally {
      setLikeBusyId(null);
    }
  };

  const onTabClick = (next: PlazaTab) => {
    if (next === tab) return;
    setCases([]);
    setHasMore(false);
    setPage(1);
    setTab(next);
  };

  const gridClass =
    'grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  return (
    <section className="w-full min-w-0">
      <h2 className="mb-3 text-[16px] font-semibold tracking-tight text-[var(--ink)]">
        {t('home.cases.title')}
      </h2>
      <SegmentTabs
        className="mb-5"
        aria-label={t('home.cases.title')}
        tabs={TABS.map((id) => ({ id, label: t(`home.cases.cat.${id}`) }))}
        value={tab}
        onChange={onTabClick}
      />

      {loading ? (
        <div className={cn(gridClass, 'w-full')}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} aria-busy="true">
              <div className={projectThumbFrameClass('skeleton-bone shadow-none')} />
              <div className="mt-2.5 flex items-center gap-2">
                <div className="skeleton-bone !rounded-full h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton-bone h-3 w-3/4" />
                  <div className="skeleton-bone h-2.5 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : cases.length === 0 ? (
        <EmptyState hint={t('home.cases.empty')} />
      ) : (
        <>
          <div className={cn(gridClass, 'w-full')}>
            {cases.map((c) => {
              const liked = likedIds.has(c.id);
              const likes = Math.max(0, Number(c.likeCount) || 0);
              const title = resolveCaseTitle(c, t);
              const author = caseAuthorLabel(c, t);
              const initial = (author[0] || 'R').toUpperCase();
              return (
                <article key={c.id} className="group min-w-0">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPreview(c)}
                    className="block w-full text-left disabled:opacity-60"
                  >
                    {/* Plaza feed coverDocument only — no full canvas fetch */}
                    <PlazaCoverThumb coverDocument={c.coverDocument} />
                  </button>

                  <div className="mt-2.5 flex items-start gap-2">
                    {c.authorAvatar ? (
                      <img
                        src={c.authorAvatar}
                        alt=""
                        className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-[var(--line)]"
                      />
                    ) : (
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[9px] font-bold text-[var(--on-brand)]"
                        aria-hidden
                      >
                        {initial}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => openPreview(c)}
                        className="block w-full truncate text-left text-[13px] font-semibold leading-snug text-[var(--ink)] hover:underline disabled:opacity-60"
                        title={title}
                      >
                        {title}
                      </button>
                      <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{author}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5 pt-1 text-[12px] tabular-nums text-[var(--muted)]">
                      <button
                        type="button"
                        aria-pressed={liked}
                        aria-label={liked ? t('home.cases.unlike') : t('home.cases.like')}
                        disabled={likeBusyId === c.id}
                        onClick={(e) => void onToggleLike(c, e)}
                        className={cn(
                          'inline-flex items-center gap-0.5 transition hover:text-[var(--ink)] disabled:opacity-50',
                          liked && 'text-[#e11d48]'
                        )}
                      >
                        <HiHeart
                          className={cn('h-3.5 w-3.5', liked && 'fill-current')}
                          aria-hidden
                        />
                        {formatStatCount(likes)}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {hasMore || loadingMore ? (
            <div ref={sentinelRef} className="flex h-10 w-full items-center justify-center" aria-hidden>
              {loadingMore ? (
                <span className="text-[12px] text-[var(--muted)]">…</span>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <InspirationCasePreview
        open={!!previewMeta}
        caseMeta={previewMeta}
        projectDocument={previewMeta ? docs[previewMeta.id] ?? null : null}
        likedIds={likedIds}
        likeBusy={!!previewMeta && likeBusyId === previewMeta.id}
        remixing={!!openingId}
        onClose={() => {
          setPreviewId(null);
        }}
        onRemix={(meta) => void remix(meta)}
        onToggleLike={(meta) => onToggleLike(meta)}
      />
    </section>
  );
}
