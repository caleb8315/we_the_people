import type { Adapter, RawItem } from './base';
import type { Topic } from '@osint/core/types';

/**
 * NASA FIRMS (Fire Information for Resource Management System) adapter.
 *
 * Provides near-real-time satellite fire/thermal anomaly detections from
 * VIIRS (NOAA-20/21) and MODIS sensors. Critical for:
 *   - Conflict verification: airstrikes, artillery, building fires
 *   - Disaster monitoring: wildfires, volcanic activity
 *   - Industrial accidents: refinery fires, explosions
 *
 * The FIRMS API is free (requires a MAP_KEY from firms.modaps.eosdis.nasa.gov).
 * Data is updated every ~3 hours with NRT, or within minutes for URT in US/Canada.
 *
 * API format: CSV with columns including latitude, longitude, brightness,
 * scan, track, acq_date, acq_time, satellite, confidence, version,
 * bright_ti4, bright_ti5, frp (fire radiative power).
 *
 * We convert high-confidence fire detections into RawItem signals,
 * grouped by geographic proximity so a cluster of fires in one area
 * becomes one signal rather than hundreds.
 */

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const SOURCE = 'VIIRS_NOAA20_NRT';
const DAYS = 1;

interface FireDetection {
  latitude: number;
  longitude: number;
  brightness: number;
  acq_date: string;
  acq_time: string;
  confidence: string;
  frp: number; // fire radiative power (MW)
  satellite: string;
}

// Geographic regions of interest for conflict/disaster monitoring
const REGIONS: Array<{ name: string; bbox: string; topic: Topic }> = [
  { name: 'Middle East', bbox: '24,12,60,42', topic: 'war' },
  { name: 'Ukraine-Russia', bbox: '22,44,42,56', topic: 'war' },
  { name: 'Horn of Africa', bbox: '30,-5,55,20', topic: 'war' },
  { name: 'Sahel', bbox: '-20,5,25,25', topic: 'war' },
];

const MIN_CONFIDENCE = 'high';
const MIN_FRP = 10; // MW — filters out agricultural burns

export class NasaFirmsAdapter implements Adapter {
  id = 'nasa-firms';
  label = 'NASA FIRMS · Fire Detections';

  async fetch(): Promise<RawItem[]> {
    const mapKey = process.env.FIRMS_MAP_KEY;
    if (!mapKey) {
      console.log('[nasa-firms] FIRMS_MAP_KEY not set, skipping');
      return [];
    }

    const items: RawItem[] = [];

    for (const region of REGIONS) {
      try {
        const url = `${FIRMS_BASE}/${mapKey}/${SOURCE}/${region.bbox}/${DAYS}`;
        const res = await fetch(url, {
          headers: { 'user-agent': 'Crosscheck-Bot/1.0' },
        });

        if (!res.ok) {
          console.warn(`[nasa-firms] ${region.name}: HTTP ${res.status}`);
          continue;
        }

        const text = await res.text();
        const fires = parseFirmsCsv(text);

        // Filter to high-confidence, significant fires
        const significant = fires.filter(
          f => f.confidence.toLowerCase() === MIN_CONFIDENCE && f.frp >= MIN_FRP,
        );

        if (significant.length === 0) continue;

        // Cluster nearby fires into groups
        const clusters = clusterFires(significant);

        for (const cluster of clusters) {
          const avgLat = cluster.reduce((s, f) => s + f.latitude, 0) / cluster.length;
          const avgLon = cluster.reduce((s, f) => s + f.longitude, 0) / cluster.length;
          const maxFrp = Math.max(...cluster.map(f => f.frp));
          const date = cluster[0]!.acq_date;

          items.push({
            source_id: 'nasa-firms',
            title: `Thermal anomaly detected: ${cluster.length} fire point${cluster.length > 1 ? 's' : ''} in ${region.name} (FRP ${maxFrp.toFixed(0)} MW)`,
            summary: `NASA VIIRS satellite detected ${cluster.length} high-confidence thermal anomal${cluster.length > 1 ? 'ies' : 'y'} near ${avgLat.toFixed(2)}°N, ${avgLon.toFixed(2)}°E with peak fire radiative power of ${maxFrp.toFixed(0)} MW. This may indicate military activity, industrial fire, or wildfire.`,
            url: `https://firms.modaps.eosdis.nasa.gov/map/#t:adv;d:${date};l:noaa20-viirs-c2;@${avgLon.toFixed(2)},${avgLat.toFixed(2)},8z`,
            published_at: `${date}T${cluster[0]!.acq_time.slice(0, 2)}:${cluster[0]!.acq_time.slice(2)}:00Z`,
            topic: cluster.length >= 5 || maxFrp >= 100 ? region.topic : 'disaster',
            severity: maxFrp >= 200 ? 75 : maxFrp >= 50 ? 55 : 35,
            raw: {
              type: 'firms_detection',
              fire_count: cluster.length,
              max_frp: maxFrp,
              avg_latitude: avgLat,
              avg_longitude: avgLon,
              region: region.name,
              satellite: 'VIIRS NOAA-20',
            },
          });
        }

        console.log(`[nasa-firms] ${region.name}: ${significant.length} fires → ${clusters.length} clusters`);
      } catch (err) {
        console.warn(`[nasa-firms] ${region.name}: ${(err as Error).message}`);
      }
    }

    return items;
  }
}

function parseFirmsCsv(csv: string): FireDetection[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0]!.split(',').map(h => h.trim().toLowerCase());
  const latIdx = header.indexOf('latitude');
  const lonIdx = header.indexOf('longitude');
  const brightIdx = header.indexOf('bright_ti4') !== -1
    ? header.indexOf('bright_ti4')
    : header.indexOf('brightness');
  const dateIdx = header.indexOf('acq_date');
  const timeIdx = header.indexOf('acq_time');
  const confIdx = header.indexOf('confidence');
  const frpIdx = header.indexOf('frp');
  const satIdx = header.indexOf('satellite');

  if (latIdx < 0 || lonIdx < 0 || dateIdx < 0) return [];

  const fires: FireDetection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    if (cols.length <= Math.max(latIdx, lonIdx, dateIdx)) continue;

    fires.push({
      latitude: parseFloat(cols[latIdx]!),
      longitude: parseFloat(cols[lonIdx]!),
      brightness: brightIdx >= 0 ? parseFloat(cols[brightIdx]!) : 0,
      acq_date: cols[dateIdx]!.trim(),
      acq_time: timeIdx >= 0 ? cols[timeIdx]!.trim().padStart(4, '0') : '0000',
      confidence: confIdx >= 0 ? cols[confIdx]!.trim() : 'nominal',
      frp: frpIdx >= 0 ? parseFloat(cols[frpIdx]!) : 0,
      satellite: satIdx >= 0 ? cols[satIdx]!.trim() : 'unknown',
    });
  }

  return fires.filter(f =>
    Number.isFinite(f.latitude) && Number.isFinite(f.longitude),
  );
}

/**
 * Cluster nearby fire detections (within ~25km) into groups.
 * Simple grid-based approach: quantize lat/lon to ~0.25° cells.
 */
function clusterFires(fires: FireDetection[]): FireDetection[][] {
  const grid = new Map<string, FireDetection[]>();
  for (const f of fires) {
    const key = `${Math.round(f.latitude * 4) / 4},${Math.round(f.longitude * 4) / 4}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(f);
    grid.set(key, bucket);
  }
  return [...grid.values()];
}
