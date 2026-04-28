const FALLBACK_REDIRECT = '/dashboard';

/**
 * Allow only same-origin relative redirects. This blocks open-redirect
 * payloads while still preserving normal in-app paths, query strings, and
 * hashes.
 */
export function sanitizeNextPath(next: string | null | undefined, fallback = FALLBACK_REDIRECT): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;

  try {
    const url = new URL(next, 'http://crosscheck.local');
    if (url.origin !== 'http://crosscheck.local') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
