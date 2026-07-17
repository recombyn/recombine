import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiHeart, HiOutlineChatBubbleOvalLeft } from 'react-icons/hi2';
import { fetchPlazaFeed, fetchPlazaItem } from '@/apis/plaza';
import {
  caseAuthorId,
  caseAuthorLabel,
  loadOfficialCaseDocument,
  loadOfficialCasesIndex,
  resolveCaseTitle,
  type OfficialCaseCategory,
  type OfficialCaseMeta,
} from '@/cases/officialCases';
import InspirationCasePreview from '@/components/home/InspirationCasePreview';
import { projectThumbFrameClass } from '@/components/home/projectThumb';
import SegmentTabs from '@/components/home/SegmentTabs';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import {
  formatStatCount,
  isCaseLiked,
  loadLikedCases,
  seedStat,
  toggleLikedCase,
} from '@/store/likedCases';
import { loadFollowedUsers } from '@/store/followedUsers';
import { cn } from '@/utils/classnames';
import { message } from '@/components/base';

type Props = {
  onOpenCase: (meta: OfficialCaseMeta, document: unknown) => void;
  disabled?: boolean;
};

type PlazaTab = 'recommended' | 'latest' | 'following';

const TABS: PlazaTab[] = ['recommended', 'latest', 'following'];

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

async function loadCaseDocument(
  meta: OfficialCaseMeta,
  cache: Record<string, unknown>
): Promise<unknown> {
  if (cache[meta.id]) return cache[meta.id];
  if (meta.source === 'plaza' || !meta.file) {
    const res = await fetchPlazaItem(meta.id);
    return res.item.document;
  }
  return loadOfficialCaseDocument(meta.file);
}

