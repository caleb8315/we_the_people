import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase-server';
import { getClientKey, limit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/signals/:id
 * Returns the signal + evidence + any contradictions (inconsistencies).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const rl = limit(getClientKey(req, 'signal-detail'), 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const sb = getAdminSupabase();

  const [{ data: signal, error: sErr }, { data: evidence }, { data: contradictions }] =
    await Promise.all([
      sb.from('signals_public').select('*').eq('id', params.id).maybeSingle(),
      sb.from('evidence').select('*').eq('signal_id', params.id),
      sb.from('contradictions').select('*').eq('signal_id', params.id),
    ]);

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!signal) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ signal, evidence: evidence ?? [], contradictions: contradictions ?? [] }, {
    headers: { 'cache-control': 's-maxage=60, stale-while-revalidate=120' },
  });
}
