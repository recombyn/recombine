import { useMemo, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlinePlus } from 'react-icons/hi2';
import { message } from '@/components/base';
import { fetchProject } from '@/apis/projects';
import LazyTemplateThumb from '@/components/home/LazyTemplateThumb';
import { openTemplate, setDocumentFromCanvas } from '@/store/modules/editor';
import { projectThumbFrameClass } from '@/utils/projectThumb';
import {
  coverDocumentHasContent,
  extractPlazaCoverDocument,
} from '@/utils/plazaCover';
import { useGoEditor } from '@/utils/goEditor';
import { cn } from '@/utils/classnames';

const RECENT_HOME_LIMIT = 4;

type ProjectItem = {
  id: string;
  name?: string;
  document?: unknown;
  thumbnail?: string | null;
  updatedAt?: number;
  openedAt?: number;
  remoteOnly?: boolean;
};

type Props = {
  projects: ProjectItem[];
  loading?: boolean;
  disabled?: boolean;
  onCreate: () => void;
  onViewAll: () => void;
};

function formatUpdatedLabel(timestamp: number | undefined, locale: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  // Match home mock: "Jul 18, 2026"
  return date.toLocaleDateString(locale.startsWith('zh') ? 'en-US' : locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ProjectThumb({ item }: { item: ProjectItem }): ReactNode {
  const cover = item.document
    ? extractPlazaCoverDocument(item.document, { contentFit: true })
    : null;
  if (cover && coverDocumentHasContent(cover)) {
    return <LazyTemplateThumb document={cover} fit="contain" />;
  }
  if (typeof item.thumbnail === 'string' && item.thumbnail.trim()) {
    return (
      <div className={projectThumbFrameClass('bg-[var(--surface)]')}>
        <img
          src={item.thumbnail}
          alt=""
          className="h-full w-full object-contain"
        />
      </div>
    );
  }
  if (item.document) {
    return <LazyTemplateThumb document={item.document} fit="contain" />;
  }
  return <div className={projectThumbFrameClass('bg-[var(--accent-soft)] shadow-none')} />;
}

/** Home — recent owned projects under chat, above Plaza. */
export default function RecentProjectsSection({
  projects,
  loading = false,
  disabled = false,
  onCreate,
  onViewAll,
}: Props): ReactNode {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const goEditor = useGoEditor();
  const locale = i18n.resolvedLanguage || i18n.language || 'zh-CN';

  const recent = useMemo(
    () =>
      [...projects]
        .sort(
          (a, b) =>
            (Number(b.openedAt) || Number(b.updatedAt) || 0) -
            (Number(a.openedAt) || Number(a.updatedAt) || 0)
        )
        .slice(0, RECENT_HOME_LIMIT),
    [projects]
  );

  const openProject = async (item: ProjectItem) => {
    if (disabled) return;
    if (!item.document && item.remoteOnly) {
      try {
        const res = await fetchProject(item.id);
        dispatch(openTemplate(item.id));
        if (res.project?.document) {
          dispatch(setDocumentFromCanvas(res.project.document));
        }
        goEditor({ projectId: item.id });
        return;
      } catch {
        message.error(t('home.casesLoadFailed'));
        return;
      }
    }
    dispatch(openTemplate(item.id));
    goEditor({ projectId: item.id });
  };

  const gridClass =
    'grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  return (
    <section className="w-full min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--ink)]">
          {t('home.recentProjects')}
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          {t('home.viewAll')}
        </button>
      </div>

      <div className={cn(gridClass, 'w-full')}>
        <button
          type="button"
          disabled={disabled}
          onClick={onCreate}
          className="group text-left disabled:opacity-50"
        >
          <div
            className={projectThumbFrameClass(
              cn(
                'flex items-center justify-center border-dashed shadow-none',
                'group-hover:border-[var(--muted)] group-hover:bg-[var(--accent-soft)] group-hover:shadow-none'
              )
            )}
          >
            <HiOutlinePlus className="h-8 w-8 text-[var(--muted)]" strokeWidth={1.5} />
          </div>
          <div className="mt-2.5 min-w-0 px-0.5">
            <div className="truncate text-[13px] font-medium text-[var(--ink)]">
              {t('home.newProject')}
            </div>
            {/* Reserve same second-line height as project “Updated …” meta */}
            <p className="mt-0.5 truncate text-[11px] text-transparent" aria-hidden>
              &nbsp;
            </p>
          </div>
        </button>

        {loading
          ? Array.from({ length: RECENT_HOME_LIMIT }).map((_, i) => (
              <div key={`sk-${i}`} aria-busy="true">
                <div className={projectThumbFrameClass('skeleton-bone shadow-none')} />
                <div className="mt-2.5 space-y-1.5 px-0.5">
                  <div className="skeleton-bone h-3 w-3/4" />
                  <div className="skeleton-bone h-2.5 w-1/2" />
                </div>
              </div>
            ))
          : recent.map((item) => {
              const time = formatUpdatedLabel(
                Number(item.updatedAt) || Number(item.openedAt) || undefined,
                locale
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => void openProject(item)}
                  className="group text-left disabled:opacity-50"
                >
                  <ProjectThumb item={item} />
                  <div className="mt-2.5 min-w-0 px-0.5">
                    <div className="truncate text-[13px] font-medium text-[var(--ink)]">
                      {item.name || t('home.untitled')}
                    </div>
                    {time ? (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                        {t('home.updatedAt', { time })}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}
