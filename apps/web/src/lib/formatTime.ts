import i18n from '@/i18n';

/**
 * Relative time for template cards (common product convention):
 * - < 1 min  → just now
 * - < 1 hour → N minutes ago
 * - < 1 day  → N hours ago
 * - ≤ 3 days → N days ago
 * - > 3 days → absolute date (year included when not current year)
 */
export function formatTemplateTime(timestamp: number | string | Date | null | undefined) {
  if (timestamp == null || timestamp === '') return '';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return '';

  const now = Date.now();
  const diffMs = Math.max(0, now - ms);
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const locale = i18n.resolvedLanguage || i18n.language || 'zh-CN';

  if (diffMin < 1) return i18n.t('time.justNow');
  if (diffMin < 60) return i18n.t('time.minutesAgo', { count: diffMin });
  if (diffHours < 24) return i18n.t('time.hoursAgo', { count: diffHours });
  if (diffDays <= 3) return i18n.t('time.daysAgo', { count: diffDays });

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(locale, {
    year: sameYear ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}
