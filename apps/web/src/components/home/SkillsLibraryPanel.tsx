import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineQuestionMarkCircle } from 'react-icons/hi2';
import { Button, Dialog, message, Switch, Tooltip } from '@/components/base';
import {
  deleteDesignUserSkill,
  fetchDesignSkills,
  importDesignSkillZip,
  setDesignSkillEnabled,
  type DesignSkillCard,
  type DesignSkillImportExisting,
} from '@/apis/design';
import { cn } from '@/utils/classnames';

/** Skills toolbox — 2 cols on phone; denser from lg. */
const DEFAULT_SKILL_GRID =
  'grid w-full grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

/** Loading placeholders only — not real totals (API count unknown until fetch). */
const SKILL_SKELETON_MINE = 2;
/** ~one row on the 2xl 5-col grid. */
const SKILL_SKELETON_OFFICIAL = 5;

const SKILL_CARD_SHELL =
  'w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-left shadow-[0_2px_10px_rgba(15,23,42,0.06)]';

function formatSkillUpdatedAt(ts: number | null | undefined, locale: string): string {
  if (!ts) return '—';
  const date = new Date(ts * (ts < 1e12 ? 1000 : 1));
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(locale.startsWith('zh') ? 'zh-CN' : locale);
}

/** Same shell + title / line-clamp-2 desc metrics as the real skill card. */
function SkillCardSkeleton(): ReactNode {
  return (
    <div className={SKILL_CARD_SHELL} aria-hidden>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex h-[21px] items-center">
            <div className="rcb-skeleton-bone h-3.5 w-[58%]" />
          </div>
          <div className="mt-1 space-y-1">
            <div className="rcb-skeleton-bone h-[18px] w-full" />
            <div className="rcb-skeleton-bone h-[18px] w-[80%]" />
          </div>
        </div>
        <div className="rcb-skeleton-bone mt-0.5 h-5 w-9 shrink-0 !rounded-full" />
      </div>
    </div>
  );
}

function SkillGroupSkeleton({
  title,
  count,
  gridClassName = DEFAULT_SKILL_GRID,
}: {
  title: string;
  count: number;
  gridClassName?: string;
}): ReactNode {
  return (
    <section className="space-y-2" aria-busy="true" aria-label={title}>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      <div className={gridClassName}>
        {Array.from({ length: count }, (_, i) => (
          <SkillCardSkeleton key={`sk-${i}`} />
        ))}
      </div>
    </section>
  );
}

