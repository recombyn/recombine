import { Outlet } from 'react-router-dom';
import { LoginDialogHost } from '@/components/layout/LoginDialog';

export default function AppShell() {
  return (
    <div className="h-screen overflow-hidden bg-[var(--canvas)]">
      <Outlet />
      <LoginDialogHost />
    </div>
  );
}
