import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { Icon } from '@/components/Icon';
import { devmgr } from '@/lib/devmgr';
import { getInitialTheme, applyThemeClass } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface Svc {
  name: string;
  state: string;
}
interface Status {
  services: Svc[];
  dataDir?: string;
}

const LABELS: Record<string, string> = {
  nginx: 'NGINX',
  apache: 'Apache',
  'php-fpm': 'PHP',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  mongodb: 'MongoDB',
  mailpit: 'Mailpit',
};
const label = (n: string) => LABELS[n] ?? n;

function Row({
  icon,
  label: text,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-surface"
    >
      <Icon name={icon} size={16} className="text-text-muted" />
      <span>{text}</span>
    </button>
  );
}

function TrayPopover() {
  const [status, setStatus] = useState<Status>({ services: [] });
  const [phpVersions, setPhpVersions] = useState<string[]>([]);
  const [activePhp, setActivePhp] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus((await devmgr.status()) as Status);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    applyThemeClass(getInitialTheme());
    void refresh();
    void (async () => {
      try {
        setPhpVersions(await devmgr.php.versions());
        setActivePhp(await devmgr.php.defaultVersion());
      } catch {
        // PHP not installed
      }
    })();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const services = status.services ?? [];
  const runningCount = services.filter((s) => s.state === 'running').length;

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      // surfaced in the main app
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised text-foreground shadow-2xl">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        <div className="px-2.5 pb-1 pt-2 text-base font-bold tracking-tight">
          Stack<span className="text-primary">let</span>
        </div>

        <Row icon="mail" label="Mail (Mailpit)" onClick={() => devmgr.tray.open('/mailpit')} />
        <Row icon="log" label="Log Viewer" onClick={() => devmgr.tray.open('/logs')} />
        <Row icon="navServices" label="Services" onClick={() => devmgr.tray.open('/services')} />
        <Row icon="navSites" label="Sites" onClick={() => devmgr.tray.open('/sites')} />

        <div className="mt-2 flex items-center justify-between px-2.5 pb-1 pt-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Services
          </span>
          <span className="text-[11px] text-text-muted">{runningCount}/{services.length}</span>
        </div>

        <button
          type="button"
          onClick={() => act('all', () => devmgr.stop())}
          disabled={busy === 'all'}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-50"
        >
          <Icon name="stop" size={14} className="text-text-muted" />
          <span>Stop all services</span>
        </button>

        {services.map((s) => {
          const running = s.state === 'running';
          return (
            <div
              key={s.name}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-surface"
            >
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  running ? 'bg-success' : 'bg-text-muted/50',
                )}
              />
              <span className="flex-1 truncate">{label(s.name)}</span>
              <button
                type="button"
                disabled={busy === s.name}
                onClick={() =>
                  act(s.name, () =>
                    running ? devmgr.service.stop(s.name) : devmgr.service.start(s.name),
                  )
                }
                className="rounded-md px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-background/60 hover:text-foreground disabled:opacity-50"
              >
                {busy === s.name ? '…' : running ? 'Stop' : 'Start'}
              </button>
            </div>
          );
        })}

        {phpVersions.length > 0 && (
          <>
            <div className="my-1 border-t border-border" />
            {phpVersions.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => act(`php-${v}`, () => devmgr.php.setDefault(v))}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface"
              >
                <span className="w-4">
                  {v === activePhp && <Icon name="check" size={14} className="text-primary" />}
                </span>
                <span>Use PHP {v}</span>
              </button>
            ))}
          </>
        )}

        <div className="my-1 border-t border-border" />
        <Row
          icon="folder"
          label="Open configuration files"
          onClick={() => status.dataDir && void devmgr.settings.openPath(status.dataDir)}
        />
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-border px-2 py-1.5">
        <button
          type="button"
          title="Settings"
          onClick={() => devmgr.tray.open('/settings')}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Icon name="settings" size={16} />
        </button>
        <button
          type="button"
          title="Open Stacklet"
          onClick={() => devmgr.tray.open('/')}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Icon name="external" size={16} />
        </button>
        <button
          type="button"
          title="Quit"
          onClick={() => devmgr.tray.quit()}
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Icon name="dismiss" size={16} />
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrayPopover />
  </StrictMode>,
);
