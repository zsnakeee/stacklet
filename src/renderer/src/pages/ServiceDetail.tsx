import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Empty, IconButton, Section, Select } from '@/components/ui/primitives';
import { Icon } from '@/components/Icon';
import { useAction } from '@/lib/action';
import { badgeForRuntime } from '@/lib/badge';
import { BUNDLED_RUNTIME, MAILPIT_UI_PORT } from '@/lib/constants';
import { devmgr } from '@/lib/devmgr';
import { openServiceLog } from '@/lib/logs-helpers';
import { bundledById, runtimeStatus, useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import type { VersionInfo } from '@/lib/types';
import { PhpSettings } from '@/pages/service/PhpSettings';
import { MysqlSettings } from '@/pages/service/MysqlSettings';
import { NginxSettings } from '@/pages/service/NginxSettings';
import { PmaSettings } from '@/pages/service/PmaSettings';

export function ServiceDetail() {
  const { id = '' } = useParams();
  const { runAction } = useAction();
  const toast = useToast();
  const {
    status,
    starting,
    rowErrors,
    installProgress,
    refresh,
    setRowError,
    clearRowError,
  } = useStore();

  const svc = bundledById(status, id);
  const runtime = BUNDLED_RUNTIME[id];
  const rt = runtimeStatus(status, runtime ?? id);

  const [selected, setSelected] = useState('');
  const [onDisk, setOnDisk] = useState<string[]>([]);
  const [info, setInfo] = useState<VersionInfo | null>(null);

  // Reset when switching services.
  useEffect(() => {
    setSelected('');
    setInfo(null);
  }, [id]);

  // Default the version selection once the service is known.
  useEffect(() => {
    if (svc && !selected) setSelected(svc.installedVersion || svc.versions[0]?.version || '');
  }, [svc, selected]);

  // Load on-disk versions + info for the selected version.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    void (async () => {
      const [disk, vinfo] = await Promise.all([
        devmgr.services.installedVersions(id),
        devmgr.services.versionInfo(id, selected) as Promise<VersionInfo>,
      ]);
      if (!alive) return;
      setOnDisk(disk);
      setInfo(vinfo);
    })();
    return () => {
      alive = false;
    };
  }, [id, selected, status]);

  if (!svc) return <Empty>Unknown service</Empty>;

  const progress = installProgress[id];
  const installing = Boolean(progress);
  const isStarting = starting.has(id);
  const errText = rowErrors.get(id);
  const activeVer = svc.installedVersion;

  // ----- runtime badge
  let badge: { variant: Parameters<typeof Badge>[0]['variant']; label: string };
  if (!info?.installed) {
    badge = { variant: 'missing', label: 'Not installed' };
  } else if (rt.state === 'running' && !info.active && activeVer) {
    badge = { variant: 'running', label: `Running (${activeVer})` };
  } else {
    badge = badgeForRuntime(rt, { starting: isStarting, error: Boolean(errText) });
  }

  const canStart = Boolean(info?.installed) && (rt.state !== 'running' || !info?.active);
  const canStop = rt.state === 'running' && Boolean(info?.active);

  // ----- runtime start/stop (version-aware)
  const startDetail = async () => {
    if (!info) throw new Error('Service not found');
    if (!info.installed) throw new Error(`Version ${selected} is not installed`);
    const wasRunning = rt.state === 'running';
    const needsSwitch = wasRunning && !info.active;
    if (!info.active) await devmgr.services.setActive(id, selected);
    if (needsSwitch) {
      await devmgr.service.stop(runtime);
      await devmgr.service.start(runtime);
    } else if (!wasRunning) {
      await devmgr.service.start(runtime);
    }
  };
  const stopDetail = async () => {
    if (!info) throw new Error('Service not found');
    if (rt.state !== 'running') return;
    if (!info.active) {
      throw new Error(
        `${activeVer ?? 'another version'} is running. Select that version in the list to stop it, or use Start to switch.`,
      );
    }
    await devmgr.service.stop(runtime);
  };

  const runRuntime = (verb: 'Start' | 'Stop') =>
    runAction({
      key: `${id}-${verb}`,
      label: `${verb} ${svc.name}`,
      run: async () => {
        try {
          if (verb === 'Start') await startDetail();
          else await stopDetail();
          clearRowError(id);
        } catch (err) {
          setRowError(id, err instanceof Error ? err.message : String(err));
          throw err;
        } finally {
          await refresh();
        }
      },
    });

  // ----- install / update / uninstall
  const runInstall = (label: string, fn: () => Promise<unknown>) =>
    runAction({ key: `install-${id}`, label, successToast: false, run: fn });

  const versionLabel = !info
    ? ''
    : !info.installed
      ? `Version ${selected} is not installed. Install it above to edit settings.`
      : info.active
        ? `Settings for ${selected} (active — used when the service runs)`
        : `Settings for ${selected} (installed on disk, not the active default)`;

  const showSettings = Boolean(svc.installed) || svc.versions.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/services" className="text-sm text-text-secondary hover:text-foreground">
        ← Services
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{svc.name}</h2>
          <p className="mt-0.5 text-sm text-text-muted">{svc.description}</p>
        </div>
        <Badge variant={svc.installed ? 'installed' : 'missing'}>
          {svc.installed ? `v${svc.installedVersion ?? ''}` : 'Not installed'}
        </Badge>
      </header>

      <Section title="Install & versions">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selected}
            disabled={installing}
            onChange={(e) => setSelected(e.target.value)}
          >
            {svc.versions.length === 0 ? (
              <option value="">No versions</option>
            ) : (
              svc.versions.map((v) => {
                let suffix = '';
                if (onDisk.includes(v.version)) {
                  suffix = v.version === activeVer ? ' · active' : ' · installed';
                }
                return (
                  <option key={v.version} value={v.version}>
                    {v.label}
                    {suffix}
                  </option>
                );
              })
            )}
          </Select>

          <div className="flex gap-2">
            {!info?.installed ? (
              <Button
                variant="primary"
                busy={installing}
                disabled={installing || !selected}
                onClick={() =>
                  runInstall(`Install ${svc.name}`, () =>
                    devmgr.services.install(id, selected),
                  )
                }
              >
                Install
              </Button>
            ) : (
              <>
                <Button
                  busy={installing}
                  disabled={installing}
                  onClick={() =>
                    runInstall(`Install ${svc.name}`, () => {
                      const fresh = bundledById(status, id);
                      if (selected === fresh?.installedVersion) {
                        throw new Error('Select a different version to update');
                      }
                      return devmgr.services.update(id, selected);
                    })
                  }
                >
                  Update
                </Button>
                {info.active && (
                  <Button
                    busy={installing}
                    disabled={installing}
                    onClick={() => {
                      if (!window.confirm(`Remove ${svc.name} and delete its files?`)) return;
                      void runInstall(`Install ${svc.name}`, () =>
                        devmgr.services.uninstall(id),
                      );
                    }}
                  >
                    Uninstall
                  </Button>
                )}
              </>
            )}
          </div>
          {info?.installed && info.path && (
            <Button
              onClick={() =>
                runAction({
                  key: `open-svc-folder-${id}`,
                  successToast: false,
                  run: () => devmgr.settings.openPath(info.path),
                })
              }
            >
              <Icon name="folder" />
              Open folder
            </Button>
          )}
          {id === 'mailpit' && info?.installed && (
            <Button
              variant="primary"
              onClick={() =>
                runAction({
                  key: 'open-mailpit-inbox',
                  successToast: false,
                  run: () => devmgr.shell.openExternal(`http://127.0.0.1:${MAILPIT_UI_PORT}`),
                })
              }
            >
              <Icon name="external" />
              Open inbox
            </Button>
          )}
        </div>

        {progress && (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-text-secondary">{progress.message}</p>
          </div>
        )}
      </Section>

      {showSettings && (
        <Section
          title="Settings"
          actions={
            runtime ? (
              <div className="flex items-center gap-2">
                <Badge variant={badge.variant} dot={badge.variant !== 'missing'}>
                  {badge.label}
                </Badge>
                <IconButton
                  tone="primary"
                  title="Start"
                  disabled={!canStart}
                  onClick={() => runRuntime('Start')}
                >
                  <Icon name="play" />
                </IconButton>
                <IconButton
                  tone="danger"
                  title="Stop"
                  disabled={!canStop}
                  onClick={() => runRuntime('Stop')}
                >
                  <Icon name="stop" />
                </IconButton>
                <IconButton
                  title="Open log"
                  onClick={() =>
                    runAction({
                      key: `log-${id}`,
                      successToast: false,
                      run: async () => {
                        const ok = await openServiceLog(id);
                        if (!ok) toast.info('No log file for this service yet. Start it and try again.');
                      },
                    })
                  }
                >
                  <Icon name="log" />
                </IconButton>
              </div>
            ) : undefined
          }
        >
          <p className="mb-4 text-sm text-text-secondary">{versionLabel}</p>
          {!info?.installed ? (
            <Empty>Install this version to view and edit settings.</Empty>
          ) : id === 'php' ? (
            <PhpSettings version={selected} />
          ) : id === 'mysql' ? (
            <MysqlSettings version={selected} />
          ) : id === 'nginx' ? (
            <NginxSettings version={selected} />
          ) : id === 'phpmyadmin' ? (
            <PmaSettings version={selected} />
          ) : (
            <table className="text-sm">
              <tbody>
                <tr>
                  <th className="pr-4 text-left text-text-muted">version</th>
                  <td>{selected}</td>
                </tr>
                <tr>
                  <th className="pr-4 text-left text-text-muted">path</th>
                  <td className="font-mono text-xs">{info.path}</td>
                </tr>
                <tr>
                  <th className="pr-4 text-left text-text-muted">active</th>
                  <td>{info.active ? 'yes' : 'no'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Section>
      )}
    </div>
  );
}
