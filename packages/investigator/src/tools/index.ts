import type { ToolSet } from 'ai';
import type { ToolContext } from './context';
import { newsTools } from './news';
import { webTools } from './web';
import { referenceTools } from './reference';
import { earthTools } from './earth';

export function buildTools(ctx: ToolContext, opts: { vision: boolean }): ToolSet {
  return {
    ...newsTools(ctx),
    ...webTools(ctx),
    ...referenceTools(ctx),
    ...earthTools(ctx, opts),
  } as ToolSet;
}

export const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  google_news_search: (i) => `Searching ${String(i.country ?? '').toUpperCase()} news in ${String(i.language ?? '')}: “${String(i.query ?? '')}”`,
  gdelt_search: (i) =>
    `Searching global news (GDELT${i.source_country ? `, ${String(i.source_country)}` : ''}${i.source_language ? `, ${String(i.source_language)}` : ''}): “${String(i.query ?? '')}”`,
  fact_check_search: (i) => `Checking fact-check databases: “${String(i.query ?? '')}”`,
  read_url: (i) => `Reading ${String(i.source_id ?? i.url ?? 'source')}`,
  web_search: (i) => `Searching the web: “${String(i.query ?? '')}”`,
  wikipedia_search: (i) => `Wikipedia (${String(i.language ?? 'en')}): “${String(i.query ?? '')}”`,
  outlet_profile: (i) => `Checking who owns ${String(i.domain ?? '')}`,
  scholarly_search: (i) => `Searching research papers: “${String(i.query ?? '')}”`,
  trace_origin: (i) => `Tracing where this started${i.query ? `: “${String(i.query)}”` : ''}`,
  geocode: (i) => `Locating ${String(i.place ?? '')}`,
  earthquakes: (i) => `Checking USGS seismic records near ${String(i.place ?? `${i.lat}, ${i.lon}`)}`,
  natural_events: (i) => `Checking NASA/GDACS hazard records near ${String(i.place ?? `${i.lat}, ${i.lon}`)}`,
  fire_detections: (i) => `Checking NASA satellite fire detections near ${String(i.place ?? `${i.lat}, ${i.lon}`)}`,
  weather_history: (i) => `Checking recorded weather at ${String(i.place ?? `${i.lat}, ${i.lon}`)}`,
  satellite_imagery: (i) =>
    `Pulling ${i.mode === 'night_lights' ? 'night-light' : i.mode === 'high_res' ? 'Sentinel-2' : 'daily'} satellite images of ${String(i.place ?? `${i.lat}, ${i.lon}`)} (${String(i.before_date)} vs ${String(i.after_date)})`,
  exa_search: (i) => `Searching the web (Exa): “${String(i.query ?? '')}”`,
  perplexity_search: (i) => `Searching the web (Perplexity): “${String(i.query ?? '')}”`,
};

export type { ToolContext } from './context';
