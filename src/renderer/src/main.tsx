import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from '@/App';
import { ToastProvider } from '@/lib/toast';
import { ActionProvider } from '@/lib/action';
import { StoreProvider } from '@/lib/store';
import { ThemeProvider, applyThemeClass, getInitialTheme } from '@/lib/theme';

// Apply the persisted theme before first paint to avoid a flash.
applyThemeClass(getInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ActionProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
        </ActionProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
