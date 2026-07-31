export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

export function getStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply resolved theme via data-theme (CSS files own the tokens). */
export function applyThemeColors(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  const next = resolved;
  const prev = root.getAttribute('data-theme');
  if (prev === next && root.classList.contains('dark') === (next === 'dark')) {
    return;
  }

  // Suppress background/color transitions so CSS variable swaps don't interpolate/flash.
  root.classList.add('theme-switching');
  root.setAttribute('data-theme', next);
  root.classList.toggle('dark', next === 'dark');
  // Force style flush while transitions are disabled.
  void root.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('theme-switching');
    });
  });
}

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

export function applyTheme(mode: ThemeMode = getStoredThemeMode()) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }

  if (typeof window === 'undefined') return;

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mediaListener) {
    mq.removeEventListener('change', mediaListener);
    mediaListener = null;
  }
  if (mode === 'system') {
    mediaListener = () => applyThemeColors(resolveTheme('system'));
    mq.addEventListener('change', mediaListener);
  }

  applyThemeColors(resolveTheme(mode));
}
