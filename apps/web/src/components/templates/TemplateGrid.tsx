import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BiEditAlt } from 'react-icons/bi';
import {
  HiOutlineCheck,
  HiOutlineEllipsisHorizontal,
  HiOutlineListBullet,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { RiDeleteBinLine } from 'react-icons/ri';
import { Button, Dialog, Dropdown, Input, message } from '@/components/base';
import type { MenuItemType } from '@/components/base/dropdown/MenuItem';
import { formatTemplateTime } from '@/lib/formatTime';
import { cn } from '@/utils/classnames';
import {
  deleteTemplate,
  deleteTemplates,
  openTemplate,
  renameTemplateById,
} from '@/store/modules/editor';
import TemplateThumbnail from './TemplateThumbnail';

function ImportSkeletonCard({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <article className="group" aria-busy="true" aria-label={t('home.importing')}>
      <div className="h-[170px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--accent-soft)]">
        <div className="flex h-full flex-col justify-center gap-2.5 px-4 py-5">
          <div className="skeleton-bone h-2.5 w-[42%]" />
          <div className="skeleton-bone h-2 w-full" />
          <div className="skeleton-bone h-2 w-[94%]" />
          <div className="skeleton-bone h-2 w-[78%]" />
          <div className="skeleton-bone mt-2 h-2.5 w-[36%]" />
          <div className="skeleton-bone h-2 w-full" />
          <div className="skeleton-bone h-2 w-[88%]" />
          <div className="skeleton-bone h-2 w-[64%]" />
        </div>
      </div>
      <div className="mt-2.5 space-y-1.5 px-0.5">
        <div className="skeleton-bone h-3.5 w-[78%]" />
        <div className="skeleton-bone h-2.5 w-[46%]" />
      </div>
      <span className="sr-only">
        {name || t('home.untitled')} — {t('home.importing')}
      </span>
    </article>
  );
}

function TemplateCard({
  item,
  selected,
  selectMode,
  onToggle,
  onDelete,
  onRename,
}: {
  item: any;
  selected: boolean;
  selectMode: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const openEditor = () => {
    dispatch(openTemplate(item.id));
    navigate('/editor');
  };

  const menuItems: MenuItemType[] = [
    {
      key: 'rename',
      label: (
        <span className="inline-flex items-center gap-2">
          <BiEditAlt className="h-3.5 w-3.5" />
          {t('home.rename')}
        </span>
      ),
    },
    {
      key: 'delete',
      label: (
        <span className="inline-flex items-center gap-2 text-red-500">
          <RiDeleteBinLine className="h-3.5 w-3.5" />
          {t('common.delete')}
        </span>
      ),
    },
  ];

  const onMenu = (key: string) => {
    if (key === 'rename') onRename();
    if (key === 'delete') onDelete();
  };

  return (
    <article className="group">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-[var(--accent-soft)] transition group-hover:shadow-[0_8px_24px_rgba(31,35,41,0.08)]',
          selected
            ? 'border-[#8eb4e8] shadow-[0_0_0_2px_rgba(91,141,239,0.35)]'
            : 'border-[var(--line)] hover:border-[var(--color-border-default-base-hover)]'
        )}
      >
        <button
          type="button"
          className="relative block w-full text-left"
          onClick={() => {
            if (selectMode) onToggle();
            else openEditor();
          }}
        >
          <div className="h-[170px] w-full overflow-hidden">
            <TemplateThumbnail document={item.document} />
          </div>
        </button>

        {selectMode ? (
          <button
            type="button"
            aria-label="select"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              'absolute left-1.5 top-1.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border transition',
              selected
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-brand)]'
                : 'border-[var(--line)] bg-[var(--surface)]/90 text-transparent'
            )}
          >
            <HiOutlineCheck className="h-2.5 w-2.5" strokeWidth={3} />
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="block w-full truncate text-left text-[13px] font-medium text-[var(--ink)] hover:opacity-80"
            onClick={onRename}
            title={t('home.rename')}
          >
            {item.name || t('home.untitled')}
          </button>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{formatTemplateTime(item.updatedAt)}</p>
        </div>
        <div
          className="shrink-0 pt-0.5"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Dropdown
            trigger="click"
            placement="bottom-end"
            offset={4}
            items={menuItems}
            onClick={onMenu}
            floatingClassName="z-[600]"
            popupClassName="rounded-lg min-w-[140px] !bg-[var(--surface)] shadow-[0_8px_28px_rgba(31,35,41,0.16)] ring-1 ring-[var(--line)]"
          >
            <button
              type="button"
              title={t('common.more')}
              className="flex items-center justify-center p-0.5 text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              <HiOutlineEllipsisHorizontal className="h-4 w-4" />
            </button>
          </Dropdown>
        </div>
      </div>
    </article>
  );
}

