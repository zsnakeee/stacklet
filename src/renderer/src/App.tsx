import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AppBackground } from '@/components/shell/AppBackground';
import { GlobalProgressBar } from '@/components/shell/GlobalProgressBar';
import Preloader from '@/components/react-bits/preloader';
import { TitleBar } from '@/components/shell/TitleBar';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { bundledById, useStore } from '@/lib/store';
import { devmgr } from '@/lib/devmgr';
import { useToast } from '@/lib/toast';
import type { Status } from '@/lib/types';

/** Toast once when the launch update-check finds a newer release. */
function useUpdateNotice() {
  const toast = useToast();
  const notified = useRef<string | null>(null);
  useEffect(() => {
    const off = devmgr.update.onStatus((s) => {
      if (s.state === 'available' && notified.current !== s.version) {
        notified.current = s.version;
        toast.info(`Update ${s.version} available — open Settings → Updates to install.`);
      }
    });
    return off;
  }, [toast]);
}

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
  return (
    <div className="flex min-h-[12rem] items-center justify-center" aria-hidden>
      <span className="size-6 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
    </div>
  );
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
  const { t } = useTranslation();
  return (
    <div role="alert" className="border-b border-danger/40 bg-danger/10 px-6 py-4 text-sm">
      <strong className="text-danger">{t('boot.failedTitle')}</strong>
      <pre className="mt-2 whitespace-pre-wrap text-text-secondary">{message}</pre>
      <p className="mt-2 text-text-muted">
        <Trans i18nKey="boot.rebuildHint" components={{ code: <code /> }} />
      </p>
    </div>
  );
}

const SIDEBAR_KEY = 'stacklet-sidebar-collapsed';
const ONBOARDED_KEY = 'stacklet-onboarded';

/** First-run welcome: import from Laragon or start fresh (shown once). */
function FirstRunOnboarding() {
  const navigate = useNavigate();
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) !== '1';
    } catch {
      return false;
    }
  });
  if (!show) return null;
  const done = (route?: string) => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // ignore
    }
    setShow(false);
    if (route) navigate(route);
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-2xl">
        <div className="text-2xl font-bold tracking-tight text-foreground">
          Welcome to Stack<span className="text-primary">let</span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">How would you like to get started?</p>
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => done('/settings')}
            className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left transition-colors hover:bg-primary/15"
          >
            <div className="text-sm font-semibold text-foreground">Load from Laragon</div>
            <div className="text-xs text-text-muted">
              Import your existing projects and PHP extensions from a Laragon install.
            </div>
          </button>
          <button
            type="button"
            onClick={() => done()}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-background/40"
          >
            <div className="text-sm font-semibold text-foreground">Start fresh</div>
            <div className="text-xs text-text-muted">
              Begin with an empty setup and add sites/services yourself.
            </div>
          </button>
        </div>
        <p className="mt-4 text-center text-[11px] text-text-muted">More import options coming soon.</p>
      </div>
    </div>
  );
}

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, bootError, autostart } = useStore();
  const { t } = useTranslation();
  useUpdateNotice();
  useEffect(() => devmgr.window.onNavigate((route) => navigate(route)), [navigate]);
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

  // Keep the React Bits preloader up until the first status payload arrives (or
  // boot fails), surfacing the live engine bootstrap message while we wait. Its
  // curtain animation reveals the shell once loading completes.
  const loading = status === null && bootError === null;

  return (
    <Preloader
      loading={loading}
      position="fixed"
      zIndex={60}
      duration={1600}
      customContent={(progress) => (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-8 bg-[#090c0e] transition-opacity duration-300"
          style={{ opacity: progress >= 100 ? 0 : 1 }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(55% 45% at 50% 38%, rgba(45,212,170,0.14), transparent 70%)',
            }}
          />
          <div className="relative flex flex-col items-center gap-2.5">
            <div className="text-5xl font-bold tracking-tight text-white">
              Stack<span className="text-[#2dd4aa]">let</span>
            </div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/35">
              Local dev stack
            </p>
          </div>
          <span
            aria-hidden
            className="relative size-9 animate-spin rounded-full border-2 border-white/12 border-t-[#2dd4aa]"
          />
          <div className="relative flex w-56 flex-col items-center gap-2.5">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2dd4aa] to-[#60a5fa] transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(8, progress)}%` }}
              />
            </div>
            <p className="h-4 text-[11px] text-white/45">{autostart || 'Starting…'}</p>
          </div>
        </div>
      )}
    >
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      <GlobalProgressBar />
      <FirstRunOnboarding />
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
    </Preloader>
  );
}

export function App() {
  return (
    <HashRouter>
      <Layout />
    </HashRouter>
  );
}
