import { Navigate, Route, Routes } from 'react-router-dom'
import { DocsLayout } from '@/layouts/DocsLayout'
import { LegalLayout } from '@/layouts/LegalLayout'
import { DocPage } from '@/pages/DocPage'
import { LegalPage } from '@/pages/LegalPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/guide/getting-started" replace />} />

      <Route element={<DocsLayout />}>
        <Route path="/guide/:slug" element={<DocPage />} />
        <Route path="/features/import-fonts" element={<Navigate to="/features/import" replace />} />
        <Route path="/features/:slug" element={<DocPage />} />
        <Route path="/faq" element={<Navigate to="/faq/" replace />} />
        <Route path="/faq/" element={<DocPage />} />
        <Route path="/sponsor" element={<DocPage />} />
      </Route>

      <Route path="/legal" element={<LegalLayout />}>
        <Route index element={<Navigate to="/legal/terms" replace />} />
        <Route path=":slug" element={<LegalPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/guide/getting-started" replace />} />
    </Routes>
  )
}
