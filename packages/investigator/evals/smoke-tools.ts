/**
 * Live smoke test: calls every keyless tool against the real upstream APIs
 * (no model involved). Run: npm run smoke --workspace packages/investigator
 */
import { SourceLedger } from '../src/ledger';
import { buildTools } from '../src/tools';
import type { ToolContext } from '../src/tools/context';

const ctx: ToolContext = {
  ledger: new SourceLedger(),
  physical: [],
  emit: () => {},
  env: process.env,
  stats: new Map(),
  languages: new Set(),
  countries: new Set(),
};
const tools = buildTools(ctx, { vision: false }) as Record<string, { execute: (input: unknown, opts: unknown) => Promise<unknown> }>;

const cases: Array<[string, Record<string, unknown>]> = [
  ['google_news_search', { query: 'Палісейдс пожежа Лос-Анджелес', language: 'uk', country: 'UA', recency: 'any' }],
  ['google_news_search', { query: 'incendies Los Angeles', language: 'fr', country: 'FR', recency: 'any' }],
  ['gdelt_search', { query: 'wildfire "Los Angeles"', sort: 'relevance' }],
  ['wikipedia_search', { query: 'Palisades Fire', language: 'es' }],
  ['outlet_profile', { domain: 'lemonde.fr' }],
  ['outlet_profile', { domain: 'presstv.ir' }],
  ['scholarly_search', { query: 'ivermectin covid randomized trial' }],
  ['trace_origin', { url: 'https://www.bbc.com/news' }],
  ['geocode', { place: 'Pacific Palisades, Los Angeles' }],
  ['earthquakes', { lat: 37.23, lon: 37.02, start_date: '2023-02-05', end_date: '2023-02-07', radius_km: 200, min_magnitude: 6, place: 'Kahramanmaraş' }],
  ['natural_events', { lat: 34.05, lon: -118.53, start_date: '2025-01-05', end_date: '2025-01-15', radius_km: 100, place: 'Los Angeles' }],
  ['fire_detections', { lat: 34.05, lon: -118.53, start_date: '2025-01-07', end_date: '2025-01-09', radius_km: 20, place: 'Pacific Palisades' }],
  ['weather_history', { lat: 25.2, lon: 55.27, start_date: '2024-04-15', end_date: '2024-04-17', place: 'Dubai' }],
  ['satellite_imagery', { lat: 34.045, lon: -118.53, mode: 'high_res', before_date: '2024-12-30', after_date: '2025-01-14', radius_km: 3, place: 'Pacific Palisades' }],
  ['satellite_imagery', { lat: 50.45, lon: 30.52, mode: 'night_lights', before_date: '2022-10-01', after_date: '2022-11-24', radius_km: 40, place: 'Kyiv' }],
];

let failures = 0;
for (const [name, input] of cases) {
  const t0 = Date.now();
  try {
    const out = (await tools[name]!.execute(input, { toolCallId: 'smoke', messages: [] })) as Record<string, unknown>;
    const summary =
      typeof out.error === 'string'
        ? `ERROR ${out.error}`
        : typeof out.observation === 'string'
          ? out.observation
          : Array.isArray(out.results)
            ? `${out.results.length} results; first: ${JSON.stringify(out.results[0] ?? null).slice(0, 160)}`
            : JSON.stringify(out).slice(0, 220);
    if (typeof out.error === 'string') failures += 1;
    console.log(`✓ ${name} (${Date.now() - t0} ms): ${summary}`);
  } catch (err) {
    failures += 1;
    console.log(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\nLedger: ${ctx.ledger.size} sources · physical checks: ${ctx.physical.length}`);
for (const p of ctx.physical) console.log(`  ${p.id} ${p.kind}: ${p.observation} ${p.imagery.map((i) => i.url).join(' ')}`.slice(0, 400));
process.exit(failures > 3 ? 1 : 0);
