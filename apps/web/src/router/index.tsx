import { useEffect, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import AccountSettingsPage from '@/pages/AccountSettingsPage';
import EditorPage from '@/pages/EditorPage';
import HomePage from '@/pages/HomePage';
import GoogleOAuthCallbackPage from '@/pages/GoogleOAuthCallbackPage';
import LoginRedirectPage from '@/pages/LoginRedirectPage';
import ActivateEmailPage from '@/pages/ActivateEmailPage';
import SharePage from '@/pages/SharePage';
import { RequireAuth } from '@/router/AuthGuards';
import { buildLoginUrl } from '@/utils/authReturnTo';
import {
  basenameToI18nLang,
  getLocaleBasename,
} from '@/i18n/localePath';

/** Product routes set app document title. */
function DocumentTitleSync() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.title = t('app.documentTitle');
  }, [t, i18n.language]);
  return null;
}

/** Keep i18n in sync when basename (URL locale prefix) is active. */
function LocaleSync({ basename }: { basename: string }) {
  const { i18n } = useTranslation();
  useEffect(() => {
    const next = basenameToI18nLang(basename);
    if (i18n.language !== next) {
      void i18n.changeLanguage(next);
    }
  }, [basename, i18n]);
  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Product entry: `/` → home (not marketing landing). */}
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="login" element={<LoginRedirectPage />} />
        <Route path="activate/:id" element={<ActivateEmailPage />} />
        <Route path="register" element={<Navigate to={buildLoginUrl()} replace />} />
        <Route path="forgot-password" element={<Navigate to={buildLoginUrl()} replace />} />
        {/* OAuth return can finish signing in without the login modal. */}
        <Route path="login/google/callback" element={<GoogleOAuthCallbackPage />} />

        {/* Product workspace */}
        <Route path="home" element={<HomePage />} />
        <Route path="s/:shareId" element={<SharePage />} />

        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountSettingsPage />} />
          {/* One route so /editor → /editor/:id does not remount and drop home-agent draft. */}
          <Route path="editor/:projectId?" element={<EditorPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

/**
 * Locale via URL prefix:
 * - `/home` → English (default, no prefix)
 * - `/zh/home`, `/zh-tw/home`, `/ja/home` → basename so Link/navigate stay unchanged
 */
function AppRouter() {
  const [basename] = useState(() => getLocaleBasename());

  return (
    <BrowserRouter basename={basename || undefined} key={basename || 'en'}>
      <LocaleSync basename={basename} />
      <DocumentTitleSync />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default memo(AppRouter);
