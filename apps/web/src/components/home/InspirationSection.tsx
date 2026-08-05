import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiHeart,
  HiOutlineDocumentArrowDown,
  HiOutlinePhoto,
} from 'react-icons/hi2';
import { Icon } from '@/components/base/icon';
import {
  fetchMyLikedIds,
  likePlazaItem,
  unlikePlazaItem,
} from '@/apis/me';
import {
  fetchPlazaFeed,
  fetchPlazaItem,
  plazaDisplayCoverUrls,
  recordPlazaUse,
  type PlazaCategoryFilter,
} from '@/apis/plaza';
import {
  caseAuthorLabel,
  resolveCasePrompt,
  resolveCaseTitle,
  type OfficialCaseCategory,
  type OfficialCaseMeta,
  normalizeCaseCategory,
} from '@/utils/officialCases';
import InspirationCasePreview from '@/components/home/InspirationCasePreview';
import EmptyState from '@/components/home/EmptyState';
import PlazaCoverThumb from '@/components/home/PlazaCoverThumb';
import { FlowScrollSection } from '@/components/home/FlowScrollSection';
import SegmentTabs from '@/components/home/SegmentTabs';
import { Dropdown, message } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { cn } from '@/utils/classnames';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { imageSrcToFile } from '@/utils/uploadImage';

type Props = {
  onOpenCase: (meta: OfficialCaseMeta) => void;
  disabled?: boolean;
};

type PlazaTab = PlazaCategoryFilter;

const TABS: PlazaTab[] = ['all', 'poster', 'mobile', 'image', 'video'];
const PAGE_SIZE = 12;

function formatStatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function coverImageUrl(meta: OfficialCaseMeta): string {
  const fromList =
    Array.isArray(meta.thumbnailUrls) && meta.thumbnailUrls.length
      ? meta.thumbnailUrls.find((u) => String(u || '').trim())
      : '';
  const fromThumb = String(meta.thumbnail || '').trim();
  const fromPanel = meta.panelUrls?.find((p) => String(p?.url || '').trim())?.url;
  return String(fromList || fromThumb || fromPanel || '').trim();
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

async function copyImageToClipboard(url: string): Promise<boolean> {
  const src = String(url || '').trim();
  if (!src) return false;
  try {
    // COS/plaza covers lack browser CORS — go through /api/v1/uploads/content.
    const file = await imageSrcToFile(src, 'inspiration.png');
    const type = file.type && file.type.startsWith('image/') ? file.type : 'image/png';
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      await navigator.clipboard.writeText(src);
      return true;
    }
    await navigator.clipboard.write([new ClipboardItem({ [type]: file })]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(src);
      return true;
    } catch {
      return false;
    }
  }
}

function feedToMeta(item: {
  id: string;
  userId?: string;
  title: string;
  category: string;
  authorName: string;
  authorAvatar?: string | null;
  coverDocument?: unknown | null;
  thumbnailUrl?: string | string[] | null;
  customCoverImageUrl?: string | null;
  panelUrls?: Array<{ id: string; name?: string; url: string }> | null;
  createdAt: number;
  likeCount?: number;
  useCount?: number;
  updatedAt?: number;
}): OfficialCaseMeta {
  const urls = plazaDisplayCoverUrls(item);
  return {
    id: item.id,
    name: item.title,
    category: normalizeCaseCategory(item.category) as OfficialCaseCategory,
    source: 'plaza',
    authorName: item.authorName,
    authorAvatar: item.authorAvatar,
    coverDocument: item.coverDocument ?? null,
    thumbnailUrls: urls,
    thumbnail: urls[0] || null,
    panelUrls: item.panelUrls ?? null,
    authorUserId: item.userId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    likeCount: Number(item.likeCount) || 0,
    useCount: Number(item.useCount) || 0,
  };
}

function resolveNextLikeCount(
  current: number,
  wasLiked: boolean,
  nowLiked: boolean,
  serverCount: number
): number {
  if (Number.isFinite(serverCount)) return Math.max(0, serverCount);
  const base = current;
  if (nowLiked) return wasLiked ? base : base + 1;
  return wasLiked ? Math.max(0, base - 1) : base;
}

