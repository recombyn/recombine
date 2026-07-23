export type OfficialCaseCategory = 'website' | 'mobile' | 'image' | 'poster';

/** Normalize plaza category to the home hero set. */
export function normalizeCaseCategory(raw: string | undefined | null): OfficialCaseCategory {
  const c = (raw || '').trim().toLowerCase();
  if (c === 'website' || c === 'mobile' || c === 'image' || c === 'poster') return c;
  return 'website';
}

/**
 * Plaza / inspiration card meta.
 * All feed items are plaza-backed (admin-approved). Official demos are seeded into plaza.
 */
export type OfficialCaseMeta = {
  id: string;
  category: OfficialCaseCategory;
  /** i18n key under home.cases.* */
  nameKey?: string;
  /** Direct display title (plaza posts) */
  name?: string;
  /** Gallery card height/width — intentional masonry variety (display only). */
  thumbRatio?: number;
  source?: 'official' | 'plaza';
  authorName?: string;
  authorAvatar?: string | null;
  /** Plaza feed coverDocument. */
  coverDocument?: unknown | null;
  /** Stable author id for profile links. */
  authorUserId?: string;
  createdAt?: number;
  likeCount?: number;
  useCount?: number;
};

/** Resolve display title for plaza posts or i18n keys. */
export function resolveCaseTitle(
  meta: OfficialCaseMeta,
  t: (key: string) => string
): string {
  const direct = (meta.name || '').trim();
  if (direct) return direct;
  if (meta.nameKey) return t(`home.cases.${meta.nameKey}`);
  return meta.id;
}

/** Agent prompt prefill when user taps 「做同款」. */
export function resolveCasePrompt(
  meta: OfficialCaseMeta,
  t: (key: string, opts?: { defaultValue?: string }) => string
): string {
  if (meta.nameKey) {
    return t(`home.cases.prompt.${meta.nameKey}`, {
      defaultValue: t('home.cases.promptFallback'),
    });
  }
  const title = (meta.name || '').trim();
  if (title) {
    return t('home.cases.promptFromTitle', {
      title,
      defaultValue: `Create a design similar to「${title}」. ${t('home.cases.promptFallback')}`,
    });
  }
  return t('home.cases.promptFallback');
}

export function caseAuthorLabel(
  meta: OfficialCaseMeta,
  t: (key: string) => string
): string {
  const name = (meta.authorName || '').trim();
  if (name) return name;
  return t('home.cases.author');
}

/** Stable id for public profile links. */
export function caseAuthorId(meta: OfficialCaseMeta): string {
  const raw = (meta.authorUserId || '').trim();
  if (raw) return raw;
  if (meta.source === 'plaza') return `plaza:${meta.id}`;
  return 'official:recombyn';
}
