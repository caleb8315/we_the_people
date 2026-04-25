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
  source_count: number;
  credible_source_count: number;
}

const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  AF: { lat: 33.94, lon: 67.71 },
  AL: { lat: 41.15, lon: 20.17 },
  DZ: { lat: 28.03, lon: 1.66 },
  AR: { lat: -38.42, lon: -63.62 },
  AM: { lat: 40.07, lon: 45.04 },
  AU: { lat: -25.27, lon: 133.78 },
  AT: { lat: 47.52, lon: 14.55 },
  AZ: { lat: 40.14, lon: 47.58 },
  BD: { lat: 23.68, lon: 90.36 },
  BY: { lat: 53.71, lon: 27.95 },
  BE: { lat: 50.50, lon: 4.47 },
  BO: { lat: -16.29, lon: -63.59 },
  BA: { lat: 43.92, lon: 17.68 },
  BR: { lat: -14.24, lon: -51.93 },
  BG: { lat: 42.73, lon: 25.49 },
  MM: { lat: 21.91, lon: 95.96 },
  KH: { lat: 12.57, lon: 104.99 },
  CM: { lat: 7.37, lon: 12.35 },
  CA: { lat: 56.13, lon: -106.35 },
  CL: { lat: -35.68, lon: -71.54 },
  CN: { lat: 35.86, lon: 104.20 },
  CO: { lat: 4.57, lon: -74.30 },
  CD: { lat: -4.04, lon: 21.76 },
  HR: { lat: 45.10, lon: 15.20 },
  CU: { lat: 21.52, lon: -77.78 },
  CZ: { lat: 49.82, lon: 15.47 },
  DK: { lat: 56.26, lon: 9.50 },
  EC: { lat: -1.83, lon: -78.18 },
  EG: { lat: 26.82, lon: 30.80 },
  ET: { lat: 9.15, lon: 40.49 },
  FI: { lat: 61.92, lon: 25.75 },
  FR: { lat: 46.23, lon: 2.21 },
  GE: { lat: 42.32, lon: 43.36 },
  DE: { lat: 51.17, lon: 10.45 },
  GH: { lat: 7.95, lon: -1.02 },
  GR: { lat: 39.07, lon: 21.82 },
  HU: { lat: 47.16, lon: 19.50 },
  IS: { lat: 64.96, lon: -19.02 },
  IN: { lat: 20.59, lon: 78.96 },
  ID: { lat: -0.79, lon: 113.92 },
  IR: { lat: 32.43, lon: 53.69 },
  IQ: { lat: 33.22, lon: 43.68 },
  IE: { lat: 53.14, lon: -7.69 },
  IL: { lat: 31.05, lon: 34.85 },
  IT: { lat: 41.87, lon: 12.57 },
  JP: { lat: 36.20, lon: 138.25 },
  JO: { lat: 30.59, lon: 36.24 },
  KZ: { lat: 48.02, lon: 66.92 },
  KE: { lat: -0.02, lon: 37.91 },
  KP: { lat: 40.34, lon: 127.51 },
  KR: { lat: 35.91, lon: 127.77 },
  KW: { lat: 29.31, lon: 47.48 },
  LB: { lat: 33.85, lon: 35.86 },
  LY: { lat: 26.34, lon: 17.23 },
  MY: { lat: 4.21, lon: 101.98 },
  MX: { lat: 23.63, lon: -102.55 },
  MA: { lat: 31.79, lon: -7.09 },
  MZ: { lat: -18.67, lon: 35.53 },
  NP: { lat: 28.39, lon: 84.12 },
  NL: { lat: 52.13, lon: 5.29 },
  NZ: { lat: -40.90, lon: 174.89 },
  NG: { lat: 9.08, lon: 8.68 },
  NO: { lat: 60.47, lon: 8.47 },
  PK: { lat: 30.38, lon: 69.35 },
  PS: { lat: 31.95, lon: 35.23 },
  PA: { lat: 8.54, lon: -80.78 },
  PE: { lat: -9.19, lon: -75.02 },
  PH: { lat: 12.88, lon: 121.77 },
  PL: { lat: 51.92, lon: 19.15 },
  PT: { lat: 39.40, lon: -8.22 },
  QA: { lat: 25.35, lon: 51.18 },
  RO: { lat: 45.94, lon: 24.97 },
  RU: { lat: 61.52, lon: 105.32 },
  SA: { lat: 23.89, lon: 45.08 },
  RS: { lat: 44.02, lon: 21.00 },
  SG: { lat: 1.35, lon: 103.82 },
  SK: { lat: 48.67, lon: 19.70 },
  SO: { lat: 5.15, lon: 46.20 },
  ZA: { lat: -30.56, lon: 22.94 },
  ES: { lat: 40.46, lon: -3.75 },
  LK: { lat: 7.87, lon: 80.77 },
  SD: { lat: 12.86, lon: 30.22 },
  SE: { lat: 60.13, lon: 18.64 },
  CH: { lat: 46.82, lon: 8.23 },
  SY: { lat: 34.80, lon: 38.99 },
  TW: { lat: 23.70, lon: 120.96 },
  TH: { lat: 15.87, lon: 100.99 },
  TR: { lat: 38.96, lon: 35.24 },
  UA: { lat: 48.38, lon: 31.17 },
  AE: { lat: 23.42, lon: 53.85 },
  GB: { lat: 55.38, lon: -3.44 },
  US: { lat: 39.83, lon: -98.58 },
  VE: { lat: 6.42, lon: -66.59 },
  VN: { lat: 14.06, lon: 108.28 },
  YE: { lat: 15.55, lon: 48.52 },
  ZM: { lat: -13.13, lon: 28.64 },
  ZW: { lat: -19.02, lon: 29.15 },
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
      source_count: signal.source_count ?? 0,
      credible_source_count: signal.credible_source_count ?? 0,
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
    source_count: signal.source_count ?? 0,
    credible_source_count: signal.credible_source_count ?? 0,
  };
}
