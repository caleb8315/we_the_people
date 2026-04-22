/**
 * Reference-corroboration sources.
 *
 *   - Wikipedia REST summary — gives us a neutral context anchor for
 *     entities named in the claim. Useful as a "does this even exist as
 *     a real, documented event/entity" check. Never claims truth.
 *
 *   - GDELT DOC 2.0 Article List — a free, key-less global news archive
 *     indexed every 15 minutes. When Firecrawl/Brave aren't configured
 *     this is still a reasonable broad-web signal because GDELT covers
 *     ~every publicly reachable news outlet on Earth.
 */

import { extractDomain, isCredibleDomain, type EvidenceItem } from '@osint/core';
import type { SourceQuery, SourceResult, SourceSearcher } from './types';

const UA = 'Crosscheck-Verify/1.0 (+https://crosscheck.app)';
// Wikipedia is fast. GDELT's free DOC 2.0 API is notoriously slow — p95 is
// 20-30s. We honour that rather than mis-report legitimate latency as
// error. Users see progressive "still searching…" messages while this
// runs; the global verify budget (see live-sources/index.ts) accommodates
// the full GDELT window.
const WIKI_TIMEOUT_MS = 4_000;
const GDELT_TIMEOUT_MS = 30_000;

export const searchWikipedia: SourceSearcher = async (q) => {
  const query = (q.title ?? q.keywords.slice(0, 4).join(' ')).trim();
  if (!query) {
    return {
      id: 'wikipedia',
      name: 'Wikipedia',
      status: 'skipped',
      hits: 0,
      note: 'No query text.',
      evidence: [],
    };
  }

  try {
    // opensearch returns [query, titles[], descriptions[], urls[]]. We
    // take the top title as the "anchor" and fetch its summary for context.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WIKI_TIMEOUT_MS);
    const u = new URL('https://en.wikipedia.org/w/api.php');
    u.searchParams.set('action', 'opensearch');
    u.searchParams.set('search', query.slice(0, 200));
    u.searchParams.set('limit', '3');
    u.searchParams.set('namespace', '0');
    u.searchParams.set('format', 'json');
    u.searchParams.set('origin', '*');
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return err('wikipedia', 'Wikipedia', 'Wikipedia query failed.');

    const body = (await res.json().catch(() => null)) as WikipediaOpensearchResponse | null;
    if (!body || !Array.isArray(body) || body.length < 4) {
      return {
        id: 'wikipedia',
        name: 'Wikipedia',
        status: 'miss',
        hits: 0,
        note: 'No matching Wikipedia article.',
        evidence: [],
      };
    }
    const titles = body[1] ?? [];
    const descriptions = body[2] ?? [];
    const urls = body[3] ?? [];
    const evidence: EvidenceItem[] = [];
    for (let i = 0; i < Math.min(titles.length, 2); i += 1) {
      const title = titles[i];
      const url = urls[i];
      if (!title || !url) continue;
      evidence.push({
        source_id: 'wikipedia',
        url,
        domain: 'wikipedia.org',
        title,
        published_at: null,
        is_credible: false,
        excerpt: (descriptions[i] ?? null)?.slice(0, 240) ?? null,
      });
    }
    return {
      id: 'wikipedia',
      name: 'Wikipedia',
      status: evidence.length > 0 ? 'hit' : 'miss',
      hits: evidence.length,
      note:
        evidence.length === 0
          ? 'No matching Wikipedia article.'
          : `Context anchor: ${evidence[0]!.title}.`,
      evidence,
    };
  } catch {
    return err('wikipedia', 'Wikipedia', 'Wikipedia query failed.');
  }
};

export const searchGdelt: SourceSearcher = async (q) => {
  const query = (q.title ?? q.keywords.slice(0, 6).join(' ')).trim();
  if (!query) {
    return {
      id: 'gdelt',
      name: 'GDELT global news',
      status: 'skipped',
      hits: 0,
      note: 'No query text.',
      evidence: [],
    };
  }

  let aborted = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      aborted = true;
      ctrl.abort();
    }, GDELT_TIMEOUT_MS);
    const u = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    u.searchParams.set('query', query.slice(0, 200));
    u.searchParams.set('mode', 'ArtList');
    u.searchParams.set('format', 'json');
    u.searchParams.set('maxrecords', '15');
    u.searchParams.set('sort', 'hybridrel');
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res) {
      // Distinguish "we gave up waiting" from a real upstream failure. GDELT
      // being slow is the norm, not an error — the UI should say so.
      return {
        id: 'gdelt',
        name: 'GDELT global news',
        status: aborted ? 'skipped' : 'error',
        hits: 0,
        note: aborted
          ? `GDELT didn\u2019t respond within ${GDELT_TIMEOUT_MS / 1000}s. Their free tier can be slow during peak hours — try again later for global news coverage.`
          : 'GDELT request failed before we got any response.',
        evidence: [],
      };
    }
    if (!res.ok) {
      // GDELT's free tier is known to 5xx and 429 during peak hours. That's
      // "temporarily unavailable", not "we're broken" — report it as such so
      // users don't think Crosscheck is the problem. Rate-limit/5xx are also
      // the common "upstream error" the user has been seeing.
      const transient = res.status === 429 || res.status >= 500;
      if (transient) {
        return {
          id: 'gdelt',
          name: 'GDELT global news',
          status: 'unavailable',
          hits: 0,
          note: `GDELT's free tier returned HTTP ${res.status} (rate-limited or overloaded). This happens most days during peak hours; try again in a few minutes for global news coverage.`,
          evidence: [],
        };
      }
      return err('gdelt', 'GDELT global news', `GDELT returned HTTP ${res.status}.`);
    }
    const body = (await res.json().catch(() => null)) as GdeltArticleResponse | null;
    const articles = body?.articles ?? [];
    const evidence: EvidenceItem[] = [];
    const seenDomains = new Set<string>();
    if (q.host) seenDomains.add(q.host);
    for (const a of articles) {
      if (!a.url) continue;
      const domain = (a.domain ?? extractDomain(a.url)).toLowerCase();
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      evidence.push({
        source_id: 'gdelt',
        url: a.url,
        domain,
        title: a.title ?? null,
        published_at: parseGdeltDate(a.seendate),
        is_credible: isCredibleDomain(domain),
        excerpt: a.sourcecountry ? `Source country: ${a.sourcecountry}.` : null,
      });
      if (evidence.length >= 8) break;
    }
    const credible = evidence.filter((e) => e.is_credible).length;
    return {
      id: 'gdelt',
      name: 'GDELT global news',
      status: evidence.length > 0 ? 'hit' : 'miss',
      hits: evidence.length,
      note:
        evidence.length === 0
          ? 'No matching articles in the GDELT global news archive.'
          : `${evidence.length} outlets in GDELT (${credible} credible).`,
      evidence,
    };
  } catch {
    return err('gdelt', 'GDELT global news', 'GDELT query failed.');
  }
};

function parseGdeltDate(s: string | undefined): string | null {
  if (!s) return null;
  // GDELT seendate format: YYYYMMDDTHHMMSSZ
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

function err(
  id: 'wikipedia' | 'gdelt',
  name: string,
  note: string,
): SourceResult {
  return { id, name, status: 'error', hits: 0, note, evidence: [] };
}

// ─── upstream response shapes ──────────────────────────────────────────────

type WikipediaOpensearchResponse = [string, string[], string[], string[]];

type GdeltArticleResponse = {
  articles?: Array<{
    url?: string;
    title?: string;
    seendate?: string;
    socialimage?: string;
    domain?: string;
    language?: string;
    sourcecountry?: string;
  }>;
};
