import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { devmgr } from '@/lib/devmgr';
import { useToast } from '@/lib/toast';
import type {
  AppConfig,
  BundledService,
  RuntimeService,
  Status,
} from '@/lib/types';
import type { InstallProgressPayload } from '@shared/ipc';

const RUNTIME_TO_BUNDLED: Record<string, string> = {
  nginx: 'nginx',
  apache: 'apache',
  'php-fpm': 'php',
  mysql: 'mysql',
  postgres: 'postgres',
  redis: 'redis',
  mailpit: 'mailpit',
  mongodb: 'mongodb',
};

export function bundledIdForRuntime(runtime: string): string {
  return RUNTIME_TO_BUNDLED[runtime] ?? runtime;
}

export function runtimeStatus(status: Status | null, name: string): RuntimeService {
  return status?.services?.find((s) => s.name === name) ?? { name, state: 'stopped' };
}

export function bundledById(status: Status | null, id: string): BundledService | undefined {
  return status?.bundledServices?.find((s) => s.id === id);
}

export interface InstallProgressState {
  percent: number;
  message: string;
  phase: string;
}

interface StoreApi {
  status: Status | null;
  config: AppConfig | null;
  bootError: string | null;
  bootstrapping: boolean;
  autostart: string;
  starting: ReadonlySet<string>;
  rowErrors: ReadonlyMap<string, string>;
  globalError: string | null;
  installProgress: Record<string, InstallProgressState>;
  setStatus: (s: Status) => void;
  setConfig: (c: AppConfig) => void;
  refresh: () => Promise<void>;
  refreshLive: () => Promise<void>;
  setRowError: (id: string, msg: string) => void;
  clearRowError: (id: string) => void;
  clearRowErrors: () => void;
  setGlobalError: (msg: string | null) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [status, setStatusState] = useState<Status | null>(null);
  const [config, setConfigState] = useState<AppConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [autostart, setAutostart] = useState('');
  const [starting, setStarting] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<Record<string, InstallProgressState>>({});

  const statusRef = useRef<Status | null>(null);
  statusRef.current = status;

  const setStatus = useCallback((s: Status) => setStatusState(s), []);
  const setConfig = useCallback((c: AppConfig) => setConfigState(c), []);

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([
      devmgr.status() as Promise<Status>,
      devmgr.config() as Promise<AppConfig>,
    ]);
    setStatusState(s);
    setConfigState(c);
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const live = await devmgr.statusLive();
      setStatusState((prev) =>
        prev
          ? { ...prev, services: live.services as RuntimeService[], bundledServices: live.bundledServices as BundledService[] }
          : prev,
      );
      if (!statusRef.current) {
        setStatusState((await devmgr.status()) as Status);
      }
    } catch {
      // keep last good state
    }
  }, []);

  const setRowError = useCallback((id: string, msg: string) => {
    setRowErrors((prev) => new Map(prev).set(id, msg));
  }, []);
  const clearRowError = useCallback((id: string) => {
    setRowErrors((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const clearRowErrors = useCallback(() => setRowErrors(new Map()), []);

  // Bootstrap phase + install-progress wiring (subscribe once).
  useEffect(() => {
    const offProgress = devmgr.services.onInstallProgress((p: InstallProgressPayload) => {
      setInstallProgress((prev) => ({
        ...prev,
        [p.serviceId]: { percent: p.percent, message: p.message, phase: p.phase },
      }));
      if (p.phase === 'done' || p.phase === 'error') {
        if (p.phase === 'done') {
          const svc = bundledById(statusRef.current, p.serviceId);
          toast.success(`${svc?.name ?? p.serviceId} installed`);
        } else {
          toast.error(p.message || 'Install failed');
        }
        window.setTimeout(
          () => {
            setInstallProgress((prev) => {
              const next = { ...prev };
              delete next[p.serviceId];
              return next;
            });
            void refresh();
          },
          p.phase === 'done' ? 500 : 0,
        );
      }
    });

    const offPhase = devmgr.bootstrap.onPhase((phase) => {
      if (phase === 'config') {
        setBootstrapping(true);
        setAutostart('Preparing…');
        void refresh();
        return;
      }
      if (phase === 'listed') {
        setAutostart('Starting services…');
        setStarting(new Set());
        return;
      }
      if (phase && typeof phase === 'object' && phase.kind === 'starting') {
        const id = bundledIdForRuntime(phase.service);
        setStarting((prev) => new Set(prev).add(id));
        const label = bundledById(statusRef.current, id)?.name ?? phase.service;
        setAutostart(`Starting ${label}…`);
        return;
      }
      if (phase && typeof phase === 'object' && phase.kind === 'started') {
        const id = bundledIdForRuntime(phase.service);
        setStarting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        void refreshLive();
        return;
      }
      if (phase === 'finishing') {
        setAutostart('Finishing setup…');
        return;
      }
      if (phase === 'ready') {
        setStarting(new Set());
        setBootstrapping(false);
        setAutostart('');
      }
    });

    const offDone = devmgr.bootstrap.onDone((payload) => {
      setStarting(new Set());
      setBootstrapping(false);
      setAutostart('');
      if (payload?.error) {
        toast.error(payload.error);
        setGlobalError(payload.error);
      }
      void refresh();
    });

    // Initial load.
    void refresh().catch((err) => {
      setBootError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      offProgress();
      offPhase();
      offDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<StoreApi>(
    () => ({
      status,
      config,
      bootError,
      bootstrapping,
      autostart,
      starting,
      rowErrors,
      globalError,
      installProgress,
      setStatus,
      setConfig,
      refresh,
      refreshLive,
      setRowError,
      clearRowError,
      clearRowErrors,
      setGlobalError,
    }),
    [
      status,
      config,
      bootError,
      bootstrapping,
      autostart,
      starting,
      rowErrors,
      globalError,
      installProgress,
      setStatus,
      setConfig,
      refresh,
      refreshLive,
      setRowError,
      clearRowError,
      clearRowErrors,
    ],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
