import { tool } from 'ai';
import { z } from 'zod';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { fetchJson, httpFetch, truncate } from '../http';
import { recordStat, sourceBrief, type ToolContext } from './context';
import { decodeGoogleNewsUrl } from './news';

const MAX_STORED_TEXT = 80_000;
const MAX_RETURNED_TEXT = 7_000;

export interface ReadResult {
  url: string;
  title: string | null;
  byline: string | null;
  siteName: string | null;
  publishedTime: string | null;
  lang: string | null;
  text: string;
}

function charsetOf(contentType: string, head: string): string {
  const fromHeader = contentType.match(/charset=([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  return (fromMeta ?? 'utf-8').toLowerCase();
}

export function extractArticle(html: string, url: string): ReadResult | null {
  try {
    const { document } = parseHTML(html);
    const lang = document.documentElement?.getAttribute('lang') ?? null;
    const metaPublished =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ??
      document.querySelector('meta[name="date"]')?.getAttribute('content') ??
      document.querySelector('time[datetime]')?.getAttribute('datetime') ??
      null;
    const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    const text = (article?.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    if (!text) return null;
    return {
      url,
      title: article?.title?.trim() || null,
      byline: article?.byline?.trim() || null,
      siteName: article?.siteName?.trim() || null,
      publishedTime: article?.publishedTime ?? metaPublished,
      lang: (article?.lang ?? lang)?.slice(0, 2).toLowerCase() || null,
      text,
    };
  } catch {
    return null;
  }
}

export async function readUrl(url: string, env: Record<string, string | undefined>, signal?: AbortSignal): Promise<ReadResult | null> {
  let target = url;
  if (/news\.google\.com\/(rss\/)?articles\//.test(url)) {
    target = (await decodeGoogleNewsUrl(url, signal)) ?? url;
  }

  const res = await httpFetch(target, {
    timeoutMs: 15_000,
    signal,
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'accept-language': 'en;q=0.8,*;q=0.5',
    },
  });
  if (res?.ok && (res.headers.get('content-type') ?? '').includes('html')) {
    const buf = await res.arrayBuffer().catch(() => null);
    if (buf && buf.byteLength < 4_000_000) {
      const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
      let html: string;
      try {
        html = new TextDecoder(charsetOf(res.headers.get('content-type') ?? '', head)).decode(buf);
      } catch {
        html = new TextDecoder('utf-8').decode(buf);
      }
      const parsed = extractArticle(html, res.url || target);
      if (parsed && parsed.text.length >= 400) return parsed;
    }
  }

  const firecrawlKey = env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    const body = await fetchJson<{ data?: { markdown?: string; metadata?: Record<string, string> } }>(
      'https://api.firecrawl.dev/v1/scrape',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${firecrawlKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: target, formats: ['markdown'], onlyMainContent: true }),
        timeoutMs: 30_000,
        signal,
      },
    );
    const md = body?.data?.markdown?.trim();
    if (md && md.length > 200) {
      const meta = body?.data?.metadata ?? {};
      return {
        url: meta.sourceURL ?? target,
        title: meta.title ?? null,
        byline: null,
        siteName: meta.ogSiteName ?? null,
        publishedTime: meta.publishedTime ?? meta['article:published_time'] ?? null,
        lang: meta.language?.slice(0, 2) ?? null,
        text: md,
      };
    }
  }
  return null;
}

/** Pick the passages most relevant to the focus terms, keeping document order. */
export function focusPassages(text: string, focus: string | undefined, budget: number): string {
  if (!focus || text.length <= budget) return text.slice(0, budget);
  const terms = focus
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => [...t].length >= 3);
  const paragraphs = text.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  const scored = paragraphs.map((p, i) => {
    const lower = p.toLowerCase();
    const score = terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    return { p, i, score };
  });
  const lead = scored.slice(0, 3);
  const best = scored
    .slice(3)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const chosen = new Map<number, string>();
  let used = 0;
  for (const s of [...lead, ...best]) {
    if (used + s.p.length > budget) continue;
    chosen.set(s.i, s.p);
    used += s.p.length;
  }
  return [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p)
    .join('\n\n');
}

