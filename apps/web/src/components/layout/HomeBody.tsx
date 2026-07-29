import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBell,
  HiOutlineBookOpen,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolder,
  HiOutlineHome,
  HiOutlineQuestionMarkCircle,
  HiOutlineUser,
} from 'react-icons/hi2';
import { Dropdown, Tooltip } from '@/components/base';
import AppLogo from '@/components/base/AppLogo';
import { fetchProjects } from '@/apis/projects';
import HomeHero from '@/components/home/HomeHero';
import InspirationSection from '@/components/home/InspirationSection';
import MePage from '@/components/home/MePage';
import RecentProjectsSection from '@/components/home/RecentProjectsSection';
import type { HomeAgentSubmitPayload } from '@/components/home/HomeAgentComposer';
import type { OfficialCaseMeta } from '@/utils/officialCases';
import TemplateGrid from '@/components/templates/TemplateGrid';
import { flushCurrentProjectNow } from '@/components/editor/useProjectCloudSync';
import {
  appendRemoteProjects,
  clearProjectsLibrary,
  hydrateRemoteProjects,
} from '@/store/modules/editor';
import { isOwnedTemplate } from '@/utils/templatesStorage';
import { getToken } from '@/utils/token';
import { docsUrl } from '@/utils/docsUrl';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { cn } from '@/utils/classnames';

const RECENT_LIMIT = 20;
const PROJECT_PAGE_SIZE = 20;

type Props = {
  nav: string;
  setNav: (id: string) => void;
  query: string;
  importing?: boolean;
  importingName?: string;
  onCreate: () => void;
  onAgentSubmit: (payload: HomeAgentSubmitPayload) => void;
  onOpenCase: (meta: OfficialCaseMeta) => void;
};

/** Rail hit target — matches fig1 capsule icons. */
const RAIL_HIT = 'h-10 w-10';
const RAIL_STROKE = 1.5;

const SZ = {
  plus: 'h-5 w-5 shrink-0',
  home: 'h-[22px] w-[22px] shrink-0',
  folder: 'h-5 w-5 shrink-0',
  user: 'h-[22px] w-[22px] shrink-0',
  help: 'h-[22px] w-[22px] shrink-0',
} as const;

const RAIL_HELP_WIKI =
  'https://my.feishu.cn/wiki/EuoxwPk4OighdZkmAVMc7Gisn8b?from=from_copylink';

