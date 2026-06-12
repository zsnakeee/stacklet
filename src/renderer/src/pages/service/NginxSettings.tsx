import { Button, Hint } from '@/components/ui/primitives';
import { QuickSettingsForm } from '@/pages/service/QuickSettingsForm';
import { NGINX_QUICK_FIELDS } from '@/lib/constants';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';

interface NginxData {
  port: number;
  ssl_port: number;
  settings: Record<string, unknown>;
  configPath: string;
  httpConfPath: string;
}

export function NginxSettings({ version }: { version: string }) {
  const { runAction } = useAction();
  const { refresh } = useStore();
  const toast = useToast();

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'open-nginx-conf',
            label: 'Open nginx.conf',
            successToast: false,
            run: async () => {
              await devmgr.nginx.openConf(version || undefined);
              toast.success('nginx.conf opened');
            },
          })
        }
      >
        Open nginx.conf
      </Button>
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'open-nginx-http-conf',
            label: 'Open HTTP tuning',
            successToast: false,
            run: async () => {
              const data = (await devmgr.nginx.getSettings(version || undefined)) as NginxData | null;
              if (!data?.httpConfPath) throw new Error('stacklet-http.conf not found');
              await devmgr.settings.openPath(data.httpConfPath);
              toast.success('stacklet-http.conf opened');
            },
          })
        }
      >
        Open stacklet-http.conf
      </Button>
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'nginx-restart',
            label: 'Restart nginx',
            run: async () => {
              await devmgr.nginx.restart();
              await refresh();
            },
          })
        }
      >
        Restart nginx
      </Button>
    </div>
  );

  return (
    <QuickSettingsForm
      version={version}
      fields={NGINX_QUICK_FIELDS}
      actionKey="nginx-save-settings"
      saveLabel="Save nginx settings"
      emptyText="nginx.conf not found for this build."
      toolbar={toolbar}
      footnote={
        <Hint>
          HTTP tuning is written to <code>stacklet-http.conf</code>; PHP timeouts apply to all site
          vhosts. Saving runs <strong>Re-apply</strong> and reloads nginx when it is running.
        </Hint>
      }
      load={async (v) => {
        const data = (await devmgr.nginx.getSettings(v)) as NginxData | null;
        if (!data) return null;
        return { port: data.port, ssl_port: data.ssl_port, ...data.settings };
      }}
      save={async (patch, v) => {
        await devmgr.nginx.saveSettings(patch, v);
        toast.info('Restart nginx and PHP so upload limits take effect');
      }}
    />
  );
}
