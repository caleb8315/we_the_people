/**
 * Live web-search layer.
 *
 * Strategy: try each configured provider in order until we get at least
 * one hit. Free providers first (cheaper to run), then paid. Providers
 * are additive — when a key is configured they participate; when not,
 * we report `unavailable` for that provider specifically.
 *
 *   1. Firecrawl   (FIRECRAWL_API_KEY) — broad crawl-aware search
 *   2. Brave       (BRAVE_SEARCH_API_KEY) — 2k/mo free tier
 *
 * Any credible-domain gating happens via the existing `isCredibleDomain`
 * check on each hit — we include non-credible hits too so `source_count`
 * honestly reflects the real-world noise, while `credible_source_count`
 * reflects the quality signal.
 */

import { extractDomain, isCredibleDomain, type EvidenceItem } from '@osint/core';
import type { SourceQuery, SourceResult } from './types';

const TIMEOUT_MS = 6_000;
const MAX_RESULTS = 8;

export async function searchWeb(q: SourceQuery): Promise<SourceResult> {
  if (!q.title && !q.text) {
    return { id: 'web', name: 'Web search', status: 'skipped', hits: 0, note: 'No query text.', evidence: [] };
  }
  const query = buildQuery(q);

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!firecrawlKey && !braveKey) {
    return {
      id: 'web',
      name: 'Web search',
      status: 'unavailable',
      hits: 0,
      note: 'No web-search provider configured. Set FIRECRAWL_API_KEY or BRAVE_SEARCH_API_KEY.',
      evidence: [],
    };
  }

  if (firecrawlKey) {
    const fc = await firecrawlSearch(query, q.host, firecrawlKey).catch(() => null);
    if (fc && fc.evidence.length > 0) return fc;
  }
  if (braveKey) {
    const br = await braveSearch(query, q.host, braveKey).catch(() => null);
    if (br && br.evidence.length > 0) return br;
  }

  return {
    id: 'web',
    name: 'Web search',
    status: 'miss',
    hits: 0,
    note: 'Web search returned no relevant results.',
    evidence: [],
  };
}

function buildQuery(q: SourceQuery): string {
  const base = (q.title ?? '').trim();
  if (base) return base.slice(0, 160);
  const text = (q.text ?? '').trim();
  if (text) return text.slice(0, 160);
  return q.keywords.slice(0, 6).join(' ');
}

async function firecrawlSearch(
  query: string,
  excludeHost: string | null,
  apiKey: string,
): Promise<SourceResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit: MAX_RESULTS }),
    signal: ctrl.signal,
  }).catch(() => null);
  clearTimeout(timer);
  if (!res) return error('web', 'Firecrawl request failed (timeout or network).');
  if (!res.ok) return error('web', `Firecrawl returned HTTP ${res.status}.`);

  const body = (await res.json().catch(() => null)) as FirecrawlSearchResponse | null;
  const hits = body?.data ?? [];
  return shapeHits(hits, excludeHost, 'Firecrawl');
}

async function braveSearch(
  query: string,
  excludeHost: string | null,
  apiKey: string,
): Promise<SourceResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(MAX_RESULTS));
  url.searchParams.set('safesearch', 'moderate');
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-subscription-token': apiKey,
    },
    signal: ctrl.signal,
  }).catch(() => null);
  clearTimeout(timer);
  if (!res) return error('web', 'Brave request failed (timeout or network).');
  if (!res.ok) return error('web', `Brave returned HTTP ${res.status}.`);

  const body = (await res.json().catch(() => null)) as BraveSearchResponse | null;
  const hits = body?.web?.results ?? [];
  return shapeHits(
    hits.map((h) => ({
      url: h.url,
      title: h.title,
      description: h.description,
      metadata: { publishedTime: h.age },
    })),
    excludeHost,
    'Brave',
  );
}

function shapeHits(
  hits: NormalizedHit[],
  excludeHost: string | null,
  providerName: string,
): SourceResult {
  const seenDomains = new Set<string>();
  const evidence: EvidenceItem[] = [];
  for (const h of hits) {
    if (!h.url) continue;
    const domain = extractDomain(h.url);
    if (!domain || domain === excludeHost) continue;
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    evidence.push({
      source_id: null,
      url: h.url,
      domain,
      title: h.title ?? h.metadata?.title ?? null,
      published_at: h.metadata?.publishedTime ?? null,
      is_credible: isCredibleDomain(domain),
      excerpt: (h.description ?? h.metadata?.description ?? null)?.slice(0, 240) ?? null,
    });
    if (evidence.length >= MAX_RESULTS) break;
  }

  const credible = evidence.filter((e) => e.is_credible).length;
  return {
    id: 'web',
    name: 'Web search',
    status: evidence.length > 0 ? 'hit' : 'miss',
    hits: evidence.length,
    note:
      evidence.length === 0
        ? `${providerName} returned no relevant results.`
        : `${providerName}: ${evidence.length} outlets (${credible} credible).`,
    evidence,
  };
}

function error(id: 'web', note: string): SourceResult {
  return { id, name: 'Web search', status: 'error', hits: 0, note, evidence: [] };
}

// ─── provider response shapes ──────────────────────────────────────────────

type NormalizedHit = {
  url?: string;
  title?: string;
  description?: string;
  metadata?: {
    title?: string;
    description?: string;
    publishedTime?: string;
  };
};

type FirecrawlSearchResponse = {
  success?: boolean;
  data?: NormalizedHit[];
};

type BraveSearchResponse = {
  web?: {
    results?: Array<{
      url?: string;
      title?: string;
      description?: string;
      age?: string;
    }>;
  };
};
