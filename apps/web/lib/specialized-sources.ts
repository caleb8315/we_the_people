/**
 * Specialized free-source search for Crosscheck Case Files.
 *
 * The live-source layer is broad; this layer is domain-specific. It routes
 * atomic claims to free public evidence systems such as ClaimReview,
 * PubMed, OpenAlex, CourtListener, SEC EDGAR, Crossref, arXiv, CISA, and NVD.
 *
 * Contract:
 *   - Best effort and bounded. Every adapter has a small timeout.
 *   - Evidence only. No adapter emits a verdict or changes scoring directly.
 *   - Free-tier safe. Optional-key sources report `unavailable` when missing.
 */

import {
  extractDomain,
  isCredibleDomain,
  type AtomicClaim,
  type ClaimKind,
  type EvidenceItem,
} from '@osint/core';

export type SpecializedSourceId =
  | 'factcheck'
  | 'pubmed'
  | 'openalex'
  | 'courtlistener'
  | 'sec_edgar'
  | 'crossref'
  | 'arxiv'
  | 'cisa_kev'
  | 'nvd';

export type SpecializedSourceStatus = 'hit' | 'miss' | 'skipped' | 'unavailable' | 'error';

export interface SpecializedSourceResult {
  id: SpecializedSourceId;
  name: string;
  status: SpecializedSourceStatus;
  hits: number;
  note: string;
  evidence: EvidenceItem[];
}

export interface SpecializedCaseSearchResult {
  systems: Array<Omit<SpecializedSourceResult, 'evidence'> & { evidence_count: number }>;
  evidence: EvidenceItem[];
}

const TIMEOUT_MS = 4_500;
const MAX_CLAIMS = 5;
const MAX_EVIDENCE_PER_SOURCE = 4;
const UA = process.env.SEC_USER_AGENT || 'Crosscheck hello@crosscheck.news';

export async function runSpecializedCaseSearch(
  claims: AtomicClaim[],
): Promise<SpecializedCaseSearchResult> {
  const routed = claims
    .filter((c) => c.checkability !== 'not_checkable')
    .slice(0, MAX_CLAIMS);
  if (routed.length === 0) {
    return { systems: [], evidence: [] };
  }

  const jobs = [
    searchFactCheck(routed),
    searchPubMed(routed),
    searchOpenAlex(routed),
    searchCourtListener(routed),
    searchSecEdgar(routed),
    searchCrossref(routed),
    searchArxiv(routed),
    searchCisaKev(routed),
    searchNvd(routed),
  ];

  const results = await Promise.all(jobs.map((p) => p.catch((e) => errorResult('factcheck', String(e)))));
  const evidence = dedupeByUrl(results.flatMap((r) => r.evidence));
  return {
    systems: results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      hits: r.hits,
      note: r.note,
      evidence_count: r.evidence.length,
    })),
    evidence,
  };
}

async function searchFactCheck(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const key = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!key) {
    return unavailable('factcheck', 'Fact Check Explorer', 'Set GOOGLE_FACTCHECK_API_KEY to search ClaimReview fact checks.');
  }
  const claim = pickBestClaim(claims, ['conspiracy', 'medical', 'legal', 'financial', 'scientific', 'event']);
  if (!claim) return skipped('factcheck', 'Fact Check Explorer', 'No checkable claim for fact-check search.');
  const url = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
  url.searchParams.set('query', claim.text.slice(0, 240));
  url.searchParams.set('pageSize', '5');
  url.searchParams.set('key', key);
  const body = await getJson<GoogleFactCheckResponse>(url.toString(), 'factcheck');
  if (!body) return errorResult('factcheck', 'Fact Check Explorer request failed.');
  const evidence: EvidenceItem[] = [];
  for (const c of body.claims ?? []) {
    for (const review of c.claimReview ?? []) {
      if (!review.url) continue;
      const domain = extractDomain(review.url);
      evidence.push({
        source_id: 'factcheck',
        url: review.url,
        domain,
        title: review.title ?? c.text ?? 'Fact-check review',
        published_at: review.reviewDate ?? c.claimDate ?? null,
        is_credible: true,
        excerpt: [
          review.publisher?.name ? `Publisher: ${review.publisher.name}` : null,
          review.textualRating ? `Rating: ${review.textualRating}` : null,
          c.claimant ? `Claimant: ${c.claimant}` : null,
        ].filter(Boolean).join(' · ') || null,
      });
      if (evidence.length >= MAX_EVIDENCE_PER_SOURCE) break;
    }
    if (evidence.length >= MAX_EVIDENCE_PER_SOURCE) break;
  }
  return result('factcheck', 'Fact Check Explorer', evidence, 'ClaimReview fact-check database.');
}

