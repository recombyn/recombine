import { useMemo, useState, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineFolder,
  HiOutlineHome,
  HiOutlinePlus,
  HiOutlineQuestionMarkCircle,
  HiOutlineUser,
} from 'react-icons/hi2';
import { IoIosAddCircleOutline } from 'react-icons/io';
import { Tooltip } from '@/components/base';
import TemplateGrid from '@/components/templates/TemplateGrid';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import { isOwnedTemplate } from '@/store/templatesStorage';
import { formatTemplateTime } from '@/lib/formatTime';
import { cn } from '@/utils/classnames';
import { openTemplate } from '@/store/modules/editor';

const RECENT_LIMIT = 20;
/** Recent strip: New project + this many = 5 cards / row. */
const RECENT_ROW = 4;

type Props = {
  nav: string;
  setNav: (id: string) => void;
  query: string;
  importing?: boolean;
  importingName?: string;
  onCreate: () => void;
};

const SIDE_NAV = [
  { id: 'home', icon: HiOutlineHome },
  { id: 'mine', icon: HiOutlineFolder },
  { id: 'account', icon: HiOutlineUser },
] as const;

/** Preview tile height (fig.2). */
const CARD_PREVIEW = 'h-[170px] w-full';

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
    <aside className="flex w-[56px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--rail)] py-3 text-[var(--ink)]">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ink)] text-[12px] font-bold text-[var(--on-brand)]">
        RC
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
                if (id === 'account') return;
                setNav(id === 'mine' ? 'mine' : id);
              }}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </RailBtn>
          );
        })}
      </nav>
      <RailBtn tip={t('common.help')} placement="right">
        <HiOutlineQuestionMarkCircle className="h-5 w-5" strokeWidth={1.75} />
      </RailBtn>
    </aside>
  );
}

function NewProjectCard({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onCreate} className="group flex w-full flex-col text-left">
      <div
        className={cn(
          CARD_PREVIEW,
          'flex items-center justify-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--accent-soft)] transition group-hover:border-[var(--ink)]/35 group-hover:bg-[var(--accent-soft)]'
        )}
      >
        <HiOutlinePlus
          className="h-8 w-8 text-[var(--muted)] transition group-hover:text-[var(--ink)]"
          strokeWidth={1.5}
        />
      </div>
      <div className="mt-2.5 min-w-0 px-0.5">
        <div className="truncate text-[13px] font-medium text-[var(--ink)]">{t('home.newProject')}</div>
      </div>
    </button>
  );
}

function RecentProjectCard({ item }: { item: any }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="group flex w-full flex-col text-left"
      onClick={() => {
        dispatch(openTemplate(item.id));
        navigate('/editor');
      }}
    >
      <div
        className={cn(
          CARD_PREVIEW,
          'overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] transition group-hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)]'
        )}
      >
        <TemplateThumbnail document={item.document} />
      </div>
      <div className="mt-2.5 min-w-0 px-0.5">
        <div className="truncate text-[13px] font-medium text-[var(--ink)]">
          {item.name || t('home.untitled')}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
          {t('home.updatedAt', { time: formatTemplateTime(item.updatedAt) })}
        </div>
      </div>
    </button>
  );
}

export function HomeTemplateList({
  nav,
  setNav,
  query,
  importing = false,
  importingName = '',
  onCreate,
}: Props) {
  const { t } = useTranslation();
  const templates = useSelector((state: any) => state.editor.templates);

  const owned = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (templates as any[]).filter((item) => isOwnedTemplate(item));
    list = [...list].sort(
      (a, b) =>
        (Number(b.openedAt) || Number(b.updatedAt) || 0) -
        (Number(a.openedAt) || Number(a.updatedAt) || 0)
    );
    if (!q) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [templates, query]);

  const recentRow = owned.slice(0, RECENT_ROW);

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
    } else {
      list = list.filter((item) => isOwnedTemplate(item));
    }
    if (!q) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [templates, nav, query]);

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
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1700px] space-y-10 px-[60px] pb-10 pt-6">
        {/* Recent projects — 5 per row */}
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-[16px] font-semibold tracking-tight text-[var(--ink)]">
              {t('home.recentProjects')}
            </h2>
            <button
              type="button"
              className="text-[13px] text-[var(--muted)] transition hover:text-[var(--ink)]"
              onClick={() => setNav('mine')}
            >
              {t('home.viewAll')}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-4">
            <NewProjectCard onCreate={onCreate} />
            {importing ? (
              <div className="w-full">
                <div className="h-[170px] animate-pulse rounded-xl bg-[var(--accent-soft)]" />
                <div className="mt-2.5 h-3.5 w-24 rounded bg-[var(--accent-soft)]" />
                <div className="mt-1.5 h-2.5 w-16 rounded bg-[var(--accent-soft)]" />
              </div>
            ) : null}
            {recentRow.map((item) => (
              <RecentProjectCard key={item.id} item={item} />
            ))}
          </div>
        </section>

        {/* My Templates */}
        <TemplateGrid
          templates={owned}
          title={t('home.mine')}
          fileCountLabel={t('home.fileCount', {
            count: owned.length + (importing ? 1 : 0),
          })}
          importing={importing}
          importingName={importingName}
        />
      </div>
    </main>
  );
}

export function useHomeNav() {
  const [nav, setNav] = useState('home');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importingName, setImportingName] = useState('');
  return { nav, setNav, query, setQuery, importing, setImporting, importingName, setImportingName };
}
