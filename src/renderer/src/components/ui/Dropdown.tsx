import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { cn } from '@/lib/utils';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional secondary line (e.g. a path or hint) shown under the label. */
  hint?: string;
}

/**
 * Themed select replacement: a styled trigger that opens a popover list matching
 * the app's dark theme (the native <select> popup is OS-rendered and clashes).
 * Click-outside / Escape to close, keyboard up/down/enter/home/end, and the
 * active option is checked. Mirrors the polish of the language switcher.
 */
export function Dropdown<T extends string = string>({
  value,
  options,
  onChange,
  className,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, options, value]);

  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIdx(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIdx(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (options[activeIdx]) choose(options[activeIdx].value);
        break;
    }
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background/60 px-3 text-sm text-foreground',
          'transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={cn('truncate', !current && 'text-text-muted')}>
          {current?.label ?? placeholder}
        </span>
        <Icon
          name="chevronDown"
          size={14}
          className={cn('shrink-0 text-text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-72 w-full min-w-[12rem] overflow-auto rounded-lg border border-border bg-surface-raised py-1 shadow-xl"
        >
          {options.map((o, i) => {
            const active = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                    i === activeIdx ? 'bg-surface' : 'hover:bg-surface',
                    active ? 'text-primary' : 'text-text-secondary',
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{o.label}</span>
                    {o.hint && <span className="truncate text-xs text-text-muted">{o.hint}</span>}
                  </span>
                  {active && <Icon name="check" size={14} className="mt-0.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
