import { tool } from 'ai';
import { z } from 'zod';
import { outletProfile, ownershipLabel } from '@osint/core';
import { fetchJson, gdeltRequest, stripTags, truncate } from '../http';
import { parseDateLoose, recordStat, sourceBrief, type ToolContext } from './context';

const WIKIDATA_UA = { 'user-agent': 'Crosscheck-Investigator/1.0 (https://crosscheck.news; hello@crosscheck.news)' };

export function referenceTools(ctx: ToolContext) {
  return {
    wikipedia_search: tool({
      description:
        'Search Wikipedia in any language edition for background on people, places, organisations and past events. Local-language editions often have detail the English one lacks. Background only — not proof of a recent claim.',
      inputSchema: z.object({
        query: z.string().min(2),
        language: z.string().min(2).max(3).default('en'),
      }),
      execute: async ({ query, language }) => {
        const lang = language.toLowerCase();
        const body = await fetchJson<{ pages?: Array<{ key: string; title: string; excerpt?: string; description?: string }> }>(
          `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=5`,
          { headers: WIKIDATA_UA, timeoutMs: 8_000, signal: ctx.signal },
        );
        const pages = body?.pages ?? [];
        const results = await Promise.all(
          pages.slice(0, 4).map(async (p, i) => {
            let extract: string | null = null;
            if (i === 0) {
              const summary = await fetchJson<{ extract?: string }>(
                `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`,
                { headers: WIKIDATA_UA, timeoutMs: 8_000, signal: ctx.signal },
              );
              extract = summary?.extract ?? null;
            }
            const snippet = [p.description, p.excerpt ? stripTags(p.excerpt) : null].filter(Boolean).join(' — ');
            const entry = ctx.ledger.add({
              url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
              title: p.title,
              outlet: `Wikipedia (${lang})`,
              snippet: extract ? truncate(extract, 400) : snippet,
              text: extract,
              language: lang,
              retrieved_via: 'Wikipedia',
            });
            return { ...sourceBrief(entry), summary: extract ? truncate(extract, 1200) : undefined };
          }),
        );
        ctx.languages.add(lang);
        recordStat(ctx, 'wikipedia_search', results.length);
        return { results };
      },
    }),

    outlet_profile: tool({
      description:
        'Who owns or controls a news outlet, and which country it belongs to. Use for any unfamiliar outlet before weighing its claims, and to group sources into perspectives.',
      inputSchema: z.object({ domain: z.string().min(3).describe('e.g. "presstv.ir" or "lemonde.fr"') }),
      execute: async ({ domain }) => {
        const host = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
        const known = outletProfile(host);
        if (known) {
          recordStat(ctx, 'outlet_profile', 1);
          return { ...known, label: ownershipLabel(known.ownership), source: 'curated' };
        }
        const wd = await wikidataOutlet(host, ctx.signal);
        recordStat(ctx, 'outlet_profile', wd ? 1 : 0);
        if (!wd) return { domain: host, label: 'Unprofiled outlet', note: 'No curated or Wikidata profile found.' };
        return { domain: host, ...wd, source: 'wikidata' };
      },
    }),

    scholarly_search: tool({
      description:
        'Search peer-reviewed research (OpenAlex: 250M+ works, all disciplines). Use for health, science, climate, economics and statistics claims.',
      inputSchema: z.object({
        query: z.string().min(3),
        from_year: z.number().int().optional(),
      }),
      execute: async ({ query, from_year }) => {
        const u = new URL('https://api.openalex.org/works');
        u.searchParams.set('search', query);
        u.searchParams.set('per-page', '8');
        u.searchParams.set('sort', 'relevance_score:desc');
        if (from_year) u.searchParams.set('filter', `from_publication_date:${from_year}-01-01`);
        u.searchParams.set('mailto', ctx.env.CROSSREF_MAILTO ?? 'hello@crosscheck.news');
        if (ctx.env.OPENALEX_API_KEY) u.searchParams.set('api_key', ctx.env.OPENALEX_API_KEY);
        const body = await fetchJson<{ results?: OpenAlexWork[] }>(u.toString(), { timeoutMs: 12_000, signal: ctx.signal });
        const results = (body?.results ?? []).map((w) => {
          const abstract = w.abstract_inverted_index ? rebuildAbstract(w.abstract_inverted_index) : null;
          const landing = w.doi ?? w.primary_location?.landing_page_url ?? w.id;
          const entry = ctx.ledger.add({
            url: landing,
            title: w.display_name ?? null,
            outlet: w.primary_location?.source?.display_name ?? 'Scholarly work',
            published_at: w.publication_date ?? null,
            snippet: abstract ? truncate(abstract, 400) : null,
            text: abstract,
            retrieved_via: 'OpenAlex',
          });
          return {
            ...sourceBrief(entry),
            cited_by: w.cited_by_count,
            type: w.type,
            retracted: w.is_retracted || undefined,
          };
        });
        recordStat(ctx, 'scholarly_search', results.length);
        return { results };
      },
    }),

    trace_origin: tool({
      description:
        'Find where and when a claim first appeared: the earliest news coverage (GDELT, last ~3 months), and for a specific URL the earliest Internet Archive snapshot. Use to detect recycled old stories/images presented as new, and to identify who started a narrative.',
      inputSchema: z.object({
        query: z.string().min(3).optional().describe('Distinctive keywords or quoted phrase from the claim'),
        url: z.string().url().optional().describe('A URL whose first-seen date you want'),
      }),
      execute: async ({ query, url }) => {
        const out: Record<string, unknown> = {};
        if (url) {
          const cdx = await fetchJson<string[][]>(
            `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=1&fl=timestamp,original,statuscode`,
            { timeoutMs: 30_000, signal: ctx.signal },
          );
          const row = cdx?.[1];
          out.archive_first_capture = row
            ? {
                date: parseDateLoose(row[0])?.toISOString() ?? row[0],
                snapshot: `https://web.archive.org/web/${row[0]}/${row[1]}`,
              }
            : 'No Internet Archive capture found.';
        }
        if (query) {
          const u = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
          u.searchParams.set('query', query);
          u.searchParams.set('mode', 'ArtList');
          u.searchParams.set('format', 'json');
          u.searchParams.set('maxrecords', '12');
          u.searchParams.set('sort', 'dateasc');
          u.searchParams.set('timespan', '3months');
          const res = await gdeltRequest(u.toString(), ctx.signal);
          let body: { articles?: Array<{ url: string; title?: string; seendate?: string; sourcecountry?: string; language?: string }> } | null = null;
          if (res.ok) {
            try {
              body = JSON.parse(res.text);
            } catch {
              body = null;
            }
          } else {
            out.gdelt_error = res.reason;
          }
          const earliest = (body?.articles ?? []).map((a) => {
            const entry = ctx.ledger.add({
              url: a.url,
              title: a.title ?? null,
              published_at: parseDateLoose(a.seendate)?.toISOString() ?? null,
              snippet: a.title ?? null,
              retrieved_via: 'GDELT (earliest coverage)',
            });
            return { ...sourceBrief(entry), source_country: a.sourcecountry, language: a.language };
          });
          out.earliest_coverage = earliest.length
            ? earliest
            : 'GDELT found no coverage in the last 3 months (the story may be older, or the query too specific).';
        }
        recordStat(ctx, 'trace_origin', Array.isArray(out.earliest_coverage) ? out.earliest_coverage.length : 0);
        return out;
      },
    }),
  };
}

