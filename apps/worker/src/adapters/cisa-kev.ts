import type { Adapter, RawItem } from './base';

interface CisaKevResponse {
  dateReleased?: string;
  vulnerabilities?: Array<{
    cveID?: string;
    vendorProject?: string;
    product?: string;
    vulnerabilityName?: string;
    shortDescription?: string;
    dateAdded?: string;
    dueDate?: string;
    knownRansomwareCampaignUse?: string;
  }>;
}

/**
 * CISA Known Exploited Vulnerabilities catalog (free JSON feed).
 * We emit only recently added KEVs to avoid flooding every ingest cycle.
 */
export class CisaKevAdapter implements Adapter {
  id = 'cisa-kev';
  label = 'CISA Known Exploited Vulnerabilities';

  async fetch(): Promise<RawItem[]> {
    const url =
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cisa-kev ${res.status}`);

    const body = (await res.json()) as CisaKevResponse;
    const rows = body.vulnerabilities ?? [];
    const threshold = Date.now() - 1000 * 60 * 60 * 24 * 21; // recent additions only
    const out: RawItem[] = [];

    for (const row of rows) {
      const dateAdded = parseDate(row.dateAdded);
      if (!dateAdded || dateAdded.getTime() < threshold) continue;

      const cve = String(row.cveID ?? '').trim();
      if (!cve) continue;

      const vendor = String(row.vendorProject ?? '').trim();
      const product = String(row.product ?? '').trim();
      const ransomware = String(row.knownRansomwareCampaignUse ?? '').toLowerCase();
      const severity = ransomware === 'known' ? 92 : 82;

      const target =
        [vendor, product].filter(Boolean).join(' ').trim() || row.vulnerabilityName || 'unspecified target';
      out.push({
        source_id: this.id,
        title: `CISA KEV: ${cve} (${target})`,
        summary: summarizeKev(row.shortDescription, row.dueDate, ransomware),
        url: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${encodeURIComponent(cve)}`,
        published_at: dateAdded.toISOString(),
        topic: 'cyber',
        severity,
        raw: {
          cve,
          vendor: vendor || null,
          product: product || null,
          due_date: row.dueDate ?? null,
          ransomware,
          feed_released: body.dateReleased ?? null,
        },
      });
    }

    out.sort((a, b) => String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')));
    return out.slice(0, 40);
  }
}

function summarizeKev(description: string | undefined, dueDate: string | undefined, ransomware: string): string {
  const base = (description ?? '').trim() || 'Known exploited vulnerability in CISA KEV catalog.';
  const due = dueDate ? ` Remediation due by ${dueDate}.` : '';
  const ransomwareNote =
    ransomware === 'known'
      ? ' Known ransomware campaign use reported.'
      : ransomware === 'unknown'
        ? ' Ransomware use status unknown.'
        : '';
  return clip(base + due + ransomwareNote, 500);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const d2 = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}
