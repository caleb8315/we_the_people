import type { Adapter, RawItem } from './base';

interface SwpcAlertRow {
  product_id?: string;
  issue_datetime?: string;
  message?: string;
}

/**
 * NOAA Space Weather Prediction Center alerts.
 * Free JSON feed with geomagnetic/solar event warnings.
 */
export class SwpcAlertsAdapter implements Adapter {
  id = 'swpc-alerts';
  label = 'NOAA SWPC Space Weather Alerts';

  async fetch(): Promise<RawItem[]> {
    const res = await fetch('https://services.swpc.noaa.gov/products/alerts.json');
    if (!res.ok) throw new Error(`swpc ${res.status}`);

    const rows = (await res.json()) as SwpcAlertRow[];
    const out: RawItem[] = [];

    for (const row of rows ?? []) {
      const message = String(row.message ?? '').trim();
      if (!message) continue;

      const title = extractHeadline(message) ?? `SWPC alert ${row.product_id ?? ''}`.trim();
      const scale = extractNoaaScale(message);
      out.push({
        source_id: this.id,
        title: `Space weather: ${title}`,
        summary: clip(message.replace(/\s+/g, ' '), 500),
        url: 'https://www.swpc.noaa.gov/products/alerts-watches-and-warnings',
        published_at: toIso(row.issue_datetime),
        topic: 'climate',
        severity: mapSpaceWeatherSeverity(scale),
        raw: {
          product_id: row.product_id ?? null,
          noaa_scale: scale,
        },
      });
    }

    // Keep only the most recent items to avoid flooding each ingest cycle.
    out.sort((a, b) => String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')));
    return out.slice(0, 25);
  }
}

function extractHeadline(message: string): string | null {
  const lines = message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const tagged = lines.find((line) =>
    /^(ALERT|WARNING|WATCH|EXTENDED WARNING|SUMMARY):/i.test(line),
  );
  if (tagged) return tagged.replace(/^(ALERT|WARNING|WATCH|EXTENDED WARNING|SUMMARY):\s*/i, '');

  const firstMeaningful = lines.find((line) => line.length > 12 && !line.includes('Space Weather'));
  return firstMeaningful ?? null;
}

function extractNoaaScale(message: string): string | null {
  const m = message.match(/NOAA Scale:\s*([A-Z]\d)/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function mapSpaceWeatherSeverity(scale: string | null): number {
  if (!scale) return 58;
  const code = scale.toUpperCase();
  if (code.startsWith('G') || code.startsWith('S') || code.startsWith('R')) {
    const level = Number(code.slice(1));
    if (Number.isFinite(level)) return Math.min(95, 45 + level * 10);
  }
  return 58;
}

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}
