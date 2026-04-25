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
  // Wire services
  'reuters.com',
  'apnews.com',
  'afp.com',
  // US broadcast / major print
  'cnn.com',
  'nytimes.com',
  'washingtonpost.com',
  'cbsnews.com',
  'nbcnews.com',
  'abcnews.go.com',
  'npr.org',
  'foxnews.com',
  'usatoday.com',
  'politico.com',
  'thehill.com',
  // UK / Europe
  'bbc.com',
  'bbc.co.uk',
  'theguardian.com',
  'independent.co.uk',
  'telegraph.co.uk',
  'skynews.com',
  'euronews.com',
  'france24.com',
  'dw.com',
  'rte.ie',
  'irishtimes.com',
  'spiegel.de',
  'lemonde.fr',
  // Middle East / Africa
  'aljazeera.com',
  'middleeasteye.net',
  'arabnews.com',
  'haaretz.com',
  'timesofisrael.com',
  'trtworld.com',
  'allafrica.com',
  // Asia-Pacific
  'scmp.com',
  'japantimes.co.jp',
  'straitstimes.com',
  'abc.net.au',
  'thehindu.com',
  'hindustantimes.com',
  'nikkei.com',
  'channelnewsasia.com',
  // Americas (non-US)
  'cbc.ca',
  'globalnews.ca',
  // Government / institutional / scientific
  'reliefweb.int',
  'usgs.gov',
  'nasa.gov',
  'noaa.gov',
  'weather.gov',
  'cisa.gov',
  'si.edu',
  'un.org',
  'who.int',
  'gdacs.org',
  'esa.int',
  'nist.gov',
  'state.gov',
  'defense.gov',
  // Defense / security niche
  'defenseone.com',
  'warontherocks.com',
  'janes.com',
  // Cyber / tech
  'krebsonsecurity.com',
  'arstechnica.com',
  'therecord.media',
  'bleepingcomputer.com',
  // Tech outlets
  'techcrunch.com',
  'theverge.com',
  'wired.com',
  'technologyreview.com',
  'restofworld.org',
  // Finance / markets
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'cnbc.com',
  'marketwatch.com',
  'coindesk.com',
  // Finance — official / institutional
  'federalreserve.gov',
  'ecb.europa.eu',
  'imf.org',
  'worldbank.org',
  'sec.gov',
  'bls.gov',
]);

/**
 * Runtime-loaded credible domains from the DB `sources` table.
 * Populated by `loadCredibleDomainsFromDB()` during ingest so that any
 * source with credibility >= DYNAMIC_CREDIBILITY_THRESHOLD is treated as
 * credible without needing a code change.
 */
const dynamicCredibleDomains = new Set<string>();
const DYNAMIC_CREDIBILITY_THRESHOLD = 60;

export function registerDynamicCredibleDomains(
  sources: Array<{ credibility: number; metadata: Record<string, unknown> }>,
): void {
  dynamicCredibleDomains.clear();
  for (const s of sources) {
    if (s.credibility >= DYNAMIC_CREDIBILITY_THRESHOLD) {
      const domain = s.metadata?.domain as string | undefined;
      if (domain) dynamicCredibleDomains.add(domain.toLowerCase().replace(/^www\./, ''));
    }
  }
}

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
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  if (dynamicCredibleDomains.has(normalized)) return true;
  for (const trusted of CREDIBLE_DOMAINS) {
    if (isDomainMatch(domain, trusted)) return true;
  }
  return false;
}
