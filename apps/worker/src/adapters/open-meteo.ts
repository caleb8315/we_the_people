import type { Adapter, RawItem } from './base';

/**
 * Open-Meteo severe weather snapshots for a default global set.
 * If user location is configured, personalized weather signals are generated
 * downstream in briefing/email layers.
 */
export class OpenMeteoAdapter implements Adapter {
  id = 'open-meteo-global';
  label = 'Open-Meteo Global Severe Weather';

  async fetch(): Promise<RawItem[]> {
    const cities = [
      { name: 'New York', lat: 40.7128, lon: -74.006, cc: 'US' },
      { name: 'London', lat: 51.5074, lon: -0.1278, cc: 'GB' },
      { name: 'Tokyo', lat: 35.6762, lon: 139.6503, cc: 'JP' },
      { name: 'Sydney', lat: -33.8688, lon: 151.2093, cc: 'AU' },
    ];

    const out: RawItem[] = [];
    for (const city of cities) {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max' +
        '&forecast_days=1&timezone=auto';

      const res = await fetch(url);
      if (!res.ok) continue;
      const j = (await res.json()) as any;

      const tMax = j?.daily?.temperature_2m_max?.[0];
      const rain = j?.daily?.precipitation_sum?.[0];
      const wind = j?.daily?.wind_speed_10m_max?.[0];
      if (tMax == null && rain == null && wind == null) continue;

      const severe = Number(wind ?? 0) > 50 || Number(rain ?? 0) > 40 || Number(tMax ?? 0) > 40;
      const severity = severe ? 70 : 40;
      out.push({
        source_id: this.id,
        title: `Weather outlook: ${city.name}`,
        summary: `Max temp ${tMax ?? '?'}C, precipitation ${rain ?? '?'}mm, max wind ${wind ?? '?'}km/h.`,
        url,
        published_at: new Date().toISOString(),
        country_code: city.cc,
        topic: 'climate',
        severity,
        raw: { city: city.name, tMax, rain, wind, lat: city.lat, lon: city.lon },
      });
    }
    return out;
  }
}
