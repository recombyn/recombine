import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBell,
  HiOutlineBookOpen,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolder,
  HiOutlineHome,
  HiOutlinePlusCircle,
} from 'react-icons/hi2';
import { RiPuzzleLine } from 'react-icons/ri';
import { LuUserRound } from 'react-icons/lu';
import { Dropdown, Tooltip } from '@/components/base';
import AppLogo from '@/components/base/AppLogo';
import { Icon } from '@/components/base/icon';
import { fetchProjects } from '@/apis/projects';
import HomeHero from '@/components/home/HomeHero';
import InspirationSection from '@/components/home/InspirationSection';
import MePage from '@/components/home/MePage';
import RecentProjectsSection from '@/components/home/RecentProjectsSection';
import SkillsLibraryPanel from '@/components/home/SkillsLibraryPanel';
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
import { docsUrl, openExternalUrl } from '@/utils/docsUrl';
import { buildLoginUrl } from '@/utils/authReturnTo';
import { useIsDesktopShell } from '@/components/layout/DesktopTitlebar';
import { isDesktopLocal } from '@/utils/apiBase';
import { cn } from '@/utils/classnames';

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

const RAIL_STROKE = 1.5;
/** Shared hit box for rail buttons. */
const RAIL_ICON_BOX = 'flex h-6 w-6 shrink-0 items-center justify-center';
/** Add (+) stays slightly larger. */
const RAIL_ICON = 'h-6 w-6';
/** Home / account — 22px. */
const RAIL_ICON_MD = 'h-[22px] w-[22px]';
/** Skills / mine — 20px (optically denser glyphs). */
const RAIL_ICON_SM = 'h-5 w-5';

const RAIL_HELP_WIKI =
  'https://my.feishu.cn/wiki/EuoxwPk4OighdZkmAVMc7Gisn8b?from=from_copylink';

function handleRailHelpClick(key: string) {
  if (key === 'guide') {
    void openExternalUrl(docsUrl('/guide/getting-started'));
    return;
  }
  if (key === 'contact') {
    void openExternalUrl('mailto:702680355@qq.com');
    return;
  }
  void openExternalUrl(RAIL_HELP_WIKI);
}

function RailGlyph({ children }: { children: ReactNode }) {
  return <span className={RAIL_ICON_BOX}>{children}</span>;
}

function RailItem({
  label,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon: ReactNode;
}) {
  return (
    <Tooltip tip={label} placement="right" offset={10}>
      <button
        type="button"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'group mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
          active
            ? 'bg-[color-mix(in_srgb,var(--ink)_4%,var(--rail))] text-[var(--ink)]'
            : 'text-[var(--ink)]/55 hover:bg-[color-mix(in_srgb,var(--ink)_2%,var(--rail))] hover:text-[var(--ink)]'
        )}
      >
        <RailGlyph>{icon}</RailGlyph>
      </button>
    </Tooltip>
  );
}

function RailLogo() {
  return (
    <div className="mx-auto flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
      <AppLogo size={26} />
    </div>
  );
}

function RailDivider() {
  return (
    <div className="mx-auto my-1 h-px w-6 bg-[var(--line)]" aria-hidden />
  );
}

function RailHelpMenu() {
  const { t } = useTranslation();
  const desktopLocal = isDesktopLocal();

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
      ...(desktopLocal
        ? []
        : [
            {
              key: 'updates',
              label: (
                <span className="inline-flex items-center gap-2">
                  <HiOutlineBell className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
                  {t('home.railHelpUpdates')}
                </span>
              ),
            },
          ]),
    ],
    [t, desktopLocal]
  );

  return (
    <Dropdown
      trigger="hover"
      placement="right-end"
      offset={12}
      floatingClassName="z-[600]"
      items={items}
      onClick={handleRailHelpClick}
    >
      <button
        type="button"
        aria-label={t('home.railHelp')}
        className="mx-auto flex h-10 w-10 items-center justify-center text-[var(--ink)]/55 transition-colors hover:text-[var(--ink)]"
      >
        <Icon name="home-help-circle" className="h-6 w-6" />
      </button>
    </Dropdown>
  );
}