async function searchPubMed(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const claim = pickBestClaim(claims, ['medical', 'scientific']);
  if (!claim) return skipped('pubmed', 'PubMed', 'No medical/scientific claim detected.');
  const key = process.env.NCBI_API_KEY;
  const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', claim.text.slice(0, 220));
  searchUrl.searchParams.set('retmax', '4');
  searchUrl.searchParams.set('retmode', 'json');
  if (key) searchUrl.searchParams.set('api_key', key);
  const search = await getJson<PubMedSearchResponse>(searchUrl.toString(), 'pubmed');
  const ids = search?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return result('pubmed', 'PubMed', [], 'No PubMed matches.');

  const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', ids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');
  if (key) summaryUrl.searchParams.set('api_key', key);
  const summary = await getJson<PubMedSummaryResponse>(summaryUrl.toString(), 'pubmed');
  const evidence = ids.slice(0, MAX_EVIDENCE_PER_SOURCE).map((id) => {
    const row = summary?.result?.[id];
    return {
      source_id: 'pubmed',
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      domain: 'pubmed.ncbi.nlm.nih.gov',
      title: row?.title ?? `PubMed record ${id}`,
      published_at: row?.pubdate ? normalizeYearDate(row.pubdate) : null,
      is_credible: true,
      excerpt: row?.source ? `Journal/source: ${row.source}` : 'Biomedical literature index.',
    };
  });
  return result('pubmed', 'PubMed', evidence, 'Biomedical literature index.');
}

async function searchOpenAlex(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const key = process.env.OPENALEX_API_KEY;
  if (!key) return unavailable('openalex', 'OpenAlex', 'Set OPENALEX_API_KEY for scholarly search.');
  const claim = pickBestClaim(claims, ['scientific', 'medical']);
  if (!claim) return skipped('openalex', 'OpenAlex', 'No scholarly claim detected.');
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', claim.text.slice(0, 220));
  url.searchParams.set('per_page', '4');
  url.searchParams.set('select', 'id,display_name,publication_year,doi,cited_by_count,primary_location');
  url.searchParams.set('api_key', key);
  const body = await getJson<OpenAlexResponse>(url.toString(), 'openalex');
  if (!body) return errorResult('openalex', 'OpenAlex request failed.');
  const evidence = (body.results ?? []).slice(0, MAX_EVIDENCE_PER_SOURCE).map((w) => {
    const landing = w.doi ? `https://doi.org/${w.doi.replace(/^https?:\/\/doi.org\//, '')}` : w.id;
    return {
      source_id: 'openalex',
      url: landing,
      domain: extractDomain(landing) || 'openalex.org',
      title: w.display_name ?? 'OpenAlex scholarly work',
      published_at: w.publication_year ? `${w.publication_year}-01-01T00:00:00Z` : null,
      is_credible: true,
      excerpt: `Scholarly index · citations: ${w.cited_by_count ?? 0}`,
    };
  });
  return result('openalex', 'OpenAlex', evidence, 'Scholarly works index.');
}

async function searchCourtListener(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const claim = pickBestClaim(claims, ['legal']);
  if (!claim) return skipped('courtlistener', 'CourtListener', 'No legal/court claim detected.');
  const url = new URL('https://www.courtlistener.com/api/rest/v4/search/');
  url.searchParams.set('q', claim.text.slice(0, 220));
  url.searchParams.set('type', 'o');
  url.searchParams.set('order_by', 'score desc');
  const headers = optionalAuthHeaders(process.env.COURTLISTENER_API_TOKEN);
  const body = await getJson<CourtListenerResponse>(url.toString(), 'courtlistener', headers);
  if (!body) return errorResult('courtlistener', 'CourtListener request failed.');
  const evidence = (body.results ?? []).slice(0, MAX_EVIDENCE_PER_SOURCE).map((r) => {
    const href = r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : r.cluster_url || 'https://www.courtlistener.com/';
    return {
      source_id: 'courtlistener',
      url: href,
      domain: 'courtlistener.com',
      title: r.caseName ?? r.caseNameFull ?? 'CourtListener legal result',
      published_at: r.dateFiled ? `${r.dateFiled}T00:00:00Z` : null,
      is_credible: true,
      excerpt: [r.court, r.docketNumber ? `Docket ${r.docketNumber}` : null].filter(Boolean).join(' · ') || 'Legal opinion / docket search result.',
    };
  });
  return result('courtlistener', 'CourtListener', evidence, 'Free Law Project legal search.');
}

