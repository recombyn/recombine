import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import EditorPage from '@/pages/EditorPage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import SharePage from '@/pages/SharePage';
import { GuestOnly, RequireAuth } from '@/router/AuthGuards';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<GuestOnly />}>
            <Route path="login" element={<LoginPage initialMode="login" />} />
            <Route path="register" element={<LoginPage initialMode="register" />} />
          </Route>

          {/* Public share links — no auth required */}
          <Route path="s/:shareId" element={<SharePage />} />

          <Route element={<RequireAuth />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="editor" element={<EditorPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
