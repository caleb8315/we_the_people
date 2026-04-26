import type { Adapter, RawItem } from './base';

const GDELT_QUERIES = [
  {
    label: 'conflict-disaster',
    q: '(conflict OR earthquake OR flood OR sanctions OR cyberattack OR airstrike OR bombing OR missile OR explosion OR troops OR protest OR coup)',
    maxrecords: 75,
  },
  {
    label: 'tech-ai',
    q: '(artificial intelligence OR AI regulation OR semiconductor OR startup OR cybersecurity OR data breach OR big tech OR SpaceX OR OpenAI)',
    maxrecords: 50,
  },
  {
    label: 'finance-economy',
    q: '(federal reserve OR interest rate OR inflation OR recession OR stock market OR banking crisis OR cryptocurrency OR trade war OR tariff OR GDP)',
    maxrecords: 50,
  },
  {
    label: 'health-climate',
    q: '(pandemic OR outbreak OR vaccine OR WHO OR climate change OR wildfire OR hurricane OR emissions OR heatwave OR drought)',
    maxrecords: 50,
  },
];

/**
 * GDELT global event/news API (free). Runs multiple themed queries
 * to cover all topic areas, not just conflict/disaster.
 */
export class GdeltAdapter implements Adapter {
  id = 'gdelt-doc';
  label = 'GDELT Global Events';

  async fetch(): Promise<RawItem[]> {
    const results = await Promise.allSettled(
      GDELT_QUERIES.map((qDef) => this.fetchQuery(qDef.q, qDef.maxrecords)),
    );

    const out: RawItem[] = [];
    const seenUrls = new Set<string>();
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const item of r.value) {
        const key = item.url.toLowerCase();
        if (seenUrls.has(key)) continue;
        seenUrls.add(key);
        out.push(item);
      }
    }
    return out;
  }

  private async fetchQuery(q: string, maxrecords: number): Promise<RawItem[]> {
    const query = encodeURIComponent(q);
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}` +
      `&mode=ArtList&format=json&maxrecords=${maxrecords}&sort=datedesc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`gdelt ${res.status}`);
    const j = (await res.json()) as any;
    const articles = j?.articles ?? [];

    const out: RawItem[] = [];
    for (const a of articles) {
      const title = a.title as string | undefined;
      const link = a.url as string | undefined;
      if (!title || !link) continue;
      out.push({
        source_id: this.id,
        title,
        summary: (a.excerpt as string | undefined) ?? null,
        url: link,
        published_at: a.seendate ? new Date(a.seendate).toISOString() : new Date().toISOString(),
        country_code: typeof a.sourcecountry === 'string' ? a.sourcecountry : null,
        topic: undefined,
        severity: 45,
        raw: {
          sourceCountry: a.sourcecountry,
          socialimage: a.socialimage,
          domain: a.domain,
        },
      });
    }
    return out;
  }
}
