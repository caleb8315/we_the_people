import { tool } from 'ai';
import { z } from 'zod';
import { fetchJson, fetchText, httpFetch } from '../http';
import type { PhysicalImagery } from '../schema';
import { addPhysicalCheck, isoDate, recordStat, type ToolContext } from './context';

const point = {
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
};
const window = {
  start_date: z.string().describe('YYYY-MM-DD'),
  end_date: z.string().describe('YYYY-MM-DD'),
};

export function bboxAround(lat: number, lon: number, radiusKm: number): [number, number, number, number] {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  return [
    clamp(lon - dLon, -180, 180),
    clamp(lat - dLat, -90, 90),
    clamp(lon + dLon, -180, 180),
    clamp(lat + dLat, -90, 90),
  ];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number(n.toFixed(4))));
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** NASA GIBS (Worldview) snapshot: global daily imagery, no key. */
export function gibsSnapshotUrl(layers: string[], date: string, bbox: [number, number, number, number], size = 768): string {
  const [w, s, e, n] = bbox;
  const u = new URL('https://wvs.earthdata.nasa.gov/api/v1/snapshot');
  u.searchParams.set('REQUEST', 'GetSnapshot');
  u.searchParams.set('TIME', date);
  u.searchParams.set('BBOX', `${s},${w},${n},${e}`);
  u.searchParams.set('CRS', 'EPSG:4326');
  u.searchParams.set('LAYERS', layers.join(','));
  u.searchParams.set('WRAP', layers.map((_, i) => (i === 0 ? 'day' : 'none')).join(','));
  u.searchParams.set('FORMAT', 'image/jpeg');
  u.searchParams.set('WIDTH', String(size));
  u.searchParams.set('HEIGHT', String(size));
  return u.toString();
}

const PC_STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const PC_DATA = 'https://planetarycomputer.microsoft.com/api/data/v1';

interface StacFeature {
  id: string;
  properties: { datetime: string; 'eo:cloud_cover'?: number };
}

async function bestSentinelScene(
  bbox: [number, number, number, number],
  start: string,
  end: string,
  pick: 'latest' | 'earliest',
  signal?: AbortSignal,
): Promise<StacFeature | null> {
  const body = await fetchJson<{ features?: StacFeature[] }>(PC_STAC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox,
      datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
      limit: 30,
      query: { 'eo:cloud_cover': { lt: 50 } },
    }),
    timeoutMs: 15_000,
    signal,
  });
  const features = body?.features ?? [];
  if (!features.length) return null;
  // Prefer low cloud cover; break ties toward the requested end of the window.
  return [...features].sort((a, b) => {
    const ca = a.properties['eo:cloud_cover'] ?? 100;
    const cb = b.properties['eo:cloud_cover'] ?? 100;
    if (Math.abs(ca - cb) > 10) return ca - cb;
    const ta = Date.parse(a.properties.datetime);
    const tb = Date.parse(b.properties.datetime);
    return pick === 'latest' ? tb - ta : ta - tb;
  })[0]!;
}

function sentinelCropUrl(itemId: string, bbox: [number, number, number, number], size = 768): string {
  const [w, s, e, n] = bbox;
  return `${PC_DATA}/item/bbox/${w},${s},${e},${n}/${size}x${size}.jpg?collection=sentinel-2-l2a&item=${encodeURIComponent(itemId)}&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0`;
}

async function fetchImageBase64(url: string, signal?: AbortSignal): Promise<{ data: string; mediaType: string } | null> {
  const res = await httpFetch(url, { timeoutMs: 25_000, signal });
  if (!res || !res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 2_000 || buf.byteLength > 3_500_000) return null;
  const mediaType = type.split(';')[0]!.trim().replace('image/jpg', 'image/jpeg');
  return { data: buf.toString('base64'), mediaType };
}

type ImageryOutput = {
  check_id: string;
  observation: string;
  images: Array<PhysicalImagery & { base64?: string; mediaType?: string }>;
  note?: string;
};

