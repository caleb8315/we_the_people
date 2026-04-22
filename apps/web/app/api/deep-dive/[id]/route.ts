import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/deep-dive/:signalId
 * Returns the cached deep dive result for a signal, or 404 if none exists.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const rl = limit(getClientKey(req, 'deep-dive'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from('deep_dives')
    .select('*')
    .eq('signal_id', params.id)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'no_deep_dive' }, { status: 404 });

  return NextResponse.json(data, {
    headers: { 'cache-control': 's-maxage=300, stale-while-revalidate=600' },
  });
}
