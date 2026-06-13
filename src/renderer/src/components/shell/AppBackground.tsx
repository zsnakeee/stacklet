import { useReducedMotion } from 'motion/react';
import Aurora from '@/components/Aurora';
import { useTheme } from '@/lib/theme';

/**
 * Ambient animated backdrop (React Bits Aurora) tuned to the Stacklet teal
 * palette. Sits behind the translucent shell panels for a subtle glow.
 * Falls back to a static gradient when the user prefers reduced motion, and is
 * dialled back in the light theme so it stays subtle on a bright surface.
 */
export function AppBackground() {
  const reduced = useReducedMotion();
  const { theme } = useTheme();
  const opacity = theme === 'dark' ? 0.22 : 0.12;

  if (reduced) {
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

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
    >
      <Aurora colorStops={['#2dd4aa', '#60a5fa', '#2dd4aa']} amplitude={0.9} blend={0.6} speed={0.6} />
    </div>
  );
}
