import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/primitives';
import { useAction } from '@/lib/action';
import { MAILPIT_UI_PORT } from '@/lib/constants';
import { devmgr } from '@/lib/devmgr';
import { bundledById, runtimeStatus, useStore } from '@/lib/store';

export function Mailpit() {
  const { t } = useTranslation();
  const { runAction } = useAction();
  const { status } = useStore();
  const url = `http://127.0.0.1:${MAILPIT_UI_PORT}`;

  const installed = Boolean(bundledById(status, 'mailpit')?.installed);
  const running = runtimeStatus(status, 'mailpit').state === 'running';

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          <Trans i18nKey="mailpit.intro" components={{ code: <code /> }} />
        </p>
        <Button
          size="sm"
          onClick={() =>
            runAction({
              key: 'open-mailpit-ext',
              successToast: false,
              run: () => devmgr.shell.openExternal(url),
            })
          }
        >
          {t('mailpit.openInBrowser')}
        </Button>
      </div>

      {!installed ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          <Trans i18nKey="mailpit.notInstalled" components={{ strong: <strong /> }} />
        </div>
      ) : !running ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {t('mailpit.notRunning')}
        </div>
      ) : (
        <iframe
          title={t('mailpit.inboxTitle')}
          src={url}
          className="min-h-0 w-full flex-1 rounded-xl border border-border bg-white"
        />
      )}
    </div>
  );
}
