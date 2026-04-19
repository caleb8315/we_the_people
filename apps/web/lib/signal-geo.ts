import type { SignalRowRaw } from './signals';

export interface SignalGeoPoint {
  id: string;
  title: string;
  topic: string | null;
  severity: number;
  verification_status: SignalRowRaw['verification_status'];
  lat: number;
  lon: number;
  isApproximate: boolean;
  country_code: string | null;
  occurred_at: string | null;
}

const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  US: { lat: 39.8283, lon: -98.5795 },
  GB: { lat: 55.3781, lon: -3.436 },
  JP: { lat: 36.2048, lon: 138.2529 },
  AU: { lat: -25.2744, lon: 133.7751 },
  UA: { lat: 48.3794, lon: 31.1656 },
  RU: { lat: 61.524, lon: 105.3188 },
  IL: { lat: 31.0461, lon: 34.8516 },
  CN: { lat: 35.8617, lon: 104.1954 },
  IN: { lat: 20.5937, lon: 78.9629 },
  CA: { lat: 56.1304, lon: -106.3468 },
  DE: { lat: 51.1657, lon: 10.4515 },
  FR: { lat: 46.2276, lon: 2.2137 },
  BR: { lat: -14.235, lon: -51.9253 },
  ZA: { lat: -30.5595, lon: 22.9375 },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLng(value: number): number {
  if (value > 180 || value < -180) {
    let x = value % 360;
    if (x > 180) x -= 360;
    if (x < -180) x += 360;
    return x;
  }
  return value;
}

function parseLatLonFromRaw(raw: unknown): { lat: number; lon: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // USGS/NASA geometry: coordinates: [lon, lat, ...]
  const geometry = obj.geometry as Record<string, unknown> | undefined;
  const geoCoords = Array.isArray(geometry?.coordinates) ? geometry?.coordinates : null;
  if (geoCoords && geoCoords.length >= 2) {
    const lon = Number(geoCoords[0]);
    const lat = Number(geoCoords[1]);
    if (isFiniteNumber(lat) && isFiniteNumber(lon)) return { lat, lon: normalizeLng(lon) };
  }

  // Common direct fields.
  const lat = Number(obj.lat ?? obj.latitude);
  const lon = Number(obj.lon ?? obj.lng ?? obj.longitude);
  if (isFiniteNumber(lat) && isFiniteNumber(lon)) return { lat, lon: normalizeLng(lon) };

  return null;
}

export function signalGeoPoint(
  signal: SignalRowRaw & { raw_data?: Record<string, unknown> | null },
): SignalGeoPoint | null {
  const direct = parseLatLonFromRaw(signal.raw_data ?? null);
  if (direct) {
    return {
      id: signal.id,
      title: signal.title,
      topic: signal.topic,
      severity: signal.severity,
      verification_status: signal.verification_status,
      lat: direct.lat,
      lon: direct.lon,
      isApproximate: false,
      country_code: signal.country_code ?? null,
      occurred_at: signal.occurred_at ?? null,
    };
  }

  const cc = String(signal.country_code ?? '').toUpperCase();
  const centroid = COUNTRY_CENTROIDS[cc];
  if (!centroid) return null;

  return {
    id: signal.id,
    title: signal.title,
    topic: signal.topic,
    severity: signal.severity,
    verification_status: signal.verification_status,
    lat: centroid.lat,
    lon: centroid.lon,
    isApproximate: true,
    country_code: cc || null,
    occurred_at: signal.occurred_at ?? null,
  };
}