function stopCardBubble(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function SkillCard({
  row,
  canDelete,
  deleteLabel,
  enableLabel,
  onDelete,
  onToggle,
  onPreview,
}: {
  row: DesignSkillCard;
  canDelete: boolean;
  deleteLabel: string;
  enableLabel: string;
  onDelete: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
  onPreview: (row: DesignSkillCard) => void;
}): ReactNode {
  const on = row.enabled !== false;

  const onKeyActivate = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onPreview(row);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPreview(row)}
      onKeyDown={onKeyActivate}
      className={cn(
        SKILL_CARD_SHELL,
        'cursor-pointer transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.1)]',
        !on && 'opacity-55'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium leading-[21px] text-[var(--ink)]">
            {row.name}
          </div>
          {row.whenToUse ? (
            <div className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-[var(--muted)]">
              {row.whenToUse}
            </div>
          ) : null}
        </div>
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={stopCardBubble}
          onKeyDown={stopCardBubble}
        >
          <span title={enableLabel} className="inline-flex shrink-0">
            <Switch checked={on} onChange={(next) => onToggle(row.id, next)} />
          </span>
          {canDelete ? (
            <button
              type="button"
              className="text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
              onClick={() => onDelete(row.id)}
            >
              {deleteLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SkillGroup({
  title,
  rows,
  canDelete,
  emptyText,
  deleteLabel,
  enableLabel,
  onDelete,
  onToggle,
  onPreview,
  gridClassName = DEFAULT_SKILL_GRID,
}: {
  title: string;
  rows: DesignSkillCard[];
  canDelete: boolean;
  emptyText: string;
  deleteLabel: string;
  enableLabel: string;
  onDelete: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
  onPreview: (row: DesignSkillCard) => void;
  /** Per-group grid; mine / official can differ if needed. */
  gridClassName?: string;
}): ReactNode {
  const body = !rows.length ? (
    <p className="text-[13px] text-[var(--muted)]">{emptyText}</p>
  ) : (
    <div className={gridClassName}>
      {rows.map((row) => (
        <SkillCard
          key={row.id}
          row={row}
          canDelete={canDelete}
          deleteLabel={deleteLabel}
          enableLabel={enableLabel}
          onDelete={onDelete}
          onToggle={onToggle}
          onPreview={onPreview}
        />
      ))}
    </div>
  );

  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      {body}
    </section>
  );
}

function upsertMineCard(rows: DesignSkillCard[], card: DesignSkillCard): DesignSkillCard[] {
  const next = rows.filter((r) => r.id !== card.id);
  return [{ ...card, mine: true }, ...next];
}

/**
 * Home Skills library — zip pack upload + list mine / official.
 * Mine and official load separately; upload/delete only refresh mine.
 */
function SkillsLibraryPanel(): ReactNode {
  const { t, i18n } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const [mine, setMine] = useState<DesignSkillCard[]>([]);
  const [official, setOfficial] = useState<DesignSkillCard[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingOfficial, setLoadingOfficial] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [overwrite, setOverwrite] = useState<DesignSkillImportExisting | null>(null);
  const [preview, setPreview] = useState<DesignSkillCard | null>(null);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    try {
      const res = await fetchDesignSkills({ mine: true });
      setMine(res.items || []);
    } catch {
      message.error(t('agent.requestFailed'));
    } finally {
      setLoadingMine(false);
    }
  }, [t]);

  /** One manage fetch fills both sections — avoids design rate-limit (20/min). */
  useEffect(() => {
    let cancelled = false;
    setLoadingMine(true);
    setLoadingOfficial(true);
    void (async () => {
      try {
        const res = await fetchDesignSkills({ manage: true });
        if (cancelled) return;
        const items = res.items || [];
        setMine(items.filter((x) => x.mine));
        setOfficial(items.filter((x) => !x.mine));
      } catch {
        if (!cancelled) message.error(t('agent.requestFailed'));
      } finally {
        if (!cancelled) {
          setLoadingMine(false);
          setLoadingOfficial(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: do not re-fetch when `t` identity changes (HMR / i18n).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  const patchMineFromImport = useCallback((card: DesignSkillCard | null | undefined) => {
    if (!card?.id) {
      void loadMine();
      return;
    }
    setMine((rows) => upsertMineCard(rows, card));
  }, [loadMine]);

  const runImport = useCallback(
    async (file: File, forceOverwrite: boolean) => {
      setScanning(true);
      try {
        const res = await importDesignSkillZip(file, { overwrite: forceOverwrite });
        if (res.status === 'exists' && res.existing) {
          pendingFileRef.current = file;
          setOverwrite(res.existing);
          return;
        }
        if (res.status === 'rejected') {
          const err = res.scan?.errors?.[0] || t('agent.requestFailed');
          message.error(t('agent.skillsImportRejected', { reason: err }));
          return;
        }
        pendingFileRef.current = null;
        setOverwrite(null);
        patchMineFromImport(res.item);
        message.success(t('agent.skillsImportOk'));
      } catch (err) {
        message.error(err instanceof Error ? err.message : t('agent.requestFailed'));
      } finally {
        setScanning(false);
      }
    },
    [patchMineFromImport, t]
  );

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.zip')) {
      message.warning(t('agent.skillsZipOnly'));
      return;
    }
    void runImport(file, false);
  };

  const onConfirmOverwrite = () => {
    const file = pendingFileRef.current;
    if (!file) {
      setOverwrite(null);
      return;
    }
    setOverwrite(null);
    void runImport(file, true);
  };

  const onDelete = async (id: number) => {
    const prev = mine;
    setMine((rows) => rows.filter((r) => r.id !== id));
    try {
      await deleteDesignUserSkill(id);
    } catch (err) {
      setMine(prev);
      message.error(err instanceof Error ? err.message : t('agent.requestFailed'));
    }
  };

  const onToggleMine = async (id: number, enabled: boolean) => {
    const prev = mine;
    setMine((rows) => rows.map((r) => (r.id === id ? { ...r, enabled } : r)));
    try {
      await setDesignSkillEnabled(id, enabled);
    } catch (err) {
      setMine(prev);
      message.error(err instanceof Error ? err.message : t('agent.requestFailed'));
    }
  };

  const onToggleOfficial = async (id: number, enabled: boolean) => {
    const prev = official;
    setOfficial((rows) => rows.map((r) => (r.id === id ? { ...r, enabled } : r)));
    try {
      await setDesignSkillEnabled(id, enabled);
    } catch (err) {
      setOfficial(prev);
      message.error(err instanceof Error ? err.message : t('agent.requestFailed'));
    }
  };

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="truncate text-[18px] font-semibold tracking-tight text-[var(--ink)]">
            {t('home.skillsTitle')}
          </h1>
          <Tooltip
            tip={t('home.skillsHint')}
            placement="bottom"
            offset={8}
            popupClassName="h-auto max-w-[280px] whitespace-normal py-2 leading-[1.4]"
          >
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
              aria-label={t('home.skillsHint')}
            >
              <HiOutlineQuestionMarkCircle className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
          </Tooltip>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--canvas)]"
          onClick={() => fileRef.current?.click()}
        >
          {t('agent.skillsUpload')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={onPickFile}
        />
      </header>

      <div className="space-y-6">
        {loadingMine ? (
          <SkillGroupSkeleton title={t('agent.skillsMine')} count={SKILL_SKELETON_MINE} />
        ) : (
          <SkillGroup
            title={t('agent.skillsMine')}
            rows={mine}
            canDelete
            emptyText={t('agent.skillsEmptyMine')}
            deleteLabel={t('agent.skillsDelete')}
            enableLabel={t('agent.skillsEnable')}
            onDelete={(id) => void onDelete(id)}
            onToggle={(id, enabled) => void onToggleMine(id, enabled)}
            onPreview={setPreview}
          />
        )}
        {loadingOfficial ? (
          <SkillGroupSkeleton
            title={t('agent.skillsOfficial')}
            count={SKILL_SKELETON_OFFICIAL}
          />
        ) : (
          <SkillGroup
            title={t('agent.skillsOfficial')}
            rows={official}
            canDelete={false}
            emptyText={t('agent.mentionSkillEmpty')}
            deleteLabel={t('agent.skillsDelete')}
            enableLabel={t('agent.skillsEnable')}
            onDelete={() => undefined}
            onToggle={(id, enabled) => void onToggleOfficial(id, enabled)}
            onPreview={setPreview}
          />
        )}
      </div>

      <Dialog
        show={Boolean(preview)}
        onClose={() => setPreview(null)}
        width={560}
        title={preview?.name || t('agent.skill')}
        titleClassName="!pb-1 !text-[16px] !font-semibold !leading-snug"
        bodyClassName="pt-2"
        footerClassName="!pt-5"
        className="!overflow-visible !bg-[var(--surface)] !p-5"
        footer={
          <Button size="small" type="primary" onClick={() => setPreview(null)}>
            {t('common.confirm')}
          </Button>
        }
      >
        {preview ? (
          <div className="space-y-3.5">
            {preview.whenToUse || preview.description ? (
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                {preview.whenToUse || preview.description}
              </p>
            ) : null}
            <div className="max-h-[min(52vh,420px)] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3.5 py-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {t('agent.skillsPreviewBody')}
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-[var(--ink)]">
                {preview.promptPositive?.trim() || t('agent.skillsPreviewEmpty')}
              </pre>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        show={scanning}
        onClose={() => setScanning(false)}
        width={420}
        title={t('agent.skillsScanTitle')}
        titleClassName="!pb-1 !text-[16px] !font-semibold !leading-snug"
        bodyClassName="pt-2"
        footerClassName="!pt-5"
        className="!overflow-visible !bg-[var(--surface)] !p-5"
        footer={
          <Button size="small" type="primary" onClick={() => setScanning(false)}>
            {t('agent.skillsScanGotIt')}
          </Button>
        }
      >
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          {t('agent.skillsScanBody')}
        </p>
      </Dialog>

      <Dialog
        show={Boolean(overwrite)}
        onClose={() => {
          pendingFileRef.current = null;
          setOverwrite(null);
        }}
        width={420}
        title={t('agent.skillsOverwriteTitle')}
        titleClassName="!pb-1 !text-[16px] !font-semibold !leading-snug"
        bodyClassName="pt-2"
        footerClassName="!pt-5"
        className="!overflow-visible !bg-[var(--surface)] !p-5"
        footer={
          <>
            <Button
              size="small"
              type="default"
              onClick={() => {
                pendingFileRef.current = null;
                setOverwrite(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button size="small" type="primary" onClick={onConfirmOverwrite}>
              {t('agent.skillsOverwriteConfirm')}
            </Button>
          </>
        }
      >
        {overwrite ? (
          <div className="space-y-3.5">
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              {t('agent.skillsOverwriteBody', { name: overwrite.name })}
            </p>
            <dl className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <dt className="shrink-0 text-[var(--muted)]">
                  {t('agent.skillsOverwriteVersion')}
                </dt>
                <dd className="truncate font-medium text-[var(--ink)]">
                  {overwrite.packVersion || '—'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <dt className="shrink-0 text-[var(--muted)]">
                  {t('agent.skillsOverwriteUpdated')}
                </dt>
                <dd className="truncate font-medium text-[var(--ink)]">
                  {formatSkillUpdatedAt(overwrite.updatedAt, i18n.language)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <dt className="shrink-0 text-[var(--muted)]">
                  {t('agent.skillsOverwriteUses')}
                </dt>
                <dd className="truncate font-medium text-[var(--ink)]">
                  {overwrite.useCount ?? 0}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

export default memo(SkillsLibraryPanel);
