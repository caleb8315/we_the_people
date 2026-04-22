import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/deep-dive/result/:diveId
 * Returns a deep dive result by its own ID (not signal_id).
 * Used for URL-based dives that don't have a signal.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const rl = limit(getClientKey(req, 'deep-dive-result'), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from('deep_dives')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(data, {
    headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=300' },
  });
}
