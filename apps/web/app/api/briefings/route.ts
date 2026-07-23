import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/briefings?kind=daily|weekly&limit=10 */
export async function GET(req: Request) {
  const rl = limit(getClientKey(req, 'briefings'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind') === 'weekly' ? 'weekly' : 'daily';
  const max = Math.min(Number(searchParams.get('limit') ?? '10'), 30);

  const sb = getServerSupabase();
  const { data, error } = await sb
    .from('briefings')
    .select('id, kind, period_start, period_end, headline, topics, signal_ids')
    .eq('kind', kind)
    .order('period_start', { ascending: false })
    .limit(max);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ briefings: data ?? [] });
}
