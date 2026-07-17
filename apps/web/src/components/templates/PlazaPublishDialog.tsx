import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HiCheck, HiOutlineSparkles } from 'react-icons/hi2';
import { Button, Dialog } from '@/components/base';
import TemplateThumbnail from '@/components/templates/TemplateThumbnail';
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
 * Publish-to-plaza confirm + thank-you success (light motion).
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

  useEffect(() => {
    if (open) setPhase('confirm');
  }, [open]);

  const handleSubmit = async () => {
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
      footerClassName={cn(
        '!px-5',
        phase === 'success' && '!justify-center'
      )}
    >
      {phase === 'confirm' ? (
        <div className="px-5 pb-1 pt-1">
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--canvas)]">
            <div className="aspect-[16/10] w-full">
              {document ? (
                <TemplateThumbnail document={document} fit="cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-[var(--accent-soft)] text-[12px] text-[var(--muted)]">
                  {projectName}
                </div>
              )}
            </div>
          </div>
          <p className="mt-3.5 text-[13px] font-medium text-[var(--ink)]">{projectName}</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {t('plaza.publishHint')}
          </p>
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
