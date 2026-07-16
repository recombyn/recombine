import { Outlet } from 'react-router-dom';

export default function AppShell() {
  return (
    <div className="h-screen overflow-hidden bg-[var(--canvas)]">
      <Outlet />
    </div>
  );
}
