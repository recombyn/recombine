import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { savePendingEditorNav, type PendingEditorNav } from '@/lib/pendingEditorNav';

/** Navigate to /editor; guests are sent to login and return afterward. */
export function useGoEditor() {
  const user = useSelector((s: any) => s.auth.user);
  const navigate = useNavigate();

  return useCallback(
    (state?: PendingEditorNav) => {
      if (!user) {
        savePendingEditorNav({
          createNew: Boolean(state?.createNew),
          fromHomeAgent: Boolean(state?.fromHomeAgent),
        });
        navigate('/login', { state: { from: '/editor' } });
        return;
      }
      navigate('/editor', { state: state || {} });
    },
    [user, navigate]
  );
}
