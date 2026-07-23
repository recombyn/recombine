import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiCheck, HiOutlineExclamationTriangle, HiOutlineSparkles } from 'react-icons/hi2';
import { Button, Dialog } from '@/components/base';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
import { checkPlazaCoverForPublish } from '@/utils/plazaCover';
import { cn } from '@/utils/classnames';

type PlazaPublishDialogProps = {
  open: boolean;
  publishing: boolean;
  projectName: string;
  document?: unknown;
  onClose: () => void;
  onSubmit: () => Promise<void> | void;
};

/**
 * Publish-to-plaza confirm — requires at least one artboard before submit.
 */
export default function PlazaPublishDialog({
  open,
  publishing,
  projectName,
  document,
  onClose,
  onSubmit,
}: PlazaPublishDialogProps): ReactNode {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'confirm' | 'success'>('confirm');

  const coverCheck = useMemo(() => checkPlazaCoverForPublish(document), [document]);

  useEffect(() => {
    if (open) setPhase('confirm');
  }, [open]);

  const handleSubmit = async () => {
    if (!coverCheck.ok) return;
    try {
      await onSubmit();
      setPhase('success');
    } catch {
      /* error toast handled by caller */
    }
  };

  const handleClose = () => {
    if (publishing) return;
    onClose();
  };

  const frameHint = (() => {
    const frame = coverCheck.frame;
    if (!frame) return null;
    const w = Math.round(frame.width);
    const h = Math.round(frame.height);
    const name = String(frame.name || '').trim() || t('plaza.artboardUntitled');
    return t('plaza.artboardDetail', { name, w, h });
  })();

  return (
    <Dialog
      show={open}
      onClose={handleClose}
      width={440}
      title={phase === 'confirm' ? t('plaza.publish') : undefined}
      titleClassName="!px-5 !text-[16px] !font-semibold !pb-2"
      className="!overflow-hidden !bg-[var(--surface)] !px-0 !pb-4 !pt-5"
      bodyClassName="!px-0 !py-0"
      footer={
        phase === 'confirm' ? (
          <>
            <Button size="small" type="default" disabled={publishing} onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              size="small"
              type="primary"
              loading={publishing}
              disabled={!coverCheck.ok}
              onClick={() => void handleSubmit()}
            >
              {t('plaza.submit')}
            </Button>
          </>
        ) : (
          <Button size="small" type="primary" className="!min-w-[96px]" onClick={handleClose}>
            {t('plaza.thanksDone')}
          </Button>
        )
      }
      footerClassName={cn('!px-5', phase === 'success' && '!justify-center')}
    >
      {phase === 'confirm' ? (
        <div className="px-5 pb-1 pt-1">
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--canvas)]">
            <div className="aspect-[680/385] w-full">
              {coverCheck.coverDocument ? (
                <TemplateThumbnail document={coverCheck.coverDocument} fit="cover" />
              ) : (
                <div className="h-full w-full bg-[var(--accent-soft)]" />
              )}
            </div>
          </div>

          <p className="mt-3.5 text-[13px] font-medium text-[var(--ink)]">{projectName}</p>

          <ul className="mt-3 space-y-2 rounded-xl border border-[var(--line)] bg-[var(--canvas)]/60 px-3 py-2.5">
            <li className="flex items-start gap-2 text-[12.5px] leading-snug">
              <CheckIcon ok={coverCheck.hasCover} />
              <span className={coverCheck.hasCover ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}>
                {t('plaza.artboardCheck')}
                {frameHint ? (
                  <span className="mt-0.5 block text-[11.5px] text-[var(--muted)]">{frameHint}</span>
                ) : null}
              </span>
            </li>
          </ul>

          {!coverCheck.ok ? (
            <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-700">
              <HiOutlineExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('plaza.artboardMissingHint')}
            </p>
          ) : (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
              {t('plaza.publishHint')}
            </p>
          )}
        </div>
      ) : (
        <div className="plaza-thanks relative px-6 pb-2 pt-8 text-center">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <span className="plaza-thanks-orb plaza-thanks-orb-a" />
            <span className="plaza-thanks-orb plaza-thanks-orb-b" />
            <span className="plaza-thanks-orb plaza-thanks-orb-c" />
          </div>

          <div className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center">
            <span className="plaza-thanks-ring" aria-hidden />
            <span className="plaza-thanks-badge inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--on-brand)] shadow-[0_10px_28px_rgba(15,23,42,0.18)]">
              <HiCheck className="h-7 w-7" strokeWidth={2.25} />
            </span>
          </div>

          <div className="plaza-thanks-copy relative mt-5">
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
              <HiOutlineSparkles className="h-3.5 w-3.5" />
              {t('plaza.thanksEyebrow')}
            </div>
            <h3 className="text-[20px] font-semibold tracking-tight text-[var(--ink)]">
              {t('plaza.thanksTitle')}
            </h3>
            <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-relaxed text-[var(--muted)]">
              {t('plaza.thanksBody', { name: projectName })}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function CheckIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      <HiCheck className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  ) : (
    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--line)] text-[var(--muted)]">
      <span className="h-1 w-1 rounded-full bg-current" />
    </span>
  );
}
