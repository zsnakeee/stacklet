import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Field, IconButton, Input, Section, Toggle } from '@/components/ui/primitives';
import { Icon } from '@/components/Icon';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { openSiteLog } from '@/lib/logs-helpers';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { validateAliases, validateDomain } from '@/lib/validate';
import type { SiteDetail as SiteDetailData } from '@/lib/types';

function InfoRow({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-xs text-text-secondary' : 'text-foreground'}>
        {children}
      </dd>
    </div>
  );
}

export function SiteDetail() {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { runAction } = useAction();
  const { refresh } = useStore();

  const [detail, setDetail] = useState<SiteDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [artisanOut, setArtisanOut] = useState<string | null>(null);
  const [cfgStatus, setCfgStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail((await devmgr.site.detail(name)) as SiteDetailData);
    } catch {
      setNotFound(true);
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  if (notFound) return <Empty>Site not found</Empty>;
  if (!detail) return <Empty>Loading…</Empty>;

  const isLaravel = detail.framework === 'laravel';
  const openUrl = () =>
    runAction({ key: `open-${name}`, label: 'Open site', successToast: false, run: () => devmgr.shell.openExternal(detail.url) });

  const runArtisan = (args: string[]) =>
    runAction({
      key: `artisan-${name}-${args.join('-')}`,
      label: args.length ? `artisan ${args.join(' ')}` : 'artisan',
      run: async () => {
        setArtisanOut('Running…');
        const text = await devmgr.site.artisan(name, args);
        setArtisanOut(text);
      },
    });

  const submitDomain = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const rawDomain = String(data.get('domain') ?? '').trim();
    const rawAliases = String(data.get('aliases') ?? '');
    const validationErr = validateDomain(rawDomain) || validateAliases(rawAliases);
    if (validationErr) {
      setCfgStatus({ text: validationErr, ok: false });
      return;
    }
    const domain =
      !rawDomain || rawDomain.toLowerCase() === detail.defaultHostname.toLowerCase() ? null : rawDomain;
    const aliases = rawAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    void runAction({
      key: `site-domain-${name}`,
      label: 'Save domain',
      run: async () => {
        await devmgr.sitesActions.setDomain(name, domain, aliases);
        await refresh();
        await load();
        setCfgStatus({ text: 'Domain saved.', ok: true });
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/sites" className="text-sm text-text-secondary hover:text-foreground">
        ← Sites
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{detail.hostname}</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {detail.name} · {detail.framework}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openUrl}>
          <Icon name="external" />
          <span>Open site</span>
        </Button>
      </header>

      <Section title="Project info">
        <dl>
          <InfoRow label="Name">{detail.name}</InfoRow>
          <InfoRow label="Hostname">{detail.hostname}</InfoRow>
          <InfoRow label="URL">
            <button type="button" className="text-accent hover:underline" onClick={openUrl}>
              {detail.url}
            </button>
          </InfoRow>
          <InfoRow label="Framework">{detail.framework}</InfoRow>
          <InfoRow label="Project root" mono>
            {detail.root}
          </InfoRow>
          <InfoRow label="Document root" mono>
            {detail.doc_root}
          </InfoRow>
          {detail.envPath && (
            <InfoRow label=".env" mono>
              {detail.envPath}
            </InfoRow>
          )}
          {detail.laravelLogPath && (
            <InfoRow label="Laravel log" mono>
              {detail.laravelLogPath}
            </InfoRow>
          )}
        </dl>

        <div className="mt-4 flex items-center gap-1.5">
          <IconButton
            title="Open folder in Explorer"
            onClick={() =>
              runAction({
                key: `explorer-${name}`,
                label: 'Open in Explorer',
                successToast: false,
                run: () => devmgr.site.openInExplorer(name),
              })
            }
          >
            <Icon name="folder" />
          </IconButton>
          <Button
            size="sm"
            onClick={() =>
              runAction({
                key: `terminal-${name}`,
                label: 'Open terminal',
                successToast: false,
                run: () => devmgr.site.terminal(name),
              })
            }
          >
            Open terminal
          </Button>
          {isLaravel && detail.hasArtisan && (
            <Button
              size="sm"
              onClick={() =>
                runAction({
                  key: `tinker-${name}`,
                  label: 'Open Tinker',
                  successToast: false,
                  run: () => devmgr.site.tinker(name),
                })
              }
            >
              Tinker
            </Button>
          )}
          {isLaravel && detail.hasArtisan && (
            <>
              <IconButton title="Clear caches (optimize:clear)" onClick={() => runArtisan(['optimize:clear'])}>
                <Icon name="clear" />
              </IconButton>
              <IconButton title="Optimize" onClick={() => runArtisan(['optimize'])}>
                <Icon name="optimize" />
              </IconButton>
              {detail.laravelLogId && (
                <IconButton
                  title="Laravel log"
                  onClick={() =>
                    runAction({
                      key: `site-log-${name}`,
                      successToast: false,
                      run: async () => {
                        if (!(await openSiteLog(name)))
                          toast.info('No Laravel log file found for this project.');
                      },
                    })
                  }
                >
                  <Icon name="log" />
                </IconButton>
              )}
            </>
          )}
        </div>

        {artisanOut !== null && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs text-text-secondary">
            {artisanOut}
          </pre>
        )}

        <div className="mt-4 border-t border-border pt-3">
          <Button
            size="sm"
            onClick={() => {
              if (
                !window.confirm(
                  `Remove "${detail.name}" from Stacklet? Your project files on disk are not deleted.`,
                )
              )
                return;
              void runAction({
                key: `remove-detail-${detail.name}`,
                label: 'Remove site',
                run: async () => {
                  await devmgr.sitesActions.remove(detail.name);
                  navigate('/sites');
                  await refresh();
                },
              });
            }}
          >
            Remove from Stacklet
          </Button>
        </div>
      </Section>

      <Section title="Configuration">
        <div className="flex flex-col gap-3">
          <Toggle
            label="Enabled (served by nginx and hosts file)"
            checked={detail.enabled !== false}
            onChange={(checked) =>
              runAction({
                key: `site-enabled-${name}`,
                label: checked ? 'Enable site' : 'Disable site',
                run: async () => {
                  await devmgr.sitesActions.setEnabled(name, checked);
                  await refresh();
                  await load();
                  setCfgStatus({ text: checked ? 'Site enabled.' : 'Site disabled.', ok: true });
                },
              })
            }
          />
          <Toggle
            label="Favorite (pinned to the top of the list)"
            checked={Boolean(detail.favorite)}
            onChange={(checked) =>
              runAction({
                key: `site-fav-detail-${name}`,
                label: checked ? 'Favorite site' : 'Unfavorite site',
                run: async () => {
                  await devmgr.sitesActions.setFavorite(name, checked);
                  await refresh();
                  await load();
                },
              })
            }
          />

          <form onSubmit={submitDomain} className="mt-2 flex flex-col gap-3">
            <Field label="Primary domain">
              <Input
                name="domain"
                defaultValue={detail.hostname}
                placeholder={detail.defaultHostname}
                autoComplete="off"
              />
            </Field>
            <Field label="Aliases (comma-separated)">
              <Input
                name="aliases"
                defaultValue={(detail.aliases ?? []).join(', ')}
                placeholder="www.example.test, example.test"
                autoComplete="off"
              />
            </Field>
            <div>
              <Button type="submit" variant="primary" size="sm">
                Save domain
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Saving updates the hosts file and certificate — Windows may prompt for permission.
            </p>
          </form>

          {cfgStatus && (
            <p className={cfgStatus.ok ? 'text-xs text-success' : 'text-xs text-danger'}>
              {cfgStatus.text}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
