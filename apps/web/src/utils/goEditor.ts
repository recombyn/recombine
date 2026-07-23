import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { store } from '@/store';
import { buildLoginUrl } from '@/utils/authReturnTo';

export type GoEditorOpts = {
  createNew?: boolean;
  fromHomeAgent?: boolean;
  /** Open this project; falls back to Redux currentId when omitted. */
  projectId?: string | null;
};

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
      if (!user) {
        navigate(buildLoginUrl(path));
        return;
      }
      navigate(path);
    },
    [user, navigate]
  );
}
