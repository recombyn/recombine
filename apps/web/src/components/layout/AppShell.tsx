import { memo } from 'react';
import { Outlet } from 'react-router-dom';
import DesktopTitlebar, {
  DesktopTitlebarProvider,
  useIsDesktopShell,
} from '@/components/layout/DesktopTitlebar';
import { LoginDialogHost } from '@/components/layout/LoginDialog';

function AppShell() {
  const desktop = useIsDesktopShell();

  return (
    <DesktopTitlebarProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--canvas)]">
        {desktop ? <DesktopTitlebar /> : null}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Outlet />
          <LoginDialogHost />
        </div>
      </div>
    </DesktopTitlebarProvider>
  );
}

export default memo(AppShell);
