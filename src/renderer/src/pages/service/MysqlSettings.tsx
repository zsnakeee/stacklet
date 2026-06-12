import { Button, Hint } from '@/components/ui/primitives';
import { QuickSettingsForm } from '@/pages/service/QuickSettingsForm';
import { MYSQL_QUICK_FIELDS } from '@/lib/constants';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';

interface MysqlData {
  port: number;
  settings: Record<string, unknown>;
  iniPath: string;
}

export function MysqlSettings({ version }: { version: string }) {
  const { runAction } = useAction();
  const { refresh } = useStore();
  const toast = useToast();

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'open-mysql-ini',
            label: 'Open my.ini',
            successToast: false,
            run: async () => {
              await devmgr.mysql.openIni(version || undefined);
              toast.success('my.ini opened');
            },
          })
        }
      >
        Open my.ini
      </Button>
      <Button
        size="sm"
        onClick={() =>
          runAction({
            key: 'mysql-restart',
            label: 'Restart MySQL',
            run: async () => {
              await devmgr.mysql.restart();
              await refresh();
            },
          })
        }
      >
        Restart MySQL
      </Button>
    </div>
  );

  return (
    <QuickSettingsForm
      version={version}
      fields={MYSQL_QUICK_FIELDS}
      actionKey="mysql-save-settings"
      saveLabel="Save MySQL settings"
      emptyText="my.ini not found for this MariaDB build."
      toolbar={toolbar}
      footnote={
        <Hint>
          Common MariaDB settings — saved to config and written to <code>my.ini</code>. Restart MySQL
          after changing port or InnoDB options.
        </Hint>
      }
      load={async (v) => {
        const data = (await devmgr.mysql.getSettings(v)) as MysqlData | null;
        if (!data) return null;
        return { port: data.port, ...data.settings };
      }}
      save={async (patch, v) => {
        await devmgr.mysql.saveSettings(patch, v);
        toast.info('Restart MySQL if the server was running');
      }}
    />
  );
}
