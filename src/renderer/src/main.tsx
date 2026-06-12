import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from '@/App';
import { ToastProvider } from '@/lib/toast';
import { ActionProvider } from '@/lib/action';
import { StoreProvider } from '@/lib/store';
import { ThemeProvider, applyThemeClass, getInitialTheme } from '@/lib/theme';
import {
  LanguageProvider,
  applyLanguageAttrs,
  getInitialLanguage,
} from '@/lib/i18n';

// Apply the persisted theme + language before first paint to avoid a flash.
applyThemeClass(getInitialTheme());
applyLanguageAttrs(getInitialLanguage());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <ActionProvider>
            <StoreProvider>
              <App />
            </StoreProvider>
          </ActionProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);
