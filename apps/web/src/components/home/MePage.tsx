import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiHeart,
  HiOutlineClock,
  HiOutlinePhoto,
} from 'react-icons/hi2';
import EditProfileDialog from '@/components/home/EditProfileDialog';
import LazyTemplateThumb from '@/components/home/LazyTemplateThumb';
import { projectThumbFrameClass } from '@/components/home/projectThumb';
import SegmentTabs from '@/components/home/SegmentTabs';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import { useGoEditor } from '@/hooks/useGoEditor';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { fetchMyPlazaSubmissions, fetchPlazaItem } from '@/apis/plaza';
import {
  loadOfficialCaseDocument,
  resolveCaseTitle,
  type OfficialCaseMeta,
} from '@/cases/officialCases';
import { loadLikedCases, type LikedCaseItem } from '@/store/likedCases';
import { isOwnedTemplate } from '@/store/templatesStorage';
import { importDocument, openTemplate } from '@/store/modules/editor';
import { message } from '@/components/base';

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

type ProfileTab = 'published' | 'liked' | 'assets';

type AssetItem = {
  id: string;
  name: string;
  kind: 'canvas' | 'image';
  updatedAt: number;
  document?: any;
  thumbUrl?: string;
};

function dateGroupLabel(ts: number, locale: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(d);
  } catch {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
}

function EmptyBlock({ hint }: { hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-[var(--muted)]">
      <HiOutlineClock className="mb-3 h-8 w-8 opacity-50" strokeWidth={1.25} />
      <p className="text-[13px]">{hint}</p>
    </div>
  );
}

function AssetCard({
  item,
  onOpen,
}: {
  item: AssetItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col text-left"
    >
      {item.kind === 'canvas' && item.document ? (
        <LazyTemplateThumb document={item.document} />
      ) : item.thumbUrl ? (
        <div className={projectThumbFrameClass('bg-[var(--accent-soft)]')}>
          <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className={projectThumbFrameClass('bg-[var(--accent-soft)]')}>
          <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
            <HiOutlinePhoto className="h-8 w-8 opacity-40" />
          </div>
        </div>
      )}
      <div className="mt-2 min-w-0 px-0.5">
        <div className="truncate text-[13px] font-medium text-[var(--ink)]">{item.name}</div>
      </div>
    </button>
  );
}

const PAGE_SIZE = 20;
const GRID =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

/**
 * 「我的」页：左对齐头像资料区 + 项目自有 Segment tabs + 日期分组资产列表。
 */
