import type { Adapter, RawItem } from './base';

/**
 * USGS M4.5+ earthquakes (past day).
 * Public GeoJSON endpoint — no auth, very generous rate limit.
 */
export class UsgsEarthquakesAdapter implements Adapter {
  id = 'usgs-quakes';
  label = 'USGS · M4.5+ Earthquakes';

  async fetch(): Promise<RawItem[]> {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
    if (!res.ok) throw new Error(`usgs ${res.status}`);
    const data = (await res.json()) as { features?: any[] };
    const out: RawItem[] = [];
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const mag = Number(p.mag);
      if (!Number.isFinite(mag)) continue;
      const title = `M${mag.toFixed(1)} — ${p.place ?? 'unknown location'}`;
      const severity = Math.min(100, Math.round(mag * 12));
      out.push({
        source_id: this.id,
        title,
        summary: `Magnitude ${mag.toFixed(1)} earthquake, depth ${f.geometry?.coordinates?.[2] ?? '?'} km.`,
        url: p.url ?? 'https://earthquake.usgs.gov',
        published_at: p.time ? new Date(p.time).toISOString() : null,
        country_code: null,
        topic: 'disaster',
        severity,
        raw: { mag, place: p.place, geometry: f.geometry },
      });
    }
    return out;
  }
}
