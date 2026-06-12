import { Button } from '@/components/ui/primitives';
import { useAction } from '@/lib/action';
import { bundledById, useStore } from '@/lib/store';
import { devmgr } from '@/lib/devmgr';

export function TopBar({ title }: { title: string }) {
  const { runAction } = useAction();
  const {
    status,
    bootstrapping,
    autostart,
    refresh,
    clearRowErrors,
    setGlobalError,
  } = useStore();

  const bundled = status?.bundledServices ?? [];
  const hasAnyInstalled = bundled.some((s) => s.installed);
  const nginxInstalled = Boolean(bundledById(status, 'nginx')?.installed);

  const syncHosts = () =>
    runAction({
      key: 'hosts-sync',
      label: 'Sync hosts',
      global: true,
      successToast: false,
      run: async () => {
        const result = await devmgr.hosts.sync();
        await refresh();
        return result;
      },
    });

  const reapply = () =>
    runAction({
      key: 'apply',
      label: 'Re-apply configs',
      global: true,
      run: async () => {
        await devmgr.apply();
        await refresh();
      },
    });

  const reloadAll = () =>
    runAction({
      key: 'reload-all',
      label: 'Reload everything',
      global: true,
      run: async () => {
        await devmgr.reloadAll();
        await refresh();
      },
    });

  const startAll = () =>
    runAction({
      key: 'start-all',
      label: 'Start all services',
      global: true,
      run: async () => {
        setGlobalError(null);
        try {
          await devmgr.start();
        } catch (err) {
          setGlobalError(err instanceof Error ? err.message : String(err));
          throw err;
        }
        await refresh();
      },
    });

  const stopAll = () =>
    runAction({
      key: 'stop-all',
      label: 'Stop all services',
      global: true,
      run: async () => {
        setGlobalError(null);
        clearRowErrors();
        await devmgr.stop();
        await refresh();
      },
    });

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6">
      <h2
        key={title}
        className="min-w-0 truncate text-xl font-semibold animate-in fade-in slide-in-from-bottom-1"
      >
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {autostart && (
          <span className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {autostart}
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={syncHosts}
            disabled={bootstrapping}
            title="Update Windows hosts file when entries are missing"
          >
            Sync hosts
          </Button>
          <Button
            size="sm"
            onClick={reapply}
            disabled={bootstrapping || !nginxInstalled}
            title="Regenerate nginx/PHP configs"
          >
            Re-apply
          </Button>
          <Button
            size="sm"
            onClick={reloadAll}
            disabled={bootstrapping || !hasAnyInstalled}
            title="Regenerate all configs + HTTPS certs and restart every running service"
          >
            Reload all
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={startAll} disabled={bootstrapping || !hasAnyInstalled}>
            Start all
          </Button>
          <Button onClick={stopAll} disabled={bootstrapping || !hasAnyInstalled}>
            Stop all
          </Button>
        </div>
      </div>
    </header>
  );
}