export default function MePage(): ReactNode {
  const { t, i18n } = useTranslation();
  const user = useSelector((s: any) => s.auth.user);
  const templates = useSelector((s: any) => s.editor.templates) as any[];
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const goEditor = useGoEditor();
  const [tab, setTab] = useState<ProfileTab>('assets');
  const [editOpen, setEditOpen] = useState(false);
  const [liked, setLiked] = useState<LikedCaseItem[]>([]);
  const [likedDocs, setLikedDocs] = useState<Record<string, unknown>>({});
  const [openingLikedId, setOpeningLikedId] = useState<string | null>(null);
  const [published, setPublished] = useState<OfficialCaseMeta[]>([]);
  const [publishedDocs, setPublishedDocs] = useState<Record<string, unknown>>({});
  const [openingPublishedId, setOpeningPublishedId] = useState<string | null>(null);

  const locale = i18n.resolvedLanguage || i18n.language || 'zh-CN';
  const displayName = user?.name || user?.email?.split('@')[0] || t('home.account');
  const userId = user?.id as string | undefined;

  useEffect(() => {
    if (tab !== 'liked') return;
    setLiked(loadLikedCases(userId));
    setLikedDocs({});
  }, [tab, userId]);

  useEffect(() => {
    if (tab !== 'published' || !userId) {
      if (tab === 'published' && !userId) setPublished([]);
      return;
    }
    let cancelled = false;
    void fetchMyPlazaSubmissions()
      .then((res) => {
        if (cancelled) return;
        const approved = (res.items || [])
          .filter((x) => x.status === 'approved')
          .map(
            (x): OfficialCaseMeta => ({
              id: x.id,
              name: x.title,
              category: (x.category as OfficialCaseMeta['category']) || 'resume',
              source: 'plaza',
              authorName: x.authorName,
              authorAvatar: x.authorAvatar,
              createdAt: x.createdAt,
            })
          );
        setPublished(approved);
        setPublishedDocs({});
      })
      .catch(() => {
        if (!cancelled) setPublished([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, userId]);

  const {
    visible: visiblePublished,
    hasMore: hasMorePublished,
    sentinelRef: publishedSentinel,
  } = useInfiniteList(published, { pageSize: PAGE_SIZE, resetKey: `pub-${userId}` });

  const {
    visible: visibleLiked,
    hasMore: hasMoreLiked,
    sentinelRef: likedSentinel,
  } = useInfiniteList(liked, { pageSize: PAGE_SIZE, resetKey: `liked-${userId}` });

  // Hydrate docs only for revealed published cards.
  useEffect(() => {
    if (tab !== 'published') return;
    let cancelled = false;
    const missing = visiblePublished.filter((c) => publishedDocs[c.id] === undefined);
    if (!missing.length) return undefined;
    void Promise.all(
      missing.map(async (c) => {
        try {
          const item = await fetchPlazaItem(c.id);
          return [c.id, item.item.document] as const;
        } catch {
          return [c.id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setPublishedDocs((prev) => {
        const next = { ...prev };
        for (const [id, doc] of entries) {
          if (next[id] === undefined) next[id] = doc;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, visiblePublished.map((c) => c.id).join(',')]);

  // Hydrate docs only for revealed liked cards.
  useEffect(() => {
    if (tab !== 'liked') return;
    let cancelled = false;
    const missing = visibleLiked.filter((c) => likedDocs[c.id] === undefined);
    if (!missing.length) return undefined;
    void Promise.all(
      missing.map(async (c) => {
        try {
          if (c.source === 'plaza' || !c.file) {
            const res = await fetchPlazaItem(c.id);
            return [c.id, res.item.document] as const;
          }
          const doc = await loadOfficialCaseDocument(c.file);
          return [c.id, doc] as const;
        } catch {
          return [c.id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setLikedDocs((prev) => {
        const next = { ...prev };
        for (const [id, doc] of entries) {
          if (next[id] === undefined) next[id] = doc;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, visibleLiked.map((c) => c.id).join(',')]);

  const openLiked = async (item: LikedCaseItem) => {
    if (openingLikedId) return;
    setOpeningLikedId(item.id);
    try {
      let document = likedDocs[item.id];
      if (!document) {
        if (item.source === 'plaza' || !item.file) {
          document = (await fetchPlazaItem(item.id)).item.document;
        } else {
          document = await loadOfficialCaseDocument(item.file);
        }
      }
      const name = resolveCaseTitle(item, t);
      dispatch(
        importDocument({
          name,
          document,
          source: 'case',
          originCaseId: item.id,
        })
      );
      goEditor();
    } catch {
      message.error(t('home.casesOpenFailed'));
    } finally {
      setOpeningLikedId(null);
    }
  };

  const openPublished = async (item: OfficialCaseMeta) => {
    if (openingPublishedId) return;
    setOpeningPublishedId(item.id);
    try {
      const document =
        publishedDocs[item.id] || (await fetchPlazaItem(item.id)).item.document;
      dispatch(
        importDocument({
          name: resolveCaseTitle(item, t),
          document,
          source: 'case',
          originCaseId: item.id,
        })
      );
      goEditor();
    } catch {
      message.error(t('home.casesOpenFailed'));
    } finally {
      setOpeningPublishedId(null);
    }
  };

  const openProfile = () => {
    if (!user) {
      navigate('/login', { state: { from: '/home' } });
      return;
    }
    setEditOpen(true);
  };

  const assets = useMemo(() => {
    const list: AssetItem[] = (templates || [])
      .filter((item) => isOwnedTemplate(item))
      .map((item) => ({
        id: String(item.id),
        name: item.name || t('home.untitled'),
        kind: 'canvas' as const,
        updatedAt: Number(item.updatedAt || item.openedAt || Date.now()),
        document: item.document,
      }));
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [templates, t]);

  // Flat infinite list for assets (preserve date group headers for visible window).
  const {
    visible: visibleAssets,
    hasMore: hasMoreAssets,
    sentinelRef: assetsSentinel,
  } = useInfiniteList(assets, { pageSize: PAGE_SIZE, resetKey: `assets-${assets.length}` });

  const assetCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of assets) {
      const key = dateGroupLabel(item.updatedAt, locale) || t('me.unknownDate');
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [assets, locale, t]);

  const groupedVisible = useMemo(() => {
    const map = new Map<string, AssetItem[]>();
    for (const item of visibleAssets) {
      const key = dateGroupLabel(item.updatedAt, locale) || t('me.unknownDate');
      const bucket = map.get(key) || [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return Array.from(map.entries());
  }, [visibleAssets, locale, t]);

  const profileTabs: { id: ProfileTab; label: string }[] = [
    { id: 'published', label: t('me.tabPublished') },
    { id: 'liked', label: t('me.tabLiked') },
    { id: 'assets', label: t('me.tabAssets') },
  ];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1700px] px-[60px] pb-10 pt-6">
        <header className="flex items-center gap-4">
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
          <div className="flex min-w-0 items-center gap-2">
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

        <div className="mt-8">
          <SegmentTabs tabs={profileTabs} value={tab} onChange={setTab} />
        </div>

        <div className="mt-6">
          {tab === 'published' ? (
            !userId ? (
              <EmptyBlock hint={t('plaza.needLogin')} />
            ) : published.length === 0 ? (
              <EmptyBlock hint={t('me.emptyPublished')} />
            ) : (
              <>
                <div className={GRID}>
                  {visiblePublished.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={openingPublishedId === c.id}
                      onClick={() => void openPublished(c)}
                      className="group flex w-full flex-col text-left disabled:opacity-60"
                    >
                      <LazyTemplateThumb document={publishedDocs[c.id]} fit="cover" />
                      <div className="mt-2 truncate px-0.5 text-[13px] font-medium text-[var(--ink)]">
                        {resolveCaseTitle(c, t)}
                      </div>
                    </button>
                  ))}
                </div>
                {hasMorePublished ? (
                  <div ref={publishedSentinel} className="h-8 w-full" aria-hidden />
                ) : null}
              </>
            )
          ) : null}

          {tab === 'liked' ? (
            !userId ? (
              <EmptyBlock hint={t('home.cases.likeNeedLogin')} />
            ) : liked.length === 0 ? (
              <EmptyBlock hint={t('me.emptyLiked')} />
            ) : (
              <>
                <div className={GRID}>
                  {visibleLiked.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={openingLikedId === c.id}
                      onClick={() => void openLiked(c)}
                      className="group flex w-full flex-col text-left disabled:opacity-60"
                    >
                      <LazyTemplateThumb document={likedDocs[c.id]} fit="cover">
                        <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[#e11d48] shadow-sm ring-1 ring-[var(--line)]">
                          <HiHeart className="h-3.5 w-3.5 fill-current" aria-hidden />
                        </span>
                      </LazyTemplateThumb>
                      <div className="mt-2 truncate px-0.5 text-[13px] font-medium text-[var(--ink)]">
                        {resolveCaseTitle(c, t)}
                      </div>
                    </button>
                  ))}
                </div>
                {hasMoreLiked ? (
                  <div ref={likedSentinel} className="h-8 w-full" aria-hidden />
                ) : null}
              </>
            )
          ) : null}

          {tab === 'assets' ? (
            <div className="space-y-8">
              {assets.length === 0 ? (
                <EmptyBlock hint={t('me.emptyAssets')} />
              ) : (
                <>
                  {groupedVisible.map(([dateLabel, items]) => (
                    <section key={dateLabel}>
                      <div className="mb-3 flex items-end justify-between gap-3">
                        <h2 className="text-[15px] font-semibold text-[var(--ink)]">{dateLabel}</h2>
                        <span className="text-[12px] text-[var(--muted)]">
                          {t('me.assetCount', {
                            count: assetCountByDate.get(dateLabel) || items.length,
                          })}
                        </span>
                      </div>
                      <div className={GRID}>
                        {items.map((item) => (
                          <AssetCard
                            key={item.id}
                            item={item}
                            onOpen={() => {
                              if (item.kind !== 'canvas') return;
                              // Defer heavy editor mount so the click feels instant.
                              requestAnimationFrame(() => {
                                dispatch(openTemplate(item.id));
                                goEditor();
                              });
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                  {hasMoreAssets ? (
                    <div ref={assetsSentinel} className="h-8 w-full" aria-hidden />
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </main>
  );
}
