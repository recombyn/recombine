export type OfficialCaseCategory = 'resume' | 'poster' | 'ui';

/**
 * Plaza / inspiration card meta.
 * Official cases use nameKey + file; user posts use name + source:'plaza'.
 */
export type OfficialCaseMeta = {
  id: string;
  category: OfficialCaseCategory;
  /** i18n key under home.cases.* (official) */
  nameKey?: string;
  /** Direct display title (user plaza posts) */
  name?: string;
  /** Path to official JSON under /mock/cases */
  file?: string;
  /** Gallery card height/width — intentional masonry variety (display only). */
  thumbRatio?: number;
  source?: 'official' | 'plaza';
  authorName?: string;
  authorAvatar?: string | null;
  /** Stable author id for follow / profile (plaza userId or official:recombyn). */
  authorUserId?: string;
  createdAt?: number;
};

export type OfficialCasesIndex = {
  categories: OfficialCaseCategory[];
  cases: OfficialCaseMeta[];
};

let cached: OfficialCasesIndex | null = null;

export async function loadOfficialCasesIndex(): Promise<OfficialCasesIndex> {
  if (cached) return cached;
  const res = await fetch('/mock/cases/index.json');
  if (!res.ok) throw new Error(`Failed to load cases index (${res.status})`);
  const data = (await res.json()) as OfficialCasesIndex;
  cached = {
    ...data,
    cases: (data.cases || []).map((c) => ({ ...c, source: c.source || 'official' })),
  };
  return cached;
}

export async function loadOfficialCaseDocument(file: string): Promise<unknown> {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load case (${res.status})`);
  return res.json();
}

/** Resolve display title for official (i18n) or user plaza posts. */
export function resolveCaseTitle(
  meta: OfficialCaseMeta,
  t: (key: string) => string
): string {
  const direct = (meta.name || '').trim();
  if (direct) return direct;
  if (meta.nameKey) return t(`home.cases.${meta.nameKey}`);
  return meta.id;
}

export function caseAuthorLabel(
  meta: OfficialCaseMeta,
  t: (key: string) => string
): string {
  const name = (meta.authorName || '').trim();
  if (name) return name;
  return t('home.cases.author');
}

/** Stable id for follow + public profile links. */
export function caseAuthorId(meta: OfficialCaseMeta): string {
  const raw = (meta.authorUserId || '').trim();
  if (raw) return raw;
  if (meta.source === 'plaza') return `plaza:${meta.id}`;
  return 'official:recombyn';
}
