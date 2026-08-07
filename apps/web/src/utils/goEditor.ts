import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { store } from '@/store';
import { buildLoginUrl } from '@/utils/authReturnTo';
import {
  basenameToI18nLang,
  getLocaleBasename,
  withLocalePrefix,
} from '@/i18n/localePath';
import {
  openEditorWindowWithBoot,
  type HomeAgentBoot,
} from '@/utils/homeAgentBoot';

export type GoEditorOpts = {
  createNew?: boolean;
  fromHomeAgent?: boolean;
  /** Open this project; falls back to Redux currentId when omitted. */
  projectId?: string | null;
  /** Open editor in a new browser tab/window (home project cards). */
  newWindow?: boolean;
  /**
   * Home → editor handoff payload. Not placed in the URL (URL only has createNew / fromHomeAgent).
   * Seeded into the new tab's sessionStorage; cleared after the editor consumes it.
   */
  homeAgentBoot?: HomeAgentBoot;
};

/** Router paths are basename-relative; `window.open` needs the locale prefix. */
export function toBrowserAppPath(routerPath: string): string {
  const raw = String(routerPath || '').trim() || '/';
  const qIdx = raw.indexOf('?');
  const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const search = qIdx >= 0 ? raw.slice(qIdx) : '';
  const basename = getLocaleBasename();
  if (!basename) return raw.startsWith('/') ? raw : `/${raw}`;
  const lang = basenameToI18nLang(basename);
  return `${withLocalePrefix(pathname || '/', lang)}${search}`;
}

/** Build editor path (intent stays in the URL, including after login ?from=). */
export function buildEditorIntentPath(opts?: GoEditorOpts): string {
  const createNew = Boolean(opts?.createNew);
  const fromHomeAgent = Boolean(opts?.fromHomeAgent);
  const fromStore = (store.getState() as any)?.editor?.currentId as string | null | undefined;
  const projectId = (opts?.projectId ?? (createNew ? null : fromStore) ?? '').trim();

  if (createNew) {
    const q = new URLSearchParams();
    q.set('createNew', '1');
    if (fromHomeAgent) q.set('fromHomeAgent', '1');
    return `/editor?${q.toString()}`;
  }
  if (projectId) {
    const base = `/editor/${encodeURIComponent(projectId)}`;
    if (!fromHomeAgent) return base;
    const q = new URLSearchParams();
    q.set('fromHomeAgent', '1');
    return `${base}?${q.toString()}`;
  }
  return '/editor';
}

/** Navigate to /editor/:projectId; guests go to login with ?from= intent. */
export function useGoEditor() {
  const user = useSelector((s: any) => s.auth.user);
  const navigate = useNavigate();

  return useCallback(
    (opts?: GoEditorOpts) => {
      const path = buildEditorIntentPath(opts);
      const dest = user ? path : buildLoginUrl(path);
      if (opts?.newWindow) {
        const browserDest = toBrowserAppPath(dest);
        if (opts.homeAgentBoot) {
          const opened = openEditorWindowWithBoot(browserDest, opts.homeAgentBoot);
          if (!opened) navigate(dest);
          return;
        }
        window.open(browserDest, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(dest);
    },
    [user, navigate]
  );
}
