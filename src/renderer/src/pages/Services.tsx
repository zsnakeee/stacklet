import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@/components/ui/primitives';
import SpotlightCard from '@/components/SpotlightCard';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { tEngine } from '@/lib/engine-i18n';
import { useStore } from '@/lib/store';

export function Services() {
  const { t } = useTranslation();
  const { runAction } = useAction();
  const { status, refresh } = useStore();
  const bundled = status?.bundledServices ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex">
        <Button
          size="sm"
          onClick={() =>
            runAction({
              key: 'catalog-refresh',
              label: 'Refresh catalog',
              run: async () => {
                await devmgr.services.refresh();
                await refresh();
              },
            })
          }
        >
          {t('services.refreshVersions')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bundled.map((svc) => (
          <Link key={svc.id} to={`/services/${svc.id}`} className="block">
            <SpotlightCard
              spotlightColor="rgba(45, 212, 170, 0.15)"
              className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface/40 p-5 transition-colors hover:border-primary/40"
            >
              <h3 className="text-base font-semibold text-foreground">{svc.name}</h3>
              <p className="flex-1 text-sm text-text-secondary">{tEngine(svc.description)}</p>
              <Badge variant={svc.installed ? 'installed' : 'missing'}>
                {svc.installed ? `v${svc.installedVersion ?? ''}` : t('common.notInstalled')}
              </Badge>
            </SpotlightCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
