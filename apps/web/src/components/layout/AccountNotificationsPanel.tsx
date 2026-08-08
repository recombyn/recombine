/**
 * Account settings — announcements & notifications inbox.
 * Content from admin-managed API; read state stays local.
 * Each tab loads its own list via GET /notices?kind=…
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck, HiOutlineMegaphone } from 'react-icons/hi2';
import { fetchNotices, type NoticeDto } from '@/apis/notices';
import { SegmentedControl } from '@/components/base';
import { cn } from '@/utils/classnames';

type NoticeTab = 'announcement' | 'notification';

const READ_KEY = 'resume.notices.read.v1';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x)));
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function formatNoticeTime(
  ts: number,
  lang: string,
  t: (key: string, opts?: Record<string, unknown>) => string
) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 86400000) return t('account.notices.today');
  if (diff < 86400000 * 2) return t('account.notices.yesterday');
  try {
    return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function toMs(ts: number) {
  return ts > 0 && ts < 1e12 ? ts * 1000 : ts;
}

/** Notifications & announcements panel for AccountSettingsDialog. */
function AccountNotificationsPanel(): ReactNode {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<NoticeTab>('announcement');
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const [itemsByTab, setItemsByTab] = useState<Record<NoticeTab, NoticeDto[]>>({
    announcement: [],
    notification: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Partial<Record<NoticeTab, boolean>>>({});
  const loadGenRef = useRef(0);

  const loadTab = useCallback(async (kind: NoticeTab) => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    try {
      const res = await fetchNotices({ kind });
      if (gen !== loadGenRef.current) return;
      const list = (res.items || [])
        .filter((n) => n.kind === kind)
        .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
      setItemsByTab((prev) => ({ ...prev, [kind]: list }));
      setLoadedTabs((prev) => ({ ...prev, [kind]: true }));
    } catch {
      if (gen !== loadGenRef.current) return;
      setItemsByTab((prev) => ({ ...prev, [kind]: [] }));
      setLoadedTabs((prev) => ({ ...prev, [kind]: true }));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, []);

  // Enter panel / switch tab → request that kind (no prefetch of the other tab).
  useEffect(() => {
    void loadTab(tab);
  }, [loadTab, tab]);

  const items = itemsByTab[tab];

  const unreadByTab = useMemo(() => {
    const count = (kind: NoticeTab) =>
      itemsByTab[kind].reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0);
    return {
      announcement: count('announcement'),
      notification: count('notification'),
    };
  }, [itemsByTab, readIds]);

  const markAllRead = () => {
    const next = new Set(readIds);
    for (const n of itemsByTab[tab]) next.add(n.id);
    setReadIds(next);
    saveReadIds(next);
  };

  const markRead = (id: string) => {
    if (readIds.has(id)) return;
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    saveReadIds(next);
  };

  const tabs: { id: NoticeTab; label: string }[] = [
    { id: 'announcement', label: t('account.notices.tabAnnouncement') },
    { id: 'notification', label: t('account.notices.tabNotification') },
  ];

  const unreadInTab = unreadByTab[tab];
  const lang = i18n.resolvedLanguage || i18n.language || 'zh-CN';
  const showLoading = loading && !loadedTabs[tab];

  return (
    <div className="flex min-h-[360px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={tab}
          onChange={(next) => setTab(next as NoticeTab)}
          options={tabs.map((item) => ({
            value: item.id,
            label: item.label,
            badge: unreadByTab[item.id] > 0,
          }))}
        />

        <button
          type="button"
          disabled={unreadInTab <= 0}
          onClick={markAllRead}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] transition',
            unreadInTab > 0
              ? 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]'
              : 'cursor-default text-[var(--muted)] opacity-40'
          )}
        >
          <HiOutlineCheck className="h-3.5 w-3.5" strokeWidth={2} />
          {t('account.notices.markAllRead')}
        </button>
      </div>

      <div className="mt-5 min-h-0 flex-1">
        {showLoading ? (
          <div className="flex h-[280px] items-center justify-center text-[13px] text-[var(--muted)]">
            {t('common.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-[var(--muted)]">
            <HiOutlineMegaphone className="h-8 w-8 opacity-40" strokeWidth={1.25} />
            <p className="text-[13px]">{t('account.notices.empty')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const unread = !readIds.has(item.id);
              const createdMs = toMs(item.createdAt);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => markRead(item.id)}
                    className={cn(
                      'w-full rounded-xl border px-4 py-3.5 text-left transition',
                      unread
                        ? 'border-[#f07818]/35 bg-[#f07818]/10'
                        : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--accent-soft)]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {unread ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f07818]" />
                          ) : null}
                          <h4 className="truncate text-[14px] font-semibold text-[var(--ink)]">
                            {item.title}
                          </h4>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
                          {item.body}
                        </p>
                      </div>
                      <time className="shrink-0 text-[11px] text-[var(--muted)]">
                        {formatNoticeTime(createdMs, lang, t)}
                      </time>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(AccountNotificationsPanel);