export default function InspirationSection({ onOpenCase, disabled }: Props): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useSelector((s: any) => s.auth?.user);
  const userId = user?.id as string | undefined;
  const [tab, setTab] = useState<PlazaTab>('recommended');
  const [cases, setCases] = useState<OfficialCaseMeta[]>([]);
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [followedAuthorIds, setFollowedAuthorIds] = useState<Set<string>>(() => new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewRail, setPreviewRail] = useState<OfficialCaseMeta[]>([]);

  useEffect(() => {
    setLikedIds(new Set(loadLikedCases(userId).map((x) => x.id)));
    setFollowedAuthorIds(new Set(loadFollowedUsers(userId).map((x) => x.id)));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadOfficialCasesIndex().catch(() => ({ cases: [] as OfficialCaseMeta[] })),
      fetchPlazaFeed(100).catch(() => ({ items: [] })),
    ])
      .then(async ([index, feed]) => {
        if (cancelled) return;
        const official = (index.cases || []).map((c) => ({
          ...c,
          source: (c.source || 'official') as 'official',
          authorUserId: 'official:recombyn',
          authorName: c.authorName || undefined,
        }));
        const community = (feed.items || []).map(feedToMeta);
        // Recommended: official first, then approved user posts
        const merged = [...official, ...community];
        setCases(merged);

        const entries = await Promise.all(
          merged.map(async (c) => {
            try {
              const doc = await loadCaseDocument(c, {});
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
      })
      .catch(() => {
        if (!cancelled) message.error(t('home.casesLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const visible = useMemo(() => {
    if (tab === 'following') {
      return cases.filter((c) => followedAuthorIds.has(caseAuthorId(c)));
    }
    if (tab === 'latest') {
      return [...cases].sort((a, b) => {
        const ta = a.createdAt || 0;
        const tb = b.createdAt || 0;
        if (ta || tb) return tb - ta;
        return 0;
      });
    }
    return cases;
  }, [cases, tab, followedAuthorIds]);

  const previewMeta = useMemo(
    () => (previewId ? cases.find((c) => c.id === previewId) || null : null),
    [cases, previewId]
  );

  const openPreview = (meta: OfficialCaseMeta) => {
    if (disabled) return;
    // Freeze the rail at open so unfollowing mid-preview doesn't empty navigation.
    setPreviewRail(visible.length ? visible : cases);
    setPreviewId(meta.id);
  };

  const remix = async (meta: OfficialCaseMeta) => {
    if (disabled || openingId) return;
    setOpeningId(meta.id);
    try {
      const document = docs[meta.id] || (await loadCaseDocument(meta, docs));
      onOpenCase(meta, document);
    } catch {
      message.error(t('home.casesOpenFailed'));
    } finally {
      setOpeningId(null);
    }
  };

  const onToggleLike = (meta: OfficialCaseMeta, e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!userId) {
      message.warning(t('home.cases.likeNeedLogin'));
      navigate('/login', { state: { from: '/home' } });
      return;
    }
    const { liked, list } = toggleLikedCase(meta, userId);
    setLikedIds(new Set(list.map((x) => x.id)));
    message.success(liked ? t('home.cases.likedToast') : t('home.cases.unlikedToast'));
  };

  const onTabClick = (next: PlazaTab) => {
    if (next === 'following' && !userId) {
      message.warning(t('home.cases.followNeedLogin'));
      navigate('/login', { state: { from: '/home' } });
      return;
    }
    if (next === 'following') {
      setFollowedAuthorIds(new Set(loadFollowedUsers(userId).map((x) => x.id)));
    }
    setTab(next);
  };

  const gridClass =
    'grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  return (
    <section>
      <h2 className="mb-3 text-[16px] font-semibold tracking-tight text-[var(--ink)]">
        {t('home.cases.title')}
      </h2>

      <SegmentTabs
        className="mb-5"
        aria-label={t('home.cases.title')}
        tabs={TABS.map((id) => ({ id, label: t(`home.cases.tab.${id}`) }))}
        value={tab}
        onChange={onTabClick}
      />

      {loading ? (
        <div className={gridClass}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i}>
              <div className={projectThumbFrameClass('animate-pulse bg-[var(--accent-soft)] shadow-none')} />
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--accent-soft)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--accent-soft)]" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--accent-soft)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[12px] bg-[var(--canvas)] px-4 py-16 text-center text-[13px] text-[var(--muted)]">
          {tab === 'following' ? t('home.cases.emptyFollowing') : t('home.cases.empty')}
        </div>
      ) : (
        <div className={gridClass}>
          {visible.map((c) => {
            const liked = likedIds.has(c.id) || isCaseLiked(c.id, userId);
            const likes = seedStat(c.id, 40, 900) + (liked ? 1 : 0);
            const comments = seedStat(c.id + ':c', 20, 800);
            const title = resolveCaseTitle(c, t);
            const author = caseAuthorLabel(c, t);
            const initial = (author[0] || 'R').toUpperCase();
            return (
              <article key={c.id} className="group min-w-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => openPreview(c)}
                  className={projectThumbFrameClass(
                    'block text-left disabled:opacity-60'
                  )}
                >
                  {docs[c.id] ? (
                    <TemplateThumbnail document={docs[c.id]} fit="cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--accent-soft)] text-[12px] text-[var(--muted)]">
                      —
                    </div>
                  )}
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
                      {c.source === 'plaza' ? initial : 'RY'}
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
                      onClick={(e) => onToggleLike(c, e)}
                      className={cn(
                        'inline-flex items-center gap-0.5 transition hover:text-[var(--ink)]',
                        liked && 'text-[#e11d48]'
                      )}
                    >
                      <HiHeart
                        className={cn('h-3.5 w-3.5', liked && 'fill-current')}
                        aria-hidden
                      />
                      {formatStatCount(likes)}
                    </button>
                    <span className="inline-flex items-center gap-0.5" aria-hidden>
                      <HiOutlineChatBubbleOvalLeft className="h-3.5 w-3.5" />
                      {formatStatCount(comments)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <InspirationCasePreview
        open={!!previewMeta}
        caseMeta={previewMeta}
        cases={previewRail.length ? previewRail : cases}
        docs={docs}
        likedIds={likedIds}
        remixing={!!openingId}
        onClose={() => {
          setPreviewId(null);
          setPreviewRail([]);
        }}
        onSelect={(meta) => setPreviewId(meta.id)}
        onRemix={(meta) => void remix(meta)}
        onToggleLike={(meta) => onToggleLike(meta)}
        onFollowChange={() =>
          setFollowedAuthorIds(new Set(loadFollowedUsers(userId).map((x) => x.id)))
        }
      />
    </section>
  );
}
