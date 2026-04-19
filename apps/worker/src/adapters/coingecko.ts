import type { Adapter, RawItem } from './base';

/**
 * CoinGecko market stress indicators (free, no key).
 */
export class CoinGeckoMarketsAdapter implements Adapter {
  id = 'coingecko-markets';
  label = 'CoinGecko Market Movers';

  async fetch(): Promise<RawItem[]> {
    const url =
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc' +
      '&per_page=20&page=1&sparkline=false&price_change_percentage=24h';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const rows = (await res.json()) as any[];

    const out: RawItem[] = [];
    for (const r of rows ?? []) {
      const move = Number(r.price_change_percentage_24h ?? 0);
      if (Math.abs(move) < 8) continue;
      const dir = move >= 0 ? 'surge' : 'drop';
      out.push({
        source_id: this.id,
        title: `Crypto market ${dir}: ${String(r.symbol ?? '').toUpperCase()} ${move.toFixed(1)}%`,
        summary: `Market cap rank ${r.market_cap_rank}, current price $${r.current_price}, 24h volume $${r.total_volume}.`,
        url: `https://www.coingecko.com/en/coins/${r.id}`,
        published_at: new Date().toISOString(),
        topic: 'economy',
        severity: Math.min(85, 40 + Math.round(Math.abs(move))),
        raw: { symbol: r.symbol, move, market_cap_rank: r.market_cap_rank },
      });
    }
    return out;
  }
}
