import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Empty, Hint, Input } from '@/components/ui/primitives';
import { QuickSettingsForm } from '@/pages/service/QuickSettingsForm';
import { PHP_QUICK_FIELDS } from '@/lib/constants';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { PeclInfo, PhpExtension, VersionInfo } from '@/lib/types';

interface PhpData {
  settings: Record<string, string>;
  iniPath: string;
}

/** Ensure the selected PHP version is the active default before runtime ops. */
async function ensureActive(version: string) {
  const info = (await devmgr.services.versionInfo('php', version)) as VersionInfo;
  if (!info.installed) throw new Error(`Version ${version} is not installed`);
  if (!info.active) await devmgr.services.setActive('php', version);
}

function PhpExtensions({ version, reloadKey }: { version: string; reloadKey: number }) {
  const { runAction } = useAction();
  const [exts, setExts] = useState<PhpExtension[] | null>(null);
  const [pecl, setPecl] = useState<PeclInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const [data, peclData] = await Promise.all([
      devmgr.php.extensions(version) as Promise<{ extensions: PhpExtension[] } | null>,
      devmgr.php.peclInstallable(version) as Promise<PeclInfo | null>,
    ]);
    setExts(data?.extensions ?? null);
    setPecl(peclData ?? null);
    setLoading(false);
  }, [version]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  const restartPrompt = async () => {
    if (window.confirm('Extension installed. Restart PHP now?')) {
      await ensureActive(version);
      await devmgr.php.restart();
    }
  };

  if (loading && !exts) return <Empty>Loading extensions…</Empty>;
  if (!exts) return <Empty>php.ini not found for this PHP build.</Empty>;

  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | undefined)[]) =>
    !q || fields.some((f) => f?.toLowerCase().includes(q));
  const filteredExts = exts.filter((e) => matches(e.name));
  const filteredPecl = (pecl?.packages ?? []).filter((p) =>
    matches(p.peclName, p.iniName, p.label),
  );

  return (
    <div className="flex flex-col gap-5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search extensions (e.g. redis, gd, mongo)…"
      />
      <div>
        <h4 className="mb-2 text-sm font-semibold text-foreground">Bundled extensions</h4>
        <div className="overflow-hidden rounded-lg border border-border">
          {exts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">No DLLs in the ext folder yet.</p>
          ) : filteredExts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">No bundled extensions match “{query}”.</p>
          ) : (
            filteredExts.map((ext) => (
              <div
                key={ext.name}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-2 last:border-0"
              >
                <code className="flex-1 text-sm text-foreground">{ext.name}</code>
                {ext.recommended && <Badge variant="rec">recommended</Badge>}
                <Badge variant={ext.enabled ? 'installed' : 'missing'}>
                  {ext.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button
                  size="sm"
                  disabled={ext.enabled}
                  onClick={() =>
                    runAction({
                      key: `php-ext-${ext.name}-true`,
                      label: `Enable ${ext.name}`,
                      run: async () => {
                        await devmgr.php.setExtension(ext.name, true, version);
                        await reload();
                      },
                    })
                  }
                >
                  Enable
                </Button>
                <Button
                  size="sm"
                  disabled={!ext.enabled}
                  onClick={() =>
                    runAction({
                      key: `php-ext-${ext.name}-false`,
                      label: `Disable ${ext.name}`,
                      run: async () => {
                        await devmgr.php.setExtension(ext.name, false, version);
                        await reload();
                      },
                    })
                  }
                >
                  Disable
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-foreground">Install from PECL (Windows)</h4>
        {pecl?.build && (
          <Hint className="mb-2">
            PECL downloads match PHP <code>{pecl.build.version}</code> (<code>{pecl.build.variantKey}</code>
            {pecl.build.zendModuleApi ? `, API ${pecl.build.zendModuleApi}` : ''}).
          </Hint>
        )}
        <div className="overflow-hidden rounded-lg border border-border">
          {filteredPecl.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              No PECL packages match “{query}”.
            </p>
          ) : null}
          {filteredPecl.map((pkg) => {
            const status = pkg.dllPresent
              ? pkg.enabled
                ? { variant: 'installed' as const, label: 'Installed · on' }
                : { variant: 'missing' as const, label: 'Installed · off' }
              : { variant: 'missing' as const, label: 'Not installed' };
            return (
              <div
                key={pkg.peclName}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-2 last:border-0"
              >
                <span className="flex flex-1 items-baseline gap-2">
                  <code className="text-sm text-foreground">{pkg.iniName}</code>
                  <span className="text-xs text-text-muted">{pkg.label}</span>
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
                {pkg.dllPresent && pkg.enabled ? (
                  <span className="text-xs text-text-muted">Ready</span>
                ) : pkg.dllPresent && !pkg.enabled ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      runAction({
                        key: `php-ext-${pkg.iniName}-true`,
                        label: `Enable ${pkg.iniName}`,
                        run: async () => {
                          await devmgr.php.setExtension(pkg.iniName, true, version);
                          await reload();
                        },
                      })
                    }
                  >
                    Enable
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      runAction({
                        key: `php-pecl-${pkg.peclName}`,
                        label: `Install ${pkg.peclName}`,
                        global: true,
                        run: async () => {
                          await devmgr.php.installPecl(pkg.peclName, version);
                          await reload();
                          await restartPrompt();
                        },
                      })
                    }
                  >
                    Install
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <Hint className="mt-2">
          After installing or enabling extensions, use <strong>Restart PHP</strong>.
        </Hint>
      </div>
    </div>
  );
}

export function PhpSettings({ version }: { version: string }) {
  const { runAction } = useAction();
  const { refresh } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'ini' | 'extensions'>('ini');
  const [extReload, setExtReload] = useState(0);

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'php-ext-recommended',
            label: 'Enable recommended extensions',
            run: async () => {
              await devmgr.php.enableRecommended(version);
              setTab('extensions');
              setExtReload((k) => k + 1);
            },
          })
        }
      >
        Enable recommended
      </Button>
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'open-php-ini',
            label: 'Open php.ini',
            successToast: false,
            run: async () => {
              await devmgr.php.openIni(version || undefined);
              toast.success('php.ini opened');
            },
          })
        }
      >
        Open php.ini
      </Button>
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'php-restart',
            label: 'Restart PHP',
            run: async () => {
              await ensureActive(version);
              await devmgr.php.restart();
              await refresh();
            },
          })
        }
      >
        Restart PHP
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      <div className="flex gap-1 border-b border-border" role="tablist">
        {(['ini', 'extensions'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-foreground',
            )}
          >
            {t === 'ini' ? 'php.ini' : 'Extensions'}
          </button>
        ))}
      </div>

      {tab === 'ini' ? (
        <QuickSettingsForm
          version={version}
          fields={PHP_QUICK_FIELDS}
          actionKey="php-save-settings"
          saveLabel="Save PHP settings"
          emptyText="php.ini not found for this PHP build."
          footnote={<Hint>Quick-edit common php.ini values for the selected version.</Hint>}
          load={async (v) => {
            const data = (await devmgr.php.getSettings(v)) as PhpData | null;
            return data ? data.settings : null;
          }}
          save={async (patch, v) => {
            await devmgr.php.saveSettings(patch as Record<string, string>, v);
          }}
        />
      ) : (
        <PhpExtensions version={version} reloadKey={extReload} />
      )}
    </div>
  );
}
