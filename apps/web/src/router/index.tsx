import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import AboutPage from '@/pages/AboutPage';
import EditorPage from '@/pages/EditorPage';
import HomePage from '@/pages/HomePage';
import GoogleOAuthCallbackPage from '@/pages/GoogleOAuthCallbackPage';
import LegalPage from '@/pages/LegalPage';
import LoginPage from '@/pages/LoginPage';
import PublicProfilePage from '@/pages/PublicProfilePage';
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
          {/* Must stay outside GuestOnly so the OAuth return can finish signing in. */}
          <Route path="login/google/callback" element={<GoogleOAuthCallbackPage />} />

          {/* Public — browse home without signing in */}
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="terms" element={<LegalPage kind="terms" />} />
          <Route path="privacy" element={<LegalPage kind="privacy" />} />
          <Route path="u/:userId" element={<PublicProfilePage />} />
          <Route path="s/:shareId" element={<SharePage />} />

          <Route element={<RequireAuth />}>
            <Route path="editor" element={<EditorPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
