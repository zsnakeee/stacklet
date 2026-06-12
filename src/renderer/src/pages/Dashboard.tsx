import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, IconButton } from '@/components/ui/primitives';
import { Icon } from '@/components/Icon';
import Globe from '@/components/globe';
import GradientText from '@/components/GradientText';
import { useAction } from '@/lib/action';
import { badgeForRuntime } from '@/lib/badge';
import { RUNTIME_ROWS } from '@/lib/constants';
import { devmgr } from '@/lib/devmgr';
import { openServiceLog } from '@/lib/logs-helpers';
import { bundledById, runtimeStatus, useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/lib/toast';

const POLL_MS = 4000;

function StatCard({
  value,
  label,
  highlight = false,
  warn = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      role="status"
      className={[
        'flex flex-col gap-1 rounded-xl border px-5 py-4',
        highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface/40',
        warn ? 'border-warning/40 bg-warning/5' : '',
      ].join(' ')}
    >
      <span className="text-3xl font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

function PhpBar() {
  const { runAction } = useAction();
  const { refresh } = useStore();
  const [versions, setVersions] = useState<string[]>([]);
  const [current, setCurrent] = useState('');

  const load = async () => {
    const [v, c] = await Promise.all([devmgr.php.versions(), devmgr.php.defaultVersion()]);
    setVersions(v);
    setCurrent(c);
  };

  useEffect(() => {
    void load();
  }, []);

  if (versions.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3">
      <label htmlFor="php-default" className="text-sm text-text-secondary">
        Default PHP
      </label>
      <select
        id="php-default"
        className="h-9 rounded-md border border-input bg-background/60 px-3 text-sm"
        value={current}
        onChange={(e) => {
          const value = e.target.value;
          setCurrent(value);
          void runAction({
            key: 'php-default',
            label: 'Set default PHP',
            global: true,
            run: async () => {
              await devmgr.php.setDefault(value);
              try {
                await devmgr.env.sync();
              } catch {
                // best-effort
              }
              await refresh();
              await load();
            },
          });
        }}
      >
        {versions.map((v) => (
          <option key={v} value={v}>
            PHP {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Dashboard() {
  const { runAction } = useAction();
  const toast = useToast();
  const { theme } = useTheme();
  const {
    status,
    starting,
    rowErrors,
    globalError,
    setGlobalError,
    refreshLive,
    setRowError,
    clearRowError,
  } = useStore();

  // Live poll while the dashboard is mounted.
  useEffect(() => {
    const t = window.setInterval(() => void refreshLive(), POLL_MS);
    return () => window.clearInterval(t);
  }, [refreshLive]);

  const runServiceAction = (
    bundledId: string,
    runtime: string,
    verb: 'Start' | 'Stop',
    captureError: boolean,
  ) => {
    const name = bundledById(status, bundledId)?.name ?? bundledId;
    return runAction({
      key: `${bundledId}-${verb}`,
      label: `${verb} ${name}`,
      run: async () => {
        try {
          if (verb === 'Start') await devmgr.service.start(runtime);
          else await devmgr.service.stop(runtime);
          clearRowError(bundledId);
        } catch (err) {
          if (captureError) setRowError(bundledId, err instanceof Error ? err.message : String(err));
          throw err;
        } finally {
          await refreshLive();
        }
      },
    });
  };

  let running = 0;
  let installedCount = 0;
  let errorCount = 0;
  for (const row of RUNTIME_ROWS) {
    const bundled = bundledById(status, row.bundledId);
    const rt = runtimeStatus(status, row.runtime);
    if (bundled?.installed) installedCount += 1;
    if (rt.state === 'running') running += 1;
    if (bundled?.installed && rowErrors.has(row.bundledId)) errorCount += 1;
  }

  const siteCount = status?.sites?.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="grid items-center gap-5 overflow-hidden rounded-2xl border border-border bg-surface/40 p-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <div>
            <GradientText
              className="text-2xl font-bold"
              colors={['#2dd4aa', '#60a5fa', '#2dd4aa']}
              animationSpeed={9}
            >
              Your local stack
            </GradientText>
            <p className="mt-1 text-sm text-text-muted">
              {running} of {installedCount} services running · {siteCount}{' '}
              {siteCount === 1 ? 'site' : 'sites'}
              {errorCount > 0 ? ` · ${errorCount} need attention` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard value={running} label="Running" highlight />
            <StatCard value={Math.max(0, installedCount - running)} label="Stopped" />
            <StatCard value={errorCount} label="Attention" warn={errorCount > 0} />
          </div>
        </div>
        <div className="pointer-events-none hidden justify-self-center lg:flex">
          <Globe
            key={theme}
            width={300}
            height={260}
            primaryColor="rgb(45, 212, 170)"
            neutralColor={theme === 'dark' ? 'rgb(96, 165, 250)' : 'rgb(37, 99, 235)'}
            globeColor={theme === 'dark' ? 'rgb(14, 21, 28)' : 'rgb(203, 213, 225)'}
            globeOpacity={theme === 'dark' ? 0.55 : 0.7}
            atmosphereColor="rgb(45, 212, 170)"
            autoRotateSpeed={0.8}
            enableZoom={false}
            className="opacity-90"
          />
        </div>
      </section>

      {status?.warnings && status.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <pre className="whitespace-pre-wrap text-sm text-warning">
            {status.warnings.join('\n\n')}
          </pre>
        </div>
      )}

      {globalError && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
          <pre className="flex-1 whitespace-pre-wrap text-sm text-danger">{globalError}</pre>
          <IconButton tone="default" title="Dismiss" onClick={() => setGlobalError(null)}>
            <Icon name="dismiss" size={14} />
          </IconButton>
        </div>
      )}

      <PhpBar />

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[640px]">
        <div className="grid grid-cols-[2fr_1fr_0.7fr_0.8fr_auto] gap-3 border-b border-border bg-surface/60 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-text-muted">
          <span>Service</span>
          <span>Status</span>
          <span>Port</span>
          <span>Version</span>
          <span className="text-right">Actions</span>
        </div>
        {RUNTIME_ROWS.map((row) => {
          const bundled = bundledById(status, row.bundledId);
          const rt = runtimeStatus(status, row.runtime);
          const installed = Boolean(bundled?.installed);
          const isStarting = starting.has(row.bundledId);
          const isRunning = rt.state === 'running';
          const errText = installed ? rowErrors.get(row.bundledId) : undefined;
          const badge = installed
            ? badgeForRuntime(rt, { starting: isStarting, error: Boolean(errText) })
            : ({ variant: 'missing', label: 'Not installed' } as const);

          return (
            <div
              key={row.bundledId}
              className={[
                'border-b border-border/60 transition-colors last:border-0 hover:bg-surface/40',
                isRunning ? 'bg-success/[0.05]' : '',
              ].join(' ')}
            >
              <div className="grid grid-cols-[2fr_1fr_0.7fr_0.8fr_auto] items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-foreground">
                    {bundled?.name ?? row.bundledId}
                  </strong>
                  <small className="block truncate text-xs text-text-muted">
                    {bundled?.description ?? ''}
                  </small>
                </div>
                <Badge variant={badge.variant} dot={badge.variant !== 'missing'}>
                  {badge.label}
                </Badge>
                <span
                  className={
                    installed && isRunning
                      ? 'text-sm tabular-nums text-primary'
                      : 'text-sm tabular-nums text-text-muted'
                  }
                >
                  {installed && rt.port ? rt.port : '—'}
                </span>
                <span className="text-sm tabular-nums text-text-secondary">
                  {installed ? `v${bundled?.installedVersion ?? ''}` : '—'}
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  <IconButton
                    tone="primary"
                    title="Start"
                    disabled={!installed || isRunning || isStarting}
                    onClick={() => runServiceAction(row.bundledId, row.runtime, 'Start', true)}
                  >
                    <Icon name="play" />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    title="Stop"
                    disabled={!installed || !isRunning || isStarting}
                    onClick={() => runServiceAction(row.bundledId, row.runtime, 'Stop', false)}
                  >
                    <Icon name="stop" />
                  </IconButton>
                  <IconButton
                    title="Open log"
                    disabled={!installed}
                    onClick={() =>
                      runAction({
                        key: `log-${row.bundledId}`,
                        successToast: false,
                        run: async () => {
                          const ok = await openServiceLog(row.bundledId);
                          if (!ok) toast.info('No log file for this service yet. Start it and try again.');
                        },
                      })
                    }
                  >
                    <Icon name="log" />
                  </IconButton>
                  <Link
                    to={`/services/${row.bundledId}`}
                    title="Settings"
                    aria-label="Settings"
                    className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface/40 text-text-secondary transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <Icon name="settings" />
                  </Link>
                </div>
              </div>
              {errText && (
                <div className="flex items-start gap-3 border-t border-danger/30 bg-danger/5 px-4 py-2">
                  <pre className="flex-1 whitespace-pre-wrap text-xs text-danger">{errText}</pre>
                  <IconButton
                    title="Dismiss error"
                    onClick={() => clearRowError(row.bundledId)}
                  >
                    <Icon name="dismiss" size={14} />
                  </IconButton>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
