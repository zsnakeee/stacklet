import { lazy, Suspense } from 'react';
import { useDeferredMount } from '@/lib/use-deferred-mount';
import { usePrefersReducedMotion } from '@/lib/use-prefers-reduced-motion';
import { useTheme } from '@/lib/theme';

const LazyAurora = lazy(() => import('@/components/Aurora'));

function StaticBackdrop({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(120% 80% at 50% -10%, rgba(45,212,170,0.18), transparent 60%)',
        opacity: theme === 'dark' ? 1 : 0.7,
      }}
    />
  );
}

/**
 * Ambient backdrop — static gradient first, WebGL Aurora loads after idle so
 * navigation and the dashboard stay responsive on open.
 */
export function AppBackground() {
  const reduced = usePrefersReducedMotion();
  const { theme } = useTheme();
  const showAurora = useDeferredMount(!reduced, { minDelayMs: 2000, idleTimeoutMs: 6000 });
  const opacity = theme === 'dark' ? 0.22 : 0.12;

  if (reduced || !showAurora) {
    return <StaticBackdrop theme={theme} />;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
    >
      <Suspense fallback={<StaticBackdrop theme={theme} />}>
        <LazyAurora colorStops={['#2dd4aa', '#60a5fa', '#2dd4aa']} amplitude={0.9} blend={0.6} speed={0.6} />
      </Suspense>
    </div>
  );
}
