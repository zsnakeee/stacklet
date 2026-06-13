import { Button } from '@/components/ui/primitives';
import { useAction } from '@/lib/action';
import { MAILPIT_UI_PORT } from '@/lib/constants';
import { devmgr } from '@/lib/devmgr';
import { bundledById, runtimeStatus, useStore } from '@/lib/store';

export function Mailpit() {
  const { runAction } = useAction();
  const { status } = useStore();
  const url = `http://127.0.0.1:${MAILPIT_UI_PORT}`;

  const installed = Boolean(bundledById(status, 'mailpit')?.installed);
  const running = runtimeStatus(status, 'mailpit').state === 'running';

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          Mailpit inbox — catches all app email (point your app at SMTP <code>127.0.0.1:1025</code>).
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
          Open in browser
        </Button>
      </div>

      {!installed ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Mailpit isn’t installed yet. Install it from <strong>Services → Mailpit</strong>.
        </div>
      ) : !running ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          Mailpit isn’t running. Start it from the Dashboard or Services, then this inbox loads here.
        </div>
      ) : (
        <iframe
          title="Mailpit inbox"
          src={url}
          className="min-h-0 w-full flex-1 rounded-xl border border-border bg-white"
        />
      )}
    </div>
  );
}
