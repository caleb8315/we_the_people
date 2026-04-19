/**
 * Domain utilities + credibility list.
 *
 * Neutral stance: these are widely-cited international wire/reporting outlets
 * used to bootstrap the verification engine. Users can mute any source, and
 * credibility updates as more signals are corroborated.
 */

export const CREDIBLE_DOMAINS: ReadonlySet<string> = new Set([
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'theguardian.com',
  'aljazeera.com',
  'france24.com',
  'dw.com',
  'npr.org',
  'reliefweb.int',
  'usgs.gov',
  'nasa.gov',
  'noaa.gov',
  'cisa.gov',
  'si.edu',
  'un.org',
  'who.int',
]);

export function extractDomain(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isDomainMatch(candidate: string, trusted: string): boolean {
  const c = candidate.toLowerCase().replace(/^www\./, '');
  const t = trusted.toLowerCase().replace(/^www\./, '');
  return c === t || c.endsWith('.' + t);
}

export function isCredibleDomain(domain: string): boolean {
  if (!domain) return false;
  for (const trusted of CREDIBLE_DOMAINS) {
    if (isDomainMatch(domain, trusted)) return true;
  }
  return false;
}
