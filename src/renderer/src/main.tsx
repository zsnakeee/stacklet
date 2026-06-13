import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from '@/App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { installGlobalErrorReporting } from '@/lib/error-reporting';
import { ToastProvider } from '@/lib/toast';
import { ActionProvider } from '@/lib/action';
import { StoreProvider } from '@/lib/store';
import { ThemeProvider, applyThemeClass, getInitialTheme } from '@/lib/theme';
import {
  LanguageProvider,
  applyLanguageAttrs,
  getInitialLanguage,
} from '@/lib/i18n';

// Capture uncaught errors / rejected promises / console.error into app.log as
// early as possible, before any app code runs.
installGlobalErrorReporting();

// Apply the persisted theme + language before first paint to avoid a flash.
applyThemeClass(getInitialTheme());
applyLanguageAttrs(getInitialLanguage());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
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
    </ErrorBoundary>
  </StrictMode>,
);

// React has mounted (the SplashScreen now covers the window) — remove the static
// HTML boot loader so the two don't stack.
document.getElementById('boot-loader')?.remove();
