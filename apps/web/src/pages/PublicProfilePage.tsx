import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiArrowLeft } from 'react-icons/hi2';
import { fetchPublicUser } from '@/apis/auth';
import { fetchPlazaFeed } from '@/apis/plaza';
import {
  resolveCaseTitle,
  normalizeCaseCategory,
  type OfficialCaseMeta,
} from '@/utils/officialCases';
import PlazaCoverThumb from '@/components/home/PlazaCoverThumb';
import EmptyState from '@/components/home/EmptyState';
import { projectThumbFrameClass } from '@/utils/projectThumb';
import { cn } from '@/utils/classnames';
import { useInfiniteList } from '@/utils/useInfiniteList';

function feedToMeta(item: {
  id: string;
  userId?: string;
  title: string;
  category: string;
  authorName: string;
  authorAvatar?: string | null;
  coverDocument?: unknown | null;
  createdAt: number;
}): OfficialCaseMeta {
  return {
    id: item.id,
    name: item.title,
    category: normalizeCaseCategory(item.category),
    source: 'plaza',
    authorName: item.authorName,
    authorAvatar: item.authorAvatar,
    coverDocument: item.coverDocument ?? null,
    authorUserId: item.userId,
    createdAt: item.createdAt,
  };
}

const PAGE_SIZE = 20;

/** Public creator profile — published plaza works. */
export default function PublicProfilePage(): ReactNode {
  const { userId: rawId } = useParams<{ userId: string }>();
  const authorId = decodeURIComponent(rawId || '');
  const { t } = useTranslation();
  const location = useLocation();
  const state = (location.state || {}) as {
    authorName?: string;
    authorAvatar?: string | null;
  };

  const [works, setWorks] = useState<OfficialCaseMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(state.authorName || '');
  const [avatar, setAvatar] = useState<string | null>(state.authorAvatar || null);

  const isOfficial = authorId === 'official:recombyn' || authorId === 'user_official';

  useEffect(() => {
    const nextState = (location.state || {}) as {
      authorName?: string;
      authorAvatar?: string | null;
    };
    setDisplayName(nextState.authorName || '');
    setAvatar(nextState.authorAvatar || null);
    setWorks([]);
  }, [authorId, location.state]);

  useEffect(() => {
    if (!authorId) return;
    let cancelled = false;
    void fetchPublicUser(authorId)
      .then((res) => {
        if (cancelled || !res.user) return;
        setDisplayName((prev) => res.user.name || prev);
        setAvatar(res.user.avatar ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  useEffect(() => {
    if (!authorId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const isOfficialProfile =
          authorId === 'official:recombyn' || authorId === 'user_official';
        const authorIds = isOfficialProfile
          ? ['user_official']
          : [authorId.replace(/^plaza:/, '')];

        const all: OfficialCaseMeta[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && !cancelled && page <= 10) {
          const feed = await fetchPlazaFeed({
            page,
            pageSize: PAGE_SIZE,
            tab: 'latest',
            authorIds,
          });
          all.push(...(feed.items || []).map(feedToMeta));
          hasMore = Boolean(feed.hasMore);
          page += 1;
        }
        if (cancelled) return;

        setWorks(all);

        const navState = (location.state || {}) as {
          authorName?: string;
          authorAvatar?: string | null;
        };
        if (all[0]) {
          setDisplayName(all[0].authorName || navState.authorName || authorId);
          setAvatar(all[0].authorAvatar || navState.authorAvatar || null);
        } else {
          setDisplayName(
            isOfficial ? t('home.cases.author') : navState.authorName || authorId
          );
          setAvatar(navState.authorAvatar || '/logo-mark.png');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId, t]);

  const { visible, hasMore, sentinelRef } = useInfiniteList(works, {
    pageSize: PAGE_SIZE,
    resetKey: authorId,
  });

  const initial = useMemo(
    () => ((displayName || 'U').trim()[0] || 'U').toUpperCase(),
    [displayName]
  );

  return (
    <main className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1100px] px-6 pb-12 pt-6 sm:px-10">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        >
          <HiArrowLeft className="h-4 w-4" />
          {t('home.cases.backPlaza')}
        </Link>

        <header className="mt-8 flex flex-wrap items-center gap-4">
          <div
            className={cn(
              'flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-[var(--line)]',
              avatar && /\/logo(-mark|192|512)?\.png/i.test(avatar.split('?')[0] || '')
                ? 'bg-white dark:bg-white'
                : 'bg-[var(--ink)] text-[18px] font-bold text-[var(--on-brand)]'
            )}
          >
            {avatar ? (
              <img
                src={
                  /\/logo(-mark|192|512)?\.png/i.test(avatar.split('?')[0] || '')
                    ? '/logo-mark.png'
                    : avatar
                }
                alt=""
                className={
                  /\/logo(-mark|192|512)?\.png/i.test(avatar.split('?')[0] || '')
                    ? 'h-[86%] w-[86%] object-contain'
                    : 'h-full w-full object-cover'
                }
              />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] font-semibold tracking-tight text-[var(--ink)]">
              {displayName || t('home.cases.author')}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              {t('home.cases.profileWorks', { count: works.length })}
            </p>
          </div>
        </header>

        <section className="mt-10">
          <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink)]">
            {t('me.tabPublished')}
          </h2>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={projectThumbFrameClass('skeleton-bone shadow-none')}
                />
              ))}
            </div>
          ) : works.length === 0 ? (
            <EmptyState hint={t('home.cases.profileEmpty')} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {visible.map((c) => (
                  <div key={c.id} className="flex flex-col">
                    <PlazaCoverThumb coverDocument={c.coverDocument} />
                    <div className="mt-2 truncate px-0.5 text-[13px] font-medium text-[var(--ink)]">
                      {resolveCaseTitle(c, t)}
                    </div>
                  </div>
                ))}
              </div>
              {hasMore ? <div ref={sentinelRef} className="h-8 w-full" aria-hidden /> : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
