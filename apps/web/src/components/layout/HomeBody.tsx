import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GoHome } from 'react-icons/go';
import {
  HiOutlineBell,
  HiOutlineBookOpen,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolder,
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

const RAIL_HELP_WIKI =
  'https://my.feishu.cn/wiki/EuoxwPk4OighdZkmAVMc7Gisn8b?from=from_copylink';

/** Circled + — rail create action (glyph fills viewBox like Home/User). */
function RailPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={RAIL_STROKE}
      />
      <path
        d="M12 7.25v9.5M7.25 12h9.5"
        stroke="currentColor"
        strokeWidth={RAIL_STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
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
          'mx-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-50',
          active
            ? 'bg-[color-mix(in_srgb,var(--ink)_4%,var(--rail))] text-[var(--ink)]'
            : 'text-[var(--ink)]/55 hover:bg-[color-mix(in_srgb,var(--ink)_2%,var(--rail))] hover:text-[var(--ink)]'
        )}
      >
        {icon}
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
      trigger="hover"
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
        className="mx-auto flex h-10 w-10 items-center justify-center text-[var(--ink)]/55 transition-colors hover:text-[var(--ink)]"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.5} />
          <path
            d="M9.75 9.4a2.4 2.4 0 0 1 4.55.85c0 1.35-1.2 1.95-2.05 2.45-.55.35-.75.6-.75 1.15"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.75" r="0.9" fill="currentColor" />
        </svg>
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
  const userId = useSelector((state: any) => state.auth?.user?.id) as string | undefined;
  const authed = Boolean(userId && getToken());

  const goNav = (id: 'home' | 'mine' | 'account') => {
    if ((id === 'mine' || id === 'account') && !authed) {
      navigate(buildLoginUrl('/home'));
      return;
    }
    setNav(id);
  };

  return (
    <>
      {/* Mobile top bar — brand only; nav menu lives after avatar in HomeTopBar. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-20 items-start bg-gradient-to-b from-[var(--surface)] from-60% to-transparent pt-4 px-4 md:hidden">
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

      {/* Desktop rail — top-packed icons; ? help pinned to bottom. */}
      <aside
        className="pointer-events-none fixed inset-y-0 left-0 z-30 hidden w-[64px] flex-col overflow-visible border-r border-[var(--line)] md:flex"
        aria-label={t('app.name')}
      >
        <div className="pointer-events-auto flex h-full flex-col items-stretch overflow-visible bg-[var(--rail)] px-2 pb-5 pt-4">
          <div className="flex shrink-0 justify-center pb-4">
            <RailLogo />
          </div>
          <nav
            className="flex min-h-0 flex-1 flex-col items-stretch gap-1.5"
            aria-label={t('app.name')}
          >
            <RailItem
              label={t('home.railAdd')}
              disabled={importing}
              onClick={onCreate}
              icon={<RailPlusIcon className="h-[22px] w-[22px]" />}
            />
            <RailItem
              label={t('home.navHome')}
              active={nav === 'home'}
              onClick={() => goNav('home')}
              icon={<GoHome className="h-[22px] w-[22px]" aria-hidden />}
            />
            <RailItem
              label={t('home.account')}
              active={nav === 'account'}
              onClick={() => goNav('account')}
              icon={<HiOutlineUser className="h-[22px] w-[22px]" strokeWidth={RAIL_STROKE} aria-hidden />}
            />
            <RailDivider />
            <RailItem
              label={t('home.mine')}
              active={nav === 'mine'}
              onClick={() => goNav('mine')}
              icon={<HiOutlineFolder className="h-[18px] w-[18px]" strokeWidth={RAIL_STROKE} aria-hidden />}
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

  /** Guest must not stay on Projects / Me — bounce home + open login. */
  useEffect(() => {
    if (nav === 'recent') {
      setNav('home');
      return;
    }
    if (authed) return;
    if (nav !== 'mine' && nav !== 'account') return;
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
    const list = (templates as any[]).filter((item) => isOwnedTemplate(item));
    if (!q) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [templates, query]);

  const showAccount = nav === 'account' && Boolean(authed);
  const showMine = nav === 'mine' && Boolean(authed);
  const showHome = !showAccount && !showMine;

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

const MemoizedHomeSidebar = memo(HomeSidebar);
export { MemoizedHomeSidebar as HomeSidebar };
const MemoizedHomeTemplateList = memo(HomeTemplateList);
export { MemoizedHomeTemplateList as HomeTemplateList };
