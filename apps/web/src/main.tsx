import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import 'virtual:svg-icons/register';
import '@/i18n';
import '@/theme/light.css';
import '@/theme/dark.css';
import { applyTheme, getStoredThemeMode } from '@/theme';
import '@/styles/index.css';
import App from '@/App';
import { store } from '@/store';
import { MessageContainer } from '@/components/base';
import { loadFontCatalog } from '@/components/rcb/scene/document/fontCatalog';

applyTheme(getStoredThemeMode());
void loadFontCatalog();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
      <MessageContainer />
    </Provider>
  </React.StrictMode>
);
