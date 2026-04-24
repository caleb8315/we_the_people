/**
 * Verify-route preprocessing + thin wrapper over the live-sources layer.
 *
 * Phase 7: the heavy lifting now lives in `lib/live-sources/*`. This file
 * stays around for two concerns that belong at the verify-route boundary,
 * NOT inside any individual source:
 *
 *   1. Fetching `<title>` / `og:title` off the submitted URL so we have
 *      something meaningful to search on (a bare URL rarely shares enough
 *      tokens with clustered signals or web results).
 *   2. Tokenizing that title + the user's pasted text into search keywords.
 *
 * Non-negotiable rules still hold:
 *   - No source is allowed to claim "verified".
 *   - All upstream calls are bounded + non-throwing — this wrapper does
 *     NOT add try/catches around the orchestrator call because each
 *     source inside it already degrades gracefully on its own.
 */

export { runLiveCorroboration } from './live-sources';
export type { LiveCorroborationResult, MatchedSignal } from './live-sources';

export interface PageMetadata {
  title: string | null;
  description: string | null;
}

/**
 * Fetch the title/description of an HTML page.
 *
 * Best-effort: 4-second timeout, only reads the first 60 KB of the
 * response, never throws. Returns nulls on any failure so the caller can
 * decide whether to fall back to the raw URL or keyword search instead.
 */
export async function fetchPageMetadata(
  url: string,
  timeoutMs = 4_000,
): Promise<PageMetadata> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Crosscheck-Verify/1.0 (+https://crosscheck.app)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return { title: null, description: null };
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('html')) {
      return { title: null, description: null };
    }
    const raw = await res.text();
    return parseHtmlMetadata(raw);
  } catch {
    return { title: null, description: null };
  }
}

function parseHtmlMetadata(html: string): PageMetadata {
  const head = html.slice(0, 60_000);
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitle = head.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  const twTitle = head.match(
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
  );
  const ogDesc = head.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );
  const metaDesc = head.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const clean = (s: string | null | undefined): string | null => {
    if (!s) return null;
    const decoded = s
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return decoded || null;
  };
  return {
    title: clean(ogTitle?.[1] ?? twTitle?.[1] ?? titleTag?.[1]),
    description: clean(ogDesc?.[1] ?? metaDesc?.[1]),
  };
}

/**
 * Extract content-bearing keywords from a title/body. Deliberately simple
 * and stopword-filtered so DB `ilike` searches and external search queries
 * stay cheap and predictable.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const stop = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at',
    'for', 'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'that', 'this', 'these', 'those', 'it', 'its', 'into',
    'over', 'new', 'news', 'live', 'latest', 'breaking', 'update', 'updates',
    'says', 'said', 'amid', 'per', 'about', 'against', 'across', 'world',
    'today', 'just', 'more', 'will', 'would', 'could', 'should', 'may',
    'might', 'can', 'has', 'have', 'had', 'not', 'one', 'two', 'us', 'uk',
    'story', 'video', 'photo', 'opinion', 'analysis', 'cnn', 'bbc', 'reuters',
    'after', 'before', 'still', 'back', 'here', 'there', 'what', 'when',
    'where', 'which', 'while', 'show', 'shows', 'shown', 'many', 'much',
    'like', 'also', 'been', 'than', 'them', 'then', 'they', 'does', 'done',
    'gets', 'going', 'gone', 'good', 'know', 'look', 'make', 'made',
    'need', 'part', 'take', 'tell', 'told', 'very', 'want', 'well',
    'come', 'came', 'some', 'such', 'time', 'year', 'years', 'first',
    'last', 'long', 'great', 'high', 'people', 'state', 'says', 'report',
    'reports', 'reported', 'according', 'official', 'officials',
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w) && !/^\d+$/.test(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of tokens) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 12) break;
  }
  return out;
}
