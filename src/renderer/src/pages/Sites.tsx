import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Empty, Field, IconButton, Input, Spinner } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import SpotlightCard from '@/components/SpotlightCard';
import { Icon } from '@/components/Icon';
import { useAction } from '@/lib/action';
import { stacklet } from '@/lib/stacklet';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';
import { validateGitUrl, validateSiteName } from '@/lib/validate';
import type { Site } from '@/lib/types';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function matches(site: Site, q: string): boolean {
  if (!q) return true;
  return `${site.name} ${site.hostname} ${site.framework}`.toLowerCase().includes(q);
}

function SiteCard({ site, onCopied }: { site: Site; onCopied: (name: string) => void }) {
  const { t } = useTranslation();
  const { runAction } = useAction();
  const { refresh } = useStore();
  const url = `https://${site.hostname}`;
  const disabled = site.enabled === false;

  return (
    <li className={disabled ? 'opacity-60' : ''}>
      <SpotlightCard
        spotlightColor="rgba(45, 212, 170, 0.15)"
        className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface/40 p-4 transition-colors hover:border-primary/40"
      >
      <Link to={`/sites/${encodeURIComponent(site.name)}`} className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-foreground">{site.hostname}</span>
          <span className="shrink-0 text-xs text-text-muted">{site.framework}</span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-text-muted">{site.doc_root}</p>
      </Link>
      {disabled && (
        <span className="absolute right-3 top-3 rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
          {t('sites.disabled')}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <IconButton
          tone="primary"
          title={site.favorite ? t('sites.unfavorite') : t('sites.favorite')}
          aria-pressed={site.favorite}
          className={site.favorite ? 'text-warning hover:text-warning' : ''}
          onClick={() =>
            runAction({
              key: `fav-${site.name}`,
              label: site.favorite ? 'Unfavorite site' : 'Favorite site',
              run: async () => {
                await stacklet.sitesActions.setFavorite(site.name, !site.favorite);
                await refresh();
              },
            })
          }
        >
          <Icon name={site.favorite ? 'starFilled' : 'star'} />
        </IconButton>
        <IconButton
          title={t('sites.copyUrl')}
          onClick={() =>
            runAction({
              key: `copy-${site.name}`,
              startToast: false,
              successMessage: t('sites.urlCopied'),
              run: async () => {
                if (!(await copyText(url))) throw new Error(t('sites.copyFailed'));
                onCopied(site.name);
              },
            })
          }
        >
          <Icon name="copy" />
        </IconButton>
        <IconButton
          title={t('sites.openHttps')}
          disabled={disabled}
          onClick={() =>
            runAction({
              key: `open-${site.name}`,
              label: 'Open site',
              successToast: false,
              run: () => stacklet.shell.openExternal(url),
            })
          }
        >
          <Icon name="external" />
        </IconButton>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => {
            if (!window.confirm(t('sites.removeConfirm', { name: site.name }))) return;
            void runAction({
              key: `remove-${site.name}`,
              label: 'Remove site',
              run: async () => {
                await stacklet.sitesActions.remove(site.name);
                await refresh();
              },
            });
          }}
        >
          {t('common.remove')}
        </Button>
      </div>
      </SpotlightCard>
    </li>
  );
}

export function Sites() {
  const { t } = useTranslation();
  const { runAction } = useAction();
  const toast = useToast();
  const navigate = useNavigate();
  const { status, refresh } = useStore();
  const sites = status?.sites ?? [];

  const [query, setQuery] = useState('');
  const [, setCopied] = useState('');
  const [laravelOpen, setLaravelOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [laravelErr, setLaravelErr] = useState<string | null>(null);
  const [cloneErr, setCloneErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const q = query.trim().toLowerCase();
  const visible = sites.filter((s) => matches(s, q));

  const pickLinkDir = () =>
    runAction({
      key: 'pick-link-dir',
      label: 'Choose project folder',
      successToast: false,
      run: async () => {
        const path = await stacklet.dialog.pickDirectory();
        if (!path) return;
        setLinkSource(path);
        setLinkOpen(true);
        toast.success(t('sites.folderSelected'));
      },
    });

  const submitLaravel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '');
    const err = validateSiteName(name);
    if (err) {
      setLaravelErr(err);
      return;
    }
    setLaravelErr(null);
    setCreating(true);
    setCreateMsg(t('sites.startingProgress'));
    const off = stacklet.site.onCreateProgress((p) => setCreateMsg(p.message));
    void runAction({
      key: 'site-laravel',
      label: 'New Laravel project',
      global: true,
      run: async () => {
        try {
          await stacklet.sitesActions.createLaravel(name);
          await refresh();
          setLaravelOpen(false);
          navigate('/sites');
        } finally {
          off();
          setCreating(false);
        }
      },
    });
  };

  const submitLink = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!linkSource) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    void runAction({
      key: 'site-link',
      label: 'Link project',
      global: true,
      run: async () => {
        setLinkOpen(false);
        await stacklet.sitesActions.linkExisting(linkSource, name || undefined);
        setLinkSource(null);
        await refresh();
        navigate('/sites');
      },
    });
  };

  const submitClone = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const url = String(data.get('url') ?? '').trim();
    const name = String(data.get('name') ?? '').trim();
    const err = validateGitUrl(url) || (name ? validateSiteName(name) : null);
    if (err) {
      setCloneErr(err);
      return;
    }
    setCloneErr(null);
    void runAction({
      key: 'site-clone',
      label: 'Clone project',
      global: true,
      run: async () => {
        setCloneOpen(false);
        await stacklet.sitesActions.cloneGit(url, name || undefined);
        await refresh();
        navigate('/sites');
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setLaravelOpen(true)}>
          {t('sites.newLaravel')}
        </Button>
        <Button onClick={pickLinkDir}>{t('sites.addExisting')}</Button>
        <Button onClick={() => setCloneOpen(true)}>{t('sites.cloneGit')}</Button>
        <Input
          type="search"
          placeholder={t('sites.searchPlaceholder')}
          aria-label={t('sites.searchAria')}
          className="ml-auto w-56"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {sites.length === 0 ? (
        <Empty>{t('sites.emptyNone')}</Empty>
      ) : visible.length === 0 ? (
        <Empty>{t('sites.noMatch', { query })}</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((site) => (
            <SiteCard key={site.name} site={site} onCopied={setCopied} />
          ))}
        </ul>
      )}

      <Modal
        open={laravelOpen}
        onClose={() => {
          if (!creating) setLaravelOpen(false);
        }}
        title={t('sites.newLaravel')}
      >
        {creating ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Spinner />
              {t('sites.creatingProject')}
            </div>
            <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs text-text-secondary">
              {createMsg}
            </pre>
            <p className="text-xs text-text-muted">{t('sites.composerNote')}</p>
          </div>
        ) : (
          <form onSubmit={submitLaravel} className="flex flex-col gap-4">
          <Field label={t('sites.folderName')}>
            <Input name="name" required placeholder="my-app" autoComplete="off" />
          </Field>
          <p className="text-xs text-text-muted">{t('sites.laravelCreatesNote')}</p>
          {laravelErr && <p className="text-xs text-danger">{laravelErr}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setLaravelOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.create')}
            </Button>
          </div>
        </form>
        )}
      </Modal>

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title={t('sites.linkTitle')}>
        <form onSubmit={submitLink} className="flex flex-col gap-4">
          <Field label={t('sites.siteNameOptional')}>
            <Input name="name" placeholder={t('sites.defaultsFolderName')} autoComplete="off" />
          </Field>
          <p className="font-mono text-xs text-text-muted">{linkSource}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setLinkOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('sites.link')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={cloneOpen} onClose={() => setCloneOpen(false)} title={t('sites.cloneTitle')}>
        <form onSubmit={submitClone} className="flex flex-col gap-4">
          <Field label={t('sites.repoUrl')}>
            <Input name="url" required placeholder="https://github.com/user/repo.git" autoComplete="off" />
          </Field>
          <Field label={t('sites.folderNameOptional')}>
            <Input name="name" placeholder={t('sites.defaultsRepoName')} autoComplete="off" />
          </Field>
          <p className="text-xs text-text-muted">{t('sites.cloneNote')}</p>
          {cloneErr && <p className="text-xs text-danger">{cloneErr}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setCloneOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('sites.clone')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