function InspirationCaseCard({
  meta,
  liked,
  likes,
  title,
  author,
  disabled,
  likeBusy,
  onOpenPreview,
  onToggleLike,
  t,
}: {
  meta: OfficialCaseMeta;
  liked: boolean;
  likes: number;
  title: string;
  author: string;
  disabled?: boolean;
  likeBusy: boolean;
  onOpenPreview: (meta: OfficialCaseMeta) => void;
  onToggleLike: (meta: OfficialCaseMeta, e?: MouseEvent) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}): ReactNode {
  const initial = (author[0] || 'R').toUpperCase();
  const useMenuItems: MenuItemType[] = [
    {
      key: 'prompt',
      label: (
        <span className="inline-flex items-center gap-2">
          <HiOutlineDocumentArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t('home.cases.usePrompt')}
        </span>
      ),
    },
    {
      key: 'image',
      label: (
        <span className="inline-flex items-center gap-2">
          <HiOutlinePhoto className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t('home.cases.useImage')}
        </span>
      ),
    },
  ];

  const onUseMenu = async (key: string) => {
    if (key === 'prompt') {
      const prompt = resolveCasePrompt(meta, t);
      const ok = await copyTextToClipboard(prompt);
      if (ok) {
        message.success(t('home.cases.promptCopied'));
        recordPlazaUse(meta.id).catch(() => undefined);
      } else {
        message.error(t('home.cases.copyFailed'));
      }
      return;
    }
    if (key === 'image') {
      const url = coverImageUrl(meta);
      if (!url) {
        message.error(t('home.cases.copyFailed'));
        return;
      }
      const ok = await copyImageToClipboard(url);
      if (ok) {
        message.success(t('home.cases.imageCopied'));
        recordPlazaUse(meta.id).catch(() => undefined);
      } else {
        message.error(t('home.cases.copyFailed'));
      }
    }
  };

  return (
    <article className="group min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenPreview(meta)}
        className="block w-full text-left disabled:opacity-60"
        aria-label={title}
      >
        <PlazaCoverThumb
          coverDocument={meta.coverDocument}
          thumbnail={
            (Array.isArray(meta.thumbnailUrls) && meta.thumbnailUrls[0]) ||
            meta.thumbnail ||
            null
          }
          version={Number(meta.updatedAt) || Number(meta.createdAt) || undefined}
          layout="flow"
        >
          {/* Hover title — bottom scrim gradient (see plaza showcase covers). */}
          <span
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 z-10',
              'bg-gradient-to-t from-black/70 via-black/35 to-transparent',
              'px-2.5 pb-2.5 pt-10',
              'opacity-0 transition-opacity duration-300 group-hover:opacity-100'
            )}
          >
            <span className="line-clamp-2 text-left text-[12px] font-medium leading-snug text-white">
              {title}
            </span>
          </span>
        </PlazaCoverThumb>
      </button>

      {/* Flow footer — avatar + author; like + use (prompt/image) menu. */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpenPreview(meta)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-60"
        >
          {meta.authorAvatar ? (
            <img
              src={meta.authorAvatar}
              alt=""
              className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-[var(--line)]"
            />
          ) : (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[9px] font-bold text-[var(--on-brand)]"
              aria-hidden
            >
              {initial}
            </span>
          )}
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--ink)]">
            {author}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2.5 text-[12px] tabular-nums text-[var(--muted)]">
          <button
            type="button"
            aria-pressed={liked}
            aria-label={liked ? t('home.cases.unlike') : t('home.cases.like')}
            disabled={likeBusy}
            onClick={(e) => void onToggleLike(meta, e)}
            className={cn(
              'inline-flex items-center gap-0.5 transition hover:text-[var(--ink)] disabled:opacity-50',
              liked && 'text-[#e11d48]'
            )}
          >
            <HiHeart className={cn('h-3.5 w-3.5', liked && 'fill-current')} aria-hidden />
            {formatStatCount(likes)}
          </button>
          <Dropdown
            trigger="click"
            placement="bottom-end"
            strategy="fixed"
            offset={4}
            items={useMenuItems}
            onClick={onUseMenu}
            floatingClassName="z-[600]"
            popupClassName="min-w-[9.5rem] rounded-xl !bg-[var(--surface)] p-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-[var(--line)]"
          >
            <button
              type="button"
              disabled={disabled}
              aria-haspopup="menu"
              aria-label={t('home.cases.use')}
              title={t('home.cases.use')}
              className="inline-flex h-5 w-5 items-center justify-center text-[#BCBCBC] transition hover:text-[var(--ink)] disabled:opacity-50"
            >
              <Icon name="home-use-case-menu" className="h-[14px] w-[14px]" />
            </button>
          </Dropdown>
        </div>
      </div>
    </article>
  );
}

