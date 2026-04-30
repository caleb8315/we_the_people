import type { RawItem } from '../adapters/base';

export type MapSourceClass = 'sensor' | 'news' | 'social' | 'markets' | 'official' | 'other';

export interface MapLocationRecord {
  lat: number;
  lon: number;
  precision: 'exact' | 'approximate';
  source_id: string | null;
  source_class: MapSourceClass;
  label: string | null;
  captured_at: string | null;
  url: string | null;
  country_code: string | null;
}

const MAX_LOCATIONS_PER_SIGNAL = 24;

export function buildSignalMapLocations(input: {
  rawGroup: RawItem[];
  countryCode: string | null;
}): MapLocationRecord[] {
  const out: MapLocationRecord[] = [];
  for (const item of input.rawGroup) {
    const raw =
      item.raw && typeof item.raw === 'object'
        ? (item.raw as Record<string, unknown>)
        : null;
    const coords = extractCoordinateCandidates(raw);
    for (const c of coords) {
      out.push({
        lat: c.lat,
        lon: c.lon,
        precision: 'exact',
        source_id: item.source_id ?? null,
        source_class: inferSourceClass(item.source_id ?? null),
        label: c.label ?? inferLabel(raw),
        captured_at: item.occurred_at ?? item.published_at ?? null,
        url: item.url ?? null,
        country_code: item.country_code ?? input.countryCode ?? null,
      });
    }
  }
  return finalizeMapLocations(out);
}

export function buildMapLocationsFromSignalRaw(
  rawData: Record<string, unknown> | null,
  fallbackSourceId: string | null,
  fallbackCountryCode: string | null,
): MapLocationRecord[] {
  if (!rawData) return [];

  const existing = parseExistingMapLocations(rawData);
  if (existing.length > 0) return finalizeMapLocations(existing);

  const coords = extractCoordinateCandidates(rawData);
  const extracted = coords.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    precision: 'exact' as const,
    source_id: fallbackSourceId,
    source_class: inferSourceClass(fallbackSourceId),
    label: c.label ?? inferLabel(rawData),
    captured_at: null,
    url: null,
    country_code: fallbackCountryCode ?? null,
  }));
  return finalizeMapLocations(extracted);
}

function parseExistingMapLocations(rawData: Record<string, unknown>): MapLocationRecord[] {
  const rows = rawData.map_locations;
  if (!Array.isArray(rows)) return [];
  const out: MapLocationRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const lat = toNum(r.lat ?? r.latitude);
    const lon = toNum(r.lon ?? r.lng ?? r.longitude);
    if (!isValidLatLon(lat, lon)) continue;
    const precision =
      r.precision === 'approximate' || r.isApproximate === true
        ? 'approximate'
        : 'exact';
    const sourceId = typeof r.source_id === 'string' ? r.source_id : null;
    out.push({
      lat,
      lon: normalizeLon(lon),
      precision,
      source_id: sourceId,
      source_class: normalizeSourceClass(r.source_class, sourceId),
      label: typeof r.label === 'string' ? r.label : null,
      captured_at: typeof r.captured_at === 'string' ? r.captured_at : null,
      url: typeof r.url === 'string' ? r.url : null,
      country_code: typeof r.country_code === 'string' ? r.country_code : null,
    });
  }
  return out;
}

function extractCoordinateCandidates(
  raw: Record<string, unknown> | null,
): Array<{ lat: number; lon: number; label?: string | null }> {
  if (!raw) return [];
  const out: Array<{ lat: number; lon: number; label?: string | null }> = [];

  const direct = fromDirectLatLon(raw);
  if (direct) out.push({ ...direct, label: inferLabel(raw) });

  const geometry = fromCoordinateArray(raw.geometry);
  if (geometry) out.push({ ...geometry, label: inferLabel(raw) });

  const coords = fromCoordinateArray(raw.coordinates);
  if (coords) out.push({ ...coords, label: inferLabel(raw) });

  const location = raw.location;
  if (location && typeof location === 'object') {
    const loc = location as Record<string, unknown>;
    const locDirect = fromDirectLatLon(loc);
    if (locDirect) out.push({ ...locDirect, label: inferLabel(loc) ?? inferLabel(raw) });
    const locCoords = fromCoordinateArray(loc.coordinates);
    if (locCoords) out.push({ ...locCoords, label: inferLabel(loc) ?? inferLabel(raw) });
    const locGeometry = fromCoordinateArray(loc.geometry);
    if (locGeometry) out.push({ ...locGeometry, label: inferLabel(loc) ?? inferLabel(raw) });
  }

  const locations = raw.locations;
  if (Array.isArray(locations)) {
    for (const entry of locations) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const p1 = fromDirectLatLon(obj);
      if (p1) out.push({ ...p1, label: inferLabel(obj) ?? inferLabel(raw) });
      const p2 = fromCoordinateArray(obj.coordinates);
      if (p2) out.push({ ...p2, label: inferLabel(obj) ?? inferLabel(raw) });
      const p3 = fromCoordinateArray(obj.geometry);
      if (p3) out.push({ ...p3, label: inferLabel(obj) ?? inferLabel(raw) });
    }
  }

  return dedupeCoords(out);
}

