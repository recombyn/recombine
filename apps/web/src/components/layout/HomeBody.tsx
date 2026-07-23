import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineBell,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolder,
  HiOutlineHome,
  HiOutlineQuestionMarkCircle,
  HiOutlineUser,
} from 'react-icons/hi2';
import { Dropdown, Tooltip } from '@/components/base';
import AppLogo from '@/components/base/AppLogo';
import { fetchAllProjectSummaries } from '@/apis/projects';
import HomeHero from '@/components/home/HomeHero';
import InspirationSection from '@/components/home/InspirationSection';
import MePage from '@/components/home/MePage';
import RecentProjectsSection from '@/components/home/RecentProjectsSection';
import type { HomeAgentSubmitPayload } from '@/components/home/HomeAgentComposer';
import type { OfficialCaseMeta } from '@/utils/officialCases';
import TemplateGrid from '@/components/templates/TemplateGrid';
import { hydrateRemoteProjects } from '@/store/modules/editor';
import { isOwnedTemplate } from '@/utils/templatesStorage';
import { getToken } from '@/utils/token';
import { cn } from '@/utils/classnames';

const RECENT_LIMIT = 20;

type Props = {
  nav: string;
  setNav: (id: string) => void;
  query: string;
  importing?: boolean;
  importingName?: string;
  onCreate: () => void;
  onAgentSubmit: (payload: HomeAgentSubmitPayload) => void;
  onOpenCase: (meta: OfficialCaseMeta, document: unknown, opts?: { prompt?: string }) => void;
};

/** Rail: 40px hit target; icons optically balanced at ~22px visual weight. */
const RAIL_HIT = 'h-10 w-10';
const RAIL_STROKE = 1.5;

/** Optically-balanced sizes per icon family. */
const SZ = {
  plus: 'h-[22px] w-[22px] shrink-0',
  home: 'h-[22px] w-[22px] shrink-0',
  folder: 'h-[20px] w-[20px] shrink-0',
  user: 'h-[22px] w-[22px] shrink-0',
} as const;

function RailPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth={RAIL_STROKE} />
      <path
        d="M12 7.75v8.5M7.75 12h8.5"
        stroke="currentColor"
        strokeWidth={RAIL_STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}

const RAIL_HELP_WIKI =
  'https://my.feishu.cn/wiki/EuoxwPk4OighdZkmAVMc7Gisn8b?from=from_copylink';

function RailBtn({
  tip,
  active,
  disabled,
  onClick,
  children,
}: {
  tip: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={tip} placement="right" triggerClassName="inline-flex">
      <button
        type="button"
        aria-label={tip}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-lg transition-colors disabled:opacity-50',
          RAIL_HIT,
          active ? 'text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
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
      offset={8}
      floatingClassName="z-[600]"
      items={items}
      onClick={(key) => {
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
          'flex items-center justify-center rounded-lg bg-transparent',
          RAIL_HIT,
          'text-[var(--muted)] transition-colors hover:text-[var(--ink)]'
        )}
      >
        <HiOutlineQuestionMarkCircle
          className="h-[22px] w-[22px] shrink-0"
          strokeWidth={RAIL_STROKE}
          aria-hidden
        />
      </button>
    </Dropdown>
  );
}

/** Narrow icon rail — create blank canvas + nav, all on the left. */
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
  return (
    <aside className="flex w-[56px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--rail)] pb-2 pt-4 text-[var(--ink)]">
      <AppLogo size={36} className="mb-5" />
      <nav className="flex flex-1 flex-col items-center gap-1">
        <RailBtn tip={t('home.newProject')} disabled={importing} onClick={onCreate}>
          <RailPlusIcon className={SZ.plus} />
        </RailBtn>
        {(['home', 'mine', 'account'] as const).map((id) => {
          const active = nav === id || (id === 'mine' && nav === 'recent');
          const tip =
            id === 'home' ? t('home.navHome') : id === 'mine' ? t('home.mine') : t('home.account');
          const Icon =
            id === 'home' ? HiOutlineHome : id === 'mine' ? HiOutlineFolder : HiOutlineUser;
          const sz = id === 'mine' ? SZ.folder : id === 'home' ? SZ.home : SZ.user;
          return (
            <RailBtn
              key={id}
              tip={tip}
              active={active}
              onClick={() => {
                if (id === 'mine') setNav('mine');
                else setNav(id);
              }}
            >
              <Icon className={sz} strokeWidth={RAIL_STROKE} aria-hidden />
            </RailBtn>
          );
        })}
      </nav>
      <RailHelpMenu />
    </aside>
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
  const templates = useSelector((state: any) => state.editor.templates);
  const userId = useSelector((state: any) => state.auth?.user?.id) as string | undefined;
  // Token is in localStorage only — Redux has no auth.token field.
  const authed = Boolean(userId && getToken());
  /** Logged-in: skeleton until first Projects API hydrate (avoid localStorage flash). */
  const [projectsReady, setProjectsReady] = useState(() => !authed);

  useEffect(() => {
    if (!authed) {
      // Logged out: no local project library — clear owned list from memory.
      dispatch(hydrateRemoteProjects([]));
      setProjectsReady(true);
      return;
    }
    let cancelled = false;
    setProjectsReady(false);
    void fetchAllProjectSummaries()
      .then((all) => {
        if (!cancelled) dispatch(hydrateRemoteProjects(all));
      })
      .catch(() => {
        if (!cancelled) dispatch(hydrateRemoteProjects([]));
      })
      .finally(() => {
        if (!cancelled) setProjectsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, dispatch]);

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
    // Projects (mine): only owned works � not case/scratch open sessions.
    } else {
      list = list.filter((item) => isOwnedTemplate(item));
    }
    if (!q) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [templates, nav, query]);

  if (nav === 'account') {
    return <MePage />;
  }

  if (nav !== 'home') {
    const title = nav === 'recent' ? t('home.recentOpened') : t('home.mine');
    const showSkeleton = Boolean(authed) && !projectsReady;
    const displayCount = listForGrid.length + (importing ? 1 : 0);
    return (
      <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
        <div className="relative mx-auto w-full min-w-0 max-w-[1700px] space-y-8 px-[60px] pb-10 pt-6">
          <TemplateGrid
            templates={showSkeleton ? [] : listForGrid}
            title={title}
            fileCountLabel={
              showSkeleton ? t('home.fileCount', { count: 0 }) : t('home.fileCount', { count: displayCount })
            }
            importing={!showSkeleton && importing}
            importingName={importingName}
            loading={showSkeleton}
          />
        </div>
      </main>
    );
  }

  const homeProjectsLoading = Boolean(authed) && !projectsReady;

  return (
    <main className="relative min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
      <div className="relative mx-auto flex w-full min-w-0 max-w-[1700px] flex-col items-stretch space-y-12 px-[60px] pb-10 pt-0">
        <HomeHero onSubmit={onAgentSubmit} />
        <RecentProjectsSection
          projects={ownedProjects}
          loading={homeProjectsLoading}
          disabled={importing}
          onCreate={onCreate}
          onViewAll={() => setNav('mine')}
        />
        <InspirationSection onOpenCase={onOpenCase} disabled={importing} />
      </div>
    </main>
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