async function searchSecEdgar(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const claim = pickBestClaim(claims, ['financial']);
  if (!claim) return skipped('sec_edgar', 'SEC EDGAR', 'No finance/company claim detected.');
  const url = new URL('https://efts.sec.gov/LATEST/search-index');
  url.searchParams.set('q', claim.text.slice(0, 180));
  url.searchParams.set('dateRange', 'all');
  const body = await getJson<SecSearchResponse>(url.toString(), 'sec_edgar', {
    'user-agent': UA,
    accept: 'application/json',
  });
  if (!body) return errorResult('sec_edgar', 'SEC EDGAR request failed.');
  const hits = body.hits?.hits ?? [];
  const evidence = hits.slice(0, MAX_EVIDENCE_PER_SOURCE).map((hit) => {
    const source = hit._source ?? {};
    const accession = source.adsh ?? source.accessionNo;
    const cik = source.ciks?.[0] ?? source.cik;
    const doc = source.file_name ?? source.fileName ?? '';
    const href = cik && accession && doc
      ? `https://www.sec.gov/Archives/edgar/data/${String(cik).replace(/^0+/, '')}/${String(accession).replace(/-/g, '')}/${doc}`
      : 'https://www.sec.gov/edgar/search/';
    return {
      source_id: 'sec_edgar',
      url: href,
      domain: 'sec.gov',
      title: source.display_names?.[0] ?? source.companyName ?? source.form ?? 'SEC filing search result',
      published_at: source.filedAt ?? (source.file_date ? `${source.file_date}T00:00:00Z` : null),
      is_credible: true,
      excerpt: [source.form ? `Form ${source.form}` : null, accession ? `Accession ${accession}` : null].filter(Boolean).join(' · ') || 'SEC EDGAR filing result.',
    };
  });
  return result('sec_edgar', 'SEC EDGAR', evidence, 'Official public-company filings.');
}

async function searchCrossref(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const claim = pickBestClaim(claims, ['scientific', 'medical']);
  if (!claim) return skipped('crossref', 'Crossref', 'No scholarly claim detected.');
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query.bibliographic', claim.text.slice(0, 220));
  url.searchParams.set('rows', '4');
  const mailto = process.env.CROSSREF_MAILTO;
  if (mailto) url.searchParams.set('mailto', mailto);
  const body = await getJson<CrossrefResponse>(url.toString(), 'crossref');
  if (!body) return errorResult('crossref', 'Crossref request failed.');
  const evidence = (body.message?.items ?? []).slice(0, MAX_EVIDENCE_PER_SOURCE).map((item) => {
    const doi = item.DOI;
    const href = doi ? `https://doi.org/${doi}` : item.URL ?? 'https://www.crossref.org/';
    const year = item.issued?.['date-parts']?.[0]?.[0];
    return {
      source_id: 'crossref',
      url: href,
      domain: extractDomain(href) || 'crossref.org',
      title: item.title?.[0] ?? 'Crossref scholarly record',
      published_at: year ? `${year}-01-01T00:00:00Z` : null,
      is_credible: true,
      excerpt: item['container-title']?.[0] ? `Published in ${item['container-title'][0]}` : 'Scholarly DOI metadata.',
    };
  });
  return result('crossref', 'Crossref', evidence, 'Scholarly DOI metadata.');
}

