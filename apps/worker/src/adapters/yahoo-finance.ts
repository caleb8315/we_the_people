import type { Adapter, RawItem } from './base';

/**
 * Yahoo Finance quote snapshot for major global indices and macro proxies.
 */
export class YahooFinanceAdapter implements Adapter {
  id = 'yahoo-finance-global';
  label = 'Yahoo Finance Global Indices';

  async fetch(): Promise<RawItem[]> {
    const symbols = '^GSPC,^DJI,^IXIC,^FTSE,^N225,^HSI,CL=F,GC=F,^VIX,EURUSD=X';
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    const j = (await res.json()) as any;
    const quotes = j?.quoteResponse?.result ?? [];

    const out: RawItem[] = [];
    for (const q of quotes) {
      const symbol = q.symbol as string;
      const move = Number(q.regularMarketChangePercent ?? 0);
      if (!Number.isFinite(move)) continue;
      if (Math.abs(move) < 1.8 && symbol !== '^VIX') continue;
      const display = q.shortName ?? symbol;
      out.push({
        source_id: this.id,
        title: `Market move: ${display} ${move.toFixed(2)}%`,
        summary: `Price ${q.regularMarketPrice ?? '?'} (${q.currency ?? 'USD'}), change ${q.regularMarketChange ?? '?'}.`,
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
        published_at: new Date().toISOString(),
        topic: 'economy',
        severity: symbol === '^VIX' ? 85 : Math.min(80, 35 + Math.round(Math.abs(move) * 8)),
        raw: { symbol, move, marketState: q.marketState },
      });
    }
    return out;
  }
}