/** Side rail — logo, Add, nav icons; help (?) stays at the bottom. */
function HomeSidebar({
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
  const desktop = useIsDesktopShell();
  const userId = useSelector((state: any) => state.auth?.user?.id) as string | undefined;
  const authed = Boolean(userId && getToken());

  const goNav = (id: 'home' | 'mine' | 'account' | 'skills') => {
    if ((id === 'mine' || id === 'account' || id === 'skills') && !authed) {
      navigate(buildLoginUrl('/home'));
      return;
    }
    setNav(id);
  };

  return (
    <>
      {/* Web mobile brand only — Tauri already shows mark + name in the titlebar. */}
      {!desktop ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-20 items-start bg-gradient-to-b from-[var(--surface)] from-60% to-transparent pt-4 px-4 md:hidden">
          <div className="pointer-events-auto inline-flex min-w-0 items-center gap-2 leading-none">
            <AppLogo size={22} />
            <span
              className="-translate-y-px truncate text-[15px] font-medium leading-none tracking-tight text-[var(--ink)] [font-family:var(--font-hero)]"
              aria-hidden
            >
              {t('app.name')}
            </span>
          </div>
        </div>
      ) : null}

      {/* Desktop rail — top-packed icons; ? help pinned to bottom.
          On Tauri the brand mark lives in the custom titlebar (same --rail). */}
      <aside
        className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-[64px] flex-col overflow-visible border-r border-[var(--line)] md:flex"
        aria-label={t('app.name')}
      >
        <div className="pointer-events-auto flex h-full flex-col items-stretch overflow-visible bg-[var(--rail)] px-2 pb-5 pt-4">
          {!desktop ? (
            <div className="flex shrink-0 justify-center pb-4">
              <RailLogo />
            </div>
          ) : (
            <div className="shrink-0 pb-2" aria-hidden />
          )}
          <nav
            className="flex min-h-0 flex-1 flex-col items-stretch gap-1.5"
            aria-label={t('app.name')}
          >
            <RailItem
              label={t('home.railAdd')}
              disabled={importing}
              onClick={onCreate}
              icon={
                <HiOutlinePlusCircle
                  className={RAIL_ICON}
                  strokeWidth={RAIL_STROKE}
                  aria-hidden
                />
              }
            />
            <RailItem
              label={t('home.navHome')}
              active={nav === 'home'}
              onClick={() => goNav('home')}
              icon={
                <HiOutlineHome className={RAIL_ICON_MD} strokeWidth={RAIL_STROKE} aria-hidden />
              }
            />
            <RailItem
              label={t('home.mine')}
              active={nav === 'mine'}
              onClick={() => goNav('mine')}
              icon={
                <HiOutlineFolder
                  className={RAIL_ICON_SM}
                  strokeWidth={RAIL_STROKE}
                  aria-hidden
                />
              }
            />
            <RailItem
              label={t('home.railSkills')}
              active={nav === 'skills'}
              onClick={() => goNav('skills')}
              icon={
                <RiPuzzleLine
                  // Remix Line is fill-based (~2px); soften to match hi2/lu stroke 1.5.
                  className={cn(
                    RAIL_ICON_MD,
                    'fill-current text-current opacity-[0.78] transition-opacity',
                    'group-hover:opacity-100 group-aria-[current=page]:opacity-100'
                  )}
                  aria-hidden
                />
              }
            />
            <RailDivider />
            <RailItem
              label={t('home.account')}
              active={nav === 'account'}
              onClick={() => goNav('account')}
              icon={
                <LuUserRound className={RAIL_ICON_MD} strokeWidth={RAIL_STROKE} aria-hidden />
              }
            />
          </nav>
          <div className="mt-auto flex shrink-0 justify-center pt-3">
            <RailHelpMenu />
          </div>
        </div>
      </aside>
    </>
  );
}

