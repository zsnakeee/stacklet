import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'ghost' | 'danger';
type ButtonSize = 'default' | 'sm';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_1px_rgba(45,212,170,0.25)]',
  ghost:
    'border border-border bg-surface/40 text-foreground hover:bg-surface hover:border-border',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}

export function Button({
  variant = 'ghost',
  size = 'default',
  busy = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:pointer-events-none disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------ IconButton */

type IconTone = 'default' | 'primary' | 'danger';

const ICON_TONES: Record<IconTone, string> = {
  default: 'text-text-secondary hover:text-foreground',
  primary: 'text-text-secondary hover:text-primary',
  danger: 'text-text-secondary hover:text-danger',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconTone;
  busy?: boolean;
}

export function IconButton({
  tone = 'default',
  busy = false,
  disabled,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface/40 transition-colors',
        'hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:pointer-events-none disabled:opacity-40',
        ICON_TONES[tone],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : children}
    </button>
  );
}

/* ----------------------------------------------------------------- Badge */

export type BadgeVariant =
  | 'running'
  | 'stopped'
  | 'missing'
  | 'starting'
  | 'error'
  | 'installed'
  | 'rec';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  running: 'border-success/40 text-success',
  stopped: 'border-border text-text-secondary',
  missing: 'border-border text-text-muted',
  starting: 'border-warning/40 text-warning',
  error: 'border-danger/40 text-danger',
  installed: 'border-primary/40 text-primary',
  rec: 'border-accent/40 text-accent',
};

export function Badge({
  variant,
  dot = false,
  className,
  children,
}: {
  variant: BadgeVariant;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-surface/30 px-2.5 py-1 text-xs font-medium',
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------ Inputs & fields */

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm text-foreground',
        'placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border border-input bg-background/60 px-3 text-sm text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Stacked label + control. */
export function Field({
  label,
  inline = false,
  children,
}: {
  label: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex gap-1.5 text-sm',
        inline ? 'items-center justify-between' : 'flex-col',
      )}
    >
      <span className="text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/* --------------------------------------------------------------- Layout */

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-surface/40 p-5 shadow-sm',
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-base font-semibold text-foreground">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm text-text-secondary', className)}>{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
      {children}
    </p>
  );
}
