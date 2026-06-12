import { useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppBackground } from '@/components/shell/AppBackground';
import { TitleBar } from '@/components/shell/TitleBar';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { bundledById, useStore } from '@/lib/store';
import type { Status } from '@/lib/types';
import { Dashboard } from '@/pages/Dashboard';
import { Sites } from '@/pages/Sites';
import { SiteDetail } from '@/pages/SiteDetail';
import { Services } from '@/pages/Services';
import { ServiceDetail } from '@/pages/ServiceDetail';
import { Logs } from '@/pages/Logs';
import { Mailpit } from '@/pages/Mailpit';
import { Settings } from '@/pages/Settings';

function pageTitle(pathname: string, status: Status | null): string {
  const raw = pathname.replace(/\/+$/, '') || '/';
  if (raw.startsWith('/services/')) {
    const id = raw.split('/')[2];
    return bundledById(status, id)?.name ?? 'Service';
  }
  if (raw.startsWith('/sites/')) {
    const name = decodeURIComponent(raw.split('/')[2] ?? '');
    const site = status?.sites?.find((s) => s.name === name);
    return site?.hostname ?? name ?? 'Site';
  }
  if (raw === '/sites') return 'Sites';
  if (raw === '/services') return 'Services';
  if (raw === '/logs') return 'Logs';
  if (raw === '/mailpit') return 'Mailpit';
  if (raw === '/settings') return 'Settings';
  return 'Dashboard';
}

function BootErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="border-b border-danger/40 bg-danger/10 px-6 py-4 text-sm">
      <strong className="text-danger">Stacklet failed to start</strong>
      <pre className="mt-2 whitespace-pre-wrap text-text-secondary">{message}</pre>
      <p className="mt-2 text-text-muted">
        Try rebuilding (<code>npm run build</code>) and restart. Open DevTools for details.
      </p>
    </div>
  );
}

const SIDEBAR_KEY = 'stacklet-sidebar-collapsed';

function Layout() {
  const location = useLocation();
  const { status, bootError } = useStore();
  const title = pageTitle(location.pathname, status);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      <AppBackground />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar title={title} />
          {bootError && <BootErrorBanner message={bootError} />}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sites" element={<Sites />} />
              <Route path="/sites/:name" element={<SiteDetail />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:id" element={<ServiceDetail />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/mailpit" element={<Mailpit />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <Layout />
    </HashRouter>
  );
}
