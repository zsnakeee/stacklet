import { NavLink } from 'react-router-dom';
import { BRAND } from '@shared/brand';
import ShinyText from '@/components/ShinyText';
import { Icon, type IconName } from '@/components/Icon';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Dashboard', icon: 'navDashboard' },
  { to: '/sites', label: 'Sites', icon: 'navSites' },
  { to: '/services', label: 'Services', icon: 'navServices' },
  { to: '/logs', label: 'Logs', icon: 'navLogs' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { status, bootError } = useStore();
  const { theme } = useTheme();
  const siteCount = status?.sites?.length ?? 0;
  const countLabel = bootError ? '!' : String(siteCount);
  const summaryLabel = bootError
    ? 'Error'
    : status == null
      ? 'Loading…'
      : siteCount === 0
        ? 'No projects yet'
        : siteCount === 1
          ? 'Project'
          : 'Projects';

  // Brand text must read on both themes: dark text on light, light text on dark.
  const brandColor = theme === 'dark' ? '#eef2f6' : '#0f172a';

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col gap-6 border-r border-border bg-background/60 py-6 transition-[width] duration-200',
        collapsed ? 'w-16 px-2' : 'w-60 px-4',
      )}
    >
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
        {collapsed ? (
          <span className="text-xl font-bold text-primary">S</span>
        ) : (
          <div className="min-w-0">
            <ShinyText
              text={BRAND.name}
              className="text-2xl font-bold tracking-tight"
              color={brandColor}
              shineColor="#2dd4aa"
              speed={4}
            />
            <p className="mt-1 text-xs text-text-muted">{BRAND.tagline}</p>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="mx-auto flex size-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Icon name="chevronRight" size={16} />
        </button>
      )}

      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'px-3',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-surface hover:text-foreground',
              )
            }
          >
            <Icon name={item.icon} />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="mt-auto rounded-xl border border-border bg-surface/50 px-4 py-3">
          <span className="block text-2xl font-bold text-foreground">{countLabel}</span>
          <span className="text-xs text-text-muted">{summaryLabel}</span>
        </div>
      )}
    </aside>
  );
}
