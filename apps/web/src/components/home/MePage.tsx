import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiHeart } from 'react-icons/hi2';
import EditProfileDialog from '@/components/home/EditProfileDialog';
import EmptyState from '@/components/home/EmptyState';
import PlazaCoverThumb from '@/components/home/PlazaCoverThumb';
import SegmentTabs from '@/components/home/SegmentTabs';
import { UserAvatar } from '@/components/layout/UserAccountPanel';
import { useGoEditor } from '@/utils/goEditor';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { useInfiniteList } from '@/utils/useInfiniteList';
import { fetchMyLiked, syncMyLiked } from '@/apis/me';
import { fetchMyPlazaSubmissions, fetchPlazaItem } from '@/apis/plaza';
import { resolveCaseTitle, normalizeCaseCategory, type OfficialCaseMeta } from '@/utils/officialCases';
import { clearLikedCases, loadLikedCases, type LikedCaseItem } from '@/utils/likedCases';
import { store } from '@/store';
import { importDocument } from '@/store/modules/editor';
import { message } from '@/components/base';
import { ProjectCardSkeleton } from '@/components/templates/TemplateGrid';
import { getToken } from '@/utils/token';

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

function EmptyBlock({ hint }: { hint: string }) {
  return <EmptyState hint={hint} />;
}

const PAGE_SIZE = 20;
const GRID =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';

/** 「我的」页：资料区 + 已发布 / 我的喜欢。 */
export default function MePage(): ReactNode {
  const { t } = useTranslation();
  const user = useSelector((s: any) => s.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const goEditor = useGoEditor();
  const [tab, setTab] = useState<ProfileTab>('published');
  const [editOpen, setEditOpen] = useState(false);
  const [liked, setLiked] = useState<LikedCaseItem[]>([]);
  const [openingLikedId, setOpeningLikedId] = useState<string | null>(null);
  const [likedLoading, setLikedLoading] = useState(false);
  const [published, setPublished] = useState<OfficialCaseMeta[]>([]);
  const [openingPublishedId, setOpeningPublishedId] = useState<string | null>(null);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const likedMigratedRef = useRef(false);

  const displayName = user?.name || user?.email?.split('@')[0] || t('home.account');
  const userId = user?.id as string | undefined;
  const authed = Boolean(userId && getToken());

  useEffect(() => {
    if (tab !== 'liked') return;
    if (!authed || !userId) {
      setLiked([]);
      setLikedLoading(false);
      return;
    }
    let cancelled = false;
    setLikedLoading(true);
    void (async () => {
      try {
        if (!likedMigratedRef.current) {
          const local = loadLikedCases(userId);
          if (local.length) {
            await syncMyLiked(local.map((x) => x.id));
            clearLikedCases(userId);
          }
          likedMigratedRef.current = true;
        }
        const all: LikedCaseItem[] = [];
        let page = 1;
        for (;;) {
          const res = await fetchMyLiked(page, 50);
          if (cancelled) return;
          for (const x of res.items || []) {
            all.push({
              id: x.id,
              name: x.title || '',
              category: normalizeCaseCategory(x.category),
              source: 'plaza',
              authorName: x.authorName,
              authorAvatar: x.authorAvatar,
              coverDocument: x.coverDocument ?? null,
              authorUserId: x.userId,
              createdAt: x.createdAt,
              likedAt: x.likedAt || Date.now(),
            });
          }
          if (!res.hasMore || page >= 20) break;
          page += 1;
        }
        if (cancelled) return;
        setLiked(all);
      } catch {
        if (!cancelled) {
          setLiked([]);
          message.error(t('home.casesLoadFailed'));
        }
      } finally {
        if (!cancelled) setLikedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, authed, userId, t]);

  useEffect(() => {
    if (tab !== 'published' || !userId) {
      if (tab === 'published' && !userId) setPublished([]);
      return;
    }
    let cancelled = false;
    setPublishedLoading(true);
    void fetchMyPlazaSubmissions()
      .then((res) => {
        if (cancelled) return;
        const approved = (res.items || [])
          .filter((x) => x.status === 'approved')
          .map(
            (x): OfficialCaseMeta => ({
              id: x.id,
              name: x.title,
              category: normalizeCaseCategory(x.category),
              source: 'plaza',
              authorName: x.authorName,
              authorAvatar: x.authorAvatar,
              coverDocument: x.coverDocument ?? null,
              createdAt: x.createdAt,
            })
          );
        setPublished(approved);
      })
      .catch(() => {
        if (!cancelled) setPublished([]);
      })
      .finally(() => {
        if (!cancelled) setPublishedLoading(false);
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

  const openLiked = async (item: LikedCaseItem) => {
    if (openingLikedId) return;
    setOpeningLikedId(item.id);
    try {
      const document = (await fetchPlazaItem(item.id)).item.document;
      const name = resolveCaseTitle(item, t);
      dispatch(
        importDocument({
          name,
          document,
          source: 'case',
          originCaseId: item.id,
        })
      );
      goEditor({ projectId: (store.getState() as any).editor.currentId });
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
      const document = (await fetchPlazaItem(item.id)).item.document;
      dispatch(
        importDocument({
          name: resolveCaseTitle(item, t),
          document,
          source: 'case',
          originCaseId: item.id,
        })
      );
      goEditor({ projectId: (store.getState() as any).editor.currentId });
    } catch {
      message.error(t('home.casesOpenFailed'));
    } finally {
      setOpeningPublishedId(null);
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
    <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
      <div className="mx-auto w-full min-w-0 max-w-[1700px] px-[60px] pb-10 pt-6">
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
          <SegmentTabs
            tabs={profileTabs}
            value={tab}
            onChange={(id) => setTab(id as ProfileTab)}
          />
        </div>

        <div className="mt-6">
          {tab === 'published' ? (
            !userId ? (
              <EmptyBlock hint={t('plaza.needLogin')} />
            ) : publishedLoading ? (
              <div className={GRID}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <ProjectCardSkeleton key={`pub-sk-${i}`} />
                ))}
              </div>
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
                      <PlazaCoverThumb coverDocument={c.coverDocument} />
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
            ) : likedLoading ? (
              <div className={GRID}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <ProjectCardSkeleton key={`liked-sk-${i}`} />
                ))}
              </div>
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
                      <PlazaCoverThumb coverDocument={c.coverDocument}>
                        <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[#e11d48] shadow-sm ring-1 ring-[var(--line)]">
                          <HiHeart className="h-3.5 w-3.5 fill-current" aria-hidden />
                        </span>
                      </PlazaCoverThumb>
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
        </div>
      </div>
      <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} />
    </main>
  );
}
