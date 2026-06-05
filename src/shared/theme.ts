/**
 * Stacklet color palette — single source of truth for UI tokens.
 */

export const palette = {
  primary: 'rgb(45, 212, 170)',
  primaryHex: '#2dd4aa',
  accent: 'rgb(96, 165, 250)',
  accentHex: '#60a5fa',
  text: '#eef2f6',
  textSecondary: '#8b9aab',
  textMuted: '#5c6b7a',
  border: 'rgba(139, 154, 171, 0.28)',
  background: '#070a0d',
  surface: '#121a22',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
} as const;

export type Palette = typeof palette;
