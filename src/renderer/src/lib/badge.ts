import type { BadgeVariant } from '@/components/ui/primitives';
import type { RuntimeService } from '@/lib/types';

/** Mirror of the old badgeForRuntime(): runtime state -> badge variant + label. */
export function badgeForRuntime(
  rt: RuntimeService,
  opts: { starting?: boolean; error?: boolean } = {},
): { variant: BadgeVariant; label: string } {
  if (opts.starting) return { variant: 'starting', label: 'Starting' };
  if (opts.error) return { variant: 'error', label: 'Failed' };
  if (rt.state === 'running') return { variant: 'running', label: 'Running' };
  if (rt.state === 'not_configured') return { variant: 'missing', label: 'Not set up' };
  return { variant: 'stopped', label: 'Stopped' };
}
