import { useEffect, useState } from 'react';
import { Button, Hint } from '@/components/ui/primitives';
import { QuickSettingsForm } from '@/pages/service/QuickSettingsForm';
import { PMA_QUICK_FIELDS } from '@/lib/constants';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useToast } from '@/lib/toast';

interface PmaData {
  hostname: string;
  url: string;
  settings: Record<string, unknown>;
  configPath: string;
}

export function PmaSettings({ version }: { version: string }) {
  const { runAction } = useAction();
  const toast = useToast();
  const [url, setUrl] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = (await devmgr.phpmyadmin.getSettings(version)) as PmaData | null;
      if (alive) setUrl(data?.url ?? '');
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'open-pma-config',
            label: 'Open config.inc.php',
            successToast: false,
            run: async () => {
              await devmgr.phpmyadmin.openConfig(version || undefined);
              toast.success('config.inc.php opened');
            },
          })
        }
      >
        Open config.inc.php
      </Button>
    </div>
  );

  return (
    <QuickSettingsForm
      version={version}
      fields={PMA_QUICK_FIELDS}
      actionKey="pma-save-settings"
      saveLabel="Save phpMyAdmin settings"
      emptyText="config.inc.php not found for this phpMyAdmin build."
      toolbar={toolbar}
      footnote={
        <>
          {url && (
            <Hint>
              Site URL:{' '}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => devmgr.shell.openExternal(url)}
              >
                {url}
              </button>
            </Hint>
          )}
          <Hint>
            Saved to <code>config.toml</code> and <code>config.inc.php</code>. Import size uses{' '}
            <code>Max upload size</code> — keep it in line with nginx <strong>Max body size</strong>.
            Saving runs <strong>Re-apply</strong>.
          </Hint>
        </>
      }
      load={async (v) => {
        const data = (await devmgr.phpmyadmin.getSettings(v)) as PmaData | null;
        if (!data) return null;
        return { hostname: data.hostname, ...data.settings };
      }}
      save={async (patch, v) => {
        await devmgr.phpmyadmin.saveSettings(patch, v);
      }}
    />
  );
}
