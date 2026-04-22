/**
 * Live sensor-network corroboration.
 *
 *   - USGS earthquake feed (seismic activity)
 *   - NASA EONET (wildfires, storms, volcanoes, floods, icebergs)
 *   - NOAA active weather alerts
 *   - NOAA SWPC space-weather alerts
 *
 * All four are free, key-less, and return structured event data. We only
 * query them when the submission's keywords indicate a physical-event
 * topic — firing them on an Iran/US war headline would waste a round-trip
 * and pollute the result with irrelevant "no match" noise.
 *
 * When one or more sensor networks return confirming data, we bundle a
 * `PhysicalEvidence` record so the confidence engine's `buildBullets`
 * emits the "Independent sensor networks corroborate: usgs.gov, …" line.
 */

import { type EvidenceItem, type PhysicalEvidence } from '@osint/core';
import type { SourceQuery, SourceResult } from './types';

const UA = 'Crosscheck-Verify/1.0 (+https://crosscheck.app)';
const TIMEOUT_MS = 4_500;

interface PhysicalTopic {
  id: 'quake' | 'wildfire' | 'volcano' | 'storm' | 'flood' | 'space_weather';
  networks: Array<'usgs' | 'eonet' | 'noaa' | 'swpc'>;
}

const PHYSICAL_KEYWORDS: Array<[RegExp, PhysicalTopic]> = [
  [/\b(earthquake|quake|seismic|magnitude|aftershock|tremor)\b/i, { id: 'quake', networks: ['usgs'] }],
  [/\b(wildfire|bushfire|forest fire|wildland fire)\b/i, { id: 'wildfire', networks: ['eonet'] }],
  [/\b(volcano|volcanic|eruption|lava|ash plume)\b/i, { id: 'volcano', networks: ['eonet'] }],
  [
    /\b(hurricane|typhoon|cyclone|tropical storm|tornado|blizzard|snowstorm|ice storm)\b/i,
    { id: 'storm', networks: ['eonet', 'noaa'] },
  ],
  [/\b(flood|flooding|deluge|inundation)\b/i, { id: 'flood', networks: ['eonet', 'noaa'] }],
  [
    /\b(solar flare|cme|coronal mass ejection|geomagnetic storm|space weather|aurora)\b/i,
    { id: 'space_weather', networks: ['swpc'] },
  ],
];

export async function searchSensors(q: SourceQuery): Promise<SourceResult> {
  const searchText = `${q.title ?? ''} ${q.text ?? ''} ${q.keywords.join(' ')}`;
  const topics = detectTopics(searchText);
  if (topics.length === 0) {
    return {
      id: 'sensors',
      name: 'Sensor networks',
      status: 'skipped',
      hits: 0,
      note: 'Sensor networks (USGS earthquakes, NASA fires/storms, NOAA weather, SWPC space weather) only run for physical-event claims. This claim doesn\u2019t mention one, so we skipped them to avoid noise.',
      evidence: [],
      physical_evidence: null,
    };
  }

  // De-dupe network list across detected topics.
  const networks = new Set<'usgs' | 'eonet' | 'noaa' | 'swpc'>();
  for (const t of topics) for (const n of t.networks) networks.add(n);

  const jobs: Array<Promise<SensorHit[]>> = [];
  if (networks.has('usgs')) jobs.push(queryUsgs());
  if (networks.has('eonet')) jobs.push(queryEonet());
  if (networks.has('noaa')) jobs.push(queryNoaa());
  if (networks.has('swpc')) jobs.push(querySwpc());

  const settled = await Promise.allSettled(jobs);
  const hits: SensorHit[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') hits.push(...s.value);
  }

  if (hits.length === 0) {
    return {
      id: 'sensors',
      name: 'Sensor networks',
      status: 'miss',
      hits: 0,
      note: `Queried ${[...networks].join(', ').toUpperCase()}; no recent matching events.`,
      evidence: [],
      physical_evidence: {
        status: 'none_detected',
        sources: [...networks].map(networkDomain),
        confidence: 0,
        limitations: [
          'Sensor networks returned no matching events within the current window.',
        ],
      },
    };
  }

  const evidence: EvidenceItem[] = hits.slice(0, 6).map((h) => ({
    source_id: h.sourceId,
    url: h.url,
    domain: h.domain,
    title: h.title,
    published_at: h.observedAt,
    is_credible: true,
    excerpt: h.excerpt,
  }));

  const sourceDomains = Array.from(new Set(evidence.map((e) => e.domain)));
  return {
    id: 'sensors',
    name: 'Sensor networks',
    status: 'hit',
    hits: evidence.length,
    note: `${evidence.length} matching events on ${sourceDomains.join(', ')}.`,
    evidence,
    physical_evidence: {
      status: 'confirmed',
      sources: sourceDomains,
      confidence: Math.min(100, 60 + evidence.length * 5),
      limitations: [],
    },
  };
}

