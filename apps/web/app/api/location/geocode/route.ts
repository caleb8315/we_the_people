import { NextResponse } from 'next/server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/location/geocode?query=Denver,%20CO
 * Free geocoding with layered fallbacks:
 *  1) Open-Meteo geocoder (best effort for city/state/country)
 *  2) ZIP fallback via Zippopotam.us (great for US ZIPs)
 *  3) OpenStreetMap Nominatim fallback for mixed human inputs
 */
export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'geocode'), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query')?.trim();
  if (!query) return NextResponse.json({ error: 'query_required' }, { status: 400 });

  const normalized = normalizeQuery(query);
  const attempts = uniqueQueries([query, normalized, stripZipSuffix(normalized)]);

  for (const q of attempts) {
    const hit = await geocodeOpenMeteo(q);
    if (hit) return NextResponse.json({ location: hit });
  }

  const zip = extractUsZip(query);
  if (zip) {
    const byZip = await geocodeUsZip(zip);
    if (byZip) return NextResponse.json({ location: byZip });
  }

  for (const q of attempts) {
    const hit = await geocodeNominatim(q);
    if (hit) return NextResponse.json({ location: hit });
  }

  return NextResponse.json(
    {
      error: 'not_found',
      message: 'Try city + state (e.g., "Frisco, CO") or a ZIP code (e.g., "80443").',
    },
    { status: 404 },
  );
}

async function geocodeOpenMeteo(query: string): Promise<{ label: string; lat: number; lon: number } | null> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    '&count=1&language=en&format=json';
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = (await res.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  const hit = j.results?.[0];
  if (!hit) return null;
  return {
    label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    lat: hit.latitude,
    lon: hit.longitude,
  };
}

async function geocodeUsZip(zip: string): Promise<{ label: string; lat: number; lon: number } | null> {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return null;
  const j = (await res.json()) as {
    'country abbreviation'?: string;
    'post code'?: string;
    places?: Array<{
      'place name'?: string;
      state?: string;
      latitude?: string;
      longitude?: string;
    }>;
  };
  const p = j.places?.[0];
  if (!p?.latitude || !p?.longitude) return null;
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    label: [p['place name'], p.state, j['post code']].filter(Boolean).join(', '),
    lat,
    lon,
  };
}

async function geocodeNominatim(query: string): Promise<{ label: string; lat: number; lon: number } | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'Crosscheck-Geocoder/1.0' },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  const hit = rows?.[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    label: hit.display_name ?? query,
    lat,
    lon,
  };
}

function normalizeQuery(query: string): string {
  return query
    .replace(/\s+/g, ' ')
    .replace(/\b([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\b/, '$1')
    .trim();
}

function stripZipSuffix(query: string): string {
  return query.replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\s+,/g, ',').trim();
}

function extractUsZip(query: string): string | null {
  const m = query.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? null;
}

function uniqueQueries(xs: Array<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const v = x.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}
