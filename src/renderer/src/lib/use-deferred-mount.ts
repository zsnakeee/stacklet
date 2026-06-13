import { useEffect, useState } from 'react';

/** Mount expensive UI (WebGL, heavy chunks) only after first paint + idle time. */
export function useDeferredMount(
  enabled = true,
  { minDelayMs = 3500, idleTimeoutMs = 8000 } = {},
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const finish = () => {
      if (!cancelled) setReady(true);
    };

    const minDelay = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(finish, { timeout: idleTimeoutMs });
      } else {
        finish();
      }
    }, minDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(minDelay);
    };
  }, [enabled, minDelayMs, idleTimeoutMs]);

  return ready;
}
