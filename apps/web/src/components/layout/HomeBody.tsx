import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineFolder,
  HiOutlineHome,
  HiOutlineUser,
} from 'react-icons/hi2';
import { FaGithub } from 'react-icons/fa';
import { IoIosAddCircleOutline } from 'react-icons/io';
import { Tooltip } from '@/components/base';
import HomeHero from '@/components/home/HomeHero';
import InspirationSection from '@/components/home/InspirationSection';
import MePage from '@/components/home/MePage';
import type { HomeAgentSubmitPayload } from '@/components/home/HomeAgentComposer';
import type { OfficialCaseMeta } from '@/cases/officialCases';
import TemplateGrid from '@/components/templates/TemplateGrid';
import { GITHUB_URL } from '@/components/layout/GitHubLink';
import { isOwnedTemplate } from '@/store/templatesStorage';
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
  onOpenCase: (meta: OfficialCaseMeta, document: unknown) => void;
};

const SIDE_NAV = [
  { id: 'home', icon: HiOutlineHome },
  { id: 'mine', icon: HiOutlineFolder },
  { id: 'account', icon: HiOutlineUser },
] as const;

function RailBtn({
  tip,
  placement = 'right',
  active,
  disabled,
  onClick,
  children,
}: {
  tip: string;
  placement?: 'left' | 'right';
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={tip} placement={placement}>
      <button
        type="button"
        aria-label={tip}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl transition-colors disabled:opacity-50',
          active
            ? 'bg-[var(--ink)]/10 text-[var(--ink)]'
            : 'text-[var(--muted)] hover:bg-[var(--ink)]/5 hover:text-[var(--ink)]'
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Narrow icon rail  create blank canvas + nav, all on the left. */
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
    <aside className="flex w-[56px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--rail)] py-3 text-[var(--ink)]">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ink)] text-[12px] font-bold text-[var(--on-brand)]">
        RY
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        <RailBtn
          tip={t('home.newProject')}
          placement="right"
          disabled={importing}
          onClick={onCreate}
        >
          <IoIosAddCircleOutline className="h-6 w-6" />
        </RailBtn>
        {SIDE_NAV.map(({ id, icon: Icon }) => {
          const active = nav === id || (id === 'mine' && nav === 'recent');
          const tip =
            id === 'home' ? t('home.navHome') : id === 'mine' ? t('home.mine') : t('home.account');
          return (
            <RailBtn
              key={id}
              tip={tip}
              placement="right"
              active={active}
              onClick={() => {
                if (id === 'mine') setNav('mine');
                else setNav(id);
              }}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </RailBtn>
          );
        })}
      </nav>
      <RailBtn
        tip={t('common.github', { defaultValue: 'GitHub' })}
        placement="right"
        onClick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}
      >
        <FaGithub className="h-5 w-5" aria-hidden />
      </RailBtn>
    </aside>
  );
}

export function HomeTemplateList({
  nav,
  setNav: _setNav,
  query,
  importing = false,
  importingName = '',
  onCreate: _onCreate,
  onAgentSubmit,
  onOpenCase,
}: Props) {
  const { t } = useTranslation();
  const templates = useSelector((state: any) => state.editor.templates);

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

  if (nav === 'account') {
    return <MePage />;
  }

  if (nav !== 'home') {
    const title = nav === 'recent' ? t('home.recentOpened') : t('home.mine');
    const displayCount = listForGrid.length + (importing ? 1 : 0);
    return (
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-[1700px] space-y-8 px-[60px] pb-10 pt-6">
          <TemplateGrid
            templates={listForGrid}
            title={title}
            fileCountLabel={t('home.fileCount', { count: displayCount })}
            importing={importing}
            importingName={importingName}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
      <div className="relative mx-auto w-full max-w-[1700px] space-y-12 px-[60px] pb-10 pt-0">
        <HomeHero onSubmit={onAgentSubmit} />
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
