import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { listAssets, type AssetKind, type UserAsset } from '@/apis/assets';
import { cn } from '@/utils/classnames';

export type MentionAttachItem = {
  /** Composer attachment key, skill key, or `asset:{id}`. */
  id: string;
  label: string;
  thumbUrl?: string;
  /** Optional secondary line (skill whenToUse). */
  hint?: string;
  /** Group label for skill picker / attach+asset sections. */
  group?: string;
};

export const MENTION_ASSET_ID_PREFIX = 'asset:';

type Props = {
  items: MentionAttachItem[];
  query: string;
  onPick: (id: string) => void;
  /**
   * Library assets chosen from `@` (when `includeAssets`).
   * Prefer this over parsing `asset:` ids in `onPick`.
   */
  onPickLibraryAsset?: (asset: UserAsset) => void;
  className?: string;
  /** `attach` = @ attachments (+ optional library assets); `skill` = / skills. */
  variant?: 'attach' | 'skill';
  /** Fetch GET /assets into the `@` list. Default true for attach variant. */
  includeAssets?: boolean;
  /** Limit library kinds (default: image + video + audio). */
  assetKinds?: Array<'image' | 'video' | 'audio'>;
};

function isAllowedAsset(
  a: UserAsset,
  kinds: Array<'image' | 'video' | 'audio'> | undefined
): boolean {
  if (a.kind !== 'image' && a.kind !== 'video' && a.kind !== 'audio') return false;
  if (!kinds?.length) return true;
  return kinds.includes(a.kind);
}

function filterMentionItems(items: MentionAttachItem[], query: string): MentionAttachItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.id.toLowerCase().includes(q) ||
      (it.hint || '').toLowerCase().includes(q)
  );
}

function assetMentionLabel(asset: UserAsset, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const prompt = String(asset.prompt || '').trim();
  if (prompt) return prompt.length > 36 ? `${prompt.slice(0, 36)}…` : prompt;
  if (asset.kind === 'video') return t('me.assetKindVideo', { defaultValue: '视频' });
  if (asset.kind === 'audio') return t('me.assetKindAudio', { defaultValue: '音频' });
  return t('me.assetKindImage', { defaultValue: '图片' });
}

/**
 * Composer mention picker — `@` attachments (+ library assets) or `/` skills.
 */
function MentionAttachPanel({
  items,
  query,
  onPick,
  onPickLibraryAsset,
  className,
  variant = 'attach',
  includeAssets = variant === 'attach',
  assetKinds,
}: Props): ReactNode {
  const { t } = useTranslation();
  const [libraryAssets, setLibraryAssets] = useState<UserAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const assetsRef = useRef<UserAsset[]>([]);
  assetsRef.current = libraryAssets;
  const kindsKey = (assetKinds || []).join(',');

  useEffect(() => {
    if (variant !== 'attach' || !includeAssets) return;
    let cancelled = false;
    setAssetsLoading(true);
    const kindFilter: AssetKind | null =
      assetKinds?.length === 1 ? assetKinds[0]! : null;
    void listAssets({ page: 1, pageSize: 48, kind: kindFilter })
      .then((res) => {
        if (cancelled) return;
        setLibraryAssets((res.items || []).filter((a) => isAllowedAsset(a, assetKinds)));
      })
      .catch(() => {
        if (!cancelled) setLibraryAssets([]);
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // kindsKey captures assetKinds membership without array identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, includeAssets, kindsKey]);

  const attachGroup = t('agent.mentionGroupAttachments', { defaultValue: '附件' });
  const assetsGroup = t('agent.mentionGroupAssets', { defaultValue: '资产' });

  const attachItems = items.map((it) => ({
    ...it,
    group: it.group || attachGroup,
  }));

  const assetItems: MentionAttachItem[] =
    variant === 'attach' && includeAssets
      ? libraryAssets.map((a) => ({
          id: `${MENTION_ASSET_ID_PREFIX}${a.id}`,
          label: assetMentionLabel(a, t),
          hint:
            a.kind === 'video'
              ? t('me.assetKindVideo', { defaultValue: '视频' })
              : a.kind === 'audio'
                ? t('me.assetKindAudio', { defaultValue: '音频' })
                : t('me.assetKindImage', { defaultValue: '图片' }),
          group: assetsGroup,
          ...(a.kind === 'image' && a.url ? { thumbUrl: a.url } : {}),
        }))
      : [];

  const merged = [...attachItems, ...assetItems];
  const filtered = filterMentionItems(merged, query);
  const emptyKey =
    variant === 'skill'
      ? items.length === 0
        ? 'agent.mentionSkillEmpty'
        : 'agent.mentionSkillNoMatch'
      : merged.length === 0
        ? 'agent.mentionAttachEmpty'
        : 'agent.mentionAttachNoMatch';

  const handlePick = (id: string) => {
    if (id.startsWith(MENTION_ASSET_ID_PREFIX) && onPickLibraryAsset) {
      const assetId = id.slice(MENTION_ASSET_ID_PREFIX.length);
      const asset = assetsRef.current.find((a) => a.id === assetId);
      if (asset) {
        onPickLibraryAsset(asset);
        return;
      }
    }
    onPick(id);
  };

  let lastGroup = '';

  return (
    <div
      className={cn(
        'w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]',
        className
      )}
    >
      <div className="max-h-[min(320px,calc(100vh-160px))] overflow-y-auto p-1">
        {assetsLoading && variant === 'attach' && includeAssets && !filtered.length ? (
          <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
            {t('common.loading', { defaultValue: '加载中…' })}
          </div>
        ) : !filtered.length ? (
          <div className="px-2 py-4 text-center text-[12px] text-[var(--muted)]">
            {t(emptyKey)}
          </div>
        ) : (
          filtered.map((it) => {
            const showGroup = Boolean(it.group && it.group !== lastGroup);
            if (it.group) lastGroup = it.group;
            return (
              <div key={it.id}>
                {showGroup ? (
                  <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    {it.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--canvas)]"
                  onClick={() => handlePick(it.id)}
                >
                  {it.thumbUrl ? (
                    <img
                      src={it.thumbUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded border border-[var(--line)] bg-[var(--canvas)] object-cover"
                    />
                  ) : variant === 'skill' ? null : (
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold text-[var(--muted)]"
                      aria-hidden
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <path d="M9 9h6v6H9z" />
                      </svg>
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-[var(--ink)]">
                      {it.label}
                    </span>
                    {it.hint ? (
                      <span className="block truncate text-[10px] text-[var(--muted)]">
                        {it.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default memo(MentionAttachPanel);
