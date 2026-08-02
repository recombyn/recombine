import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EditProfileDialog from '@/components/home/EditProfileDialog';
import EmptyState from '@/components/home/EmptyState';
import InspirationCasePreview from '@/components/home/InspirationCasePreview';
import {
  InspirationCaseCard,
} from '@/components/home/InspirationSection';
import { FlowScrollSection } from '@/components/home/FlowScrollSection';
import SegmentTabs from '@/components/home/SegmentTabs';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import { buildLoginUrl } from '@/utils/authReturnTo';
import {
  fetchMyLiked,
  fetchMyLikedIds,
  likePlazaItem,
  syncMyLiked,
  unlikePlazaItem,
} from '@/apis/me';
import {
  fetchMyPlazaSubmissions,
  fetchPlazaItem,
  plazaDisplayCoverUrls,
  recordPlazaUse,
} from '@/apis/plaza';
import {
  caseAuthorLabel,
  resolveCaseTitle,
  normalizeCaseCategory,
  type OfficialCaseMeta,
} from '@/utils/officialCases';
import { message } from '@/components/base';
import { getToken } from '@/utils/token';

/** Me profile feed only — 2 cols on phone / iPad (not plaza density). */
const ME_FLOW_COLUMNS = 'w-full columns-2 gap-4 xl:columns-3 2xl:columns-4';

/** Edit-profile icon (person + pencil) — stroke follows currentColor. */
function ProfileEditIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      fill="none"
      viewBox="0 0 14 14"
      className={className}
      aria-hidden
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.167"
        d="M6.708 8.75H4.083a2.333 2.333 0 0 0-2.333 2.333v1.167m10.72-2.551a1.239 1.239 0 1 0-1.752-1.753l-2.339 2.34c-.139.14-.24.31-.295.499l-.488 1.674a.292.292 0 0 0 .361.362l1.674-.489c.189-.055.36-.156.499-.295zM8.168 4.083a2.333 2.333 0 1 1-4.667 0 2.333 2.333 0 0 1 4.667 0"
      />
    </svg>
  );
}

type ProfileTab = 'published' | 'liked';

type LikedCaseItem = OfficialCaseMeta & { likedAt: number };

type Props = {
  onOpenCase: (meta: OfficialCaseMeta) => void;
};

const LIKED_LOCAL_PREFIX = 'recombyn-liked-cases-v1:';