function finalizeMapLocations(rows: MapLocationRecord[]): MapLocationRecord[] {
  if (rows.length === 0) return [];
  const seen = new Set<string>();
  const out: MapLocationRecord[] = [];
  for (const row of rows) {
    const key = [
      row.lat.toFixed(4),
      row.lon.toFixed(4),
      row.precision,
      row.source_id ?? 'none',
      row.label ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...row,
      lon: normalizeLon(row.lon),
      source_class: normalizeSourceClass(row.source_class, row.source_id),
      country_code: row.country_code ? String(row.country_code).toUpperCase() : null,
    });
    if (out.length >= MAX_LOCATIONS_PER_SIGNAL) break;
  }
  return out;
}

function dedupeCoords(
  rows: Array<{ lat: number; lon: number; label?: string | null }>,
): Array<{ lat: number; lon: number; label?: string | null }> {
  const out: Array<{ lat: number; lon: number; label?: string | null }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.lat.toFixed(4)}|${row.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function fromDirectLatLon(obj: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = toNum(obj.lat ?? obj.latitude);
  const lon = toNum(obj.lon ?? obj.lng ?? obj.longitude);
  if (!isValidLatLon(lat, lon)) return null;
  return { lat, lon: normalizeLon(lon) };
}

function fromCoordinateArray(value: unknown): { lat: number; lon: number } | null {
  const pair = pickCoordinatePair(value);
  if (!pair) return null;
  const lonFirst = { lat: pair[1], lon: normalizeLon(pair[0]) };
  if (isValidLatLon(lonFirst.lat, lonFirst.lon)) return lonFirst;
  const latFirst = { lat: pair[0], lon: normalizeLon(pair[1]) };
  if (isValidLatLon(latFirst.lat, latFirst.lon)) return latFirst;
  return null;
}

function pickCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value)) return null;
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  ) {
    return [value[0], value[1]];
  }
  for (const item of value) {
    const nested = pickCoordinatePair(item);
    if (nested) return nested;
  }
  return null;
}

function inferLabel(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const directCandidates = [
    raw.place,
    raw.city,
    raw.areaDesc,
    raw.location_name,
    raw.locationLabel,
    raw.region,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().slice(0, 120);
    }
  }
  return null;
}

function inferSourceClass(sourceId: string | null): MapSourceClass {
  if (!sourceId) return 'other';
  const id = sourceId.toLowerCase();
  if (
    id.includes('usgs') ||
    id.includes('eonet') ||
    id.includes('noaa') ||
    id.includes('open-meteo') ||
    id.includes('swpc')
  ) {
    return 'sensor';
  }
  if (id.includes('reddit') || id.includes('bluesky') || id.includes('mastodon')) {
    return 'social';
  }
  if (id.includes('polymarket') || id.includes('coingecko') || id.includes('finance')) {
    return 'markets';
  }
  if (id.includes('cisa') || id.includes('who') || id.includes('cdc')) return 'official';
  if (
    id.includes('rss') ||
    id.includes('gdelt') ||
    id.includes('news') ||
    id.includes('reuters')
  ) {
    return 'news';
  }
  return 'other';
}

function normalizeSourceClass(rawClass: unknown, sourceId: string | null): MapSourceClass {
  if (
    rawClass === 'sensor' ||
    rawClass === 'news' ||
    rawClass === 'social' ||
    rawClass === 'markets' ||
    rawClass === 'official' ||
    rawClass === 'other'
  ) {
    return rawClass;
  }
  return inferSourceClass(sourceId);
}

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 360
  );
}

function normalizeLon(lon: number): number {
  if (lon > 180 || lon < -180) {
    let x = lon % 360;
    if (x > 180) x -= 360;
    if (x < -180) x += 360;
    return x;
  }
  return lon;
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
}
