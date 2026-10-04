import { tool } from 'ai';
import { z } from 'zod';
import { decodeEntities, fetchJson, fetchText, gdeltRequest, httpFetch, truncate } from '../http';
import {
  countryName,
  languageName,
  parseDateLoose,
  recordStat,
  sourceBrief,
  type ToolContext,
} from './context';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const LATAM = new Set(['MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'UY', 'PY', 'CU', 'DO', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'US']);

export function googleNewsLocale(language: string, country: string): { hl: string; gl: string; ceid: string } {
  const lang = language.toLowerCase();
  const cc = country.toUpperCase();
  if (lang === 'en') return { hl: `en-${cc}`, gl: cc, ceid: `${cc}:en` };
  if (lang === 'pt') {
    return cc === 'BR'
      ? { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' }
      : { hl: 'pt-PT', gl: cc, ceid: `${cc}:pt-150` };
  }
  if (lang === 'es' && LATAM.has(cc)) return { hl: 'es-419', gl: cc, ceid: `${cc}:es-419` };
  if (lang === 'zh') {
    if (cc === 'CN') return { hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' };
    return { hl: `zh-${cc}`, gl: cc, ceid: `${cc}:zh-Hant` };
  }
  return { hl: lang, gl: cc, ceid: `${cc}:${lang}` };
}

/**
 * Google News RSS links are opaque redirects. Resolve them to the
 * publisher URL so the article can be read and cited directly.
 */
export async function decodeGoogleNewsUrl(link: string, signal?: AbortSignal): Promise<string | null> {
  const id = link.match(/news\.google\.com\/(?:rss\/)?articles\/([^?/#]+)/)?.[1];
  if (!id) return null;
  const page = await fetchText(`https://news.google.com/rss/articles/${id}`, {
    headers: { 'user-agent': BROWSER_UA },
    timeoutMs: 6_000,
    signal,
  });
  if (!page) return null;
  const sig = page.text.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = page.text.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sig || !ts) return null;
  const payload = [
    [
      [
        'Fbv4je',
        JSON.stringify([
          'garturlreq',
          [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
          id,
          Number(ts),
          sig,
        ]),
        null,
        'generic',
      ],
    ],
  ];
  const res = await httpFetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': BROWSER_UA },
    body: `f.req=${encodeURIComponent(JSON.stringify(payload))}`,
    timeoutMs: 6_000,
    signal,
  });
  if (!res || !res.ok) return null;
  const text = await res.text().catch(() => '');
  const url = text.match(/\[\\"garturlres\\",\\"(.*?)\\"/)?.[1];
  return url ? url.replace(/\\\\u003d/g, '=').replace(/\\\\u0026/g, '&') : null;
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
}

export function parseGoogleNewsRss(xml: string): RssItem[] {
  const out: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1] ?? '';
    const rawTitle = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
    const link = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? null;
    const sourceMatch = block.match(/<source url="([^"]*)">([\s\S]*?)<\/source>/);
    const sourceName = sourceMatch ? decodeEntities(sourceMatch[2] ?? '').trim() : null;
    const sourceUrl = sourceMatch?.[1] ?? null;
    const title = sourceName && rawTitle.endsWith(` - ${sourceName}`)
      ? rawTitle.slice(0, -(sourceName.length + 3))
      : rawTitle;
    if (title && link) out.push({ title, link, pubDate, sourceName, sourceUrl });
  }
  return out;
}

export function newsTools(ctx: ToolContext) {
  return {
    google_news_search: tool({
      description:
        'Search Google News in a specific country edition and language. Use it to see how LOCAL media in the countries involved report the story, in their own language. Write the query in that language (translate it yourself). Run it for each relevant country/language, not just English.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Search terms in the target language. Supports quotes and OR.'),
        language: z.string().length(2).describe('ISO 639-1 code, e.g. "uk", "ru", "ar", "zh", "es"'),
        country: z.string().length(2).describe('ISO 3166-1 alpha-2 edition, e.g. "UA", "RU", "EG", "CN", "MX"'),
        recency: z.enum(['any', '1d', '7d', '30d', '1y']).default('any'),
      }),
      execute: async ({ query, language, country, recency }) => {
        const { hl, gl, ceid } = googleNewsLocale(language, country);
        const q = recency === 'any' ? query : `${query} when:${recency}`;
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
        const res = await fetchText(url, { headers: { 'user-agent': BROWSER_UA }, timeoutMs: 10_000, signal: ctx.signal });
        if (!res) {
          recordStat(ctx, 'google_news_search', 0);
          return { error: 'Google News did not respond.' };
        }
        const items = parseGoogleNewsRss(res.text).slice(0, 10);
        ctx.languages.add(language.toLowerCase());
        ctx.countries.add(country.toUpperCase());
        const decoded = await Promise.all(
          items.slice(0, 8).map((it) => decodeGoogleNewsUrl(it.link, ctx.signal).catch(() => null)),
        );
        const results = items.map((it, i) => {
          let domain: string | null = null;
          try {
            domain = it.sourceUrl ? new URL(it.sourceUrl).hostname : null;
          } catch {
            domain = null;
          }
          const entry = ctx.ledger.add({
            url: decoded[i] ?? it.link,
            domain: decoded[i] ? null : domain,
            title: it.title,
            outlet: it.sourceName,
            published_at: parseDateLoose(it.pubDate)?.toISOString() ?? null,
            language: language.toLowerCase(),
            country: null,
            snippet: it.title,
            retrieved_via: `Google News (${countryName(country)}, ${languageName(language)})`,
          });
          return sourceBrief(entry);
        });
        recordStat(ctx, 'google_news_search', results.length);
        return { edition: `${countryName(country)} / ${languageName(language)}`, results };
      },
    }),

    gdelt_search: tool({
      description:
        'Search GDELT, which monitors news worldwide in 65+ languages and machine-translates it. English queries match foreign-language coverage. Filter by source country/language to see a specific media ecosystem, and sort by "oldest" to find where a story first appeared. Covers roughly the last 3 months only.',
      inputSchema: z.object({
        query: z.string().min(3).describe('Keywords (English works for all languages). Use "quoted phrases"; wrap OR groups in parentheses.'),
        source_country: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 of the publishing outlet'),
        source_language: z.string().length(2).optional().describe('ISO 639-1 language of the original article'),
        start_date: z.string().optional().describe('YYYY-MM-DD'),
        end_date: z.string().optional().describe('YYYY-MM-DD'),
        sort: z.enum(['relevance', 'oldest', 'newest']).default('relevance'),
      }),
      execute: async ({ query, source_country, source_language, start_date, end_date, sort }) => {
        let q = query;
        if (source_country) q += ` sourcecountry:${countryName(source_country).replace(/\s+/g, '').toLowerCase()}`;
        if (source_language) q += ` sourcelang:${languageName(source_language).toLowerCase()}`;
        const u = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
        u.searchParams.set('query', q);
        u.searchParams.set('mode', 'ArtList');
        u.searchParams.set('format', 'json');
        u.searchParams.set('maxrecords', '25');
        u.searchParams.set('sort', sort === 'oldest' ? 'dateasc' : sort === 'newest' ? 'datedesc' : 'hybridrel');
        if (start_date) u.searchParams.set('startdatetime', `${start_date.replace(/-/g, '')}000000`);
        if (end_date) u.searchParams.set('enddatetime', `${end_date.replace(/-/g, '')}235959`);
        if (!start_date && !end_date) u.searchParams.set('timespan', '3months');

        const res = await gdeltRequest(u.toString(), ctx.signal);
        if (!res.ok) {
          recordStat(ctx, 'gdelt_search', 0);
          return { error: res.reason };
        }
        let body: { articles?: GdeltArticle[] } | null = null;
        try {
          body = JSON.parse(res.text) as { articles?: GdeltArticle[] };
        } catch {
          recordStat(ctx, 'gdelt_search', 0);
          return { error: `GDELT rejected the query: ${truncate(res.text, 200)}` };
        }
        const articles = (body?.articles ?? []).slice(0, 15);
        const results = articles.map((a) => {
          const entry = ctx.ledger.add({
            url: a.url,
            title: a.title ?? null,
            published_at: parseDateLoose(a.seendate)?.toISOString() ?? null,
            language: isoFromGdeltLanguage(a.language),
            country: null,
            snippet: a.title ?? null,
            retrieved_via: 'GDELT global news',
          });
          if (entry.language) ctx.languages.add(entry.language);
          return { ...sourceBrief(entry), source_country: a.sourcecountry };
        });
        recordStat(ctx, 'gdelt_search', results.length);
        return { results };
      },
    }),

    fact_check_search: tool({
      description:
        'Search published fact-checks (ClaimReview) from fact-checking organisations worldwide. Use early: if a claim was already checked, read those fact-checks and verify their reasoning.',
      inputSchema: z.object({
        query: z.string().min(3),
        language: z.string().length(2).optional(),
      }),
      execute: async ({ query, language }) => {
        const key = ctx.env.GOOGLE_FACTCHECK_API_KEY;
        if (!key) {
          recordStat(ctx, 'fact_check_search', 0);
          return {
            unavailable: true,
            note: 'Fact-check database key not configured. Search news for "<claim> fact check" instead, in each relevant language.',
          };
        }
        const u = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
        u.searchParams.set('query', query);
        u.searchParams.set('pageSize', '10');
        u.searchParams.set('key', key);
        if (language) u.searchParams.set('languageCode', language);
        const body = await fetchJson<FactCheckResponse>(u.toString(), { timeoutMs: 10_000, signal: ctx.signal });
        const results: Array<Record<string, unknown>> = [];
        for (const claim of body?.claims ?? []) {
          for (const review of claim.claimReview ?? []) {
            if (!review.url) continue;
            const snippet = `Claim: "${truncate(claim.text, 200)}" (by ${claim.claimant ?? 'unknown'}). Rating: ${review.textualRating ?? 'n/a'}.`;
            const entry = ctx.ledger.add({
              url: review.url,
              title: review.title ?? null,
              outlet: review.publisher?.name ?? null,
              published_at: review.reviewDate ?? claim.claimDate ?? null,
              language: review.languageCode ?? language ?? null,
              snippet,
              text: snippet,
              retrieved_via: 'Fact-check database (ClaimReview)',
            });
            results.push({ ...sourceBrief(entry), rating: review.textualRating, claim: claim.text, claimant: claim.claimant });
          }
        }
        recordStat(ctx, 'fact_check_search', results.length);
        return { results: results.slice(0, 12) };
      },
    }),
  };
}

const GDELT_LANG: Record<string, string> = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', russian: 'ru', ukrainian: 'uk', arabic: 'ar',
  chinese: 'zh', japanese: 'ja', korean: 'ko', portuguese: 'pt', italian: 'it', turkish: 'tr', persian: 'fa',
  hindi: 'hi', urdu: 'ur', hebrew: 'he', polish: 'pl', dutch: 'nl', indonesian: 'id', vietnamese: 'vi',
  thai: 'th', bengali: 'bn', romanian: 'ro', greek: 'el', czech: 'cs', swedish: 'sv', hungarian: 'hu',
};

function isoFromGdeltLanguage(lang: string | undefined): string | null {
  if (!lang) return null;
  return GDELT_LANG[lang.toLowerCase()] ?? null;
}

interface GdeltArticle {
  url: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface FactCheckResponse {
  claims?: Array<{
    text?: string;
    claimant?: string;
    claimDate?: string;
    claimReview?: Array<{
      publisher?: { name?: string; site?: string };
      url?: string;
      title?: string;
      reviewDate?: string;
      textualRating?: string;
      languageCode?: string;
    }>;
  }>;
}

