import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiArrowLeft, HiCheck, HiPlus } from 'react-icons/hi2';
import { fetchPlazaFeed, fetchPlazaItem } from '@/apis/plaza';
import {
  caseAuthorId,
  loadOfficialCaseDocument,
  loadOfficialCasesIndex,
  resolveCaseTitle,
  type OfficialCaseCategory,
  type OfficialCaseMeta,
} from '@/cases/officialCases';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import { projectThumbFrameClass } from '@/components/home/projectThumb';
import {
  isFollowingUser,
  loadFollowedUsers,
  toggleFollowUser,
} from '@/store/followedUsers';
import { cn } from '@/utils/classnames';
import { message } from '@/components/base';

function feedToMeta(item: {
  id: string;
  userId?: string;
  title: string;
  category: string;
  authorName: string;
  authorAvatar?: string | null;
  createdAt: number;
}): OfficialCaseMeta {
  const cat = item.category as OfficialCaseCategory;
  return {
    id: item.id,
    name: item.title,
    category: cat === 'poster' || cat === 'ui' ? cat : 'resume',
    source: 'plaza',
    authorName: item.authorName,
    authorAvatar: item.authorAvatar,
    authorUserId: item.userId,
    createdAt: item.createdAt,
  };
}

/**
 * Public creator profile — published plaza works + follow.
 */
export default function PublicProfilePage(): ReactNode {
  const { userId: rawId } = useParams<{ userId: string }>();
  const authorId = decodeURIComponent(rawId || '');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerId = useSelector((s: any) => s.auth?.user?.id as string | undefined);
  const state = (location.state || {}) as {
    authorName?: string;
    authorAvatar?: string | null;
  };

  const [works, setWorks] = useState<OfficialCaseMeta[]>([]);
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [displayName, setDisplayName] = useState(state.authorName || '');
  const [avatar, setAvatar] = useState<string | null>(state.authorAvatar || null);

  const isSelf = Boolean(viewerId && viewerId === authorId);
  const isOfficial = authorId === 'official:recombyn';

  useEffect(() => {
    setFollowing(isFollowingUser(authorId, viewerId));
  }, [authorId, viewerId]);

  // Reset identity when navigating between creators on the same route.
  useEffect(() => {
    const nextState = (location.state || {}) as {
      authorName?: string;
      authorAvatar?: string | null;
    };
    setDisplayName(nextState.authorName || '');
    setAvatar(nextState.authorAvatar || null);
    setWorks([]);
    setDocs({});
  }, [authorId, location.state]);

  useEffect(() => {
    if (!authorId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [index, feed] = await Promise.all([
          loadOfficialCasesIndex().catch(() => ({ cases: [] as OfficialCaseMeta[] })),
          fetchPlazaFeed(120).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;

        const community = (feed.items || []).map(feedToMeta);
        const official = (index.cases || []).map((c) => ({
          ...c,
          source: (c.source || 'official') as 'official',
          authorUserId: 'official:recombyn',
          authorName: c.authorName || t('home.cases.author'),
        }));

        const pool = [...official, ...community];
        const matched = pool.filter((c) => caseAuthorId(c) === authorId);
        setWorks(matched);

        const navState = (location.state || {}) as {
          authorName?: string;
          authorAvatar?: string | null;
        };
        if (matched[0]) {
          setDisplayName(matched[0].authorName || navState.authorName || authorId);
          setAvatar(matched[0].authorAvatar || navState.authorAvatar || null);
        } else {
          setDisplayName(
            isOfficial ? t('home.cases.author') : navState.authorName || authorId
          );
          setAvatar(navState.authorAvatar || null);
        }

        const entries = await Promise.all(
          matched.map(async (c) => {
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
        );
        if (cancelled) return;
        const map: Record<string, unknown> = {};
        for (const [id, doc] of entries) {
          if (doc) map[id] = doc;
        }
        setDocs(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId, t]);

  const initial = useMemo(
    () => ((displayName || 'U').trim()[0] || 'U').toUpperCase(),
    [displayName]
  );

  const onToggleFollow = () => {
    if (!viewerId) {
      message.warning(t('home.cases.followUserNeedLogin'));
      navigate('/login', { state: { from: `/u/${encodeURIComponent(authorId)}` } });
      return;
    }
    if (isSelf) return;
    const { following: next } = toggleFollowUser(
      { id: authorId, name: displayName || authorId, avatar },
      viewerId
    );
    setFollowing(next);
    message.success(next ? t('home.cases.followedToast') : t('home.cases.unfollowedToast'));
    // Keep list in sync for other tabs
    void loadFollowedUsers(viewerId);
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1100px] px-6 pb-12 pt-6 sm:px-10">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
        >
          <HiArrowLeft className="h-4 w-4" />
          {t('home.cases.backPlaza')}
        </Link>

        <header className="mt-8 flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--ink)] text-[18px] font-bold text-[var(--on-brand)] ring-1 ring-[var(--line)]">
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
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
          {!isSelf ? (
            <button
              type="button"
              onClick={onToggleFollow}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition',
                following
                  ? 'bg-[var(--canvas)] text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--accent-soft)]'
                  : 'bg-[var(--ink)] text-[var(--on-brand)] hover:opacity-90'
              )}
            >
              {following ? (
                <>
                  <HiCheck className="h-4 w-4" />
                  {t('home.cases.unfollowUser')}
                </>
              ) : (
                <>
                  <HiPlus className="h-4 w-4" />
                  {t('home.cases.followUser')}
                </>
              )}
            </button>
          ) : null}
        </header>

        <section className="mt-10">
          <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink)]">
            {t('me.tabPublished')}
          </h2>
          {loading ? (
            <p className="py-16 text-center text-[13px] text-[var(--muted)]">…</p>
          ) : works.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-[var(--muted)]">
              {t('home.cases.profileEmpty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {works.map((c) => (
                <div key={c.id} className="flex flex-col">
                  <div className={projectThumbFrameClass('bg-[var(--accent-soft)]')}>
                    {docs[c.id] ? (
                      <TemplateThumbnail document={docs[c.id]} fit="cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[12px] text-[var(--muted)]">
                        —
                      </div>
                    )}
                  </div>
                  <div className="mt-2 truncate px-0.5 text-[13px] font-medium text-[var(--ink)]">
                    {resolveCaseTitle(c, t)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
