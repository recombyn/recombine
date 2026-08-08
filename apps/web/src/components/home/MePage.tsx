import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, memo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/base/icon';
import EditProfileDialog from '@/components/home/EditProfileDialog';
import EmptyState from '@/components/home/EmptyState';
import InspirationCasePreview from '@/components/home/InspirationCasePreview';
import {
  InspirationCaseCard,
} from '@/components/home/InspirationSection';
import { FlowScrollSection } from '@/components/home/FlowScrollSection';
import {
  InfiniteScrollSection,
  GRID_SKELETON_COUNT,
} from '@/components/home/InfiniteScroll';
import {
  UserAssetCard,
  UserAssetCardSkeleton,
  UserAssetMediaPreview,
} from '@/components/home/UserAssetMediaCard';
import SegmentTabs from '@/components/home/SegmentTabs';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { deleteAsset, listAssets, type UserAsset } from '@/apis/assets';
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
import { Button, Dialog, message } from '@/components/base';
import { getToken } from '@/utils/token';

/** Me profile feed — same scale as Skills: 2 → 3 → 4 → 5 (2xl). */
const ME_FLOW_COLUMNS =
  'w-full columns-2 gap-4 md:columns-3 lg:columns-4 2xl:columns-5';

const ASSETS_PAGE_SIZE = 30;

type ProfileTab = 'published' | 'liked' | 'assets';

function isMediaAssetKind(kind: string): kind is 'image' | 'video' | 'audio' | 'lottie' {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'lottie';
}

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

