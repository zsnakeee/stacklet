import { lazy, Suspense, useState, type ComponentProps } from 'react';
import { useDeferredMount } from '@/lib/use-deferred-mount';

const LazyGlobe = lazy(() => import('@/components/globe'));

// Once the globe has been mounted in this session, skip the first-paint defer on
// every later Dashboard visit — the chunk is already loaded and the WebGL globe
// is cached, so it should reappear immediately, not after another idle delay.
let globeMountedOnce = false;

type GlobeProps = ComponentProps<typeof LazyGlobe>;

function GlobePlaceholder({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width, height }}
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(45,212,170,0.14),transparent_68%)]" />
      <div className="absolute inset-[12%] rounded-full border border-primary/10 bg-surface/20" />
    </div>
  );
}

/** Loads the WebGL globe long after first paint — keeps the dashboard snappy. */
export function DashboardGlobe(props: GlobeProps) {
  const lg =
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  // Defer only the very first time; afterwards mount immediately.
  const [alreadyMounted] = useState(globeMountedOnce);
  const deferred = useDeferredMount(lg && !alreadyMounted, {
    minDelayMs: 1200,
    idleTimeoutMs: 4000,
  });
  const ready = lg && (alreadyMounted || deferred);
  if (ready) globeMountedOnce = true;

  const width = typeof props.width === 'number' ? props.width : 300;
  const height = typeof props.height === 'number' ? props.height : 260;

  return (
    <div className="pointer-events-none hidden justify-self-center lg:flex">
      {ready ? (
        <Suspense fallback={<GlobePlaceholder width={width} height={height} />}>
          <LazyGlobe {...props} />
        </Suspense>
      ) : (
        <GlobePlaceholder width={width} height={height} />
      )}
    </div>
  );
}
