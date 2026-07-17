/** Persist editor navigation across login redirect. */

const KEY = 'recombyn-pending-editor';

export type PendingEditorNav = {
  createNew?: boolean;
  fromHomeAgent?: boolean;
};

export function savePendingEditorNav(nav: PendingEditorNav) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(nav));
  } catch {
    /* ignore */
  }
}

export function takePendingEditorNav(): PendingEditorNav | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as PendingEditorNav;
  } catch {
    return null;
  }
}
