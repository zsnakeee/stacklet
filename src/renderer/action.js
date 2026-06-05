import { toast } from './toast.js';

/** @type {Set<string>} */
const inFlight = new Set();
let globalBusyCount = 0;

function syncGlobalBusy() {
  const app = document.querySelector('.app');
  if (app) app.classList.toggle('is-action-busy', globalBusyCount > 0);
  const topbar = document.querySelector('.topbar__actions');
  if (topbar) topbar.classList.toggle('is-global-busy', globalBusyCount > 0);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isActionBusy(key) {
  return inFlight.has(key);
}

/**
 * @param {object} opts
 * @param {string} opts.key
 * @param {() => Promise<unknown>} opts.run
 * @param {string} [opts.label] Human-readable action name for toasts
 * @param {HTMLElement | null} [opts.trigger] Button/element to show loading on
 * @param {boolean} [opts.global] Topbar-wide busy indicator
 * @param {boolean} [opts.startToast] Info toast when action starts (default: true if label set)
 * @param {boolean} [opts.successToast] Success toast when done (default: true if label or successMessage)
 * @param {string} [opts.successMessage] Override success text (default: "{label} completed")
 * @param {boolean} [opts.errorToast] Error toast on failure (default: true)
 * @param {boolean} [opts.rethrow]
 */
export async function runAction({
  key,
  run,
  label,
  trigger = null,
  global = false,
  startToast = Boolean(label),
  successToast,
  successMessage,
  errorToast = true,
  rethrow = false,
}) {
  if (inFlight.has(key)) return undefined;

  const showSuccess =
    successToast !== undefined
      ? successToast
      : Boolean(label || successMessage);

  inFlight.add(key);
  if (global) {
    globalBusyCount += 1;
    syncGlobalBusy();
  }

  const prevBusy = trigger?.getAttribute('aria-busy');
  if (trigger) {
    trigger.setAttribute('aria-busy', 'true');
    trigger.classList.add('is-busy');
    if (trigger instanceof HTMLButtonElement) trigger.disabled = true;
  }

  if (startToast && label) {
    toast.pending(label);
  }

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
    inFlight.delete(key);
    if (global) {
      globalBusyCount = Math.max(0, globalBusyCount - 1);
      syncGlobalBusy();
    }
    if (trigger) {
      if (prevBusy == null) trigger.removeAttribute('aria-busy');
      else trigger.setAttribute('aria-busy', prevBusy);
      trigger.classList.remove('is-busy');
      if (trigger instanceof HTMLButtonElement) trigger.disabled = false;
    }
  }
}

/**
 * @param {MouseEvent} e
 * @param {object} opts
 */
export async function runActionClick(e, opts) {
  const trigger = e?.currentTarget instanceof HTMLElement ? e.currentTarget : null;
  return runAction({ ...opts, trigger });
}
