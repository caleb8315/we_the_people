import type { SourceRow } from './types';

export const SOURCE_GROUP_ORDER = [
  'news_wires',
  'regional_news',
  'science_sensors',
  'satellite_space',
  'weather',
  'humanitarian_official',
  'markets',
  'cyber',
  'events',
  'apis',
] as const;

export type SourceGroupKey = (typeof SOURCE_GROUP_ORDER)[number];
export type SourceCatalogRow = Pick<
  SourceRow,
  'id' | 'name' | 'kind' | 'country_code' | 'credibility' | 'metadata' | 'enabled'
>;

export const SOURCE_GROUP_LABELS: Record<SourceGroupKey, string> = {
  news_wires: 'News wires',
  regional_news: 'Regional news coverage',
  science_sensors: 'Science sensors',
  satellite_space: 'Satellite and space-weather intelligence',
  weather: 'Weather and alerts',
  humanitarian_official: 'Humanitarian and official bulletins',
  markets: 'Markets and macro',
  cyber: 'Cyber intelligence',
  events: 'Global events',
  apis: 'Other APIs',
};

export function sourceGroupKey(source: Pick<SourceRow, 'kind' | 'metadata'>): SourceGroupKey {
  const kind = String(source.kind ?? '').toLowerCase();
  const type = String(source.metadata?.type ?? '').toLowerCase();
  if (type === 'earthquake' || type === 'natural_events' || type === 'volcano' || type === 'hurricane') {
    return 'science_sensors';
  }
  if (type === 'satellite' || type === 'space_weather') return 'satellite_space';
  if (type === 'weather' || type === 'weather_alerts') return 'weather';
  if (type === 'markets') return 'markets';
  if (type === 'cyber' || type === 'cyber_intel') return 'cyber';
  if (type === 'humanitarian' || type === 'official_bulletin') return 'humanitarian_official';
  if (type === 'news_regional') return 'regional_news';
  if (type === 'events') return 'events';
  return kind === 'rss' ? 'news_wires' : 'apis';
}

export function hasGeoCoverage(source: Pick<SourceRow, 'country_code' | 'metadata'>): boolean {
  if (source.country_code) return true;
  const type = String(source.metadata?.type ?? '').toLowerCase();
  return [
    'earthquake',
    'natural_events',
    'volcano',
    'hurricane',
    'satellite',
    'space_weather',
    'weather',
    'weather_alerts',
    'humanitarian',
    'events',
  ].includes(type);
}

export function groupSourceRow(source: Pick<SourceRow, 'kind' | 'metadata'>): SourceGroupKey {
  return sourceGroupKey(source);
}

export function groupSourceCatalog<T extends SourceCatalogRow>(rows: T[]): Map<SourceGroupKey, T[]> {
  const groups = new Map<SourceGroupKey, T[]>();
  for (const row of rows) {
    const key = sourceGroupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

export function groupLabel(group: SourceGroupKey): string {
  return SOURCE_GROUP_LABELS[group];
}
