import type { Adapter, RawItem } from './base';

/**
 * NASA EONET — natural events (wildfires, storms, volcanoes) from satellites.
 */
export class NasaEonetAdapter implements Adapter {
  id = 'nasa-eonet';
  label = 'NASA · EONET Events';

  async fetch(): Promise<RawItem[]> {
    const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?days=2&status=open');
    if (!res.ok) throw new Error(`eonet ${res.status}`);
    const data = (await res.json()) as { events?: any[] };
    const out: RawItem[] = [];
    for (const ev of data.events ?? []) {
      const cat = ev.categories?.[0]?.title ?? 'natural event';
      const first = ev.geometry?.[0];
      out.push({
        source_id: this.id,
        title: `${cat}: ${ev.title}`,
        summary: ev.description ?? null,
        url: ev.link ?? ev.sources?.[0]?.url ?? 'https://eonet.gsfc.nasa.gov',
        published_at: first?.date ?? null,
        topic: cat.toLowerCase().includes('wildfire') ? 'climate' : 'disaster',
        severity: 60,
        raw: {
          id: ev.id,
          category: cat,
          geometry: first
            ? {
                type: first.type,
                coordinates: first.coordinates,
              }
            : null,
          event_time: first?.date ?? null,
        },
      });
    }
    return out;
  }
}
