import Parser from 'rss-parser';
import type { Adapter, RawItem } from './base';

const parser = new Parser({ timeout: 15_000 });

export class RssAdapter implements Adapter {
  constructor(public id: string, public label: string, private url: string) {}

  async fetch(): Promise<RawItem[]> {
    const xml = await fetchRss(this.url);
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

async function fetchRss(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Crosscheck-Bot/1.0 (+https://crosscheck.local)',
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`rss ${res.status} ${url}`);
  return res.text();
}
