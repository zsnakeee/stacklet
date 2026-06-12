import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

type ToastVariant = 'ok' | 'err' | 'info' | 'pending';

interface ToastItem {
  id: number;
  variant: ToastVariant;
  text: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** In-progress action (shown when an action starts). */
  pending: (message: string) => void;
}

const TOAST_DURATION_MS = 4200;
const MAX_TOASTS = 5;

const ToastContext = createContext<ToastApi | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  ok: 'border-success/40 text-success',
  err: 'border-danger/40 text-danger',
  info: 'border-accent/40 text-accent',
  pending: 'border-border text-text-secondary',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const text = String(message ?? '').trim();
      if (!text) return;
      const id = ++seq.current;
      setToasts((prev) => [...prev, { id, variant, text }].slice(-MAX_TOASTS));
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('ok', m),
      error: (m) => push('err', m),
      info: (m) => push('info', m),
      pending: (m) => push('pending', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              role={t.variant === 'err' ? 'alert' : 'status'}
              onClick={() => dismiss(t.id)}
              className={cn(
                'pointer-events-auto cursor-pointer rounded-lg border bg-popover/95 px-4 py-3 text-sm shadow-lg backdrop-blur',
                VARIANT_STYLES[t.variant],
              )}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
