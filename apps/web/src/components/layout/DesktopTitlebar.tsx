import { useCallback, useEffect, useState, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { VscChromeClose, VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';
import AppLogo from '@/components/base/AppLogo';
import { cn } from '@/utils/classnames';

export const DESKTOP_TITLEBAR_H = 35;

function isTauriShell(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || import.meta.env.TAURI_ENV_PLATFORM);
}

/** True when running inside the Tauri desktop shell. */
export function useIsDesktopShell(): boolean {
  return isTauriShell();
}

type WinApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onResized: (cb: () => void) => Promise<() => void>;
};

async function getWin(): Promise<WinApi | null> {
  if (!isTauriShell()) return null;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/**
 * Custom titlebar — same `--rail` chrome as the home left nav so the OS bar
 * does not sit as a mismatched light/black strip above the app.
 */
function DesktopTitlebar() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const win = await getWin();
      if (!win || cancelled) return;
      const sync = async () => {
        try {
          setMaximized(await win.isMaximized());
        } catch {
          /* ignore */
        }
      };
      await sync();
      unlisten = await win.onResized(() => {
        void sync();
      });
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const onMinimize = useCallback(() => {
    void getWin().then((w) => w?.minimize());
  }, []);
  const onToggleMax = useCallback(() => {
    void getWin().then((w) => w?.toggleMaximize());
  }, []);
  const onClose = useCallback(() => {
    void getWin().then((w) => w?.close());
  }, []);

  if (!isTauriShell()) return null;

  return (
    <header
      className="relative z-[80] flex shrink-0 select-none items-stretch border-b border-[var(--line)] bg-[var(--rail)] text-[var(--ink)]"
      style={{ height: DESKTOP_TITLEBAR_H }}
    >
      {/* Aligns with 64px home rail — brand mark lives here on desktop. */}
      <div
        className="flex w-16 shrink-0 items-center justify-center"
        data-tauri-drag-region
      >
        <AppLogo size={22} />
      </div>

      <div
        className="flex min-w-0 flex-1 items-center gap-2 pl-0.5"
        data-tauri-drag-region
      >
        <span
          className="truncate text-[13px] font-medium tracking-tight text-[var(--ink)]/90"
          data-tauri-drag-region
        >
          {t('app.name')}
        </span>
      </div>

      <div className="flex shrink-0 items-stretch">
        <TitlebarBtn label="Minimize" onClick={onMinimize}>
          <VscChromeMinimize className="h-[14px] w-[14px]" />
        </TitlebarBtn>
        <TitlebarBtn label={maximized ? 'Restore' : 'Maximize'} onClick={onToggleMax}>
          {maximized ? (
            <VscChromeRestore className="h-[14px] w-[14px]" />
          ) : (
            <VscChromeMaximize className="h-[14px] w-[14px]" />
          )}
        </TitlebarBtn>
        <TitlebarBtn label="Close" onClick={onClose} danger>
          <VscChromeClose className="h-[14px] w-[14px]" />
        </TitlebarBtn>
      </div>
    </header>
  );
}

function TitlebarBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex w-11 items-center justify-center text-[var(--ink)]/70 transition-colors',
        danger
          ? 'hover:bg-[#e81123] hover:text-white'
          : 'hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-[var(--ink)]'
      )}
    >
      {children}
    </button>
  );
}

export default memo(DesktopTitlebar);
