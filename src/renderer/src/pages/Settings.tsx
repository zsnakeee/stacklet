import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CmderInfo, NgrokInfo, UpdateStatus } from '@shared/ipc';
import {
  Button,
  Empty,
  Field,
  Hint,
  Input,
  Section,
  Toggle,
} from '@/components/ui/primitives';
import { Dropdown } from '@/components/ui/Dropdown';
import { LanguageMenu } from '@/components/shell/LanguageMenu';
import { SETTINGS_SERVICES } from '@/lib/constants';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';

type NvmStatus = Awaited<ReturnType<typeof devmgr.node.nvmStatus>>;

interface EnvInfo {
  candidates: { id: string; label: string; path: string; service: string }[];
  selected: string[];
  paths: string[];
}

type StatusMsg = { text: string; ok: boolean } | null;

export function Settings() {
  const { runAction } = useAction();
  const toast = useToast();
  const { t } = useTranslation();
  const { status, config, refresh } = useStore();

  const [envInfo, setEnvInfo] = useState<EnvInfo>({ candidates: [], selected: [], paths: [] });
  const [ssl, setSsl] = useState<{ trusted: boolean; caCertPath: string }>(
    status?.ssl ?? { trusted: false, caCertPath: '' },
  );
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [serviceEnabled, setServiceEnabled] = useState<Record<string, boolean>>({});
  const [startup, setStartup] = useState({
    start_minimized: false,
    close_to_tray: true,
    autostart: true,
    launch_on_login: false,
  });
  const [composerInstalled, setComposerInstalled] = useState<boolean | null>(null);
  const [siteNames, setSiteNames] = useState<string[]>([]);
  const defaultSite = config?.general?.default_site ?? '';
  const [tldInput, setTldInput] = useState('test');
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
      try {
        setComposerInstalled((await devmgr.composer.status()).installed);
      } catch {
        // ignore
      }
      try {
        const sites = (await devmgr.sites()) as { name: string }[];
        setSiteNames(sites.map((s) => s.name).sort((a, b) => a.localeCompare(b)));
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
    setTldInput(config?.general?.tld ?? 'test');
    setStartup({
      start_minimized: config?.general?.start_minimized === true,
      close_to_tray: config?.general?.close_to_tray !== false,
      autostart: config?.general?.autostart !== false,
      launch_on_login: config?.general?.launch_on_login === true,
    });
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
      <Section title={t('settings.language.title')}>
        <Hint>{t('settings.language.hint')}</Hint>
        <div className="mt-3">
          <Field label={t('settings.language.label')} inline>
            <LanguageMenu align="end" />
          </Field>
        </div>
      </Section>

      <Section title={t('settings.about.title')}>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-text-muted">{t('settings.about.version')}</span>
          <span className="font-mono text-text-secondary">v{__APP_VERSION__}</span>
        </div>
      </Section>

      <UpdatesSection />

      <Section title={t('settings.sections.paths')}>
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
        <div className="mt-3">
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'relocate-data',
                label: 'Move data directory',
                global: true,
                successToast: false,
                run: async () => {
                  const dir = await devmgr.dialog.pickDirectory();
                  if (!dir) return;
                  const res = await devmgr.settings.relocateDataDir(dir);
                  toast.success(res.message);
                },
              })
            }
          >
            Move data directory…
          </Button>
          <Hint className="mt-1">
            Pick an empty folder — Stacklet stops services, moves its data there, then asks you to
            restart.
          </Hint>
        </div>
        <div className="mt-3">
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'use-existing-data',
                label: 'Use existing data folder',
                global: true,
                successToast: false,
                run: async () => {
                  const dir = await devmgr.dialog.pickDirectory();
                  if (!dir) return;
                  const res = await devmgr.settings.useExistingDataDir(dir);
                  toast.success(res.message);
                },
              })
            }
          >
            Use existing data folder…
          </Button>
          <Hint className="mt-1">
            Already have a Stacklet data folder from a previous install? Point Stacklet at it (no
            files are moved), then restart. The folder must already contain Stacklet data
            (config.toml, services, or certs).
          </Hint>
        </div>
        <div className="mt-3">
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'open-error-log',
                label: 'Open error log',
                successToast: false,
                run: () => devmgr.diagnostics.openLog(),
              })
            }
          >
            Open error log
          </Button>
          <Hint className="mt-1">
            Opens app.log, where Stacklet records crashes and errors (from the app and its
            background engine) for later diagnosis.
          </Hint>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'set-projects-dir',
                label: 'Change projects folder',
                global: true,
                successToast: false,
                run: async () => {
                  const dir = await devmgr.dialog.pickDirectory();
                  if (!dir) return;
                  await devmgr.settings.setProjectsDir(dir);
                  await refresh();
                  toast.success('Projects folder updated.');
                },
              })
            }
          >
            Change projects folder…
          </Button>
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: 'reset-projects-dir',
                successToast: false,
                run: async () => {
                  await devmgr.settings.setProjectsDir(null);
                  await refresh();
                  toast.success('Projects folder reset to default.');
                },
              })
            }
          >
            Reset to default
          </Button>
        </div>
        <Hint className="mt-1">
          New projects are created in the <strong>Projects</strong> folder above (customizable).
          Existing sites keep their current location.
        </Hint>
      </Section>

      <Section title={t('settings.sections.startup')}>
        <Hint>Control what happens when Stacklet launches and whether it starts with Windows.</Hint>
        <div className="mt-3 flex flex-col gap-3">
          <Toggle
            label="Start minimized to the tray"
            checked={startup.start_minimized}
            onChange={(c) => setStartup((s) => ({ ...s, start_minimized: c }))}
          />
          <Toggle
            label="Keep running in the tray when I close the window (otherwise closing exits Stacklet)"
            checked={startup.close_to_tray}
            onChange={(c) => setStartup((s) => ({ ...s, close_to_tray: c }))}
          />
          <Toggle
            label="Auto-start services on launch"
            checked={startup.autostart}
            onChange={(c) => setStartup((s) => ({ ...s, autostart: c }))}
          />
          <Toggle
            label="Launch Stacklet at Windows login"
            checked={startup.launch_on_login}
            onChange={(c) => setStartup((s) => ({ ...s, launch_on_login: c }))}
          />
        </div>
        <div className="mt-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              runAction({
                key: 'startup-save',
                label: 'Save startup settings',
                run: async () => {
                  await devmgr.settings.save({ general: startup });
                  await refresh();
                },
              })
            }
          >
            Save startup settings
          </Button>
        </div>
      </Section>

      <Section title={t('settings.sections.https')}>
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

      <Section title={t('settings.sections.environment')}>
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

      <Section title={t('settings.sections.services')}>
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

      <Section title={t('settings.sections.tools')}>
        <Hint>
          Composer is installed via the active PHP, so it always uses your default PHP version.
          After installing, enable it under Environment (PATH) so <code>composer</code> works in any
          terminal.
        </Hint>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-foreground">Composer</span>
          {composerInstalled === null ? (
            <span className="text-xs text-text-muted">checking…</span>
          ) : composerInstalled ? (
            <span className="text-xs text-success">Installed</span>
          ) : (
            <span className="text-xs text-text-muted">Not installed</span>
          )}
          <Button
            size="sm"
            className="ml-auto"
            onClick={() =>
              runAction({
                key: 'composer-install',
                label: composerInstalled ? 'Reinstall Composer' : 'Install Composer',
                global: true,
                run: async () => {
                  const result = await devmgr.composer.install();
                  setComposerInstalled(result.installed);
                  await refresh();
                },
              })
            }
          >
            {composerInstalled ? 'Reinstall' : 'Install Composer'}
          </Button>
        </div>
        <div className="mt-4">
          <Toggle
            label="Xdebug on-demand (route XDEBUG-triggered requests to an Xdebug-enabled PHP)"
            checked={config?.general?.xdebug === true}
            onChange={(c) =>
              runAction({
                key: 'xdebug-toggle',
                label: 'Update Xdebug',
                global: true,
                run: async () => {
                  await devmgr.settings.save({ general: { xdebug: c } });
                  await refresh();
                },
              })
            }
          />
          <Hint className="mt-1">
            Requires Xdebug installed for your default PHP (Services → PHP → Extensions → PECL).
            Trigger via a browser Xdebug extension or <code>?XDEBUG_TRIGGER=1</code>.
          </Hint>
        </div>
      </Section>

      <NodeNvmSection />

      <TerminalSection />

      <NgrokSection />

      <Section title={t('settings.sections.webServer')}>
        <Hint>
          Choose which web server serves your sites. Install Apache from Services first; switching
          stops one server and starts the other (PHP is shared via FastCGI).
        </Hint>
        <div className="mt-3 flex gap-2">
          {(['nginx', 'apache'] as const).map((ws) => {
            const active = (config?.general?.web_server ?? 'nginx') === ws;
            return (
              <Button
                key={ws}
                variant={active ? 'primary' : 'ghost'}
                onClick={() =>
                  !active &&
                  runAction({
                    key: `web-server-${ws}`,
                    label: `Switch to ${ws}`,
                    global: true,
                    run: async () => {
                      await devmgr.setWebServer(ws);
                      await refresh();
                    },
                  })
                }
              >
                {ws === 'nginx' ? 'Nginx' : 'Apache'}
              </Button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <Field label="Default site for http://127.0.0.1/">
            <Dropdown
              className="max-w-sm"
              ariaLabel="Default site"
              value={defaultSite}
              options={[
                { value: '', label: 'Stacklet dashboard (list all sites)' },
                ...siteNames.map((n) => ({ value: n, label: n })),
              ]}
              onChange={(v) =>
                runAction({
                  key: 'set-default-site',
                  label: 'Update default site',
                  global: true,
                  run: async () => {
                    await devmgr.settings.save({ general: { default_site: v } });
                    await refresh();
                  },
                })
              }
            />
          </Field>
          <Hint>
            What loads at <code>http://127.0.0.1/</code> and any hostname no site claims. Choose a
            project to serve it there, or keep the dashboard that links to every site.
          </Hint>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <Field label="Local TLD for site hostnames">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">.</span>
              <Input
                className="max-w-32"
                value={tldInput}
                onChange={(e) => setTldInput(e.target.value)}
                placeholder="test"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  runAction({
                    key: 'set-tld',
                    label: 'Change TLD',
                    global: true,
                    run: async () => {
                      await devmgr.setTld(tldInput);
                      await refresh();
                    },
                  })
                }
              >
                Save TLD
              </Button>
            </div>
          </Field>
          <Hint>
            Changing the TLD (e.g. <code>test</code> → <code>localhost</code>) regenerates hosts
            entries, certificates, and vhosts — Windows may prompt for permission. Existing sites
            move to the new TLD.
          </Hint>
        </div>
      </Section>
    </div>
  );
}

/** Node.js version management via nvm-windows. Self-contained state + actions. */
function NodeNvmSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [nvm, setNvm] = useState<NvmStatus | null>(null);
  const [available, setAvailable] = useState<string[] | null>(null);
  const [installVer, setInstallVer] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      setNvm(await devmgr.node.nvmStatus());
    } catch {
      // ignore — leave previous state
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const run = async (
    label: string,
    fn: () => Promise<{ ok: boolean; output: string }>,
  ) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) toast.error(res.output || `${label} failed`);
      else toast.success(label);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('settings.node.title')}>
      <Hint>{t('settings.node.hint')}</Hint>
      {nvm == null ? (
        <p className="mt-3 text-sm text-text-muted">{t('settings.node.loading')}</p>
      ) : !nvm.installed ? (
        <div className="mt-3">
          <p className="text-sm text-warning">{t('settings.node.notInstalled')}</p>
          <Button
            className="mt-2"
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(t('settings.node.installSelf'), () => devmgr.node.nvmInstallSelf())
            }
          >
            {busy ? t('settings.node.installingSelf') : t('settings.node.installSelf')}
          </Button>
          <Hint className="mt-1">{t('settings.node.installSelfHint')}</Hint>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <p className="text-sm text-text-secondary">{t('settings.node.installed')}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {nvm.installedVersions.length === 0 ? (
                <Empty>—</Empty>
              ) : (
                nvm.installedVersions.map((v) => (
                  <div key={v} className="flex items-center gap-3 text-sm">
                    <span className="min-w-24 font-mono">{v}</span>
                    {nvm.current === v ? (
                      <span className="text-xs text-success">{t('settings.node.current')}</span>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => run(`nvm use ${v}`, () => devmgr.node.nvmUse(v))}
                      >
                        {t('settings.node.use')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input
              className="max-w-40"
              value={installVer}
              placeholder={t('settings.node.installPlaceholder')}
              onChange={(e) => setInstallVer(e.target.value)}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !installVer.trim()}
              onClick={() =>
                run(`nvm install ${installVer.trim()}`, () =>
                  devmgr.node.nvmInstall(installVer.trim()),
                )
              }
            >
              {t('settings.node.install')}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setAvailable(await devmgr.node.nvmAvailable());
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('settings.node.refresh')}
            </Button>
          </div>

          {available && (
            <div className="mt-3">
              <p className="text-sm text-text-secondary">{t('settings.node.available')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {available.slice(0, 30).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="rounded border border-border px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:bg-surface hover:text-foreground"
                    onClick={() => setInstallVer(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Auto-update: show current version, check GitHub, download + install. */
function UpdatesSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [version, setVersion] = useState<string>(__APP_VERSION__);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const cur = await devmgr.update.current();
        setVersion(cur.version);
        setSupported(cur.supported);
        setStatus(cur.status);
      } catch {
        // ignore — keep defaults
      }
    })();
    const off = devmgr.update.onStatus((s) => {
      setStatus(s);
      if (s.state !== 'checking' && s.state !== 'downloading') setBusy(false);
    });
    return off;
  }, []);

  const check = async () => {
    setBusy(true);
    try {
      await devmgr.update.check();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      await devmgr.update.download();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const renderStatus = () => {
    switch (status.state) {
      case 'checking':
        return <p className="text-sm text-text-muted">Checking for updates…</p>;
      case 'available':
        return (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-success">
              Version {status.version} is available (you have {version}).
            </p>
            {status.notes && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background/50 p-2 text-xs text-text-secondary">
                {status.notes}
              </pre>
            )}
            <div>
              <Button size="sm" variant="primary" busy={busy} onClick={download}>
                Download update
              </Button>
            </div>
          </div>
        );
      case 'not-available':
        return <p className="text-sm text-text-secondary">You’re on the latest version.</p>;
      case 'downloading':
        return (
          <p className="text-sm text-text-secondary">
            Downloading… {Math.round(status.percent)}% ({formatMB(status.transferred)} /{' '}
            {formatMB(status.total)})
          </p>
        );
      case 'downloaded':
        return (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-success">
              Version {status.version} downloaded and ready to install.
            </p>
            <div>
              <Button size="sm" variant="primary" onClick={() => devmgr.update.install()}>
                Restart &amp; install
              </Button>
            </div>
          </div>
        );
      case 'error':
        return <p className="text-sm text-warning">{status.message}</p>;
      default:
        return null;
    }
  };

  return (
    <Section title={t('settings.sections.updates')}>
      <Hint>
        Stacklet checks GitHub for new releases. Updates are optional — the app works fully offline
        and never updates without your go-ahead.
      </Hint>
      <div className="mt-3 flex items-center justify-between py-1 text-sm">
        <span className="text-text-muted">Current version</span>
        <span className="font-mono text-text-secondary">v{version}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          busy={busy && status.state === 'checking'}
          disabled={!supported || busy}
          onClick={check}
        >
          Check for updates
        </Button>
        {!supported && (
          <span className="text-xs text-text-muted">
            Available only in the installed app, not in development.
          </span>
        )}
      </div>
      <div className="mt-3">{renderStatus()}</div>
    </Section>
  );
}

/** Public sharing via ngrok: auto-install + auth token. */
function NgrokSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const [status, setStatus] = useState<NgrokInfo | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await devmgr.ngrok.status());
      } catch {
        // ignore
      }
    })();
    const off = devmgr.ngrok.onProgress((m) => setProgress(m));
    return off;
  }, []);

  const install = async () => {
    setBusy(true);
    setProgress('');
    try {
      setStatus(await devmgr.ngrok.install());
      toast.success('ngrok installed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const saveToken = async () => {
    setBusy(true);
    try {
      setStatus(await devmgr.ngrok.setAuthToken(token));
      setToken('');
      toast.success('ngrok auth token saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('settings.sections.sharing')}>
      <Hint>
        “Share online” on a site exposes it publicly through ngrok. Stacklet installs ngrok for you;
        add a free auth token from{' '}
        <button
          type="button"
          className="text-primary underline"
          onClick={() => devmgr.shell.openExternal('https://dashboard.ngrok.com/get-started/your-authtoken')}
        >
          your ngrok dashboard
        </button>{' '}
        so it can connect.
      </Hint>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm text-foreground">ngrok</span>
        {status === null ? (
          <span className="text-xs text-text-muted">checking…</span>
        ) : status.installed ? (
          <span className="text-xs text-success">Installed</span>
        ) : (
          <span className="text-xs text-text-muted">Not installed</span>
        )}
        {status?.installed &&
          (status.authConfigured ? (
            <span className="text-xs text-success">• token set</span>
          ) : (
            <span className="text-xs text-warning">• no token</span>
          ))}
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy}
          onClick={async () => {
            const file = await devmgr.dialog.pickFile({ name: 'ngrok', extensions: ['exe'] });
            if (!file) return;
            setBusy(true);
            try {
              setStatus(await devmgr.ngrok.setPath(file));
              toast.success('Using your ngrok.exe.');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Use my ngrok.exe…
        </Button>
        <Button size="sm" busy={busy && !!progress} disabled={busy} onClick={install}>
          {status?.installed ? 'Reinstall' : 'Install ngrok'}
        </Button>
      </div>
      <Hint className="mt-1">
        If antivirus blocks the download, click <strong>Use my ngrok.exe…</strong> and pick an ngrok
        you already have (e.g. from ngrok.com).
      </Hint>
      {progress && <p className="mt-2 text-xs text-text-muted">{progress}</p>}
      {status?.installed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-80"
            type="password"
            value={token}
            placeholder="ngrok auth token"
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !token.trim()}
            onClick={saveToken}
          >
            Save token
          </Button>
        </div>
      )}
    </Section>
  );
}

/** Terminal experience: auto-install Cmder/Clink for rich tab completion. */
function TerminalSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { config, refresh } = useStore();
  const [status, setStatus] = useState<CmderInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const enabled = config?.general?.enhanced_terminal !== false;

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await devmgr.cmder.status());
      } catch {
        // ignore
      }
    })();
    const off = devmgr.cmder.onProgress((m) => setProgress(m));
    return off;
  }, []);

  const install = async () => {
    setBusy(true);
    setProgress('');
    try {
      setStatus(await devmgr.cmder.install());
      toast.success('Cmder + Clink installed.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await devmgr.settings.save({ general: { enhanced_terminal: on } });
      await refresh();
      // Turning it on auto-installs Cmder if it isn't there yet.
      if (on && !(status?.installed)) {
        setProgress('');
        setStatus(await devmgr.cmder.install());
        toast.success('Cmder + Clink installed.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Section title={t('settings.sections.terminal')}>
      <Hint>
        Stacklet can run its terminals (Open terminal, Tinker) through Cmder/Clink for rich tab
        completion, history search, and a Git-aware prompt — the same as{' '}
        <code>cmd /k vendor\init.bat</code>. Installed locally; no internet needed afterward.
      </Hint>
      <div className="mt-3 flex flex-col gap-3">
        <Toggle
          label="Use Cmder/Clink autocomplete in Stacklet terminals"
          checked={enabled}
          disabled={busy}
          onChange={(c) => void toggle(c)}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm text-foreground">Cmder + Clink</span>
        {status === null ? (
          <span className="text-xs text-text-muted">checking…</span>
        ) : status.installed ? (
          <span className="text-xs text-success">Installed</span>
        ) : (
          <span className="text-xs text-text-muted">Not installed</span>
        )}
        <Button size="sm" className="ml-auto" disabled={busy} onClick={install}>
          {status?.installed ? 'Reinstall' : 'Install Cmder'}
        </Button>
      </div>
      {progress && <p className="mt-2 text-xs text-text-muted">{progress}</p>}
    </Section>
  );
}