async function wikidataOutlet(host: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const variants = [`https://www.${host}`, `https://${host}`, `https://www.${host}/`, `https://${host}/`, `http://www.${host}`, `http://${host}`, `http://www.${host}/`, `http://${host}/`];
  const search = await fetchJson<{ query?: { search?: Array<{ title: string }> } }>(
    `https://www.wikidata.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(`haswbstatement:"${variants.map((v) => `P856=${v}`).join('|')}"`)}`,
    { headers: WIKIDATA_UA, timeoutMs: 8_000, signal },
  );
  const qid = search?.query?.search?.[0]?.title;
  if (!qid) return null;
  const entity = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
    { headers: WIKIDATA_UA, timeoutMs: 8_000, signal },
  );
  const e = entity?.entities?.[qid];
  if (!e) return null;
  const ids = (p: string) =>
    (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter((x): x is string => Boolean(x));
  const refs = [...new Set([...ids('P17'), ...ids('P127'), ...ids('P749'), ...ids('P31')])].slice(0, 20);
  const labels = refs.length
    ? await fetchJson<{ entities?: Record<string, { labels?: { en?: { value: string } } }> }>(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${refs.join('|')}`,
        { headers: WIKIDATA_UA, timeoutMs: 8_000, signal },
      )
    : null;
  const label = (id: string) => labels?.entities?.[id]?.labels?.en?.value ?? id;
  const instanceOf = ids('P31').map(label);
  const owners = [...ids('P127'), ...ids('P749')].map(label);
  const stateHint = instanceOf.some((x) => /state media|state-owned|government agency|public broadcaster/i.test(x));
  return {
    name: e.labels?.en?.value ?? host,
    wikidata: `https://www.wikidata.org/wiki/${qid}`,
    country: ids('P17').map(label),
    owned_by: [...new Set(owners)],
    instance_of: instanceOf,
    label: stateHint ? 'Possibly state-linked (check owners)' : 'See owners',
  };
}

function rebuildAbstract(index: Record<string, number[]>): string {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter(Boolean).join(' ');
}

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  display_name?: string;
  publication_date?: string;
  cited_by_count?: number;
  type?: string;
  is_retracted?: boolean;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
}

interface WikidataEntity {
  labels?: { en?: { value: string } };
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>;
}
