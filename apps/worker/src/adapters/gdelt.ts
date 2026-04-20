import type { Adapter, RawItem } from './base';

/**
 * GDELT global event/news API (free). Uses broad conflict/disaster query.
 */
export class GdeltAdapter implements Adapter {
  id = 'gdelt-doc';
  label = 'GDELT Global Events';

  async fetch(): Promise<RawItem[]> {
    const query = encodeURIComponent(
      '(conflict OR earthquake OR flood OR sanctions OR cyberattack OR airstrike OR bombing OR missile OR explosion OR troops)',
    );
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}` +
      '&mode=ArtList&format=json&maxrecords=100&sort=datedesc';
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
