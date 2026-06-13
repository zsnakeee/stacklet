import { lazy, Suspense, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AppBackground } from '@/components/shell/AppBackground';
import { TitleBar } from '@/components/shell/TitleBar';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { bundledById, useStore } from '@/lib/store';
import type { Status } from '@/lib/types';

const Dashboard = lazy(() =>
  import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Sites = lazy(() => import('@/pages/Sites').then((m) => ({ default: m.Sites })));
const SiteDetail = lazy(() =>
  import('@/pages/SiteDetail').then((m) => ({ default: m.SiteDetail })),
);
const Services = lazy(() =>
  import('@/pages/Services').then((m) => ({ default: m.Services })),
);
const ServiceDetail = lazy(() =>
  import('@/pages/ServiceDetail').then((m) => ({ default: m.ServiceDetail })),
);
const Logs = lazy(() => import('@/pages/Logs').then((m) => ({ default: m.Logs })));
const Mailpit = lazy(() => import('@/pages/Mailpit').then((m) => ({ default: m.Mailpit })));
const Settings = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.Settings })),
);

function PageFallback() {
  return <div className="min-h-[12rem] animate-pulse rounded-xl bg-surface/30" aria-hidden />;
}

function pageTitle(pathname: string, status: Status | null, t: TFunction): string {
  const raw = pathname.replace(/\/+$/, '') || '/';
  if (raw.startsWith('/services/')) {
    const id = raw.split('/')[2];
    return bundledById(status, id)?.name ?? t('title.service');
  }
  if (raw.startsWith('/sites/')) {
    const name = decodeURIComponent(raw.split('/')[2] ?? '');
    const site = status?.sites?.find((s) => s.name === name);
    return site?.hostname ?? name ?? t('title.site');
  }
  if (raw === '/sites') return t('nav.sites');
  if (raw === '/services') return t('nav.services');
  if (raw === '/logs') return t('nav.logs');
  if (raw === '/mailpit') return t('nav.mailpit');
  if (raw === '/settings') return t('nav.settings');
  return t('nav.dashboard');
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
  const { t } = useTranslation();
  const title = pageTitle(location.pathname, status, t);
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
            <Suspense fallback={<PageFallback />}>
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
            </Suspense>
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
