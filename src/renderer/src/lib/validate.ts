/** Input validation shared by the site forms. Returns an error string or null. */

export function validateSiteName(name: string): string | null {
  const v = name.trim();
  if (!v) return 'Name is required.';
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) {
    return 'Use only letters, numbers, dot, dash or underscore (no spaces).';
  }
  if (v.length > 60) return 'Name is too long (max 60 characters).';
  return null;
}

export function validateGitUrl(url: string): string | null {
  const v = url.trim();
  if (!v) return 'Repository URL is required.';
  if (!/^(https?:\/\/|git@)/i.test(v)) {
    return 'Enter an http(s):// or git@ repository URL.';
  }
  return null;
}

/** Empty is allowed (falls back to the default hostname). */
export function validateDomain(domain: string): string | null {
  const v = domain.trim();
  if (!v) return null;
  if (v.length > 253) return 'Domain is too long.';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v)) {
    return 'Enter a valid hostname, e.g. my-app.test';
  }
  return null;
}

export function validateAliases(raw: string): string | null {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (validateDomain(p)) return `Invalid alias: "${p}"`;
  }
  return null;
}
