import Parser from 'rss-parser';
import type { Adapter, RawItem } from './base';

const parser = new Parser({ timeout: 15_000 });

/**
 * In-memory ETag/Last-Modified cache for conditional HTTP requests.
 * Persists across adapter instances within a single process run.
 * Each hourly ingest process starts fresh, but within a run multiple
 * fetches to the same URL will benefit from caching.
 */
const conditionalCache = new Map<string, { etag?: string; lastModified?: string }>();

export class RssAdapter implements Adapter {
  constructor(public id: string, public label: string, private url: string) {}

  async fetch(): Promise<RawItem[]> {
    const xml = await fetchRss(this.url);
    if (!xml) return []; // 304 Not Modified
    const feed = await parser.parseString(xml);
    const out: RawItem[] = [];
    for (const item of feed.items ?? []) {
      if (!item.link || !item.title) continue;
      out.push({
        source_id: this.id,
        title: item.title.trim(),
        summary: (item.contentSnippet ?? item.summary ?? '').trim() || null,
        url: item.link,
        published_at: item.isoDate ?? item.pubDate ?? null,
        raw: { guid: item.guid },
      });
    }
    return out;
  }
}

async function fetchRss(url: string): Promise<string | null> {
  const headers: Record<string, string> = {
    'user-agent': 'Crosscheck-Bot/1.0 (+https://crosscheck.local)',
    accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  };

  // Conditional request headers
  const cached = conditionalCache.get(url);
  if (cached?.etag) headers['if-none-match'] = cached.etag;
  if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;

  const res = await fetch(url, { headers });

  // 304 Not Modified — feed hasn't changed since last fetch
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`rss ${res.status} ${url}`);

  // Store cache headers for future conditional requests
  const etag = res.headers.get('etag') ?? undefined;
  const lastModified = res.headers.get('last-modified') ?? undefined;
  if (etag || lastModified) {
    conditionalCache.set(url, { etag, lastModified });
  }

  return res.text();
}