/** One-shot migrate local likes → API, then clear localStorage. */
function loadLocalLikedIds(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`${LIKED_LOCAL_PREFIX}${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as Array<{ id?: string }>;
    if (!Array.isArray(list)) return [];
    return list.map((x) => String(x?.id || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function clearLocalLiked(userId: string) {
  try {
    localStorage.removeItem(`${LIKED_LOCAL_PREFIX}${userId}`);
  } catch {
    /* ignore */
  }
}

function resolveNextLikeCount(
  current: number,
  wasLiked: boolean,
  nowLiked: boolean,
  serverCount: number
): number {
  if (Number.isFinite(serverCount)) return Math.max(0, serverCount);
  if (nowLiked) return wasLiked ? current : current + 1;
  return wasLiked ? Math.max(0, current - 1) : current;
}

function mapLikedItem(x: {
  id: string;
  title?: string;
  category: string;
  authorName?: string;
  authorAvatar?: string | null;
  coverDocument?: unknown | null;
  thumbnailUrl?: string | string[] | null;
  customCoverImageUrl?: string | null;
  panelUrls?: OfficialCaseMeta['panelUrls'];
  userId?: string;
  createdAt: number;
  updatedAt?: number;
  likedAt?: number;
  likeCount?: number;
  useCount?: number;
}): LikedCaseItem {
  const urls = plazaDisplayCoverUrls(x);
  return {
    id: x.id,
    name: x.title || '',
    category: normalizeCaseCategory(x.category),
    source: 'plaza',
    authorName: x.authorName,
    authorAvatar: x.authorAvatar,
    coverDocument: x.coverDocument ?? null,
    thumbnailUrls: urls,
    thumbnail: urls[0] || null,
    panelUrls: x.panelUrls ?? null,
    authorUserId: x.userId,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    likeCount: Number(x.likeCount) || 0,
    useCount: Number(x.useCount) || 0,
    likedAt: x.likedAt || Date.now(),
  };
}

const PAGE_SIZE = 20;

function mapPublishedSubmission(x: {
  id: string;
  title: string;
  category: string;
  authorName?: string;
  authorAvatar?: string | null;
  coverDocument?: unknown | null;
  thumbnailUrl?: string | string[] | null;
  customCoverImageUrl?: string | null;
  panelUrls?: OfficialCaseMeta['panelUrls'];
  createdAt: number;
  updatedAt?: number;
  likeCount?: number;
  useCount?: number;
}): OfficialCaseMeta {
  const urls = plazaDisplayCoverUrls(x);
  return {
    id: x.id,
    name: x.title,
    category: normalizeCaseCategory(x.category),
    source: 'plaza',
    authorName: x.authorName,
    authorAvatar: x.authorAvatar,
    coverDocument: x.coverDocument ?? null,
    thumbnailUrls: urls,
    thumbnail: urls[0] || null,
    panelUrls: x.panelUrls ?? null,
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
    likeCount: Number(x.likeCount) || 0,
    useCount: Number(x.useCount) || 0,
  };
}

/** 「我的」页：资料区 + 已发布 / 我的喜欢 — 卡片与预览同广场。 */
function MePage({ onOpenCase }: Props): ReactNode {
  const { t } = useTranslation();
  const user = useSelector((s: any) => s.auth.user);
  const navigate = useNavigate();
  const [tab, setTab] = useState<ProfileTab>('published');
  const [editOpen, setEditOpen] = useState(false);

  const [liked, setLiked] = useState<LikedCaseItem[]>([]);
  const [likedPage, setLikedPage] = useState(1);
  const [likedHasMore, setLikedHasMore] = useState(false);
  const [likedLoading, setLikedLoading] = useState(false);
  const [likedLoadingMore, setLikedLoadingMore] = useState(false);
  /** First fetch done — skip skeleton when switching back to Liked. */
  const [likedReady, setLikedReady] = useState(false);

  const [publishedAll, setPublishedAll] = useState<OfficialCaseMeta[]>([]);
  const [publishedVisible, setPublishedVisible] = useState(PAGE_SIZE);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedLoadingMore, setPublishedLoadingMore] = useState(false);
  /** First fetch done — skip skeleton when switching back to Published. */
  const [publishedReady, setPublishedReady] = useState(false);

  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [remixingId, setRemixingId] = useState<string | null>(null);

  const likedMigratedRef = useRef(false);
  const likedFetchGen = useRef(0);

  const displayName = user?.name || user?.email?.split('@')[0] || t('home.account');
  const userId = user?.id as string | undefined;
  const authed = Boolean(userId && getToken());

  useEffect(() => {
    // New account session — allow first-fetch skeletons again.
    setLikedReady(false);
    setPublishedReady(false);
    setLiked([]);
    setPublishedAll([]);
    likedMigratedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!authed || !userId) {
      setLikedIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchMyLikedIds()
      .then((res) => {
        if (!cancelled) setLikedIds(new Set(res.ids || []));
      })
      .catch(() => {
        if (!cancelled) setLikedIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [authed, userId]);

  useEffect(() => {
    if (tab !== 'liked') return;
    if (!authed || !userId) {
      setLiked([]);
      setLikedHasMore(false);
      setLikedLoading(false);
      setLikedReady(true);
      return;
    }
    // Already loaded once — keep list visible; no skeleton flash on tab switch.
    if (likedReady) return;
    let cancelled = false;
    const gen = ++likedFetchGen.current;
    setLikedLoading(true);
    setLikedLoadingMore(false);
    void (async () => {
      try {
        if (!likedMigratedRef.current) {
          const localIds = loadLocalLikedIds(userId);
          if (localIds.length) {
            await syncMyLiked(localIds);
            clearLocalLiked(userId);
          }
          likedMigratedRef.current = true;
        }
        if (cancelled || gen !== likedFetchGen.current) return;
        const res = await fetchMyLiked({ page: 1, pageSize: PAGE_SIZE });
        if (cancelled || gen !== likedFetchGen.current) return;
        const items = (res.items || []).map(mapLikedItem);
        setLiked(items);
        setLikedIds((prev) => {
          const next = new Set(prev);
          for (const item of items) next.add(item.id);
          return next;
        });
        setLikedPage(1);
        setLikedHasMore(Boolean(res.hasMore));
      } catch {
        if (!cancelled && gen === likedFetchGen.current) {
          setLiked([]);
          setLikedHasMore(false);
          message.error(t('home.casesLoadFailed'));
        }
      } finally {
        if (!cancelled && gen === likedFetchGen.current) {
          setLikedLoading(false);
          setLikedReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, authed, userId, t, likedReady]);

  const loadMoreLiked = useCallback(() => {
    if (!authed || !likedHasMore || likedLoading || likedLoadingMore) return;
    const nextPage = likedPage + 1;
    const gen = likedFetchGen.current;
    setLikedLoadingMore(true);
    void fetchMyLiked({ page: nextPage, pageSize: PAGE_SIZE })
      .then((res) => {
        if (gen !== likedFetchGen.current) return;
        const items = (res.items || []).map(mapLikedItem);
        setLiked((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...items.filter((x) => !seen.has(x.id))];
        });
        setLikedIds((prev) => {
          const next = new Set(prev);
          for (const item of items) next.add(item.id);
          return next;
        });
        setLikedPage(nextPage);
        setLikedHasMore(Boolean(res.hasMore));
      })
      .catch(() => {
        if (gen === likedFetchGen.current) message.error(t('home.casesLoadFailed'));
      })
      .finally(() => {
        if (gen === likedFetchGen.current) setLikedLoadingMore(false);
      });
  }, [authed, likedHasMore, likedLoading, likedLoadingMore, likedPage, t]);

  useEffect(() => {
    if (tab !== 'published') return;
    if (!userId) {
      setPublishedAll([]);
      setPublishedLoading(false);
      setPublishedReady(true);
      return;
    }
    // Already loaded once — keep list visible; no skeleton flash on tab switch.
    if (publishedReady) return;
    let cancelled = false;
    setPublishedLoading(true);
    setPublishedVisible(PAGE_SIZE);
    setPublishedLoadingMore(false);
    void fetchMyPlazaSubmissions()
      .then((res) => {
        if (cancelled) return;
        const approved = (res.items || [])
          .filter((x) => x.status === 'approved')
          .map(mapPublishedSubmission);
        setPublishedAll(approved);
      })
      .catch(() => {
        if (!cancelled) setPublishedAll([]);
      })
      .finally(() => {
        if (!cancelled) {
          setPublishedLoading(false);
          setPublishedReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, userId, publishedReady]);

  const publishedSlice = publishedAll.slice(0, publishedVisible);
  const publishedHasMore = publishedVisible < publishedAll.length;

  const loadMorePublished = useCallback(() => {
    if (!publishedHasMore || publishedLoading || publishedLoadingMore) return;
    setPublishedLoadingMore(true);
    window.setTimeout(() => {
      setPublishedVisible((n) => Math.min(n + PAGE_SIZE, publishedAll.length));
      setPublishedLoadingMore(false);
    }, 180);
  }, [publishedAll.length, publishedHasMore, publishedLoading, publishedLoadingMore]);

  const listForPreview = tab === 'liked' ? liked : publishedAll;

  useEffect(() => {
    if (!previewId) return;
    if (docs[previewId] !== undefined) return;
    let cancelled = false;
    void fetchPlazaItem(previewId)
      .then((res) => {
        if (cancelled) return;
        const item = res.item;
        setDocs((prev) =>
          prev[previewId] !== undefined ? prev : { ...prev, [previewId]: item.document ?? null }
        );
        if (Array.isArray(item.panelUrls) && item.panelUrls.length) {
          const panels = item.panelUrls;
          setLiked((prev) =>
            prev.map((c) => (c.id === previewId ? { ...c, panelUrls: panels } : c))
          );
          setPublishedAll((prev) =>
            prev.map((c) => (c.id === previewId ? { ...c, panelUrls: panels } : c))
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocs((prev) => (prev[previewId] !== undefined ? prev : { ...prev, [previewId]: null }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewId, docs]);

  const previewMeta = useMemo(
    () => (previewId ? listForPreview.find((c) => c.id === previewId) || null : null),
    [listForPreview, previewId]
  );

  const openPreview = (meta: OfficialCaseMeta) => {
    setPreviewId(meta.id);
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
      const patchCount = (c: OfficialCaseMeta) =>
        c.id !== meta.id
          ? c
          : {
              ...c,
              likeCount: resolveNextLikeCount(
                Number(c.likeCount) || 0,
                wasLiked,
                nowLiked,
                serverCount
              ),
            };
      setPublishedAll((prev) => prev.map(patchCount));
      if (!nowLiked) {
        setLiked((prev) => prev.filter((x) => x.id !== meta.id));
        if (previewId === meta.id) setPreviewId(null);
      } else {
        setLiked((prev) => prev.map(patchCount) as LikedCaseItem[]);
      }
      message.success(nowLiked ? t('home.cases.likedToast') : t('home.cases.unlikedToast'));
    } catch {
      message.error(t('home.casesLoadFailed'));
    } finally {
      setLikeBusyId(null);
    }
  };

  const remix = async (meta: OfficialCaseMeta) => {
    if (remixingId) return;
    setRemixingId(meta.id);
    try {
      void recordPlazaUse(meta.id).catch(() => undefined);
      setPreviewId(null);
      onOpenCase(meta);
    } catch {
      message.error(t('home.casesOpenFailed'));
    } finally {
      setRemixingId(null);
    }
  };

  const openProfile = () => {
    if (!user) {
      navigate(buildLoginUrl('/home'));
      return;
    }
    setEditOpen(true);
  };

  const profileTabs: { id: ProfileTab; label: string }[] = [
    { id: 'published', label: t('me.tabPublished') },
    { id: 'liked', label: t('me.tabLiked') },
  ];

  return (
    <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent [scrollbar-gutter:stable]">
      <div className="mx-auto w-full min-w-0 max-w-[1700px] px-5 pb-10 pt-20 sm:px-8 sm:pt-24 md:px-24 lg:px-[100px] xl:px-[120px]">
        <header className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-4 text-center">
          <button
            type="button"
            onClick={openProfile}
            className="shrink-0 rounded-full outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30"
            aria-label={t('me.editProfile')}
          >
            <UserAvatar
              name={user?.name}
              email={user?.email}
              avatar={user?.avatar}
              size={64}
            />
          </button>
          <div className="flex min-w-0 items-center justify-center gap-2">
            <h1 className="truncate text-[28px] font-semibold tracking-tight text-[var(--ink)]">
              {displayName}
            </h1>
            <button
              type="button"
              aria-label={t('me.editProfile')}
              onClick={openProfile}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] ring-1 ring-[var(--line)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
            >
              <ProfileEditIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="mt-8 flex w-full justify-start">
          <SegmentTabs
            size="md"
            tabs={profileTabs}
            value={tab}
            onChange={(id) => setTab(id as ProfileTab)}
          />
        </div>

        {/* Keep both panels mounted (hidden) so empty ↔ empty doesn't remount / jump. */}
        <div className="mt-6 w-full">
          <div
            className={tab === 'published' ? 'block' : 'hidden'}
            role="tabpanel"
            aria-hidden={tab !== 'published'}
          >
            {!userId ? (
              <EmptyState hint={t('plaza.needLogin')} />
            ) : (
              <FlowScrollSection
                loading={publishedLoading}
                loadingMore={publishedLoadingMore}
                hasMore={publishedHasMore}
                onLoadMore={loadMorePublished}
                isEmpty={publishedAll.length === 0}
                empty={<EmptyState hint={t('me.emptyPublished')} />}
                columnsClassName={ME_FLOW_COLUMNS}
              >
                {publishedSlice.map((c) => (
                  <InspirationCaseCard
                    key={c.id}
                    meta={c}
                    liked={likedIds.has(c.id)}
                    likes={Math.max(0, Number(c.likeCount) || 0)}
                    title={resolveCaseTitle(c, t)}
                    author={caseAuthorLabel(c, t)}
                    likeBusy={likeBusyId === c.id}
                    onOpenPreview={openPreview}
                    onToggleLike={onToggleLike}
                    t={t}
                  />
                ))}
              </FlowScrollSection>
            )}
          </div>

          <div
            className={tab === 'liked' ? 'block' : 'hidden'}
            role="tabpanel"
            aria-hidden={tab !== 'liked'}
          >
            {!userId ? (
              <EmptyState hint={t('home.cases.likeNeedLogin')} />
            ) : (
              <FlowScrollSection
                loading={likedLoading}
                loadingMore={likedLoadingMore}
                hasMore={likedHasMore}
                onLoadMore={loadMoreLiked}
                isEmpty={liked.length === 0}
                empty={<EmptyState hint={t('me.emptyLiked')} />}
                columnsClassName={ME_FLOW_COLUMNS}
              >
                {liked.map((c) => (
                  <InspirationCaseCard
                    key={c.id}
                    meta={c}
                    liked={likedIds.has(c.id)}
                    likes={Math.max(0, Number(c.likeCount) || 0)}
                    title={resolveCaseTitle(c, t)}
                    author={caseAuthorLabel(c, t)}
                    likeBusy={likeBusyId === c.id}
                    onOpenPreview={openPreview}
                    onToggleLike={onToggleLike}
                    t={t}
                  />
                ))}
              </FlowScrollSection>
            )}
          </div>
        </div>
      </div>

      <InspirationCasePreview
        open={!!previewMeta}
        caseMeta={previewMeta}
        projectDocument={previewMeta ? docs[previewMeta.id] ?? null : null}
        likedIds={likedIds}
        likeBusy={!!previewMeta && likeBusyId === previewMeta.id}
        remixing={!!remixingId}
        onClose={() => setPreviewId(null)}
        onRemix={(meta) => void remix(meta)}
        onToggleLike={(meta) => onToggleLike(meta)}
      />

      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </main>
  );
}

export default memo(MePage);
