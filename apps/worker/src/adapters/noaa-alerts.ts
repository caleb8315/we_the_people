import type { Adapter, RawItem } from './base';

/**
 * NOAA active weather alerts (US-only, free, no API key).
 */
export class NoaaAlertsAdapter implements Adapter {
  id = 'noaa-alerts';
  label = 'NOAA Active Alerts';

  async fetch(): Promise<RawItem[]> {
    const res = await fetch('https://api.weather.gov/alerts/active?status=actual');
    if (!res.ok) throw new Error(`noaa ${res.status}`);
    const j = (await res.json()) as any;

    const out: RawItem[] = [];
    for (const feature of j?.features ?? []) {
      const p = feature?.properties ?? {};
      const headline = p.headline ?? p.event;
      if (!headline) continue;
      out.push({
        source_id: this.id,
        title: `NOAA: ${headline}`,
        summary: p.description ?? p.instruction ?? null,
        url: p.uri ?? 'https://api.weather.gov/alerts/active',
        published_at: p.sent ?? p.effective ?? null,
        country_code: 'US',
        topic: 'disaster',
        severity: mapSeverity(p.severity),
        raw: {
          areaDesc: p.areaDesc,
          severity: p.severity,
          certainty: p.certainty,
        },
      });
    }
    return out;
  }
}

function mapSeverity(level?: string): number {
  const key = String(level ?? '').toLowerCase();
  if (key.includes('extreme')) return 92;
  if (key.includes('severe')) return 82;
  if (key.includes('moderate')) return 65;
  return 45;
}
