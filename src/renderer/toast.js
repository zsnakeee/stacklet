const TOAST_DURATION_MS = 4200;
const MAX_TOASTS = 5;

/** @type {HTMLElement | null} */
let host = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(host);
  }
  return host;
}

/**
 * @param {'ok' | 'err' | 'info' | 'pending'} variant
 * @param {string} message
 */
function showToast(variant, message) {
  const text = String(message ?? '').trim();
  if (!text) return;

  const variantClass =
    variant === 'ok'
      ? 'ok'
      : variant === 'err'
        ? 'err'
        : variant === 'pending'
          ? 'pending'
          : 'info';

  const el = document.createElement('div');
  el.className = `toast toast--${variantClass}`;
  el.setAttribute('role', variant === 'err' ? 'alert' : 'status');
  el.textContent = text;

  const container = ensureHost();
  container.appendChild(el);

  while (container.children.length > MAX_TOASTS) {
    container.firstElementChild?.remove();
  }

  requestAnimationFrame(() => el.classList.add('toast--visible'));

  const dismiss = () => {
    el.classList.remove('toast--visible');
    el.classList.add('toast--leaving');
    const remove = () => el.remove();
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400);
  };

  el.addEventListener('click', dismiss);
  setTimeout(dismiss, TOAST_DURATION_MS);
}

export const toast = {
  success: (message) => showToast('ok', message),
  error: (message) => showToast('err', message),
  info: (message) => showToast('info', message),
  /** In-progress action (shown when an action starts). */
  pending: (message) => showToast('pending', message),
};