export default function TemplateGrid({
  templates,
  title,
  fileCountLabel,
  importing = false,
  importingName = '',
}: {
  templates: any[];
  title: string;
  fileCountLabel: string;
  importing?: boolean;
  importingName?: string;
}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<any | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    const ids = new Set(templates.map((item) => item.id));
    setSelected((prev) => prev.filter((id) => ids.has(id)));
  }, [templates]);

  useEffect(() => {
    if (selectMode && templates.length === 0) {
      setSelectMode(false);
      setSelected([]);
    }
  }, [templates.length, selectMode]);

  useEffect(() => {
    if (renameTarget) setRenameDraft(renameTarget.name || '');
  }, [renameTarget]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected([]);
  };

  const allSelected = templates.length > 0 && selected.length === templates.length;

  const selectAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(templates.map((item) => item.id));
  };

  const batchDelete = () => {
    if (!selected.length) return;
    const count = selected.length;
    dispatch(deleteTemplates(selected));
    message.success(t('home.batchDeleted', { count }));
    exitSelectMode();
  };

  const closeRename = () => setRenameTarget(null);

  const commitRename = () => {
    if (!renameTarget) return;
    const next = renameDraft.trim() || t('home.untitled');
    dispatch(renameTemplateById({ id: renameTarget.id, name: next }));
    closeRename();
  };

  return (
    <div>
      <div className="mb-2.5 flex min-h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            title={selectMode ? t('home.cancelSelect') : t('home.batchSelect')}
            aria-pressed={selectMode}
            onClick={() => {
              if (selectMode) exitSelectMode();
              else setSelectMode(true);
            }}
            className={cn(
              '-ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
              selectMode
                ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
            )}
          >
            <HiOutlineListBullet className="h-4 w-4" />
          </button>
          <h2 className="truncate text-[14px] font-semibold text-[var(--ink)]">{title}</h2>
          {selectMode && selected.length > 0 ? (
            <span className="shrink-0 text-[12px] text-[var(--muted)]">
              {t('home.selectedCount', { count: selected.length })}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {selectMode ? (
            <>
              <Button size="small" type="default" onClick={selectAll}>
                <span className="inline-flex items-center gap-1">
                  <HiOutlineCheck className="h-3.5 w-3.5" />
                  {t('home.selectAll')}
                </span>
              </Button>
              <Button size="small" type="default" onClick={exitSelectMode}>
                <span className="inline-flex items-center gap-1">
                  <HiOutlineXMark className="h-3.5 w-3.5" />
                  {t('home.cancelSelect')}
                </span>
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={!selected.length}
                className="!border-red-500 !bg-red-500 hover:!bg-red-600 disabled:!opacity-40"
                onClick={batchDelete}
              >
                <span className="inline-flex items-center gap-1">
                  <RiDeleteBinLine className="h-3.5 w-3.5" />
                  {t('home.batchDelete')}
                </span>
              </Button>
            </>
          ) : (
            <span className="whitespace-nowrap text-[12px] tracking-normal text-[var(--muted)]">
              {fileCountLabel}
            </span>
          )}
        </div>
      </div>

      {!templates?.length && !importing ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] px-6 py-16 text-center">
          <p className="text-[13px] text-[var(--muted)]">{t('home.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-x-4 gap-y-5">
          {importing ? <ImportSkeletonCard name={importingName} /> : null}
          {templates.map((item) => (
            <TemplateCard
              key={item.id}
              item={item}
              selected={selected.includes(item.id)}
              selectMode={selectMode}
              onToggle={() => toggle(item.id)}
              onRename={() => setRenameTarget(item)}
              onDelete={() => {
                dispatch(deleteTemplate(item.id));
                setSelected((prev) => prev.filter((id) => id !== item.id));
                message.success(t('common.delete'));
              }}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