function InspirationSection({ onOpenCase, disabled }: Props): ReactNode {
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
        const feedParams: {
          page: number;
          pageSize: number;
          tab: 'latest';
          category?: string;
        } = {
          page: nextPage,
          pageSize: PAGE_SIZE,
          tab: 'latest',
        };
        if (nextTab && nextTab !== 'all') feedParams.category = nextTab;
        const feed = await fetchPlazaFeed(feedParams);
        if (gen !== fetchGen.current) return;
        const mapped = (feed.items || []).map(feedToMeta);
        setCases((prev) => (append ? [...prev, ...mapped] : mapped));
        setPage(nextPage);
        setHasMore(Boolean(feed.hasMore));
        if (!append) setDocs({});
      } catch (err) {
        if (gen !== fetchGen.current) return;
        // Empty feed is success — only real HTTP errors toast. Network/proxy
        // failures (API still starting) show EmptyState without alarm toast.
        if (!append) {
          setCases([]);
          setHasMore(false);
        }
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status) message.error(t('home.casesLoadFailed'));
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

  const onLoadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    void loadPage(tab, page + 1, true);
  }, [hasMore, loading, loadingMore, loadPage, page, tab]);

  // Document JSON only when preview opens (not for list thumbnails).
  useEffect(() => {
    if (!previewId) return;
    if (docs[previewId] !== undefined) return;
    let cancelled = false;
    const meta = cases.find((c) => c.id === previewId);
    if (!meta) return;
    void fetchPlazaItem(meta.id)
      .then((res) => {
        if (cancelled) return;
        const item = res.item;
        setDocs((prev) =>
          prev[previewId] !== undefined ? prev : { ...prev, [previewId]: item.document ?? null }
        );
        if (Array.isArray(item.panelUrls) && item.panelUrls.length) {
          setCases((prev) =>
            prev.map((c) =>
              c.id === previewId ? { ...c, panelUrls: item.panelUrls ?? null } : c
            )
          );
        }
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
      // Skill chip → chat; blank canvas (handled by HomePage). No document clone.
      onOpenCase(meta);
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
          return {
            ...c,
            likeCount: resolveNextLikeCount(
              Number(c.likeCount) || 0,
              wasLiked,
              nowLiked,
              serverCount
            ),
          };
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

  return (
    <section className="w-full min-w-0">
      <h2 className="mb-3 text-[18px] font-semibold tracking-tight text-[var(--ink)]">
        {t('home.cases.title')}
      </h2>
      <SegmentTabs
        className="mb-5"
        size="sm"
        aria-label={t('home.cases.title')}
        tabs={TABS.map((id) => ({ id, label: t(`home.cases.cat.${id}`) }))}
        value={tab}
        onChange={onTabClick}
      />

      <FlowScrollSection
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        isEmpty={cases.length === 0}
        empty={<EmptyState hint={t('home.cases.empty')} />}
      >
        {cases.map((c) => (
          <InspirationCaseCard
            key={c.id}
            meta={c}
            liked={likedIds.has(c.id)}
            likes={Math.max(0, Number(c.likeCount) || 0)}
            title={resolveCaseTitle(c, t)}
            author={caseAuthorLabel(c, t)}
            disabled={disabled}
            likeBusy={likeBusyId === c.id}
            onOpenPreview={openPreview}
            onToggleLike={onToggleLike}
            t={t}
          />
        ))}
      </FlowScrollSection>

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

export default memo(InspirationSection);

const MemoizedInspirationCaseCard = memo(InspirationCaseCard);
export { MemoizedInspirationCaseCard as InspirationCaseCard };
