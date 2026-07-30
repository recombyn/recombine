import { useMemo, useState, type ReactNode, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Input, message } from '@/components/base';
import ProjectCard, {
  NewProjectCard,
  ProjectCardSkeleton,
} from '@/components/home/ProjectCard';
import {
  removeProjectFromCloud,
  renameProjectOnCloud,
  requestProjectFlush,
} from '@/components/editor/useProjectCloudSync';
import { deleteTemplate, renameTemplateById } from '@/store/modules/editor';
import { cn } from '@/utils/classnames';

const RECENT_HOME_LIMIT = 4;

type ProjectItem = {
  id: string;
  name?: string;
  document?: unknown;
  thumbnail?: string | string[] | null;
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

function sortRecentProjects(projects: ProjectItem[]): ProjectItem[] {
  return [...projects]
    .sort(
      (a, b) =>
        (Number(b.openedAt) || Number(b.updatedAt) || 0) -
        (Number(a.openedAt) || Number(a.updatedAt) || 0)
    )
    .slice(0, RECENT_HOME_LIMIT);
}

/** Home — recent owned projects (same ProjectCard as My projects; no Publish). */
function RecentProjectsSection({
  projects,
  loading = false,
  disabled = false,
  onCreate,
  onViewAll,
}: Props): ReactNode {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const currentId = useSelector((s: any) => s.editor?.currentId as string | null);
  const [renameTarget, setRenameTarget] = useState<ProjectItem | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const recent = useMemo(() => sortRecentProjects(projects), [projects]);

  const commitRenameFor = (item: ProjectItem, name: string) => {
    const next = name.trim() || t('home.untitled');
    const id = String(item.id || '');
    if (!id) return;
    dispatch(renameTemplateById({ id, name: next }));
    if (currentId === id) {
      requestProjectFlush();
    } else {
      void renameProjectOnCloud(id, next);
    }
  };

  const openRename = (item: ProjectItem) => {
    setRenameTarget(item);
    setRenameDraft(item.name || t('home.untitled'));
  };

  const closeRename = () => setRenameTarget(null);

  const commitRename = () => {
    if (!renameTarget) return;
    commitRenameFor(renameTarget, renameDraft);
    closeRename();
  };

  const commitDelete = async (item: ProjectItem) => {
    const id = String(item.id || '');
    if (!id) return;
    try {
      await removeProjectFromCloud(id);
      dispatch(deleteTemplate(id));
      message.destructive(t('common.delete'));
    } catch {
      message.error(t('home.batchDeleteFailed'));
    }
  };

  const gridClass =
    'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

  return (
    <section className="w-full min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">
          {t('home.recentProjects')}
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 text-[13px] text-[var(--ink)]/55 transition-colors hover:text-[var(--ink)]"
        >
          {t('home.viewAll')}
        </button>
      </div>

      <div className={cn(gridClass, 'w-full')}>
        <NewProjectCard disabled={disabled} onClick={onCreate} />

        {loading
          ? Array.from({ length: RECENT_HOME_LIMIT }).map((_, i) => (
              <ProjectCardSkeleton key={`sk-${i}`} />
            ))
          : recent.map((item) => (
              <ProjectCard
                key={item.id}
                item={item}
                disabled={disabled}
                showPublish={false}
                onRename={() => openRename(item)}
                onCommitRename={(name) => commitRenameFor(item, name)}
                onDelete={() => void commitDelete(item)}
              />
            ))}
      </div>

      <Dialog
        show={Boolean(renameTarget)}
        onClose={closeRename}
        width={400}
        title={t('home.rename')}
        titleClassName="!text-[16px] !font-semibold !pb-2"
        className="!bg-[var(--surface)] !p-5"
        footer={
          <>
            <Button size="small" type="default" onClick={closeRename}>
              {t('common.cancel')}
            </Button>
            <Button size="small" type="primary" onClick={commitRename}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <Input
          size="middle"
          type="filled"
          autoFocus
          value={renameDraft}
          placeholder={t('home.renamePlaceholder')}
          onChange={(e) => setRenameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') closeRename();
          }}
          className="!rounded-md"
        />
      </Dialog>
    </section>
  );
}

export default memo(RecentProjectsSection);