async function searchArxiv(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const claim = pickBestClaim(claims, ['scientific']);
  if (!claim) return skipped('arxiv', 'arXiv', 'No science/research claim detected.');
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', `all:${claim.text.slice(0, 140)}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', '4');
  const xml = await getText(url.toString(), 'arxiv');
  if (!xml) return errorResult('arxiv', 'arXiv request failed.');
  const evidence = parseArxivEntries(xml).slice(0, MAX_EVIDENCE_PER_SOURCE).map((e) => ({
    source_id: 'arxiv',
    url: e.url,
    domain: 'arxiv.org',
    title: e.title,
    published_at: e.published,
    is_credible: true,
    excerpt: e.summary ? e.summary.slice(0, 240) : 'Preprint record.',
  }));
  return result('arxiv', 'arXiv', evidence, 'Open research preprints.');
}

async function searchCisaKev(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  if (!claims.some((c) => isCyberClaim(c))) return skipped('cisa_kev', 'CISA KEV', 'No cyber vulnerability claim detected.');
  const body = await getJson<CisaKevResponse>('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 'cisa_kev');
  if (!body) return errorResult('cisa_kev', 'CISA KEV request failed.');
  const query = claims.map((c) => c.text).join(' ').toLowerCase();
  const vulns = (body.vulnerabilities ?? []).filter((v) =>
    [v.cveID, v.vendorProject, v.product, v.vulnerabilityName].some((x) => x && query.includes(String(x).toLowerCase())),
  );
  const evidence = vulns.slice(0, MAX_EVIDENCE_PER_SOURCE).map((v) => ({
    source_id: 'cisa_kev',
    url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search=${encodeURIComponent(v.cveID)}`,
    domain: 'cisa.gov',
    title: `${v.cveID}: ${v.vulnerabilityName}`,
    published_at: v.dateAdded ? `${v.dateAdded}T00:00:00Z` : null,
    is_credible: true,
    excerpt: [v.vendorProject, v.product, v.knownRansomwareCampaignUse ? `Ransomware use: ${v.knownRansomwareCampaignUse}` : null].filter(Boolean).join(' · '),
  }));
  return result('cisa_kev', 'CISA KEV', evidence, 'Known exploited vulnerabilities catalog.');
}

async function searchNvd(claims: AtomicClaim[]): Promise<SpecializedSourceResult> {
  const cve = claims.map((c) => c.text).join(' ').match(/\bCVE-\d{4}-\d{4,}\b/i)?.[0]?.toUpperCase();
  if (!cve) return skipped('nvd', 'NVD', 'No CVE identifier detected.');
  const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
  url.searchParams.set('cveId', cve);
  const body = await getJson<NvdResponse>(url.toString(), 'nvd');
  if (!body) return errorResult('nvd', 'NVD request failed.');
  const evidence = (body.vulnerabilities ?? []).slice(0, MAX_EVIDENCE_PER_SOURCE).map((item) => {
    const c = item.cve;
    return {
      source_id: 'nvd',
      url: `https://nvd.nist.gov/vuln/detail/${c.id}`,
      domain: 'nist.gov',
      title: c.id,
      published_at: c.published ?? null,
      is_credible: true,
      excerpt: c.descriptions?.find((d) => d.lang === 'en')?.value?.slice(0, 240) ?? 'NVD vulnerability record.',
    };
  });
  return result('nvd', 'NVD', evidence, 'National Vulnerability Database.');
}

function pickBestClaim(claims: AtomicClaim[], kinds: ClaimKind[]): AtomicClaim | null {
  return claims.find((c) => kinds.includes(c.kind)) ?? null;
}

function isCyberClaim(claim: AtomicClaim): boolean {
  return /\b(cve-\d{4}-\d{4,}|vulnerab|exploit|malware|ransomware|breach|zero[- ]day|cisa|nvd)\b/i.test(claim.text);
}

function result(id: SpecializedSourceId, name: string, evidence: EvidenceItem[], sourceLabel: string): SpecializedSourceResult {
  const credible = evidence.filter((e) => e.is_credible).length;
  return {
    id,
    name,
    status: evidence.length > 0 ? 'hit' : 'miss',
    hits: evidence.length,
    note:
      evidence.length > 0
        ? `${sourceLabel}: ${evidence.length} result${evidence.length === 1 ? '' : 's'} (${credible} primary/credible).`
        : `${sourceLabel}: no matching records.`,
    evidence,
  };
}

function skipped(id: SpecializedSourceId, name: string, note: string): SpecializedSourceResult {
  return { id, name, status: 'skipped', hits: 0, note, evidence: [] };
}

function unavailable(id: SpecializedSourceId, name: string, note: string): SpecializedSourceResult {
  return { id, name, status: 'unavailable', hits: 0, note, evidence: [] };
}

function errorResult(id: SpecializedSourceId, note: string): SpecializedSourceResult {
  return { id, name: SOURCE_NAMES[id], status: 'error', hits: 0, note, evidence: [] };
}

const SOURCE_NAMES: Record<SpecializedSourceId, string> = {
  factcheck: 'Fact Check Explorer',
  pubmed: 'PubMed',
  openalex: 'OpenAlex',
  courtlistener: 'CourtListener',
  sec_edgar: 'SEC EDGAR',
  crossref: 'Crossref',
  arxiv: 'arXiv',
  cisa_kev: 'CISA KEV',
  nvd: 'NVD',
};

async function getJson<T>(url: string, source: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': UA,
        ...headers,
      },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    void source;
    return null;
  }
}