function RailBtn({
  tip,
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  tip: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip tip={tip} placement="right" triggerClassName="inline-flex">
      <button
        type="button"
        aria-label={tip}
        aria-current={active ? 'page' : undefined}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-full transition-colors disabled:opacity-50',
          RAIL_HIT,
          active
            ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
            : 'text-[var(--ink)]/70 hover:bg-[var(--canvas)] hover:text-[var(--ink)]',
          className
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function RailHelpMenu() {
  const { t } = useTranslation();

  const items = useMemo(
    () => [
      {
        key: 'guide',
        label: (
          <span className="inline-flex items-center gap-2">
            <HiOutlineBookOpen className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
            {t('home.railHelpGuide')}
          </span>
        ),
      },
      {
        key: 'contact',
        label: (
          <span className="inline-flex items-center gap-2">
            <HiOutlineChatBubbleLeftRight className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
            {t('home.railHelpContact')}
          </span>
        ),
      },
      {
        key: 'updates',
        label: (
          <span className="inline-flex items-center gap-2">
            <HiOutlineBell className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
            {t('home.railHelpUpdates')}
          </span>
        ),
      },
    ],
    [t]
  );

  return (
    <Dropdown
      trigger="click"
      placement="right-end"
      offset={12}
      floatingClassName="z-[600]"
      items={items}
      onClick={(key) => {
        if (key === 'guide') {
          window.open(docsUrl('/guide/getting-started'), '_blank', 'noopener,noreferrer');
          return;
        }
        if (key === 'contact') {
          window.location.href = 'mailto:702680355@qq.com';
          return;
        }
        window.open(RAIL_HELP_WIKI, '_blank', 'noopener,noreferrer');
      }}
    >
      <button
        type="button"
        aria-label={t('home.railHelp')}
        className={cn(
          'flex items-center justify-center rounded-full',
          RAIL_HIT,
          'text-[var(--ink)]/70 transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)]'
        )}
      >
        <HiOutlineQuestionMarkCircle className={SZ.help} strokeWidth={RAIL_STROKE} aria-hidden />
      </button>
    </Dropdown>
  );
}

/** Left rail — desktop: logo + capsule; mobile: hamburger menu (fig.2). */
export function HomeSidebar({
  nav,
  setNav,
  importing,
  onCreate,
}: {
  nav: string;
  setNav: (id: string) => void;
  importing?: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useSelector((state: any) => state.auth?.user?.id) as string | undefined;
  const authed = Boolean(userId && getToken());

  const goNav = (id: 'home' | 'mine' | 'account') => {
    if ((id === 'mine' || id === 'account') && !authed) {
      navigate(buildLoginUrl('/home'));
      return;
    }
    if (id === 'mine') setNav('mine');
    else setNav(id);
  };

  return (
    <>
      {/* Mobile top bar — brand only; nav menu lives after avatar in HomeTopBar. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-20 items-start pt-4 px-4 [background:linear-gradient(to_bottom,var(--canvas)_60%,transparent)] md:hidden">
        <div className="pointer-events-auto inline-flex min-w-0 items-center gap-2 leading-none">
          <AppLogo size={22} />
          <span
            className="-translate-y-px truncate text-[15px] font-medium leading-none tracking-tight text-[var(--ink)] [font-family:var(--font-hero)]"
            aria-hidden
          >
            {t('app.name').toLowerCase()}
          </span>
        </div>
      </div>

      {/* Desktop logo — top-left. */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 hidden items-center p-5 pl-6 md:flex">
        <div className="pointer-events-auto inline-flex items-center gap-2 leading-none">
          <AppLogo size={22} />
          <span
            className="-translate-y-px text-[15px] font-medium leading-none tracking-tight text-[var(--ink)] [font-family:var(--font-hero)]"
            aria-hidden
          >
            {t('app.name').toLowerCase()}
          </span>
        </div>
      </div>

      {/* Desktop rail — + / nav capsule (inset from screen edge). */}
      <aside
        className="pointer-events-none fixed inset-y-0 left-4 z-30 hidden w-[72px] flex-col items-center justify-center md:flex"
        aria-label={t('app.name')}
      >
        <div className="pointer-events-auto flex flex-col items-center px-1">
          <Tooltip tip={t('home.newProject')} placement="right" triggerClassName="inline-flex">
            <button
              type="button"
              aria-label={t('home.newProject')}
              disabled={importing}
              onClick={onCreate}
              className={cn(
                'group relative flex items-center justify-center rounded-full',
                RAIL_HIT,
                'bg-[var(--ink)] text-[var(--on-brand)]',
                'shadow-[0_0_0_3px_var(--surface),0_0_0_4px_#c8c8c8]',
                'transition-opacity duration-300 ease-out hover:opacity-90 disabled:opacity-50'
              )}
            >
              <svg
                className={cn(
                  SZ.plus,
                  'transition-transform duration-300 ease-out group-hover:rotate-90'
                )}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M12 6.5v11M6.5 12h11"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </Tooltip>

          <nav
            className="mt-5 flex flex-col items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)]/95 px-1.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-sm"
            aria-label={t('app.name')}
          >
            {(['home', 'mine', 'account'] as const).map((id) => {
              const active = nav === id || (id === 'mine' && nav === 'recent');
              const tip =
                id === 'home'
                  ? t('home.navHome')
                  : id === 'mine'
                    ? t('home.mine')
                    : t('home.account');
              const Icon =
                id === 'home' ? HiOutlineHome : id === 'mine' ? HiOutlineFolder : HiOutlineUser;
              const sz = id === 'mine' ? SZ.folder : id === 'home' ? SZ.home : SZ.user;
              return (
                <RailBtn
                  key={id}
                  tip={tip}
                  active={active}
                  onClick={() => goNav(id)}
                >
                  <Icon className={sz} strokeWidth={RAIL_STROKE} aria-hidden />
                </RailBtn>
              );
            })}
            <RailHelpMenu />
          </nav>
        </div>
      </aside>
    </>
  );
}

export function HomeTemplateList({
  nav,
  setNav,
  query,
  importing = false,
  importingName = '',
  onCreate,
  onAgentSubmit,
  onOpenCase,
}: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const templates = useSelector((state: any) => state.editor.templates);
  const userId = useSelector((state: any) => state.auth?.user?.id) as string | undefined;
  // Token is in localStorage only — Redux has no auth.token field.
  const authed = Boolean(userId && getToken());
  /** Logged-in: skeleton until first Projects API hydrate (avoid localStorage flash). */
  const [projectsReady, setProjectsReady] = useState(() => !authed);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsHasMore, setProjectsHasMore] = useState(false);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsLoadingMore, setProjectsLoadingMore] = useState(false);
  const projectsFetchGen = useRef(0);

  /** Guest must not stay on Projects / Me — bounce home + open login. */
  useEffect(() => {
    if (authed) return;
    if (nav !== 'mine' && nav !== 'account' && nav !== 'recent') return;
    setNav('home');
    navigate(buildLoginUrl('/home'));
  }, [authed, nav, navigate, setNav]);

  useEffect(() => {
    if (!authed) {
      // Logged out: wipe in-memory library (hydrate([]) can keep currentId rows).
      dispatch(clearProjectsLibrary());
      setProjectsReady(true);
      setProjectsPage(1);
      setProjectsHasMore(false);
      setProjectsTotal(0);
      return;
    }
    let cancelled = false;
    const gen = ++projectsFetchGen.current;
    setProjectsReady(false);
    setProjectsLoadingMore(false);
    void (async () => {
      // Wait for editor leave-flush (doc + cover) so list thumbs are not one revision behind.
      try {
        await flushCurrentProjectNow({ force: true });
      } catch {
        /* list anyway */
      }
      if (cancelled || gen !== projectsFetchGen.current) return;
      try {
        const res = await fetchProjects({ page: 1, pageSize: PROJECT_PAGE_SIZE });
        if (cancelled || gen !== projectsFetchGen.current) return;
        dispatch(hydrateRemoteProjects(res.projects || []));
        setProjectsPage(1);
        setProjectsHasMore(Boolean(res.hasMore));
        setProjectsTotal(Number(res.total) || (res.projects || []).length);
      } catch {
        if (!cancelled && gen === projectsFetchGen.current) {
          dispatch(hydrateRemoteProjects([]));
          setProjectsHasMore(false);
          setProjectsTotal(0);
        }
      } finally {
        if (!cancelled && gen === projectsFetchGen.current) setProjectsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, dispatch]);

  const loadMoreProjects = useCallback(() => {
    if (!authed || !projectsHasMore || projectsLoadingMore || !projectsReady) return;
    const nextPage = projectsPage + 1;
    const gen = projectsFetchGen.current;
    setProjectsLoadingMore(true);
    void (async () => {
      try {
        const res = await fetchProjects({ page: nextPage, pageSize: PROJECT_PAGE_SIZE });
        if (gen !== projectsFetchGen.current) return;
        dispatch(appendRemoteProjects(res.projects || []));
        setProjectsPage(nextPage);
        setProjectsHasMore(Boolean(res.hasMore));
        if (Number.isFinite(Number(res.total))) setProjectsTotal(Number(res.total));
      } catch {
        /* keep current page; user can scroll again */
      } finally {
        if (gen === projectsFetchGen.current) setProjectsLoadingMore(false);
      }
    })();
  }, [
    authed,
    dispatch,
    projectsHasMore,
    projectsLoadingMore,
    projectsPage,
    projectsReady,
  ]);

  const ownedProjects = useMemo(
    () => (templates as any[]).filter((item) => isOwnedTemplate(item)),
    [templates]
  );

  const listForGrid = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = templates as any[];
    if (nav === 'recent') {
      list = [...list]
        .filter((item) => Number(item.openedAt || item.updatedAt || 0) > 0)
        .sort(
          (a, b) =>
            (Number(b.openedAt) || Number(b.updatedAt) || 0) -
            (Number(a.openedAt) || Number(a.updatedAt) || 0)
        )
        .slice(0, RECENT_LIMIT);
      // Projects (mine): only owned works — not case/scratch open sessions.
    } else {
      list = list.filter((item) => isOwnedTemplate(item));
    }
    if (!q) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [templates, nav, query]);

  const showAccount = nav === 'account' && Boolean(authed);
  const showMine = nav !== 'home' && Boolean(authed) && !showAccount;
  const showHome = !showAccount && !showMine;

  const homeProjectsLoading = Boolean(authed) && !projectsReady;
  const mineTitle = nav === 'recent' ? t('home.recentOpened') : t('home.mine');
  const mineSkeleton = Boolean(authed) && !projectsReady;
  const mineScrollLoad = nav === 'mine' && !query.trim();
  const mineDisplayCount = mineScrollLoad
    ? projectsTotal + (importing ? 1 : 0)
    : listForGrid.length + (importing ? 1 : 0);

  return (
    <>
      {showAccount ? <MePage onOpenCase={onOpenCase} /> : null}

      {showMine ? (
        <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
          <div className="relative mx-auto w-full min-w-0 max-w-[1700px] space-y-8 px-5 pb-10 pt-16 sm:px-8 sm:pt-20 md:px-24 lg:px-[100px] xl:px-[120px]">
            <TemplateGrid
              templates={mineSkeleton ? [] : listForGrid}
              title={mineTitle}
              fileCountLabel={
                mineSkeleton
                  ? t('home.fileCount', { count: 0 })
                  : t('home.fileCount', { count: mineDisplayCount })
              }
              importing={!mineSkeleton && importing}
              importingName={importingName}
              loading={mineSkeleton}
              loadingMore={mineScrollLoad && projectsLoadingMore}
              hasMore={mineScrollLoad && projectsHasMore}
              onLoadMore={mineScrollLoad ? loadMoreProjects : undefined}
              onCreate={onCreate}
              createDisabled={importing}
            />
          </div>
        </main>
      ) : null}

      <main
        className={cn(
          'relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent',
          !showHome && 'hidden',
        )}
        aria-hidden={!showHome}
      >
        <div className="relative mx-auto flex w-full min-w-0 max-w-[1700px] flex-col items-stretch px-5 pb-10 pt-0 sm:px-8 md:px-24 lg:px-[100px] xl:px-[120px]">
          <HomeHero onSubmit={onAgentSubmit} />
          <div className="flex flex-col space-y-6 sm:space-y-12">
            <RecentProjectsSection
              projects={authed ? ownedProjects : []}
              loading={homeProjectsLoading}
              disabled={importing}
              onCreate={onCreate}
              onViewAll={() => {
                if (!authed) {
                  navigate(buildLoginUrl('/home'));
                  return;
                }
                setNav('mine');
              }}
            />
            <InspirationSection onOpenCase={onOpenCase} disabled={importing} />
          </div>
        </div>
      </main>
    </>
  );
}

export function useHomeNav() {
  const location = useLocation();
  const initial =
    typeof (location.state as { homeNav?: string } | null)?.homeNav === 'string'
      ? String((location.state as { homeNav?: string }).homeNav)
      : 'home';
  const [nav, setNav] = useState(initial);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importingName, setImportingName] = useState('');

  useEffect(() => {
    const next = (location.state as { homeNav?: string } | null)?.homeNav;
    if (typeof next === 'string' && next) setNav(next);
  }, [location.state]);

  return { nav, setNav, query, setQuery, importing, setImporting, importingName, setImportingName };
}
