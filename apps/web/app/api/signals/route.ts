import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/signals?hours=24&topic=war&country=US&limit=50
 *
 * Public, read-only. Uses the `signals_public` view, which is deliberately
 * exposed through RLS; no service-role credentials are needed here.
 */
export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'signals'), 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const hours = clamp(Number(searchParams.get('hours') ?? '48'), 1, 24 * 14);
  const max = clamp(Number(searchParams.get('limit') ?? '50'), 1, 100);
  const topic = searchParams.get('topic');
  const country = searchParams.get('country');
  const status = searchParams.get('status'); // verified | developing

  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const sb = getServerSupabase();

  let q = sb
    .from('signals_public')
    .select('*')
    .gte('first_seen_at', since)
    .order('severity', { ascending: false })
    .limit(max);

  if (topic) q = q.eq('topic', topic);
  if (country) q = q.eq('country_code', country);
  if (status) q = q.eq('verification_status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signals: data ?? [] }, {
    headers: {
      'cache-control': 's-maxage=60, stale-while-revalidate=120',
      'x-ratelimit-remaining': String(rl.remaining),
    },
  });
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
