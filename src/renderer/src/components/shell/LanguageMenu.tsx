import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { LANGUAGES, useLanguage, type LangCode } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Polished language switcher: a styled trigger (globe + native language name)
 * opening a popover list with the active language checked. Replaces the plain
 * native <select> — click-outside / Escape to close, RTL-aware placement, and
 * each option labelled in its own script/direction.
 */
export function LanguageMenu({
  className,
  align = 'end',
}: {
  className?: string;
  /** Which edge the popover aligns to (logical: start/end respect RTL). */
  align?: 'start' | 'end';
}) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('app-no-drag relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('titlebar.language')}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-text-secondary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Icon name="language" size={14} />
        <span className="font-medium">{current.label}</span>
        <Icon
          name="chevronDown"
          size={12}
          className={cn('transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('titlebar.language')}
          className={cn(
            'absolute z-50 mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-xl',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {LANGUAGES.map((l) => {
            const active = l.code === language;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  dir={l.dir}
                  onClick={() => {
                    setLanguage(l.code as LangCode);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface',
                    active ? 'text-primary' : 'text-text-secondary',
                  )}
                >
                  <span className="font-medium">{l.label}</span>
                  {active && <Icon name="check" size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
