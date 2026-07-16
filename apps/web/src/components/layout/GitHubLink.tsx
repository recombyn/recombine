import { useTranslation } from 'react-i18next';
import { FaGithub } from 'react-icons/fa';
import { cn } from '@/utils/classnames';

/** Project repository — override with VITE_GITHUB_URL if needed. */
export const GITHUB_URL =
  (import.meta.env.VITE_GITHUB_URL as string | undefined)?.trim() ||
  'https://github.com/Tianmeng/resume-creation-web';

type Props = {
  className?: string;
};

export default function GitHubLink({ className }: Props) {
  const { t } = useTranslation();
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer noopener"
      title={t('common.github')}
      aria-label={t('common.github')}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center text-[var(--ink)]',
        'transition hover:opacity-70',
        className
      )}
    >
      <FaGithub className="h-5 w-5" aria-hidden />
    </a>
  );
}
