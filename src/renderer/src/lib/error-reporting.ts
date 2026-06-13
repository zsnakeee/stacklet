import type { RendererErrorReport } from '@shared/ipc';

/**
 * Renderer-side crash capture. The renderer runs in its own Chromium process,
 * so its errors never reach the main-process app.log on their own — these hooks
 * forward them over IPC so every failure (thrown errors, rejected promises,
 * console.error, React render crashes) lands in one log file for later triage.
 *
 * Everything here is defensive: reporting must never itself throw or recurse.
 */

let reportingInProgress = false;

/** Forward a single error report to the main process (best-effort, never throws). */
export function reportError(report: RendererErrorReport): void {
  if (reportingInProgress) return; // guard against console.error recursion
  reportingInProgress = true;
  try {
    window.stacklet?.diagnostics?.report({
      ...report,
      url: report.url ?? window.location.hash ?? window.location.href,
    });
  } catch {
    // swallow — the app must keep running even if the bridge is unavailable
  } finally {
    reportingInProgress = false;
  }
}

let installed = false;

/** Install global handlers for uncaught errors, rejected promises, console.error. */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    const err = event.error;
    reportError({
      source: 'window.onerror',
      message: err?.message ?? event.message ?? 'Unknown error',
      stack: err?.stack,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const isErr = reason instanceof Error;
    reportError({
      source: 'unhandledrejection',
      message: isErr ? reason.message : String(reason),
      stack: isErr ? reason.stack : undefined,
    });
  });

  // Tee console.error to the log file without losing the devtools output.
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const message = args
      .map((a) => {
        if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
    reportError({ source: 'console.error', message });
    origError(...args);
  };
}
