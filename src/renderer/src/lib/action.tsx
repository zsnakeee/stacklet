import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from '@/lib/toast';

export interface RunActionOptions {
  /** Unique key — concurrent calls with the same key are ignored. */
  key: string;
  run: () => Promise<unknown>;
  /** Human-readable action name for toasts. */
  label?: string;
  /** Drive the top-bar-wide busy indicator. */
  global?: boolean;
  /** Info toast when the action starts (default: true if label set). */
  startToast?: boolean;
  /** Success toast when done (default: true if label or successMessage). */
  successToast?: boolean;
  /** Override success text (default: "{label} completed"). */
  successMessage?: string;
  /** Error toast on failure (default: true). */
  errorToast?: boolean;
  rethrow?: boolean;
}

interface ActionApi {
  runAction: (opts: RunActionOptions) => Promise<unknown>;
  isBusy: (key: string) => boolean;
  globalBusy: boolean;
}

const ActionContext = createContext<ActionApi | null>(null);

export function ActionProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [globalCount, setGlobalCount] = useState(0);
  // Synchronous dedupe guard (state updates are async).
  const inFlight = useRef<Set<string>>(new Set());

  const setBusy = useCallback((key: string, busy: boolean) => {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (opts: RunActionOptions) => {
      const {
        key,
        run,
        label,
        global = false,
        startToast = Boolean(label),
        successToast,
        successMessage,
        errorToast = true,
        rethrow = false,
      } = opts;

      if (inFlight.current.has(key)) return undefined;
      inFlight.current.add(key);

      const showSuccess =
        successToast !== undefined ? successToast : Boolean(label || successMessage);

      setBusy(key, true);
      if (global) setGlobalCount((c) => c + 1);
      if (startToast && label) toast.pending(label);

      try {
        const result = await run();
        if (showSuccess) {
          const msg = successMessage ?? (label ? `${label} completed` : '');
          if (msg) toast.success(msg);
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (errorToast) toast.error(label ? `${label}: ${msg}` : msg);
        if (rethrow) throw err;
        return undefined;
      } finally {
        inFlight.current.delete(key);
        setBusy(key, false);
        if (global) setGlobalCount((c) => Math.max(0, c - 1));
      }
    },
    [toast, setBusy],
  );

  const api = useMemo<ActionApi>(
    () => ({
      runAction,
      isBusy: (key: string) => busyKeys.has(key),
      globalBusy: globalCount > 0,
    }),
    [runAction, busyKeys, globalCount],
  );

  return <ActionContext.Provider value={api}>{children}</ActionContext.Provider>;
}

export function useAction(): ActionApi {
  const ctx = useContext(ActionContext);
  if (!ctx) throw new Error('useAction must be used within ActionProvider');
  return ctx;
}
