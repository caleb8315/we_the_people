import type { Adapter, RawItem } from './base';

/**
 * GDELT global event/news API (free). Uses broad conflict/disaster query.
 */
export class GdeltAdapter implements Adapter {
  id = 'gdelt-doc';
  label = 'GDELT Global Events';

  async fetch(): Promise<RawItem[]> {
    const query = encodeURIComponent('(conflict OR earthquake OR flood OR sanctions OR cyberattack)');
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}` +
      '&mode=ArtList&format=json&maxrecords=25&sort=datedesc';
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
        summary: a.seendate ? `Seen ${a.seendate}` : null,
        url: link,
        published_at: a.seendate ? new Date(a.seendate).toISOString() : new Date().toISOString(),
        topic: undefined,
        severity: 45,
        raw: {
          sourceCountry: a.sourcecountry,
          socialimage: a.socialimage,
        },
      });
    }
    return out;
  }
}
