/**
 * Shared sensor domain lists and matching helpers.
 *
 * Single source of truth for all sensor/scientific network identifiers
 * used by evidence assessment, reliability scoring, and physical evidence.
 * Eliminates the duplicate USGS_DOMAINS / EONET_DOMAINS / etc. arrays
 * that previously lived in both evidence.ts and scoring.ts.
 */

export const USGS_DOMAINS = ['usgs.gov', 'earthquake.usgs.gov', 'volcanoes.usgs.gov'] as const;
export const EONET_DOMAINS = ['eonet.gsfc.nasa.gov', 'eonet.sci.gsfc.nasa.gov'] as const;
export const NASA_DOMAINS = ['nasa.gov'] as const;
export const NOAA_DOMAINS = ['noaa.gov', 'weather.gov'] as const;
export const FIRMS_DOMAINS = ['firms.modaps.eosdis.nasa.gov'] as const;

export function normalizeSensorDomain(domain: string): string {
  return (domain ?? '').toLowerCase().replace(/^www\./, '');
}

export function matchesSensorDomain(domain: string, needles: readonly string[]): boolean {
  const d = normalizeSensorDomain(domain);
  if (!d) return false;
  return needles.some((n) => d === n || d.endsWith('.' + n));
}

export interface SensorMatches {
  usgs: boolean;
  eonet: boolean;
  nasa: boolean;
  noaa: boolean;
  firms: boolean;
  satellite: boolean;
  sensorCount: number;
}

/**
 * Check all sensor domain matches for an evidence item.
 * Consolidates the repeated loops in evidence.ts and scoring.ts.
 */
export function detectSensorMatch(
  domain: string,
  sourceId: string | null,
): SensorMatches {
  const usgs = matchesSensorDomain(domain, USGS_DOMAINS) || sourceId === 'usgs' || sourceId === 'usgs-quakes' || sourceId === 'usgs-significant';
  const eonet = matchesSensorDomain(domain, EONET_DOMAINS) || sourceId === 'nasa-eonet';
  const nasa = matchesSensorDomain(domain, NASA_DOMAINS);
  const noaa = matchesSensorDomain(domain, NOAA_DOMAINS);
  const firms = matchesSensorDomain(domain, FIRMS_DOMAINS) || sourceId === 'nasa-firms';
  const satellite = eonet || nasa || firms;
  const sensorCount = (usgs ? 1 : 0) + (satellite ? 1 : 0) + (noaa ? 1 : 0) + (firms ? 1 : 0);

  return { usgs, eonet, nasa, noaa, firms, satellite, sensorCount };
}
