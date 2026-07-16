import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlineDocument,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import { Button, Dialog } from '@/components/base';
import { cn } from '@/utils/classnames';

export type ImportFileKind = 'image' | 'pdf' | 'docx' | 'design';

export const IMPORT_ACCEPT: Record<ImportFileKind, string> = {
  image: 'image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp',
  pdf: '.pdf,application/pdf',
  docx: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  design: '.psd,.xd,.rp,.fig,application/octet-stream',
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (kind: ImportFileKind) => void;
};

type KindOption = {
  id: ImportFileKind;
  icon: typeof HiOutlinePhoto;
  titleKey: string;
  formats: string;
};

export default function ImportFileDialog({ open, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ImportFileKind>('image');

  const options: KindOption[] = useMemo(
    () => [
      {
        id: 'image',
        icon: HiOutlinePhoto,
        titleKey: 'importFile.image',
        formats: 'PNG · JPG · WEBP',
      },
      {
        id: 'pdf',
        icon: HiOutlineDocument,
        titleKey: 'importFile.pdf',
        formats: 'PDF',
      },
      {
        id: 'docx',
        icon: HiOutlineDocumentText,
        titleKey: 'importFile.word',
        formats: 'DOC · DOCX',
      },
      {
        id: 'design',
        icon: HiOutlineSquares2X2,
        titleKey: 'importFile.design',
        formats: 'Figma · Axure · PS · XD',
      },
    ],
    []
  );

  useEffect(() => {
    if (open) setKind('image');
  }, [open]);

  return (
    <Dialog
      show={open}
      onClose={onClose}
      width={800}
      title={t('importFile.title')}
      titleClassName="!text-[16px] !font-semibold !pb-1"
      bodyClassName="pt-1"
      className="!w-full !overflow-visible !bg-[var(--surface)] !p-6"
      footer={
        <>
          <Button size="small" type="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              onConfirm(kind);
              onClose();
            }}
          >
            {t('importFile.import')}
          </Button>
        </>
      }
    >
      <p className="mb-6 text-[13px] text-[var(--muted)]">{t('importFile.hint')}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((opt) => {
          const TypeIcon = opt.icon;
          const selected = kind === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setKind(opt.id)}
              onDoubleClick={() => {
                setKind(opt.id);
                onConfirm(opt.id);
                onClose();
              }}
              className={cn(
                'flex h-full min-w-0 flex-col items-center gap-2.5 rounded-xl px-3 py-8 text-center transition',
                selected
                  ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                  : 'bg-[var(--canvas)] hover:bg-[var(--accent-soft)]'
              )}
            >
              <TypeIcon className="h-8 w-8 text-[var(--ink)]" strokeWidth={1.5} />
              <span className="text-[13px] font-medium text-[var(--ink)]">{t(opt.titleKey)}</span>
              <span className="text-[12px] text-[var(--muted)]">{opt.formats}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