/** 「我的」页：资料区 + 已发布 / 我的喜欢 / 资产 — 卡片与预览同广场；资产跨项目。 */
function MePage({ onOpenCase }: Props): ReactNode {
  const { t, i18n } = useTranslation();
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

  const [assets, setAssets] = useState<UserAsset[]>([]);
  const [assetsPage, setAssetsPage] = useState(1);
  const [assetsHasMore, setAssetsHasMore] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsLoadingMore, setAssetsLoadingMore] = useState(false);
  /** First fetch done — skip skeleton when switching back to Assets. */
  const [assetsReady, setAssetsReady] = useState(false);
  const [assetBusyId, setAssetBusyId] = useState<string | null>(null);
  const [assetPreview, setAssetPreview] = useState<UserAsset | null>(null);
  const [assetDeleteTarget, setAssetDeleteTarget] = useState<UserAsset | null>(null);

  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [remixingId, setRemixingId] = useState<string | null>(null);

  const likedMigratedRef = useRef(false);
  const likedFetchGen = useRef(0);
  const assetsFetchGen = useRef(0);
  const likedLoadedUserRef = useRef<string | null>(null);
  const publishedLoadedUserRef = useRef<string | null>(null);
  const assetsLoadedUserRef = useRef<string | null>(null);

  const displayName = user?.name || user?.email?.split('@')[0] || t('home.account');
  const userId = user?.id as string | undefined;
  const authed = Boolean(userId && getToken());

  useEffect(() => {
    // New account session — allow first-fetch skeletons again.
    likedLoadedUserRef.current = null;
    publishedLoadedUserRef.current = null;
    assetsLoadedUserRef.current = null;
    setLikedReady(false);
    setPublishedReady(false);
    setAssetsReady(false);
    setLiked([]);
    setPublishedAll([]);
    setAssets([]);
    setAssetPreview(null);
    setAssetDeleteTarget(null);
    likedMigratedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!authed || !userId) {
      setLikedIds(new Set());
      return;
    }
    let cancelled = false;
    async function hydrateLikedIds() {
      try {
        const res = await fetchMyLikedIds();
        if (!cancelled) setLikedIds(new Set(res.ids || []));
      } catch {
        if (!cancelled) setLikedIds(new Set());
      }
    }
    void hydrateLikedIds();
    return () => {
      cancelled = true;
    };
  }, [authed, userId]);

  const loadLikedOnce = useCallback(async () => {
    if (!authed || !userId) {
      setLiked([]);
      setLikedHasMore(false);
      setLikedLoading(false);
      setLikedReady(true);
      return;
    }
    if (likedLoadedUserRef.current === userId) return;
    likedLoadedUserRef.current = userId;
    const gen = ++likedFetchGen.current;
    setLikedLoading(true);
    setLikedLoadingMore(false);
    try {
      if (!likedMigratedRef.current) {
        const localIds = loadLocalLikedIds(userId);
        if (localIds.length) {
          await syncMyLiked(localIds);
          clearLocalLiked(userId);
        }
        likedMigratedRef.current = true;
      }
      if (gen !== likedFetchGen.current) return;
      const res = await fetchMyLiked({ page: 1, pageSize: PAGE_SIZE });
      if (gen !== likedFetchGen.current) return;
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
      if (gen === likedFetchGen.current) {
        likedLoadedUserRef.current = null;
        setLiked([]);
        setLikedHasMore(false);
        message.error(t('home.casesLoadFailed'));
      }
    } finally {
      if (gen === likedFetchGen.current) {
        setLikedLoading(false);
        setLikedReady(true);
      }
    }
  }, [authed, userId, t]);

  const loadPublishedOnce = useCallback(async () => {
    if (!userId) {
      setPublishedAll([]);
      setPublishedLoading(false);
      setPublishedReady(true);
      return;
    }
    if (publishedLoadedUserRef.current === userId) return;
    publishedLoadedUserRef.current = userId;
    setPublishedLoading(true);
    setPublishedVisible(PAGE_SIZE);
    setPublishedLoadingMore(false);
    try {
      const res = await fetchMyPlazaSubmissions();
      const approved = (res.items || [])
        .filter((x) => x.status === 'approved')
        .map(mapPublishedSubmission);
      setPublishedAll(approved);
    } catch {
      publishedLoadedUserRef.current = null;
      setPublishedAll([]);
    } finally {
      setPublishedLoading(false);
      setPublishedReady(true);
    }
  }, [userId]);

  const loadAssetsOnce = useCallback(async () => {
    if (!userId) {
      setAssets([]);
      setAssetsHasMore(false);
      setAssetsLoading(false);
      setAssetsReady(true);
      return;
    }
    if (assetsLoadedUserRef.current === userId) return;
    assetsLoadedUserRef.current = userId;
    const gen = ++assetsFetchGen.current;
    setAssetsLoading(true);
    setAssetsLoadingMore(false);
    try {
      const res = await listAssets({ page: 1, pageSize: ASSETS_PAGE_SIZE });
      if (gen !== assetsFetchGen.current) return;
      const media = (res.items || []).filter((a) =>
        isMediaAssetKind(String(a.kind || ''))
      );
      setAssets(media);
      setAssetsPage(res.page || 1);
      setAssetsHasMore(Boolean(res.hasMore));
    } catch {
      if (gen !== assetsFetchGen.current) return;
      assetsLoadedUserRef.current = null;
      setAssets([]);
      setAssetsHasMore(false);
      message.error(t('me.assetsLoadFail'));
    } finally {
      if (gen === assetsFetchGen.current) {
        setAssetsLoading(false);
        setAssetsReady(true);
      }
    }
  }, [userId, t]);

  // First enter「我的」(only mounted when nav=account) → 已发布 list.
  // Projects 页 (nav=mine) must never mount this component / call plaza/mine.
  useEffect(() => {
    void loadPublishedOnce();
  }, [userId, loadPublishedOnce]);

  const onProfileTabChange = (id: string) => {
    const next = id as ProfileTab;
    setTab(next);
    if (next === 'liked') void loadLikedOnce();
    else if (next === 'published') void loadPublishedOnce();
    else if (next === 'assets') void loadAssetsOnce();
  };

  const loadMoreLiked = useCallback(() => {
    if (!authed || !likedHasMore || likedLoading || likedLoadingMore) return;
    const nextPage = likedPage + 1;
    const gen = likedFetchGen.current;
    setLikedLoadingMore(true);
    async function loadMore() {
      try {
        const res = await fetchMyLiked({ page: nextPage, pageSize: PAGE_SIZE });
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
      } catch {
        if (gen === likedFetchGen.current) message.error(t('home.casesLoadFailed'));
      } finally {
        if (gen === likedFetchGen.current) setLikedLoadingMore(false);
      }
    }
    void loadMore();
  }, [authed, likedHasMore, likedLoading, likedLoadingMore, likedPage, t]);

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

  const loadMoreAssets = useCallback(() => {
    if (!userId || !assetsHasMore || assetsLoading || assetsLoadingMore) return;
    const nextPage = assetsPage + 1;
    const gen = assetsFetchGen.current;
    setAssetsLoadingMore(true);
    async function loadMore() {
      try {
        const res = await listAssets({ page: nextPage, pageSize: ASSETS_PAGE_SIZE });
        if (gen !== assetsFetchGen.current) return;
        const media = (res.items || []).filter((a) =>
          isMediaAssetKind(String(a.kind || ''))
        );
        setAssets((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...media.filter((x) => !seen.has(x.id))];
        });
        setAssetsPage(nextPage);
        setAssetsHasMore(Boolean(res.hasMore));
      } catch {
        if (gen === assetsFetchGen.current) message.error(t('me.assetsLoadFail'));
      } finally {
        if (gen === assetsFetchGen.current) setAssetsLoadingMore(false);
      }
    }
    void loadMore();
  }, [userId, assetsHasMore, assetsLoading, assetsLoadingMore, assetsPage, t]);

  const onDeleteAsset = async (asset: UserAsset) => {
    const id = String(asset.id || '').trim();
    if (!id || assetBusyId) return;
    setAssetBusyId(id);
    try {
      await deleteAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      if (assetPreview?.id === id) setAssetPreview(null);
      setAssetDeleteTarget(null);
      message.destructive(t('me.deleteAssetOk'));
    } catch {
      message.error(t('me.deleteAssetFail'));
    } finally {
      setAssetBusyId(null);
    }
  };

  const openAssetPreview = (asset: UserAsset) => {
    const url = String(asset.url || '').trim();
    if (!url && asset.kind !== 'audio') return;
    setAssetPreview(asset);
  };

  const listForPreview = tab === 'liked' ? liked : publishedAll;

  useEffect(() => {
    if (!previewId) return;
    if (docs[previewId] !== undefined) return;
    let cancelled = false;
    async function loadPreviewDoc() {
      try {
        const res = await fetchPlazaItem(previewId);
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
      } catch {
        if (!cancelled) {
          setDocs((prev) => (prev[previewId] !== undefined ? prev : { ...prev, [previewId]: null }));
        }
      }
    }
    void loadPreviewDoc();
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
      void (async () => {
        try {
          await recordPlazaUse(meta.id);
        } catch {
          /* ignore */
        }
      })();
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
    { id: 'assets', label: t('me.tabAssets') },
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
              <Icon name="home-profile-edit" className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="mt-8 flex w-full justify-start">
          <SegmentTabs
            size="md"
            tabs={profileTabs}
            value={tab}
            onChange={onProfileTabChange}
          />
        </div>

        <div className="mt-6 w-full">
          {tab === 'published' ? (
            <div role="tabpanel">
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
          ) : null}

          {tab === 'liked' ? (
            <div role="tabpanel">
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
          ) : null}

          {tab === 'assets' ? (
            <div role="tabpanel">
              {!userId ? (
                <EmptyState hint={t('plaza.needLogin')} />
              ) : (
                <InfiniteScrollSection
                  loading={assetsLoading}
                  loadingMore={assetsLoadingMore}
                  hasMore={assetsHasMore}
                  onLoadMore={loadMoreAssets}
                  isEmpty={assets.length === 0}
                  empty={<EmptyState hint={t('me.emptyAssets')} />}
                  gridClassName={ME_FLOW_COLUMNS}
                  skeleton={Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
                    <UserAssetCardSkeleton key={i} index={i} />
                  ))}
                >
                  {assets.map((asset) => (
                    <UserAssetCard
                      key={asset.id}
                      asset={asset}
                      locale={i18n.language || 'zh'}
                      deleteBusy={assetBusyId === asset.id}
                      onActivate={openAssetPreview}
                      onDelete={(a) => setAssetDeleteTarget(a)}
                    />
                  ))}
                </InfiniteScrollSection>
              )}
            </div>
          ) : null}
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

      <UserAssetMediaPreview
        asset={assetPreview}
        onClose={() => setAssetPreview(null)}
      />

      <Dialog
        show={Boolean(assetDeleteTarget)}
        onClose={() => {
          if (assetBusyId) return;
          setAssetDeleteTarget(null);
        }}
        width={400}
        title={t('me.deleteAssetConfirmTitle')}
        titleClassName="!text-[16px] !font-semibold !pb-2"
        className="!bg-[var(--surface)] !p-5"
        footer={
          <>
            <Button
              size="small"
              type="default"
              disabled={Boolean(assetBusyId)}
              onClick={() => setAssetDeleteTarget(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="small"
              type="primary"
              destructive
              disabled={Boolean(assetBusyId)}
              onClick={() => {
                if (assetDeleteTarget) void onDeleteAsset(assetDeleteTarget);
              }}
            >
              {t('me.deleteAsset')}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          {t('me.deleteAssetConfirmBody')}
        </p>
      </Dialog>

      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </main>
  );
}

export default memo(MePage);
