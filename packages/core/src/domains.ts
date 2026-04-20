/**
 * Domain utilities + credibility list.
 *
 * Neutral stance: these are widely-cited international wire/reporting outlets
 * used to bootstrap the reliability/corroboration engine. Users can mute any
 * source, and credibility is re-weighted as more signals are corroborated.
 * We never claim these outlets report "the truth" — we only note that many
 * independent readers treat them as reliable enough to cross-check.
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
  'nytimes.com',
  'washingtonpost.com',
  'cbsnews.com',
  'nbcnews.com',
  'abcnews.go.com',
  'cbc.ca',
  'skynews.com',
  'independent.co.uk',
  'euronews.com',
  'thehindu.com',
  'gdacs.org',
  'esa.int',
  'nist.gov',
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