async function getText(url: string, source: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/atom+xml,text/xml', 'user-agent': UA },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return null;
    return await res.text();
  } catch {
    void source;
    return null;
  }
}

function optionalAuthHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Token ${token}` } : {};
}

function dedupeByUrl(items: EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const item of items) {
    const key = item.url.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...item,
      is_credible: item.is_credible || isCredibleDomain(item.domain),
    });
  }
  return out;
}

function normalizeYearDate(input: string): string | null {
  const year = input.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `${year}-01-01T00:00:00Z` : null;
}

function parseArxivEntries(xml: string): Array<{ title: string; url: string; published: string | null; summary: string | null }> {
  const entries = xml.split(/<entry>/g).slice(1);
  return entries.map((entry) => {
    const title = stripXml(pickXml(entry, 'title')) || 'arXiv preprint';
    const id = stripXml(pickXml(entry, 'id')) || 'https://arxiv.org/';
    const published = stripXml(pickXml(entry, 'published')) || null;
    const summary = stripXml(pickXml(entry, 'summary')) || null;
    return { title, url: id, published, summary };
  });
}

function pickXml(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m?.[1] ?? null;
}

function stripXml(input: string | null): string | null {
  if (!input) return null;
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface GoogleFactCheckResponse {
  claims?: Array<{
    text?: string;
    claimant?: string;
    claimDate?: string;
    claimReview?: Array<{
      url?: string;
      title?: string;
      reviewDate?: string;
      textualRating?: string;
      publisher?: { name?: string; site?: string };
    }>;
  }>;
}

interface PubMedSearchResponse {
  esearchresult?: { idlist?: string[] };
}

interface PubMedSummaryResponse {
  result?: Record<string, { title?: string; pubdate?: string; source?: string }>;
}

interface OpenAlexResponse {
  results?: Array<{
    id: string;
    display_name?: string;
    publication_year?: number;
    doi?: string;
    cited_by_count?: number;
  }>;
}

interface CourtListenerResponse {
  results?: Array<{
    caseName?: string;
    caseNameFull?: string;
    absolute_url?: string;
    cluster_url?: string;
    dateFiled?: string;
    court?: string;
    docketNumber?: string;
  }>;
}

interface SecSearchResponse {
  hits?: {
    hits?: Array<{
      _source?: {
        adsh?: string;
        accessionNo?: string;
        ciks?: string[];
        cik?: string;
        file_name?: string;
        fileName?: string;
        display_names?: string[];
        companyName?: string;
        form?: string;
        filedAt?: string;
        file_date?: string;
      };
    }>;
  };
}

interface CrossrefResponse {
  message?: {
    items?: Array<{
      DOI?: string;
      URL?: string;
      title?: string[];
      'container-title'?: string[];
      issued?: { 'date-parts'?: number[][] };
    }>;
  };
}

interface CisaKevResponse {
  vulnerabilities?: Array<{
    cveID: string;
    vendorProject?: string;
    product?: string;
    vulnerabilityName: string;
    dateAdded?: string;
    knownRansomwareCampaignUse?: string;
  }>;
}

interface NvdResponse {
  vulnerabilities?: Array<{
    cve: {
      id: string;
      published?: string;
      descriptions?: Array<{ lang: string; value: string }>;
    };
  }>;
}
