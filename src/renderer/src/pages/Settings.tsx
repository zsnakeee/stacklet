import { useEffect, useState } from 'react';
import { Button, Empty, Hint, Section, Toggle } from '@/components/ui/primitives';
import { SETTINGS_SERVICES } from '@/lib/constants';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';

interface EnvInfo {
  candidates: { id: string; label: string; path: string; service: string }[];
  selected: string[];
  paths: string[];
}

type StatusMsg = { text: string; ok: boolean } | null;

export function Settings() {
  const { runAction } = useAction();
  const toast = useToast();
  const { status, config, refresh } = useStore();

  const [envInfo, setEnvInfo] = useState<EnvInfo>({ candidates: [], selected: [], paths: [] });
  const [ssl, setSsl] = useState<{ trusted: boolean; caCertPath: string }>(
    status?.ssl ?? { trusted: false, caCertPath: '' },
  );
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [serviceEnabled, setServiceEnabled] = useState<Record<string, boolean>>({});
  const [sslMsg, setSslMsg] = useState<StatusMsg>(null);
  const [envMsg, setEnvMsg] = useState<StatusMsg>(null);
  const [settingsMsg, setSettingsMsg] = useState<StatusMsg>(null);

  useEffect(() => {
    void (async () => {
      try {
        const info = (await devmgr.env.info()) as EnvInfo;
        setEnvInfo(info);
        setSelectedPaths(new Set(info.selected));
      } catch {
        // ignore
      }
      try {
        setSsl(await devmgr.ssl.status());
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const { key } of SETTINGS_SERVICES) {
      next[key] = config?.services?.[key]?.enabled !== false;
    }
    setServiceEnabled(next);
  }, [config]);

  const paths = {
    'Data directory': status?.dataDir ?? '—',
    'Config file': status?.configPath ?? '—',
    Projects: status?.projectsDir ?? '—',
    Logs: status?.logsDir ?? '—',
    'Hosts file': status?.hostsPath ?? '—',
  };

  const openPath = (p: string) => {
    if (!p || p === '—') return;
    void runAction({
      key: `open-path-${p}`,
      label: 'Open folder',
      successToast: false,
      run: () => devmgr.settings.openPath(p),
    });
  };

  const persistSelection = async () => {
    await devmgr.settings.save({ general: { path_env_selected: [...selectedPaths] } });
  };

  return (
    <div className="flex flex-col gap-5">
      <Section title="Paths">
        <dl className="flex flex-col">
          {Object.entries(paths).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 py-1.5 text-sm">
              <dt className="text-text-muted">{label}</dt>
              <dd className="break-all font-mono text-xs text-text-secondary">{value}</dd>
              <Button size="sm" onClick={() => openPath(value)}>
                Open
              </Button>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="HTTPS (*.test)">
        <Hint>
          Stacklet signs local sites with its own certificate authority. Trust it once in Windows
          (admin/UAC), then restart your browser.
        </Hint>
        <p className={ssl.trusted ? 'mt-2 text-sm text-success' : 'mt-2 text-sm text-warning'}>
          {ssl.trusted
            ? 'Trusted — browsers should show https://*.test sites as secure after a restart.'
            : 'Not trusted — Chrome/Edge will show “Not secure” until you install the Stacklet CA.'}
        </p>
        {ssl.caCertPath && <p className="mt-1 font-mono text-xs text-text-muted">{ssl.caCertPath}</p>}
        <div className="mt-3">
          <Button
            variant="primary"
            size="sm"
            disabled={ssl.trusted}
            onClick={() =>
              runAction({
                key: 'ssl-trust',
                label: 'Trust SSL certificate',
                global: true,
                successToast: false,
                errorToast: false,
                run: async () => {
                  const result = await devmgr.ssl.trust();
                  setSslMsg({ text: result.message, ok: result.ok });
                  if (result.ok) {
                    toast.success('SSL certificate trusted');
                    setSsl(await devmgr.ssl.status());
                    await refresh();
                  } else {
                    toast.error(result.message);
                  }
                },
              })
            }
          >
            Trust SSL certificate
          </Button>
        </div>
        {sslMsg && (
          <p className={sslMsg.ok ? 'mt-2 text-sm text-success' : 'mt-2 text-sm text-danger'}>
            {sslMsg.text}
          </p>
        )}
      </Section>

      <Section title="Environment (PATH)">
        <Hint>
          Choose which folders to add to your Windows user PATH. Apply and PHP version changes sync
          the checked items automatically.
        </Hint>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setSelectedPaths(new Set(envInfo.candidates.map((c) => c.id)))}>
            Select all
          </Button>
          <Button size="sm" onClick={() => setSelectedPaths(new Set())}>
            Select none
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {envInfo.candidates.length === 0 ? (
            <Empty>No service paths available. Install and enable services first.</Empty>
          ) : (
            envInfo.candidates.map((c) => (
              <Toggle
                key={c.id}
                checked={selectedPaths.has(c.id)}
                onChange={(checked) =>
                  setSelectedPaths((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
                label={
                  <span className="flex flex-col">
                    <strong className="font-medium">{c.label}</strong>
                    <span className="font-mono text-xs text-text-muted">{c.path}</span>
                  </span>
                }
              />
            ))
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'env-save',
                label: 'Save PATH selection',
                run: async () => {
                  await persistSelection();
                  setEnvMsg({ text: 'Selection saved and applied.', ok: true });
                  await refresh();
                },
              })
            }
          >
            Save selection
          </Button>
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'env-sync',
                label: 'Update PATH',
                global: true,
                successToast: false,
                run: async () => {
                  await persistSelection();
                  const result = await devmgr.env.sync();
                  setEnvMsg({ text: result.message, ok: result.ok });
                  if (result.ok) toast.success('PATH updated');
                  else toast.error(result.message);
                  await refresh();
                },
              })
            }
          >
            Update PATH now
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              runAction({
                key: 'env-restart',
                label: 'Restart environment',
                global: true,
                successToast: false,
                run: async () => {
                  await persistSelection();
                  const result = await devmgr.env.restart(true);
                  setEnvMsg({ text: result.message, ok: result.ok });
                  if (result.ok) toast.success('Environment restarted');
                  else toast.error(result.message);
                },
              })
            }
          >
            Restart env
          </Button>
        </div>
        {envMsg && (
          <p className={envMsg.ok ? 'mt-2 text-sm text-success' : 'mt-2 text-sm text-danger'}>
            {envMsg.text}
          </p>
        )}
      </Section>

      <Section title="Services">
        <Hint>
          Disabled services are skipped by Start all and autostart, and are stopped when you save.
          Settings are applied automatically when you save.
        </Hint>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SETTINGS_SERVICES.map(({ key, label }) => (
            <Toggle
              key={key}
              label={label}
              checked={serviceEnabled[key] ?? true}
              onChange={(checked) => setServiceEnabled((prev) => ({ ...prev, [key]: checked }))}
            />
          ))}
        </div>
        <div className="mt-3">
          <Button
            variant="primary"
            onClick={() =>
              runAction({
                key: 'settings-save',
                label: 'Save settings',
                global: true,
                run: async () => {
                  const services: Record<string, { enabled: boolean }> = {};
                  for (const { key } of SETTINGS_SERVICES) {
                    services[key] = { enabled: serviceEnabled[key] ?? true };
                  }
                  await devmgr.settings.save({
                    general: { path_env_selected: [...selectedPaths] },
                    services,
                  });
                  setSettingsMsg({ text: 'Saved and applied.', ok: true });
                  await refresh();
                },
              })
            }
          >
            Save settings
          </Button>
        </div>
        {settingsMsg && (
          <p className={settingsMsg.ok ? 'mt-2 text-sm text-success' : 'mt-2 text-sm text-danger'}>
            {settingsMsg.text}
          </p>
        )}
      </Section>

      <Section title="General">
        <dl className="grid grid-cols-[10rem_1fr] gap-3 text-sm">
          <dt className="text-text-muted">Web server</dt>
          <dd className="text-foreground">{config?.general?.web_server ?? 'nginx'}</dd>
        </dl>
      </Section>
    </div>
  );
}