export function earthTools(ctx: ToolContext, opts: { vision: boolean }) {
  return {
    geocode: tool({
      description:
        'Turn a place name (any language) into coordinates and a bounding box. Required before any sensor or satellite check.',
      inputSchema: z.object({ place: z.string().min(2) }),
      execute: async ({ place }) => {
        const nom = await fetchJson<Array<{ display_name: string; lat: string; lon: string; boundingbox?: string[]; address?: { country_code?: string }; type?: string }>>(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=jsonv2&limit=3&addressdetails=1&accept-language=en`,
          { timeoutMs: 8_000, signal: ctx.signal },
        );
        let results = (nom ?? []).map((r) => ({
          name: r.display_name,
          lat: Number(r.lat),
          lon: Number(r.lon),
          country: r.address?.country_code?.toUpperCase() ?? null,
          type: r.type ?? null,
          bbox: r.boundingbox
            ? [Number(r.boundingbox[2]), Number(r.boundingbox[0]), Number(r.boundingbox[3]), Number(r.boundingbox[1])]
            : null,
        }));
        if (!results.length) {
          const om = await fetchJson<{ results?: Array<{ name: string; latitude: number; longitude: number; country_code?: string; admin1?: string; country?: string }> }>(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=3&language=en&format=json`,
            { timeoutMs: 8_000, signal: ctx.signal },
          );
          results = (om?.results ?? []).map((r) => ({
            name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
            lat: r.latitude,
            lon: r.longitude,
            country: r.country_code ?? null,
            type: null,
            bbox: null,
          }));
        }
        for (const r of results) if (r.country) ctx.countries.add(r.country);
        recordStat(ctx, 'geocode', results.length);
        return results.length ? { results } : { error: `Could not locate "${place}".` };
      },
    }),

    earthquakes: tool({
      description: 'USGS global seismic catalog: earthquakes near a point in a date window. Use for any earthquake/explosion/tremor claim.',
      inputSchema: z.object({
        ...point,
        ...window,
        radius_km: z.number().min(5).max(2000).default(250),
        min_magnitude: z.number().min(0).max(9).default(2.5),
        place: z.string().optional(),
      }),
      execute: async ({ lat, lon, start_date, end_date, radius_km, min_magnitude, place }) => {
        const u = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query');
        u.searchParams.set('format', 'geojson');
        u.searchParams.set('starttime', start_date);
        u.searchParams.set('endtime', shiftDate(end_date, 1));
        u.searchParams.set('latitude', String(lat));
        u.searchParams.set('longitude', String(lon));
        u.searchParams.set('maxradiuskm', String(radius_km));
        u.searchParams.set('minmagnitude', String(min_magnitude));
        u.searchParams.set('orderby', 'magnitude');
        u.searchParams.set('limit', '20');
        const body = await fetchJson<{ features?: Array<{ properties: { mag: number; place: string; time: number; url: string; tsunami?: number }; geometry: { coordinates: number[] } }> }>(
          u.toString(),
          { timeoutMs: 15_000, signal: ctx.signal },
        );
        if (!body) return { error: 'USGS did not respond.' };
        const quakes = (body.features ?? []).map((f) => ({
          magnitude: f.properties.mag,
          place: f.properties.place,
          time: new Date(f.properties.time).toISOString(),
          depth_km: f.geometry.coordinates[2],
          distance_km: Math.round(haversineKm(lat, lon, f.geometry.coordinates[1]!, f.geometry.coordinates[0]!)),
          url: f.properties.url,
        }));
        for (const q of quakes.slice(0, 3)) {
          ctx.ledger.add({
            url: q.url,
            title: `M${q.magnitude} — ${q.place}`,
            outlet: 'USGS Earthquake Catalog',
            published_at: q.time,
            snippet: `Magnitude ${q.magnitude} earthquake, ${q.place}, ${q.time}, depth ${q.depth_km} km.`,
            text: `Magnitude ${q.magnitude} earthquake, ${q.place}, ${q.time}, depth ${q.depth_km} km.`,
            retrieved_via: 'USGS seismic network',
          });
        }
        const observation = quakes.length
          ? `${quakes.length} earthquake(s) ≥M${min_magnitude} within ${radius_km} km; largest M${quakes[0]!.magnitude} (${quakes[0]!.place}) on ${quakes[0]!.time.slice(0, 10)}.`
          : `No earthquakes ≥M${min_magnitude} recorded within ${radius_km} km between ${start_date} and ${end_date}.`;
        const check = addPhysicalCheck(ctx, {
          kind: 'earthquake',
          place: place ?? null,
          lat,
          lon,
          window: { start: start_date, end: end_date },
          data_sources: ['USGS ComCat (global seismic networks)'],
          observation,
          hits: quakes.length,
          imagery: [],
          result: quakes.length ? 'consistent' : 'no_data',
        });
        recordStat(ctx, 'earthquakes', quakes.length);
        return { check_id: check.id, observation, quakes: quakes.slice(0, 10) };
      },
    }),

    natural_events: tool({
      description:
        'Natural-hazard catalogs near a point and date window: NASA EONET (wildfires, storms, volcanoes, floods, ice) and GDACS (UN/EU global disaster alerts: earthquakes, cyclones, floods, volcanoes, droughts, wildfires).',
      inputSchema: z.object({ ...point, ...window, radius_km: z.number().min(10).max(1500).default(300), place: z.string().optional() }),
      execute: async ({ lat, lon, start_date, end_date, radius_km, place }) => {
        const [w, s, e, n] = bboxAround(lat, lon, radius_km);
        const [eonet, gdacs] = await Promise.all([
          fetchJson<{ events?: Array<{ title: string; link: string; categories?: Array<{ title: string }>; geometry?: Array<{ date: string }>; sources?: Array<{ url: string }> }> }>(
            `https://eonet.gsfc.nasa.gov/api/v3/events?bbox=${w},${n},${e},${s}&start=${start_date}&end=${end_date}&status=all&limit=30`,
            { timeoutMs: 15_000, signal: ctx.signal },
          ),
          fetchJson<{ features?: Array<{ geometry?: { coordinates?: number[] }; properties: { eventtype: string; name: string; alertlevel: string; fromdate: string; todate: string; country?: string; url?: { report?: string }; severitydata?: { severitytext?: string } } }> }>(
            `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromDate=${start_date}&toDate=${end_date}&alertlevel=green;orange;red&eventlist=EQ;TC;FL;VO;WF;DR`,
            { timeoutMs: 15_000, signal: ctx.signal },
          ),
        ]);
        const events: Array<{ source: string; title: string; date: string | null; detail: string | null; url: string | null }> = [];
        for (const ev of eonet?.events ?? []) {
          events.push({
            source: 'NASA EONET',
            title: ev.title,
            date: ev.geometry?.[0]?.date ?? null,
            detail: ev.categories?.map((c) => c.title).join(', ') ?? null,
            url: ev.sources?.[0]?.url ?? ev.link,
          });
        }
        for (const f of gdacs?.features ?? []) {
          const c = f.geometry?.coordinates;
          if (!c || c.length < 2) continue;
          if (haversineKm(lat, lon, c[1]!, c[0]!) > radius_km) continue;
          events.push({
            source: 'GDACS',
            title: `${f.properties.name} (${f.properties.alertlevel} alert)`,
            date: f.properties.fromdate,
            detail: f.properties.severitydata?.severitytext ?? null,
            url: f.properties.url?.report ?? null,
          });
        }
        for (const ev of events.slice(0, 4)) {
          if (!ev.url) continue;
          ctx.ledger.add({
            url: ev.url,
            title: ev.title,
            outlet: ev.source,
            published_at: ev.date,
            snippet: `${ev.title}${ev.detail ? ` — ${ev.detail}` : ''}`,
            text: `${ev.title}${ev.detail ? ` — ${ev.detail}` : ''} (${ev.date ?? 'date unknown'})`,
            retrieved_via: ev.source,
          });
        }
        const observation = events.length
          ? `${events.length} natural-hazard record(s) within ${radius_km} km: ${events.slice(0, 3).map((x) => x.title).join('; ')}.`
          : `No NASA EONET or GDACS hazard records within ${radius_km} km between ${start_date} and ${end_date}.`;
        const check = addPhysicalCheck(ctx, {
          kind: 'natural_event',
          place: place ?? null,
          lat,
          lon,
          window: { start: start_date, end: end_date },
          data_sources: ['NASA EONET', 'GDACS'],
          observation,
          hits: events.length,
          imagery: [],
          result: events.length ? 'consistent' : 'no_data',
        });
        recordStat(ctx, 'natural_events', events.length);
        return { check_id: check.id, observation, events: events.slice(0, 12) };
      },
    }),

    fire_detections: tool({
      description:
        'Satellite thermal-anomaly detections (NASA FIRMS, VIIRS/MODIS) near a point: wildfires, large explosions, burning facilities, strikes on fuel depots. Also returns a NASA true-colour image with detections overlaid.',
      inputSchema: z.object({ ...point, ...window, radius_km: z.number().min(1).max(150).default(25), place: z.string().optional() }),
      execute: async ({ lat, lon, start_date, end_date, radius_km, place }) => {
        const bbox = bboxAround(lat, lon, radius_km);
        const imageryBox = bboxAround(lat, lon, Math.max(radius_km, 20));
        const imagery: PhysicalImagery[] = [
          {
            label: `Thermal detections over true colour, ${end_date}`,
            url: gibsSnapshotUrl(['VIIRS_SNPP_CorrectedReflectance_TrueColor', 'VIIRS_SNPP_Thermal_Anomalies_375m_All'], end_date, imageryBox),
            date: end_date,
            source: 'NASA GIBS / VIIRS',
          },
        ];
        const key = ctx.env.FIRMS_MAP_KEY;
        let detections: Array<{ lat: number; lon: number; date: string; frp: number; confidence: string; satellite: string }> = [];
        let note: string | undefined;
        if (key) {
          const days = Math.min(10, Math.max(1, Math.round((Date.parse(end_date) - Date.parse(start_date)) / 86_400_000) + 1));
          const ageDays = (Date.now() - Date.parse(end_date)) / 86_400_000;
          const product = ageDays > 60 ? 'VIIRS_SNPP_SP' : 'VIIRS_SNPP_NRT';
          const csv = await fetchText(
            `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/${bbox.join(',')}/${days}/${start_date}`,
            { timeoutMs: 20_000, signal: ctx.signal },
          );
          detections = parseFirmsCsv(csv?.text ?? '');
          if (days === 10 && Date.parse(end_date) - Date.parse(start_date) > 10 * 86_400_000) {
            note = 'FIRMS queries are limited to 10 days; only the first 10 days of the window were checked.';
          }
        } else {
          note = 'FIRMS_MAP_KEY not configured: no detection counts, but the overlay image still shows VIIRS detections for the end date.';
        }
        const maxFrp = detections.reduce((m, d) => Math.max(m, d.frp), 0);
        const observation = key
          ? detections.length
            ? `${detections.length} VIIRS thermal detection(s) within ${radius_km} km between ${start_date} and ${end_date}; peak fire radiative power ${maxFrp.toFixed(1)} MW.`
            : `No VIIRS thermal detections within ${radius_km} km between ${start_date} and ${end_date}.`
          : `Overlay image generated for ${end_date}; detection counts unavailable without a FIRMS key.`;
        const check = addPhysicalCheck(ctx, {
          kind: 'fire_detection',
          place: place ?? null,
          lat,
          lon,
          window: { start: start_date, end: end_date },
          data_sources: ['NASA FIRMS (VIIRS 375 m)', 'NASA GIBS'],
          observation,
          hits: detections.length,
          imagery,
          result: key ? (detections.length ? 'consistent' : 'no_data') : 'inconclusive',
        });
        recordStat(ctx, 'fire_detections', detections.length);
        return {
          check_id: check.id,
          observation,
          note,
          detections: detections.slice(0, 15),
          limitations: 'VIIRS overpasses ~2x daily per satellite; thick cloud/smoke and small or brief fires can be missed. Detection ≠ cause.',
        };
      },
    }),

    weather_history: tool({
      description: 'Historical daily weather at a point (ERA5 reanalysis via Open-Meteo, 1940–present): temperature, rain, snow, wind gusts. Use for storm, flood, heat, snow, drought claims.',
      inputSchema: z.object({ ...point, ...window, place: z.string().optional() }),
      execute: async ({ lat, lon, start_date, end_date, place }) => {
        const daily = 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max';
        const recent = (Date.now() - Date.parse(end_date)) / 86_400_000 < 7;
        const base = recent ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
        const body = await fetchJson<{ daily?: Record<string, Array<number | string | null>> }>(
          `${base}?latitude=${lat}&longitude=${lon}&start_date=${start_date}&end_date=${end_date}&daily=${daily}&timezone=UTC`,
          { timeoutMs: 15_000, signal: ctx.signal },
        );
        const d = body?.daily;
        if (!d?.time) return { error: 'Weather history unavailable for that window.' };
        const days = (d.time as string[]).map((t, i) => ({
          date: t,
          t_max_c: d.temperature_2m_max?.[i],
          t_min_c: d.temperature_2m_min?.[i],
          precip_mm: d.precipitation_sum?.[i],
          snow_cm: d.snowfall_sum?.[i],
          gust_kmh: d.wind_gusts_10m_max?.[i],
        }));
        const num = (xs: unknown[]) => xs.filter((x): x is number => typeof x === 'number');
        const precip = num(days.map((x) => x.precip_mm)).reduce((a, b) => a + b, 0);
        const snow = num(days.map((x) => x.snow_cm)).reduce((a, b) => a + b, 0);
        const tmax = Math.max(...num(days.map((x) => x.t_max_c)));
        const tmin = Math.min(...num(days.map((x) => x.t_min_c)));
        const gust = Math.max(...num(days.map((x) => x.gust_kmh)));
        const observation = `${start_date}–${end_date}: max ${tmax}°C, min ${tmin}°C, total precipitation ${precip.toFixed(1)} mm, snowfall ${snow.toFixed(1)} cm, peak gust ${gust} km/h.`;
        const check = addPhysicalCheck(ctx, {
          kind: 'weather_history',
          place: place ?? null,
          lat,
          lon,
          window: { start: start_date, end: end_date },
          data_sources: ['Open-Meteo (ERA5 reanalysis / forecast models)'],
          observation,
          hits: days.length,
          imagery: [],
          result: 'inconclusive',
        });
        recordStat(ctx, 'weather_history', days.length);
        return { check_id: check.id, observation, days: days.slice(0, 31), note: 'Reanalysis is gridded (~10–25 km); very local extremes can differ.' };
      },
    }),

    satellite_imagery: tool({
      description: opts.vision
        ? 'Fetch BEFORE and AFTER satellite images of a place and LOOK at them yourself. Modes: "high_res" = Sentinel-2 10 m optical (buildings, burn scars, floods, craters, troop/vehicle concentrations, ship/port activity); "daily" = NASA daily true colour (smoke plumes, large floods, storms); "night_lights" = VIIRS night-time lights (blackouts, power-grid strikes, city outages). Describe exactly what differs and how confident you are.'
        : 'Fetch BEFORE and AFTER satellite image links of a place (Sentinel-2 10 m, NASA daily true colour, or VIIRS night lights) so readers can compare.',
      inputSchema: z.object({
        ...point,
        mode: z.enum(['high_res', 'daily', 'night_lights']),
        before_date: z.string().describe('YYYY-MM-DD, before the claimed event'),
        after_date: z.string().describe('YYYY-MM-DD, after the claimed event'),
        radius_km: z.number().min(0.5).max(200).default(3),
        place: z.string().optional(),
      }),
      execute: async ({ lat, lon, mode, before_date, after_date, radius_km, place }): Promise<ImageryOutput | { error: string }> => {
        const minRadius = mode === 'high_res' ? 0.5 : 15;
        const maxRadius = mode === 'high_res' ? 15 : 200;
        const box = bboxAround(lat, lon, Math.min(maxRadius, Math.max(minRadius, radius_km)));
        const images: ImageryOutput['images'] = [];
        let note: string | undefined;

        if (mode === 'high_res') {
          const [before, after] = await Promise.all([
            bestSentinelScene(box, shiftDate(before_date, -30), before_date, 'latest', ctx.signal),
            bestSentinelScene(box, after_date, shiftDate(after_date, 30), 'earliest', ctx.signal),
          ]);
          if (before) images.push({ label: 'Before', url: sentinelCropUrl(before.id, box), date: before.properties.datetime.slice(0, 10), source: `Sentinel-2 L2A (ESA/Copernicus) · cloud ${Math.round(before.properties['eo:cloud_cover'] ?? 0)}% tile` });
          if (after) images.push({ label: 'After', url: sentinelCropUrl(after.id, box), date: after.properties.datetime.slice(0, 10), source: `Sentinel-2 L2A (ESA/Copernicus) · cloud ${Math.round(after.properties['eo:cloud_cover'] ?? 0)}% tile` });
          if (!before || !after) note = 'No sufficiently clear Sentinel-2 scene in one of the windows (30 days before/after). Try "daily" mode or other dates.';
        } else {
          const layers = mode === 'night_lights' ? ['VIIRS_SNPP_DayNightBand_At_Sensor_Radiance'] : ['VIIRS_SNPP_CorrectedReflectance_TrueColor'];
          const source = mode === 'night_lights' ? 'NASA VIIRS Day/Night Band' : 'NASA VIIRS true colour';
          images.push({ label: 'Before', url: gibsSnapshotUrl(layers, before_date, box), date: before_date, source });
          images.push({ label: 'After', url: gibsSnapshotUrl(layers, after_date, box), date: after_date, source });
          if (mode === 'night_lights') note = 'Night-light radiance varies with moonlight, cloud and snow; compare several nights before concluding.';
        }

        if (opts.vision) {
          await Promise.all(
            images.map(async (img) => {
              const fetched = await fetchImageBase64(img.url, ctx.signal);
              if (fetched) {
                img.base64 = fetched.data;
                img.mediaType = fetched.mediaType;
              }
            }),
          );
        }
        const usable = images.filter((i) => !opts.vision || i.base64);
        const observation = usable.length
          ? `${usable.length} image(s) retrieved (${usable.map((i) => `${i.label} ${i.date}`).join(', ')}).`
          : 'No imagery could be retrieved for this place and window.';
        const check = addPhysicalCheck(ctx, {
          kind: mode === 'night_lights' ? 'night_lights' : 'satellite_imagery',
          place: place ?? null,
          lat,
          lon,
          window: { start: before_date, end: after_date },
          data_sources: [...new Set(images.map((i) => i.source.split(' ·')[0]!))],
          observation,
          hits: usable.length,
          imagery: usable.map(({ base64: _b, mediaType: _m, ...rest }) => rest),
          result: usable.length ? 'inconclusive' : 'no_data',
        });
        recordStat(ctx, 'satellite_imagery', usable.length);
        return { check_id: check.id, observation, images: usable, note };
      },
      toModelOutput: ({ output }) => {
        if (!output || 'error' in output) {
          return { type: 'json', value: (output ?? { error: 'no output' }) as never };
        }
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'file'; mediaType: string; data: { type: 'data'; data: string } }
        > = [
          {
            type: 'text',
            text: `Physical check ${output.check_id}: ${output.observation}${output.note ? ` Note: ${output.note}` : ''}`,
          },
        ];
        for (const img of output.images) {
          parts.push({ type: 'text', text: `${img.label} — ${img.date ?? 'date unknown'} — ${img.source}` });
          if (img.base64 && img.mediaType) {
            parts.push({ type: 'file', mediaType: img.mediaType, data: { type: 'data', data: img.base64 } });
          }
        }
        return { type: 'content', value: parts } as never;
      },
    }),
  };
}

export function parseFirmsCsv(csv: string): Array<{ lat: number; lon: number; date: string; frp: number; confidence: string; satellite: string }> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',');
  const idx = (k: string) => header.indexOf(k);
  const iLat = idx('latitude');
  const iLon = idx('longitude');
  const iDate = idx('acq_date');
  const iFrp = idx('frp');
  const iConf = idx('confidence');
  const iSat = idx('satellite');
  if (iLat < 0 || iLon < 0) return [];
  return lines.slice(1).map((l) => {
    const c = l.split(',');
    return {
      lat: Number(c[iLat]),
      lon: Number(c[iLon]),
      date: c[iDate] ?? '',
      frp: Number(c[iFrp] ?? 0) || 0,
      confidence: c[iConf] ?? '',
      satellite: c[iSat] ?? '',
    };
  });
}
