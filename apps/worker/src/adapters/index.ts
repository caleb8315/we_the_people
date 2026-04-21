import type { Adapter } from './base';
import { RssAdapter } from './rss';
import { UsgsEarthquakesAdapter } from './usgs';
import { NasaEonetAdapter } from './nasa-eonet';
import { OpenMeteoAdapter } from './open-meteo';
import { NoaaAlertsAdapter } from './noaa-alerts';
import { CoinGeckoMarketsAdapter } from './coingecko';
import { YahooFinanceAdapter } from './yahoo-finance';
import { GdeltAdapter } from './gdelt';
import { SwpcAlertsAdapter } from './swpc-alerts';
import { CisaKevAdapter } from './cisa-kev';
import { NasaFirmsAdapter } from './nasa-firms';
import { supabase } from '../lib/supabase';

/**
 * Build the full adapter set from the DB `sources` table.
 * Any source with kind='rss' becomes an RssAdapter; API sources get
 * dedicated adapter classes when available.
 */
export async function loadAdapters(): Promise<Adapter[]> {
  const { data, error } = await supabase()
    .from('sources')
    .select('id, name, kind, url, enabled')
    .eq('enabled', true);

  if (error) throw new Error(`sources query failed: ${error.message}`);

  const adapters: Adapter[] = [];
  for (const row of data ?? []) {
    if (row.kind === 'rss' && row.url) {
      adapters.push(new RssAdapter(row.id, row.name, row.url));
    }
  }

  // Dedicated API adapters (only register if enabled in DB).
  const enabledIds = new Set((data ?? []).map((r: any) => r.id));
  if (enabledIds.has('usgs-quakes')) adapters.push(new UsgsEarthquakesAdapter());
  if (enabledIds.has('nasa-eonet')) adapters.push(new NasaEonetAdapter());
  if (enabledIds.has('open-meteo-global')) adapters.push(new OpenMeteoAdapter());
  if (enabledIds.has('noaa-alerts')) adapters.push(new NoaaAlertsAdapter());
  if (enabledIds.has('coingecko-markets')) adapters.push(new CoinGeckoMarketsAdapter());
  if (enabledIds.has('yahoo-finance-global')) adapters.push(new YahooFinanceAdapter());
  if (enabledIds.has('gdelt-doc')) adapters.push(new GdeltAdapter());
  if (enabledIds.has('swpc-alerts')) adapters.push(new SwpcAlertsAdapter());
  if (enabledIds.has('cisa-kev')) adapters.push(new CisaKevAdapter());
  if (enabledIds.has('nasa-firms') || process.env.FIRMS_MAP_KEY) {
    adapters.push(new NasaFirmsAdapter());
  }

  return adapters;
}
