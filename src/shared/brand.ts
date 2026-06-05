/**
 * Product branding — user-facing name and copy.
 * Internal paths, IPC, and CLI stay on `devmgr` for compatibility.
 */

export const BRAND = {
  name: 'Stacklet',
  tagline: 'Your local stack, one place.',
  /** Windows data root segment (%LOCALAPPDATA%\\devmgr) */
  dataDirName: 'devmgr',
  cliName: 'devmgr',
} as const;