function detectTopics(text: string): PhysicalTopic[] {
  const out: PhysicalTopic[] = [];
  const seen = new Set<string>();
  for (const [re, t] of PHYSICAL_KEYWORDS) {
    if (re.test(text) && !seen.has(t.id)) {
      out.push(t);
      seen.add(t.id);
    }
  }
  return out;
}

function networkDomain(n: 'usgs' | 'eonet' | 'noaa' | 'swpc'): string {
  switch (n) {
    case 'usgs':
      return 'earthquake.usgs.gov';
    case 'eonet':
      return 'eonet.gsfc.nasa.gov';
    case 'noaa':
      return 'api.weather.gov';
    case 'swpc':
      return 'swpc.noaa.gov';
  }
}

// ─── per-network queries ───────────────────────────────────────────────────

interface SensorHit {
  sourceId: string;
  url: string;
  domain: string;
  title: string;
  observedAt: string | null;
  excerpt: string | null;
}

async function queryUsgs(): Promise<SensorHit[]> {
  // "significant quakes, past week" — any M4.5+ event on Earth.
  const url =
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
  const json = await getJson<UsgsResponse>(url);
  if (!json?.features) return [];
  return json.features.slice(0, 10).map((f) => ({
    sourceId: 'usgs-quakes',
    url: f.properties.url ?? 'https://earthquake.usgs.gov',
    domain: 'earthquake.usgs.gov',
    title: f.properties.title ?? 'USGS earthquake event',
    observedAt: f.properties.time ? new Date(f.properties.time).toISOString() : null,
    excerpt: f.properties.place
      ? `Magnitude ${f.properties.mag ?? '?'} near ${f.properties.place}`
      : null,
  }));
}

async function queryEonet(): Promise<SensorHit[]> {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7&limit=15';
  const json = await getJson<EonetResponse>(url);
  if (!json?.events) return [];
  return json.events.slice(0, 10).map((e) => ({
    sourceId: 'nasa-eonet',
    url: (e.sources?.[0]?.url ?? e.link) ?? 'https://eonet.gsfc.nasa.gov',
    domain: 'eonet.gsfc.nasa.gov',
    title: e.title ?? 'NASA EONET event',
    observedAt: e.geometry?.[0]?.date ?? null,
    excerpt: e.categories?.[0]?.title ? `Category: ${e.categories[0].title}` : null,
  }));
}

async function queryNoaa(): Promise<SensorHit[]> {
  const url = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert&limit=15';
  const json = await getJson<NoaaResponse>(url);
  if (!json?.features) return [];
  return json.features.slice(0, 10).map((f) => ({
    sourceId: 'noaa-alerts',
    url: f.properties?.web ?? 'https://www.weather.gov',
    domain: 'api.weather.gov',
    title: f.properties?.headline ?? f.properties?.event ?? 'NOAA weather alert',
    observedAt: f.properties?.sent ?? null,
    excerpt: f.properties?.areaDesc?.slice(0, 240) ?? null,
  }));
}

async function querySwpc(): Promise<SensorHit[]> {
  const url = 'https://services.swpc.noaa.gov/products/alerts.json';
  const json = await getJson<SwpcAlert[]>(url);
  if (!Array.isArray(json)) return [];
  return json.slice(0, 10).map((a) => ({
    sourceId: 'swpc-alerts',
    url: 'https://www.swpc.noaa.gov/',
    domain: 'swpc.noaa.gov',
    title: a.message?.split('\n')?.[0]?.slice(0, 160) ?? 'SWPC space-weather alert',
    observedAt: a.issue_datetime ? new Date(a.issue_datetime).toISOString() : null,
    excerpt: a.message?.slice(0, 240) ?? null,
  }));
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

// ─── upstream response shapes ──────────────────────────────────────────────

type UsgsResponse = {
  features?: Array<{
    properties: {
      title?: string;
      url?: string;
      time?: number;
      place?: string;
      mag?: number;
    };
  }>;
};

type EonetResponse = {
  events?: Array<{
    id?: string;
    title?: string;
    link?: string;
    categories?: Array<{ title?: string }>;
    sources?: Array<{ url?: string }>;
    geometry?: Array<{ date?: string }>;
  }>;
};

type NoaaResponse = {
  features?: Array<{
    properties?: {
      headline?: string;
      event?: string;
      areaDesc?: string;
      sent?: string;
      web?: string;
    };
  }>;
};

type SwpcAlert = {
  message?: string;
  issue_datetime?: string;
};