export function webTools(ctx: ToolContext) {
  return {
    read_url: tool({
      description:
        'Read the full text of an article or page. ALWAYS read the key sources before relying on them — search snippets are not evidence. Returns the article text; quote it verbatim in citations. Pass the ledger id if you have one.',
      inputSchema: z.object({
        url: z.string().url().optional(),
        source_id: z.string().optional().describe('Ledger id such as "S4" instead of a URL'),
        focus: z.string().optional().describe('Keywords to prioritise when the article is long'),
      }),
      execute: async ({ url, source_id, focus }) => {
        const known = source_id ? ctx.ledger.get(source_id) : url ? ctx.ledger.findByUrl(url) : undefined;
        const target = known?.url ?? url;
        if (!target) return { error: 'Provide a url or a known source_id.' };
        const article = await readUrl(target, ctx.env, ctx.signal);
        if (!article) {
          recordStat(ctx, 'read_url', 0);
          return {
            error: 'Could not extract readable text (paywall, blocking, or non-article page). Find another outlet covering the same point.',
            source_id: known?.id,
          };
        }
        const entry = ctx.ledger.add({
          url: known?.url ?? article.url,
          title: article.title ?? known?.title ?? null,
          outlet: article.siteName ?? known?.outlet ?? null,
          published_at: article.publishedTime ?? known?.published_at ?? null,
          language: article.lang ?? known?.language ?? null,
          snippet: truncate(article.text, 300),
          text: article.text.slice(0, MAX_STORED_TEXT),
          retrieved_via: known?.retrieved_via ?? 'Direct read',
        });
        if (entry.language) ctx.languages.add(entry.language);
        recordStat(ctx, 'read_url', 1);
        return {
          ...sourceBrief(entry),
          snippet: undefined,
          byline: article.byline,
          final_url: article.url,
          text: focusPassages(article.text, focus, MAX_RETURNED_TEXT),
          truncated: article.text.length > MAX_RETURNED_TEXT,
        };
      },
    }),

    web_search: tool({
      description:
        'General web search (any site: official statements, documents, NGO reports, social posts, archives). Supports country/language targeting. Use site: operators to search a specific outlet or fact-checker.',
      inputSchema: z.object({
        query: z.string().min(2),
        country: z.string().length(2).optional(),
        language: z.string().length(2).optional(),
      }),
      execute: async ({ query, country, language }) => {
        const hits = await webSearch(query, { country, language }, ctx);
        if (!hits) {
          recordStat(ctx, 'web_search', 0);
          return {
            unavailable: true,
            note: 'No web search provider key configured. Use google_news_search and gdelt_search instead.',
          };
        }
        const results = hits.map((h) =>
          sourceBrief(
            ctx.ledger.add({
              url: h.url,
              title: h.title,
              snippet: h.snippet,
              published_at: h.date,
              language: language ?? null,
              retrieved_via: `Web search (${h.provider})`,
            }),
          ),
        );
        if (language) ctx.languages.add(language);
        recordStat(ctx, 'web_search', results.length);
        return { results };
      },
    }),
  };
}

interface WebHit {
  url: string;
  title: string | null;
  snippet: string | null;
  date: string | null;
  provider: string;
}

async function webSearch(
  query: string,
  opts: { country?: string; language?: string },
  ctx: ToolContext,
): Promise<WebHit[] | null> {
  const { env, signal } = ctx;
  if (env.BRAVE_SEARCH_API_KEY) {
    const u = new URL('https://api.search.brave.com/res/v1/web/search');
    u.searchParams.set('q', query);
    u.searchParams.set('count', '10');
    if (opts.country) u.searchParams.set('country', opts.country.toLowerCase());
    if (opts.language) u.searchParams.set('search_lang', opts.language.toLowerCase());
    const body = await fetchJson<{ web?: { results?: Array<{ url?: string; title?: string; description?: string; page_age?: string }> } }>(
      u.toString(),
      { headers: { 'x-subscription-token': env.BRAVE_SEARCH_API_KEY }, timeoutMs: 10_000, signal },
    );
    const hits = (body?.web?.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url!,
        title: r.title ?? null,
        snippet: r.description ? stripHtml(r.description) : null,
        date: r.page_age ?? null,
        provider: 'Brave',
      }));
    if (hits.length) return hits;
  }
  if (env.EXA_API_KEY) {
    const body = await fetchJson<{ results?: Array<{ url?: string; title?: string; publishedDate?: string; highlights?: string[] }> }>(
      'https://api.exa.ai/search',
      {
        method: 'POST',
        headers: { 'x-api-key': env.EXA_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ query, numResults: 10, contents: { highlights: true } }),
        timeoutMs: 15_000,
        signal,
      },
    );
    const hits = (body?.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url!,
        title: r.title ?? null,
        snippet: r.highlights?.join(' … ') ?? null,
        date: r.publishedDate ?? null,
        provider: 'Exa',
      }));
    if (hits.length) return hits;
  }
  if (env.FIRECRAWL_API_KEY) {
    const body = await fetchJson<{ data?: Array<{ url?: string; title?: string; description?: string }> }>(
      'https://api.firecrawl.dev/v1/search',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query, limit: 10, ...(opts.language ? { lang: opts.language } : {}), ...(opts.country ? { country: opts.country.toLowerCase() } : {}) }),
        timeoutMs: 15_000,
        signal,
      },
    );
    const hits = (body?.data ?? [])
      .filter((r) => r.url)
      .map((r) => ({ url: r.url!, title: r.title ?? null, snippet: r.description ?? null, date: null, provider: 'Firecrawl' }));
    if (hits.length) return hits;
  }
  if (!env.BRAVE_SEARCH_API_KEY && !env.EXA_API_KEY && !env.FIRECRAWL_API_KEY) return null;
  return [];
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
