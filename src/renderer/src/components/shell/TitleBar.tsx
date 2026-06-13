import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { devmgr } from '@/lib/devmgr';
import { useTheme } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { LanguageMenu } from '@/components/shell/LanguageMenu';
import { cn } from '@/lib/utils';

function ControlButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'app-no-drag flex h-full w-11 items-center justify-center text-text-secondary transition-colors',
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-surface hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();

  useEffect(() => devmgr.window.onMaximized?.(setMaximized), []);

  return (
    <header
      className="app-drag flex h-[var(--titlebar-h)] shrink-0 items-center justify-between border-b border-border bg-background/80"
      style={{ height: 'var(--titlebar-h)' }}
    >
      <div className="flex items-center gap-2 px-4 text-sm font-semibold tracking-tight">
        <span className="text-foreground">
          Stack<span className="text-primary">let</span>
        </span>
      </div>
      <div className="flex h-full items-center">
        <LanguageMenu className="mx-1" />
        <button
          type="button"
          title={theme === 'dark' ? t('titlebar.toLight') : t('titlebar.toDark')}
          aria-label={theme === 'dark' ? t('titlebar.toLight') : t('titlebar.toDark')}
          onClick={toggle}
          className="app-no-drag flex h-full w-11 items-center justify-center text-text-secondary transition-colors hover:bg-surface hover:text-foreground"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
        </button>
        <ControlButton label={t('titlebar.minimize')} onClick={() => devmgr.window.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect y="4" width="10" height="1" fill="currentColor" />
          </svg>
        </ControlButton>
        <ControlButton
          label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
          onClick={() => devmgr.window.maximize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </ControlButton>
        <ControlButton label={t('titlebar.close')} danger onClick={() => devmgr.window.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1 9 9M9 1 1 9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </ControlButton>
      </div>
    </header>
  );
}