function HomeTemplateList({
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
  /** Skip re-fetch when toggling Home ↔ Projects; Me/Skills must not pull projects. */
  const projectsHydratedForUserRef = useRef<string | null>(null);

  /** Guest must not stay on Projects / Me — bounce home + open login. */
  useEffect(() => {
    if (nav === 'recent') {
      setNav('home');
      return;
    }
    if (authed) return;
    if (nav !== 'mine' && nav !== 'account' && nav !== 'skills') return;
    setNav('home');
    navigate(buildLoginUrl('/home'));
  }, [authed, nav, navigate, setNav]);

  const showAccount = nav === 'account' && Boolean(authed);
  const showMine = nav === 'mine' && Boolean(authed);
  const showSkills = nav === 'skills' && Boolean(authed);
  const showHome = !showAccount && !showMine && !showSkills;
  /** GET /projects — Home recent + Projects only (never Me / Skills / plaza). */
  const needsProjectsList = showHome || showMine;

  useEffect(() => {
    if (!authed) {
      // Logged out: wipe in-memory library (hydrate([]) can keep currentId rows).
      projectsHydratedForUserRef.current = null;
      dispatch(clearProjectsLibrary());
      setProjectsReady(true);
      setProjectsPage(1);
      setProjectsHasMore(false);
      setProjectsTotal(0);
      return;
    }
    // Me / Skills: do not hit GET /projects.
    if (!needsProjectsList) return;
    const hydrateKey = userId || 'authed';
    if (projectsHydratedForUserRef.current === hydrateKey) return;

    let cancelled = false;
    const gen = ++projectsFetchGen.current;
    setProjectsReady(false);
    setProjectsLoadingMore(false);
    async function loadProjects() {
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
        projectsHydratedForUserRef.current = hydrateKey;
      } catch {
        if (!cancelled && gen === projectsFetchGen.current) {
          dispatch(hydrateRemoteProjects([]));
          setProjectsHasMore(false);
          setProjectsTotal(0);
        }
      } finally {
        if (!cancelled && gen === projectsFetchGen.current) setProjectsReady(true);
      }
    }
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [authed, dispatch, needsProjectsList, userId]);

  const loadMoreProjects = useCallback(() => {
    if (!authed || !projectsHasMore || projectsLoadingMore || !projectsReady) return;
    const nextPage = projectsPage + 1;
    const gen = projectsFetchGen.current;
    setProjectsLoadingMore(true);
    async function loadNextPage() {
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
    }
    loadNextPage();
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
    const list = (templates as any[]).filter((item) => isOwnedTemplate(item));
    if (!q) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [templates, query]);

  const homeProjectsLoading = Boolean(authed) && !projectsReady;
  const mineTitle = t('home.mine');
  const mineSkeleton = Boolean(authed) && !projectsReady;
  const mineScrollLoad = !query.trim();
  const mineDisplayCount = mineScrollLoad
    ? projectsTotal + (importing ? 1 : 0)
    : listForGrid.length + (importing ? 1 : 0);

  return (
    <>
      {showAccount ? <MePage onOpenCase={onOpenCase} /> : null}

      {showSkills ? (
        <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
          <div className="relative mx-auto w-full min-w-0 max-w-[1700px] px-5 pb-10 pt-16 sm:px-8 sm:pt-20 md:px-24 lg:px-[100px] xl:px-[120px]">
            <SkillsLibraryPanel />
          </div>
        </main>
      ) : null}

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
              gridClassName="grid w-full grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
            />
          </div>
        </main>
      ) : null}

      {showHome ? (
        <main className="relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
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
              {!isDesktopLocal() ? (
                <InspirationSection onOpenCase={onOpenCase} disabled={importing} />
              ) : null}
            </div>
          </div>
        </main>
      ) : null}
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

const MemoizedHomeSidebar = memo(HomeSidebar);
export { MemoizedHomeSidebar as HomeSidebar };
const MemoizedHomeTemplateList = memo(HomeTemplateList);
export { MemoizedHomeTemplateList as HomeTemplateList };
