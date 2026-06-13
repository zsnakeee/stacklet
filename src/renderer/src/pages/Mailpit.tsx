import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/primitives';
import { useAction } from '@/lib/action';
import { MAILPIT_SMTP_PORT, MAILPIT_UI_PORT } from '@/lib/constants';
import { devmgr } from '@/lib/devmgr';
import { bundledById, runtimeStatus, useStore } from '@/lib/store';

export function Mailpit() {
  const { t } = useTranslation();
  const { runAction } = useAction();
  const { status } = useStore();
  const url = `http://127.0.0.1:${MAILPIT_UI_PORT}`;
  const smtpPort = MAILPIT_SMTP_PORT;

  const [showGuide, setShowGuide] = useState(false);

  const installed = Boolean(bundledById(status, 'mailpit')?.installed);
  const running = runtimeStatus(status, 'mailpit').state === 'running';

  const envSnippet = [
    'MAIL_MAILER=smtp',
    'MAIL_HOST=127.0.0.1',
    `MAIL_PORT=${smtpPort}`,
    'MAIL_USERNAME=null',
    'MAIL_PASSWORD=null',
    'MAIL_ENCRYPTION=null',
    'MAIL_FROM_ADDRESS="hello@example.test"',
    'MAIL_FROM_NAME="${APP_NAME}"',
  ].join('\n');

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          <Trans i18nKey="mailpit.intro" components={{ code: <code /> }} />
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowGuide((v) => !v)}>
            {showGuide ? 'Hide guide' : 'How to use'}
          </Button>
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
      </div>

      {showGuide && (
        <div className="rounded-xl border border-border bg-surface/40 p-4 text-sm">
          <h3 className="text-sm font-semibold text-foreground">How to use Mailpit</h3>
          <p className="mt-1 text-text-secondary">
            Mailpit catches every email your apps send so nothing reaches real inboxes during
            development. Point your app's SMTP at <code>127.0.0.1:{smtpPort}</code> (no auth), then
            open this inbox to read what was sent.
          </p>
          <p className="mt-3 font-medium text-foreground">Laravel — <code>.env</code></p>
          <pre className="mt-1 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs text-text-secondary">
            {envSnippet}
          </pre>
          <div className="mt-2">
            <Button
              size="sm"
              onClick={() =>
                runAction({
                  key: 'copy-mailpit-env',
                  successToast: false,
                  run: async () => {
                    await navigator.clipboard.writeText(envSnippet);
                  },
                })
              }
            >
              Copy .env block
            </Button>
          </div>
          <p className="mt-3 text-text-secondary">
            After editing <code>.env</code>, run <code>php artisan config:clear</code>. Other
            frameworks: use host <code>127.0.0.1</code>, port <code>{smtpPort}</code>, no username or
            password. The web inbox (this page) is at <code>{url}</code>.
          </p>
        </div>
      )}

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
